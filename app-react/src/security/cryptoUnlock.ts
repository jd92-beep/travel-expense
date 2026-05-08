const UNLOCK_PAYLOAD = {
  salt: 'aL38NSIzFN6ZdfK7CNLwwg==',
  iv: 'RTcpLm0R/PQxL1fH',
  data: 'bHTWpWdwPGhKURm/MarHOTXxIdWDTnbUMejAeUCc9gtCqmB5TrdTmzCmgdv2MTDe/CFmN1lhVNWBXk4qV8WdRQ==',
};

const b64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export async function unlockWithPassword(password: string): Promise<boolean> {
  if (!password) return false;
  try {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: b64ToBytes(UNLOCK_PAYLOAD.salt),
        iterations: 100000,
        hash: 'SHA-256',
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(UNLOCK_PAYLOAD.iv) },
      key,
      b64ToBytes(UNLOCK_PAYLOAD.data),
    );
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as { ok?: boolean; scope?: string };
    return parsed.ok === true && parsed.scope === 'travel-expense-react';
  } catch {
    return false;
  }
}

