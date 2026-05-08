# Travel Expense Credential Broker

This Cloudflare Worker keeps Notion, Kimi, and Google credentials out of the public React bundle.

## Security Contract

- Do not place real credentials in this folder.
- Use `wrangler secret put` for immutable secrets.
- Store provider credentials only through the encrypted rotation endpoint or a local-only seed script.
- Do not commit `.dev.vars`, seed files, KV exports, logs, or copied tokens.

## Required Worker Secrets

Set these in Cloudflare, never in git:

```bash
wrangler secret put APP_UNLOCK_HASH
wrangler secret put APP_SESSION_SECRET
wrangler secret put ADMIN_ROTATION_HASH
wrangler secret put CREDENTIALS_KEK
```

Hash format for `APP_UNLOCK_HASH` and `ADMIN_ROTATION_HASH`:

```text
pbkdf2:100000:<salt-base64>:<hash-base64>
```

Cloudflare Workers currently reject PBKDF2 iteration counts above `100000`; keep
hash specs at or below this limit.

## KV

Create one KV namespace and put its id into `wrangler.jsonc`:

```bash
wrangler kv namespace create CREDENTIALS_VAULT
```

## Local Verification

These checks do not use real provider credentials:

```bash
npm run check
npm run self-test
```

The self-test uses fake in-memory KV and provider fetch stubs to verify unlock, session auth, admin credential rotation, Notion proxying, Kimi JSON proxying, Google JSON proxying, blocked origins, and oversized request rejection.

## Seed Provider Credentials

After the Worker is deployed and the immutable secrets are set, an admin can seed the encrypted vault from a local shell. Keep these values in your shell or a gitignored local file only:

```bash
BROKER_URL='https://your-worker.example.workers.dev' \
APP_UNLOCK_PASSPHRASE='<app unlock passphrase>' \
ADMIN_ROTATION_PASSPHRASE='<admin rotation passphrase>' \
NOTION_PROVIDER_SECRET='<notion integration token>' \
NOTION_DATABASE_ID='<notion database id>' \
KIMI_PROVIDER_SECRET='<kimi api key>' \
GOOGLE_PROVIDER_SECRET='<google api key>' \
npm run seed:vault
```

Only the configured providers are rotated. The script never prints raw credentials.

## Runtime Endpoints

- `GET /health`
- `POST /session/unlock`
- `GET /credentials/status`
- `POST /credentials/test`
- `POST /credentials/test-all`
- `POST /credentials/rotate`
- `POST /notion/request`
- `POST /kimi/json`
- `POST /google/json`

All credential-bearing provider requests happen server-side. Browser code receives only a short-lived session token.
