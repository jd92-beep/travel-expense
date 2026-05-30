const TRUST_KEY = 'travel-expense-react:device-trust:v1';

export function hasDeviceTrust(): boolean {
  try {
    const raw = localStorage.getItem(TRUST_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { ok?: boolean; exp?: number };
    return !!parsed.ok && Number(parsed.exp) > Date.now();
  } catch {
    return false;
  }
}

export function setDeviceTrust(): void {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 365;
  localStorage.setItem(TRUST_KEY, JSON.stringify({ ok: true, exp }));
}

export function clearDeviceTrust(): void {
  localStorage.removeItem(TRUST_KEY);
}
