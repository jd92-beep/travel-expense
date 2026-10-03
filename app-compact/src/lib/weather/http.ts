// Public weather endpoints only. Coalesce in-flight requests, including StrictMode
// mounts and Dashboard/Weather callers. Never memoize a rejected request.
const pending = new Map<string, Promise<unknown>>();
const recent = new Map<string, { at: number; value: unknown }>();

export async function weatherRequest<T>(url: string, options: { text?: boolean; force?: boolean; ttl?: number; cache?: boolean } = {}): Promise<T> {
  const key = `${options.cache === false ? 'ephemeral:' : ''}${options.text ? 'text' : 'json'}:${url}`;
  const inflight = pending.get(key);
  if (inflight) return inflight as Promise<T>;
  const cached = recent.get(key);
  if (options.cache !== false && !options.force && cached && Date.now() - cached.at < (options.ttl ?? 60_000)) return cached.value as T;
  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      // The app owns expiry. In particular, precise device coordinates must not
      // create a browser disk cache entry or send unrelated cross-site cookies.
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error(`氣象服務 HTTP ${response.status}`);
      const value = options.text ? await response.text() : await response.json();
      if (options.cache !== false) {
        if (recent.size >= 100) recent.delete(recent.keys().next().value!);
        recent.set(key, { at: Date.now(), value });
      }
      return value;
    } finally {
      clearTimeout(timeout);
      pending.delete(key);
    }
  })();
  pending.set(key, request);
  return request as Promise<T>;
}
