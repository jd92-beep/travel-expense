/**
 * ============================================================
 * 📧 Travel Expense — Email → Notion Auto-Import
 * ============================================================
 *
 * Forward a confirmation email → this script parses with AI →
 * creates a "⏳ 待確認" entry in Notion → your app shows a
 * one-tap confirm button.
 *
 * ════════════════════════════════════════════════════════════
 *  IMPORTANT — This script extracts TEXT from emails only.
 *  Gmail attachments are NOT sent to AI providers here.
 *  Therefore we use TEXT-ONLY chat models, not vision models.
 *  (Vision is only needed in the app when scanning a physical receipt photo.)
 * ════════════════════════════════════════════════════════════
 *
 * RELIABILITY-FIRST DESIGN — 6-provider fallback chain:
 *
 *     1. GLM-5             (Zhipu coding endpoint, strongest text model)
 *     2. GLM-5-turbo       (Zhipu, faster variant)
 *     3. MiniMax-M2.7      (Anthropic-compatible portal, OAuth token)
 *     4. Gemini primary    (Google, user's own key)
 *     5. Gemini backup     (Google, fallback key)
 *     6. GLM-4-Flash       (Zhipu free tier, last-resort)
 *     7. Defer to next trigger cycle (up to 3 cycles)
 *
 *   Each provider has 3× exponential backoff retries on 429/503.
 *   Rate-limit on any single model cannot break the pipeline.
 *
 * SETUP (one-time, ~3 minutes):
 *   1. https://script.google.com/home → New Project
 *   2. Paste this entire file (credentials auto-injected by app's copy button)
 *   3. Run `setup()` once (grant permissions)
 *   4. Gmail filter: Subject contains "#expense" → label "travel-expense"
 *      OR forward to your_address+expense@gmail.com
 *   5. Forward any confirmation email → wait up to 5 min
 *
 * COST: 100% free.
 * ============================================================
 */

// ── CONFIG ─────────────────────────────────────────────────
// Zhipu API key — used for GLM-5, GLM-5-turbo, GLM-4-Flash (same key, same endpoint)
const ZHIPU_KEY = 'PASTE_ZHIPU_KEY_OR_LEAVE';

// MiniMax-portal OAuth access token — from ~/.openclaw/credentials oauth store
// This token is long-lived (expires ~2027) but if it fails with 401 we skip it.
const MINIMAX_TOKEN = 'PASTE_MINIMAX_OAUTH_TOKEN_OR_LEAVE';

// Gemini keys (primary + backup) — rotate on 429
const GEMINI_KEYS = [
  'PASTE_GEMINI_API_KEY_HERE',
  'PASTE_GEMINI_BACKUP_KEY_OR_LEAVE',
];
const GEMINI_MODEL = 'gemini-3.1-flash-preview';

// Notion credentials
const NOTION_TOKEN = 'PASTE_NOTION_INTEGRATION_TOKEN_HERE';
const NOTION_DB    = 'PASTE_NOTION_DATABASE_ID_HERE';

const INBOX_LABEL = 'travel-expense';
const DONE_LABEL  = 'travel-expense/processed';
const FAIL_LABEL  = 'travel-expense/failed';
const RETRY_LABEL = 'travel-expense/retry';
const MAX_RETRY_CYCLES = 3;

const FX_TO_JPY = {
  HKD: 20.36, USD: 155, EUR: 170, CNY: 21.5,
  TWD: 4.8,   KRW: 0.11, THB: 4.3, SGD: 115, JPY: 1,
};

// Endpoints
const ZHIPU_URL   = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';
const MINIMAX_URL = 'https://api.minimax.io/anthropic/v1/messages';

// ── MAIN ENTRY POINT ──────────────────────────────────────
function processExpenseEmails() {
  const inbox = GmailApp.getUserLabelByName(INBOX_LABEL);
  if (!inbox) { console.log('ℹ️ Label not found — run setup()'); return; }
  const done  = _ensureLabel(DONE_LABEL);
  const fail  = _ensureLabel(FAIL_LABEL);
  const retry = _ensureLabel(RETRY_LABEL);

  const inboxThreads = inbox.getThreads(0, 20);
  const retryThreads = retry.getThreads(0, 20);
  const allThreads = inboxThreads.concat(retryThreads);
  if (!allThreads.length) { console.log('📭 Nothing to process'); return; }

  const scriptProps = PropertiesService.getScriptProperties();
  let processed = 0, bookingCount = 0, permanentFail = 0, deferred = 0;

  allThreads.forEach(thread => {
    const threadId = thread.getId();
    const retryKey = 'retry_' + threadId;
    const retryCount = Number(scriptProps.getProperty(retryKey) || 0);

    try {
      const msg = thread.getMessages()[0];
      const subject = msg.getSubject() || '';
      const from = msg.getFrom() || '';
      const rawBody = msg.getPlainBody() || _stripHtml(msg.getBody() || '');
      const source = 'From: ' + from + '\nSubject: ' + subject + '\n\n' + rawBody;
      const truncated = source.slice(0, 30000);

      let result;
      try {
        result = extractBookingsWithFallback(truncated);
      } catch (aiErr) {
        if (retryCount < MAX_RETRY_CYCLES) {
          console.warn('⏸ All providers exhausted for "' + subject + '" — retry ' + (retryCount + 1) + '/' + MAX_RETRY_CYCLES);
          thread.removeLabel(inbox); thread.removeLabel(retry); thread.addLabel(retry);
          scriptProps.setProperty(retryKey, String(retryCount + 1));
          deferred++;
          return;
        } else {
          console.error('❌ "' + subject + '" gave up after ' + MAX_RETRY_CYCLES + ' retries:', aiErr.message);
          thread.removeLabel(inbox); thread.removeLabel(retry); thread.addLabel(fail);
          scriptProps.deleteProperty(retryKey);
          permanentFail++;
          return;
        }
      }

      if (!result || !result.bookings || !result.bookings.length) {
        console.log('⚠️ No bookings extracted: "' + subject + '"');
        thread.removeLabel(inbox); thread.removeLabel(retry); thread.addLabel(fail);
        scriptProps.deleteProperty(retryKey);
        permanentFail++;
        return;
      }

      result.bookings.forEach(b => {
        try { pushToNotion(b, result.source || 'email', subject); bookingCount++; }
        catch (e) { console.error('❌ Notion push failed:', e.message); }
      });
      thread.removeLabel(inbox); thread.removeLabel(retry); thread.addLabel(done);
      scriptProps.deleteProperty(retryKey);
      processed++;
      console.log('✅ "' + subject + '" → ' + result.bookings.length + ' booking(s) via ' + result._provider);
    } catch (e) {
      console.error('❌ Thread failure:', e.message);
      try { thread.removeLabel(inbox); thread.addLabel(fail); } catch(_) {}
      permanentFail++;
    }
  });

  console.log('📊 ' + processed + ' emails · ' + bookingCount + ' bookings · ' + deferred + ' deferred · ' + permanentFail + ' failed');
}

// ── AI EXTRACTION WITH 6-PROVIDER FALLBACK ─────────────────
function extractBookingsWithFallback(emailText) {
  const prompt = MULTI_BOOKING_PROMPT + '\n\n---- EMAIL START ----\n' + emailText + '\n---- EMAIL END ----';
  const errors = [];
  const hasZhipu = ZHIPU_KEY && !ZHIPU_KEY.startsWith('PASTE_');
  const hasMinimax = MINIMAX_TOKEN && !MINIMAX_TOKEN.startsWith('PASTE_');

  // 1. GLM-5 (Zhipu — strongest text model)
  if (hasZhipu) {
    try {
      const r = _callZhipuWithBackoff(prompt, 'glm-5');
      if (r) { r._provider = 'glm-5'; return r; }
    } catch (e) { errors.push('glm-5: ' + e.message); console.warn('[fallback] glm-5 failed:', e.message); }
  }

  // 2. GLM-5-turbo
  if (hasZhipu) {
    try {
      const r = _callZhipuWithBackoff(prompt, 'glm-5-turbo');
      if (r) { r._provider = 'glm-5-turbo'; return r; }
    } catch (e) { errors.push('glm-5-turbo: ' + e.message); console.warn('[fallback] glm-5-turbo failed:', e.message); }
  }

  // 3. MiniMax-M2.7 (Anthropic-compatible portal)
  if (hasMinimax) {
    try {
      const r = _callMiniMaxWithBackoff(prompt);
      if (r) { r._provider = 'minimax-m2.7'; return r; }
    } catch (e) { errors.push('minimax: ' + e.message); console.warn('[fallback] minimax-m2.7 failed:', e.message); }
  }

  // 4-5. Gemini keys
  const geminiKeys = GEMINI_KEYS.filter(k => k && !k.startsWith('PASTE_'));
  for (let i = 0; i < geminiKeys.length; i++) {
    try {
      const r = _callGeminiWithBackoff(prompt, geminiKeys[i]);
      if (r) { r._provider = 'gemini-key' + (i + 1); return r; }
    } catch (e) {
      errors.push('gemini-key' + (i + 1) + ': ' + e.message);
      console.warn('[fallback] gemini key ' + (i + 1) + ' failed:', e.message);
    }
  }

  // 6. GLM-4-Flash (last resort — Zhipu free tier)
  if (hasZhipu) {
    try {
      const r = _callZhipuWithBackoff(prompt, 'glm-4-flash');
      if (r) { r._provider = 'glm-4-flash'; return r; }
    } catch (e) { errors.push('glm-4-flash: ' + e.message); console.warn('[fallback] glm-4-flash failed:', e.message); }
  }

  throw new Error('All AI providers exhausted: ' + errors.join(' · '));
}

// ── ZHIPU (GLM-5, GLM-5-turbo, GLM-4-Flash) ─────────────────
function _callZhipuWithBackoff(prompt, modelId) {
  const body = {
    model: modelId,
    messages: [
      { role: 'system', content: 'You are a JSON-only extractor. Return only valid JSON, no markdown fences, no prose.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    stream: false,
    thinking: { type: 'disabled' },
  };
  const payload = JSON.stringify(body);

  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = UrlFetchApp.fetch(ZHIPU_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + ZHIPU_KEY },
      payload: payload,
      muteHttpExceptions: true,
    });
    const code = resp.getResponseCode();
    if (code === 200) {
      const data = JSON.parse(resp.getContentText());
      const jsonStr = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!jsonStr) return null;
      return _parseJsonLoose(jsonStr);
    }
    if (code === 429 || code === 503) {
      const waitMs = Math.min(30000, 1500 * Math.pow(2, attempt));
      console.log('Zhipu (' + modelId + ') ' + code + ', waiting ' + waitMs + 'ms…');
      Utilities.sleep(waitMs);
      continue;
    }
    throw new Error('Zhipu ' + code + ': ' + resp.getContentText().slice(0, 200));
  }
  throw new Error('Zhipu ' + modelId + ' 429 after 3 retries');
}

// ── MINIMAX-M2.7 (Anthropic-compatible portal) ──────────────
function _callMiniMaxWithBackoff(prompt) {
  const body = {
    model: 'MiniMax-M2.7',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  };
  const payload = JSON.stringify(body);

  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = UrlFetchApp.fetch(MINIMAX_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + MINIMAX_TOKEN,
        'anthropic-version': '2023-06-01',
      },
      payload: payload,
      muteHttpExceptions: true,
    });
    const code = resp.getResponseCode();
    if (code === 200) {
      const data = JSON.parse(resp.getContentText());
      // Anthropic format: content is an array; find the first item with type=text
      const contentArr = data.content || [];
      let text = '';
      for (let i = 0; i < contentArr.length; i++) {
        if (contentArr[i].type === 'text' && contentArr[i].text) {
          text = contentArr[i].text;
          break;
        }
      }
      if (!text) return null;
      return _parseJsonLoose(text);
    }
    if (code === 401) {
      throw new Error('MiniMax token expired (401) — regenerate via app copy button');
    }
    if (code === 429 || code === 503) {
      const waitMs = Math.min(30000, 1500 * Math.pow(2, attempt));
      console.log('MiniMax ' + code + ', waiting ' + waitMs + 'ms…');
      Utilities.sleep(waitMs);
      continue;
    }
    throw new Error('MiniMax ' + code + ': ' + resp.getContentText().slice(0, 200));
  }
  throw new Error('MiniMax 429 after 3 retries');
}

// ── GEMINI ─────────────────────────────────────────────────
function _callGeminiWithBackoff(prompt, key) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + key;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  };
  const payload = JSON.stringify(body);

  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', payload: payload, muteHttpExceptions: true,
    });
    const code = resp.getResponseCode();
    if (code === 200) {
      const data = JSON.parse(resp.getContentText());
      const jsonStr = data.candidates && data.candidates[0] && data.candidates[0].content.parts[0].text;
      if (!jsonStr) return null;
      return _parseJsonLoose(jsonStr);
    }
    if (code === 429 || code === 503) {
      const waitMs = Math.min(30000, 1500 * Math.pow(2, attempt));
      console.log('Gemini ' + code + ', waiting ' + waitMs + 'ms…');
      Utilities.sleep(waitMs);
      continue;
    }
    throw new Error('Gemini ' + code + ': ' + resp.getContentText().slice(0, 200));
  }
  throw new Error('Gemini 429 after 3 retries');
}

function _parseJsonLoose(text) {
  try { return JSON.parse(text); }
  catch (_) {
    const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    try { return JSON.parse(cleaned); }
    catch (_) {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error('Invalid JSON from AI: ' + text.slice(0, 200));
    }
  }
}

// ── NOTION PUSH (pending = "⏳ " prefix on store name) ─────
function pushToNotion(b, source, emailSubject) {
  const jpy = _convertToJpy(b.total, b.original_currency);
  const hkd = Math.round((jpy / 20.36) * 100) / 100;
  const catMap = { transport:'交通', food:'餐飲', shopping:'購物', lodging:'住宿', ticket:'門票', medicine:'藥品', other:'其他' };
  const payMap = { cash:'現金', credit:'信用卡', paypay:'PayPay', suica:'Suica' };
  const sourceId = 'email_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const storeName = '⏳ ' + (b.store || '待確認');
  const noteText = '[📧 ' + (source || 'email') + '] ' + (b.note || '') + ' · Subject: ' + (emailSubject || '').slice(0, 120);

  const dbSchema = _getDbSchema();
  const pn = (emoji, plain) => dbSchema[emoji] ? emoji : plain;

  const props = {};
  props[pn('🏪 店名', '店名')]       = { title: [{ text: { content: storeName.slice(0, 200) } }] };
  props[pn('💴 金額 ¥', '金額')]    = { number: Math.round(jpy) || 0 };
  props[pn('📅 日期', '日期')]        = { date: { start: b.date || _todayJST() } };
  props[pn('🗂 類別', '類別')]         = { select: { name: catMap[b.category] || '其他' } };
  props[pn('💳 支付', '支付')]         = { select: { name: payMap[b.payment] || '信用卡' } };
  props[pn('📍 地區', '地區')]      = { rich_text: [{ text: { content: (b.region || '').slice(0, 200) } }] };
  props[pn('🧾 品項', '品項')]       = { rich_text: [{ text: { content: (b.items_text || '').slice(0, 2000) } }] };
  props[pn('📝 備註', '備註')]        = { rich_text: [{ text: { content: noteText.slice(0, 2000) } }] };
  props[pn('🔑 SourceID', 'SourceID')] = { rich_text: [{ text: { content: sourceId } }] };
  const hkdKey = pn('💵 HKD', 'HKD');
  if (dbSchema[hkdKey]) props[hkdKey] = { number: hkd };

  const resp = UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN, 'Notion-Version': '2022-06-28' },
    payload: JSON.stringify({ parent: { database_id: NOTION_DB }, properties: props }),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('Notion ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 400));
  }
}

let _dbSchemaCache = null;
function _getDbSchema() {
  if (_dbSchemaCache) return _dbSchemaCache;
  const r = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN, 'Notion-Version': '2022-06-28' },
    muteHttpExceptions: true,
  });
  const d = JSON.parse(r.getContentText());
  _dbSchemaCache = d.properties || {};
  return _dbSchemaCache;
}

// ── UTILITIES ──────────────────────────────────────────────
function _convertToJpy(amount, currency) {
  const n = Number(amount) || 0;
  if (!currency) return n;
  const rate = FX_TO_JPY[String(currency).toUpperCase()];
  return rate ? n * rate : n;
}
function _todayJST() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'); }
function _stripHtml(html) {
  return String(html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
}
function _ensureLabel(name) { return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name); }

// ── ONE-TIME SETUP ─────────────────────────────────────────
function setup() {
  const providers = [];
  if (ZHIPU_KEY && !ZHIPU_KEY.startsWith('PASTE_'))     providers.push('GLM-5', 'GLM-5-turbo');
  if (MINIMAX_TOKEN && !MINIMAX_TOKEN.startsWith('PASTE_')) providers.push('MiniMax-M2.7');
  GEMINI_KEYS.forEach((k, i) => { if (k && !k.startsWith('PASTE_')) providers.push('Gemini-' + (i + 1)); });
  if (ZHIPU_KEY && !ZHIPU_KEY.startsWith('PASTE_'))     providers.push('GLM-4-Flash');
  if (!providers.length) throw new Error('⛔ Fill in at least one of ZHIPU_KEY / MINIMAX_TOKEN / GEMINI_KEYS');
  if (NOTION_TOKEN.startsWith('PASTE_')) throw new Error('⛔ Fill in NOTION_TOKEN');
  if (NOTION_DB.startsWith('PASTE_'))    throw new Error('⛔ Fill in NOTION_DB');

  _ensureLabel(INBOX_LABEL);
  _ensureLabel(DONE_LABEL);
  _ensureLabel(FAIL_LABEL);
  _ensureLabel(RETRY_LABEL);

  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'processExpenseEmails') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processExpenseEmails').timeBased().everyMinutes(5).create();

  const dbResp = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB, {
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN, 'Notion-Version': '2022-06-28' },
    muteHttpExceptions: true,
  });
  if (dbResp.getResponseCode() !== 200) throw new Error('❌ Notion: ' + dbResp.getContentText().slice(0, 300));

  const email = Session.getActiveUser().getEmail();
  const alias = email.replace('@', '+expense@');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Setup complete!');
  console.log('📬 Forward emails to: ' + alias);
  console.log('🤖 AI chain (' + providers.length + '): ' + providers.join(' → '));
  console.log('⏱  Trigger: every 5 min');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return '✅ ' + alias + ' — AI chain: ' + providers.join(' → ');
}

function testNow() { processExpenseEmails(); }

// ── GEMINI PROMPT (TEXT-ONLY, no images) ───────────────────
const MULTI_BOOKING_PROMPT = `你係一個專業旅遊預訂 email 解析 AI。分析以下 email 內容（可能係 **一封或多封** email 貼埋一齊），提取 **所有** 獨立消費項目。

⚠️ 呢啲 email 係純文字 — 唔會有附件或圖片，淨係要睇文字內容。

極重要規則：

0. **支援多 email 拼接**：逐個 section 獨立分析，bookings 集合返一個 array。

1. **一封 email 可以包含多筆消費**：
   - 來回機票 = **強制拆成 2 筆**，每筆 total = total ÷ 2
   - Klook/KKday 多 activity → **每個 activity 一筆**
   - Agoda/Booking 多晚酒店 → **合併成一筆**（total = 全程總額）

2. **金額一律轉成日元 (JPY)**：
   - 1 HKD ≈ 20 JPY、1 USD ≈ 150 JPY、1 CNY ≈ 20 JPY、1 EUR ≈ 160 JPY
   - \`total\` 永遠係 JPY
   - \`original_currency\` + \`original_amount\` 記錄原幣

3. **日期係 service date**（機票起飛、酒店 Check-in、Activity 旅遊日）

4. **缺失欄位返 null，唔好亂估**

回覆嚴格 JSON（唔好加 markdown 或解釋）：

{
  "source": "klook|kkday|agoda|booking|cathay|ana|jal|hkexpress|tripcom|other",
  "bookings": [
    {
      "store": "商戶名（繁中，簡短）",
      "total": 純數字 JPY,
      "original_currency": "HKD|USD|JPY|CNY|EUR",
      "original_amount": 原幣數字,
      "date": "YYYY-MM-DD 或 null",
      "category": "transport|food|shopping|lodging|ticket|medicine|other",
      "payment": "cash|credit|paypay|suica 或 null",
      "items_text": "1-2 句描述",
      "note": "booking reference / 房型 / 其他簡短資訊",
      "confidence": "high|medium|low"
    }
  ]
}

類別判斷：
- 機票/鐵路/Taxi/接送 → transport
- 酒店/民宿 → lodging
- Tour/Activity/門票 → ticket
- 餐廳訂座 → food
- eSIM/保險 → other

如果完全無法解析，返 {"source":"other","bookings":[]}。`;
