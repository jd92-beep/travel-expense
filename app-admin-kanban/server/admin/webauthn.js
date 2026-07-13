import crypto from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

import { sha256Hex, timingSafeStringEqual } from './crypto.js';

const FLOW_TIMEOUT_MS = 5 * 60 * 1000;

export function webAuthnConfig() {
  const productionOrigin = 'https://travel-expense-admin-kanban.vercel.app';
  const origin = process.env.VERCEL_ENV === 'production'
    ? productionOrigin
    : process.env.ADMIN_WEBAUTHN_ORIGIN || productionOrigin;
  const rpID = process.env.VERCEL_ENV === 'production'
    ? 'travel-expense-admin-kanban.vercel.app'
    : process.env.ADMIN_WEBAUTHN_RP_ID || 'travel-expense-admin-kanban.vercel.app';
  if (!/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(origin)
    || !/^[A-Za-z0-9.-]+$/.test(rpID)
    || new URL(origin).hostname !== rpID) {
    throw new Error('Admin WebAuthn origin or RP ID is invalid');
  }
  return { origin, rpID };
}

export function challengeContext(kind, flowId, extra = '') {
  return sha256Hex(`${kind}\n${flowId}\n${extra}`);
}

function storedCredential(entry) {
  return {
    id: entry.credentialId,
    publicKey: new Uint8Array(Buffer.from(entry.publicKey, 'base64url')),
    counter: Number(entry.counter || 0),
    transports: Array.isArray(entry.transports) ? entry.transports : [],
  };
}

export async function authenticationOptions(credentials) {
  const { rpID } = webAuthnConfig();
  return generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      transports: Array.isArray(credential.transports) ? credential.transports : [],
    })),
    timeout: FLOW_TIMEOUT_MS,
    userVerification: 'required',
  });
}

export async function verifyAuthentication(response, challenge, credential) {
  const { origin, rpID } = webAuthnConfig();
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: storedCredential(credential),
    requireUserVerification: true,
    advancedFIDOConfig: { userVerification: 'required' },
  });
  if (!result.verified || !result.authenticationInfo.userVerified) {
    throw new Error('Passkey verification failed');
  }
  return result.authenticationInfo;
}

export async function registrationOptions(credentials, actor = 'boss') {
  const { rpID } = webAuthnConfig();
  return generateRegistrationOptions({
    rpName: 'Travel Expense Admin Console',
    rpID,
    userID: new Uint8Array(Buffer.from(sha256Hex(actor), 'hex')),
    userName: actor,
    userDisplayName: 'Boss',
    timeout: FLOW_TIMEOUT_MS,
    attestationType: 'none',
    excludeCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      transports: Array.isArray(credential.transports) ? credential.transports : [],
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
  });
}

export async function verifyRegistration(response, challenge) {
  const { origin, rpID } = webAuthnConfig();
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserPresence: true,
    requireUserVerification: true,
  });
  if (!result.verified || !result.registrationInfo?.userVerified) {
    throw new Error('Passkey registration failed');
  }
  return result.registrationInfo;
}

export function registrationRecord(info, label) {
  return {
    credentialId: info.credential.id,
    publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
    counter: info.credential.counter,
    transports: info.credential.transports || [],
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    label: String(label || '').trim().slice(0, 128) || null,
  };
}

export function verifyBootstrapSecret(value) {
  const expected = process.env.ADMIN_PASSKEY_BOOTSTRAP_SECRET;
  if (!expected || expected.length < 32 || typeof value !== 'string') return false;
  return timingSafeStringEqual(value, expected);
}

export function bootstrapFingerprint() {
  const expected = process.env.ADMIN_PASSKEY_BOOTSTRAP_SECRET;
  if (!expected || expected.length < 32) throw new Error('Passkey bootstrap is disabled');
  return crypto.createHash('sha256').update(expected).digest('hex');
}
