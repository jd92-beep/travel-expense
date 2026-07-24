# Milestone 4 Provider Catalog Report

## Status

`DONE_CANDIDATE` - awaiting independent review.

## Scope

- Added the secret-free root catalog and four build-time adapters for Compact, Broker, Admin BFF and Admin Edge.
- Compact excludes `volcano/kimi-k3`; Android remains represented in the catalog and will be ported separately.
- Broker, Admin BFF and Admin Edge each recognise the six approved Volcano LLMs.
- No Seedance/media model, route, credential, database, RLS, live-data, deployment or Android source changed.

## TDD

- RED: `node --experimental-strip-types scripts/provider-catalog-contract.test.mjs` failed with `ERR_MODULE_NOT_FOUND` for `contracts/ai-provider-catalog.json`.
- GREEN: the same command printed `provider catalog contract passed` after the root catalog and adapters were added.

## Verification

- Compact: `typecheck`, build, `security:scan`, AI routing `5 passed, 1 skipped`, Settings `10 passed, 1 skipped`.
- Broker: `check`, `self-test`.
- Admin: `typecheck`, build, `security:scan`, unit `33/33`, contract `24/24`.
- Edge: Deno fmt/lint (`28 files`), check and test `73/73`.
- Root: secret scan passed; staged GitNexus reported `21 files, 19 symbols, 0 affected processes, low`;
  `git diff --check` and `git diff --cached --check` exited `0` with no output.

## Guarded Notes

- The browser smokes use `run-with-dev-server.mjs` with `npm exec -- playwright`; bare `playwright` resolved to a different CLI and exited before assertions with `unknown command 'test'`.
- One existing skip remains in each requested Compact browser suite; no assertion or gate was weakened.
