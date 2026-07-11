import { callPreferredJson, coerceModelJson } from './ai';
import type { AppState } from './types';

// Hiragana (぀-ゟ), Katakana incl. phonetic extensions (゠-ヿ, ㇰ-ㇿ),
// Hangul syllables (가-힣). Han-only (Chinese-readable) or Latin-only strings must NOT match.
const FOREIGN_SCRIPT_RE = /[぀-ゟ゠-ヿㇰ-ㇿ가-힣]/;
const HAN_RE = /[一-鿿]/;

/** True iff `name` contains Hiragana/Katakana/Hangul — i.e. needs a Cantonese/Chinese translation. */
export function needsTranslation(name: string): boolean {
  return FOREIGN_SCRIPT_RE.test(String(name || ''));
}

/**
 * AI scan/voice prompts sometimes already inline a translation as "原文 (譯文)" / "原文（譯文）"
 * in the store string. If the trailing parenthesized segment is Han text that differs from the
 * original, split it out instead of asking the AI again.
 */
export function splitInlineTranslation(store: string): { original: string; translated: string } | null {
  const raw = String(store || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(.*?)\s*[(（]([^()（）]+)[)）]\s*$/);
  if (!match) return null;
  const original = match[1].trim();
  const translated = match[2].trim();
  if (!original || !translated) return null;
  if (!HAN_RE.test(translated)) return null;
  if (translated === original) return null;
  return { original, translated };
}

/**
 * One batched AI call translating a list of foreign-language shop names into their official
 * Chinese/English name (or a natural Cantonese translation as last resort). Never throws —
 * any failure resolves to `{}` so callers can silently fall back to showing originals only.
 */
export async function translateStoreNames(state: AppState, names: string[]): Promise<Record<string, string>> {
  const uniqueNames = Array.from(new Set(names.map((n) => String(n || '').trim()).filter(Boolean)));
  if (!uniqueNames.length) return {};

  const prompt = `你係一個店名翻譯 API。以下係一個 JSON 陣列，每個元素係一個店舖/商戶名稱（可能係日文、韓文等外語）：
${JSON.stringify(uniqueNames)}

對於陣列入面每一個名稱，判斷：
1. 如果呢個品牌有官方中文名（例如好多日本連鎖店都有官方中文譯名），用返個官方中文名。
2. 如果冇官方中文名，但有官方英文名，就用官方英文名。
3. 如果以上都冇，就提供一個自然、道地嘅廣東話（繁體中文）翻譯。

輸出規定：
- 只可以回覆一個 JSON object，key 係原本嘅名稱（同輸入陣列入面嘅字串完全一樣），value 係翻譯後嘅名稱。
- 陣列有幾多個名，object 就要有幾多個 key，唔可以缺少或者新增其他 key。
- 唔准有任何其他文字、解釋、markdown 或 code fence，只可以係純 JSON object。`;

  try {
    const raw = await callPreferredJson(state, prompt, 'trip');
    const parsed = coerceModelJson(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const name of uniqueNames) {
      const value = (parsed as Record<string, unknown>)[name];
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed || trimmed === name) continue;
      result[name] = trimmed;
    }
    return result;
  } catch {
    return {};
  }
}
