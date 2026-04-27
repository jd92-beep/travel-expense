/**
 * kimi-proxy-deno.ts — Deno Deploy proxy for Kimi for Coding API
 *
 * Deploys to Deno Deploy (deno.com/deploy) — uses non-Cloudflare IPs,
 * bypassing the CF Worker IP block that kimi.com's Cloudflare WAF enforces.
 *
 * Deploy:
 *   deployctl deploy --project=kimi-proxy kimi-proxy-deno.ts
 *   → gets URL like https://kimi-proxy-<hash>.deno.dev
 *
 * Why not CF Workers:
 *   kimi.com is protected by Cloudflare, which blocks outbound requests
 *   originating from CF Worker IPs (2a06:98c0::/32 range).
 *   Deno Deploy runs on Google Cloud / Deno's own infrastructure, so
 *   requests come from a different IP range that isn't blocked.
 */

const KIMI_BASE   = 'https://api.kimi.com/coding/v1';
const REQUIRED_UA = 'claude-code/0.1.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  'Access-Control-Max-Age':       '86400',
};

function corsResponse(body: string | null, status: number, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extra },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Build target URL
  const url     = new URL(req.url);
  const target  = KIMI_BASE + url.pathname + url.search;

  // Build clean headers — only forward Authorization + Content-Type
  const headers = new Headers({
    'Authorization': req.headers.get('Authorization') ?? '',
    'Content-Type':  req.headers.get('Content-Type')  ?? 'application/json',
    'Accept':        'application/json',
    'User-Agent':    REQUIRED_UA,
  });

  // Forward to Kimi API
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method:  req.method,
      headers,
      body:    ['GET', 'HEAD'].includes(req.method) ? null : req.body,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return corsResponse(JSON.stringify({ error: { message: 'Proxy fetch error: ' + msg } }), 502);
  }

  // Detect HTML (bot-block / error page) instead of JSON
  const ct = upstream.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    const bodyText = await upstream.text();
    const isBlocked = bodyText.includes('blocked') || bodyText.includes('cf-error') || bodyText.includes('Attention Required');
    return corsResponse(
      JSON.stringify({
        error: {
          message: isBlocked
            ? 'Upstream blocked the request — try a different proxy region'
            : `Unexpected content-type: ${ct}`,
          upstream_status: upstream.status,
        },
      }),
      502,
    );
  }

  // Pass through JSON response with CORS headers
  const respHeaders = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) respHeaders.set(k, v);

  return new Response(upstream.body, {
    status:  upstream.status,
    headers: respHeaders,
  });
});
