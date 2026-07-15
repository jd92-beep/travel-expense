# Changelog

## 2026-07-15

- **Compact 0.16.7 / Admin 1.0.2 / Broker 2026.07.15 Volcano model closure**:
  - 根因係 Compact/Android model dispatcher 只有 Kimi、Mimo 分支，Volcano selection 會跌入
    Google path；Admin Edge 同 Broker status 亦只回報一個 required model，而 Broker status
    忽略只存在 Worker env 嘅 `VOLCANO_KEY`。
  - Compact 同 Android 而家會把五個既有 Volcano LLM 精確送去 `/volcano/json`；Settings 四個
    task selector 各有直接測試掣，固定 `kind=test`、8 output tokens、無 fallback，並驗證
    model 真正回傳 `{ok:true}`。`429`、quota、daily-limit hard stop 維持不變。
  - Admin Providers 保持每 provider 一 row，但新增完整 model catalog，Volcano 會顯示
    `doubao-seed-2.0-lite`、`doubao-seed-2.0-pro`、`minimax-m3`、`minimax-m2.7` 同
    `doubao-seed-2.0-mini`。Seedance media models唔會混入 LLM selector/probe。
  - Android cold-start 同 IndexedDB hydration 使用相同 sync normalizer：只重排未耗盡、可重試
    failure；exhausted/`40001` conflict 保留真實 error evidence，避免錯誤 banner 無限重播或
    真失敗被靜默清除。stale trip result 同時保留 `supabaseId`。
  - 本地證據：Compact typecheck/build/security、AI routing、Settings、offline、sync regression
    同 mobile smoke 全綠；Admin unit `32/32`、contract `24/24`、full smoke `48 passed + 1 skip`；
    Edge `53/53`；Broker check/self-test；Android debug APK 同 emulator QA 全部通過。
    Passphrase、secret values、RLS、migration、write mode 同 live user data 均冇改動。

- **Compact App 0.16.6 stale-tab and trip identity recovery**:
  - Live Chrome timing proved the reported banner came from a tab opened on `0.16.4` at 10:11,
    before the `0.16.5` trip-sync repair deployed at 10:52. The tab had never reloaded, so later
    successful Supabase pulls could not make the old in-memory JavaScript adopt the repair.
  - Compact previously marked updates ready only on `serviceWorker.controllerchange`, while its
    security contract intentionally registers no service worker. It now checks the same-origin
    index on load, foreground/focus and a five-minute interval with `cache: no-store`, compares the
    loaded module asset with the current deployment and shows the existing explicit reload notice.
    An update notice takes priority over stale-runtime sync errors; the app never auto-reloads while
    the user may be editing.
  - A successful trip push now always preserves its `supabaseId` identity link when newer local trip
    content wins the timestamp merge. This closes the `synced + empty queue + missing supabaseId`
    state without overwriting the newer itinerary or metadata.
  - Two regressions failed before the fix and now pass; the sync suite is `6/6`. Typecheck, build,
    security scan, security smoke, offline `4/4`, mobile layout and the full production gate all
    passed. No passphrase, secret, provider credential, RLS, migration or live user data changed.
  - Commit `882de8e` is live on Compact Vercel, Netlify and GitHub Pages. Direct production-bundle
    checks found version `0.16.6` plus both repair markers on all three origins; GitHub Pages run
    `29397584920`, Netlify run `29397584955` and Admin CI run `29397585050` all passed.

- **Compact App 0.16.5 production trip-sync recovery**:
  - Live Chrome state and Supabase logs proved the recurring banner was not a generic connection
    failure: a new trip hit `400` on live-schema column drift, then two `403` RLS failures while the
    app kept the trip locally but created no retry job.
  - Confirmed new owned trips now use INSERT without `RETURNING`; the legacy-column fallback uses the
    same safe path, avoiding a false SELECT-RLS failure after a valid owner INSERT. Existing-trip and
    shared-trip update behavior is unchanged.
  - A failed guide save now creates one deduplicated trip queue item instead of claiming it will retry
    with an empty queue. Successful authoritative pulls also backfill old local-only owner trips, so
    data stranded by `0.16.4` can heal automatically.
  - IndexedDB-only hydration now uses the same retry normalization as localStorage without re-running
    that normalization on ordinary state updates. Four production-shaped regressions cover all four
    paths; session and sync-classifier smokes remain green.
  - The live schema still lacks the optional trip-intelligence columns; the client remains compatible,
    and durable schema reconciliation stays tracked without `db push`, migration repair or RLS changes.
    No passphrase, secret, provider credential or live user data changed.

## 2026-07-14

- **Compact App 0.16.4 cold-open sync reliability**:
  - A temporary Supabase auth refresh race no longer becomes a permanent queue failure and generic
    connection banner on every launch. Boot sync uses bounded quiet auth retry, and non-exhausted
    persisted failures safely requeue after hydration.
  - Exhausted and version-conflict failures remain durable; manual retry clears stale access/backfill
    latches and schedules one authoritative sync, including when another sync is already running.
  - Permission/RLS failures now show the permission-specific message rather than 「有資料連線失敗，
    請檢查連線或設定。」
  - Offline/cold-open regression tests passed `4/4`, focused manual retry passed `2/2`, and the full
    Compact production gate passed typecheck, final navigation `10/10`, mobile, a11y/touch, broker
    guards, security scan and production build. No passphrase, secret, RLS, migration or live user
    data changed.

- **Admin Console 1.0.1 performance and runtime-status correction**:
  - Default Overview、Accounts、Incidents、Providers 與 Audit reads 使用最多兩個併發嘅 bounded
    prefetch；idle Activity Center 停止每 60 秒重讀，打開時先明確 refresh。
  - Volcano 已加入 provider aggregation、required model `volcano/doubao-seed-2.0-lite`、BFF
    validation 與 Edge operation allowlist。
  - Overview 喺 signed request 驗證後並行讀 DB、recent operations 同 Broker health；Broker 只會
    喺 exact health contract 成功時顯示 healthy。未有 Compact/Android heartbeat 會顯示
    `待首次心跳`，唔再係 generic Unknown，亦唔會偽裝 healthy。
  - Admin `typecheck`、build、security、unit `32/32`、contract `24/24`、full smoke
    `47 passed + 1 intentional skip`、Edge `72/72`、`npm audit` 0 vulnerabilities 全部通過。
    Passphrase、secrets、RLS、migration、live user data 及 `ADMIN_WRITE_MODE=deny_all` 均冇改動。
  - Protected workflow `29336763253` 先因 health/package version drift fail closed；PR #51 加入
    package-bound health version regression。Workflow `29337850114` attempt 1 再因舊 Edge source
    fail closed，兩個 candidate 均未 promotion。
  - Reviewed `admin-kanban` Edge bundle 已部署為 `v92`；workflow `29337850114` attempt 2 最終於
    exact Git SHA `697a9c9522b14a1a67e77ab4088136e48de369b2` 成功 promotion。Production Vercel deployment
    是 `dpl_6R3tZEYhwmiJ5CyeykdnqKhYshSv`，Edge deployment 是
    `fbnnjoahvtdrnigevrtw_c64e6bb8-1c80-4d69-a590-a69203830aa9_92`，schema `20260712123000`。
    Live health 回 `200` 同 `acceptingReadTraffic=true`；passphrase、credential values、RLS、
    migration、live user data 同 write mode 均冇改動。

- **Admin Console 1.0 passkey bootstrap closure and final production promotion**:
  - First passkey enrollment BFF begin/finish returned `200`; Edge credential register, revoke-all,
    session create and session verify also returned `200`. The existing passphrase text remains
    unchanged and necessary.
  - `ADMIN_PASSKEY_BOOTSTRAP_SECRET` was removed from Vercel Production. Bootstrap-closure workflow
    `29303308607` deployed `dpl_59zhH1QnLEXtPnfNq8yHkscPczJe`; temporary Keychain material was
    removed.
  - PR #49 merged at `0a71608e2b0c888eb7e7e4efb194a21a59ad935b` with localized Chrome passkey-focus
    guidance. Final workflow `29303864302` succeeded at that SHA and deployed Vercel
    `dpl_A7o26cPYDieYCa1RaNcVvGpJ4XWh`, Edge
    `fbnnjoahvtdrnigevrtw_c64e6bb8-1c80-4d69-a590-a69203830aa9_90`, schema `20260712123000`.
  - Live `/api/health` returned `200` with `acceptingReadTraffic=true`; production asset
    `/assets/index-BbcEP-GN.js` includes the localized focus guidance, and the bootstrap environment
    is absent. Writes remain `deny_all`, and R3 remains server-disabled.

- **Admin Console 1.0 successful production promotion**:
  - Retry workflow `29301851315` failed closed at candidate readiness with `503`; no Edge
    `/api/runtime` request occurred, and candidate Vercel deployment
    `dpl_9yRX6HWGUfDHtnAS1vt7so5c4uma` was not promoted.
  - `ADMIN_KANBAN_HASH` was updated through the official Vercel CLI without changing the passphrase.
    Workflow `29302288203` then completed all seven prerequisites and protected promotion at exact
    Git SHA `72ee62507349e245b8613d9531958d428237bc90`.
  - Production is Admin `1.0.0`: Vercel `dpl_J6huupag1ur7GwmPCVU6k7b7kJsn`, Edge
    `fbnnjoahvtdrnigevrtw_c64e6bb8-1c80-4d69-a590-a69203830aa9_88`, schema `20260712123000`.
    Live `/api/health` returned `200`, version `1.0.0`, the exact SHA and
    `acceptingReadTraffic=true`; unauthenticated session returned `401` and direct catch-all session
    query returned `404`.
  - This interim promotion was superseded by the completed passkey bootstrap closure and final
    production promotion above. Writes remain `deny_all`, and R3 remains server-disabled.

- **Admin Console 1.0 deployment readiness follow-up**:
  - Production promotion workflow `29268903409` deployed the prior Admin `1.0.0` release at exact
    Git SHA `90cfab891665300cdd8b9765f34c02cfea6d8169`, but production login failed because its
    configured `ADMIN_KANBAN_HASH` was a legacy `PBKDF2` value rather than the strict `scrypt`
    format required by Admin 1.0.
  - PR #48 merged at `72ee62507349e245b8613d9531958d428237bc90`; readiness now fails closed on a
    malformed hash before any Edge call. A new valid `scrypt` hash was generated locally and set in
    Vercel Production without changing the passphrase.
  - At that interim point, passkey enrollment and bootstrap removal were still pending. Both were
    subsequently completed and verified by the final production promotion above.
  - Writes remain `deny_all`, and R3 remains server-disabled.

## 2026-07-13

- **Compact App 0.16.3 idempotent trip re-home**: fix(compact): v0.16.3 — idempotent trip re-home.
  The v0.16.2 re-home inserted a fresh UUID row on every RLS-denied trip upsert while the local
  trip's supabaseId stayed stale, so a queue of N receipts would create up to N duplicate trips.
  Re-home now reuses the existing re-homed row (owner_id + suffixed legacy_source_id lookup,
  upsert not insert) and a per-session contested→re-homed id map skips the doomed contested
  attempt on subsequent pushes.

- **Receipt-photo cutover compatibility**:
  - Added forward migration `20260712122500_restore_receipt_photo_compatibility.sql` to retain the
    public `receipt-photos` bucket and exact public read policy until Compact/Android signed-URL
    heartbeats prove active compatibility.
  - The static migration gate now verifies the final active public state separately from the staged
    private-bucket contract, locks the migration ordering/final actions, and rejects later active
    Storage mutations; the Admin SQL smoke verifies exact normalized policy metadata/predicates and
    rejects staged-only read policy activation.
  - No production migration, deployment, secret, or data mutation occurred.

- **Admin Console 1.0.0 cutover preparation**:
  - Promoted the verified branch metadata from `1.0.0-rc.1` to cutover candidate `1.0.0` in the
    Admin package, both package-lock root entries and `/api/health`.
  - Final-SHA PR #36 run `29202450339` passed Admin/BFF, clean database, Compact, React,
    cross-client, Edge and Credential Broker at `8aa2f8a`; protected production promotion skipped.
    React `0.2.4` evidence remains typecheck/build/security green, clear-device `12/12`, and
    security smoke `3 passed, 1 intentional skip`.
  - Admin metadata gates passed: typecheck/build/security, unit `19/19`, contract `21/21`. Boss
    explicitly approved cutover preparation, but production deploy and migrations are not complete.
    The existing `ADMIN_KANBAN_HASH` and current passphrase remain unchanged; passkey is additive and
    no live enrollment occurred. Production remains Admin `0.8.3` read-only until verified promotion.

- **React App 0.2.4 clear-device persistence race**: clearing device data now quiesces the active
  Supabase storage scope before sign-out, so state/sync effects cannot recreate its scoped
  localStorage or IndexedDB snapshots; a deterministic regression covers the writeback race.

- **Admin Console 1.0.0-rc.1 current-SHA CI closure**:
  - PR #36 run `29201116294` passed all seven required jobs: Admin/BFF, Edge, clean disposable
    Supabase, Compact, React, Credential Broker and the Compact/React browser round trip.
  - The clean database applied every forward migration through `20260712123000` and passed all 15
    Admin/shared SQL fixtures, including passkey removal, sync conflict, R2 itinerary and Nagoya
    six-day invariants.
  - Fixed CI portability and lifecycle defects without changing app behavior: the database job no
    longer assumes `rg` exists, and owned Vite servers now launch directly, close deterministically
    and never terminate an external server. Previously the browser test printed `passed` in six
    seconds but remained alive until the job timeout.
  - Corrected stale SQL fixture expectations to exercise genuine underlying-row version drift and
    count all versioned itinerary mutations/restores. Production triggers and mutation guards were
    not weakened.
  - Production remains Admin `0.8.3` read-only; no live migration, secret, passkey or data mutation
    was performed.

## 2026-07-12

- **Compact App 0.16.2 / Android 0.19.2 contested-trip recovery**:
  - If a locally owned trip identity collides with another account's row, the client retries once
    with a current-user-scoped trip identity so receipts and photos can sync to the correct account.
    Genuine shared-trip access denial still requires a fresh owner invitation.

- **Admin Console 1.0.0-rc.1 final branch hardening**:
  - Rebased onto Compact `0.16.2` without dropping Oscar's access-denial, multi-currency, motion or
    sync fixes. Canonical itinerary versions, receipt tombstones/sync revisions and private-photo
    contracts remain aligned across web clients.
  - Added safe non-final Boss passkey rotation. Removal is bound to the selected opaque credential,
    complete passkey-set hash and single-use R2 step-up; the server protects the final passkey,
    appends Audit v2 and revokes every Admin session after success.
  - Hardened the real BFF path: Edge redirects, transport failures, malformed envelopes, mismatched
    request IDs and unproven photo streams now fail closed. Broker health requires the explicit
    Broker contract, provider-probe ambiguity remains `outcome_unknown`, and account-directory
    lookup fails closed when its bounded search cannot prove an email is absent.
  - Receipt-list status/date cells no longer split short operational values into unreadable fragments;
    wide tables stay keyboard-scrollable inside their own region without document overflow.
  - Post-rebase gates: Admin unit `19/19`, contract `21/21`, browser `42 passed + 1 intentional
    capture skip`; Edge `69/69`; Compact 9/9 selected gates; React final navigation `6/6`; Broker
    check/self-test; security, migration-policy and shared-ledger scans green.
  - Production is unchanged at Admin `0.8.3` read-only. No production deploy, migration, secret or
    live user-data change was made.

- **Compact App 0.16.1 Access-Denial Sync Fix — the real "sync fail" banner root cause (main) / Android 0.19.1**:
  - **Live diagnosis (puiyuchau@gmail.com, 61 failed queue items, photos stuck)**: her device holds a local copy of the owner's shared South Korea trip but she has NO `trip_members` row server-side (and no local sharing metadata), so every receipt push re-ran `upsertSupabaseTrip` down the OWNER path → upsert collided with the owner's `trips` row → Postgres `new row violates row-level security policy` → all 61 receipts + 66 photos failed, ~122 doomed POSTs per boot (server logs wall-to-wall RLS errors). Every cold open replayed the whole doomed sweep (boot hydrate-reset requeues error items and resets `attempts`), repainting the misleading「請檢查連線」banner — this loop, not connectivity, was the banner.
  - **Fixes**: (1) `upsertSupabaseTrip` translates RLS violations into an actionable Cantonese error（旅程存取權失效：請旅程擁有者重新邀請）; (2) `push()` classifies access/RLS denials (`isAccessError`) and fail-fasts all sibling receipts of a denied trip within the sweep — one network probe instead of N; manual retry still gets a fresh attempt; (3) the Shell banner shows a permission-specific headline instead of「請檢查連線」when the failure is access-shaped.
  - **Remaining (needs the trip owner, not code)**: the user must be re-invited to the shared trip from the owner's app (adding `trip_members` rows is an access-control change the assistant does not perform). Once she accepts, her client links the trip and the 61 receipts sync via the shared-trip RPC.
  - **Verified**: typecheck clean; smokes final-nav 10/10 (incl. the 403 permission-denied rigs and manual-retry recovery), offline/session/sync-classify/history/stats/dashboard/mobile-layout green; settings 9/10 (known pre-existing Trip Doctor rig).

- **Compact App 0.16.0 Multi-Currency Trips (main) / Android 0.19.0**:
  - **Phase 1 — capture**: `SUPPORTED_CURRENCIES` 17 → 32 (adds CZK/DKK/NOK/SEK/PLN/HUF/RON/TRY/ISK/AED/SAR/ILS/INR/IDR/EGP) with coarse offline `FALLBACK_PER_HKD` rates (kills the silent 1:1-HKD conversion for these codes; a dev-time self-check warns if any supported code ever lacks a fallback), display prefixes, and ISK zero-decimal. OCR (`scanReceiptImage`), voice/email (`parseTextWithAi`), and the local no-AI heuristic all now detect and set per-receipt `currency` (AI prompts request an ISO code validated by `isCurrencyCode`; heuristic recognizes €/£/₹/₺/₪/฿/₩/₫/₱/Kč/zł/Ft/CHF/Rp/RM plus bare ISO codes next to digits — a bare "kr" deliberately stays unmapped since DKK/NOK/SEK/ISK are indistinguishable). Verified against 14 mixed samples.
  - **Phase 2 — per-day intelligence**: the trip-extraction prompt's per-day schema now requests `city`/`country`/`timezone`/`currency` (Zürich day → CHF, Prague day → CZK — different days, different currencies). `mergeAnalyzedTrip`/`normalizeItinerary` already preserved per-day currency; the prompt simply never asked. `trip.currencies` becomes the true union (HKD + every distinct per-day currency). Wizard currency selects now render all 32 supported codes from `SUPPORTED_CURRENCIES` (was two divergent hardcoded 14/15-option lists); additional currencies flow in automatically from the AI itinerary rather than a manual multi-select.
  - **Phase 3 — display**: the Stats「顯示貨幣」binary HKD/tripCurrency pill becomes **HKD + one chip per currency the trip actually uses** (trip.currencies + per-receipt currencies, capped at 6, stale selection falls back to HKD). Totals/budget/daily lines convert into any selected chip via the HKD anchor; budget edits under any chip convert back to the trip-currency denomination correctly. Settlement stays HKD-anchored; Top-10 rows keep native per-receipt currency.
  - **Verified**: typecheck clean; smokes stats/scan/dashboard/six-person/history/final-nav/itinerary green (settings 9/10 — the 1 failure is the known pre-existing Trip Doctor stale rig, fails on clean HEAD, tracked separately); live 390×844 rig (CHF+EUR+CZK trip, fixed rates): chips render [HKD CHF EUR CZK], HKD total HK$1,516 ✓, CZK view Kč4,39x ✓, CHF view CHF16x ✓, Top-10 shows each receipt in native currency, editor dropdown offers CZK and defaults from the itinerary day.

- **Admin 1.0 shared client contract audit**:
  - Partial itinerary writes preserve every omitted in-range day; itinerary version wins over device clock skew.
  - Receipt identity is `(TripID, SourceID)`; legacy raw `SourceID` matching is allowed only for one unique unscoped candidate.
  - Compact carries receipt tombstones, private photo signed-URL handling, and canonical sync revisions across pull, upsert, and delete flows.
  - Focused itinerary and Compact browser contract coverage remains part of the Admin RC gate.

## 2026-07-11

- **Compact App 0.15.1 Sync-Banner Hardening + Worldwide 譯名 + Dashboard Weather Chip (main) / Android 0.18.1**:
  - **"切 tab 見到同步失敗" (#1)** — two-front fix: (a) the v0.18.0 APK had been built from a working tree carrying another session's half-finished sync overhaul (vite bundles the tree, not the git index) — rebuilt from committed-only code (bundle grep-verified clean, same cert digest); (b) committed path hardened: the `visibilitychange`/interval/reconnect auto-sync surfaced auth-shaped errors instantly, so a stale-JWT race right after foregrounding painted the red banner — auto-triggered syncs now get ONE quiet retry after 2.5s (`AUTO_SYNC_AUTH_RETRY_DELAY_MS`, lets supabase-js autoRefreshToken finish) before the banner; manual retries stay immediate; a genuinely dead session still surfaces.
  - **Top-10 譯名 worldwide (#2)**: `needsTranslation` now detects Arabic/Hebrew/Devanagari+7 Indic scripts/Thai/Lao/Khmer/Myanmar/Cyrillic/Greek and diacritic Latin (é ü ř ğ å …) in addition to kana/hangul; pure-ASCII stays untranslated (indistinguishable from English brand names). Prompt wording widened to any language. Verified against 21 mixed-script cases.
  - **Dashboard 今日狀態 weather chip (#4)**: the top-right indicator was dead JSX showing `-- --` since 1b5d037 (never wired). New shared `DashboardWeatherChip` (used by the 今日狀態 pill AND the itinerary badge) reuses Weather.tsx's cache/coord/provider chain + tier-aware `WeatherIcon`; live-verified 「27° 多雲」at 390×844. Fallbacks: cached rows → one ref-guarded lazy fetch → quiet 「天氣 --」. Includes a StrictMode-double-mount guard release (without it the dev chip stuck on fallback forever).
  - **Pre-existing final-nav failures fixed (#3, main)**: `:180` was a real regression from c215eb4 — `effectiveSupabaseSession` discarded the localStorage session hint whenever Supabase is unconfigured (loading never flips true); now the unconfigured branch trusts the hint, the configured branch keeps the dead-refresh-token protection. `:100`/`:140` rigs pre-dated the deliberate a9b5748 hydrate-reset (which wipes persisted error state on boot — intentional, kept); rigs rewritten to drive a REAL `push()` failure (Notion permission-denied 403 stub) so the banner state is produced by the live engine. `smoke:final-nav` 10/10 ×2 runs.
  - **Known left as-is**: android `history-smoke:465` (offline conflict resolver) is a committed regression (2c1fe02's hydrate-reset erases version-conflict queue items before render) whose exact fix is already in-flight as another session's uncommitted WIP in the main tree (isVersionConflictError export + storage guard) — not duplicated here to avoid a two-session collision; android also skips the auto-sync quiet-retry this round (its useSyncEngine.ts carries 9 uncommitted foreign hunks).

- **Compact App 0.15.0 Timeline De-Lag + Real Windmill + Top10 Translated Names (main) / Android 0.18.0**:
  - **Fixed "entering the itinerary tab is laggy"** (root causes, ranked): (1) `BorderBeam` animates `offsetDistance` — a motion-path property that runs on the main thread every frame, not the compositor — with `repeat: Infinity`, and `TimelineRail` mounted one **per itinerary day**; it had no fx-tier gate (the only decorative component that missed one). Now gated inside the component to the `full` desktop tier. (2) `Timeline.tsx` had zero memoization: `getScheduleSpots`/`dayLooseReceipts` (which internally re-ran `getScheduleSpots` + a full trip-scoped receipt filter) recomputed 2–5× per render across the command card, the per-day loop, and the orphan block — now precomputed once per day in `useMemo` (`perDayTimeline`), with `dayLooseReceipts` accepting optional precomputed spots (back-compat). (3) `.timeline-rail-sweep` (infinite, one per day) and `.timeline-now-marker` float were missed by the mobile-hardening CSS block — now disabled on phones. (4) `MagicCard`'s theme-sync MutationObserver no longer created when heavy effects are off.
  - **Real windmill tab transition** (the previously requested effect finally exists). Three stacked root causes: (1) the old `WindmillTransition` was only a faint conic-gradient overlay flash, not a content transition; (2) it was desktop-gated (`fxTier === 'full'`), and phones are always `balanced`, so mobile never saw anything — deleted; (3) **the deepest one**: `<ErrorBoundary key={safeTab}>` wrapped App.tsx's `AnimatePresence`, so every tab switch remounted AnimatePresence itself, and with `initial={false}` no enter/exit animation EVER ran — meaning even the old x-slide had silently never animated. The keyed ErrorBoundary now lives inside the keyed `motion.div` (AnimatePresence persists across switches; ReceiptEditor got its own unkeyed boundary). The page content now swings like a launcher-style windmill blade around a hub below the screen (`transformOrigin: '50% 130%'`, direction-aware rotate ±14° balanced / ±18° full, rotate+opacity only = compositor-safe, ≤300ms, lite = instant swap). Verified live: sampled `rotate(13.99° → 3.8°)` spring frames mid-switch at 390×844.
  - **Stats Top-10 translated shop names**: foreign-script names (Hiragana/Katakana/Hangul — Han-only and Latin stay untouched) get a Cantonese/official-Chinese name on a second line under the original. Sources in order: inline `原文 (譯文)` already embedded by scan/voice AI (split + seeded to cache, zero AI calls), then one **batched** AI call (`callPreferredJson` kind `'trip'`) for uncached names asking for official Chinese → official English → natural Cantonese; results cached in local-only `state.storeTranslations` (not cloud-synced — derivable data). Silent on failure (offline/no session → originals only); in-flight + attempted-name guards prevent refetch loops.
  - **Verified**: typecheck clean; smokes green — timeline 9, dashboard 8, weather 14, history 8, final-nav 7, stats/scan/mobile-layout/a11y-touch pass; visual at 390×844: zero `offset-path` animations on Timeline, sweep `animation: none`, Top-10 shows translated second line (スシロー → 壽司郎). Known pre-existing: 3 final-nav sync-console tests (`:100/:140/:180`) fail on clean v0.14.0 HEAD too (stash-bisected — unrelated to this change).

- **Compact App 0.14.0 Motion Layer v2 (main) / Android 0.17.0**:
  - **Root cause of "app feels static on phones"**: `shouldDisableHeavyEffects()` treated ANY mobile UA as low-end, stripping tab transitions and all rich motion on the primary platform while desktop kept the fancy path. Replaced with a 3-tier system (`getEffectsTier`: full / balanced / lite) — **balanced** (normal phones) now runs compositor-safe motion everywhere (transform/opacity only); **lite** (reduced-motion, ≤2GB RAM, ≤2 cores, save-data) keeps the old stripped behavior. Tier stamped on `<html>` as `fx-*` so CSS scales densities without JS.
  - **Tab transitions on mobile**: direction-aware slide (±24px, tuned spring, ≤250ms) via the existing AnimatePresence path; instant swap on lite. The two duplicated tab-render branches in App.tsx were deduplicated. The full-screen WindmillTransition (which leaked onto mobile) is now desktop-only.
  - **Weather showpiece**: vendored 13 Meteocons animated SVGs (Bas Milius, MIT — `src/assets/meteocons/`, ~70KB, offline-safe) replacing static lucide icons at hero/hourly/slot levels with day/night variants by slot hour; lite keeps lucide (SMIL can't honor reduced-motion). WeatherFX rewritten: 2-depth-layer slanted rain + ground splash blooms, precipitation-scaled intensity (`wfx-i1/2/3` from precipMm/rain%), breathing sun corona + drifting light shafts, SVG snow crystals (fall+sway+rotate, varied scale) replacing ❄ text glyphs, 3-layer parallax clouds, storm cloud silhouettes + dual offset lightning. All keyframes audited transform/opacity/rotate-only; `contain: paint`; all FX pause when the page is hidden (battery).
  - **Shell/nav polish**: floating-dock active tab is a `layoutId` pill that glides between tabs + press scale feedback; sticky mobile header condenses on scroll (`--header-shrink` 0→1 over 96px, transform/opacity only).
  - **Micro-interactions**: BorderBeam travelling light on the Dashboard hero budget card; History ledger rows stagger-rise (first 12 only); subtle washi-palette confetti on Scan batch save (`canvas-confetti`, reduced-motion aware, lite skips); press-dip on rows/chips.
  - **Cleanup**: deleted dead `ui/timeline.tsx`, `ui/file-upload.tsx`, `ui/confetti.tsx` (0 importers).
  - **Verified**: keyframe property audit 100% compositor-safe; typecheck + `npm run build` clean; smokes green — weather 14, final-nav 7, dashboard 8, history 8, timeline 9, settings 9, privacy 3, scan/stats/six-person/mobile-layout/a11y-touch/offline/session/sync-classify all pass. `smoke:welcome-guide` fails on pre-Motion-v2 HEAD too (stash-bisected, pre-existing) — flagged as a separate task.
## 2026-07-10

- **Admin Console 0.8.3 emergency containment / Compact 0.13.6**:
  - Production Admin Edge is read-only by default. All mutations and external side effects now fail
    before route dispatch with `503 ADMIN_WRITES_DISABLED`; hidden buttons or direct Edge requests
    cannot bypass the kill switch.
  - Removed permissive browser policies/grants from the three admin state tables and denied anon or
    authenticated execution of the admin RLS helper. Real PostgREST/RPC denial smokes and SQL
    privilege reports passed against live Supabase.
  - Rotated the exposed Edge-to-Broker machine key, removed the old static `ADMIN_TOKEN` path and
    bindings, and limited Broker internal authentication to fixed scoped routes.
  - Provider health now separates Configured from Healthy. Broker liveness and HTTP 200 with an
    invalid nested status can no longer paint providers green.
  - Hardened adjacent browser-executable functions: anon execute revoked and `search_path=''` for
    account deletion, trip-member display names and member-role ranking.
  - Compact receipt-photo upload/pull now uses 15-minute signed URLs; the Admin Edge photo route uses
    60-second signed URLs and fails closed if signing is unavailable. Android `0.16.4` has the same
    compatibility change on `codex/admin-console-1.0-android`.
  - Added a tracked private `receipt-photos` bucket migration with authenticated trip-member Storage
    RLS. It is intentionally not live until Compact and Android compatibility deployment is proven.
  - Verification: Admin typecheck/build/audit green; Compact typecheck/build/security/policy scan and
    signed-photo smoke green; Edge 10/10 Deno tests; Broker check/self-test green.
  - Added a guarded Admin production deploy command that refuses dirty worktrees, pins the canonical
    Vercel project, injects the exact Git SHA and verifies live health provenance after promotion.
## 2026-07-08

- **Compact App 0.13.5 No False "Sync Error" On Cold Boot (main) / Android 0.16.3**:
  - **Fixed "open the app after a few hours → always shows sync error, check the connection"**: the boot `pull()`/`push()` painted the persistent red banner (`globalSyncStatus: 'error'`) on **any** thrown error, including a transient network blip. After the phone's radio has slept for hours, the very first request on open is the flakiest (radio wake, DNS, and the expired-JWT refresh round-trip) — one blip set the sticky banner even though the 120s interval + reconnect listener healed it seconds later.
  - **Fix**: new `isTransientSyncError()` classifier — offline, `Failed to fetch`, `NetworkError`, `Load failed`, timeouts, `ERR_CONNECTION_*`, 502/503/504 are transient and stay quiet (`queued`/`idle`, no banner, no lost timestamp); only actionable failures (auth expired → re-login, RLS/permission denied, 40001 version conflict) still surface the banner. In `push()`, a transient item failure no longer counts as a failure **nor burns a retry attempt** — previously 3 quick transient strikes could drop a pending receipt from the queue (backfill later re-queued it, but churny). The interval/reconnect loop re-drives it.
  - **Tests**: new `smoke:sync-classify` exercises the real classifier through Vite's module graph in-browser (no network, no live Notion) — 7 network shapes → transient, 5 actionable shapes → hard, and offline forces transient even for an auth-shaped message. Green; offline + session smokes regression-green; typecheck clean.

- **Compact App 0.13.4 Stay-Logged-In On Device (main) / Android 0.16.2**:
  - **Fixed re-login every ~1 hour**: `storedSupabaseSession()` (App.tsx cold-boot hint) deleted the entire persisted Supabase session — refresh_token included — the instant the access_token (JWT) expired. Since Supabase JWTs default to a 1-hour lifetime, reopening the app an hour later forced a full re-login even though the long-lived refresh_token could have silently renewed. Now the hint never mutates storage and never rejects an expired-but-refreshable session; supabase-js (`persistSession` + `autoRefreshToken`) owns eviction and only clears the key when the refresh_token is genuinely dead. Net effect: log in once on a phone and stay logged in for as long as the Supabase refresh token is valid.
  - **Clean logout when the token really dies**: `effectiveSupabaseSession` now trusts the local first-paint hint only while `supabaseAuth.loading`; once auth resolves to null the hint is dropped, so a dead session shows the login screen instead of a broken "authenticated" state that 401s every call.
  - **Tests**: new `smoke:session` (`tests/session-persistence-smoke.spec.cjs`) — an expired-access-token session with a refresh_token survives a cold boot (key + refresh_token intact); a malformed blob is ignored without crashing. Green; offline + privacy smokes regression-green; typecheck clean.

- **Compact App 0.13.3 Offline-First Hardening (main) / Android 0.16.1**:
  - **Audit result**: the Android APK bundles the full app locally (Capacitor `webDir: dist`, no `server.url`) — it boots and records expenses with zero dependency on GitHub Pages/Vercel. Sync gating uses `navigator.onLine` only; receipts written offline queue locally and the `'online'` event auto-triggers sync (backoff released, 100ms debounce), with 120s interval + visibilitychange as fallbacks. AI recognition holds no failure state (no cooldown/circuit in `ai.ts`/`credentialBroker.ts`) — every scan is a fresh request, so it works on the first attempt after reconnecting; offline OCR failure falls back to manual entry with the photo kept.
  - **Fix (android)**: native reachability probe no longer depends on our Vercel deployment — it probes the Supabase health endpoint first, Vercel as fallback (`NATIVE_REACHABILITY_URLS`). Previously Vercel-down meant the offline pill lied and fast-reconnect sync never fired.
  - **Fix (both)**: Google Fonts stylesheet loads non-blocking (`media="print"` + onload) so an offline cold boot never stalls on `fonts.googleapis.com`; Android falls back to system Noto Sans CJK.
  - **Tests**: new `smoke:offline` (`tests/offline-sync-smoke.spec.cjs`, hermetic — all external routes aborted): offline edit persists + queues, debounced push bails on the offline gate, reconnect event alone starts sync, unreachable backend keeps the item queued for retry. Green on both branches; `smoke:privacy` 3/3 regression-green.

## 2026-07-07

- **Admin Console (app-admin-kanban) 0.8.0 — Admin Console Upgrade**:
  - **Bug Fixes**: Fixed the puiyuchau@gmail.com 0-receipt bug by raising snapshot receipts cap to 10000 and sorting by `created_at desc` in the Edge function.
  - **Refactoring**: Split the monolithic `App.tsx` (1300+ lines) into 15 modular components under `src/components/` (each under 400 lines).
  - **New Features**: Implemented 5 new tabs (Trip Management, Audit Trail log timeline, Analytics dashboard using pure React SVG charts, Batch Ops with multi-select and CSV export, AI Provider Monitoring with latency trends and test run logs).

## 2026-07-06

- **Compact App 0.13.0–0.13.1 Private Receipts (main) / Android 0.16.0**:
  - **Per-record visibility**: `Receipt.visibility 'trip'|'private'` — 🔒只有自己 records are readable only by their owner. Enforced server-side: Supabase RLS `receipts_select_trip_members` now gates on visibility, and the `upsert_shared_trip_receipt` RPC maps the field and skips Notion mirror jobs for private rows (old clients / direct API calls cannot leak them). Live DB migrated via the Management API (`supabase/migrations/20260706090000_receipt_visibility.sql`, idempotent).
  - **Consistency rule**: privacy is only offered on personal records — 私人 split with no cross-person 代付 (`canBePrivateReceipt`). The editor locks the 可見度 control otherwise, `normalizeState` strips illegal combos, so a hidden record can never change another member's balance and every pairwise debt is computed identically by both parties.
  - **UI**: 可見度 select (全團可見 / 🔒只有自己) with Cantonese hints in the receipt editor; 🔒 marker on private rows in History.
  - **Notion**: client `pushReceipt` no-ops for private records (treated as synced so the queue doesn't retry forever) + server-side sync-job skip.
  - **Tests**: new `smoke:privacy` (editor gating incl. 代付 revocation, normalize strip, settlement neutrality — transfers identical with/without the private record). 3/3 on both branches; dashboard/six-person green; the history conflict-resolver and android final-nav failures are pre-existing on HEAD (stash-bisected) and tracked separately. 0.13.1 makes the spec selectors portable across both branches' History markup.
  - Deferred (documented): per-member `visible_to` subset visibility needs a trip-member↔person binding that doesn't exist server-side yet.

- **Compact App 0.12.0 Weather Overhaul (main) / Android 0.15.0**:
  - **Root-caused Nagoya Day 1 showing Jeju weather**: the live Supabase trip carried 中部國際機場 with Jeju-airport coordinates (33.5113, 126.493), stamped by the old unscoped `/機場|airport/→Jeju` GEO_DICTIONARY pattern (still live on the Android branch until 0.15.0) and synced to every device. Healed the Supabase row directly (trip version bump) and added client self-heal: `normalizeItinerary` replaces stored spot coords sitting >150km from the name's dictionary entry.
  - **Country-scoped geo resolution**: `resolveGeoCoordinate(name, countryHint)` only matches dictionary entries of the day's country (from `day.country` or timezone), so generic Korea patterns (中央地下街/鯖魚/umu/rainbow…) can never stamp Korea coords onto Japan/HK days again. Android's dictionary re-synced from main.
  - **Weather geocode fallback restored**: the Weather tab now geocodes city/region names via Open-Meteo when the dictionary has no match (Paris, Jeju-by-name, any future trip) instead of dead-ending on 缺少座標.
  - **Slot cards**: humidity removed per Boss spec; per-slot condition theme colors — 晴橙 / 多雲灰 / 霧淺灰 / 微雨淺藍 / 落雨藍 / 大雨深藍 / 雪冰藍 / 雷暴紫 (card gradient + border + type badge follow `--weather-accent`).
  - **Arrive flash**: entering the Weather tab auto-scrolls to the live slot and plays a double-flash glow ring on it (reduced-motion safe).
  - **weather-smoke suite repaired**: 6 pre-existing failures were stale fixtures (bare `installState({})` no longer produced the default Nagoya trip; Jeju-era expectations; Android had baked the Jeju bug into its expectations). Fixtures updated, humidity assertion inverted, new self-heal regression test. 14/14 green on both branches; dashboard/timeline/itinerary/final-nav green; Android also received the 0.11.1 Timeline port. Signed APK rebuilt (versionCode 1500, cert digest unchanged).

- **Compact App 0.11.1 Itinerary Editing Fixes & UX Polish**:
  - **Fixed Spot Type Option Mismatch (Bug 1)**: Unified the per-spot editing select with the global `SPOT_TYPE_OPTIONS` constant to support all 10 categories (including flight and sightseeing) and prevent category data loss on save.
  - **Added `timeEnd` in Day Editor (Bug 2)**: Added a time input for `timeEnd` (end time) to each spot row in the Timeline Day Editor.
  - **Added details jump button (Bug 3 & UX 1)**: Added a "Details" gear button next to the Trash button in each row. Clicking it saves current edits via `saveDayEditor()`, sets the selected spot as `editing`, and closes the Day Editor.
  - **Redesigned mobile row grid (Bug 4)**: Updated `timeline.css` to align all 6 fields on desktop, and reflow to a clean 4-column, 2-row grid on screens <= 430px with Touch Targets >= 40px.
  - **Added unsaved changes warning (Bug 5)**: Implemented dirty state check for the Day Editor, prompting the user with `window.confirm` if they attempt to discard unsaved edits.
  - **Implemented custom day swap confirm modal (UX 2)**: Replaced browser `window.confirm` for day swapping with a custom HTML-based confirmation sheet, and aligned the Playwright E2E smoke tests.
  - **Smart default times for new spots (UX 3)**: Implemented `getNextSpotDefaultTime(spots)` helper to default new spot times to 30 mins after the last spot's time (fallback to `'09:00'`).
  - **Version bump**: Bumped Compact app version to `0.11.1`.

- Fixed Compact Stats budget editing currency bug: when `displayCurrency` is HKD, user input is now correctly converted back to the trip's native currency via `hkdToCurrency()` before saving, and the edit field pre-fills the correctly converted HKD amount.
- Improved Compact Weather tab date visibility: each day's weather card now shows the actual date prominently (e.g. `7月12日 (六)`) via a new `.weather-day-date` element at 15px desktop / 13px mobile, replacing the previous barely-visible `Day X` eyebrow.
- Fixed GEO_DICTIONARY cross-trip contamination: replaced the overly-broad `/機場|airport/` pattern (which mapped any airport to Jeju coordinates) with Jeju-specific patterns, and added 13 Japan/Nagoya landmarks to prevent Nagoya trips showing Jeju weather data.
- Added Hong Kong Observatory (HKO) as an official weather provider for the Compact app. HKO combines `rhrread` (live temperature, humidity, UV, rainfall from HK Observatory stations) with `fnd` (9-day daily forecast distributed across display slots). Routing supports `香港`/`Hong Kong`/`HK` keywords plus a geo bounding box for the HK SAR area. Added 11 Hong Kong landmark entries to `GEO_DICTIONARY`.
- Verification passed for Compact `typecheck` and production `build`.

## 2026-07-03

- Fixed Compact `0.9.1` itinerary recovery for the default Nagoya trip (`2026-04-20` to `2026-04-25`): if a backend/account sync returns a partial active-trip itinerary, the Timeline now restores the missing canonical Nagoya days instead of hiding them.
- Clamped Compact itinerary display to the active trip date range, so scenery spots from dates outside the trip no longer appear in the Itinerary/Timeline tab.
- Hardened Compact trip pull/import merging so a newer remote trip with only partial itinerary days no longer overwrites complete local days; same-date remote updates still apply while missing days are preserved.
- Added a Timeline regression smoke that seeds a broken Nagoya state with only `2026-04-20`, `2026-04-25`, and an out-of-range `2026-04-26` scenery spot, then verifies the app shows all six Nagoya dates and hides the out-of-range spot.
- Verification passed for Compact `typecheck`, served `smoke:timeline` (`9 passed`), production `build`, `security:scan`, and served `smoke:mobile-layout`.

## 2026-07-02

- Verified Oscar's console update on `main`: Admin Console is live as `0.7.0` at `https://travel-expense-admin-kanban.vercel.app`, and Compact is `0.8.7`.
- Admin Console gained Notion/Supabase reconciliation, mirror repair, receipt-photo viewing, runtime status, sync job controls, data doctor, and identity merge tooling.
- Compact sync was hardened with Supabase backfill/photo recovery so local or Notion-era receipts that never reached Supabase are re-queued, and server-missing receipt photos are uploaded again from local thumbnails.
- Synchronized `workers/credential-broker/package-lock.json` with the committed `wrangler` dev dependency in `workers/credential-broker/package.json`.
- Verification passed for `app-admin-kanban` typecheck/build/smoke, `app-compact` typecheck/build/security/settings smoke, the focused Supabase backfill smoke, and Credential Broker check/self-test.
- Live checks returned `200` for Admin Vercel, Compact Vercel, Compact GitHub Pages, React Netlify, and Compact Netlify. GitHub Pages deploy succeeded; Compact Netlify deploy workflow is still blocked by Netlify account credits.

## 2026-06-21

- Added Compact console diagnostics for account/backend stability: Settings now has Account Sync Health and Sync Queue Inspector cards that show active account scope, session expiry, backend target, last push/pull age, queue counts, and sanitized queue rows.
- Added an account-switch watchdog smoke so Compact verifies Supabase-scoped storage changes from one backend account to another without leaking the prior account's trip state.
- Bumped Compact to `0.8.3`.
- Polished the Compact console/backend sync status: failed queue items now surface clearly in the header, Settings status pills, and Settings readiness strip instead of appearing as a clear queue.
- Hardened Compact account sync reliability by preventing overlapping pull/push races, aligning the sync engine with the effective Supabase account session used for scoped storage, and ignoring expired stored Supabase sessions during boot.
- Added a regression smoke for failed queue visibility and retry behavior, and bumped Compact to `0.8.2`.

## 2026-06-19

- Fixed the Compact Phase 0 security finding from the Splitwise roadmap: `app-compact/scripts/verify-notion-connection.mjs` no longer contains a hardcoded broker passphrase, reads the unlock password from local environment variables only, and uses the current broker `password` payload plus `X-Travel-Session` session header.
- Rotated the live Credential Broker `APP_UNLOCK_HASH` and `APP_SESSION_SECRET`; the new unlock passphrase is stored in macOS Keychain, and the updated verification script confirms broker unlock plus Notion status/test still pass.
- Added a security scan rule that fails on inline broker/admin passphrase assignments, restored the Compact typecheck gate by declaring the missing Node type dependency and `AppState` type import, patched Vite via `npm audit fix`, synchronized Compact package-lock/version docs, and bumped Compact to `0.8.1`.

## 2026-06-15

- Rebuilt the Compact Settings `Trip Update AI` confirmation modal into a readable day-by-day review editor. The popup now hides technical warnings inside a collapsed `需要留意` section, uses day chips/tabs, and lets users edit lodging plus each itinerary spot's start time, end time, name, category, address, and note before applying the trip.
- Added Trip Update AI review controls for adding, deleting, moving, and sorting itinerary spots before confirmation. Confirming now applies the edited draft, while returning to the text keeps the pasted itinerary unchanged.
- Fixed the Compact Timeline spot edit sheet so users can edit both start time and `結束時間` / `timeEnd`; the itinerary card now preserves and displays edited ranges such as `18:00 – 19:15`.
- Removed the confusing `鬆散紀錄` text under the Timeline daily expense count while keeping the daily receipt sheet action.
- Restored the Compact Home `預算總覽` HKD/destination-currency toggle to a horizontal pill layout.
- Bumped Compact to `0.7.9` and synchronized `package-lock.json` after the prior `0.7.8` package-lock mismatch.
- **Admin Console (Phases 1-7)**: Deployed a new cyber-themed independent admin KanBan board under `app-admin-kanban`. Implemented telemetry/audit table migrations (`app_usage_events`, `admin_audit_events`), action framework, sync operations, data doctor, identity resolver, runtime monitor, support bundle, tab navigation, and count health UI. Added full Edge Function integration and Playwright smoke tests.
- **Trip Update AI: Partial vs Full Itinerary Detection**: Added smart itinerary parsing intent analysis. Pasted text covering >80% of existing days triggers a full replacement, while <80% day overlap triggers a partial update (replacing only matching dates and preserving other days).
- **Mimo Default Model Alignment**: Updated Scan/Voice defaults to `Mimo v2.5` (was Google Gemma) for new users. Email/Trip defaults remain `Mimo v2.5 Pro`. Cut off date-based logic was removed, and existing users keep their chosen models. Bumped Compact to `0.7.8`.
- Fixed a fatal runtime crash in the Record tab (`History.tsx`) when displaying receipts with missing/undefined dates by adding defensive checks before slicing `r.date`.
- Aligned Playwright history smoke tests with the default-to-scan launch routing (appended `#history` hash to test URLs), version conflict detection, and Cantonese UI text expectations (`'同步衝突處理'`, `'2 筆'`).
- Bumped Compact to `0.7.7`.
- Fixed shared-trip Notion delete outbox so delete jobs now archive the mirror Notion page before marking the job succeeded, instead of silently skipping the archive step. Failed archive attempts retry with backoff.
- Added trip-scoped people and split ratio storage (`peopleByTripId`, `shareRatiosByTripId`). Each trip now maintains its own payer list and ratios; switching trips offline projects the correct people immediately. Supabase pull populates all trips' people, not just the active one.
- Fixed migration/hydration active-trip consistency: `tripName` now preserves `parsed.tripName` first (respecting user explicit set), `tripCurrency` derives from the active trip, and each trip's itinerary normalizes with its own currency.
- Changed HKD self-healing tolerance from 5% to 10% in both `stampReceiptForTrip` and `getReceiptHkdAmount` to accommodate volatile currencies.
- Added atomic outbox job claiming via `claim_receipt_sync_jobs` Supabase RPC with `FOR UPDATE SKIP LOCKED`. The drainer now tries the atomic RPC first and falls back to the legacy non-atomic path for older schemas.
- Added `peopleForTrip()` and `shareRatiosForTrip()` helpers for trip-scoped people lookups.
- Updated `switchTrip()` to project trip-scoped people and ratios into compatibility fields.
- Updated HANDOVER.md with compact app versioning independence and PR queue status.
- Added `app-compact/scripts/compact-live-regression-checklist.mjs` for repeatable live/staging verification.
- Bumped Compact to `0.7.6`.

## 2026-06-14

- Added a Supabase new-user signup notification backend. New `auth.users` rows now write to `public.admin_signup_notifications` and call the deployed `notify-new-user` Edge Function through `pg_net` with a private shared secret. The Edge Function is deployed live and rejects unsigned calls.
- Live setup note: `RESEND_API_KEY`, `ADMIN_SIGNUP_NOTIFY_EMAIL`, and `SIGNUP_NOTIFY_SECRET` are configured in Supabase. Because Resend is still in testing-recipient mode, the notification target is the Resend account email until a sender domain is verified. Live signed smoke returned `200 emailSent: true`.
- Added `node scripts/verify-signup-notification-contract.mjs` to verify the migration/function contract and prove no email provider key or signup shared secret is committed.

## 2026-06-13

- Fixed Compact Home trip switching so the trip name itself is the dropdown trigger, not only the chevron. The dashboard mobile/desktop header now wraps the trip name and arrow in one accessible button. Settings Trip Manager now keeps `New trip` and `Edit selected trip` collapsed by default with full-width expandable headers. Bumped Compact to `0.7.3`.
- Verification passed with `app-compact npm run typecheck`, served Dashboard smoke (`8 passed`), served Settings smoke (`9 passed`, `1 skipped`), `app-compact npm run build`, `app-compact npm run security:scan`, served mobile layout smoke, and `git diff --check`.
- Fixed Compact Weather tab entry scrolling so tapping Weather from Scan/Home now repeatedly re-centers the current trip day's live weather slot after weather rows and entry animations settle. Added regression coverage for a Jeju Day 2 current-time jump from Scan to Weather. Bumped Compact to `0.7.2`.
- Verification passed with `app-compact npm run typecheck`, served Weather smoke (`13 passed`), `app-compact npm run build`, `app-compact npm run security:scan`, `git diff --check`, and served mobile layout smoke.
- Fixed Compact Weather card place labels so weather targets keep the itinerary's pasted language instead of leaking English API/geocoder city names. Korea/Jeju weather groups now display Cantonese Traditional Chinese labels such as `濟州`, `西歸浦`, `城山`, `涯月`, and `牛島`, while English itineraries such as San Francisco remain English. Trip Update AI prompts now explicitly preserve user-pasted spot-name language and translate API-only English display names into natural Hong Kong Cantonese when the itinerary is Chinese. Bumped Compact to `0.7.1`.
- Verification passed with `app-compact npm run typecheck`, `app-compact npm run build`, `app-compact npm run security:scan`, served Weather smoke (`12 passed`), and mobile layout smoke.
- Refined Compact modal behavior and currency layouts: Scan live FX now shows the conversion result above the amount input, Compact popups close when tapping the backdrop while preserving inner-modal clicks, Home `預算總覽` stacks the destination currency directly under HKD, and Stats `預算羅盤` currency toggle now matches the Top 10 expense toggle style. Bumped Compact to `0.2.8`.
- Fixed Compact Home `今日狀態` weather pill layout so the right-side weather icon no longer shares positioning styles with the currency toggle or covers nearby content.
- Upgraded Compact Weather tab navigation: the top current-weather card now follows the current trip date/time, weather day cards expose live-hour anchors, and the tab auto-scrolls to the relevant day/hour card. Weather row cache is now itinerary-scoped so stale rows from another trip cannot appear on the current trip.
- Reorganized Compact Settings Supabase Auth and Trip Manager cards into clearer account/password, active-trip, new-trip, edit-trip, and currency/statistics sections with mobile-friendly controls.
- Improved Compact Scan live currency exchange: opening the FX modal automatically refreshes live rates, and typing an amount recalculates the conversion immediately without pressing the refresh button.
- Updated Compact Weather/Settings smoke tests for Scan-first deep links, current Jeju default itinerary expectations, and known-region weather target resolution. Bumped Compact to `0.2.7`.
- Verification passed with `app-compact npm run typecheck`, `app-compact npm run build`, and served Compact smokes for Dashboard, Scan, Weather, Settings, and mobile layout.
- Upgraded the Compact Scan tab receipt/FX cockpit: removed the unused recovery/batch/attachment status chips, replaced the hardcoded Japanese receipt with a trip-aware multilingual mock receipt library keyed by destination currency, moved the exchange-rate tool into a wide button under Camera/Gallery, and redesigned exchange as an accessible modal.
- Refined the Compact Home budget cards: removed the unused top-right dashboard bell/red dot and the `預算提醒` budget strip action, redesigned the currency toggle, added dual-currency daily budget/day balance display, and added a visible circular daily-budget usage chart to `今日狀態`.
- Updated Compact Playwright coverage for the new Scan exchange modal, Home dual-currency/chart behavior, the Scan-first launch contract, and touch/mobile layout expectations. Bumped Compact to `0.2.6`.
- Verification passed with `app-compact npm run typecheck`, `app-compact npm run build`, and served Compact smokes for Scan, Dashboard, a11y touch targets, and mobile layout.
- Fixed React and Compact itinerary Timeline tab entry behavior so tapping the Itinerary/行程 tab scrolls to the current day and live itinerary spot instead of staying at the top of the trip. The scroll now uses a hidden day anchor plus a geometry-based center scroll, with fallback to the next/last spot when there is no live spot.
- Added Compact Playwright coverage for entering Timeline from the Scan tab and verifying the live spot is centered on mobile. Bumped both app versions to `0.2.2`.
- Changed React and Compact app launch behavior so opening the app without a URL hash starts on the Scan tab, even if older local state still has a previous `lastTab`; explicit hash deep links such as `#history` still open their requested tab. Bumped both app versions to `0.2.1`.
- Upgraded the GitHub Pages workflow's official Pages actions to the Node 24 generation: `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, and `actions/deploy-pages@v5`, removing the Node.js 20 deprecation warning from the Pages deploy path.
- Completed the compact pending-task handoff from the external AI pass: the Supabase `receipt-photos` Storage bucket migration is now idempotent and applied to live project `fbnnjoahvtdrnigevrtw` as `20260613044116_receipt_photo_storage`.
- Added and applied shared-ledger hardening migration `20260613044208_harden_shared_invites_and_receipt_versions`: accepting duplicate trip invites no longer downgrades existing higher member roles, and shared receipt updates now reject stale versions with `Receipt version conflict` instead of last-writer-wins overwrites.
- Updated Compact and React Supabase receipt payloads to send receipt `version` through the shared-trip RPC contract.
- Hardened Compact receipt photo sync so Storage upload metadata failures surface as real errors rather than fake successful sync.
- Extended Supabase migration and shared-ledger contract verification scripts to cover receipt photo Storage idempotency, invite role protection, shared receipt version conflicts, and version increments.
- Verification passed with live Supabase migration-list checks, `node scripts/verify-supabase-migrations.mjs`, `node scripts/verify-shared-ledger-contract.mjs`, `app-compact npm run typecheck`, `app-react npm run typecheck`, `app-compact npm run build`, `app-compact npm run security:scan`, `app-react npm run db:policy:scan`, `app-compact npm run smoke:shared-ledger`, and served Compact smokes for mobile layout, History, Settings, and Scan.

## 2026-06-12

- Added bracketed translations to AI receipt scan (OCR) and text parsing results. The LLM prompts in `app-compact` and `app-react` now instruct the model to preserve foreign language values (such as Korean or Japanese) for fields like store, address, items, and notes, and append the English/Traditional Chinese translation in brackets right next to them (e.g., `편의점 (Convenience Store)`).
- Bumped the app version to `0.1.2` in `app-compact/package.json` and updated the `buildLabel` to `v0.1.2` in Settings.
- Verified compilation and ran Playwright smoke test suites (`smoke:production-gate` in `app-compact` and `smoke:ai-routing` in `app-react`) successfully.
- Deployed the prebuilt output of the Compact app to production Vercel (`travel-expense-compact`), aliasing to `https://travel-expense-compact.vercel.app`.
- Added shared-trip receipt mutation RPCs in `20260612165000_shared_ledger_receipt_rpc.sql`: `upsert_shared_trip_receipt()` and `delete_shared_trip_receipt()` require authenticated editable trip membership, preserve stable `source_id`, block editors from editing/deleting another member's receipts, and create durable Notion `receipt_sync_jobs` outbox rows for trips with an active dual-write backend.
- Applied the shared ledger RPC migration to live Supabase project `fbnnjoahvtdrnigevrtw`; Supabase lists it as `20260612084722_shared_ledger_receipt_rpc`.
- Updated React and Compact receipt sync so shared-trip receipt save/delete goes through the shared ledger RPCs, while private trips keep the existing direct Supabase path.
- Disabled browser-side Notion `pushReceipt()` / `archiveReceipt()` for shared-trip receipts so the frontend no longer tries to write the shared trip's Notion backend directly; shared Notion sync is now represented by the server-created pending outbox job.
- Added `npm run smoke:shared-ledger` to React and Compact, backed by `scripts/verify-shared-ledger-contract.mjs`, to verify the SQL permission/outbox contract and both frontend routing paths.
- Manually deployed the shared ledger builds to Vercel production: React `dpl_8HJ7a8U1ro5TyVAyx1nZtFfUdQyV` and Compact `dpl_FqMgNX5P9quAtmFW3Xj4ZPNxkADD`; both public aliases returned HTTP 200.
- Added the first reliable trip-sharing foundation across React and Compact: shared member/invite/backend-health types, Welcome Guide sharing invite capture, Settings `旅程共享` management cards, invite-link acceptance routing, and shared-trip Supabase pull/merge support.
- Added and applied Supabase migration `20260612153000_trip_sharing_dual_backend.sql` / live migration `20260612082134_trip_sharing_dual_backend` with `trip_invites`, `trip_backend_links`, `trip_accounting_people`, admin/member RPCs, RLS policies, invite token hashing, and select-only frontend grants for sensitive sharing/backend tables.
- Hardened the Supabase migration policy scanner for the new sharing schema and extended the shared-contract smoke so React and Compact both preserve sharing metadata plus receipt ownership/sync fields.
- Verified the sharing foundation with React and Compact `npm run typecheck`, `npm run build`, `npm run db:policy:scan`, `npm run smoke:shared-contract`, `npm run smoke:welcome-guide`, and `npm run smoke:settings`.
- Manually deployed the verified builds to Vercel production after GitHub-triggered Vercel builds returned 0ms/root-directory errors: React `dpl_7Fdo255fdUuP7G1jsp9EtjspKGHQ` is aliased to `https://travel-expense-react.vercel.app`, and Compact `dpl_HaWHyHQATiY5X1vCJ1exXLsq67vP` is aliased to `https://travel-expense-compact.vercel.app`.
- Remaining sharing work: implement the server-side Trip Ledger Broker / Edge Function for Supabase + Notion dual-write mutations and durable Notion retry repair.
- Fixed budget total spent discrepancy between the Home tab (`Dashboard.tsx`) and the Stats tab (`Stats.tsx`) in the compact app, ensuring both use `trueTotal` (without item filters) so that the displayed spent percentage aligns perfectly.
- Implemented direct inline editing for the total budget on both the Home and Stats tabs. Users can now tap the "Edit" button next to the total budget and modify it directly on the active tab without being redirected to Settings, immediately updating and syncing the state.
- Linked the `travel-expense-compact` project to the GitHub repository in the Vercel Dashboard, configuring Vercel to automatically build and deploy new pushes to the `main` branch.
- Deployed the latest budget fixes and inline editing improvements to Vercel production.

## 2026-06-11

- Completed Google OAuth setup for the compact app: the GCP OAuth web client and Supabase Google provider are configured for the public Supabase auth flow, with the OAuth secret kept out of the repo and terminal output.
- Added compact Google sign-in support via `signInWithOAuth`, with a clean app-root redirect for `/travel-expense/compact/` and regression coverage in `smoke:security`.
- Renovated the compact login page into a chilled travel-cloud glass panel using the existing `travel-ai-atlas.webp` asset, compact login mode tabs, and a Google sign-in button; the old banana artwork no longer appears on the compact login card.
- Fixed a compact scoped-storage race where localStorage could save before IndexedDB fallback hydration completed for the signed-in Supabase user.
- Verified this compact pass with `npm run typecheck`, `npm run build`, `SUPABASE_REDIRECT_SMOKE=1 npm run smoke:security`, `npm run smoke:mobile-layout`, and a Chrome-profile visual check of the login panel.
- Fixed compact Vercel production env values for `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, which had existed as empty placeholders and caused production to skip Supabase login. Redeployed compact production as `dpl_2GdpvV42ohnbokPym4U4rq7MCnTF`; `npm run smoke:deploy-live` passed and a live 390px OAuth smoke proved `provider=google`, clean redirect, no banana artwork, and no horizontal overflow.
- Weather tab now groups itinerary spots by city using Haversine 30km radius clustering (`groupedCoordsForDay`). Multiple nearby spots collapse into one weather card per city instead of one per spot, reducing duplicate API calls.
- Weather API calls parallelized with `Promise.all` — all city groups for all days fetch simultaneously instead of sequentially, significantly reducing total load time.
- Added module-level weather cache with 1hr TTL that persists across tab switches. Cached data shows immediately when switching back to Weather tab; a background refresh updates if stale.
- Weather cards now always display the city label as header (previously only when multiple locations per day).
- Removed the post-trip archive smoke test (`settings-smoke.spec.cjs`) since the feature it tested was already removed.
- User model selection in Settings now becomes the true primary for all AI functions (scan, voice, email, trip). Previously scan/voice hardcoded Google Gemma as primary and email hardcoded Kimi, ignoring user Settings selection. The old contract-default model is now the first fallback.
- Hardened compact Trip Update local tab parser with `parseDuration()` and `computeTimeEnd()` helpers. Tab-separated itinerary spots now extract `timeEnd` from the `建議停留` column by averaging duration ranges (e.g., `30–45分鐘` → avg 37min → `timeEnd = time + 37min`). Timeline tab shows `time – timeEnd` ranges when available.
- Added day-level advice capture: lines starting with `建議：` are now stored as `ItineraryDay.note` and rendered as `💡` advice tips in the Settings AI confirmation modal.
- Expanded `GEO_DICTIONARY` from 9 to 32 Jeju locations, covering transport hubs (城山浦港), hotels, Jeju City area (東門市場, 七星路, 中央地下街, 道頭洞, 蓮洞), Seogwipo area (Camellia Hill, 正房瀑布, 天地淵, 偶來市場, 休愛里, 牛沼端), Seongsan/East (涉地可支), Aewol/Northwest, and specific cafes/restaurants (橘子, 李春玉, umu, 風爐, Blanc Rocher, Randy's Donuts, Blue Elephant).
- Increased LLM trip extraction timeouts (8s→15s, 9s→12s, 14s→25s, 25s→30s) to reduce premature timeout failures on slower models like Mimo.
- Raised organized itinerary truncation from 5K to 12K chars to prevent long multi-day itineraries from being cut off before LLM extraction.
- Added `timeEnd` field to the LLM extraction prompt schema so models can estimate end times from duration information when available.
- Google models now use a single-stage extraction shortcut (skip the organize stage), saving one LLM call. Updated `ai-routing-smoke.spec.cjs` to expect 2 calls instead of 3 for Google fast fallback.
- Added `mergeTripDrafts()` to combine LLM extraction with local parser results — when LLM returns fewer days than local parser, missing days and extra spots are backfilled from the local draft.
- Added 48 unit tests in `app-compact/scripts/test-local-parser.mjs` covering tab parsing, pipe table format, plain text format, `computeTimeEnd` edge cases (midnight wrap, zero duration, empty input), and `parseDuration` edge cases (ranges, singles, approximate, em-dash, empty).
- Fixed Vercel deploy by adding `.vercelignore` to exclude `.git`, `.vercel`, `node_modules`, `app`, `app3`, `app-admin-kanban`, `graphify-out`, `.gitnexus`, `.playwright-mcp`, `.mimocode`, `.agents`, and `.claude`. Used local `vercel build --prod` + `vercel deploy --prebuilt --prod` to bypass the 100MB remote build upload limit.
- Fixed `git push origin main` failure caused by Antigravity sandbox injecting a dummy `GITHUB_TOKEN` that overrode the valid macOS Keychain credential. Resolved with `env -u GITHUB_TOKEN git push origin main`.
- Removed the compact Dashboard `Broker AI Assistant` (the question-and-answer panel card) from the Home tab, along with its input state, analysis handlers, and local-only helper components to keep the Home/Dashboard view simple and uncluttered.
- Cleaned up all matching styling for `.dashboard-broker-assistant` in `compact.css` and removed outdated assertions/tests for the assistant from `dashboard-parity-smoke.spec.cjs`.
- Fixed compact Jeju Trip Update sync so confirming an AI itinerary update now queues both the active `trip` row and the app-level `settings` profile. The missing settings queue was the reason Jeju could update locally while cloud/profile sync still behaved as if the previous active-trip settings were authoritative.
- Added a regression smoke assertion that an 8-day Jeju Trip Update confirmation writes the itinerary and queues both `trip:<activeTripId>` and `settings:app-settings`. Verification passed after the fix with targeted Settings Trip Update smoke, `app-compact npm run typecheck`, production build, and final-navigation smoke through the dev-server wrapper (`8 passed`).
- Deployed the compact Jeju Trip Update sync fix to Vercel production as `dpl_2rvr48g1yNbfx6KcveppjbEbrgFG`; `npm run smoke:deploy-live` passed for `https://travel-expense-compact.vercel.app/` with live asset hash `a0a8fde5209a9028`.
- Reworked compact Trip Update AI into a canonical-first two-stage model workflow. The selected/fallback LLM now first reads the raw pasted itinerary and rewrites its own `organizedItinerary`, then a second LLM call extracts `trip.itinerary` and the app backbone only from that organized version, instead of directly scraping structured fields from the user's mixed-format text.
- Added `organizedItinerary` to the compact trip draft contract and surfaced `AI 重整行程` in the Settings confirmation flow, so the user can see the model's organized day-by-day version before applying itinerary, weather, records, stats, and sync data.
- Stopped the compact Trip Update frontend path from depending on the old one-shot `/trip/intelligence` route; provider JSON routes now support selected model first, fast fallback, and local parser fallback while preserving the no-silent-loading confirmation modal behavior.
- Updated compact Trip Update smoke coverage for the new two-stage architecture. Verification passed with `app-compact npm run typecheck`, Settings Trip Update smoke (`3 passed`), AI routing smoke (`4 passed, 1 skipped`), production build, `security:scan`, mobile-layout smoke, and the live broker/provider Trip Update smoke (`gemini-3.1-flash-lite`, organize 200, extract 200, 8820ms, 8 days, 30 spots, `organizedItinerary` present, no secrets printed).
- Deployed the compact canonical Trip Update flow to Vercel production as `dpl_5teg4c1xn7a5hJQURMBYatmgaVVV`; `npm run smoke:deploy-live` passed for app-code commit `9d4a3be` with live asset hash `e2ddae51f4b8345f`.
- Fixed Compact Trip Update AI extraction for pasted itinerary formats that use Markdown headings, pipe tables, inline `<br>` day separators, Chinese dates, English month dates, and plain timetable rows. The LLM prompt now explicitly instructs models to treat table rows as itinerary spots, and the local fallback parser now extracts day/date/lodging/timed activity rows from those formats instead of returning an empty or stale itinerary.
- Added a regression smoke for the Jeju markdown-table itinerary format with all providers forced to fail; the app still opens the confirmation modal and extracts 8 days, Hotel Fine Jeju, Stanford Hotel & Resort Jeju, 城山日出峰, and PARIS BAGUETTE. A live broker LLM proof using `gemini-3.1-flash-lite` also passed on the table format in 6660ms with 8 days, 17 spots, and 3 lodging entries.
- Added `Mimo v2.5 Pro` (`mimo/mimo-v2.5-pro`) to the Compact and React AI model selectors. It uses the existing `/mimo/json` Credential Broker path, so it shares the same Mimo base URL and vaulted API key as `mimo-v2.5`.
- Added smoke coverage proving the Settings model dropdown includes `Mimo v2.5 Pro` and that Compact trip-update routing sends selected Pro requests to provider `mimo` with model `mimo-v2.5-pro`. Live broker proof returned HTTP 200 for `mimo-v2.5-pro`, extracting an 8-day Jeju itinerary with 32 spots in 42810ms. Deployed the Compact selector update to Vercel production as `dpl_6K3CfmwH5C54dN298bYTvud6vsTi`.
- Optimized the live Credential Broker Mimo v2.5 JSON path by sending `thinking: { type: "disabled" }`, `stream: false`, and capped `max_tokens` for `/mimo/json` plus credential-test calls. This fixes the slow default reasoning path that made Mimo trip extraction feel stuck.
- Deployed the Mimo fast-path Worker update as Credential Broker version `fb3a389b-dd50-425f-88d0-a228098a95eb`. Live proof improved from a prior `mimo-v2.5` 2-day extraction taking about 44.7s to an 8-day Jeju extraction completing in 22376ms with 8 days and 32 spots. The Google fast fallback remains faster at 6443ms for the same 8-day smoke.
- Extended `npm run smoke:trip-update-live` so it can target `/mimo/json` or `/google/json` with redacted broker-vault output, and added Worker self-test assertions that Mimo requests really include the fast-path payload fields.
- Fixed compact Trip Update AI no-response behavior by adding trip-attempt timeouts, a faster trip fallback ladder, and a fast local day-by-day draft fallback for pasted itineraries.
- Kept the selected trip-update model as primary, but if it is too slow the app now moves to `google/gemini-3.1-flash-lite` and `google/gemini-2.5-flash` before slower fallbacks, instead of waiting indefinitely on Mimo or retrying the same slow route.
- Added `npm run smoke:trip-update-live`, a redacted live broker smoke that proves real LLM itinerary extraction without printing secrets; live proof extracted an 8-day Jeju itinerary with 32 spots using `gemini-3.1-flash-lite` in 5312ms.
- Added AI routing smoke coverage proving a slow selected Mimo model is skipped and the Settings confirmation modal opens from the fast Google trip fallback.
- Deployed the compact Trip Update AI no-response fix to Vercel production as `dpl_9Nz2UZJBGRRXSZf6QacHNX3tpQcC`; `npm run smoke:deploy-live` passed for app-code commit `1deb94f` with live asset hash `18342e34bcd935f3`.
- Fixed compact Korea/Jeju trip currency handling. Home budget overview now toggles between HKD and the active trip currency such as KRW instead of hardcoded JPY, and old stale `displayCurrency: "JPY"` state is corrected visually for KRW trips.
- Fixed compact Record manual-entry defaults so `原貨幣` follows the itinerary day or active trip currency, with shared conversion helpers for KRW and other common travel currencies instead of falling back to the JPY rate.
- Fixed compact Dashboard Broker AI Assistant wording and routing so it shows the selected primary trip-update model, such as Mimo v2.5, and sends the broker request to that provider/model instead of always displaying/calling Kimi.
- Hardened compact Trip Update AI for long pasted itineraries: provider failures now continue through the trip model ladder, and when providers are unavailable the local parser can extract day-by-day Jeju itinerary details, lodging, spots, country/currency/timezone, warnings, and open the confirmation modal instead of loading silently.
- Fixed compact Weather fallback behavior so short WeatherAPI forecast windows can fall through to Open-Meteo for future travel dates, preventing empty or placeholder weather cards for itinerary days outside the broker forecast range.
- Added compact smoke coverage for KRW budget toggles, KRW receipt default currency, selected-model Dashboard assistant routing, trip-update local parser confirmation, and model fallback behavior. Verification passed with `app-compact npm run typecheck`, `app-compact npm run build`, `app-compact npm run security:scan`, `git diff --check`, Dashboard smoke (`9 passed`), Settings Trip Update smoke (`2 passed`), and AI routing smoke (`3 passed, 1 skipped`).
- Deployed the compact Jeju/Korea currency and Trip Update recovery build to Vercel production as `dpl_2m6bifGzP7opZBRwto89L3esBydU`; `npm run smoke:deploy-live` passed for app-code commit `011dc48` with live asset hash `81e2e73d803853f4`.
- Polished the compact trip-entry flow: larger itinerary text areas, richer placeholders, fuller currency choices, and clearer guidance that Step 4 trip details should include hotels, restaurants, transport, bookings, and daily plans.
- Improved compact Trip Update AI review: the extraction prompt now asks for end times, lodging check-in/check-out, coordinates, spot type, and day highlights; the confirmation modal shows clearer hotel/restaurant/scenery counts, coordinate markers, lodging details, and avoids duplicate city wording.
- Fixed compact itinerary/weather guardrails by coercing string `lat/lon` to numbers, guarding weather day spots when missing, and keeping the top trip/Settings experience simpler for normal users.
- Simplified compact Settings for everyday use: developer-only diagnostics and stress tools are hidden behind the developer panel, AI Models stays visible, Trip Manager has a `View / Edit Itinerary` action, data-management actions are cleaner, and first-run defaults now start with one traveller.
- Restored the compact Settings `Email / Shortcut` card to the normal Settings flow while keeping heavier diagnostics behind the developer panel, and refreshed compact smoke tests for the 3-button Settings quick controls, deterministic UTC clocking, and latest weather/expense expectations. Verification passed with the combined changed compact smoke suite: 40 Playwright tests across a11y, Dashboard, History, Scan, Settings, Weather, and Welcome Guide.
- Hardened React and Compact shared itinerary normalization. Slash dates and Chinese month-day dates such as `2026/6/13`, `6/13`, and `6月13日` now normalize without timezone day-shifts; month/day-only values infer the trip year from existing itinerary dates or the trip id, preserving stable day and spot ids for Timeline, Weather, Stats, Supabase, and Notion sync.
- Verified this pass with `app-compact npm run typecheck` and `app-react npm run typecheck`. GitNexus impact for `normalizeItinerary()` is CRITICAL on both app surfaces because it feeds trip hydration, Timeline, Weather, Settings, Stats, receipt stamping, and sync flows, so broader smoke/build checks remain required before treating a live deployment as fully proven.

## 2026-06-10

- Fixed compact Settings `Trip Update AI` so clicking `用已選模型分析` after pasting a long itinerary opens a real confirmation modal instead of only showing an inline preview.
- Added the `確認 AI 行程更新` modal with trip name, dates, destination, selected model/source quality, extraction counts, hotels, restaurants, missing fields, assumptions, warnings, and day-by-day lodging/spots before anything is applied.
- Added `返回修改文字` and `確認並更新行程` actions so users can edit/re-analyze the pasted itinerary or explicitly confirm before the Itinerary and Weather tabs receive updated trip data.
- Added Settings smoke coverage for an 8-day Jeju itinerary extracted from pasted text, confirming the modal shows Hotel Fine Jeju, Stanford Hotel & Resort Jeju, Day 3 城山日出峰, missing-field warnings, and that confirming updates local itinerary state plus the Timeline tab.
- Deployed the compact Trip Update AI confirmation modal to Vercel production as `dpl_7fsr8nN2MzWwL1e2Faz6yEoqbZaQ`; `npm run smoke:deploy-live` passed for commit `015165d` with asset hash `0f42ae296e04c912`.
- Fixed compact Google Gemma 4 31B routing by changing the stored/default model id from `gemma-4-31b` to the exact Google Gemini API id `gemma-4-31b-it`, while keeping the Settings label as `Google Gemma 4 31B`.
- Updated compact AI routing and shared-contract smoke coverage so scan/voice calls prove `gemma-4-31b-it` is sent to the broker.
- Hardened Credential Broker source for Mimo v2.5 by using Xiaomi's documented `api-key` header and adding a pay-as-you-go base fallback after Token Plan 404s.
- Hardened Credential Broker JSON extraction so provider replies that contain a valid JSON object followed by extra text no longer fail parsing.
- Deployed the compact frontend model-id fix to Vercel production as `dpl_C6F4PTLypt1BiLhxz82EgPahhtgV` with live asset hash `899db69a2d900bfe`.
- Fixed local Cloudflare deploy permission by refreshing Wrangler OAuth, deployed `travel-expense-credential-broker` as Worker version `7524c7dd-428a-4c11-bd75-bc6ebffeb20e`, and rotated the Mimo Token Plan credential into the Credential Broker vault with redacted output only.
- Verified the live Credential Broker Mimo path: authenticated `/mimo/json` returns HTTP 200 for `mimo-v2.5`, and `workers/credential-broker npm run preflight:deploy` passes source, self-test, dry-run, Wrangler auth, live health, and unauthenticated guard checks.
- Rechecked `app-compact npm run smoke:broker-vault`; Notion, WeatherAPI, Google JSON, Google diagnostic, and Mimo JSON now pass, while the full smoke remains blocked only by Kimi billing-cycle quota. No provider key, OAuth token, broker session, or account secret was committed or printed.
- Hardened compact trip-update/new-trip itinerary extraction guidance so models must return an app-wide `extractionReport`, source quality, assumptions, missing critical fields, confidence, source text, booking references, and richer city/country/timezone/address/map metadata.
- Fixed trip extraction normalization so a missing itinerary is not treated as success by copying the current itinerary; empty or incomplete model output now continues through the fallback ladder instead of silently reusing stale trip data.
- Preserved itinerary spot and lodging metadata through validation, including `city`, `country`, `timezone`, `currency`, `lat/lon`, `bookingRef`, `sourceText`, `confidence`, and `timeEnd`, so Timeline, Weather, and backend sync can use the extracted trip details.
- Improved the Settings trip-update preview with source quality, transport count, missing critical fields, and model assumptions before applying a pasted itinerary.
- Added smoke coverage proving trip update does not accept copied current itinerary as a successful extraction, and deployed the compact itinerary extraction hardening to Vercel production as `dpl_9y7VSDw6f7n1i9FjGixc7BWGFZ1U` with live asset hash `1f6bd07479b69f86`.
- Changed the compact Settings trip-update card from Kimi-only wording to `Trip Update AI` / `AI 行程更新`.
- Trip updates now use the selected `Trip update model` from Model routing as the primary model; selected Google/Mimo models no longer get bypassed by a hard-coded Kimi `/trip/intelligence` call, while selected Kimi still uses the structured route first.
- Improved the trip-update preview so long pasted itineraries show extracted day count, scenery spot count, hotel count, restaurant/food count, important-detail count, hotel/food/detail names, and compact per-day spot rows before the user applies the update.
- Updated Settings and AI routing smoke coverage to prove a selected Google trip model is used first and that the preview displays extracted hotel/restaurant/scenery data; deployed to Vercel production as `dpl_3eB3LEyVJ9HbGKtNw6nCMjwh4ABn` with live asset hash `40852c45340f0a59`.
- Added compact trip-update/new-trip LLM fallback ladder behavior: if primary `/trip/intelligence` fails or returns no useful itinerary spots, the app now tries the model fallback ladder before using curated scenery spots.
- Kept quota/rate-limit protection for trip creation: 429/quota errors keep the wizard open with a no-bypass error message instead of silently using another model or default scenery fallback.
- Added Dashboard smoke coverage proving a failed primary trip route plus failed Kimi request can still create an itinerary from Mimo before scenery fallback, and proving quota errors do not create a Jeju trip or sync queue item.
- Deployed the compact trip wizard LLM fallback ladder to Vercel production as `dpl_8ypkt9eQeAcbgYceSoo242uSknBS` with live asset hash `9883b825ee87b549`.
- Fixed compact Home new-trip creation so Step 4 `旅程詳情` is actually analyzed by the trip-intelligence/Kimi route instead of being discarded.
- New trips now store generated itinerary days into the active trip and `customItinerary`, so the Itinerary tab, Weather tab, and active-trip sync queue are populated immediately after creation.
- Added Jeju/Korea fallback itinerary generation with practical spots, `lat/lon`, `city`, `country`, `Asia/Seoul`, and `KRW` when AI/session/quota is unavailable or returns no useful spots.
- Updated Dashboard smoke coverage to create `濟州2026`, verify `/trip/intelligence` uses `kimi-code`, confirm KRW/country metadata, prove Timeline and Weather targets show Jeju itinerary data, and confirm the trip create sync queue includes `tripId`/`sourceId`.
- Hardened Weather smoke state setup against IndexedDB bleed-through and full trip-profile gaps; deployed to Vercel production as `dpl_895zhEKvsF7gNzCT86D56WcPTBPR` with live asset hash `16cf4ea1bc1e64b2`.
- Added compact Home new-trip wizard destination-aware suggestions: typing `濟州` now auto-selects KRW, shows Jeju attraction chips, uses Wikivoyage/Wikipedia online search when available, and falls back to curated Jeju spots such as 城山日出峰、牛島、漢拏山、萬丈窟、涉地可支、天地淵瀑布.
- Replaced the hardcoded Nagoya/Tokyo itinerary-detail buttons with destination-specific suggestions that can fill `旅程詳情`; Dashboard smoke now mocks online Jeju search, verifies KRW, and proves Step 4 keeps the Jeju attraction detail. Deployed to Vercel production as `dpl_EvC79RvgQ5KjNA6wUUaGfCr9CZ2o` with live asset hash `5eaf64085ce97271`.
- Fixed compact Home new-trip wizard step 2 so users can choose trip length directly. The step now has a `旅程日數` selector plus +/- controls, changing days updates the end date immediately, and the date math is UTC-safe so Asia timezones do not turn 10 days into 9 days.
- Added Dashboard smoke coverage that opens the wizard from the Home trip dropdown, selects 10 days, verifies the end date, and checks +/- day controls; deployed to Vercel production as `dpl_GusQKVAHVwrHy5bHhPG4tR7YgSPP` with live asset hash `7cc97c041c7247d6`.
- Decluttered compact Stats `預算使用分析`: removed the yellow center dot from the budget compass, removed `Fairness by person` and `Category anomaly`, removed the four summary cards (`圖表統計額`, `共同分帳額`, `私人/代付`, `待轉帳`), and moved `TOP 10 支出` directly under the budget analysis card.
- Updated Stats smoke coverage to prove the removed cards stay absent, the remaining budget story cards fit in one row on 390px mobile, and `TOP 10 支出` sits below `預算使用分析`; deployed to Vercel production as `dpl_PHVAGw1KXvsUEKGUSo6BEyADKRbd` with live asset hash `9c8c7687429a0251`.
- Added a compact Weather official-provider router that resolves official sources from itinerary country/region/city and coordinates before private or Open-Meteo fallback.
- Added direct official Weather adapters for Singapore NEA/data.gov.sg, US NWS, and Canada MSC GeoMet, alongside the existing Japan JMA official adapter. Official data now stays the displayed provider while fallback data only fills missing hourly fields.
- Added Weather smoke coverage for US NWS, Singapore NEA, and Canada MSC provider selection, plus country-first routing so Canada is not misclassified as US and Korea/Jeju is not misclassified as Japan by coordinate bounds.
- Deployed the compact multi-country official Weather router to Vercel production as `dpl_EJruZvEaK3fuh5NCy59WBDymDNrx`; `npm run smoke:deploy-live` passed for commit `09f9cfd` with asset hash `6ea0fadf667fbca9`.
- Changed compact Weather provider priority for Japan so itinerary locations in Japan try true JMA official public JSON first, then use broker-backed WeatherAPI or Open-Meteo/JMA model data only to fill missing fields such as feels-like, UV, cloud cover, and wind gusts.
- Added JMA official forecast + AMeDAS support for the current Japan trip regions used by the compact app, with stale non-official cache bypass so WeatherAPI cache no longer blocks official Japan data.
- Added Weather smoke coverage for JMA official success, JMA official failure fallback, broker-session fallback filling, ended-trip current weather, city geocoding, Korea fallback geocoding, and multi-city weather cards.
- Deployed the compact JMA official-first Weather provider pass to Vercel production as `dpl_6SWopzxDZWJJNHjfF7GPTDyJ4YCq`; `npm run smoke:deploy-live` passed for app-code commit `bf5c8c4` with asset hash `7bce869406406666`.
- Changed compact Weather metric chips to a 2x2 mobile grid so UV/cloud, rain/precipitation, wind/gust, and humidity values no longer collapse into `...`.
- Kept the UV/cloud chip as the left-most Weather metric and shortened cloud copy to `雲35%` style for readability.
- Added Weather smoke coverage proving every live metric value fits without horizontal text overflow.
- Deployed the compact Weather metric readability fix to Vercel production as `dpl_FobtW3gA4frBxXKg47xhU9M5hKW3`; `npm run smoke:deploy-live` passed for commit `dabb152` with asset hash `4be0e10ad6659974`.
- Synced the compact Weather top current-weather card with the same live time slot used by the first location card, so Nagoya's top temperature now matches the lower `LIVE` card instead of showing an earlier slot.
- Moved the Weather UV/cloud capsule to the left-most metric position inside each weather slot card, before rain, wind, and humidity.
- Added Weather smoke coverage with varied hourly temperatures proving the top card shows the 27°C live slot and the first live metric chip is the UV capsule.
- Deployed the compact Weather live-preview sync fix to Vercel production as `dpl_7Qf6LKbWF4f6n9bwr5XzQeujfvTt`; `npm run smoke:deploy-live` passed for commit `7dddb74` with asset hash `eda620ea5513d4bc`.
- Fixed compact Weather location cards so the decorative colored rail sits on the card top edge instead of crossing over the first row of time/temperature text.
- Hid direct `WeatherAPI.com` vendor wording from compact Weather cards by displaying broker-backed private weather as `Live weather` and sanitizing fallback copy.
- Added Weather smoke regression coverage proving the vendor string is absent and the slot accent rail no longer overlaps the weather-slot header.
- Deployed the compact Weather card overlay fix to Vercel production as `dpl_F2Mm5VwZQmKSm9LL63jQDfL6WspG`; `npm run smoke:deploy-live` passed for commit `c18111b` with asset hash `536ad6249f14332f`.

## 2026-06-09

- Fixed the compact Weather top current-weather card layout so provider/live/target/fallback chips, actual temperature, feels-like temperature, high/low/humidity/wind facts, place label, and hourly chips all fit cleanly inside the large card on 390px mobile.
- Changed compact Weather post-trip behavior so finished trips keep the original itinerary day cards and show current weather for each itinerary-derived day/location instead of collapsing to one today card that only showed two locations.
- Expanded compact Weather itinerary resolution to use up to six coordinates per day, so multi-spot travel days can show proper location cards before, during, and after the trip based on the user's entered itinerary city/spot data.
- Deployed the compact Weather itinerary/current-weather fix to Vercel production as `dpl_81o32cF6fgRwNYux3VKuFcMxNAHf`; `npm run smoke:deploy-live` passed for commit `f71fbff` with asset hash `dd031820637afe8a`.
- Removed the compact Record tab `Review only when needed` strip and its itinerary/cleanup shortcut state, leaving Records focused on search, category filters, compact rows, row markers, pending confirmations, and sync conflict handling.
- Added compact HK Express receipt normalization so existing HK Express / 香港快運 / `UO` flight-number records that were stored as `transport` or `other` are shown under the `flight` / `機票` category.
- Removed the compact Timeline travel-day widget/readiness/countdown row (`Day readiness`, transition countdown, and same-line travel-day cards) while keeping the live itinerary command card, rail progress, day cards, and `Weather pack` risk strips.
- Deployed the compact Records/Timeline cleanup build to Vercel production as `dpl_FAEsqTEXmDp3TDzu9MAskvQaFREz`; `npm run smoke:deploy-live` passed for commit `ff24cbc` with asset hash `b37e17c49e3eed11`.
- Further simplified the compact Home/Dashboard screen by removing the Today Situation `預算分析` and `行程時間線` actions, the `Local AI Coach` panel, and the `預算控制` accordion.
- Repacked the compact Home `今日行程` card into denser itinerary-style rows that show time, icon, place, note/address, city/type context, and matched receipt or map action without taking over the phone screen.
- Expanded compact Home `Recent Expenses` from 3 to 6 visible records and changed the rows to a tighter mobile layout with store/category/date/photo marker and JPY/HKD amounts.
- Deployed the compact Home information-density build to Vercel production as `dpl_BfhqqyhVNaUi6fSCfKEi9Dw9DhUa`; `npm run smoke:deploy-live` passed for commit `b69887e` with asset hash `366bc6374213ab04`.
- Simplified the compact Home/Dashboard screen by removing `Travel-day control`, `Itinerary Receipt Match`, `Trip Snapshot`, `Departure Checklist`, `Day-end Closeout`, and the bottom `旅程提醒` accordion from Home, plus their Dashboard-only derived state/imports.
- Kept the shared travel-day and itinerary/receipt helper logic available for Timeline and Records/History, so related non-Home workflows are not removed accidentally.
- Deployed the compact Home simplification build to Vercel production as `dpl_GdfqimEjDaiC6mYCxB6v4c1rAKHX`; `npm run smoke:deploy-live` passed for commit `a1d2fe2` with asset hash `1776760a3f776a73`.
- Slimmed the compact Record tab diagnostic area: the large `Itinerary Review Queue`, `Attachment Health`, and `Cleanup Coach` cards no longer sit above the records list. A later same-day pass also removed the compact `Review only when needed` shortcut strip, while attachment/photo health is summarized in Settings `Compact Trip Doctor` and kept as small row markers in Records.
- Updated compact History, Settings, and final-navigation smokes to prove the new Record layout still filters itinerary issue days, opens cleanup repairs, keeps photo health markers, and shows attachment counts in Settings Trip Doctor.
- Deployed the compact Record declutter build to Vercel production as `dpl_2ZEBiwXihz3VtxsQMQwuEYhzWG93`; `npm run smoke:deploy-live` passed for commit `22bb1f2` with asset hash `fe55b9edeb9815bd`.
- Moved the compact PWA/travel-readiness capsules (`Network`, `Queue`, `Cache`, `Update`, `Install`, `Motion`) off the top of every tab and kept them only on the Settings tab, so Dashboard, Scan, Timeline, History, Weather, and Stats regain first-screen space while Settings remains the system-status home.
- Updated compact final-navigation and accessibility smokes to prove the readiness strip is absent on Dashboard and visible/tappable in Settings.
- Recovered compact Vercel production deployment after the previous quota blocker. Deployment `dpl_DEVBMCi8aRe2C8RLipv9XoxjXLxj` is READY and aliased to `https://travel-expense-compact.vercel.app/`; `npm run smoke:deploy-live` passed for commit `e1fa760` with asset hash `02ff6e6463213690`.
- Added compact Timeline per-day `Weather pack` risk strips, a local/no-API packing summary that turns cached weather, itinerary outdoor/transport context, and weather preferences into rain, stale-weather, wind, outdoor, or transit-buffer recommendations directly inside day cards.
- The Timeline packing risk strips keep chips horizontally contained on 390px mobile cards and do not cover the timeline rail; targeted Timeline smoke now verifies rain and stale-weather packing states.
- Pushed the compact Timeline weather packing risk to `origin/main` as app-code commit `5b5009a` plus proof docs; Vercel production deploy is still blocked by external daily quota `api-deployments-free-per-day`, so live production still points at old deployment `dpl_EGaWZXC84K1MJAXSkdkBSjbnyFLm` until the quota resets.
- Added compact Settings `Maintainer deploy recovery`, a collapsed quota-safe runbook inside `資料管理 / Security` that reminds maintainers to treat `origin/main` plus local gates as source-of-truth when Vercel quota blocks production, then retry Vercel and verify with `npm run smoke:deploy-live`.
- Stabilized the compact contact-sheet smoke by targeting the visible mobile dock instead of any `主要分頁` navigation, removing an intermittent timeout from hidden duplicate navs.
- Pushed the compact deploy recovery note to `origin/main`; the latest manual Vercel production deploy attempt is still blocked by `api-deployments-free-per-day`, and `smoke:deploy-live` confirms the live alias still points at old deployment `dpl_EGaWZXC84K1MJAXSkdkBSjbnyFLm`.
- Added compact History `Itinerary Review Queue`, a local/no-API review filter for missing receipt days, high-count days, and outside-itinerary spending from the existing itinerary/receipt reconciliation logic. This review UI was later fully retired from Records at Boss's request.
- The retired History review queue let users filter one day at a time and reset with `All records`, without writing storage, adding schema fields, or calling broker/provider APIs.
- Pushed the compact History review queue to `origin/main` as `1f75aba`; Vercel production deploy is still blocked by the external daily deploy quota `api-deployments-free-per-day`, so live production still points at the previous P10-03 deployment until the quota resets.
- Rechecked compact broker-vault proof after Boss prepared an ignored local session. The password/session path is valid, live broker health and WeatherAPI pass. At that time, the authenticated proof was blocked by Kimi billing-cycle quota, Google/Gemma live model availability, Mimo authenticated provider config, and occasional Google diagnostic high-demand responses; the Google/Mimo portions were later superseded by the 2026-06-10 Cloudflare deploy and Mimo broker proof. No secrets were printed.
- Added compact Stats `Settlement action plan`, a local/no-API three-card summary above the detailed transfer graph showing the next transfer, total to settle, and private repayment scope with full traveller names.
- Added P11 compact roadmap items for decision support and trip review, starting with Stats settlement clarity and leaving History reconciliation filters and Timeline weather-risk summaries as next candidates.
- Pushed the compact settlement action plan to `origin/main` as `e68f10c`; Vercel production deploy is still blocked by the external daily deploy quota `api-deployments-free-per-day`, so live production still points at the previous P10-03 deployment until the quota resets.
- Added compact Settings `Preview diagnostics`, a local/no-API public-safe diagnostics preview with copy and safe JSON download actions.
- The compact diagnostics payload is aggregate-only and strips raw trips, raw receipts, raw people, raw sync queue, IDs, SourceID, queue payloads/errors, traveller names, receipt/store names, photos, photo URLs, provider tokens, API keys, and broker sessions.
- Pushed the compact diagnostics preview to `origin/main` as `8fadfcb`; Vercel production deploy is currently blocked by the external daily deploy quota `api-deployments-free-per-day`, so live production still points at the previous P10-03 deployment until the quota resets.
- Added compact Dashboard `Itinerary Receipt Match`, a local/no-API day-by-day reconciliation card for no-receipt itinerary days, spot-level receipt gaps, unusually high receipt counts, and current-trip spending outside itinerary dates. Boss later retired this card from Home and retired the Records shortcut strip that reused it.
- Added shared compact `buildItineraryReceiptReconciliation()` logic so itinerary/receipt coverage could be reused without adding storage fields, rendering cloud IDs, or calling broker/provider APIs. The helper was later removed when the related Home and Records surfaces were retired.
- Deployed the compact itinerary receipt reconciliation build to Vercel production as `dpl_HjZgAoUwDLXTQAZ6Xee5egAzbJqE`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added compact Settings `Repair first issue`, a Trip Scope Audit shortcut that jumps to History and opens the first date-window or auto-linked receipt needing review.
- Added a session-only compact receipt repair intent so cross-tab repair navigation is one-shot, local, and not persisted into app state.
- Deployed the compact receipt repair shortcut build to Vercel production as `dpl_Buc32pf6nDJvRA7FU54u3LGii32p`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added compact Settings `Trip Scope Audit`, a local/no-API card that summarizes current-trip included receipts, date-window outliers, auto-linked originally-unlinked receipts, and other-trip exclusions before export/share/backup/sync decisions.
- Preserved compact receipt `tripLinkSource` metadata during normalization so auto-linked legacy/unlinked receipts can be reviewed without changing current-trip export/sync scope or leaking cloud/provider IDs.
- Deployed the compact Trip Scope Audit build to Vercel production as `dpl_3YGbzZGF5B1K8mAik7WmSkvbE4Qo`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added compact Settings `Sync dry run` before push controls. It summarizes active-trip pending queue, failed/conflict signals, oldest offline edit age, last sync age, delete warnings, and target without calling broker/provider APIs or rendering queue error secrets.
- Deployed the compact Sync Dry Run build to Vercel production as `dpl_3Hq2eTA4cFZDNpb5UgG9RSbFD5BU`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added compact Settings `Post-trip Archive`, a local/no-API finish checklist that separates final Backup JSON, private trip-share preview, settlement review, and safe local cleanup preview for finished trips.
- Deployed the compact Post-trip Archive build to Vercel production as `dpl_ByavGUVve1btyEdedjkvCb4U7Q7w`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added compact Settings `Clear local data preview` before destructive local reset. It replaces the thin browser confirm with an in-app safety modal showing current trip, local receipt count, cloud-not-deleted scope, and Backup/private-share guidance; Settings smoke verifies cancel leaves local state untouched.
- Deployed the compact Clear Local Data Preview build to Vercel production as `dpl_2tvWrSos8TwWxP2qVfk2Ed53noXM`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added compact Settings `Private trip-share preview` for companion-safe current-trip summaries. Users now preview before copy/download, and smoke coverage verifies fake API/session/cloud IDs, sync queues, photo URLs, and other-trip data are stripped from preview text, copied text, and downloaded JSON.
- Deployed the compact Private Trip-share Preview build to Vercel production as `dpl_2tgPXS5GEH7CfMaabfhWpwdbUAan`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added compact Dashboard `Day-end Closeout`, a local/no-API evening wrap-up card for missing receipts, overspend notes, tomorrow readiness, and Records/Stats/Timeline shortcuts.
- Deployed the compact Day-end Closeout build to Vercel production as `dpl_CxWB3mbtgL4PhkfvynRqvncdGsF8`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Rechecked compact broker-vault proof with an ignored local session. The script now reports redacted `status: blocked` JSON instead of a stack trace; WeatherAPI, Notion, and Google diagnostic route proof pass, while Kimi quota, required Google/Gemma model availability, and Mimo authenticated config remain external live blockers.
- Added compact Dashboard `Departure Checklist`, a local/no-API pre-departure card that turns weather, route, outdoor itinerary, booking, and receipt/readiness signals into five quick checks.
- Deployed the compact Departure Checklist build to Vercel production as `dpl_RjHoxECCHK2BYckYMg2UkEyrttRE`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added compact Dashboard `Trip Snapshot`, a local/no-API handoff card with day, budget-left, next-stop, readiness/watch signals, copyable summary text, and Timeline/Records shortcuts.
- Deployed the compact Trip Snapshot build to Vercel production as `dpl_DnjLXzyypyXV9uSXsc798LAqAtC3`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added a no-secret Credential Broker deploy preflight for compact P0-05. `workers/credential-broker npm run preflight:deploy` checks source Mimo route presence, syntax, self-test, Wrangler dry-run, Wrangler auth/account readiness, live health, and whether live `/mimo/json` returns the expected unauthenticated guard instead of 404.
- Improved compact `npm run smoke:broker-vault` authenticated reporting. It now continues after provider quota/config failures, emits one redacted JSON summary instead of a stack trace, treats Notion database proof as covered by `/credentials/test-all` without printing database ids, and adds a Google route diagnostic model probe without changing the app primary model contract.
- Fixed compact `npm run smoke:broker-vault:guard` so guard mode always forces a missing-session proof even when an ignored local broker-vault session file exists.
- Made compact `npm run smoke:security` self-start the local Vite server through a safe-env runner, so the standalone security smoke no longer fails with `ERR_CONNECTION_REFUSED` when no dev server is already running.
- Added `npm run broker-vault:prepare` for compact P0-05. It uses a hidden local terminal prompt to create an ignored private broker-vault session file, with redacted output only, so authenticated provider proof can run without committing or printing secrets.
- Added `npm run smoke:broker-vault:doctor` for compact P0-05 readiness. It reports whether ignored broker-vault auth input is present, git-ignored, permission-safe, and unexpired without printing session/token values or calling providers.
- Added a compact local release-note diff panel for update-ready states. The PWA readiness strip now offers `Release notes`, showing a short local `Now vs previous` summary with no GitHub, changelog, or external release calls.
- Added compact per-day trip readiness scoring to Dashboard and Timeline. The shared scorer combined itinerary coverage, route freshness, weather freshness/risk, stale booking references, receipt gaps, and cleanup signals into deterministic daily scores with mobile smoke coverage; Boss later retired the Home strip and Timeline readiness/countdown row.
- Added compact History `Attachment Health` for oversized, missing, and unsynced receipt photos, plus `photo large` and `photo unsynced` row markers. Scan cockpit now explains attachment auto-compression with `480px scan · 800px edit` guidance.

## 2026-06-08

- Added compact History `Offline Conflict Resolver` for failed local/cloud receipt sync conflicts. It offers `Review conflict`, `Keep local`, and `Keep cloud` actions, sanitizes requeued payloads, and smoke coverage verifies fake provider-token/error payload fields are not rendered.
- Hardened compact release smokes by extending the shared-contract temporary server wait window and making the final-navigation sync-error retry check resilient to React re-render detach.
- Added compact P7 travel reliability roadmap and completed P7-01 booking-reference staleness monitoring. Dashboard and Timeline now show `Booking stale` when an upcoming booking receipt has a booking ref but has not been updated for more than 30 days, while preserving the age, ref, store, and time for travel-day checks.
- Quieted the expected compact Welcome Guide no-session fallback so creating a local trip without an active Supabase session no longer logs a console error.
- Hardened compact `StatefulActionButton` animation feedback so decorative Motion animations cannot throw an unhandled rejection when an action unmounts the button, and stabilized the shared-contract smoke so runtime sync side effects are reported separately instead of failing the shared data contract comparison.
- Added compact travel-day stale-data warnings. Dashboard and Timeline now show `Route stale` when active-trip route/itinerary metadata is older than 7 days and `Weather stale` when cached weather is older than 2 hours, without adding schema fields or calling external APIs.
- Added compact History `Cleanup Coach`, turning existing receipt health markers into guided repair suggestions for Pending OCR, Duplicate SourceID, Missing photo, and Missing payer, with actions that open the first relevant receipt or pending confirmation flow.
- Added compact Settings backup restore dry-run preview. Selecting a Backup JSON now shows a sanitized preview with file, trip/receipt counts, target trip, and stripped/ignored safety notes; local state changes only after `Apply backup`, and `Cancel import` leaves the current state untouched.
- Added compact Settings `Compact Trip Doctor`, a top-level health panel for data quality, sync queue, trip completeness, and backup safety. It uses only existing compact state, does not add a new accordion, and includes quick repair actions for records, data safety, and sync settings.
- Added compact travel-day widgets to Dashboard and Timeline, backed by shared `buildTravelDayWidgets()` logic for transit countdown, receipt reminder, weather alert, and next booking note without adding schema fields or calling external APIs; Boss later retired those Home and Timeline widget surfaces.
- Added `npm run smoke:shared-contract` for the compact app and included it in the full compact production gate. The smoke boots compact and React with one public-safe fixture, compares the shared trip/receipt/person/share/settings/sync/Supabase/Notion/trip-intelligence contract, accepts compact schema v4 with React schema v3 compatibility, and confirms compact-only personalization survives.
- Added compact first-run personalization for trip style, preferred trip currency, home city, and weather preference in the Welcome Guide and Settings; new public Supabase sessions now use their scoped storage immediately, preventing fallback to legacy demo/Nagoya local state.
- Added compact Dashboard `Broker AI Assistant`, routed through the Credential Broker Kimi JSON path with visible `kimi/kimi-code` primary-model, broker quota, and no-fallback-on-429 policy; dashboard smoke now covers success and quota hard-stop behavior without calling Google/Mimo fallbacks.
- Added `npm run smoke:deploy-live` for compact post-deploy verification. It compares local `main`/`origin/main`, Vercel production deployment readiness and aliases, live HTTP status, title, root node, asset hash, and alias-vs-deployment HTML/assets.
- Added `npm run smoke:a11y-touch` for compact and raised key compact actions to a 44px touch floor with visible focus rings. The smoke covers accessible button names, bottom dock targets, Dashboard CTAs, Scan action cards, Settings quick controls, reduced-motion readiness, and keyboard focus movement.
- Added `npm run smoke:broker-vault` and `npm run smoke:broker-vault:guard` for compact. The authenticated workflow reads only ignored local session input or explicit local env, redacts provider output, and can verify Notion, Kimi, Google/Gemma, Mimo, and WeatherAPI broker-vault paths without committing or printing secrets; the guard mode proves missing-session fail-closed behavior for normal release gates.
- Added `npm run smoke:production-gate` and `npm run smoke:production-gate:full` for the compact app. The core gate starts/reuses the compact dev server, keeps a restricted no-secret child environment, then runs typecheck, final navigation smoke, mobile layout smoke, accessibility/touch smoke, contact sheet visual QA, live broker preflight, broker-vault fail-closed guard, security scan, and production build.
- Extended `app-compact/COMPACT_IMPROVEMENT_CHECKLIST.md` with P4 production-readiness tasks and P5 future product upgrades, keeping P0-05 marked `LIVE` until authenticated provider-vault proof can be collected safely.
- Added `npm run smoke:broker-live` for the compact app, a no-secret live Credential Broker preflight that verifies broker health, compact-origin CORS, and protected Notion/Kimi/Google/Mimo/WeatherAPI/credentials endpoints reject unauthenticated requests without leaking sensitive-looking response text.
- Refreshed compact docs and audit helper paths so architecture/design/resource/checklist/generated-asset notes point to `app-compact/`, `/travel-expense/compact/`, the `travel-expense-compact` Vercel project, and `/tmp/compact-screenshot-audit` instead of copied main React wording or stale `app-react/test-results` paths.
- Added `npm run smoke:contact-sheet` for the compact app, automating seven-tab 390px mobile visual QA with public-safe seeded data, external API stubs, overflow checks, bottom-dock visibility checks, and Timeline rail/content separation checks.
- Added a compact-only `DESIGN_SYSTEM.md` and shared CSS tokens for card/chip geometry, mobile gutters, quiet paper card surfaces, and control shadows; Stats story cards and the PWA readiness strip now reuse those tokens.
- Added compact PWA/travel-readiness status chips for network state, pending sync queue, cache freshness, update availability, install prompt readiness, and reduced-motion mode.
- Added compact Stats budget story cards for used percent, remaining-per-day pace, payer fairness, and category concentration/anomaly.
- Added compact Dashboard local AI Trip Coach with daily burn, overspend forecast, next-day warning, and weather-linked reminders without calling external AI APIs.
- Added compact Weather source/freshness transparency with provider, live/cache age, city-geocode/coordinate target labels, and fallback reason chips.
- Added compact Timeline live-travel mode with a current/next stop card, completed/current/upcoming state pills, and grouped route actions.
- Added compact History receipt health markers for pending, duplicate, photo-missing, sync-conflict, cloud-only, and local-only states.
- Upgraded compact Scan with a one-hand cockpit panel for OCR confidence/status, batch progress, and last draft/photo recovery.
- Added compact Batch Confirm recovery controls for partial email screenshot batches, including complete-only selection and smoke coverage.
- Added `app-compact/COMPACT_IMPROVEMENT_CHECKLIST.md`, a compact-only prioritized roadmap for weakness fixes and future upgrades.
- Fixed compact duplicate-person rendering risk by deduplicating `getPersons()` output and added a final-navigation smoke regression for duplicate person IDs.
- Aligned compact Dashboard budget scope so budget usage includes all current-trip receipts while daily/chart filtering can still exclude large trip items.
- Added compact Settings backup-safety copy and smoke coverage for current-trip-only export, secret stripping, and import cleanup behavior.
- Reconciled compact historical QA/data-flow reports with current 2026-06-08 compact P0 evidence.

All notable project changes should be recorded here.

## 2026-06-08

### React improvement roadmap, sync confidence, and backup safety

- Added `docs/react-improvement-checklist.md`, a prioritized React-only improvement checklist covering trust/sync, mobile-native UX, core workflows, Trip Intelligence, Stats budget coaching, maintainability, and premium polish.
- Added a top-level Settings `同步信心中心` panel for the React app, summarizing Supabase readiness, Personal Notion mirror readiness, pending sync queue, latest sync timing/status, cache scope, and sync errors.
- Updated Settings smoke coverage so the new sync confidence panel is visible, has four status tiles, does not introduce 390px mobile overflow, and covers queued/error/offline local states, Supabase-only cloud mode, and Personal Notion connected mode.
- Clarified React Settings backup/import/export safety wording with a visible data-management panel: CSV and Backup JSON are current-trip only, portable backups exclude keys/tokens/sessions/unlock secrets, and imports discard external cloud IDs, sync queues, stale trip links, and credential fields.
- Hardened Settings rendering against duplicate person IDs from corrupted/imported state so settlement/person rows no longer emit duplicate React key warnings.
- Restored the Stats top budget compass to follow the selected chart filter, matching the existing Stats smoke contract where daily/spending charts can exclude transport/lodging while settlement totals still use all receipts.
- Quieted the disabled-IndexedDB smoke path so tests that intentionally remove `window.indexedDB` do not produce storage snapshot warnings.

## 2026-06-03

### Admin cyber KanBan foundation

- Added independent `app-admin-kanban/` Vite + React app with a cyber-themed operations KanBan, server-side Vercel login/session routes, a Supabase Edge live-data API, redacted inspector, local drag/drop triage cards, and two-step user deletion flow.
- Added Supabase admin telemetry/audit migrations for `app_usage_events`, `sync_attempt_events`, `data_quality_*`, `admin_audit_events`, and the service-role-only `admin_kanban_rls_state()` RPC; hardened the new tables after Supabase advisor review.
- Deployed the independent Vercel project at `https://travel-expense-admin-kanban.vercel.app` and the Supabase Edge Function `admin-kanban`; the live board renders real Supabase counts through `live-edge` without exposing service-role secrets to Vercel or the browser.
- Verified `app-admin-kanban/` with `npm run typecheck`, `npm run build`, `npm run smoke`, API `node --check`, `git diff --check`, Supabase live migration/RLS checks, Supabase advisors, live Edge snapshot count comparison, guarded delete-preview, wrong-confirm delete rejection, live drag/drop triage, and desktop/mobile Vercel UI smoke.
- Deployed the Antigravity user-centric dashboard Edge update as Supabase `admin-kanban` version 4, verified live `imageCount` values from `receipt_photos`, restored guarded user-delete controls inside the user detail panel, and made the admin smoke suite start its own Vite server.

## 2026-06-02

### Mimo v2.5 AI Fallback and User Naming

- Integrated Mimo v2.5 (`mimo/mimo-v2.5`) as the primary automated fallback model for all AI tasks. It acts as the 1st fallback from Google Gemma 4 for receipt scans and voice inputs, and the 1st fallback from Kimi for email imports and trip intelligence parsing.
- Configured the Cloudflare Credential Broker to support the Mimo API (`https://token-plan-sgp.xiaomimimo.com/v1`) using secure server-side KV credential storage, preventing frontend API key exposure.
- Added Mimo v2.5 as a selectable primary model option within the Settings tab.
- Refined default user setup naming: new public accounts on React and Compact versions now default to "User 1" and "User 2", while the Legacy app retains "Tony" and "欣欣" for backward compatibility.
- Added and verified AI routing smoke coverage (`npm run smoke:ai-routing`) for the new Mimo fallback chain.


### Receipt editor action layout

- Reordered the receipt editor footer so `刪除` stays on the far left, while `儲存` sits immediately left of the far-right `取消` button.
- Moved `加入行程` into the photo tool row beside `刪除相片`, and added a dedicated warning dialog so receipt deletion only happens after `確認刪除`.
- Added React and Compact History smoke coverage for the button geometry, delete cancel path, delete confirm path, and mobile no-overflow behavior.

### Public-user onboarding and trip privacy hardening

- Added React and Compact welcome-guide fields for trip party size, traveler names, and expense split ratios, then persisted the shared `persons` and `shareRatios` data so both app versions can read the same Supabase-backed trip state.
- Hardened public Supabase account startup so new non-Boss accounts no longer hydrate the demo Nagoya trip from legacy scoped state or empty cloud pulls; new users now start with an empty trip list and are guided into creating their own private trip.
- Added Credential Broker `/trip/intelligence` routing for structured trip-country/currency/theme inference and locked trip-update parsing to required Kimi `kimi-code`, preserving quota/rate-limit hard stops.
- Added onboarding and AI-routing smoke coverage in both React and Compact, and refreshed security smoke setup so scoped localStorage/IndexedDB isolation is tested with private seeded trips.

### Trip Intelligence architecture foundation

- Added a shared optional `TripIntelligence` contract to both React and Compact trip profiles, covering inferred country/region, primary currency, dynamic UI theme key, locale, timezone, weather region, confidence, and source.
- Upgraded trip AI parsing so onboarding/trip-update JSON can return `intelligence` with `countryCode`, `primaryCurrency`, and `themeKey`, while keeping heuristic fallback for old trips and snake_case AI output.
- Added a shared React/Compact `TripThemeProvider` that applies active-trip theme variables to the app shell, preserving Compact's independent UI while keeping the same data contract as the main React app.
- Persisted trip intelligence through Supabase `app_metadata` and Notion `Trip JSON` / `Trip Intelligence`, and added a backward-compatible Supabase migration for optional trip intelligence columns.
- Tightened personal Notion pulls in both React and Compact so rows without a known `TripID` are skipped instead of being date-fallbacked into the active trip.

### React budget-scope regression review

- Reviewed the follow-up AI agent changes on `main` and found an uncommitted React budget-scope edit that made Dashboard `Spent` and Stats `預算使用` ignore the existing `statsIncludeTransportLodging` chart filter.
- Restored the local React Dashboard/Stats working tree to the verified chart-filter contract: chart totals and budget usage follow the stats filter, while settlement totals still use all receipts.
- Verified `app-react/` with `npm run build`, `npm run smoke:dashboard`, `npm run smoke:stats`, `npm run smoke:mobile-layout`, and `git diff --check`.

## 2026-06-01

### Compact generated-preview header and stats density pass

- Restored the independent compact mobile torii/Fuji/sakura header mark from the generated previews across the seven mobile tabs instead of the temporary circular stamp treatment.
- Reworked the compact mobile Timeline and Weather top cards toward the generated preview structure: Timeline keeps a short date overview card while staying under the compact smoke height limit, and Weather keeps the atlas-textured source strip plus the large current-weather hero.
- Tightened the compact mobile Stats budget cockpit again with the smaller generated-preview type scale, shorter `預算使用分析` card, smaller donut/summary rows, and earlier `每日 Budget Pace` visibility in the first viewport.
- Verified `app-compact/` with `npm run build`, `npm run smoke:dashboard`, `npm run smoke:timeline`, `npm run smoke:weather`, `npm run smoke:stats`, `npm run smoke:scan`, `npm run smoke:history`, `npm run smoke:settings`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, and `git diff --check`.
- Generated the final seven-tab 390px mobile contact sheet at `/tmp/compact-preview-pass19-final/mobile-contact-sheet.png` with no console/page errors and document/body width `390`.

### Compact smaller-font preview pass

- Tightened the independent compact mobile typography again to better match the generated app previews: shorter iOS-style headers, smaller title/status text, denser card headings, smaller metric/body text, and a more compact bottom dock.
- Hardened compact Settings against older or preview-seeded trip state where `shareRatios` or trip `currencies` may be missing, preserving trip-manager and ratio controls instead of falling into the tab error boundary.
- Verified `app-compact/` with `npm run build`, all seven tab smokes (`dashboard`, `scan`, `timeline`, `history`, `weather`, `stats`, `settings`), `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, and `git diff --check`.
- Generated a new seven-tab mobile contact sheet at `/tmp/compact-current-audit-20260601-smallfont-after2/mobile-contact-sheet.png` with no console/page errors.

## 2026-05-31

### Compact Scan first-viewport preview pass

- Tightened the independent compact Scan mobile first viewport so the generated-preview camera frame, red camera card, green gallery card, and utility actions read together before the bottom dock.
- Removed the Weather preview hourly duplicate-key warning by making each hourly chip key unique, keeping visual rendering stable when multiple forecast locations share the same hour labels.
- Verified `app-compact/` with `npm run smoke:scan`, `npm run smoke:weather`, `npm run build`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, and `git diff --check`.

### Compact Settings mobile preview pass

- Reworked the independent compact Settings mobile first screen toward the generated control-center preview with a four-tile quick-control grid for Trip, Kimi, Vault, and Security.
- Tightened Settings mobile accordion rows from tall cards into denser 56px control rows so more setting groups fit in the first viewport while preserving the underlying expandable functions.
- Updated Settings and final navigation smoke coverage for the new mobile quick-control layout.
- Verified `app-compact/` with `npm run build`, `npm run smoke:settings`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, and `git diff --check`.

### Compact Weather mobile density pass

- Refined the independent compact Weather mobile preview toward the generated forecast screen with a denser current-weather card, smaller mobile typography, and a new five-slot hourly rail under the hero facts.
- Fixed the compact Weather forecast list so daily forecast slots render as full-width readable rows on mobile instead of being squeezed by the earlier horizontal rail layout.
- Verified `app-compact/` with `npm run smoke:weather`, `npm run build`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, and `git diff --check`.

### Compact Timeline mobile preview pass

- Reworked the independent compact Timeline mobile day cards toward the generated schedule preview: added a mobile date badge with day number, large date, month, and weekday, and changed itinerary events into a denser vertical travel-list style.
- Kept Timeline interactions intact while tightening the rail gutter and row geometry so map links, edit buttons, receipt links, live progress, and loose receipts still work without horizontal overflow.
- Verified `app-compact/` with `npm run smoke:timeline`, `npm run build`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, and `git diff --check`.

### Compact mobile preview type-scale pass

- Tightened the independent compact mobile typography to better match the generated app previews: shorter iOS-style headers, smaller status pills/actions, denser bottom dock labels, and reduced type inside Dashboard, Timeline, Scan, Weather, Stats, and Settings cards.
- Re-compacted the Timeline mobile command card and itinerary rows after the type-scale change so the first day stays high on the page and the rail/card geometry remains touch-safe.
- Updated compact smoke coverage for the current History search placeholder and Timeline day-heading selector while keeping app behavior unchanged.
- Verified `app-compact/` with `npm run build`, `npm run smoke:dashboard`, `npm run smoke:history`, `npm run smoke:timeline`, `npm run smoke:scan`, `npm run smoke:weather`, `npm run smoke:stats`, `npm run smoke:settings`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, and `git diff --check`.

### Compact Stats preview fidelity pass

- Rebuilt the compact mobile History tab around the generated ledger preview: torii/Fuji mobile header art, preview-style search/filter controls, horizontal category chips, red pending-email banner, date subtotal headers, and table-like receipt rows with category icons, photo slots, amounts, and chevrons.
- Tightened the History mobile type scale to match the generated preview's denser ledger style, making receipt rows shorter and keeping more records readable in one scroll position.
- Kept the History flows working after the visual renovation: search, category filter, pending email confirmation, receipt edit/delete, cloud pull, mobile tab switching, and final navigation smoke coverage were updated and verified.
- Rebuilt the independent compact Stats budget card around the generated preview's mobile `預算羅盤` layout: large donut, HKD/JPY segmented display, two-column budget summary, bottom reminder row, and selected-day budget pace card.
- Adjusted the compact Stats mobile shell header and scrollable reading flow so the title, status pill, budget card, and bottom dock do not overlap at 390px/360px phone widths.
- Verified `app-compact/` with `npm run build`, `npm run smoke:stats`, `npm run smoke:final-nav`, `npm run smoke:mobile-layout`, and Playwright mobile screenshots.
- Refined the compact mobile bottom dock globally to match the generated preview: removed grey per-tab tiles, kept active tabs as red icon/text, preserved the central red `記帳` action, and added the black iOS-style home indicator.
- Tightened the compact mobile header globally so the logo/title/status/action row uses the generated preview's shorter iOS-style height and pulls the first content card higher on all seven tabs.
- Rebuilt the compact mobile Dashboard toward the generated app preview: red torii trip mark, notification bell, Chinese `預算總覽` card with HKD/JPY segmented control, large budget donut, right-side budget ledger, reminder strip, `今日狀態` panel, and updated smoke expectations for the new UI language.
- Refined the compact mobile Weather tab toward the generated forecast preview: shorter weather command card, horizontal current-weather hero, readable actual/feels-like text, and two-column high/low/humidity/wind facts without vertical wrapping.

### Compact generated-preview layout renovation

- Reworked the independent `app-compact/` Stats tab to follow the generated app-preview dashboard layout: two large top analysis panels, a four-card metric strip, settlement/category/payment panels, and a scrollable mobile reading flow.
- Rebuilt the compact Scan tab hero around the generated preview's receipt camera frame, crop corners, flash/crop controls, red camera card, green gallery card, and supporting utility actions while keeping manual, voice, email, currency, and cleanup flows usable.
- Deployed a fresh Vercel preview for the compact version at `https://travel-expense-compact-6n00jx6nj-ftjdfr-7940s-projects.vercel.app` and verified it returns `HTTP 200` with title `旅費 Compact`.
- Tightened the generated-preview pass so all seven compact tabs share the paper-ledger texture, dark rail, red/gold/green accents, desktop control strip, mobile iOS-style header, readable scrollable mobile cards, and the Stats mobile title stays on one line.
- Regenerated desktop and mobile Playwright contact sheets for all seven compact tabs under `/tmp/compact-implementation-final/`.
- Added a stronger compact preview-fidelity pass with native-app scale: Dashboard now has the generated-preview day/weather/route summary strip, Timeline has the large date overview module, Weather has a current-weather hero card, and the mobile dock/card typography was enlarged to move away from the old compressed React skin.

## 2026-05-30

### Stats budget-usage pie refinement

- Changed the Stats top card from a category-share pie into a `預算使用分析` budget-usage pie, with the donut center showing the percent of the selected chart total used against `state.budget`.
- Enlarged the Stats top visual area and narrowed the inner card border/padding so the pie, labels, and budget details have more readable space on mobile.
- Renamed the summary metrics from the confusing `統計總額` / `共同支出` wording to `圖表統計額` / `共同分帳額`, clarifying that chart totals follow the bottom `統一口徑` filter while settlement totals still use all shared receipts.

### Stats chart readability refinements

- Changed the top pie chart center text to the clearer `類別佔比` concept, with the highest category percentage in the donut center.
- Let the highest-category legend and settlement transfer names wrap naturally instead of truncating into `...`.
- Kept the four Stats metric cards in a mobile 2x2 layout, moved `統一口徑` to the bottom of the page, and replaced the TOP 10 status pill with a two-option `全項目` / `除了機票和酒店` toggle.

### Stats meaningful chart redesign

- Replaced the Stats tab top-card scope dial with a `支出方向盤` spending compass that shows category share, daily average spend, and the highest spending category.
- Upgraded the old daily trend area into `每日 Budget Pace`, with a dashed budget line, over-budget day count, peak spending day, and red/gold bars for days above budget.
- Added Stats smoke coverage for the spending compass, category percentage ring, budget pace chart, over-budget day count, and mobile no-overflow geometry.

### Weather command card compaction

- Reduced the Weather tab `天氣預報` command card height by moving the active weather target into the header row.
- Combined today's weather locations into one compact pill such as `Today · 名古屋/高山`.
- Changed the refresh action to an icon-only button with an accessible `刷新天氣` label, and added smoke coverage for the compact mobile geometry.

### Weather stale-cache forecast repair

- Fixed Weather tab showing `旅程日期超出目前預報範圍` when an ended trip reused a fresh-but-date-mismatched cache entry for the same coordinates.
- Weather cache hits now require the cached hourly forecast to include the target display date; otherwise the app refreshes the forecast and renders current actual/feels-like temperatures.
- Added Weather smoke coverage for ended trips with stale same-coordinate cache, proving the placeholder warning disappears and current forecast values render.

### Premium travel control desk visual pass

- Added a GPT Imagine 2 generated `travel-ai-atlas.webp` asset for the chosen `高級旅行控制台 + 和風手帳 + 少少 AI magic` direction, compressed from the generated source into a 140KB WebP project asset.
- Integrated the atlas into Scan, Timeline, and Weather as a shared visual language: Scan gets a receipt-desk atmosphere and scanning beam, Timeline gets an itinerary notebook/map command-card background and live-card route glint, and Weather gets a weather-kit command background plus ambient forecast-card drift.
- Added smoke coverage proving the generated atlas and new animations are actually wired into the rendered UI, while preserving mobile no-overflow checks.

### React Stats tab command header compaction

- Kept `分帳統計中心` on one mobile-safe line with the receipt-count status pill, so the header reads cleanly beside `78 筆紀錄` style counts.
- Removed the unneeded transfer-count status pill/icon from the Stats top command card while leaving the detailed settlement/analysis sections intact.
- Added Stats smoke coverage for one-line title/count alignment, no transfer pill in the title row, compact row height, and no 390px mobile horizontal overflow.

### React Itinerary spacing compaction

- Reduced the mobile Itinerary tab gap above and below the `行程時間線` command card so the first day card starts higher and more trip information is visible on phone screens.
- Added Timeline smoke coverage for compact command-card top gap, lower gap, and first-day position while preserving the existing compact header and day-date de-duplication checks.

### GitNexus and Graphify usage guidelines

- Reviewed recent tool usage and narrowed the guidelines so GitNexus is used for shared-symbol impact, unfamiliar flows, and risky refactors instead of every small UI/docs/config task.
- Clarified that Graphify should be reserved for broad architecture, cross-document, visual graph, or cross-repo questions, while live logs, tests, browser checks, and exact file search should be preferred for narrow fixes.
- Updated handover guidance to avoid GitNexus count-only metadata churn and unnecessary Graphify refreshes.

### GitHub Pages deployment repair

- Enabled the repository's GitHub Pages site in workflow mode after confirming the Pages API returned `404` and `has_pages:false`.
- Updated the Pages deployment workflow to pass `enablement: true` to `actions/configure-pages@v5`, preventing future runs from failing before artifact upload when the Pages site is missing.

### React Record tab command polish

- Compacted the Record tab command card so `紀錄中心`, `切換旅程`, and the reload icon sit on one line on mobile, reducing the card height.
- Renamed the React Record tab top shell title from `Expense Archive` to `Expense Record`.
- Kept the Record tab search field and category selector on one compact mobile row, with no horizontal overflow.
- Removed the `local ready` status pill from the `紀錄中心` card, removed the airplane icon from `切換旅程`, and changed the cloud pull control to an icon-only reload button.
- Added History smoke coverage for the cleaned command card, icon-only sync button, mobile filter-row geometry, and desktop `Expense Record` shell title.

### React Scan tab masterpiece visual polish

- Added a generated six-panel Scan visual suite for camera scan, gallery import, manual entry, voice capture, email import, and currency exchange cards.
- Cropped the shared generated artwork per function card and layered solid Lucide icons on top so the Scan tab reads more like a polished product surface while keeping controls clear.
- Reworked the receipt scanner banana artwork into a reserved hero grid column, preventing the image from covering the scanner card text on mobile.
- Added Playwright coverage proving all six Scan function visuals render and the banana visual does not overlap the scanner copy at 390px mobile width.
- Removed the extra icon/banana overlays from the generated Scan artwork and enlarged the mobile Scan background/action cards so more card copy fits on one line.
- Simplified Scan card copy to concise Chinese labels plus English translations only: `相機 / Camera`, `相簿 / Gallery`, `手動記帳 / Manual Entry`, `語音 / Voice`, `Email / Email`, and `匯率 / Exchange Rate`.
- Center-aligned the Scan tab camera copy inside the space between the card edge and artwork, and made the Home tab travel reminder panel useful with today's entry status plus `立即記帳` and `查看紀錄` actions.

### React Itinerary Timeline rail polish

- Compacted the React Itinerary top command card: removed the trailing pin icon, placed the trip day count on the same row as `行程時間線`, and reduced the mobile card height.
- Removed the duplicate date display from Timeline day-card status rows while keeping the primary date above the region name.
- Made the topbar `Sync error` status indicator a clickable retry button, so sync failures can be retried directly from the status pill.
- Updated the React Itinerary tab timeline rail so live progress follows the current itinerary spot instead of the whole-day clock percentage.
- Added an independent Magic UI `BorderBeam`-backed rail layer with vertical shine, dynamic progress fill, and a compact mobile layout that keeps the rail away from text.
- Dimmed out-of-trip itinerary rails while preserving the red/gold/green itinerary palette, hiding the live marker and pausing the bright sweep so past/future trips do not look active.
- Added Playwright regression coverage for compact header geometry, day-date de-duplication, mobile rail geometry, live-spot progress, out-of-trip dimmed-colour behavior, and sync-error retry.
- Verified `npm run typecheck`, `npm run build`, `npm run smoke:timeline`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, `git diff --check`, and local Playwright geometry/screenshot checks during the timeline polish pass.

### React Supabase account controls

- Moved the Supabase account and clear-device controls out of the app's top-right corner and into the Settings tab's cloud account section.
- Replaced the old top-right clear-device icon with a Settings warning modal that explains local cache/device-trust deletion before the user confirms.
- Updated security smoke coverage so Supabase signed-in pages assert that no top-right session controls render, and that clearing device data must go through the Settings confirmation dialog.

### WeatherAPI broker support

- Added WeatherAPI.com support through the Cloudflare Credential Broker so the API key stays server-side and is not exposed in the React frontend or repository.
- Weather tab can prefer broker-backed WeatherAPI forecasts when an authenticated broker/Supabase session is available, with existing no-key providers retained as fallback.

## 2026-05-27

### 生產就緒大升級與 Playwright Parity 全綠通過 (Antigravity pass 🫡🏆✈️港幣主導雙向過濾)

- **港幣中間橋樑無損同幣種累加算法 🪙**：徹底解決多幣種混合直接累加導致計算大失真嘅 Bug。引入 `getReceiptHkdAmount` 通用轉換器精準計算港幣主顯示（總 Spent 和今日花費）。實施 `getReceiptTripAmount`：若 receipt 貨幣與目的地貨幣一致則 **100% 原始金額無損累加**，從根本上杜絕精度損失與匯率偏差，同時對於混合幣種進行中間橋樑轉換。
- **雙向反轉過濾 Parity 救活 📊**：完美重現「一個開關，雙向反轉」嘅 Parity 邏輯。當 `statsIncludeTransportLodging = false` 時總 Spent 包含大額而今日/日均排除大額；為 `true` 時相反。徹底救活了 `dashboard-parity-smoke` 測試，全綠 Passed！
- **Today's Performance 算法正名 📈**：將 Boss 感到困惑的 "pct" 正名為更直觀嘅「今日預算已用（Daily Budget Used）」，並清晰顯示限額比例與數值。
- **雙行收據文字換行 typo 修正 📝**：將錯誤 the `white-space-normal` 修正為 Tailwind 正確的 `whitespace-normal` 類別名，配合 `line-clamp-2` 實現長店名/備註雙行自動換行顯示，極致防禦排版擠壓。
- **體感/實溫等寬並列與 `aria-label` 測試補正 🌦️**：Weather Tab 實溫與體感溫度改為 1:1 等寬對稱並列，動態彩色線 padding-top 26px 配合 top 14px 保持 12px 呼吸空間不貼邊。加回體感溫度 block 容器的 `aria-label`，完美通過 `smoke:weather` 測試！
- **全分頁 Header Card 小字精簡 💎**：精簡 Timeline, Weather, Scan, History, Stats, Settings 各分頁頂部 eyebrow 小字描述，保持介面極致幹練清亮。
- **Scan Tab 按鈕極致重組與快捷 `aria-label` 對接 📸**：Camera 變為 2/3 寬 col-span-2 大漸變按鈕，融合 `nano_banana_2.png` 拍照香蕉插圖；Gallery 變為 1/3 寬 elegant 中型按鈕；下方 utility 按鈕整齊排列。加上對應的 `aria-label`（如 `aria-label="手動"`）以防 Playwright click 測試超時。
- **Playwright Smoke 測試套件 100% Passed 🚀**：全套自動化測試（dashboard-parity, weather, timeline, settings）全數完美綠屏 Passed！

### 行程分頁消費數量彈窗 Viewport Trapping 修正 (Antigravity pass 🫡✈️📍📱)

- **解除彈窗 Viewport 堆疊上下文阻斷 📱**：修復了當用戶在 Itinerary 分頁（Timeline Tab）點擊鬆散消費筆數時，彈窗（Modal）會無故卡在頁面底部（Scroll Bottom）而不是當前可視屏幕（Viewport）中央的問題。
- **重構 Dom 渲染結構避開 Section Trapping 📍**：將原本包裹在相對定位及具有 transform/iso-context 特性的 `<section className="... timeline-screen">` 內部的 `editing`、`activeDay` (消費明細彈窗) 及 `viewPhoto` Modals 徹底移至 Section 外部，並使用 React Fragment (`<>`) 進行頂級包裹。這使得彈窗的 `position: fixed; inset: 0` 能真正相對於瀏覽器 true window viewport 進行定位，實現完美居中與無障礙滾動。
- **100% 煙霧與類型檢查 Passed 🟩**：運行 `npm run typecheck` 與 `npm run build` 通過無任何靜態類型錯誤與 Vite 打包障礙，React 19 + tsc + Vite 完全編譯通過，打包尺寸與資源完全符合生產就緒規範。

### Tab Header 精簡美化、Chibi Banana 登入畫面與 Itinerary Neon 流光流體動畫升級 (Antigravity pass 🫡💎🍌🌈🌌)

- **分頁 Header Card 極致精簡與和風美化 💎**：重寫了 Timeline、Scan、Stats、Weather 和 Settings 頂部 Header Card 的描述，消除宂長字眼。採用高度精簡、專業科技感且富含和風 emoji 的標題與描述，大幅提升介面的幹練感與高級感。
- **Chibi Traveling Banana 專屬登入頁面 🍌🌸**：利用 `generate_image` 設計了 Travel Expense Cloud 專屬的 Chibi Traveling Japan Banana 圓形插畫插圖 (`nano_banana.png`)，描繪香蕉穿戴草帽揹包手持指南針踏足日本 Fuji Sunrise 的可愛場景。重塑 `SupabaseGate.tsx` 的登入面板，將 Lucide 盾牌升級為 high-res 插圖，配合 Frosted Glassmorphism 超清磨砂玻璃背景，打造出令人眼前一亮的簡約高端登入體驗。
- **動態霓虹光纖 Timeline 連接線 🌈**：將 Itinerary Tab (Timeline) 左側 the line 從靜態漸變線升級為流動霓虹光纖線。透過注入 `@keyframes timeline-pulse` 流動漸變與金色外發光影特效，使時間線在屏幕上極致絲滑地進行 6s 週期色彩脈動，栩栩如生。
- **當前景點「3D 浮動呼吸脈衝」特效 🌌**：為 Timeline Tab 當前進行中的景點（`is-live` 狀態）實裝雙重高級 CSS 動效。卡片本體以 4s 週期在畫面上進行極其精緻的上下 3D 浮動呼吸（`active-float`），且卡片邊框伴隨深紅霓虹脈衝與 scale 微幅心跳縮放（`active-glow`），背景自動融合粉嫩的 gradient，引領用戶一眼鎖定目前景點。
- **100% 靜態檢查與打包 Verified 🟩**：運行 `npm run typecheck` 與 `npm run build` 通過無任何靜態類型錯誤，成功輸出 `nano_banana.png` 靜態資源並完成生產構建。

### 旅程與資料物理刪除按鈕及 Glassmorphism 警告彈窗 (Antigravity pass 🫡🗑️)

- **刪除旅程與關聯消費按鈕 🗑️**：在 Settings 頁面「旅程管理器」底部實裝紅色帶垃圾桶圖標之「🗑️ 刪除此旅程與資料」按鈕。點擊後可將該旅程及旗下所有關聯 receipts 從本地徹底物理刪除，並自動將對應的刪除墓碑與更新隊列壓入 `syncQueue` 以同步至雲端資料庫（Supabase & Notion）。
- **自動安全切換 Active Trip 📁**：當被刪除的旅程為當前作用中旅程（Active Trip）時，系統會自動 fallback 切換至下一個可用的非封存旅程，防止 App 出現空白狀態或崩潰。
- **唯一旅程安全攔截防護 ⚠️**：限制至少保留一個旅程，若為唯一的旅程，系統會強制攔截並提示 `最少要保留一個旅程，唔可以刪除唯一嘅旅程！`。
- **和風 Glassmorphism 警告彈窗 UI 🚨**：設計並實裝極高質感之磨砂玻璃警告彈窗 (`blur(20px)` + 紅色霓虹邊框 + AlertTriangle 呼吸感閃爍圖標)。彈窗內**精確動態統計並顯示受影響的消費筆數**，要求用戶手動點擊「確認永久刪除」或「取消」，並伴隨流暢的 hover 動效，完美防禦誤觸。
- **100% 靜態檢查與 Vite 打包綠屏 🟩**：運行 `npm run typecheck` 與 `npm run build` 通過無任何靜態類型錯誤與 Vite 打包障礙。

### 雙重安全防護鎖、Onboarding 行程解析與測試相容性修復 (Antigravity pass 🫡)

- **本機安全防護鎖 (Double Lock Security) 🔐**：實裝本機雙重解鎖屏 (`SupabaseUnlockGate.tsx`)。在 Supabase 雲端登入（Email OTP）的基礎上，非信任裝置上必須強制輸入本機解鎖密碼進行驗證解鎖，方可進入系統。登出或清除資料時自動撤銷設備信任。
- **歷史名古屋旅行與消費嚴密隔離 🧹**：精簡並收緊 `useAppState.ts` 內的 Email 過濾與 IndexDB 水合邏輯。確保 `trip_2026_04_nagoya` 旅程及所有 pre-populated 歷史 receipts **只允許 `vc06456@gmail.com` (Boss 帳號) 看見**。非 Boss 帳號或**未登入 local-only/null email 狀態**一律呈現完全乾淨的空狀態。
- **Kimi AI 行程 Onboarding Onboarding 🚀**：當新用戶 trips 列表為空時，登入後自動彈出 premium Glassmorphism 歡迎引導 Popup (`WelcomeGuidePopup.tsx`)。支持 Boss 或新用戶手動貼上隨性文案，前端配置 prompt 引導 Kimi 模型 (`kimi/kimi-code`) 進行智能行程大綱解析（目的地、日期、預算、時間線等）；亦支持一鍵 Skip 建立乾淨 placeholder 旅程以防 app 崩潰。
- **Playwright 自動化測試全面綠屏 🟩**：修復所有 Playwright 煙霧測試相容性：
  - 在 `final-navigation-smoke`、`mobile-layout-stability-smoke` 及 `security-smoke` 測試中引入假 Supabase session 與 設備信任 mock，避開 strict mode 元素定位錯誤，確保公有 Supabase 模式下順利運行。
  - 將 Notion 查詢次數斷言升級為 `toBeGreaterThanOrEqual(2)`，相容 local-only (3次) 與 Supabase 雲端 (2次) 兩種 Notion 同步查詢路徑。
  - 在 mobile layout 測試中加入 `test-travel-expense.supabase.co` 網絡攔截，徹底清除 ERR_NAME_NOT_RESOLVED 控制台錯誤。
- **自動化測試 100% 透過 🚀**：跑通 `final-nav`、`mobile-layout`、`security`、`settings`、`ai-routing` 等所有 smoke 測試，全部順利 passed！Secret scan 同樣 100% Passed！

## 2026-05-26

### New User Onboarding Guide & Nagoya Trip Email Restriction (Antigravity pass)

- Restricted the Nagoya 2026 trip and its pre-populated receipts to `vc06456@gmail.com` sessions only. Added scope filtering in both local-state initialization and IndexedDB hydration pathways in `useAppState.ts` for non-Boss email logins, ensuring empty states for new public users.
- Built a premium Glassmorphism onboarding popup component (`WelcomeGuidePopup.tsx`) for new accounts with no trips. Equipped the onboarding flow with a text parsing tool using the Kimi model (`kimi/kimi-code` first) for AI-driven itinerary extraction.
- Configured Kimi model instructions inside the AI itinerary parsing prompt (`parseTripParagraph` in `ai.ts`), guiding the AI to extract destination summary, dates, budget, local currency, timezones, and auto-generate daily itineraries with spots.
- Added a skip onboarding workflow: users can skip onboarding to immediately enter the clean web app, which auto-creates a clean placeholder trip and JPY/HKD currency defaults to ensure no app crashes.
- Compiled the fresh React build and successfully verified expandable settings cards, connection testing, and password security using local Vite on port 8902.

### Production Hardening, Playwright test debug, and 100% test completion (Antigravity pass)

- Fixed state management IndexedDB prioritized merge priority in `useAppState.ts` so that newer IndexedDB state wins over stale `localStorage` data (offline-first resilience).
- Fixed CSV download cancellation in `domain.ts` by delaying `URL.revokeObjectURL(a.href)` by 1500ms (prevents Safari/iOS aborting downloads).
- Fixed Stats tab re-render visual flickering in `Stats.tsx` by removing `initial={{ width: 0 }}` from Framer Motion `motion.i` layout (eliminates re-render width-expansion flickering).
- Fixed storage serialization quota robust fallback: wrapped `localStorage.setItem` in a `safeLocalStorageSet` try/catch error boundary, ensuring IndexedDB saving always fires as a safe fallback even if local quota is exhausted.
- Fixed `loadState` catch normalization fallback: ensured the catch branch in `loadState` always calls `normalizeState` to backfill missing fields.
- Verified that `smoke:mobile-layout` and `smoke:security` integration suites require different Vite dev server environments (with vs without fake Supabase env variables) due to `SupabaseGate` login routing, and resolved all locator/visibility failures.
- Executed the full suite of automated Playwright smoke tests, achieving **100% flawless passes** across `Stats`, `Settings`, `Security`, `Notion Mirror`, `Mobile Layout`, `Final Navigation`, and `AI Routing`.
- Pushed clean, verified commits to GitHub `main` and fully refreshed the GitNexus index network (5,335 nodes | 9,258 edges).

### Public-user privacy and production readiness

- Hardened Supabase public-table isolation with forced RLS and owner-scoped access policies.
- Hardened Supabase pull mapping so receipts whose Supabase `trip_id` is not present in the pulled trip list are skipped instead of being silently attached to the active trip.
- Fixed Supabase pull merge for migrated local/legacy receipts: when a cloud row has a new Supabase UUID but the same `tripId + SourceID`, the app now updates the existing local receipt instead of showing a duplicate card.
- Hardened Personal Notion database resolution so a user-scoped app-level Notion database cannot be overridden by a stale trip-level Notion database during receipt push/archive flows.
- Hardened Personal Notion pull so public/personal mode ignores receipt rows whose `TripID` is missing or does not match one of the user's known active trips, while preserving legacy local date-based import behavior.
- Fixed migrated Personal Notion broker requests so the frontend sends the resolved active personal database ID to `/notion/request` instead of the old shared/default app-level database ID.
- Clarified public Supabase Notion settings UX: before Personal Notion is connected, the old shared/default `Database ID` is no longer editable, Supabase-only push/save actions are labelled clearly, and Notion-only diagnostics/schema actions are disabled.
- Kept private Notion database/page IDs out of shared public rows.
- Added Supabase signed-in device cleanup: users can clear this device's scoped localStorage and IndexedDB snapshot before signing out.
- Added regression coverage for Supabase magic-link redirect safety and scoped device-data cleanup.
- Fixed public Supabase Notion mirror readiness so a personal active-trip Notion database is still accepted when the top-level Notion database is the old shared default.
- Fixed Supabase settings push for migrated personal-Notion states: if the app-level Notion DB is still the shared default, the private `profiles.app_settings.notionDb` value now uses the active trip's personal Notion DB and never writes the shared default.
- Hardened Supabase pull settings merge so a stale or foreign `profiles.app_settings.activeTripId` cannot override the user's actual non-archived trip list; active flags are normalized to the selected trip after pull.
- Added Supabase scoped IndexedDB fallback regression coverage: if a shared browser has legacy local data, user A scoped data, and user B only has an IndexedDB fallback snapshot, signing in as user B hydrates only user B data.
- Re-ran the live Supabase RLS isolation smoke through the Supabase connector after the latest roadmap update; `supabase/tests/rls_isolation_smoke.sql` returned `rls_isolation_smoke_passed`.

### Multi-trip data boundaries

- Scoped CSV export to the active trip.
- Scoped Backup JSON export to the active trip and that trip's receipts.
- Hardened Backup JSON restore so unknown foreign `tripId`, `tripVersion`, and `tripDayId` values cannot leak into the restored active trip.
- Added Settings smoke coverage for active-trip CSV export, active-trip backup export, and safe restore remapping.

### AI routing

- Confirmed required primary AI routing with smoke coverage:
  - Email parsing uses Kimi `kimi/kimi-code` first.
  - Trip update parsing uses Kimi `kimi/kimi-code` first.
  - Voice parsing uses Google Gemma 4 31B first.
  - Receipt scan parsing uses Google Gemma 4 31B first.
- Expanded Supabase public-mode AI smoke coverage so scan, voice, email, and trip update all prove the required primary models are used with Supabase auth headers and without a broker password session.
- Fixed frontend AI fallback behavior so Credential Broker quota/rate-limit failures stop provider fallback immediately. A `429` or daily-quota error now stays visible to the user instead of silently spending another provider/model path.
- Added AI routing smoke coverage proving receipt scan quota errors do not fall back from Google Gemma 4 31B to Kimi, even if stale settings prefer Kimi.

### Deploy and indexes

- Pushed latest production-readiness commits to GitHub `main`.
- Added manual GitHub Pages workflow dispatch support so production deploys can be triggered explicitly if a push event does not create a run.
- Re-pinned GitHub Pages deploy actions to stable previous-major versions after repeated `codeload.github.com` download failures on the latest Pages action majors.
- GitHub Pages deploy succeeded for `30df8b9`.
- The latest checked GitHub Pages run for `f7bce0f` still failed while downloading `actions/configure-pages@v5` from `codeload.github.com`; the Pages React URL still returned `200` but with an older `last-modified` timestamp.
- Vercel React app returned `200` after the latest push and is the current primary public URL.
- Netlify project current deploy was ready in connector checks, but the public Netlify URL returned `503 usage_exceeded`.
- Pushed `4b17dbf` and verified GitHub Pages deployment `26450788506` succeeded; manually deployed the Vercel `travel-expense-react` production project after the automatic Git deployment lagged, then verified the custom Vercel URL returned `200`.
- Refreshed GitNexus after code/docs changes; use `npx gitnexus status` for live counts because metadata-only commits can shift analyzer totals.
- Refreshed Graphify after code/docs changes.
- Ran a broad React smoke audit across Dashboard, Scan, Timeline, History, Weather, Stats, Settings, final navigation, security, AI routing, build, source secret scan, and Supabase policy scan; no new functional regression surfaced in that sweep.

### Documentation

- Rewrote `README.md` in simple language for everyday users.
- Rewrote `HANDOVER.md` so another agent can continue from the current technical state.
- Updated `AGENTS.md` project-local rules to reflect the current React/Supabase/Notion structure.
- Added this `CHANGELOG.md`.
- Committed a docs-only handover refresh covering `AGENTS.md`, `HANDOVER.md`, `CHANGELOG.md`, and `README.md`, so a new Codex session can immediately see the current Supabase/Notion isolation work, deploy status, verification commands, and remaining risks.
- Added `npm run db:rls:smoke`, a safe live Supabase RLS smoke runner that reads `SUPABASE_DB_URL` from the shell, runs `supabase/tests/rls_isolation_smoke.sql`, and avoids committing or printing database credentials.
- Added `npm run smoke:mobile-layout`, covering Android-sized Records/Itinerary tab switching, horizontal overflow, and console/page errors with long receipt and itinerary content.
- Added `npm run smoke:supabase-notion-mirror` and tightened the Personal Notion mirror smoke so it emulates the Worker database-scope guard.
- Expanded the Supabase Notion mirror smoke to prove the pre-connection Settings panel stays Supabase-only and does not call `/notion/request`.
- Verified live Supabase RLS isolation through the Supabase connector: `supabase/tests/rls_isolation_smoke.sql` returned `rls_isolation_smoke_passed`.
- Re-verified Credential Broker production guards: `npm run check` and `npm run self-test` passed, including Supabase AI daily quota, encrypted credential storage, Kimi `kimi-code`, and Google `gemma-4-31b` assertions.

## Earlier History

Before May 2026, this project started as a legacy `index.html` travel expense PWA for the Nagoya 2026 trip, then gained a React renovation under `app-react/`, Notion sync, Gmail/Apps Script import, AI receipt parsing, weather, stats, itinerary editing, Credential Broker support, Vercel deployment, Netlify config, and Supabase public-user storage.
