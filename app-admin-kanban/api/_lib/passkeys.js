import { sha256Hex } from './crypto.js';

const PASSKEY_ENROLL_ACTION = 'passkey_enroll';
const PASSKEY_ENROLL_TARGET = 'boss-passkey-set';
const PASSKEY_ENROLL_PREVIEW = 'add-backup-passkey-v1';
const PASSKEY_REMOVE_ACTION = 'passkey_remove';

export function passkeyRemovalSelector(credentialId) {
  return sha256Hex(`passkey-remove-selector-v1\n${String(credentialId || '')}`);
}

export function passkeyRemovalSetHash(credentials) {
  const selectors = Array.isArray(credentials)
    ? credentials.map((credential) => passkeyRemovalSelector(credential.credentialId)).sort()
    : [];
  return sha256Hex(selectors.join('\n'));
}

export function passkeyRemovalContext(selector, setHash) {
  if (!/^[0-9a-f]{64}$/.test(String(selector)) || !/^[0-9a-f]{64}$/.test(String(setHash))) {
    throw new Error('Passkey removal context is invalid');
  }
  return {
    action: PASSKEY_REMOVE_ACTION,
    targetHash: sha256Hex(`passkey-remove-target-v1\n${selector}`),
    previewHash: sha256Hex(`passkey-remove-preview-v1\n${selector}\n${setHash}`),
  };
}

export function passkeyRemovalPreview(credentials, target) {
  if (!Array.isArray(credentials)) throw new Error('Passkey store unavailable');
  const selector = /^[0-9a-f]{64}$/.test(String(target))
    ? String(target)
    : passkeyRemovalSelector(target);
  const credential = credentials.find((entry) => passkeyRemovalSelector(entry.credentialId) === selector);
  if (!credential) throw new Error('Passkey removal target is unavailable');
  if (credentials.length <= 1) throw new Error('Final passkey is break-glass protected');
  return {
    selector,
    setHash: passkeyRemovalSetHash(credentials),
    count: credentials.length,
    remainingCount: credentials.length - 1,
    target: sanitizePasskeyCredentials([credential])[0],
  };
}

export function passkeyEnrollmentContext() {
  return {
    action: PASSKEY_ENROLL_ACTION,
    targetHash: sha256Hex(PASSKEY_ENROLL_TARGET),
    previewHash: sha256Hex(PASSKEY_ENROLL_PREVIEW),
  };
}

export function sanitizePasskeyCredentials(credentials) {
  if (!Array.isArray(credentials)) return [];
  return credentials.map((credential) => ({
    id: sha256Hex(String(credential.credentialId || '')).slice(0, 12),
    label: String(credential.label || '').trim().slice(0, 128) || 'Boss passkey',
    deviceType: String(credential.deviceType || 'unknown').slice(0, 64),
    backedUp: credential.backedUp === true,
    createdAt: credential.createdAt || null,
    lastUsedAt: credential.lastUsedAt || null,
  }));
}

export function sameCredentialIds(credentials, expectedIds) {
  if (!Array.isArray(credentials) || !Array.isArray(expectedIds)) return false;
  const current = credentials.map((credential) => String(credential.credentialId || '')).sort();
  const expected = expectedIds.map(String).sort();
  return current.length === expected.length && current.every((id, index) => id === expected[index]);
}
