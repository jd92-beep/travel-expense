# Scan Tab

DOM section: `#tab-scan` (line 492). Primary fn: `scanReceipt(file)` (line 4384).

## 1. Introduction

The data-entry surface. Six ways to record a spend, all funnelling into the same confirm-modal → `state.receipts.push` → optional Notion sync pipeline:

1. 📸 **Camera capture** — primary, opens `<input type="file" capture="environment">`.
2. 🖼️ **Gallery pick** — same OCR pipeline but no `capture` attr.
3. ⚡ **Email auto-sync** — pulls `⏳ `-prefixed pending entries from Notion that Apps Script pre-parsed.
4. 🎤 **Voice input** — Cantonese speech → text → LLM → structured receipt.
5. ✍️ **Manual** — direct form.
6. 💱 **Currency calculator** — utility (no receipt created).

Plus secondary surface for pasting email body text and copying the import Gmail address.

## 2. How to Use

- **Take a photo** — tap the big blue card. Camera opens. Snap. ~5–15 s spinner. Confirm modal appears with parsed JSON. Edit if wrong, hit save.
- **Pick from gallery** — green card. Same flow, no camera.
- **Retry the last scan** — tap the preview thumbnail (`#previewImg`) to re-open the confirm modal with `lastScanResult`. If the result was lost (e.g., navigation), it re-runs OCR via `runScanWithBase64`.
- **Voice input** — purple card. Hold to record (or browser Speech-Recognition API). Whisper-equivalent transcript fed to text-LLM with a 廣東話 parser prompt.
- **Email paste** — 📋 button under the green secondary panel. Paste body text, run AI parse, edit, save.
- **Copy import address** — 📮 copies `ftjdfr+expense@gmail.com` to clipboard.
- **Email auto-sync now** — red ⚡ card. Calls `notionPullAll` filtered to pending entries — useful if the user wants the 2-hour cron to fast-forward.

The blue card has a faint "scan ring" pulse (CSS `.scan-ring`) to draw the eye; flash overlay `triggerShutterFlash()` fires on capture.

## 3. UI Anatomy

| Element | ID | Purpose |
|---|---|---|
| Camera card (blue) | `#scanHeaderBtn` | Primary scan trigger (line 496) |
| Gallery card (green) | `#galleryBtn` | Photo-library pick (line 508) |
| Email-sync chip (red) | `#checkEmailNowBtn` | Pull pending entries now (line 516) |
| Email-sync spinner | `#checkEmailNowSpinner` | Spinning state during pull (line 519) |
| Email-sync arrow | `#checkEmailNowArrow` | Result indicator (line 520) |
| Currency calc (gold) | `#currencyCalcBtn` | Opens `currencyModal` (line 522) |
| Voice (purple) | `#voiceBtn` | Triggers `startVoiceInput()` (line 526) |
| Manual (cyan) | `#manualBtn` | Opens manual confirm-modal (line 530) |
| Camera input (hidden) | `#receiptInput` | `accept="image/*" capture="environment"` (line 536) |
| Gallery input (hidden) | `#galleryInput` | `accept="image/*"` (line 537) |
| Email paste row | `#emailImportBtn` | Opens email-import modal (line 542) |
| Copy Gmail row | `#copyGmailAddrBtn` | Clipboard copy (line 550) |
| Preview area | `#previewArea` | Hidden until first scan (line 561) |
| Preview image | `#previewImg` | Tap → `reopenLastScan()` (line 563) |
| Status line | `#scanStatus` | Spinner / success / error / fallback warning (line 564) |
| Scan progress modal | `#scanProgressModal` | Full-screen overlay (line ~elsewhere) |
| Confirm modal | `#confirmModal` | Where parsed receipt is reviewed |
| Currency modal | `#currencyModal` | HKD ⇄ destination converter |
| Voice modal | `#voiceModal` | Mic + transcript display |
| Email-import modal | `#emailModal` | Paste-and-parse |

## 4. Functions & Logic

| Function | Line | Role |
|---|---|---|
| `scanReceipt(file)` | 4384 | Entry point from `#receiptInput` / `#galleryInput` change events |
| `runScanWithBase64(base64, mime)` | 4424 | Stripped-down rerun (used by retry + reopen) |
| `_openScanProgress(subText)` / `_closeScanProgress()` | 4374 / 4380 | `#scanProgressModal` visibility |
| `triggerShutterFlash()` | search source | Fullscreen white flash overlay on capture |
| `prepareForOCR(rawBase64, mime)` | search source | Pre-resizes to MiniMax 2016 px max so server-side downscale doesn't blur thermal text |
| `fileToBase64(file)` | search source | FileReader → b64 |
| `callGemini(base64, mime)` | 6724 | Multi-provider router (MiniMax → GLM-4.6V → Gemini chain); logs attempts to `state.lastScanAttempts` |
| `callGeminiWithModel(base64, mime, model, key)` | 6693 | Gemini-only single-model call |
| `callGeminiMultimodal(prompt, images, model, key)` | 5833 | General Gemini vision wrapper |
| `_callVisionWithPrompt(...)` | 4576 | Generic prompt vision route used by "Add to Itinerary" |
| `normalizeScanResult(result)` | search source | Coerces fields, fills defaults, returns `{cleaned, warnings}` |
| `parseDateFallback(s)` | 6149 | Multi-locale date safety net (Reiwa/Heisei/Showa, ROC, Korean, Thai BE, English ordinals, Chinese 年月日) |
| `openConfirmModal(receipt, base64, warnings, usedModelId)` | search source | Confirm/edit modal |
| `retryLastScan()` | 4500 | Re-runs OCR with the same `lastScanBase64` |
| `reopenLastScan()` | 4506 | Re-opens confirm modal if cached |
| `showScanError(msg)` | 4470 | Renders failure state with collapsible per-model attempt log |
| `startVoiceInput()` | search source ~9454 | Voice flow entry |
| `startAddToItinerary()` | 4669 | "Add to Itinerary" button on confirm modal — uses `ITINERARY_EXTRACT_PROMPT` (line 5434) |
| `openCurrencyModal()` | search source | Standalone HKD ⇄ trip-currency calculator |
| Email-paste parse | search `pasteAndParseEmail` | Reads clipboard → text-only LLM call |
| `pullPendingPromptly` | search source | Filtered `notionPullAll` for `⏳ ` prefix entries |

Race guard: `_scanInFlight` (line 4423) blocks re-entry. iOS sometimes double-fires the `change` event; without this the second scan would clobber `lastScanBase64` mid-flight.

## 5. Button → Function Map

| Trigger | Selector | Handler | Effect |
|---|---|---|---|
| Camera card | `#scanHeaderBtn` | `→ $('receiptInput').click()` (line 9381) | Opens native camera |
| `#receiptInput` change | — | `scanReceipt(file)` | OCR pipeline |
| Gallery card | `#galleryBtn` | `→ $('galleryInput').click()` (line 9382) | Photo picker |
| `#galleryInput` change | — | `scanReceipt(file)` | Same pipeline |
| Email-sync chip | `#checkEmailNowBtn` | inline async block (line 9392) | Spinner → `notionPullAll(true)` filtered → toast |
| Currency calc | `#currencyCalcBtn` | `openCurrencyModal()` (line 9383) | Modal |
| Voice | `#voiceBtn` | `startVoiceInput` (line 9454) | Mic capture |
| Manual | `#manualBtn` | inline → `openConfirmModal({}, '')` | Empty confirm modal |
| Email-paste row | `#emailImportBtn` | inline → opens email modal | Paste-and-parse |
| Copy Gmail addr | `#copyGmailAddrBtn` | inline (line 9436) | `navigator.clipboard.writeText('ftjdfr+expense@gmail.com')` + toast |
| Preview thumbnail | `#previewImg` | inline `onclick="reopenLastScan()"` | Re-open confirm modal or re-run scan |
| Scan progress modal | `#scanProgressModal` | — | Display-only |

## 6. LLM Models Used

The scan tab is the heaviest LLM consumer in the app.

### Receipt OCR (camera + gallery + retry)
- **Router**: `callGemini(base64, mime)` line 6724.
- **Prompt**: `GEMINI_PROMPT` line 5091 — strict-JSON contract, two red lines (preserve Japanese原文; `total` = bottom 合計 line, not subtotal/tendered/change), 11 parsing rules including currency→country mapping for ambiguous dates.
- **Default chain** (configured per `state.scanModel`, line 1772):
  1. **MiniMax VLM** (`api.minimax.io/v1/coding_plan/vlm`, model = MiniMax's VLM endpoint) — fastest, default primary.
  2. **GLM-4.6V** (`open.bigmodel.cn/api/paas/v4/chat/completions`, `model: glm-4.6v`).
  3. **Gemini 3.1 Flash Lite** (`gemini-3.1-flash-lite-preview`).
  4. **Gemini 3 Flash** (`gemini-3-flash-preview`).
  5. **Gemini 2.5 Flash** (`gemini-2.5-flash`).
- Each Gemini model rotates through up to 5 keys via `getGeminiKeys(userKey)` (line 1707).
- **Endpoint** (Gemini): `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}` with `generationConfig.responseMimeType = "application/json"` and `temperature: 0.1`.
- **Configured in**: Settings → 📸 收據掃描模型 (`#scanModelCards`, render fn `renderScanModelCards` line 2404). Writes to `state.scanModel`.
- **Per-model attempt log**: `state.lastScanAttempts[]` populated by `callGemini` so `showScanError` can surface why each model failed (HTTP status, latency, error string).
- **Fallback transparency**: `state.lastScanFellBack = {chose, used, firstErr}` makes the confirm modal say "你揀嘅 X 失敗咗 — fallback 用咗 Y" (line 4446).

### Voice → structured receipt
- **Models** (`VOICE_MODELS` line 1598): MiniMax → GLM-4-Flash → Elephant Alpha (OpenRouter) → Gemini 3.1 Flash → Gemini 3 Flash → Gemini 2.5 Flash → Gemma 4 31B/26B.
- Selected via `state.voiceModel`. Configured at Settings → 🎤 語音解析模型 (`renderVoiceModelCards` line 2419).
- Prompt: Cantonese-aware structured-extraction template (search `VOICE_PROMPT`).

### Email paste-parse
- **Models** (`EMAIL_MODELS` line 1616): GLM-5.1 → GLM-5 → GLM-5-turbo → OpenRouter → MiniMax → Gemini ×5 → Gemma → GLM-4-Flash.
- Selected via `state.emailModel`. Configured at Settings → 📧 Email 解析模型 (`renderEmailModelCards` line 2426).
- Text-only call (no image).

### "Add to Itinerary" path
- Uses `_callVisionWithPrompt(...)` with `ITINERARY_EXTRACT_PROMPT` (line 5434). Same provider chain as receipt OCR but prompt asks for itinerary spots, not receipt fields.

## 7. State Fields Touched

Read:

- `state.scanModel`, `state.voiceModel`, `state.emailModel`
- `state.apiKey` (Gemini), `state.zaiKey` (GLM), `state.minimaxKey`, `state.openrouterKey`
- Vault-decrypted keys: `VAULT_ZAI_KEY`, `VAULT_MINIMAX_KEY`, `DEFAULT_API_KEY`, `DEFAULT_MINIMAX_KEY`

Written (during scan):

- `lastScanBase64`, `lastScanMime`, `lastScanResult`, `lastScanWarnings` (module-scoped, not in `state`)
- `state.lastScanModel`, `state.lastScanAttempts`, `state.lastScanFellBack`

Written on save (in confirm modal, not the tab itself):

- `state.receipts.push(...)` then `saveState()`
- `state.lastUsedRegion` (auto-fill helper)

## 8. Sync Behavior

- **On receipt save** (from confirm modal): `notionPushReceipt(r)` (line 7139) is called if `state.autoSync && state.notionToken && state.notionDb`.
- **Pending pull**: `#checkEmailNowBtn` calls `notionPullAll(true)` to fast-forward Apps Script imports — useful when the 2-hour cron hasn't fired yet.
- **No autoSync = local only** until the user hits "⬆️ 推送" in Settings (`notionPushAll`).

## 9. Configuration & Customization

User-tunable (Settings):

- 🤖 AI 模型 → 📸 / 🎤 / 📧 model picker (cards) → `state.scanModel` / `state.voiceModel` / `state.emailModel`
- 🔑 API Keys → Gemini / GLM / MiniMax / OpenRouter → `state.apiKey` / `.zaiKey` / `.minimaxKey` / `.openrouterKey`
- (No vault key) → falls back to bundled vault keys (line 1736 `unlockVault`)

Internal constants:

- `GEMINI_PROMPT` — line 5091
- `ITINERARY_EXTRACT_PROMPT` — line 5434
- `SCAN_MODELS` — line 1588
- `VOICE_MODELS` — line 1598
- `EMAIL_MODELS` — line 1616
- `RESCAN_MODELS` — search source (subset surfaced in confirm modal)
- `OPENROUTER_URL`, `OPENROUTER_MODEL` — line 1716
- `APPS_SCRIPT_URL` — line 1712 (Gmail-side parser deployment)

## 10. Edge Cases & Known Limitations

- **No keys at all** → `_callVisionWithPrompt` (line 4660) checks Gemini/MiniMax/GLM availability and surfaces a hint: "所有 AI 模型都冇 key — 請解鎖 vault 或喺設定填 Gemini API Key".
- **All providers fail** → `showScanError` renders the per-model attempt log (collapsible `<details>` ⮕ HTTP status, ms, message). User can retry or fall back to manual entry.
- **iOS double-fire** → `_scanInFlight` blocks the second invocation; first scan's progress modal stays open until OCR resolves.
- **Image > MiniMax max** → `prepareForOCR` resizes to 2016 px before upload (line 4411).
- **Wrong year on Heisei/Reiwa receipt** → `parseDateFallback` (line 6149) is the safety net; the prompt also tells the LLM to convert era dates.
- **Photo lost mid-flight** → `lastScanBase64` survives until next scan; tap thumbnail to re-open.
- **Voice in noisy env** → falls through model chain; if all fail, surfaces "解析失敗" toast.
- **Email-paste extremely long** → text-LLM input trimmed by Apps Script side; client-side does not trim — risk of 413.

## 11. Technical Notes

- **`GEMINI_PROMPT` red-line design** — two non-negotiable rules (preserve Japanese原文; total ≠ subtotal/tendered/change) front-loaded, then 11 numbered parsing rules. The prompt also enforces港式廣東話 vocabulary (吉列雞扒 not 炸雞排, 薯仔 not 土豆, etc.) for `items[i].name` while keeping `items[i].name_jp` 100% original.
- **`parseDateFallback`** (line 6149) handles Reiwa (令和), Heisei (平成), Showa (昭和), short-form era abbrevs (R8 / H31 / S64), ROC (民國), Korean (년월일), Thai BE (พ.ศ.), Chinese 年月日, English ordinals — anything the prompt missed gets caught here.
- **Race-condition guard** — see line 4385–4392 comment block: rapid double-tap or iOS phantom `change` event would have caused photo-B's image with photo-A's parsed JSON. `_scanInFlight` is the only fix that's bulletproof against the JS-level event source.
- **Per-model attempt log** — `state.lastScanAttempts` is populated inside `callGemini` so `showScanError` can render a collapsible diagnostic block. Crucial on mobile PWA where DevTools is unreachable.
- **Pre-resize before OCR** — MiniMax server-side downscales above 2016 px, blurring thermal-paper text. `prepareForOCR` does the resize client-side at high-quality JPEG so OCR sees crisp glyphs.
- **Receipt schema** — saved object includes `splitMode: 'shared'|'private'`, `personId`, `beneficiaryId` (for 🎁 代付). Set in confirm modal, consumed by Stats `computeSettlements` (line 3849).
