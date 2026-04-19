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

// OpenRouter API key — gateway to openrouter/elephant-alpha (free stealth model)
const OPENROUTER_KEY = 'PASTE_OPENROUTER_KEY_OR_LEAVE';
const OPENROUTER_MODEL = 'openrouter/elephant-alpha';

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
const ZHIPU_URL      = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';
const MINIMAX_URL    = 'https://api.minimax.io/anthropic/v1/messages';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ── MAIN ENTRY POINT ──────────────────────────────────────
function processExpenseEmails() {
  // ── Self-install time trigger on first run (idempotent) ───────────
  const existingTriggers = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'processExpenseEmails';
  });
  if (!existingTriggers.length) {
    ScriptApp.newTrigger('processExpenseEmails').timeBased().everyMinutes(5).create();
    console.log('⏱ Time trigger created (every 5 min)');
  }
  // ── End self-install ──────────────────────────────────────────────

  const inbox = GmailApp.getUserLabelByName(INBOX_LABEL);
  if (!inbox) { console.log('ℹ️ Label not found — run setup()'); return; }
  const done  = _ensureLabel(DONE_LABEL);
  const fail  = _ensureLabel(FAIL_LABEL);
  const retry = _ensureLabel(RETRY_LABEL);

  const inboxThreads = inbox.getThreads(0, 20);
  const retryThreads = retry.getThreads(0, 20);
  // Also re-process failed threads that were moved there by a previous buggy run
  const failedThreads = fail.getThreads(0, 20);
  const allThreads = inboxThreads.concat(retryThreads).concat(failedThreads);
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
      // ── Email body extraction ─────────────────────────────────────────
      // HTML-heavy emails (Klook, KKday, Agoda etc) put all data in HTML tables;
      // getPlainBody() strips those to nearly nothing. Use whichever is longer.
      const plainBody = msg.getPlainBody() || '';
      const htmlBody  = msg.getBody() || '';
      const stripped  = htmlBody ? _stripHtml(htmlBody) : '';
      const rawBody = stripped.length > plainBody.length * 0.8 ? stripped : (plainBody || stripped);
      // ── Forwarded-chain dedup ─────────────────────────────────────────
      // Two scenarios:
      //  A) Email is a Gmail forward → starts with "---------- Forwarded message ---------"
      //     split()[0] is EMPTY; actual content is in split()[2]
      //  B) Email has a quoted original at the bottom
      //     split()[0] has the real content; drop the rest
      const fwdParts = rawBody.split(/^-{3,}\s*(Forwarded message|Original Message|轉寄郵件)/mi);
      let firstOnly;
      if (fwdParts[0].trim().length < 100 && fwdParts.length > 2) {
        // Case A: content comes AFTER the forwarding divider; strip mini-header lines
        const afterDivider = fwdParts.slice(2).join('');
        firstOnly = afterDivider.replace(/^[^\n]*\n(From:[^\n]*\n)?(Date:[^\n]*\n)?(Subject:[^\n]*\n)?(To:[^\n]*\n)?\n?/, '');
      } else {
        firstOnly = fwdParts[0];
      }
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

      const hasBookings = result && result.bookings && result.bookings.length > 0;
      const hasItinUpdates = result && result.itinerary_updates && result.itinerary_updates.length > 0;
      if (!hasBookings && !hasItinUpdates) {
        console.log('⚠️ No bookings or itinerary updates extracted: "' + subject + '"');
        thread.removeLabel(inbox); thread.removeLabel(retry); thread.addLabel(fail);
        scriptProps.deleteProperty(retryKey);
        permanentFail++;
        return;
      }
      if (!result.bookings) result.bookings = [];
      if (!result.itinerary_updates) result.itinerary_updates = [];

      result.bookings.forEach((b, idx) => {
        // Skip semantically empty bookings (LLM hallucinated null row)
        if (!b || (!b.store && !b.total)) {
          console.log('⏭ Skipping empty booking #' + idx + ' in "' + subject + '"');
          return;
        }
        try { pushToNotion(b, result.source || 'email', subject, threadId, idx); bookingCount++; }
        catch (e) { console.error('❌ Notion push failed [booking ' + idx + ']:', e.message); }
      });

      // Itinerary-only updates → push as special "🗓 行程更新" entries (total=null, category='other').
      // Client detects the store prefix + marker and applies them as ITINERARY overrides.
      (result.itinerary_updates || []).forEach((iu, idx) => {
        if (!iu || (!iu.date && !iu.name)) return;
        const storeName = '🗓 行程更新：' + (iu.name || '?') + (iu.time ? (' @ ' + iu.time) : '');
        const fake = {
          store: storeName, total: null, date: iu.date || null,
          category: iu.type || 'other', payment: null,
          items_text: '[行程更新]', note: iu.note || '', address: null, booking_ref: null,
          itinerary_note: null,
        };
        try { pushToNotion(fake, result.source || 'email', subject, threadId, 'iu_' + idx); }
        catch (e) { console.error('❌ Notion push failed [itin_update ' + idx + ']:', e.message); }
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
  const hasOpenRouter = OPENROUTER_KEY && !OPENROUTER_KEY.startsWith('PASTE_');

  // Each entry: { name, fn: () => parsedResult | null }
  const providers = [];
  if (hasZhipu) {
    providers.push({ name: 'glm-5.1',     fn: () => _callZhipuWithBackoff(prompt, 'glm-5.1') });
    providers.push({ name: 'glm-5',       fn: () => _callZhipuWithBackoff(prompt, 'glm-5') });
    providers.push({ name: 'glm-5-turbo', fn: () => _callZhipuWithBackoff(prompt, 'glm-5-turbo') });
  }
  if (hasMinimax) {
    providers.push({ name: 'minimax-m2.7', fn: () => _callMiniMaxWithBackoff(prompt) });
  }
  if (hasOpenRouter) {
    providers.push({ name: OPENROUTER_MODEL, fn: () => _callOpenRouterWithBackoff(prompt) });
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

// ── OPENROUTER (elephant-alpha — OpenAI-compatible) ─────────
function _callOpenRouterWithBackoff(prompt) {
  const body = {
    model: OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: 'JSON only. No markdown fences, no prose.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 4096,
  };
  const payload = JSON.stringify(body);

  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = UrlFetchApp.fetch(OPENROUTER_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + OPENROUTER_KEY,
        'HTTP-Referer': 'https://travel-expense.local',
        'X-Title': 'travel-expense email-to-notion',
      },
      payload: payload,
      muteHttpExceptions: true,
    });
    const code = resp.getResponseCode();
    if (code === 200) {
      const data = JSON.parse(resp.getContentText());
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!text) return null;
      return _parseJsonLoose(text);
    }
    if (code === 401) {
      throw new Error('OpenRouter 401 — invalid/expired key');
    }
    if (code === 429 || code === 503) {
      const waitMs = Math.min(30000, 1500 * Math.pow(2, attempt));
      console.log('OpenRouter ' + code + ', waiting ' + waitMs + 'ms…');
      Utilities.sleep(waitMs);
      continue;
    }
    throw new Error('OpenRouter ' + code + ': ' + resp.getContentText().slice(0, 200));
  }
  throw new Error('OpenRouter 429 after 3 retries');
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
  const catMap = { transport:'交通', food:'餐飲', shopping:'購物', lodging:'住宿', ticket:'門票', localtour:'當地旅遊', medicine:'藥品', other:'其他' };
  const payMap = { cash:'現金', credit:'信用卡', paypay:'PayPay', suica:'Suica' };
  // Stable SourceID = email_<threadId>_<idx> — idempotent across retries.
  const sourceId = 'email_' + (threadId || 'nothread').slice(0, 16) + '_' + (bookingIdx || 0);
  const storeName = '⏳ ' + (b.store || '待確認');
  const itinWarning = b.itinerary_note ? ' ⚠️ 行程提示：' + b.itinerary_note : '';
  // Embed structured metadata in note so client can extract address / booking_ref / time without a separate schema change.
  const metaParts = [];
  if (b.address)     metaParts.push('📍 ' + b.address);
  if (b.booking_ref) metaParts.push('🔖 ' + b.booking_ref);
  if (b.time)        metaParts.push('⏰ ' + b.time);
  const metaLine = metaParts.length ? metaParts.join(' | ') + '\n' : '';
  const noteText = metaLine + '[📧 ' + (source || 'email') + '] ' + (b.note || '') + ' · Subject: ' + (emailSubject || '').slice(0, 120) + itinWarning;

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

  // Dedup with archive-awareness:
  //   - Live page with this SourceID exists → UPDATE (same as before)
  //   - Only an ARCHIVED page with this SourceID exists → user deleted it, SKIP
  //     (don't un-archive, don't create a new page — this was the bug that caused
  //      "Klook 立山黑部" and similar entries to resurrect after deletion)
  //   - Nothing exists → CREATE
  const existing = _findNotionPageBySourceId(sourceId);
  if (existing) {
    if (existing.archived) {
      console.log('⏹ Archived page found for ' + sourceId + ' — user previously deleted, skipping (won\'t re-create).');
      return;
    }
    console.log('🔁 Existing live page found for ' + sourceId + ' — updating instead of creating');
    _notionFetchWithRetry('https://api.notion.com/v1/pages/' + existing.id, 'patch',
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

// Query Notion DB for pages with matching SourceID.
// Returns { id, archived } of the best match, or null.
//   - Prefer a live (non-archived) page; if only archived pages exist, return the archived one
//   - This allows pushToNotion() to SKIP re-creating archived (user-deleted) entries
function _findNotionPageBySourceId(sourceId) {
  const dbSchema = _getDbSchema();
  const sidProp = dbSchema['🔑 SourceID'] ? '🔑 SourceID' : 'SourceID';
  try {
    // page_size: 10 — catch possible archived + live duplicates if they co-exist.
    // Notion DB queries include archived pages by default (no archive filter = all).
    const resp = _notionFetchWithRetry(
      'https://api.notion.com/v1/databases/' + NOTION_DB + '/query', 'post',
      JSON.stringify({
        filter: { property: sidProp, rich_text: { equals: sourceId } },
        page_size: 10,
      }),
      2 // fewer retries for lookup
    );
    const results = (resp && resp.results) || [];
    if (!results.length) return null;
    const live = results.find(function(p) { return !p.archived && !p.in_trash; });
    if (live) return { id: live.id, archived: false };
    const arch = results.find(function(p) { return p.archived || p.in_trash; });
    if (arch) return { id: arch.id, archived: true };
    return null;
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
    // Remove invisible sections entirely
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Block-level breaks → newlines (before tag-strip)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<tr\b[^>]*>/gi, '\n')                    // table row start → newline
    .replace(/<\/tr>/gi, '')
    .replace(/<\/?(td|th)\b[^>]*>/gi, '\t')            // table cells → tab separator
    .replace(/<\/(p|div|li|h\d)\b[^>]*>/gi, '\n')
    // Strip all remaining tags
    .replace(/<[^>]+>/g, '')
    // HTML entities
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    // Clean up whitespace
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\t[ \t]*/g, '\t')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function _ensureLabel(name) { return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name); }

// ── ONE-TIME SETUP ─────────────────────────────────────────
function setup() {
  const providers = [];
  if (ZHIPU_KEY && !ZHIPU_KEY.startsWith('PASTE_'))     providers.push('GLM-5', 'GLM-5-turbo');
  if (MINIMAX_TOKEN && !MINIMAX_TOKEN.startsWith('PASTE_')) providers.push('MiniMax-M2.7');
  if (OPENROUTER_KEY && !OPENROUTER_KEY.startsWith('PASTE_')) providers.push(OPENROUTER_MODEL);
  GEMINI_KEYS.forEach((k, i) => { if (k && !k.startsWith('PASTE_')) providers.push('Gemini-' + (i + 1)); });
  if (ZHIPU_KEY && !ZHIPU_KEY.startsWith('PASTE_'))     providers.push('GLM-4-Flash');
  if (!providers.length) throw new Error('⛔ Fill in at least one of ZHIPU_KEY / MINIMAX_TOKEN / OPENROUTER_KEY / GEMINI_KEYS');
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

// ── RESET: move failed/retry threads back to inbox for reprocessing ──────────
function resetFailedToInbox() {
  const inbox  = _ensureLabel(INBOX_LABEL);
  const fail   = GmailApp.getUserLabelByName(FAIL_LABEL);
  const retry  = GmailApp.getUserLabelByName(RETRY_LABEL);
  let moved = 0;
  [fail, retry].forEach(function(lbl) {
    if (!lbl) return;
    lbl.getThreads(0, 50).forEach(function(t) {
      t.removeLabel(lbl);
      t.addLabel(inbox);
      PropertiesService.getScriptProperties().deleteProperty('retry_' + t.getId());
      moved++;
    });
  });
  console.log('✅ Moved ' + moved + ' thread(s) back to travel-expense for reprocessing');
}

// ── DEBUG: show extracted text for emails in all travel-expense labels ────────
function debugEmail() {
  const inbox  = GmailApp.getUserLabelByName(INBOX_LABEL);
  const retry  = GmailApp.getUserLabelByName(RETRY_LABEL);
  const fail   = GmailApp.getUserLabelByName(FAIL_LABEL);
  const all    = []
    .concat(inbox  ? inbox.getThreads(0, 5)  : [])
    .concat(retry  ? retry.getThreads(0, 5)  : [])
    .concat(fail   ? fail.getThreads(0, 5)   : []);

  if (!all.length) { console.log('📭 No emails in travel-expense / retry / failed labels'); return; }

  all.slice(0, 3).forEach(function(thread) {
    const msg     = thread.getMessages()[0];
    const subject = msg.getSubject() || '(no subject)';
    const plain   = msg.getPlainBody() || '';
    const html    = msg.getBody() || '';
    const stripped = html ? _stripHtml(html) : '';
    console.log('Subject: ' + subject);
    console.log('Plain body length: ' + plain.length + ' | Stripped HTML length: ' + stripped.length);
    console.log('── Stripped HTML (first 2000 chars) ──');
    console.log(stripped.slice(0, 2000));
  });
}

// ── TRIP ITINERARY CONTEXT (for AI cross-reference) ──────────
const TRIP_ITINERARY = `
名古屋旅行行程（2026年4月20–25日，6日5夜）:
Day 1 (2026-04-20): 名古屋市區。中部國際機場抵達→JR名古屋站→蓬萊軒鰻魚飯→熱田神宮→大須商店街→矢場とん→Daiwa Roynet酒店Check-in(23:00)
Day 2 (2026-04-21): 飛驒高山/白川鄉。07:30名古屋站集合→高山陣屋→高山老街(飛驒牛午餐)→白川鄉合掌村→飛驒高山住宿
Day 3 (2026-04-22): 立山黑部。08:00高山出發→室堂(立山)→雪之大谷→室堂餐廳→黑部水庫→信濃大町住宿
Day 4 (2026-04-23): 上高地/金澤。上高地(河童橋/明神池)→移動金澤→兼六園→近江町市場→鳥開總本家(親子丼)→金澤住宿
Day 5 (2026-04-24): 名古屋。返回名古屋→名古屋城→午餐→OASIS 21→生日晚餐
Day 6 (2026-04-25): 常滑→機場。常滑陶器之鄉→招財貓大道→午餐→中部機場→17:00回程航班
`;

// ── EMAIL EXTRACTION PROMPT (TEXT-ONLY, no images) ─────────
const MULTI_BOOKING_PROMPT = `你係專業旅遊 email → 支出紀錄 解析 AI。你嘅輸出會直接寫入 Notion 同個人財務 app，所以【準確度比齊全更重要】。不確定就返 null，唔好估。

══════════════════════════════════════════════════════
【第 0 步 — 先判斷 email 類型】
══════════════════════════════════════════════════════

  (A) 純預訂/消費確認   (有金額 + 訂單編號，無具體時間/地點承諾)  → bookings[]
  (B) 純行程更新        (pickup/時間/地點變更，無錢)            → itinerary_updates[]
  (C) 兩者都有          (booking 內附帶明確時間、地點、行程承諾)  → 兩邊都填 ★★★
  (D) 退款 / 取消通知                                         → bookings=[], 只填 itinerary_updates 如有影響行程
  (E) 垃圾郵件/推廣/純 marketing                              → bookings=[], itinerary_updates=[]

⭐⭐⭐ 極重要 — (C) 係最常見情況，絕對唔好漏 itinerary_updates：
  下列 email 類型【必定】都係 C 類，要同時填 bookings + itinerary_updates：
    ✈️  機票（HKExpress / Cathay / ANA / JAL / AirAsia / Peach）
        → bookings: 機票 expense（一程一筆 / 來回 2 筆）
        → itinerary_updates: 每程嘅「起飛日 / 機場 check-in 時間 / 航班號」
    🗺️  Tour 預訂（KKday / Klook / Viator / GetYourGuide）
        → bookings: tour expense（多日就拆多筆）
        → itinerary_updates: 每日嘅 pickup 時間 + 主要景點，type=transport/localtour
    🚅  鐵路（JR Pass 指定日用 / 新幹線指定席）
        → bookings: 票價 expense
        → itinerary_updates: 乘車日 + 時間
    🏨  酒店（Agoda / Booking / Expedia / 直接訂）
        → bookings: 住宿 expense（多晚合一筆）
        → itinerary_updates: check-in 日 + 酒店名，type=lodging
    🍽️  pre-paid 餐廳 / 有訂座時間嘅餐廳（HotPepper / Omakase / Tabelog）
        → bookings: 食物 expense（或 total=null 如現場付）
        → itinerary_updates: 訪問日 + 時間 + 餐廳名，type=food

  只有純粹 online goods（eSIM、保險、商品）冇行程承諾嘅先係 A 類 bookings-only。

⚠️ 見到以下字眼 = 取消/退款，NOT booking，千萬唔好建立 booking：
   "refunded" / "cancelled" / "訂單已取消" / "取消確認" / "退款通知" / "未完成"
   → 返 empty arrays + source="other"（除非同時有有效的行程更新）

══════════════════════════════════════════════════════
【第 1 步 — 拆分與合併（錯呢步成個 record 錯哂）】
══════════════════════════════════════════════════════

必拆（一筆變多筆）：
  ✅ 來回機票（outbound + return / 兩個航班號 / 兩個起飛日）→ 必拆 2 筆
     ⚠️ 絕對唔好將 Grand Total / 總計 填入每一筆！Grand Total = 全部航程 × 全部乘客嘅總和
     → 若 email 列出各程逐項費用 → 每程 amount = 該程所有乘客費用之和（去程合計 + 回程合計）
     → 若 email 只有一個 Grand Total 無逐項 → 每筆 = Grand Total ÷ 2
     → 自驗：去程 amount + 回程 amount 必須等於 Grand Total，否則數字有誤！
  ✅ Klook/KKday 多日行程/多 activity 訂單 → 每日/每 activity 一筆，total 按明細分；
     若只有 grand total，平均分配
  ✅ 多個餐廳訂座（同一 email 幾間餐廳）→ 每間一筆

必合（多項變一筆）：
  ❌ 同一酒店多晚（Check-in 2026-04-20, 4 晚）→ 一筆，date=Check-in 日，note 寫 "N 晚"
  ❌ 一筆內分項（住宿費 + 稅 + 服務費 / 主菜 + 飲品）→ 一筆，total=grand total
  ❌ 多人同行（2 adults × HKD 1,600）→ 一筆，total=HKD 3,200 換算，items_text 寫 "2 位"
  ❌ 單程機票 → 一筆，唔拆

══════════════════════════════════════════════════════
【第 2 步 — 金額（total 必須係 JPY 整數）】
══════════════════════════════════════════════════════

匯率表（近似，用喺 original → JPY 換算）：
   1 HKD ≈ 20 JPY    1 USD ≈ 150 JPY   1 CNY ≈ 20 JPY   1 EUR ≈ 160 JPY
   1 AUD ≈ 102 JPY   1 TWD ≈ 5 JPY     1 KRW ≈ 0.11 JPY  1 GBP ≈ 185 JPY
   1 SGD ≈ 110 JPY   1 THB ≈ 4.3 JPY   1 MYR ≈ 33 JPY

嚴格規則：
  ① 永遠記錄 original_currency + original_amount（無論幾種幣）
  ② total = Math.round(original_amount × rate)（取整數 JPY）
  ③ 若 email 已經用 JPY → original_currency="JPY", original_amount=JPY 金額, total 相同
  ④ 價錢未定（"TBD" / "Pay at store" / "到付")→ total=null,
     items_text="預訂座位，價格現場確認", confidence="medium"
  ⑤ 有折扣：用【實付金額】，唔好用「原價」
     例：「原價 HKD 3,500，特價 HKD 3,200」→ original_amount=3200
  ⑥ 稅/服務費：用【含稅總額】（grand total），唔好減稅

❌ 常見致命錯：
  - 將 "HKD 860.40" 填入 total 當 JPY（應該 ×20 = 17208）
  - 用 "Subtotal" 而非 "Grand Total"
  - 忘記 ×匯率

══════════════════════════════════════════════════════
【第 3 步 — 日期（service date，當地時區）】
══════════════════════════════════════════════════════

✅ 用 service date（消費實際發生當日，當地時區）：
   機票=起飛日 · 酒店=Check-in 日 · 餐廳=用餐日 · Tour=出團日 · 門票=入場日

❌ 絕對唔好用：
   email 發送日 · 付款/扣卡日 · booking 建立日 · Check-out 日

格式 YYYY-MM-DD：
  「2026年4月23日」→ "2026-04-23"
  "Apr 23, 2026" → "2026-04-23"
  "23/04/2026" (日/月/年) → "2026-04-23"
  ⚠️ "4/5/2026" 歧義！若上下文係北美 email → "2026-04-05"；若亞洲/歐洲 email → "2026-05-04"。有疑問返 null

日期唔喺行程範圍內（2026-04-20 至 04-25）但 email 明顯係呢次旅行：
  → 保留 email 日期，寫入 itinerary_note="日期 2026-XX-XX 不在行程範圍"

══════════════════════════════════════════════════════
【第 4 步 — Category（每 booking 一個）】
══════════════════════════════════════════════════════

  🚆 transport  機票、鐵路、JR Pass、Taxi、接送、巴士、船、共享單車
  🏨 lodging    酒店、民宿、Ryokan、AirBnB、膠囊旅館
  🍱 food       餐廳預訂、HotPepper、Tabelog、飲品訂購
  🗺️ localtour  Klook/KKday/Viator 多小時 guided tour、一日遊、導遊團
  🎫 ticket     單次入場券（博物館、樂園、滑雪場 day pass、纜車票）
  🛍️ shopping   線上購物、手信、電器預訂、機場免稅店
  💊 medicine   藥品、診所費、疫苗、體檢
  📦 other      eSIM、保險、Wi-Fi 蛋、匯款費、簽證

邊界判斷：
  - Klook 3 小時以上導遊團 = localtour；單張博物館票 = ticket
  - JR Pass 7 日券 = transport（同一筆，唔拆每日）
  - 租車 = transport
  - 酒店內餐廳晚餐（含入住）= 一筆 lodging；獨立訂 = food

══════════════════════════════════════════════════════
【第 5 步 — Payment 推斷（保守）】
══════════════════════════════════════════════════════

只有當 email 明確講先填，否則 null：
  "信用卡尾數 XXXX" / "Visa ending" / "MasterCard"     → "credit"
  "PayPay" / "ペイペイ"                                → "paypay"
  "Suica" / "IC Card"                                 → "suica"
  "現金付款" / "Cash"                                 → "cash"
  "Apple Pay / Google Pay"                            → "credit"（背後係信用卡）
  "到店付款" / "Pay at store" / "現場結賬"             → null（仲未付）

❌ 唔好估：冇明確講就返 null

══════════════════════════════════════════════════════
【第 6 步 — 每個欄位嚴格要求】
══════════════════════════════════════════════════════

store（商戶名）
  ✅ 真實商戶名，繁中優先：「Daiwa Roynet 名古屋太閤通口」「蓬萊軒 本店」「Klook 立山黑部一日遊」
  ✅ 平台 + 產品：「KKday 中部三日遊」而非只寫「KKday」
  ❌ 唔好放金額、訂單編號、狀態：錯「Daiwa Roynet HKD 860 已付」
  ❌ 唔好加 ⏳/✅ 等 emoji（系統自動加）
  ❌ 唔好全大寫 shouting：錯「DAIWA ROYNET NAGOYA」

address（街道地址）
  ✅ 完整地址：「愛知県名古屋市中村区名駅4-6-25」「東京都港区六本木6-10-1」
  ✅ 郵遞 code 可選：「〒450-0002 愛知県名古屋市中村区名駅4-6-25」
  ❌ 城市/國家級：「名古屋」「日本」「東京」→ 太空泛，返 null
  ❌ 絕對禁止：價錢、付款狀態、卡號、訂單號、預訂日期
  ❌ 如果 email 只有 meeting point 而非 venue address，酌情考慮：
     – 機場接送 pickup = null（無固定地址）
     – Tour meeting point = 可以填（例：「名古屋駅 新幹線口集合」）

booking_ref（純訂單號）
  ✅ 「KNR358047」「BK-2026-04-XXXX」「R5C7K8」
  ❌ 加前綴：錯「編號：KNR358047」；正「KNR358047」
  ❌ 兩個編號：只填最主要嘅（如 airline PNR 優先於 agency ref）

time（HH:mm）
  ✅ 明確時間：Check-in "15:00" · pickup "07:30" · flight depart "09:15"
  ✅ 當地時間（destination timezone），唔使 convert
  ❌ email 冇明確時間 → null（唔好用預設 "12:00"）

note（<100 字，只放有用 context）
  ✅ 包含：房型、航班號、餐廳座位數、tour highlights、特別要求
     例：「和室雙人 · 含朝食」「CX568 · 經濟艙 14K」「2 位 · 吸煙區」
  ❌ 嚴禁：金額/幣別/卡號/付款狀態
     錯：「HKD 860 已付 · 尾數 0373」
     錯：「Payment: Paid with Visa」
  ❌ 嚴禁：重複 store name、emoji prefix

items_text（1–2 句簡述）
  ✅ 描述訂購內容：「Standard Twin · 2 晚」「去程航班」「Day 1 · 名古屋站集合」
  ✅ 多人：「2 位 · 19:00 · 2026-04-23」
  ❌ 唔好寫金額 / 訂單號

itinerary_note
  ✅ 只在【日期/地點/時間 同 TRIP_ITINERARY 有明顯衝突】先填，一句話
     例：「KKday Day 1 pickup 2026-04-21 07:30 同行程 Day 2 名古屋站集合 07:30 吻合 ✓」
         「Email 日期 2026-04-19 早過行程開始 04-20，可能係到達前夜」
  ✅ 完全一致 → null
  ❌ 唔好重複 items_text / note 內容

confidence
  ✅ "high"   = 所有關鍵欄位（store, total, date）明確 + 無歧義
  ✅ "medium" = 部分欄位靠推斷（例：價錢未定 / 多幣需換算 / 類別邊界）
  ✅ "low"    = 整封 email 難解釋 / 多個可能解讀 / 資料非常殘缺

══════════════════════════════════════════════════════
【第 6.5 步 — 主動補 itinerary_updates（★ 新規則）】
══════════════════════════════════════════════════════

每次建立完 bookings[] 後，必檢查：呢個 booking 有冇具體【日期 + 時間 + 地點】嘅行程承諾？
如果有，必須同時建立對應嘅 itinerary_updates 條目。

映射原則：
  - 機票 booking → 起飛日 + 起飛時間 + "{airline} {flight_no} 機場 check-in / 起飛"
     name 例：「HK Express UO610 機場 check-in」「CX568 HKG→NGO 起飛」
     type = "transport"
     time = 起飛前 2-3 小時（機場 check-in 時間）或 email 標明嘅 check-in 時間
  - 多日 tour booking → 每日 pickup 時間 + 集合地點
     name 例：「KKday Day 1 · 名古屋站 pickup」
     type = "transport"（pickup 用 transport）或 "localtour"（到景點後用 localtour）
  - 酒店 booking → check-in 日 + 15:00（或 email 明講時間）+ 酒店名
     name 例：「Daiwa Roynet 名古屋 check-in」
     type = "lodging"
  - 餐廳訂座 → 訪問日 + 時間 + 餐廳名
     name 例：「蓬萊軒 本店 · 午餐 12:30」
     type = "food"

⚠️ itinerary_updates 只記錄【時間 + 地點承諾】，唔係重複 bookings 內容：
  - note 寫一句 context（例：「訂單 UO-ABC123 · 2 位」「KKday 三日團 Day 1」）
  - 唔好放金額 / 卡號 / 付款狀態
  - 日期超過行程範圍（2026-04-20 ~ 04-25）嘅 booking，仍然要建 itinerary_updates（用戶可能延長行程）

══════════════════════════════════════════════════════
【第 7 步 — 返回前 Self-Check（逐項心裡 review）】
══════════════════════════════════════════════════════

返 JSON 前，逐個 booking 檢查：
  □ total 係整數 JPY？有冇忘記 ×匯率？
  □ date 係 service date（當地）唔係 email 發送日？
  □ ★ 呢個 booking 有冇具體時間/地點承諾？有嘅話 itinerary_updates 裡面係咪都已建立對應條目？（機票/tour/酒店/訂座 = 必建）
  □ store 有冇夾雜金額/訂單號？
  □ address 係實際街道地址唔係城市名？
  □ note 有冇夾雜金額/卡號/付款狀態？
  □ 來回機票有冇拆成 2 筆？多晚酒店有冇合成 1 筆？
  □ 係咪取消/退款 email？（若係 → empty bookings）
  □ 所有 string 都用 "..."，冇 markdown、冇 code fence

══════════════════════════════════════════════════════
【JSON 輸出格式】（嚴格 JSON，唔可加 markdown / 解釋 / code fence）
══════════════════════════════════════════════════════

{
  "source": "klook|kkday|agoda|booking|expedia|trip|cathay|ana|jal|hkexpress|hotpepper|tabelog|airbnb|other",
  "bookings": [
    {
      "store": "商戶真實名（繁中優先）",
      "total": number_JPY_or_null,
      "original_currency": "HKD|USD|JPY|CNY|EUR|AUD|TWD|KRW",
      "original_amount": number_in_original_currency,
      "date": "YYYY-MM-DD",
      "time": "HH:mm or null",
      "category": "transport|food|shopping|lodging|ticket|localtour|medicine|other",
      "payment": "cash|credit|paypay|suica or null",
      "address": "街道地址 or null",
      "booking_ref": "純訂單編號 or null",
      "items_text": "1-2 句描述訂購內容",
      "note": "房型/航班號/特別安排（禁止放金額、卡號、付款狀態）",
      "itinerary_note": "如同參考行程有衝突，一句話指出；一致就 null",
      "confidence": "high|medium|low"
    }
  ],
  "itinerary_updates": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:mm or null",
      "name": "活動名稱（簡短）",
      "type": "transport|food|shopping|lodging|ticket|localtour|other",
      "note": "變更說明"
    }
  ]
}

══════════════════════════════════════════════════════
【示範例子 — 7 個 cover 常見情景】
══════════════════════════════════════════════════════

★ 例 1 — 酒店 multi-night（必合成 1 筆）
Input: "Agoda confirmation — Daiwa Roynet Hotel Nagoya Taiko-dori, Check-in 2026-04-20, Check-out 2026-04-22, Standard Twin, Total HKD 1,720.80, 信用卡尾數 0373, Address: 〒450-0002 愛知県名古屋市中村区名駅4-6-25, Booking: AGD-9876543"
Output:
{"source":"agoda","bookings":[{
  "store":"Daiwa Roynet Hotel 名古屋太閤通口",
  "total":34416,"original_currency":"HKD","original_amount":1720.80,
  "date":"2026-04-20","time":"15:00",
  "category":"lodging","payment":"credit",
  "address":"〒450-0002 愛知県名古屋市中村区名駅4-6-25",
  "booking_ref":"AGD-9876543",
  "items_text":"Standard Twin · 2 晚",
  "note":"Check-in 4/20, Check-out 4/22 · Standard Twin",
  "itinerary_note":null,"confidence":"high"
}],"itinerary_updates":[]}

★ 例 2 — KKday 多日團（必拆 N 筆，total 平分；★必建 itinerary_updates）
Input: "KKday 中部三日遊 — Day 1: 飛驒高山/白川鄉 2026-04-21 07:30 pickup @ 名古屋站太閤通口, Day 2: 立山黑部 2026-04-22 08:00 長野集合, Day 3: 上高地/金澤 2026-04-23 08:30 pickup, 訂單 KKD-ABC123, 總價 HKD 4,500, 信用卡尾數 0373"
Output:
{"source":"kkday","bookings":[
  {"store":"KKday 飛驒高山/白川鄉一日遊","total":30000,"original_currency":"HKD","original_amount":1500,"date":"2026-04-21","time":"07:30","category":"localtour","payment":"credit","address":null,"booking_ref":"KKD-ABC123","items_text":"三日團 Day 1 · 名古屋站集合","note":"三日團 Day 1/3","itinerary_note":null,"confidence":"high"},
  {"store":"KKday 立山黑部一日遊","total":30000,"original_currency":"HKD","original_amount":1500,"date":"2026-04-22","time":"08:00","category":"localtour","payment":"credit","address":null,"booking_ref":"KKD-ABC123","items_text":"三日團 Day 2 · 雪之大谷","note":"三日團 Day 2/3","itinerary_note":null,"confidence":"high"},
  {"store":"KKday 上高地/金澤一日遊","total":30000,"original_currency":"HKD","original_amount":1500,"date":"2026-04-23","time":"08:30","category":"localtour","payment":"credit","address":null,"booking_ref":"KKD-ABC123","items_text":"三日團 Day 3 · 兼六園","note":"三日團 Day 3/3","itinerary_note":null,"confidence":"high"}
],"itinerary_updates":[
  {"date":"2026-04-21","time":"07:30","name":"KKday Day 1 · 名古屋站集合","type":"transport","note":"三日團 Day 1 pickup · 訂單 KKD-ABC123"},
  {"date":"2026-04-22","time":"08:00","name":"KKday Day 2 · 長野集合 (立山黑部)","type":"transport","note":"三日團 Day 2 · 雪之大谷"},
  {"date":"2026-04-23","time":"08:30","name":"KKday Day 3 · pickup (上高地/金澤)","type":"transport","note":"三日團 Day 3 · 兼六園"}
]}

★ 例 3 — 餐廳訂座（價錢未定，有 meeting point 唔當 address）
Input: "HotPepper — 壽司匠 蔵 予約完了 2026-04-23 19:00, 2 名様, 予約番号 RAU826858, 支払い：現地決済, 〒920-0981 石川県金沢市片町1-7-4"
Output:
{"source":"hotpepper","bookings":[{
  "store":"壽司匠 蔵",
  "total":null,"original_currency":null,"original_amount":null,
  "date":"2026-04-23","time":"19:00",
  "category":"food","payment":null,
  "address":"〒920-0981 石川県金沢市片町1-7-4",
  "booking_ref":"RAU826858",
  "items_text":"2 位 · 19:00 · 現場結賬",
  "note":"2 位",
  "itinerary_note":null,"confidence":"medium"
}],"itinerary_updates":[]}

★ 例 4 — 來回機票（必拆 2 筆；★必建 itinerary_updates，check-in = 起飛前 2h）
Input: "Cathay Pacific — CX568 HKG→NGO 2026-04-20 09:15 depart, CX569 NGO→HKG 2026-04-25 17:00 depart, 2 passengers, List price HKD 7,200, Promotional fare HKD 6,400, PNR: ABC123, paid with Visa ending 0373"
Output:
{"source":"cathay","bookings":[
  {"store":"國泰 CX568 HKG→NGO","total":64000,"original_currency":"HKD","original_amount":3200,"date":"2026-04-20","time":"09:15","category":"transport","payment":"credit","address":null,"booking_ref":"ABC123","items_text":"去程航班 · 2 位","note":"CX568 · 2 位","itinerary_note":null,"confidence":"high"},
  {"store":"國泰 CX569 NGO→HKG","total":64000,"original_currency":"HKD","original_amount":3200,"date":"2026-04-25","time":"17:00","category":"transport","payment":"credit","address":null,"booking_ref":"ABC123","items_text":"回程航班 · 2 位","note":"CX569 · 2 位","itinerary_note":null,"confidence":"high"}
],"itinerary_updates":[
  {"date":"2026-04-20","time":"07:00","name":"CX568 HKG 機場 check-in (起飛 09:15)","type":"transport","note":"PNR ABC123 · 2 位 · 起飛前 2h 抵機場"},
  {"date":"2026-04-25","time":"15:00","name":"CX569 NGO 機場 check-in (起飛 17:00)","type":"transport","note":"PNR ABC123 · 2 位 · 回程"}
]}
(注：用 promotional HKD 6,400 而非 list HKD 7,200；2 位共乘同一 booking，唔拆；check-in 時間自動設為起飛前 2h)

★ 例 5 — 純行程更新（cancellation refund 例外處理）
Input: "KKday 通知 — 因應天氣關係，Day 1 pickup 時間由 07:30 提早到 07:00，集合地點不變"
Output:
{"source":"kkday","bookings":[],"itinerary_updates":[{
  "date":"2026-04-21","time":"07:00","name":"名古屋站集合 (pickup 提前)",
  "type":"transport","note":"pickup 由 07:30 提早到 07:00，集合地點不變"
}]}

★ 例 6 — 退款通知（NOT a booking — 返 empty arrays）
Input: "KKday 訂單取消通知 — 訂單 KKD-XYZ789 已取消，HKD 1,500 將於 3-5 工作天退回原支付方式"
Output:
{"source":"kkday","bookings":[],"itinerary_updates":[]}

★ 例 7 — eSIM / 附加服務（other category）
Input: "Trip.com — Japan Unlimited eSIM, 8 days (2026-04-20 to 2026-04-27), USD 19.90 paid, Order TC-ES-2026041912345, activation code sent to email"
Output:
{"source":"trip","bookings":[{
  "store":"Trip.com Japan eSIM 8 日",
  "total":2985,"original_currency":"USD","original_amount":19.90,
  "date":"2026-04-20","time":null,
  "category":"other","payment":"credit",
  "address":null,
  "booking_ref":"TC-ES-2026041912345",
  "items_text":"Unlimited eSIM · 8 日 (4/20–4/27)","note":"Activation code 由 email 獨立發送",
  "itinerary_note":null,"confidence":"high"
}],"itinerary_updates":[]}

★ 例 8 — HK Express 來回機票（TD87QN，2 位乘客，有逐項費用 → 拆 2 筆 + itinerary_updates）
Input: "HK Express 訂單確認 TD87QN
出發 UO690 HKG→NGO 10:50 2026-04-20 | 回程 UO691 NGO→HKG 16:45 2026-04-25
小姐 Hoi Yan Chu — 出發: 票價 HKD 1130 + 燃油 140 + 機場費 355 = HKD 1625；回程: 票價 HKD 1480 + 燃油 140 + 日本稅費 151 = HKD 1771
先生 Kin On Chow — 出發: HKD 1625；回程: HKD 1771
總計: HKD 6792.00 · Mastercard HKD 6291.70 + Asia Miles HKD 500.30"
Output:
{"source":"hkexpress","bookings":[{
  "store":"HK Express UO690 HKG→NGO",
  "total":65000,"original_currency":"HKD","original_amount":3250,
  "date":"2026-04-20","time":"10:50",
  "category":"transport","payment":"credit",
  "address":null,
  "booking_ref":"TD87QN",
  "items_text":"去程 · 2 位 · UO690 10:50 HKG→NGO",
  "note":"TD87QN · 2 pax 出發費用合計 HKD 3250 (1625×2)",
  "itinerary_note":null,"confidence":"high"
},{
  "store":"HK Express UO691 NGO→HKG",
  "total":70840,"original_currency":"HKD","original_amount":3542,
  "date":"2026-04-25","time":"16:45",
  "category":"transport","payment":"credit",
  "address":null,
  "booking_ref":"TD87QN",
  "items_text":"回程 · 2 位 · UO691 16:45 NGO→HKG",
  "note":"TD87QN · 2 pax 回程費用合計 HKD 3542 (1771×2)",
  "itinerary_note":null,"confidence":"high"
}],"itinerary_updates":[
  {"date":"2026-04-20","time":"08:50","name":"UO690 HKG T1 辦理登機 (起飛 10:50 HKT)","type":"transport","note":"TD87QN · 起飛前 2h"},
  {"date":"2026-04-25","time":"14:45","name":"UO691 NGO T2 辦理登機 (起飛 16:45 JST)","type":"transport","note":"TD87QN · 起飛前 2h"}
]}
⚠️ 自驗: 3250 + 3542 = 6792 = 總計 ✓ (唔係 6792 × 2!)

★ 例 9 — Agoda 酒店（bookings + itinerary_updates 同時建）
Input: "Agoda — Daiwa Roynet Hotel Nagoya Taiko-dori, Check-in 2026-04-20 15:00, Check-out 2026-04-22, 2 nights, Standard Twin, Total HKD 1,720, Booking AGD-9876, Paid Visa ending 0373"
Output:
{"source":"agoda","bookings":[{
  "store":"Daiwa Roynet Hotel 名古屋太閤通口",
  "total":34400,"original_currency":"HKD","original_amount":1720,
  "date":"2026-04-20","time":"15:00",
  "category":"lodging","payment":"credit",
  "address":"愛知県名古屋市中村区名駅4-6-25",
  "booking_ref":"AGD-9876",
  "items_text":"Standard Twin · 2 晚",
  "note":"Check-in 4/20, Check-out 4/22 · Standard Twin",
  "itinerary_note":null,"confidence":"high"
}],"itinerary_updates":[
  {"date":"2026-04-20","time":"15:00","name":"Daiwa Roynet 名古屋 check-in","type":"lodging","note":"AGD-9876 · Standard Twin · 2 晚至 4/22"}
]}

══════════════════════════════════════════════════════
如果完全無法解析，返：{"source":"other","bookings":[],"itinerary_updates":[]}

⚠️ ⚠️ ⚠️ 只返 JSON object，冇 markdown、冇 \`\`\`、冇解釋文字。`;
