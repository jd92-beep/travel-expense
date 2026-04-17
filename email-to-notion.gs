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

// Gemini keys (up to 5) — rotated on 429/403 before moving to next provider
const GEMINI_KEYS = [
  'PASTE_GEMINI_API_KEY_HERE',
  'PASTE_GEMINI_KEY2_OR_LEAVE',
  'PASTE_GEMINI_KEY3_OR_LEAVE',
  'PASTE_GEMINI_KEY4_OR_LEAVE',
  'PASTE_GEMINI_KEY5_OR_LEAVE',
];
// Gemini model fallback order — text-only (email parsing needs no vision)
const GEMINI_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
];
const GEMINI_MODEL = GEMINI_MODELS[0]; // primary (used in setup() display)

// Notion credentials
const NOTION_TOKEN = 'PASTE_NOTION_INTEGRATION_TOKEN_HERE';
const NOTION_DB    = 'PASTE_NOTION_DATABASE_ID_HERE';

const INBOX_LABEL = 'travel-expense';
const DONE_LABEL  = 'travel-expense/processed';
const FAIL_LABEL  = 'travel-expense/failed';
const RETRY_LABEL = 'travel-expense/retry';
const MAX_RETRY_CYCLES = 3;

const FX_TO_JPY = {
  HKD: 20.36, USD: 155, EUR: 170, CNY: 21.5, GBP: 195,
  TWD: 4.8,   KRW: 0.11, THB: 4.3, SGD: 115, JPY: 1,
  AUD: 102,   NZD: 92,   CAD: 112, CHF: 175,
  MYR: 33,    PHP: 2.7,  IDR: 0.0095, VND: 0.006,
  INR: 1.8,   AED: 42,
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
      // Strip forwarded-chain duplicates — keep only the first (innermost) email
      // Forwarded emails often contain the full history; AI would extract same booking twice.
      const firstOnly = rawBody.split(/^-{3,}\s*(Forwarded message|Original Message|轉寄郵件)/mi)[0];
      const source = 'From: ' + from + '\nSubject: ' + subject + '\n\n' + firstOnly;
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

      result.bookings.forEach((b, idx) => {
        // Skip semantically empty bookings (LLM hallucinated null row)
        if (!b || (!b.store && !b.total)) {
          console.log('⏭ Skipping empty booking #' + idx + ' in "' + subject + '"');
          return;
        }
        try { pushToNotion(b, result.source || 'email', subject, threadId, idx); bookingCount++; }
        catch (e) { console.error('❌ Notion push failed [booking ' + idx + ']:', e.message); }
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

// ── AI EXTRACTION WITH FULL PROVIDER FALLBACK ─────────────────
// Returns a result with at least one booking; otherwise throws.
// Empty bookings from one provider should NOT short-circuit — next provider may succeed.
function extractBookingsWithFallback(emailText) {
  const prompt = MULTI_BOOKING_PROMPT + '\n\n---- EMAIL START ----\n' + emailText + '\n---- EMAIL END ----';
  const errors = [];
  const hasZhipu = ZHIPU_KEY && !ZHIPU_KEY.startsWith('PASTE_');
  const hasMinimax = MINIMAX_TOKEN && !MINIMAX_TOKEN.startsWith('PASTE_');

  // Each entry: { name, fn: () => parsedResult | null }
  const providers = [];
  if (hasZhipu) {
    providers.push({ name: 'glm-5',       fn: () => _callZhipuWithBackoff(prompt, 'glm-5') });
    providers.push({ name: 'glm-5-turbo', fn: () => _callZhipuWithBackoff(prompt, 'glm-5-turbo') });
  }
  if (hasMinimax) {
    providers.push({ name: 'minimax-m2.7', fn: () => _callMiniMaxWithBackoff(prompt) });
  }
  // Gemini: model-first, key-second rotation
  const geminiKeys = GEMINI_KEYS.filter(k => k && !k.startsWith('PASTE_'));
  for (let mi = 0; mi < GEMINI_MODELS.length; mi++) {
    const gModel = GEMINI_MODELS[mi];
    for (let ki = 0; ki < geminiKeys.length; ki++) {
      const kIdx = ki;
      providers.push({
        name: gModel + '-key' + (kIdx + 1),
        fn: () => _callGeminiWithBackoff(prompt, geminiKeys[kIdx], gModel),
        isRateLimitSkippable: true, // non-rate errors skip remaining keys for this model
        gModel: gModel,
      });
    }
  }
  if (hasZhipu) {
    providers.push({ name: 'glm-4-flash', fn: () => _callZhipuWithBackoff(prompt, 'glm-4-flash') });
  }

  let lastValidEmpty = null; // keep track of an empty-bookings response as ultimate fallback
  let skipGeminiModel = null; // set when a Gemini model errors non-rate-limit

  for (const p of providers) {
    // Skip remaining keys of a Gemini model after a non-rate-limit error
    if (skipGeminiModel && p.gModel === skipGeminiModel) continue;
    if (skipGeminiModel && p.gModel !== skipGeminiModel) skipGeminiModel = null;
    try {
      const r = p.fn();
      if (r && Array.isArray(r.bookings) && r.bookings.length) {
        r._provider = p.name;
        return r;
      }
      // Parsed OK but empty bookings — remember as fallback; try next provider
      if (r && Array.isArray(r.bookings)) {
        lastValidEmpty = r;
        console.warn('[fallback] ' + p.name + ' returned 0 bookings — trying next provider');
      } else {
        console.warn('[fallback] ' + p.name + ' returned null/malformed');
      }
    } catch (e) {
      errors.push(p.name + ': ' + e.message);
      console.warn('[fallback] ' + p.name + ' failed:', e.message);
      if (p.gModel && !e.message.match(/429|503|quota|rate/i)) {
        skipGeminiModel = p.gModel; // e.g. 404 model-not-found — skip its other keys
      }
    }
  }

  // If every provider returned empty bookings (not an error), surface that as the result
  // so caller can mark email as "fail (no bookings)" instead of "retry".
  if (lastValidEmpty) {
    lastValidEmpty._provider = 'all-empty';
    return lastValidEmpty;
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
function _callGeminiWithBackoff(prompt, key, model) {
  const modelId = model || GEMINI_MODEL;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelId + ':generateContent?key=' + key;
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
      const cand = data.candidates && data.candidates[0];
      if (!cand) return null; // prompt-level block — no candidates at all
      if (cand.finishReason === 'SAFETY' || cand.finishReason === 'BLOCKED' ||
          cand.finishReason === 'PROHIBITED_CONTENT' || cand.finishReason === 'RECITATION') {
        // Safety block — same across keys, but let outer loop try next MODEL
        throw new Error('Gemini safety filter (' + cand.finishReason + ')');
      }
      const parts = cand.content && cand.content.parts;
      const jsonStr = parts && parts[0] && parts[0].text;
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

// Robust JSON extraction: tries direct parse → markdown code fence → largest brace chunk.
// Returns null for obviously empty responses instead of throwing, so caller can fallback.
function _parseJsonLoose(text) {
  if (!text || !String(text).trim()) return null;
  const raw = String(text).trim();
  // 1. Direct parse
  try { return _validateBookings(JSON.parse(raw)); } catch (_) {}
  // 2. Strip markdown code fences (multi-line)
  const fenced = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  try { return _validateBookings(JSON.parse(fenced)); } catch (_) {}
  // 3. Extract largest {...} block (greedy outer braces)
  const first = fenced.indexOf('{');
  const last = fenced.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return _validateBookings(JSON.parse(fenced.slice(first, last + 1))); } catch (_) {}
  }
  throw new Error('Invalid JSON from AI: ' + raw.slice(0, 200));
}

// Ensure parsed result has the expected shape. Returns the object (or throws/null).
function _validateBookings(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  // Accept { bookings: [...] } or a bare array (some models skip the wrapper)
  if (Array.isArray(parsed)) parsed = { bookings: parsed };
  if (!Array.isArray(parsed.bookings)) parsed.bookings = [];
  // Drop null/undefined entries (some models emit [{...}, null])
  parsed.bookings = parsed.bookings.filter(b => b && typeof b === 'object');
  return parsed;
}

// ── NOTION PUSH (pending = "⏳ " prefix on store name) ─────
// Deterministic SourceID: same email + same booking index = same ID.
// Prevents duplicate entries when a trigger re-fires or retry processes same email twice.
function pushToNotion(b, source, emailSubject, threadId, bookingIdx) {
  const jpy = _convertToJpy(b.total, b.original_currency);
  const hkd = Math.round((jpy / 20.36) * 100) / 100;
  const catMap = { transport:'交通', food:'餐飲', shopping:'購物', lodging:'住宿', ticket:'門票', medicine:'藥品', other:'其他' };
  const payMap = { cash:'現金', credit:'信用卡', paypay:'PayPay', suica:'Suica' };
  // Stable SourceID = email_<threadId>_<idx> — idempotent across retries.
  const sourceId = 'email_' + (threadId || 'nothread').slice(0, 16) + '_' + (bookingIdx || 0);
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

  // Dedup: if a page with this SourceID already exists, UPDATE instead of creating new
  const existingPageId = _findNotionPageBySourceId(sourceId);
  if (existingPageId) {
    console.log('🔁 Existing page found for ' + sourceId + ' — updating instead of creating');
    _notionFetchWithRetry('https://api.notion.com/v1/pages/' + existingPageId, 'patch',
      JSON.stringify({ properties: props }));
    return;
  }

  _notionFetchWithRetry('https://api.notion.com/v1/pages', 'post',
    JSON.stringify({ parent: { database_id: NOTION_DB }, properties: props }));
}

// Notion fetch with exponential backoff on 429/5xx. Throws on 4xx (except 429).
function _notionFetchWithRetry(url, method, payload, maxAttempts) {
  const attempts = maxAttempts || 4;
  let lastBody = '';
  for (let attempt = 0; attempt < attempts; attempt++) {
    const opts = {
      method: method, contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN, 'Notion-Version': '2022-06-28' },
      muteHttpExceptions: true,
    };
    if (payload) opts.payload = payload;
    const r = UrlFetchApp.fetch(url, opts);
    const code = r.getResponseCode();
    if (code < 300) return JSON.parse(r.getContentText() || '{}');
    lastBody = r.getContentText().slice(0, 400);
    // Auth errors → clear schema cache (maybe DB was recreated) and fail fast
    if (code === 401 || code === 403) {
      _dbSchemaCache = null;
      throw new Error('Notion ' + code + ' (check token/Integration share): ' + lastBody);
    }
    // Rate-limit / server error → backoff retry
    if (code === 429 || code >= 500) {
      const waitMs = Math.min(15000, 1000 * Math.pow(2, attempt));
      console.log('Notion ' + code + ' — retry ' + (attempt + 1) + '/' + attempts + ' in ' + waitMs + 'ms');
      Utilities.sleep(waitMs);
      continue;
    }
    // 400, 404, 409 etc — client error, don't retry
    throw new Error('Notion ' + code + ': ' + lastBody);
  }
  throw new Error('Notion exhausted ' + attempts + ' retries: ' + lastBody);
}

// Query Notion DB for a page with matching SourceID. Returns pageId or null.
function _findNotionPageBySourceId(sourceId) {
  const dbSchema = _getDbSchema();
  const sidProp = dbSchema['🔑 SourceID'] ? '🔑 SourceID' : 'SourceID';
  try {
    const resp = _notionFetchWithRetry(
      'https://api.notion.com/v1/databases/' + NOTION_DB + '/query', 'post',
      JSON.stringify({
        filter: { property: sidProp, rich_text: { equals: sourceId } },
        page_size: 1,
      }),
      2 // fewer retries for lookup
    );
    return (resp.results && resp.results[0] && resp.results[0].id) || null;
  } catch (e) {
    console.warn('[dedup] SourceID lookup failed (will create new):', e.message);
    return null;
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
  const code = r.getResponseCode();
  if (code !== 200) {
    // Don't cache on error — next call should retry.
    throw new Error('Notion DB schema fetch failed (' + code + '): ' + r.getContentText().slice(0, 300));
  }
  const d = JSON.parse(r.getContentText());
  _dbSchemaCache = d.properties || {};
  return _dbSchemaCache;
}

// ── UTILITIES ──────────────────────────────────────────────
function _convertToJpy(amount, currency) {
  const n = Number(amount) || 0;
  if (!currency) return n; // assume already JPY
  const cc = String(currency).toUpperCase().trim();
  const rate = FX_TO_JPY[cc];
  if (!rate) {
    console.warn('[currency] Unknown currency "' + cc + '" — assuming JPY 1:1. Add to FX_TO_JPY if wrong.');
    return n;
  }
  return n * rate;
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
   - 來回機票（有 outbound + return / 兩個明確航班號 / 兩個日期）= **強制拆成 2 筆**，每筆 total = total ÷ 2
   - 單程機票（one-way / 只有一個航班號 / 只有一個日期）= **1 筆，唔好拆**
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
