/**
 * ============================================================
 * 📧 Travel Expense — Email → Notion Auto-Import
 * ============================================================
 *
 * Forward a confirmation email → this script parses with AI →
 * creates a "⏳ 待確認" entry in Notion → your app shows a
 * one-tap confirm button.
 *
 * RELIABILITY-FIRST DESIGN:
 *   Uses multiple AI providers in fallback chain so rate limits
 *   on any single provider don't break the pipeline:
 *
 *     Gemini (primary key) → Gemini (backup key)
 *       → GLM-4-Flash (free tier, Zhipu)
 *       → retry next trigger cycle (up to 3 cycles)
 *
 *   Each provider has exponential backoff retry on 429/503.
 *
 * SETUP (one-time, ~3 minutes):
 *   1. https://script.google.com/home → New Project
 *   2. Paste this entire file
 *   3. Fill in the CONFIG section
 *   4. Run `setup()` once (grant permissions)
 *   5. Gmail filter: Subject contains "#expense" → apply label "travel-expense"
 *   6. Forward any confirmation email → wait up to 5 min
 *
 * COST: 100% free.
 * ============================================================
 */

// ── CONFIG ─────────────────────────────────────────────────
// At least one AI provider must be set. Gemini preferred (more accurate
// on long emails), GLM as fallback (more generous free tier).

const GEMINI_KEYS = [
  'PASTE_GEMINI_API_KEY_HERE',        // primary
  'PASTE_GEMINI_BACKUP_KEY_OR_LEAVE', // backup (optional — leave as-is if only one key)
];
const GEMINI_MODEL = 'gemini-3.1-flash-preview'; // cheap + fast

// Zhipu GLM-4-Flash — free tier, used as fallback when Gemini is rate-limited.
// Get a free key at https://open.bigmodel.cn/usercenter/apikeys
const ZAI_KEY = 'PASTE_ZAI_KEY_OR_LEAVE';

const NOTION_TOKEN = 'PASTE_NOTION_INTEGRATION_TOKEN_HERE';
const NOTION_DB    = 'PASTE_NOTION_DATABASE_ID_HERE';

const INBOX_LABEL = 'travel-expense';
const DONE_LABEL  = 'travel-expense/processed';
const FAIL_LABEL  = 'travel-expense/failed';
const RETRY_LABEL = 'travel-expense/retry';       // emails that hit rate limits — retried next cycle
const MAX_RETRY_CYCLES = 3;                        // after N failures, move to FAIL_LABEL

const FX_TO_JPY = {
  HKD: 20.36, USD: 155, EUR: 170, CNY: 21.5,
  TWD: 4.8,   KRW: 0.11, THB: 4.3, SGD: 115, JPY: 1,
};

// ── MAIN ENTRY POINT ──────────────────────────────────────
function processExpenseEmails() {
  const inbox = GmailApp.getUserLabelByName(INBOX_LABEL);
  if (!inbox) { console.log('ℹ️ Label not found — run setup()'); return; }
  const done  = _ensureLabel(DONE_LABEL);
  const fail  = _ensureLabel(FAIL_LABEL);
  const retry = _ensureLabel(RETRY_LABEL);

  // Process inbox + retry queue together. Retry cycle count is tracked in thread's first-message subject hash.
  const inboxThreads = inbox.getThreads(0, 20);
  const retryThreads = retry.getThreads(0, 20);
  const allThreads = [...inboxThreads, ...retryThreads];
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
      const source = `From: ${from}\nSubject: ${subject}\n\n${rawBody}`.slice(0, 30000);

      let result;
      try {
        result = extractBookingsWithFallback(source);
      } catch (aiErr) {
        // All AI providers exhausted — defer to next trigger cycle
        if (retryCount < MAX_RETRY_CYCLES) {
          console.warn(`⏸ AI quota exhausted for "${subject}" — retry ${retryCount + 1}/${MAX_RETRY_CYCLES}`);
          thread.removeLabel(inbox); thread.removeLabel(retry); thread.addLabel(retry);
          scriptProps.setProperty(retryKey, String(retryCount + 1));
          deferred++;
          return;
        } else {
          console.error(`❌ "${subject}" gave up after ${MAX_RETRY_CYCLES} retries:`, aiErr.message);
          thread.removeLabel(inbox); thread.removeLabel(retry); thread.addLabel(fail);
          scriptProps.deleteProperty(retryKey);
          permanentFail++;
          return;
        }
      }

      if (!result || !result.bookings || !result.bookings.length) {
        console.log(`⚠️ No bookings extracted: "${subject}"`);
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
      console.log(`✅ "${subject}" → ${result.bookings.length} booking(s) via ${result._provider}`);
    } catch (e) {
      console.error('❌ Thread failure:', e.message);
      try { thread.removeLabel(inbox); thread.addLabel(fail); } catch(_) {}
      permanentFail++;
    }
  });

  console.log(`📊 ${processed} emails · ${bookingCount} bookings · ${deferred} deferred · ${permanentFail} failed`);
}

// ── AI EXTRACTION WITH MULTI-PROVIDER FALLBACK ─────────────
function extractBookingsWithFallback(emailText) {
  const prompt = MULTI_BOOKING_PROMPT + '\n\n---- EMAIL START ----\n' + emailText + '\n---- EMAIL END ----';
  const errors = [];

  // Try each Gemini key in order, with backoff on 429
  const geminiKeys = GEMINI_KEYS.filter(k => k && !k.startsWith('PASTE_'));
  for (let i = 0; i < geminiKeys.length; i++) {
    try {
      const r = _callGeminiWithBackoff(prompt, geminiKeys[i]);
      if (r) { r._provider = `gemini-key${i+1}`; return r; }
    } catch (e) {
      errors.push(`gemini-key${i+1}: ${e.message}`);
      console.warn(`Gemini key ${i+1} failed:`, e.message);
    }
  }

  // Fallback to GLM-4-Flash (Zhipu)
  if (ZAI_KEY && !ZAI_KEY.startsWith('PASTE_')) {
    try {
      const r = _callGlmWithBackoff(prompt);
      if (r) { r._provider = 'glm-4-flash'; return r; }
    } catch (e) {
      errors.push(`glm: ${e.message}`);
      console.warn('GLM failed:', e.message);
    }
  }

  throw new Error('All AI providers exhausted: ' + errors.join(' · '));
}

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
      const waitMs = Math.min(30000, 1500 * Math.pow(2, attempt)); // 1.5s → 3s → 6s
      console.log(`Gemini ${code}, waiting ${waitMs}ms…`);
      Utilities.sleep(waitMs);
      continue;
    }
    throw new Error('Gemini ' + code + ': ' + resp.getContentText().slice(0, 200));
  }
  throw new Error('Gemini 429 after 3 retries');
}

function _callGlmWithBackoff(prompt) {
  const url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  const body = {
    model: 'glm-4-flash',
    messages: [
      { role: 'system', content: 'You are a JSON-only extractor. Return only valid JSON, no markdown.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    stream: false,
    thinking: { type: 'disabled' },
  };
  const payload = JSON.stringify(body);

  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + ZAI_KEY },
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
      console.log(`GLM ${code}, waiting ${waitMs}ms…`);
      Utilities.sleep(waitMs);
      continue;
    }
    throw new Error('GLM ' + code + ': ' + resp.getContentText().slice(0, 200));
  }
  throw new Error('GLM 429 after 3 retries');
}

function _parseJsonLoose(text) {
  try { return JSON.parse(text); }
  catch (_) {
    // Sometimes models wrap in markdown fences — strip and retry
    const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    try { return JSON.parse(cleaned); }
    catch (_) {
      // Extract the first {...} JSON block if present
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
  const hasGemini = GEMINI_KEYS.some(k => k && !k.startsWith('PASTE_'));
  const hasZai    = ZAI_KEY && !ZAI_KEY.startsWith('PASTE_');
  if (!hasGemini && !hasZai) throw new Error('⛔ Fill in at least one of GEMINI_KEYS or ZAI_KEY');
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

  // Test Notion
  const dbResp = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB, {
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN, 'Notion-Version': '2022-06-28' },
    muteHttpExceptions: true,
  });
  if (dbResp.getResponseCode() !== 200) throw new Error('❌ Notion: ' + dbResp.getContentText().slice(0, 300));

  const email = Session.getActiveUser().getEmail();
  const alias = email.replace('@', '+expense@');
  const providers = [];
  if (hasGemini) providers.push(GEMINI_KEYS.filter(k => k && !k.startsWith('PASTE_')).length + '× Gemini');
  if (hasZai) providers.push('GLM-4-Flash');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Setup complete!');
  console.log('📬 Forward emails to: ' + alias);
  console.log('🤖 AI chain: ' + providers.join(' → '));
  console.log('⏱  Trigger: every 5 min');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return '✅ ' + alias + ' — AI chain: ' + providers.join(' → ');
}

function testNow() { processExpenseEmails(); }

// ── GEMINI PROMPT (mirrors the app's MULTI_BOOKING_PROMPT) ──
const MULTI_BOOKING_PROMPT = `你係一個專業旅遊預訂 email 解析 AI。分析以下內容（可能係 **一封或多封 email** 貼埋一齊），提取 **所有** 獨立消費項目。

⚠️ 極重要規則：

0. **支援多 email 拼接**：
   - 逐個 email section 獨立分析
   - 將所有 bookings 集合返一個 array

1. **一封 email 可以包含多筆消費**：
   - 來回機票 = **強制拆成 2 筆**，每筆 total 係 total ÷ 2
   - Klook/KKday 多 activity → **每個 activity 一筆**
   - Agoda/Booking 多晚酒店 → **合併成一筆**（total = 全程總額）

2. **金額一律轉成日元 (JPY)**：
   - 1 HKD ≈ 20 JPY，1 USD ≈ 150 JPY，1 CNY ≈ 20 JPY，1 EUR ≈ 160 JPY
   - total 永遠係 JPY
   - original_currency + original_amount 記錄原幣

3. **日期係 service date**（機票起飛、酒店 Check-in、Activity 旅遊日）

4. **缺失欄位返 null，唔好亂估**

回覆嚴格 JSON（唔好加 markdown）：

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

類別：
- 機票/鐵路/Taxi/接送 → transport
- 酒店/民宿 → lodging
- Tour/Activity/門票 → ticket
- 餐廳訂座 → food
- eSIM/保險 → other

如果無法解析，返 {"source":"other","bookings":[]}。`;
