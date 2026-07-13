# Admin Runbooks

These runbooks are the operator procedures for the Travel Expense Admin Console. They never contain
passphrases, tokens, keys, credential values or production payloads.

- `maintenance-and-rollback.md`: Admin 1.0 cutover, canary and forward-only rollback.
- `credential-incident.md`: machine-key exposure and rotation.
- `passkey-recovery.md`: platform-owner recovery when every Boss passkey is unavailable.
- `account-deletion.md`: Admin 1.1 scheduled deletion procedure; disabled in Admin 1.0.
- `notion-repair-saga.md`: Admin 1.1 trip-scoped Notion write repair; disabled in Admin 1.0.

Live writes remain denied until the release checklist, compatibility gates and Boss approval are all
recorded. Never use an old token, public grant or old authentication route as rollback.
