/**
 * ============================================================
 * 📧 Travel Expense — Email → Notion Auto-Import
 * ============================================================
 *
 * WHAT THIS DOES:
 *   Forward any hotel/flight/activity confirmation email to your
 *   Gmail inbox with the "travel-expense" label, and this script
 *   will automatically:
 *     1. Parse the email with Gemini AI
 *     2. Extract each booking (auto-split round trips, multi-activity, etc.)
 *     3. Create a pending entry in your Notion database (marked "⏳ ")
 *     4. Mark the email as processed
 *
 * The pending entries appear in your travel-expense app with a
 * yellow badge and a "✅ 確認" button for one-tap review.
 *
 * SETUP (one-time, ~3 minutes):
 *   1. Go to https://script.google.com/home → "New Project"
 *   2. Paste this entire file into the Code.gs editor
 *   3. Fill in the CONFIG section below (Gemini key, Notion token, Notion DB ID)
 *   4. Run the `setup()` function once (grant permissions when asked)
 *   5. In Gmail, create a filter:
 *        - "To: <your-email>+expense@gmail.com"  (or subject contains #expense)
 *        - Action: Apply label "travel-expense"
 *   6. Forward any confirmation email to <your-email>+expense@gmail.com
 *   7. Wait up to 5 min — the entry will appear in your app (pull from Notion)
 *
 * COST: 100% free. Uses your own Gemini + Notion keys. Runs on Google's
 *       free Apps Script quota (~20 min/day, plenty for this use case).
 * ============================================================
 */

// ── CONFIG ─────────────────────────────────────────────────
const GEMINI_KEY   = 'PASTE_GEMINI_API_KEY_HERE';
const GEMINI_MODEL = 'gemini-3.1-flash-preview'; // cheap + fast; use 'gemini-3.1-pro-preview' for better accuracy
const NOTION_TOKEN = 'PASTE_NOTION_INTEGRATION_TOKEN_HERE';
const NOTION_DB    = 'PASTE_NOTION_DATABASE_ID_HERE';

const INBOX_LABEL  = 'travel-expense';            // Gmail label for incoming
const DONE_LABEL   = 'travel-expense/processed';  // Where processed emails go
const FAIL_LABEL   = 'travel-expense/failed';     // Where unparseable emails go

// Rough FX → JPY (update if needed)
const FX_TO_JPY = {
  HKD: 20.36, USD: 155, EUR: 170, CNY: 21.5,
  TWD: 4.8,   KRW: 0.11, THB: 4.3, SGD: 115, JPY: 1,
};

// ── MAIN ENTRY POINT (called by time-based trigger) ────────
function processExpenseEmails() {
  const inbox = GmailApp.getUserLabelByName(INBOX_LABEL);
  if (!inbox) { console.log('ℹ️ Label not found:', INBOX_LABEL, '— did you run setup()?'); return; }
  const done = _ensureLabel(DONE_LABEL);
  const fail = _ensureLabel(FAIL_LABEL);

  const threads = inbox.getThreads(0, 20);
  if (!threads.length) { console.log('📭 Nothing to process'); return; }

  let processed = 0, bookingCount = 0, failed = 0;

  threads.forEach(thread => {
    try {
      const msg = thread.getMessages()[0];
      const subject = msg.getSubject() || '';
      const from = msg.getFrom() || '';
      const rawBody = msg.getPlainBody() || _stripHtml(msg.getBody() || '');
      const source = `From: ${from}\nSubject: ${subject}\n\n${rawBody}`.slice(0, 30000);

      const result = extractBookings(source);
      if (!result || !result.bookings || !result.bookings.length) {
        console.log('⚠️ No bookings extracted from:', subject);
        thread.removeLabel(inbox); thread.addLabel(fail);
        failed++;
        return;
      }

      result.bookings.forEach(b => {
        try {
          pushToNotion(b, result.source || 'email', subject);
          bookingCount++;
        } catch (e) {
          console.error('❌ Notion push failed for booking:', e.message);
        }
      });
      thread.removeLabel(inbox); thread.addLabel(done);
      processed++;
      console.log(`✅ ${subject} → ${result.bookings.length} booking(s)`);
    } catch (e) {
      console.error('❌ Thread processing failed:', e.message);
      try { thread.removeLabel(inbox); thread.addLabel(fail); } catch(_) {}
      failed++;
    }
  });

  console.log(`📊 Done: ${processed} emails processed, ${bookingCount} bookings created, ${failed} failed`);
}

// ── GEMINI EXTRACTION ──────────────────────────────────────
function extractBookings(emailText) {
  const prompt = MULTI_BOOKING_PROMPT + '\n\n---- EMAIL START ----\n' + emailText + '\n---- EMAIL END ----';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + GEMINI_KEY;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  };
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  const text = resp.getContentText();
  if (code !== 200) {
    console.error('Gemini error', code, text.slice(0, 500));
    return null;
  }
  const data = JSON.parse(text);
  const jsonStr = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0].text;
  if (!jsonStr) return null;
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Sometimes LLM wraps in markdown fences — strip and retry
    const cleaned = jsonStr.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '');
    return JSON.parse(cleaned);
  }
}

// ── NOTION PUSH (pending state = "⏳ " prefix on store name) ─
function pushToNotion(b, source, emailSubject) {
  const jpy = _convertToJpy(b.total, b.original_currency);
  const hkd = Math.round((jpy / 20.36) * 100) / 100;
  const catMap = { transport:'交通', food:'餐飲', shopping:'購物', lodging:'住宿', ticket:'門票', medicine:'藥品', other:'其他' };
  const payMap = { cash:'現金', credit:'信用卡', paypay:'PayPay', suica:'Suica' };
  const sourceId = 'email_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const storeName = '⏳ ' + (b.store || '待確認');
  const noteText = '[📧 ' + (source || 'email') + '] '
                 + (b.note || '')
                 + ' · Subject: ' + (emailSubject || '').slice(0, 120);

  // Auto-detect schema — check DB for emoji vs plain names
  const dbSchema = _getDbSchema();
  const pn = (key, emoji, plain) => dbSchema[emoji] ? emoji : plain;

  const props = {};
  props[pn('store', '🏪 店名', '店名')]       = { title: [{ text: { content: storeName.slice(0, 200) } }] };
  props[pn('amount', '💴 金額 ¥', '金額')]    = { number: Math.round(jpy) || 0 };
  props[pn('date', '📅 日期', '日期')]        = { date: { start: b.date || _todayJST() } };
  props[pn('cat', '🗂 類別', '類別')]         = { select: { name: catMap[b.category] || '其他' } };
  props[pn('pay', '💳 支付', '支付')]         = { select: { name: payMap[b.payment] || '信用卡' } };
  props[pn('region', '📍 地區', '地區')]      = { rich_text: [{ text: { content: (b.region || '').slice(0, 200) } }] };
  props[pn('items', '🧾 品項', '品項')]       = { rich_text: [{ text: { content: (b.items_text || '').slice(0, 2000) } }] };
  props[pn('note', '📝 備註', '備註')]        = { rich_text: [{ text: { content: noteText.slice(0, 2000) } }] };
  props[pn('sourceId', '🔑 SourceID', 'SourceID')] = { rich_text: [{ text: { content: sourceId } }] };
  if (dbSchema[pn('hkd', '💵 HKD', 'HKD')]) {
    props[pn('hkd', '💵 HKD', 'HKD')] = { number: hkd };
  }

  const payload = {
    parent: { database_id: NOTION_DB },
    properties: props,
  };
  const resp = UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + NOTION_TOKEN,
      'Notion-Version': '2022-06-28',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('Notion ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 400));
  }
}

// Cache the DB schema for one execution (cleared on every new trigger run)
let _dbSchemaCache = null;
function _getDbSchema() {
  if (_dbSchemaCache) return _dbSchemaCache;
  const r = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB, {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + NOTION_TOKEN,
      'Notion-Version': '2022-06-28',
    },
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
  const up = String(currency).toUpperCase();
  const rate = FX_TO_JPY[up];
  return rate ? n * rate : n;
}

function _todayJST() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

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

function _ensureLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

// ── ONE-TIME SETUP ─────────────────────────────────────────
function setup() {
  // 1. Validate credentials
  if (GEMINI_KEY === 'PASTE_GEMINI_API_KEY_HERE') throw new Error('⛔ Fill in GEMINI_KEY above first');
  if (NOTION_TOKEN === 'PASTE_NOTION_INTEGRATION_TOKEN_HERE') throw new Error('⛔ Fill in NOTION_TOKEN above first');
  if (NOTION_DB === 'PASTE_NOTION_DATABASE_ID_HERE') throw new Error('⛔ Fill in NOTION_DB above first');

  // 2. Create labels
  _ensureLabel(INBOX_LABEL);
  _ensureLabel(DONE_LABEL);
  _ensureLabel(FAIL_LABEL);

  // 3. Remove duplicate triggers, create fresh one every 5 minutes
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'processExpenseEmails') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processExpenseEmails').timeBased().everyMinutes(5).create();

  // 4. Test Notion connection
  const dbResp = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + NOTION_DB, {
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN, 'Notion-Version': '2022-06-28' },
    muteHttpExceptions: true,
  });
  if (dbResp.getResponseCode() !== 200) {
    throw new Error('❌ Notion connection failed: ' + dbResp.getContentText().slice(0, 300));
  }

  const email = Session.getActiveUser().getEmail();
  const alias = email.replace('@', '+expense@');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Setup complete!');
  console.log('');
  console.log('📬 Forward expense emails to:');
  console.log('   ' + alias);
  console.log('');
  console.log('🏷  Or add label "' + INBOX_LABEL + '" manually to any email.');
  console.log('');
  console.log('⏱  Trigger: every 5 minutes');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return '✅ Setup complete. Forward emails to: ' + alias;
}

// Run this to test on a single email without waiting for trigger
function testNow() {
  processExpenseEmails();
}

// ── GEMINI PROMPT (mirrors the app's MULTI_BOOKING_PROMPT) ──
const MULTI_BOOKING_PROMPT = `你係一個專業旅遊預訂 email 解析 AI。分析以下內容（可能係 **一封或多封 email** 貼埋一齊），提取 **所有** 獨立消費項目。

⚠️ 極重要規則：

0. **支援多 email 拼接**：用戶可能將「機票 email + 酒店 email + Klook email」全部連續貼喺一齊。你要：
   - 逐個 email section 獨立分析
   - 將所有 email 嘅 bookings 集合返一個 bookings array

1. **一封 email 可以包含多筆消費**，每筆獨立返一個 object：
   - 來回機票 = **強制拆成 2 筆**：去程一筆 + 回程一筆，每筆 total 係 total ÷ 2
   - Klook/KKday 一次訂多個 activity → **每個 activity 一筆**
   - Agoda/Booking 多晚酒店 → **合併成一筆**（total = 全程總額）

2. **金額一律轉成日元 (JPY)**：
   - 1 HKD ≈ 20 JPY，1 USD ≈ 150 JPY，1 CNY ≈ 20 JPY，1 EUR ≈ 160 JPY
   - total 永遠係 JPY
   - original_currency + original_amount 記錄原幣

3. **日期係 service date（實際使用日）**：
   - 機票：起飛日期
   - 酒店：Check-in 日期
   - Activity：旅遊日

4. **缺失欄位返 null，唔好亂估**。

回覆嚴格 JSON（唔好加 markdown）：

{
  "source": "klook|kkday|agoda|booking|cathay|ana|jal|hkexpress|tripcom|other",
  "bookings": [
    {
      "store": "商戶名（繁中，簡短，例：國泰 CX564、Agoda 名古屋 XX Hotel、Klook 立山黑部）",
      "total": 總金額純數字 JPY,
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
- 機票/鐵路/Taxi/接送/火車證 → transport
- 酒店/民宿/Airbnb/溫泉旅館 → lodging
- Tour/Activity/門票/樂園 → ticket
- 餐廳訂座 → food
- eSIM/保險/Wi-Fi → other

如果完全無法解析，返 {"source":"other","bookings":[]}。`;
