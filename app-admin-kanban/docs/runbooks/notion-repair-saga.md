# Notion Repair Saga

Trip-scoped Notion write repair belongs to Admin 1.1 and is server-disabled in Admin 1.0. Admin 1.0
offers reconciliation dry-run only.

1. Resolve owner, integration and database on the server; the browser never submits a database ID.
2. Reconcile exactly one trip with key `(resolved database, TripID, SourceID)`.
3. Exclude private receipts and metadata rows.
4. Preview every link, create, photo, skip and blocked step with an expiry and affected-row hash.
5. Require R3 step-up and the exact target phrase before enqueue.
6. Give each external step an idempotency key, attempt count, verified result and resume instruction.
7. Permit HTTPS only, at most two redirects, no private/loopback/link-local hosts, a 10 MiB streamed
   limit and actual MIME validation for photos.
8. Retry failed steps only; never repeat verified page creation.
9. After the saga, rerun reconciliation. Mark resolved only when the trip is balanced.
10. A partial result remains visible as `partially_failed` or `failed_manual`; never claim rollback of
    an external side effect that already succeeded.
