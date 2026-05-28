import type { TrustedBrokerDevice } from '../lib/credentialBroker';

const TRUSTED_DEVICE_META_KEY = 'travel-expense-react:trusted-broker-device:v1';
const TRUST_DB_NAME = 'travel-expense-react-trust';
const TRUST_DB_VERSION = 1;
const TRUST_STORE = 'keys';
const TRUST_PRIVATE_KEY = 'trusted-device-private-key';

export type TrustedDeviceRegistration = {
  privateKey: CryptoKey;
  devicePublicKey: JsonWebKey;
  deviceName: string;
};

function bytesToB64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deviceName(): string {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || 'browser';
  return `React app on ${platform}`;
}

function openTrustDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(TRUST_DB_NAME, TRUST_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TRUST_STORE)) db.createObjectStore(TRUST_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Trusted device DB open failed'));
  });
}

async function putPrivateKey(privateKey: CryptoKey): Promise<void> {
  const db = await openTrustDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TRUST_STORE, 'readwrite');
    tx.objectStore(TRUST_STORE).put(privateKey, TRUST_PRIVATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Trusted device key write failed'));
  }).finally(() => db.close());
}

async function getPrivateKey(): Promise<CryptoKey | null> {
  try {
    const db = await openTrustDb();
    return await new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction(TRUST_STORE, 'readonly');
      const req = tx.objectStore(TRUST_STORE).get(TRUST_PRIVATE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('Trusted device key read failed'));
    }).finally(() => db.close());
  } catch {
    return null;
  }
}

async function clearPrivateKey(): Promise<void> {
  try {
    const db = await openTrustDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TRUST_STORE, 'readwrite');
      tx.objectStore(TRUST_STORE).delete(TRUST_PRIVATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Trusted device key clear failed'));
    }).finally(() => db.close());
  } catch {
    // Best effort.
  }
}

export function loadTrustedDevice(): TrustedBrokerDevice | null {
  try {
    const raw = localStorage.getItem(TRUSTED_DEVICE_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TrustedBrokerDevice;
    if (!parsed.deviceId || Number(parsed.expiresAt || 0) <= Date.now()) {
      localStorage.removeItem(TRUSTED_DEVICE_META_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function createTrustedDeviceRegistration(): Promise<TrustedDeviceRegistration> {
  const generated = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const privatePkcs8 = await crypto.subtle.exportKey('pkcs8', generated.privateKey);
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privatePkcs8,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const devicePublicKey = await crypto.subtle.exportKey('jwk', generated.publicKey);
  return { privateKey, devicePublicKey, deviceName: deviceName() };
}

export async function saveTrustedDevice(device: TrustedBrokerDevice, privateKey: CryptoKey): Promise<void> {
  if (!device.deviceId || Number(device.expiresAt || 0) <= Date.now()) throw new Error('Trusted device response invalid');
  await putPrivateKey(privateKey);
  localStorage.setItem(TRUSTED_DEVICE_META_KEY, JSON.stringify({
    deviceId: device.deviceId,
    deviceName: device.deviceName || deviceName(),
    createdAt: Number(device.createdAt || Date.now()),
    expiresAt: Number(device.expiresAt),
  }));
}

export async function signTrustedDeviceChallenge(deviceId: string, challenge: string): Promise<string> {
  const privateKey = await getPrivateKey();
  if (!privateKey) throw new Error('Trusted device key missing');
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(`${deviceId}:${challenge}`),
  );
  return bytesToB64Url(signature);
}

export async function clearTrustedDevice(): Promise<void> {
  localStorage.removeItem(TRUSTED_DEVICE_META_KEY);
  await clearPrivateKey();
}
