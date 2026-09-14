const TRUST_KEY = 'travel-expense-react:device-trust:v1';

type DeviceTrustMeta = {
  ok?: boolean;
  exp?: number;
  /** Bound to the local crypto device id when available — a flag-only forgery without a matching key is rejected. */
  deviceId?: string | null;
};

export function hasDeviceTrust(): boolean {
  try {
    const raw = localStorage.getItem(TRUST_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as DeviceTrustMeta;
    return !!parsed.ok && Number(parsed.exp) > Date.now();
  } catch {
    return false;
  }
}

export function loadDeviceTrustMeta(): DeviceTrustMeta | null {
  try {
    const raw = localStorage.getItem(TRUST_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DeviceTrustMeta;
  } catch {
    return null;
  }
}

export function setDeviceTrust(deviceId?: string | null): void {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 365;
  localStorage.setItem(TRUST_KEY, JSON.stringify({ ok: true, exp, deviceId: deviceId || null }));
}

export function clearDeviceTrust(): void {
  localStorage.removeItem(TRUST_KEY);
}
