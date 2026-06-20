# Travel Expense → Super Expense App Roadmap (Splitwise-class + beyond)

**Updated:** 2026-06-20 (rewritten from deep Splitwise research + a code audit of our app)
**Repo:** `jd92-beep/travel-expense` · **Branch:** `codex/android-compact-shell` (Android + compact web share one source)
**This is the canonical, version-controlled roadmap.** Derived from deep Splitwise feature/mechanism research (2026-06-20) + a full audit of `app-compact`'s split/settlement code.

---

## 0. One-line positioning

> **An AI-first travel + shared-expense super app** — scan a receipt, let AI split it *by item*, track the trip budget in real time, settle up, and sync across Android + web — with the core features Splitwise now charges for kept **free**.

We are **not** cloning Splitwise. We already beat it on three axes (AI capture, travel-budget pacing, HKD-anchored live FX). The plan below closes the split-flexibility gap and doubles down on the one feature **even paid Splitwise can't do: AI item-by-item receipt splitting.**

---

## 1. Capability scorecard — us vs Splitwise (2026)

| Capability | Our app today | Splitwise | Verdict |
|---|---|---|---|
| Balances ("who owes whom") | ✅ `computeSettlements` | ✅ | **Par** |
| Simplify debts (min transfers) | ✅ `splitEngine.simplifyDebts` (greedy, unit-tested, net-neutral) | ✅ (algorithm-identical class) | **Par** |
| Settle up (record payment) | ✅ `結清` modal + 已結算記錄 (v0.8.7) | ✅ | **Par** |
| Multi-currency | ✅ 17 currencies, HKD anchor, **live FX**, per-receipt original currency | ⚠️ entry free, **conversion is Pro**, uses today's rate not expense-date rate | **We win** |
| Travel-budget pacing | ✅ Dashboard daily/total burn-down | ❌ none | **We win (unique)** |
| Receipt OCR | ✅ multi-modal: photo + voice + email/screenshot, 18-lang, multi-provider fallback | ⚠️ **Pro**, total-only | **We win** |
| **AI receipt *itemization* (assign items to people)** | ❌ (OCR stores items as free text only) | ❌ (even Pro only captures total) | **Open wedge — nobody owns this well** |
| Split: equal / shares (weighted) | ✅ global per-trip `shareRatios` | ✅ | **Par** |
| Split: exact amounts | ❌ | ✅ | **Gap** |
| Split: percentage | ❌ | ✅ | **Gap** |
| Split: by adjustment (+extra) | ❌ | ✅ | **Gap (easy win)** |
| Private / 代付 (paid-for) | ✅ `splitMode:'private'` + `beneficiaryId` | ⚠️ approximated | **We win** |
| Multiple payers per expense | ❌ single `personId` | ✅ (web) | **Gap** |
| Cross-device sync, shared multi-user ledger | ✅ Supabase truth + RLS + idempotent RPC; Notion mirror | ✅ | **Par** |
| Search · Export (CSV/JSON) | ✅ | ⚠️ both **Pro** | **We win (free)** |
| Recurring expenses | ❌ | ✅ | **Gap** |
| Comments / activity feed | ❌ | ✅ | **Gap** |
| No paywall on core | ✅ everything free | ❌ daily add-cap + paywalled basics | **We win** |
| Design | ✅ washi-paper + liquid-glass, modern | ⚠️ "dated/bloated" (reviews) | **We win** |

**Takeaway:** we are already ~70% of a Splitwise-class app and ahead on the differentiators. The roadmap is targeted, not a rebuild.

---

## 2. How we stand out (the moat)

1. **AI itemization auto-split** — snap a restaurant/konbini receipt → AI extracts each line item + tax + tip → assign items to people (or one-tap "split evenly") → balances update. This is the single feature Splitwise, Tricount, and Settle Up all lack. It's our highest-leverage build and rides our *existing* OCR.
2. **No paywall on core** — unlimited adds, currency conversion, charts, search, export all free (directly attacks Splitwise's most-hated 2024 change: the ~3–5/day free cap + paywalled basics).
3. **Real travel-budget pacing** — "you're ¥X under pace today" (Splitwise has no budgeting).
4. **Per-expense-date FX accuracy** — convert each expense at the rate on its date, not today's (Splitwise's known accuracy gap on long trips).
5. **Multi-modal capture** — photo / voice / email / screenshot, Cantonese-aware.
6. **Beautiful, fast, mobile-first** — the washi/glass design as a trust + delight differentiator.

---

## 3. The key architectural enabler (do this first)

The single constraint blocking exact/%/itemized/multi-payer is: **one receipt = one `total` + one `personId` payer.** Lift it with **optional, backward-compatible arrays** on `Receipt` (rides the existing sync pipeline; old receipts keep working; `computeSettlements` falls back when the arrays are absent — same pattern as the settlement feature).

```ts
// Receipt (additive, all optional — undefined = current behaviour)
splitType?: 'equal' | 'shares' | 'exact' | 'percent' | 'adjustment' | 'itemized';
splits?: { personId: string; weight?: number; amount?: number; pct?: number; adjust?: number }[];
payers?: { personId: string; amount: number }[];          // >1 = multiple payers
lineItems?: { id: string; desc: string; amount: number; assignedTo: string[] }[]; // itemized
```

- `computeSettlements`: when `splits`/`payers` present, use them (compute each person's owed share from `splitType`); else keep today's global-ratio + `splitMode` path. **Money in integer minor units; distribute rounding residuals by largest-remainder so `Σ shares === total` exactly** (keeps net-neutrality the unit tests already enforce).
- Sync: add Supabase columns + Notion props in lockstep with the **drift-tolerant resolver** (`notion.ts:ensureSchema`); mark itemized/multi-payer receipts so they survive round-trips even if a column is dropped (the `category:'settlement'` trick generalised). **No live-DB blind push** — apply via Management API per the migration rule.
- This one change unlocks F1, F2, F3 below.

---

## 4. Prioritized backlog (value × feasibility × design-fit)

Each item: **mechanism → frontend → data/backend → design-fit → effort.**

### Tier 1 — the differentiators

**F1 · Per-receipt split editor (equal / shares / exact / percentage / adjustment)**
- *Mechanism:* per-participant `splits[]`; live-validate Σ == total (exact) or Σ% == 100. "Adjustment" = equal base + per-person +extra (single-number entry — Splitwise's cleanest pattern).
- *Frontend:* a split-mode segmented control inside `ReceiptEditor` (progressive disclosure — default stays "equal/one payer"; advanced behind one tap). Reuse `SegmentedControl`, `AvatarBadge` rows, inline validation pill.
- *Data:* `splits[]` + `splitType` on Receipt; `computeSettlements` consumes them.
- *Design-fit:* `ReceiptEditor` `.modal-backdrop`; per-person rows like the settlement transfer row.
- *Effort:* M.

**F2 · Multiple payers**
- *Mechanism:* `payers[]` (each `{personId, amount}`, Σ == total); `computeSettlements` credits each payer instead of one `payerIdx`.
- *Frontend:* "who paid" → "2+ people paid" reveal (mirror Splitwise), amount per payer.
- *Design-fit:* same editor; reuse the payer panel styling.
- *Effort:* M (depends on F1's array plumbing).

**F3 · AI receipt itemization + auto-split  ⭐ the moat**
- *Mechanism:* upgrade `scanReceiptImage` to return **structured line items** (desc, qty, amount, tax/tip) instead of `itemsText`. AI proposes an assignment; user confirms. Per-item `assignedTo[]` → each person's share = Σ(their items) + pro-rata tax/tip.
- *Frontend:* after scan, an **item-assignment sheet**: each line item is a row of `AvatarBadge` toggles (tap a face to add/remove them from that item; "split evenly" default). Keep it tappable, not a spreadsheet (Splitwise's 0/50/100 lesson) — but we allow N-person even split per item + AI pre-fill.
- *Data:* `lineItems[]` on Receipt; reuse the F1 split engine to fold items into per-person totals.
- *Design-fit:* new sheet using `.modal-backdrop` + `DataPanel` rows + `AvatarBadge`; cream/glass styling.
- *Effort:* L — but it's the standout feature; stage it (F3a: structured OCR + even-split; F3b: per-item assignment UI; F3c: AI auto-assign suggestions).

### Tier 2 — accuracy, social, robustness

**F4 · Per-expense-date FX snapshot** — store the FX rate on each expense's date; convert for display from that. *Effort:* S. Closes Splitwise's stale-rate gap; we already pull live FX.

**F5 · Comments + activity feed (shared trips)** — append-only `expense_comments` + an activity projection ("X added/edited/settled"). *Frontend:* a feed surface (in Settings or a History detail). *Effort:* M. Only meaningful once trips are actively shared.

**F6 · Offline outbox hardening + idempotency** — we have a `syncQueue`; make it a durable outbox with per-op idempotency keys + ordered replay + backoff (kills the "manual push" tech-debt). *Effort:* M. Matches Settle Up/Splid's offline strength.

### Tier 3 — strategic / "beyond travel"

**F7 · Recurring expenses** — `recurring_rules` (template + frequency + next_run); spawn on schedule. *Effort:* M. Unlocks rent/subscriptions = "super app beyond trips."
**F8 · Unify identity** — merge accounting `Person` ↔ Supabase `member` so there's a real friends list + per-user balances independent of a trip. *Effort:* L (touches the data model). Do before "groups beyond trips."
**F9 · (Optional) append-only expense events + server-recomputed balances** — the textbook fix for multi-device concurrency; big refactor, defer unless concurrency bugs appear (current LWW + version optimistic-locking is adequate for 2–5 users).

---

## 5. Phasing

- **Phase 1 — Split flexibility (the enabler + F1, F2).** The §3 arrays + the split editor + multiple payers. Unlocks Splitwise split parity. *Compact + Android (shared source); commit to the android branch, do NOT merge to main until the friend's trip is over.*
- **Phase 2 — AI itemization (F3).** The moat. Stage F3a→c.
- **Phase 3 — Accuracy & social (F4, F5).** Per-date FX + comments/activity.
- **Phase 4 — Robustness & reach (F6, F8, then F7).** Offline outbox, unified identity, recurring.
- **Phase 5 — Polish & GTM.** Onboarding, store listing, the "free where Splitwise charges" message.

Each phase is independently shippable and bumps `APP_VERSION`.

---

## 6. Mechanism & accuracy notes (so we don't get money wrong)

- **Integer minor units + largest-remainder rounding** everywhere a total is divided (so `Σ shares === total`, no drift). Our `simplifyDebts` already rounds transfers + has an epsilon dust guard and passing unit tests (2/3/5/10 participants).
- **Net-neutrality invariants** (from Splitwise's own write-up): a settlement/transfer never changes anyone's net position, never creates a new creditor, never increases totals. Our settlement engine already satisfies these (tested).
- **Multi-device:** server (Supabase) is authoritative; writes carry idempotency keys (already true for the shared-trip RPC); balances are **recomputed from receipts+settlements**, never synced as a stored number. Keep that.
- **Multi-currency:** store original currency + amount immutably; snapshot rate per expense date (F4); compute settlements in the resolved trip currency.

---

## 7. UX principles (keep it clean as we add depth)

1. **Progressive disclosure** — the default add-expense screen stays one-payer + equal split. Every advanced mode (exact/%/adjustment/multi-payer/itemized) hides behind **one tap**.
2. **AI-first, manual-second** — AI pre-fills item assignments and splits; the user only corrects.
3. **Single-number patterns** — "split by adjustment" (enter only the extra) and per-item face-toggles keep entry to taps, not spreadsheets.
4. **Honor the design system** — cream `#FAF7F0` surfaces, Arsenal-red `#C23B5E` / green `#2D6E48` accents, `GlassCard`, `.modal-backdrop` bottom-sheets, `AvatarBadge`, `DataPanel`, serif headings, Cantonese microcopy. New surfaces mount inside existing tabs (Stats for balances, the receipt editor for splits) — **no 8th tab**.
5. **Never AI-speak** — punchy, warm, bilingual labels.

---

## Appendix — superseded original roadmap

The first draft (native-Kotlin rewrite, 15-table Supabase overhaul, monorepo `packages/split-engine`, push/FCM, generic groups) is **deliberately deferred** — over-engineered for a 2–5-person travel app and risky against the friend's live data. Most parity computes client-side on the existing receipt model. Revisit Tier-3 only when there's a real second use case (non-trip groups, recurring household bills). See git history for the original PR-A##/PR-C## breakdown.
