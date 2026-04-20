import type { GeminiScanResult } from './types';

const GEMINI_PROMPT = `你係一個專業日本收據辨識 AI。請分析這張收據圖片並以 JSON 格式回傳以下資訊：
{
  "store": "店名（日文或中文）",
  "total": 金額數字（日圓，整數，不含¥符號）,
  "date": "日期 YYYY-MM-DD 格式",
  "time": "時間 HH:MM 格式（如有）",
  "category": "類別（transport/food/shopping/lodging/ticket/medicine/other 之一）",
  "payment": "支付方式（cash/credit/paypay/suica 之一）",
  "items": "品項列表，每行格式：品名 ¥金額",
  "tax": 稅額數字（如有，整數）,
  "note": "備註（如有優惠/折扣等）",
  "region": "地區（名古屋/高山/白川郷/立山/金澤/上高地/常滑 等）"
}
類別判斷規則：
- 電車/巴士/的士/機場 → transport
- 餐廳/食物/飲料/便利店食品 → food
- 購物/藥妝/紀念品/服裝 → shopping
- 酒店/住宿 → lodging
- 景點/博物館/門票 → ticket
- 藥局/醫院 → medicine
- 其他 → other
支付方式若看不清楚，預設為 cash。
請只回傳 JSON，不要有其他文字。`;

export async function scanWithGemini(
  base64: string,
  mime: string,
  apiKey: string,
  model: string,
): Promise<GeminiScanResult> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        parts: [
          { text: GEMINI_PROMPT },
          { inline_data: { mime_type: mime, data: base64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  try {
    return JSON.parse(text) as GeminiScanResult;
  } catch {
    throw new Error('Failed to parse Gemini response as JSON');
  }
}

export function imageToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(',');
      const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
      resolve({ base64, mime });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
