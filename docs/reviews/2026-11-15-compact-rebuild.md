# Compact 0.36.3 rebuild and release checks

Boss authorized rebuilding, repairing, committing and pushing the current app on 2026-11-15. This includes the earlier [DeepSeek defaults and AI checklist implementation](2026-11-15-deepseek-defaults-ai-checklist.md). Unrelated AGENTS.md edits, historical handover sections, design settings, reference videos and older untracked reviews remain outside the commit.

## Repairs

- All four Compact AI defaults use DeepSeek V4.1 Flash 1017, with explicit Qwen3.7 Flash and free Ling choices preserved. Each request uses one selected model; quota/rate failures stop.
- Every theme uses the fixed 52-item video checklist; AI extras use a separate final group. Rejected extras now also retain a normalized name marker, preventing an AI spelling change in case, full-width characters or whitespace from resurrecting a deleted item. Existing item IDs, completion, edits and account/trip isolation are retained.
- New-trip wizard regression fixtures now verify the DeepSeek default and one explicit Qwen request instead of the superseded automatic fallback chain.
- The installed Playwright version rejects Ubuntu 26.04. The five workflow jobs that install Chromium now use Ubuntu 24.04. Protected production still requires its explicit manual dispatch and environment approval.
- The three frontend Vite ranges now require at least 8.1.6; lockfiles resolve 8.3.8. The Broker Undici override requires at least 7.30.1 and resolves 7.30.2. All four complete npm audits report zero findings. These address the existing [Vite advisories](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22) and [Undici advisories](https://github.com/nodejs/undici/security/advisories/GHSA-4w7w-5xrc-9h26), without audit suppression or a forced major upgrade.
- Edge imports retain Supabase JS 2.87.0 using Deno's native integrity-locked npm import. This removes the failing mutable esm.sh tslib wrapper from the active dependency graph; the changed CDN content was not accepted by replacing its old hash.
- Broker source includes the 24,000-token itinerary budget and truncated-output rejection from the preceding implementation. This is source/build verification, not a Worker deployment receipt.

Versions: Compact 0.36.3, React 0.2.12, Admin package 1.5.4; Broker package 0.1.1 / service source 2026.11.15.2. No browser storage schema or database migration changed.

## Verification

- Compact: final complete configured browser run, 251 passed / 2 skipped; the local-security case excluded by configured mode passed separately. Thus 252 distinct enabled cases passed. The remaining pre-existing disabled Settings dry-run is unassessed. Earlier stale model assertions and missing test-environment failures were corrected or rerun with isolated fixtures, not hidden.
- All 17 local Compact unit/script groups passed, including journal, persistence, sync/merge, money, parsing, calendar, checklist, export and tab/shared-ledger contracts. The normalized-deletion regression failed before its repair and passed afterwards.
- Compact, React and Admin typecheck and production builds passed after dependency repairs. Existing module/chunk-size warnings remain non-fatal.
- React: nine timeline/mobile/local-security cases plus three configured authentication/security cases passed. The Compact/React browser shared-state round trip passed after dependency updates.
- Admin: 36 unit tests, 25 contract tests and provider-catalog contract passed; 53 browser cases passed, one pre-existing skipped case. Browser runs use an owned localhost server with synthetic mocked APIs and cover mobile/reflow/accessibility. No production Admin operation was issued.
- Edge: formatting, lint, typecheck and 78 isolated contract tests passed. Broker syntax/self-tests and a fresh Wrangler dry-run passed. Migration-policy and project secret scans passed.
- Full npm audits for all three frontends and the Broker found zero advisories at check time. Dependency installation disabled lifecycle scripts.

The tests use disposable browser state and mocked network services. This rebuild makes no new paid inference request, live database write, migration, credential/vault change or physical-device/Safari claim.

## Publication checks and delivery boundaries

Local TruffleHog 3.99.9 runs with verification/update disabled. The full affected history was reconstructed across 87 public remote refs: 389 commit objects and 1,078 full file blobs. Raw and decoded scans found no unclassified sensitive value; 51 historical variants of one existing synthetic redaction fixture were classified as test data. Literal concatenation, escapes and Base64 are also inspected, and the authorized current OpenRouter value is compared only in memory. No secret values enter the report.

Before each publication operation, scan its actual scope again: complete staged files/diff and generated frontend/Broker output before commit; exact outgoing objects, deleted/renamed content and commit messages before push. Ignored local secrets are absent from the index and are not deployment inputs. This scope does not reclassify or erase previously recorded historical incidents, and scanners cannot guarantee absence under every possible encoding.

The authorized main push triggers the existing Pages and client CI workflows. Exact source-SHA deployment status, downloaded deployment artifacts, retained logs, live asset-byte comparison and seven-page mobile/desktop checks are separate release receipts retained with the chat. No manual Admin, Edge or Cloudflare Worker deployment is included in this rebuild-and-push request.
