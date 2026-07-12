# Credential Incident

## Contain

1. Set `ADMIN_WRITE_MODE=deny_all` and revoke active Admin sessions.
2. Build an inventory containing only credential name, trust domain, consumer and last rotation time.
3. Review Edge, Broker, Notion and provider logs for suspicious request IDs. Do not copy raw tokens.

## Rotate

1. Create a new scoped Edge-to-Broker key.
2. Temporarily allow current and next key at the Broker, switch Edge, and verify the fixed route.
3. Remove the old Broker binding after the new route succeeds.
4. Create a new BFF-to-Edge signing key, switch the BFF and verify nonce/replay rejection.
5. Remove old `ADMIN_TOKEN`, generic bypass and retired key bindings completely.
6. Rotate provider credentials only when the inventory or logs show that trust domain was affected.

## Close

1. Scan the current tree and full Git history for credential patterns.
2. Verify the old route/binding is absent and the new scoped route succeeds.
3. Verify no secret appears in audit, support bundles, screenshots or CI output.
4. Save request IDs, deployment IDs and the redacted closure report in the incident record.
5. Never send an exposed token back to a live service as a probe and never use it for rollback.
