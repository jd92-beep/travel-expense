import type { AppState } from './types';

type LegacySecretFields = {
  notionToken?: unknown;
  apiKey?: unknown;
  googleKey?: unknown;
  zaiKey?: unknown;
  minimaxKey?: unknown;
  openrouterKey?: unknown;
  kimiKey?: unknown;
  kimiProxy?: unknown;
  credentialSession?: unknown;
  credentialSessionExpiresAt?: unknown;
};

export function stripSensitiveState<T extends Partial<AppState>>(state: T): T {
  const {
    notionToken: _notionToken,
    apiKey: _apiKey,
    googleKey: _googleKey,
    zaiKey: _zaiKey,
    minimaxKey: _minimaxKey,
    openrouterKey: _openrouterKey,
    kimiKey: _kimiKey,
    kimiProxy: _kimiProxy,
    credentialSession: _credentialSession,
    credentialSessionExpiresAt: _credentialSessionExpiresAt,
    ...safeState
  } = state as T & LegacySecretFields;
  // Sharing invite tokens grant trip access, so keep them out of every durable snapshot.
  const sanitized = safeState as T & Partial<AppState>;
  if (Array.isArray(sanitized.trips)) {
    sanitized.trips = sanitized.trips.map((trip) => {
      const sharing = trip.sharing;
      if (!sharing?.invites || !sharing.invites.length) return trip;
      return { ...trip, sharing: { ...sharing, invites: sharing.invites.map(({ token: _token, ...rest }) => rest) } };
    });
  }
  return sanitized as T;
}
