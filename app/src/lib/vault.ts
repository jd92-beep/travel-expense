// AES-256-GCM + PBKDF2/SHA-256 @ 100k iterations — ciphertext baked from legacy.
// Contains: apiKey, notionToken, notionDb, zaiKey, minimaxKey
export const VAULT_CT =
  'RKLl1YypyOd3UkYAFWPCoQ==.NkuyEZb1Ag7VfSiR.TcSRh77yO21BAF0WY/+8VongoBAVzSD0OBxWqBs2bMCKMlyynFGutOxge2UXpoyFVukVInSE1dUiESAxvPQ43wIJbFkygPZ8XTJlKP+7wkiZEbUBDOzbXScsbIZnG95SE++cxBHWy+OGxCbf2FCna2RXflJqDNm1MnJQ7U3oJSZdnbxmOk/zIrc3ueO3e2duhMl+264tnc1aVn/bOjKj+GJn/akqJeIgyZgY+6iFJVFXDAZ/atzIdO+iQqspaj2ycFUJusZVDhM31OOQyhLD1rl3Nvc2lPUmvymsGaIl6bdtVI5dd7awi/Gvz9KHJRjFv7UyYyggEMDELOWZt/XEKE6isw4MEKcUWwpoijKG3PdxVsep9gHZp6GPDSVFkeJOd8Eeh1pVHvZiBR5onk9z8qzhUl5cHDgxF6YzX7aCdRAI2TBUaYzNVCq4HH4x8dxc6pk5SCXKO2Q=';

export interface VaultContents {
  apiKey?: string;       // Gemini
  notionToken?: string;  // Notion
  notionDb?: string;     // Notion DB ID
  zaiKey?: string;       // Zhipu GLM
  minimaxKey?: string;   // MiniMax
}

function b64d(s: string): ArrayBuffer {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  // Return the underlying ArrayBuffer (not SharedArrayBuffer) for WebCrypto compat
  return u8.buffer;
}

async function deriveKey(
  password: string,
  salt: ArrayBuffer,
): Promise<CryptoKey> {
  const pwKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    pwKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Decrypt the baked vault ciphertext with the user's password. Throws on wrong password. */
export async function unlockVault(password: string): Promise<VaultContents> {
  const [saltB64, ivB64, ctB64] = VAULT_CT.split('.');
  const salt = b64d(saltB64);
  const iv = b64d(ivB64);
  const ct = b64d(ctB64);
  const key = await deriveKey(password, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt)) as VaultContents;
}
