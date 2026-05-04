# Settings Tab

DOM section: `#tab-settings` (line 675). The biggest tab — six grouped sections (A–F) covering trip config, split-bill, AI models, sync, help, and data management.

## 1. Introduction

The control panel. Every persistent preference, key, ratio, and integration toggle lives here. It's also the home of the **分帳結算 (settlement)** live panel — the same N-person ledger that Stats renders, but updated continuously while the panel is open.

Audience: Boss (Tony) when he wants to add 欣欣 as a travel companion, change the split ratio, swap the receipt-OCR primary model, configure Notion sync, or wipe local data. Many sub-sections are collapsed `<details>` by default to keep the surface scannable.

## 2. How to Use

- **Save settings** — every section commits via the bottom `💾 儲存設定` button (or per-card "💾 儲存預算"). Some toggles auto-save on `change` (autoSync, stats toggles, TOP 10 mirror).
- **Add 欣欣** — § B → 旅伴管理 → `+ 新增旅伴` → name + emoji → 確認.
- **Change split ratio** — § B → 分帳比例 → enter % per person.
- **Open settlement** — § B → 💸 分帳結算 → expand → live X→Y¥N transfer list.
- **Switch primary scan model** — § C → 📸 收據掃描模型 → tap a card.
- **Configure Notion** — § D → 📓 Notion 雲端備份 → fill token + DB ID, hit 🔌 測試.
- **Email auto-import** — § D → 📧 → use the trigger-frequency info card; manual fast-forward via 📬 即時同步.
- **Export CSV** — § F → 📤 匯出 CSV (UTF-8 BOM, opens in Excel cleanly).
- **Reset everything** — § F → 🗑️ 清除全部 (confirms first; clears `localStorage`).

## 3. UI Anatomy

### § A — Trip config
| Element | ID | Purpose |
|---|---|---|
| Trip name | `#setTripName` | Free text (line 690) |
| Trip start | `#setTripStart` | `<input type="date">` (line 695) |
| Trip end | `#setTripEnd` | (line 699) |
| Itinerary export | `#itiExportBtn` | Download `state.customItinerary` as JSON (line 704) |
| Itinerary import | `#itiImportBtn` → `#itiFileInput` | Upload JSON (line 705) |
| Itinerary reset | `#itiResetBtn` | Restore built-in `ITINERARY` (line 706) |
| Status line | `#itiStatus` | (line 709) |
| Budget save | `#saveBudgetBtn` | Per-card save with Notion push (line 716) |
| Budget HKD | `#setBudgetHKDInput` | HKD anchor input (line 719) |
| Budget JPY | `#setBudget` | Derived JPY (line 723) |
| Stats toggle | `#toggleStatsTransportLodging` | Flips total / daily defaults (line 744) |
| Stats track / thumb | `#toggleStatsTrack` / `#toggleStatsThumb` | Visual (lines 745–746) |
| Stats hint | `#statsToggleHint` | Live status string (line 749) |
| Live rate | `#setRate` | HKD per 100 JPY (line 760) |
| Trip currency | `#setTripCurrency` | Destination currency (line 765) |
| Refresh rate | `#refreshRateBtn` | `fetchLiveRate()` (line 779) |
| Rate reverse text | `#rateReverse` | "1 HKD ≈ X JPY" (line 781) |

### § B — Persons & split
| Element | ID | Purpose |
|---|---|---|
| Add-person button | `#addPersonBtn` | Toggles `#addPersonForm` (line 798) |
| Person list | `#personList` | Built by `renderPersonList()` (line 800) |
| Add-person form | `#addPersonForm` | (line 801) |
| Name input | `#newPersonName` | (line 802) |
| Emoji picker | `#emojiPicker` | (line 803) |
| Confirm/cancel | `#confirmAddPerson` / `#cancelAddPerson` | (lines 805–806) |
| Share ratios wrap | `#shareRatiosWrap` | Built by `window.renderShareRatios()` (line 851) |
| Settlement details | `#settleDetails` | Collapsible (line 859) |
| Settlement badge | `#settleSummaryBadge` | Compact summary (line 863) |
| Settlement panel | `#settlePanel` | Built by `window.renderSettlePanel()` (line 869) |
| Explainer card | inline | 3 mini-cards: 👫 Shared / 🔒 私人 / 🎁 代付 (lines 821–849) |

### § C — AI models
| Element | ID | Purpose |
|---|---|---|
| Scan models wrap | `#scanModelCards` | Built by `renderScanModelCards()` line 2404 |
| Last-scan badge | `#lastScanBadge` | "✅ 用咗 X" pill (line 883) |
| Voice models wrap | `#voiceModelCards` | `renderVoiceModelCards()` line 2419 |
| Email models wrap | `#emailModelCards` | `renderEmailModelCards()` line 2426 |
| Last-email badge | `#lastEmailBadge` | (line 908) |
| Gemini key | `#setGeminiKey` | (line 931) |
| GLM/ZAI key | `#setZaiKey` | (line 936) |
| MiniMax key | `#setMinimaxKey` | (line 941) |
| OpenRouter key | `#setOpenrouterKey` | (line 945) |
| Key status line | `#keyStatusLine` | Live ✅/❌ readout (line 947) |

### § D — Automation & sync
| Element | ID | Purpose |
|---|---|---|
| Pull pending now | `#pullPendingBtn` | Apps Script fast-forward (line 991) |
| Email-import status | `#emailImportStatus` | (line 992) |
| Auto-sync toggle | `#setAutoSync` | (line 1008) |
| Push all | `#syncPushBtn` | `notionPushAll` (line 1013) |
| Pull all | `#syncPullBtn` | `notionPullAll` (line 1014) |
| Test connection | `#notionTestBtn` | (line 1015) |
| Schema migrate | `#notionMigrateBtn` | "美化 Notion Schema (加 emoji)" (line 1017) |
| Notion status | `#notionStatus` | (line 1018) |

### § E — Help
| Element | ID | Purpose |
|---|---|---|
| Copy iOS Shortcut URL | `#copyShortcutUrlBtn` | (line 1064) |

### § F — Data management
| Element | ID | Purpose |
|---|---|---|
| Save settings | `#saveSettings` | Master save (line 1078) |
| Export CSV | `#exportBtn` | `exportCSV()` line 8889 |
| Reset all | `#resetBtn` | Confirm → wipe localStorage |
| Lock device | `#lockDeviceBtn` | Hidden unless vault is unlocked; clears device trust (line 1085) |
| Build version | inline | `APP BUILD v47` (line 1093) |

## 4. Functions & Logic

| Function | Line | Role |
|---|---|---|
| `init()` | 8927 | Master init — wires all listeners |
| `refresh()` | 8919 | Re-renders all visible tabs |
| `_renderKeyStatus()` | local in init | Builds the ✅/❌ readout |
| `_applyStatsToggleUI(checked)` | ~8941 | Mirrors stats-toggle state to track + thumb + hint string |
| `renderPersonList()` | 2240 | Person rows with edit/delete |
| `window.renderShareRatios` | 9188 | Per-person % inputs; auto-sums to 100 |
| `window.renderSettlePanel` | 9248 | Live settlement DOM (uses `computeSettlements` line 3849) |
| `renderScanModelCards()` | 2404 | Pickable scan-model cards |
| `renderVoiceModelCards()` | 2419 | Pickable voice cards |
| `renderEmailModelCards()` | 2426 | Pickable email cards |
| `renderModelCards()` | 2440 | Wrapper running all three |
| `runModelTest(id, rerender)` | search source | Pings the model with a dry call |
| `exportCSV()` | 8889 | UTF-8 BOM + 10-column CSV |
| `notionPushAll()` | 7309 | Push every receipt |
| `notionPullAll(silent)` | 7531 | Pull every receipt |
| `notionPushSettings()` | 7446 | Push meta-row (budget/rate/persons/etc.) |
| `notionPushSettingsIfReady()` | 7492 | Debounced settings push |
| `notionPushSettingsNow()` | 7503 | Force settings push |
| `notionEnsureSchema()` | 6876 | Add missing properties to DB |
| `notionMigrateSchema()` | search source | Renames property names with emoji |
| `unlockVault(password)` | 1736 | AES-256-GCM decrypt of bundled keys |
| `refreshSettingsInputsFromState()` | search source | Re-syncs inputs after Notion pull |
| `fetchLiveRate()` | search source | Visa-then-er-api fallback chain |
| `pullPending` handler | 9333 | Trigger Apps Script fast-forward |
| `_renderKeyStatus` | 9123 (in init) | Live ✅/❌ key tags |

Save flow (`#saveSettings`, line 9036):
1. Clamp rate to `[2.0, 10.0]` HKD-per-100-JPY; fall back to `4.91`.
2. Convert HKD anchor → canonical JPY budget.
3. Read `setAutoSync`.
4. For each key input: only overwrite `state.{apiKey,zaiKey,minimaxKey,openrouterKey}` if user typed something — empty input doesn't wipe vault key.
5. Read share-ratio inputs (`#ratio_${id}`).
6. `saveState()` → `notionPushSettingsNow()` → `refresh()`.
7. Clear key inputs (no plaintext visible after save).
8. `_renderKeyStatus()` to show ✅ / ❌.
9. Toast.

## 5. Button → Function Map

| Trigger | Selector | Handler | Effect |
|---|---|---|---|
| Save settings | `#saveSettings` | inline (9036) | See save flow above |
| Save budget | `#saveBudgetBtn` | inline | Same as save, but only budget+rate; explicit Notion push |
| Trip name/dates | `#setTripName` / `#setTripStart` / `#setTripEnd` | `change` listeners | Updates `state.tripDateRange`; pushes settings |
| Itinerary export | `#itiExportBtn` | inline | JSON download |
| Itinerary import | `#itiImportBtn` → `#itiFileInput` | `change` | Validates + replaces `state.customItinerary` |
| Itinerary reset | `#itiResetBtn` | inline | Clears `state.customItinerary` |
| Stats toggle | `#toggleStatsTransportLodging` | line 8951 | Updates `state.statsIncludeTransportLodging`; saves; pushes; renders Dashboard |
| Trip currency | `#setTripCurrency` | `change` | Updates `state.tripCurrency`; triggers rate refresh |
| Refresh rate | `#refreshRateBtn` | inline | `fetchLiveRate()` |
| Add person | `#addPersonBtn` | inline | Toggles add-person form |
| Confirm add | `#confirmAddPerson` | inline | Pushes new person; recomputes ratios |
| Cancel add | `#cancelAddPerson` | inline | Hides form |
| Settlement open | `#settleDetails` `<summary>` | `toggle` listener (~9234) | Re-runs `renderSettlePanel()` on open |
| Scan-model card tap | `#scanModelCards` child | inline (~2461) | Sets `state.scanModel`, re-renders |
| Voice-model card tap | `#voiceModelCards` child | inline (~2469) | Sets `state.voiceModel` |
| Email-model card tap | `#emailModelCards` child | inline (~2479) | Sets `state.emailModel` |
| Pull pending | `#pullPendingBtn` | line 9333 | `notionPullAll(true)` filtered |
| Push all | `#syncPushBtn` | line 9318 | `notionPushAll` |
| Pull all | `#syncPullBtn` | line 9319 | `notionPullAll` |
| Notion test | `#notionTestBtn` | line 9350 | Round-trip GET on DB id |
| Notion migrate | `#notionMigrateBtn` | line 9320 | Adds emoji to property names |
| Auto-sync | `#setAutoSync` | `change` | Updates `state.autoSync` |
| Copy Shortcut URL | `#copyShortcutUrlBtn` | line 9126 | Clipboard copy |
| Lock device | `#lockDeviceBtn` | inline | Removes device-trust flag (re-prompt password next boot) |
| Export CSV | `#exportBtn` | `exportCSV()` | Downloads CSV |
| Reset all | `#resetBtn` | inline confirm → `localStorage.clear()` + reload |

## 6. LLM Models Used

This tab does not invoke LLMs *itself*. It is the **configuration surface** that selects which model the Scan / Voice / Email tabs use:

- **Scan model picker** writes `state.scanModel` (consumed by `callGemini` line 6724). Models from `SCAN_MODELS` line 1588.
- **Voice model picker** writes `state.voiceModel`. Models from `VOICE_MODELS` line 1598.
- **Email model picker** writes `state.emailModel`. Models from `EMAIL_MODELS` line 1616.
- **Notion test / migrate** are HTTP-only, no LLM.
- **`runModelTest(id, rerender)`** — sends a tiny dry call to the picked model to verify auth + reachability; result rendered as ✅ / ⚠️ on the card.

The 🔑 API Keys panel is where Boss can override vault keys with his own (Gemini / GLM / MiniMax / OpenRouter). Keys clear from the input on save (so plaintext isn't visible), but persist in `state` and `localStorage`.

## 7. State Fields Touched

Read & written:

- `state.budget`, `state.rate`, `state.tripCurrency`, `state.tripDateRange`
- `state.persons[]`, `state.shareRatios{}`
- `state.scanModel`, `state.voiceModel`, `state.emailModel`
- `state.apiKey`, `state.zaiKey`, `state.minimaxKey`, `state.openrouterKey`
- `state.notionToken`, `state.notionDb`, `state.proxy`, `state.autoSync`
- `state.statsIncludeTransportLodging`, `state.top10IncludeBigItems`
- `state.customItinerary`, `state.itineraryOverrides{}`
- `state.lastScanModel`, `state.lastEmailModel` (badges)

Module-level:

- `VAULT_ZAI_KEY`, `VAULT_MINIMAX_KEY` — overwritten if user types own key

## 8. Sync Behavior

- **Auto-save toggles** (`#toggleStatsTransportLodging`, `#setAutoSync`, scan/voice/email model picks, TOP 10 mirror) fire `notionPushSettingsIfReady()` (debounced).
- **Master save** (`#saveSettings`) fires `notionPushSettingsNow()` (immediate).
- **Push all** writes every receipt; **Pull all** rewrites `state.receipts` from Notion.
- **Migrate schema** updates Notion DB property names; preserves data.
- **Test** is a read-only ping (no write).
- **Pending pull** runs `notionPullAll(true)` filtered to `⏳ ` entries.
- Settings meta-row schema: `state.budget`, `state.rate`, `state.tripDateRange`, `state.persons`, `state.shareRatios`, `state.scanModel`, etc. — see `notionPushSettings` line 7446.

## 9. Configuration & Customization

Internal constants worth knowing:

- `CATEGORIES` — line 1567
- `PAYMENTS` — line 1581
- `PERSON_EMOJIS` — line 1587
- `SCAN_MODELS` — line 1588
- `VOICE_MODELS` — line 1598
- `EMAIL_MODELS` — line 1616
- `ITINERARY` — line 1630
- `OPENROUTER_URL` / `OPENROUTER_MODEL` — line 1716
- `APPS_SCRIPT_URL` — raw GitHub copy of `email-to-notion.gs`, used by the Apps Script helper/editor, not by the email sync button
- `NOTION_VERSION` — `'2022-06-28'`

Default keys (when vault and user keys both empty):

- `DEFAULT_API_KEY` / `DEFAULT_OPENROUTER_KEY` — empty in public source
- `DEFAULT_MINIMAX_KEY` / `DEFAULT_ZAI_KEY` — may be build-injected for the Pages artifact; unreplaced placeholders are sanitized to empty by `cleanSecretValue`
- `DEFAULT_KIMI_KEY` — local `secrets.local.js` only. Kimi is deliberately not injected into public GitHub Pages HTML.

Vault keys: encrypted in HTML, decrypted by `unlockVault(password)` at boot.

## 10. Edge Cases & Known Limitations

- **Saving with all key inputs empty** — does NOT wipe state keys (intentional; lets vault keys remain authoritative).
- **HKD-JPY de-sync** — JPY input is editable but HKD is the canonical anchor; on save, JPY is recomputed from HKD × rate.
- **Rate clamp** — `[2.0, 10.0]` per 100 JPY; bad input → `4.91`.
- **Itinerary import malformed** — JSON parse error toasts; keeps existing.
- **Notion DB missing required column** — `notionEnsureSchema` adds it; if Integration lacks write permission → 401, surfaces in toast.
- **Notion Test 401** — usually means Integration not added to DB share.
- **CSV with no receipts** — toasts 未有紀錄可匯出.
- **Reset confirmation** — only one `confirm()`. No undo.
- **Lock device** — visible only if vault was unlocked; on tap removes the device-trust flag — next launch needs password again.
- **`refreshSettingsInputsFromState`** — fires after Notion pull (line 8816 + 8834) so a sync from another device updates the inputs without manual reload.

## 11. Technical Notes

- **3-card 分帳 explainer** (lines 821–849, added in commit `5d64465`) — three mini-cards spell out 👫 Shared / 🔒 私人 / 🎁 代付 in plain Cantonese with concrete ¥ examples. The closing line emphasises that the % ratio only affects 👫 Shared; private and cross-private settle directly between payer ↔ beneficiary regardless of ratio.
- **Receipt schema fields driving 分帳** — `splitMode: 'shared'|'private'`, `personId` (payer), `beneficiaryId` (only meaningful for `private`). `computeSettlements` (line 3849) is the truth-source for the math.
- **Live settlement panel** — `#settleDetails`'s `toggle` event runs `renderSettlePanel()` on each open (line ~9234), so receipts added since the last open are reflected.
- **HKD-anchor budget** — saving derives `state.budget = round(hkd * rate)`. This is the cross-device fix (`f4e4478`): previously the JPY value was canonical and rate changes would drift the displayed HKD value.
- **Key clear on save** — security UX. Keys persist in state/localStorage but the visible input clears so a screen-share doesn't leak plaintext.
- **Stats toggle dual flip** — toggle off (default): 總消費 ✅ includes flight/lodging, 今日/日均 ❌ excludes. Toggle on flips both. The hint string `#statsToggleHint` describes the *current* state, not what tapping will do.
- **Notion proxy** — `state.proxy` defaults to `notion-proxy.ftjdfr.workers.dev` (Cloudflare Worker, owned). Fallback was `corsproxy.io` (third-party, less ideal because Boss's token would route through them).
- **Vault unlock** — `unlockVault(password)` (line 1736) does AES-256-GCM decrypt; on success populates `VAULT_ZAI_KEY` and `VAULT_MINIMAX_KEY` so all sub-tabs immediately have keys without user input.
- **Idempotency guard in `init()`** (line 8929) — `gateAndInit` can call `init()` twice during auto-unlock; without the guard duplicate listeners and `setInterval`s would fire.

## 12. Detailed Function Responsibilities

| Function / helper | What it owns | Inputs | Outputs / side effects |
|---|---|---|---|
| `init()` | All listener wiring | DOM, loaded state | Idempotently binds buttons, inputs, tab nav, scan inputs, settings controls |
| `refreshSettingsInputsFromState()` | Settings DOM hydration | Current state after load/pull | Updates budget/rate/trip/date/key proxy controls without exposing plaintext keys |
| `saveSettings` handler | Master settings commit | Inputs across sections A-F | Writes state, clears key inputs, pushes settings meta row, refreshes visible tabs |
| `saveBudgetBtn` handler | Budget/rate quick save | HKD anchor, rate, trip currency | Updates `state.budget`/`state.rate`, pushes meta row |
| `fetchLiveRate(force)` | FX refresh | `state.tripCurrency`, Visa/Open-ER APIs | Updates rate/source/timestamp and UI labels |
| `renderPersonList()` | Traveler list | `state.persons` | Renders edit/remove rows; protects required persons |
| `renderShareRatios()` | Ratio editor | Persons + `state.shareRatios` | Normalizes display percentages and writes changes on input |
| `renderSettlePanel()` | Live settlement panel | `computeSettlements` snapshot | Shows transfers and summary badge inside Settings |
| `renderModelCards()` | Scan/voice/email pickers | Model arrays + selected ids + test status | Rebuilds model cards and last-used badges |
| `testModelConnection(id)` | Model auth/reachability test | Selected model id + relevant key/proxy | Tests GLM, MiniMax, OpenRouter, Kimi proxy, or Gemini branch |
| `notionTestBtn` handler | DB/schema test | Notion token/DB/proxy | Calls `notionEnsureSchema`, shows emoji/plain schema status |
| `notionMigrateSchema()` | Schema polish | Notion DB write permission | Adds/renames emoji property names and clears schema cache |
| `notionPushAll()` / `notionPullAll()` | Manual sync | Receipts + Notion config | Bulk push/pull; pull also refreshes Settings inputs |
| Itinerary import/export/reset handlers | Trip template reuse | JSON file or built-in `ITINERARY` | Validates custom itinerary, updates `window.CURRENT_ITINERARY`, syncs meta |
| `exportCSV()` | Local data export | `state.receipts` | Downloads UTF-8 BOM CSV for Excel |
| `resetBtn` handler | Local wipe | User confirmation | Clears localStorage and reloads; no undo |
| `lockDeviceBtn` handler | Vault trust reset | Device trust flag | Removes remembered unlock so next launch asks password |

### Security notes for Settings

- Empty key fields on save do not wipe existing saved/vault keys.
- Key inputs are cleared after save so screen sharing does not reveal plaintext.
- `notionToken` is not persisted in `boss-japan-tracker`; it must come from vault/session.
- Kimi key must not be placed in repo, workflow logs, docs, or deployed public HTML. Use local device Settings or gitignored `secrets.local.js`.
