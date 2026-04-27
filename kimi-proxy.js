/**
 * kimi-proxy.js — Cloudflare Worker
 * Proxies requests to api.kimi.com/coding/v1 with the required User-Agent header.
 *
 * Deploy: wrangler deploy  OR  paste into Cloudflare Dashboard → Workers → Quick Edit
 * Route: bind to any workers.dev subdomain, e.g. kimi-proxy.<your-account>.workers.dev
 *
 * Why this proxy exists:
 *   - Kimi for Coding API requires User-Agent: claude-code/0.1.0
 *   - Browsers cannot set User-Agent (forbidden request header)
 *   - This Worker runs server-side and injects the required UA before forwarding
 *
 * Note: If Kimi's Cloudflare WAF blocks CF Worker IPs, enable the fallback mode
 *       by setting the ROUTE_VIA_BACKUP env var, or deploy to Deno Deploy instead
 *       using the equivalent deno-proxy.ts (same logic, different IP range).
 */

const KIMI_BASE    = 'https://api.kimi.com/coding/v1';
const REQUIRED_UA  = 'claude-code/0.1.0';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  'Access-Control-Max-Age':       '86400',
};

export default {
  async fetch(request, env) {
    // ── CORS pre-flight ──────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── Build upstream URL ───────────────────────────────────────────────────
    const incoming = new URL(request.url);
    // Strip the leading slash — path on worker may be /chat/completions
    const target = KIMI_BASE + incoming.pathname + incoming.search;

    // ── Build forwarded headers ──────────────────────────────────────────────
    // Keep Authorization + Content-Type from the browser; override UA + Host.
    const headers = new Headers();
    headers.set('Authorization',  request.headers.get('Authorization') || '');
    headers.set('Content-Type',   request.headers.get('Content-Type')  || 'application/json');
    headers.set('Accept',         'application/json');
    headers.set('User-Agent',     REQUIRED_UA);
    // Explicitly do NOT forward Host (CF sets it from the target URL)

    // ── Forward request ──────────────────────────────────────────────────────
    let upstream;
    try {
      upstream = await fetch(target, {
        method:  request.method,
        headers,
        body:    ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        // Tell CF not to cache LLM responses
        cf: { cacheEverything: false },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: { message: 'Proxy fetch error: ' + err.message } }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } },
      );
    }

    // ── Detect CF bot-block page (HTML) instead of JSON ──────────────────────
    const ct = upstream.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const body = await upstream.text();
      const isBlocked = body.includes('cf-error') || body.includes('Attention Required') || body.includes('blocked');
      return new Response(
        JSON.stringify({
          error: {
            message: isBlocked
              ? 'Kimi API blocked CF Worker IP — see kimi-proxy.js for alternative deployment options'
              : `Unexpected upstream content-type: ${ct}`,
            upstream_status: upstream.status,
          },
        }),
        { status: upstream.status === 200 ? 502 : upstream.status,
          headers: { 'Content-Type': 'application/json', ...CORS } },
      );
    }

    // ── Pass through JSON response with CORS headers ─────────────────────────
    const responseHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS)) responseHeaders.set(k, v);

    return new Response(upstream.body, {
      status:  upstream.status,
      headers: responseHeaders,
    });
  },
};
