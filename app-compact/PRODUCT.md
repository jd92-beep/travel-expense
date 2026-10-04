# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Mobile-first installable PWA; an Android build ports the same surfaces.)

## Users

Hong Kong travellers who read Cantonese / Traditional Chinese first. They log
spending on their phone in the middle of a trip — at a counter, on a train, in a
queue — often one-handed and in a hurry. A trip is frequently shared by a small
group (friends, family) who split one ledger, so several people add receipts to
the same trip.

## Product Purpose

Record every trip expense with as little effort as possible and keep each
person's and each trip's ledger accurate and isolated, so the group can see
spend, budget, and who owes whom without bookkeeping.

On the Scan surface specifically, success is: **photo a receipt → it is saved
to the active trip**, with AI doing the reading and the person only confirming.

## Positioning

AI receipt capture that already knows the active trip — its country, currency,
dates, itinerary, and companions — so a photo becomes a correctly dated,
converted, attributed ledger entry rather than a raw scan.

## Operating Context

- Capture inputs: camera/photo of receipts (single or batch), voice dictation,
  pasted booking/confirmation email text or screenshots, and manual entry.
- AI providers are reached only through the Credential Broker using the
  selected model; quota/429 failures stop instead of silently falling back.
- Works offline-first: entries save locally and sync to Supabase (Notion is an
  optional mirror) when online.
- Foreign-currency spending is converted to HKD with live or user-fixed rates.

## Capabilities and Constraints

- Scan must keep every existing function: photo + batch OCR with review,
  voice parse, email/screenshot parse, manual entry, FX converter (live/fixed),
  per-input AI model routing, saving into the active trip only.
- Five trip themes must keep working on Scan: 日本和紙, 韓國韓紙, 台灣夜市
  (dark), 歐洲鐵路, 全球旅誌; "auto" follows the trip destination.
- Terminology: Trip, Ledger, Receipt (see repo `CONTEXT.md`).

## Brand Commitments

- Cantonese / Traditional Chinese is the primary UI language; English appears
  only as secondary labels or technical terms.

## Evidence on Hand

- No testimonials, metrics, or customer claims exist; do not invent any.
- Receipt examples in UI must be mock/demo data, never real user data.

## Product Principles

1. Capture first: the fastest path from "I just paid" to "it's recorded" wins.
2. AI reads, the person confirms — never make users type what a photo shows.
3. Trip-aware by default: currency, dates, and companions come from the trip.
4. Nothing is lost: offline entries and failed syncs stay visible and recoverable.
5. One-handed, glanceable, mobile-first.

## Accessibility & Inclusion

Must remain usable one-handed on a phone, with touch targets sized for
thumbs, readable contrast in every theme (including the dark night-market
theme), and reduced-motion support.
