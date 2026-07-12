# CLAUDE.md

Guidance for Claude Code working in this repo.

> **Binding for all agents**: `AGENTS.md` → "Ground Rules For All Agents" (truth order, hard stops, definition of done, retry discipline). `HANDOVER.md` opens with **Current Open Items** — the only live to-do list; reconcile it every session.

# travel-expense

旅行記帳 web app。原本為 Boss (Tony) 嘅 2026-04 名古屋旅行訂造，而家已演化成**公開多用戶產品**：Supabase 多用戶 RLS、旅程共享、私人收據、Admin 後台。多 AI provider 掃收據 OCR / 語音 / Email 入帳。

---

## Repository Layout — READ FIRST

> ⚠️ 由「單一 `index.html`」演化成 **multi-app Vite/TS monorepo**。日常開發集中喺 **`app-compact/`**（現役部署版）；`app-react/` 只喺明確叫你郁先郁。

| 目錄 | package | port | 角色 |
|---|---|---|---|
| `app-compact/` | `travel-expense-compact` | 8903 | **主力 / 現役部署版**（`v0.13.1`），有 production-gate scripts + Capacitor Android shell |
| `app-react/` | `travel-expense-react-fresh` | 8902 | React 重寫版，最完整 smoke-test 套件 |
| `app-admin-kanban/` | `travel-expense-admin-kanban` | 8904 | Admin console（production `0.8.3` read-only；local RC `1.0.0-rc.1`）— **git push ≠ deploy**，production cutover 要 maintenance approval |
| `supabase/` | — | — | DB migrations（RLS、receipt-photo storage） |
| `workers/` | — | — | Cloudflare Workers（Notion / AI proxy） |
| `scripts/` | — | — | 共用 node scripts：`tab-parity.mjs`、`security-scan.mjs`、`verify-supabase-migrations.mjs`、`verify-shared-ledger-contract.mjs` |
| `index.html` | — | — | **Legacy** 單檔 app（CDN Tailwind + vanilla JS，~10k 行）— 已凍結，唔再係開發重心 |
| `app/`, `app3/` | — | 5173 | 其他 Vite 實驗變體 |

每個 React app 有自己嘅 `ARCHITECTURE.md` / `HANDOVER.md` / `DESIGN.md` — **改該 app 前先讀**。

## Commands

由對應 app 目錄行（例：`cd app-compact`）：

```sh
npm run dev            # vite（react=8902, compact=8903, admin=8904）
npm run build          # tsc -b && vite build
npm run typecheck      # tsc --noEmit
npm run smoke:<tab>    # 單個 playwright smoke（dashboard/history/stats/weather/privacy/six-person …）
npm run security:scan  # 靜態 secret/安全掃描
npm run db:rls:smoke   # Supabase RLS policy smoke
```

`app-compact` 額外有 production-gate：`npm run smoke:production-gate`（`:full` / `:deploy-live` 做 live 驗證）。

## Core Domain（跨 app 通用）

真源喺 `app-compact/src/lib/{types,domain,storage}.ts`；下面係語意，改邏輯前睇返 source。

**Receipt 分帳 / 私隱：**
- `splitMode: 'shared'` → 按 `shareRatios`（**百分比**，2 人各 50，尾位自動補足）攤分俾全部旅伴。
- `splitMode: 'private'`（冇 `beneficiaryId`）→ 付款人 100% 自付，唔入分帳。
- `splitMode: 'private'` + `beneficiaryId` → 受惠人全額還俾付款人（🎁 代付）。
- `visibility: 'trip' | 'private'`（default `trip`）→ `private` = **只有自己見到**，server-side RLS 執法、唔 sync 去旅伴或 Notion。**不變式**：只有 100% 自付、冇跨人代付嘅單先可以 `private`（`canBePrivateReceipt`）；隱藏單絕不可影響其他人結算。詳見 [[shared-trip-sync-architecture]]。

**其他：** Currency HKD 做 anchor、JPY 衍生儲存；FX 每小時自動拉。7 類別（交通/餐飲/購物/住宿/門票/藥品/其他）、4 支付（現金/信用卡/PayPay/Suica）。每種輸入用獨立 AI 模型 field（`scanModel` / `voiceModel` / `emailModel` / `model`）。

## Sync：Supabase = 真源，Notion = 鏡像

- **Shared trip** 經 `upsert_shared_trip_receipt` / `delete_shared_trip_receipt` RPC（owner-only edit + `version` 樂觀鎖）；client 唔 push Notion，改由 server 排 `receipt_sync_jobs` dual-write。Personal trip 用普通 `receipts` upsert + client Notion push。
- **Notion DB properties 名 case-sensitive**：店名(Title)、金額(Number)、日期(Date)、類別(Select)、支付(Select)、地區/品項/備註/SourceID(Rich Text)。
- Settings 用 `SourceID='__meta_settings__'` 特殊 page 嘅 code block 存 JSON（非機密 config only）。**Credentials 永不入 Notion**。
- ⚠️ **Migration**：live DB history 同 repo 有分歧 — **唔好 blind `supabase db push`**，用 Management API apply 單條 idempotent SQL。詳見 [[supabase-migration-divergence]]。

## Git Workflow (MANDATORY)

完成任何 task **即刻** commit + push：

```sh
git add <changed files>            # 唔好 git add . — 避免意外 commit secrets
git commit -m "type: description"  # conventional commits
```

- 做完自動 push，唔使等 Boss 問；push/hook 失敗要 report，唔好食晒。
- **改 code 一定要 bump version**（同一 commit）：`APP_VERSION`（`src/lib/constants.ts`）+ `package.json`。詳見 HANDOVER.md「Build Versioning Rule」。
- **Feature branch / worktree**：commit 後自動 `merge --no-ff` 入 main + push origin main（Boss 一次 confirm = 永久）。**例外**：`codex/android-compact-shell`（Android shell）**永不 merge 入 main**。unrelated histories → 直接喺 main 重 apply diff，唔好強合。

## Boss's Preferences

- 直接、有主見、零廢話；憎 AI-speak（唔好講「我理解你嘅感受」）。
- 回覆用**繁體中文 + 廣東話**，emoji + 幽默。HKT (UTC+8)。Arsenal fan（紅色系 UI 係刻意 🔴）。

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **travel-expense** (7358 symbols, 18048 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/travel-expense/context` | Codebase overview, check index freshness |
| `gitnexus://repo/travel-expense/clusters` | All functional areas |
| `gitnexus://repo/travel-expense/processes` | All execution flows |
| `gitnexus://repo/travel-expense/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
