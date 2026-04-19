import type { Category, Payment, ReceiptItem, ScanResult } from './types';
import { DEFAULT_SCAN_MODEL, GEMINI_VISION_MODELS } from './constants';
import { todayHK } from './itinerary';

// Full Gemini prompt (copied verbatim from legacy).
// Two red lines: (1) preserve Japanese original text, (2) TOTAL = 合計 line only.
const GEMINI_PROMPT = `你係一個專業日本收據辨識 AI。仔細睇收據圖片，抽結構化資料。**只回覆嚴格 JSON，唔好加任何文字、解釋、prefix、或 markdown fence（例如 \`\`\`json）**。唔好重複、唔好補充、唔好諗 step-by-step — 直接出 JSON。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ **兩條紅線（違反即完全錯）**：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**紅線 1 — 日文原文絕對保留，唔准翻譯成中文**
店名と品項は必ず領収書の原文（漢字・カタカナ・ひらがな）をそのままコピーせよ。中国語に翻訳・変換するな。
- ❌ 「ローソン」→ "罗森" / "羅森" / "Lawson"（錯）
- ✅ 「ローソン」→ store: "ローソン"
- 唯一例外：items[i].name 欄位用繁體中文意譯（方便 Boss 睇），但 items[i].name_jp **100% 保留日文原文**

**紅線 2 — TOTAL 係收據最底最終嗰個「合計」嘅銀碼**
- ✅ 合計 / お会計 / ご請求額 / TOTAL = TOTAL
- ❌ 小計 / Subtotal：稅前數，**唔係 TOTAL**
- ❌ お預かり / Cash Tendered：顧客俾嘅錢，**唔係 TOTAL**
- ❌ お釣り / Change：找零，**唔係 TOTAL**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 **JSON Schema**：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`json
{
  "store": "店名（原文，簡短）",
  "total": 最終應付金額（純數字 integer，JPY）,
  "subtotal": 稅前小計（數字或 null）,
  "tax": 消費税（數字或 null）,
  "date": "YYYY-MM-DD",
  "time": "HH:MM 或 null",
  "address": "住所原文 或 null",
  "booking_ref": "單據號 或 null",
  "category": "transport|food|shopping|lodging|ticket|localtour|medicine|other",
  "payment": "cash|credit|paypay|suica 或 null",
  "items": [{ "name": "繁體中文意譯", "name_jp": "日文原文", "price": 數字 }],
  "note": "卡尾四碼 / 優惠 / 稅率 等，或 null",
  "confidence": "high|medium|low"
}
\`\`\`

規則：
1. 金額純整數，無「円」、無逗號。¥1,800 → 1800。
2. 日期 YYYY-MM-DD (令和 7年 4月 25日 → 2025-04-25)。
3. 品項盡量抽，每個 item 一行。長收據抽頭 10 行就夠。
4. category 根據 dominant item 判斷（便利店 = food, 藥妝 = shopping, 酒店 = lodging, 新幹線 = transport, 博物館門票 = ticket）。
5. confidence: high = 全部欄位清晰可見; medium = 大部分清晰; low = 模糊/部分推測。
6. 全數字欄位（total / subtotal / tax）缺失填 null，**唔准自己計**。
7. date 缺失用今日 HKT 日期：${todayHK()}。
8. 如果圖片完全唔係收據，返 { "error": "not_a_receipt", "confidence": "low" }。
9. 唔准加 markdown fence。
10. 唔准加其他 root fields。
11. JSON 必須 parse-able。`;

// Gemini structured-output schema — required by the responseSchema param.
const GEMINI_SCAN_SCHEMA = {
  type: 'object',
  properties: {
    store: { type: 'string' },
    total: { type: 'number', nullable: true },
    subtotal: { type: 'number', nullable: true },
    tax: { type: 'number', nullable: true },
    date: { type: 'string' },
    time: { type: 'string', nullable: true },
    address: { type: 'string', nullable: true },
    booking_ref: { type: 'string', nullable: true },
    category: {
      type: 'string',
      enum: ['transport', 'food', 'shopping', 'lodging', 'ticket', 'localtour', 'medicine', 'other'],
    },
    payment: { type: 'string', nullable: true },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          name_jp: { type: 'string' },
          price: { type: 'number' },
        },
      },
    },
    note: { type: 'string', nullable: true },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['store', 'category'],
};

interface CallOpts {
  base64: string;
  mime: string;
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(id),
  );
}

async function callGeminiOnce({
  base64,
  mime,
  apiKey,
  model = DEFAULT_SCAN_MODEL,
  timeoutMs = 90_000,
}: CallOpts): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const r = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: GEMINI_PROMPT },
              { inline_data: { mime_type: mime, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.15,
          responseMimeType: 'application/json',
          responseSchema: GEMINI_SCAN_SCHEMA,
        },
      }),
    },
    timeoutMs,
  );
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Gemini ${r.status}: ${body.slice(0, 180)}`);
  }
  const data = await r.json();
  const cand = data?.candidates?.[0];
  if (!cand) throw new Error('Gemini: no candidates (possibly blocked)');
  const reason = cand.finishReason;
  if (['SAFETY', 'BLOCKED', 'PROHIBITED_CONTENT', 'RECITATION'].includes(reason)) {
    throw new Error('Gemini: blocked by safety filter (' + reason + ')');
  }
  const text = cand.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini: empty response');
  return text;
}

/** Scan a receipt image through Gemini with fallback across vision models. */
export async function scanReceipt(
  base64: string,
  mime: string,
  apiKey: string,
  preferredModel?: string,
): Promise<{ result: ScanResult; modelUsed: string }> {
  if (!apiKey) throw new Error('未設定 Gemini API Key — 去設定解鎖 Vault 或輸入 key');
  const validIds = new Set(GEMINI_VISION_MODELS.map((m) => m.id));
  // Force valid Gemini model. Legacy 'minimax' / 'glm-*' 404 on Gemini endpoint
  // and silently eat ~2s before the fallback fires, which looks like a hang.
  const first =
    preferredModel && validIds.has(preferredModel) ? preferredModel : DEFAULT_SCAN_MODEL;
  const chain = [first, ...GEMINI_VISION_MODELS.map((m) => m.id).filter((id) => id !== first)];
  console.info('[scan] chain:', chain, 'mime:', mime, 'keyPrefix:', apiKey.slice(0, 10) + '…');
  let lastErr: Error | null = null;
  for (const model of chain) {
    try {
      const raw = await callGeminiOnce({ base64, mime, apiKey, model });
      const parsed = JSON.parse(raw) as ScanResult & { error?: string };
      if (parsed.error === 'not_a_receipt') throw new Error('唔似係收據');
      console.info('[scan] ✅', model);
      return { result: normalizeScan(parsed), modelUsed: model };
    } catch (e) {
      lastErr = e as Error;
      console.warn(`[scan] ❌ ${model}:`, lastErr.message);
      if (/blocked by safety|not_a_receipt|唔似係收據/.test(lastErr.message)) throw lastErr;
    }
  }
  throw lastErr || new Error('所有 Gemini 模型都失敗');
}

function normalizeScan(r: ScanResult): ScanResult {
  const validCats: Category[] = [
    'transport', 'food', 'shopping', 'lodging', 'ticket', 'localtour', 'medicine', 'other',
  ];
  const validPays: Payment[] = ['cash', 'credit', 'paypay', 'suica'];
  const cat: Category = validCats.includes(r.category) ? r.category : 'other';
  const pay = r.payment && validPays.includes(r.payment as Payment)
    ? (r.payment as Payment)
    : null;
  return {
    store: r.store || '未命名',
    total: typeof r.total === 'number' ? Math.round(r.total) : null,
    subtotal: typeof r.subtotal === 'number' ? Math.round(r.subtotal) : null,
    tax: typeof r.tax === 'number' ? Math.round(r.tax) : null,
    date: r.date || todayHK(),
    time: r.time || null,
    address: r.address || null,
    booking_ref: r.booking_ref || null,
    category: cat,
    payment: pay,
    items: Array.isArray(r.items) ? r.items.slice(0, 20) as ReceiptItem[] : [],
    note: r.note || null,
    confidence: r.confidence || 'medium',
  };
}

/** File → base64 (no data-URL prefix). */
export async function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('讀取檔案失敗'));
    reader.onload = () => {
      const result = reader.result as string;
      const [header, data] = result.split(',');
      const mimeMatch = /data:([^;]+)/.exec(header);
      resolve({ base64: data, mime: mimeMatch?.[1] || file.type || 'image/jpeg' });
    };
    reader.readAsDataURL(file);
  });
}

/** Downscale the image to max 2016px on the long edge to prevent server-side re-compression. */
export async function prepareForOCR(
  base64: string,
  mime: string,
): Promise<{ base64: string; mime: string }> {
  if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mime)) return { base64, mime };
  const img = new Image();
  img.src = `data:${mime};base64,${base64}`;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('圖片載入失敗'));
  });
  const max = 2016;
  let { width: w, height: h } = img;
  if (w <= max && h <= max) return { base64, mime };
  const scale = max / Math.max(w, h);
  w = Math.round(w * scale);
  h = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { base64, mime };
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  return { base64: dataUrl.split(',')[1], mime: 'image/jpeg' };
}
