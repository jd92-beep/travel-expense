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
wrangler secret put SUPABASE_PUBLISHABLE_KEY
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
- `POST /integrations/notion/connect`
- `GET /integrations/notion/status`
- `POST /integrations/notion/disconnect`
- `POST /notion/request`
- `POST /kimi/json`
- `POST /google/json`

All credential-bearing provider requests happen server-side. Browser code receives only a short-lived session token.
For public Supabase users, Notion requests can also carry `X-Supabase-Auth:
Bearer <access-token>`. In that mode the Worker uses the signed-in user's
encrypted Notion token from KV and never falls back to the global Notion
credential.

---

## 🔑 KEK & Session Secret Rotation Guide

This guide outlines the critical operational workflows required to rotate the core cryptographic master keys (`CREDENTIALS_KEK` and `APP_SESSION_SECRET`) inside the serverless Credential Broker.

> [!CAUTION]
> Key rotation is a high-privilege administrative action. If performed incorrectly, you can permanently lock out users, invalidate active devices, or render existing encrypted credentials in the Cloudflare KV database unreadable (resulting in data access denial to Notion/AI providers). Follow these steps carefully.

### 1. Rotating the Session Secret (`APP_SESSION_SECRET`)

The `APP_SESSION_SECRET` is used as the HMAC-SHA-256 signing key for short-lived session tokens (`X-Travel-Session`).

#### 💥 Impact of Rotation
* All active user sessions are invalidated **instantly**.
* All trusted devices will fail validation on their next `/notion/request` or `/google/json` call.
* **Device Trust remains intact:** Because device identities are tied to ECDSA P-256 keys in the KV database and not signed by the session key, trusted devices **will NOT be deleted**.
* **User Experience:** The user will be seamlessly prompted by the React App to perform a challenge-response verification (passive unlock) on their next visit, which silently regenerates a valid session without typing the master passphrase.

#### 🛠️ Step-by-Step Rotation
1. Generate a strong, cryptographically secure 256-bit key (represented as a URL-safe Base64 string or a long random alphanumeric string):
   ```bash
   openssl rand -base64 32
   ```
2. Upload the new secret to your Cloudflare Worker using Wrangler:
   ```bash
   wrangler secret put APP_SESSION_SECRET
   ```
3. When prompted, paste your newly generated secret.
4. Redeploy the worker if not automatically updated. Active sessions will instantly expire, and the frontend will request a silent challenge refresh.

---

### 2. Rotating the Master Key Encryption Key (`CREDENTIALS_KEK`)

The `CREDENTIALS_KEK` is the primary Master Key. A SHA-256 digest of this KEK is used as an AES-256-GCM symmetric key to encrypt and decrypt provider secrets (Notion integration tokens, Kimi keys, Google Gemini keys) at rest inside the `CREDENTIALS_VAULT` KV namespace.

> [!WARNING]
> Changing `CREDENTIALS_KEK` in Cloudflare without decrypting and re-encrypting the existing KV values first will make all existing credentials **completely unreadable**, throwing GCM tag authentication failures on every API attempt!

#### 🛠️ Zero-Downtime Safe Rotation Workflow
To rotate `CREDENTIALS_KEK` without breaking backend integrations, you must execute a migration loop: **Read (Old KEK) ➡️ Re-encrypt (New KEK) ➡️ Write (KV) ➡️ Update wrangler**.

A local migration script is provided in the repository to automate this process securely.

#### Option A: Using the Automated Rotation Script (Recommended)
We have a local administrative script `scripts/rotate-kek.mjs` (or you can run it via node). Here is the manual procedure it executes:

1. **Prerequisites**: Ensure you have local terminal access with Wrangler authenticated.
2. **Execute the Migration Command**:
   Run the migration utility by supplying the **Old KEK**, the **New KEK**, and the target **Broker Admin Passphrase**:
   ```bash
   OLD_CREDENTIALS_KEK="<current_kek>" \
   NEW_CREDENTIALS_KEK="<new_kek>" \
   ADMIN_ROTATION_PASSPHRASE="<admin_rotation_passphrase>" \
   BROKER_URL="https://your-worker.example.workers.dev" \
   node scripts/migrate-kek.js
   ```
   *Note: This script pulls down the currently encrypted items using the old KEK, decrypts them locally in memory, re-encrypts them using the new KEK, and uploads them back to KV via `/credentials/rotate` endpoint.*

#### Option B: Fully Manual KV Database Migration
If you must rotate keys entirely through the Cloudflare Dashboard and command line:

1. **Export existing provider records**:
   Use Wrangler to read the encrypted values from your KV namespace:
   ```bash
   wrangler kv key get --namespace-id <namespace_id> "credential:notion"
   wrangler kv key get --namespace-id <namespace_id> "credential:kimi"
   wrangler kv key get --namespace-id <namespace_id> "credential:google"
   ```
2. **Decrypt locally**:
   Write a small Node.js script using the Web Crypto API or Node `crypto` to decrypt each payload utilizing the SHA-256 digest of your **Old KEK** and the `iv` saved in each record.
3. **Set the new KEK in Cloudflare**:
   ```bash
   wrangler secret put CREDENTIALS_KEK
   ```
   Paste the **New KEK** value.
4. **Re-encrypt and Write back to KV**:
   Encrypt the decrypted plaintext credentials using the new KEK (generate fresh IVs!).
   Write the newly encrypted records back to KV:
   ```bash
   wrangler kv key put --namespace-id <namespace_id> "credential:notion" '<encrypted_payload_json>'
   wrangler kv key put --namespace-id <namespace_id> "credential:kimi" '<encrypted_payload_json>'
   wrangler kv key put --namespace-id <namespace_id> "credential:google" '<encrypted_payload_json>'
   ```
5. **Verify integrity**:
   Run `npm run self-test` or visit the app settings tab to verify `/credentials/status` reports `"connected"` for all providers under the new key.
