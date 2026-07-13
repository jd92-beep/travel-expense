# Passkey Recovery

Use this only when every registered Boss passkey is unavailable. There is no application backdoor.
For routine rotation while two or more passkeys remain usable, use the Console passkey manager:
removal requires the current passphrase, a current passkey, a fresh server preview and a single-use
step-up grant; success revokes every Admin session. Never use this recovery procedure for routine
rotation.

1. The Vercel and Supabase platform owner opens a maintenance incident.
2. Set global writes to deny-all and revoke every Admin session and machine key.
3. Perform the reviewed one-time platform operation that resets passkey enrollment state.
4. Add a temporary bootstrap secret through the Vercel production environment. Never commit it.
5. Boss signs in with the current passphrase and enrolls a new user-verified passkey on the exact
   production origin/RP ID.
6. Verify one successful authentication and counter update.
7. Remove the bootstrap secret and confirm the bootstrap route fails closed.
8. Rotate the BFF signing key and revoke sessions created before recovery.
9. Record the incident, deployment provenance and audit digest without credential values.

Deleting the final passkey through normal console UI remains prohibited.
