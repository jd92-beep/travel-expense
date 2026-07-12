import { sha256Hex } from './crypto.js';

const PASSKEY_ENROLL_ACTION = 'passkey_enroll';
const PASSKEY_ENROLL_TARGET = 'boss-passkey-set';
const PASSKEY_ENROLL_PREVIEW = 'add-backup-passkey-v1';

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
