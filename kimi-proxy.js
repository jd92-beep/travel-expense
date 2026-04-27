/**
 * kimi-proxy.js — Cloudflare Worker
 * Proxies requests to api.kimi.com/coding/v1 with the required User-Agent header.
 *
 * Deploy: wrangler deploy  OR  paste into Cloudflare Dashboard → Workers → Quick Edit
 * Route: bind to any workers.dev subdomain, e.g. kimi-proxy.<your-account>.workers.dev
 */

const KIMI_BASE = 'https://api.kimi.com/coding/v1';
const REQUIRED_UA = 'claude-code/0.1.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
};

export default {
  async fetch(request) {
    // Handle CORS pre-flight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Build target URL: worker path → KIMI_BASE path
    const incoming = new URL(request.url);
    const target = KIMI_BASE + incoming.pathname + incoming.search;

    // Forward original headers, but force the required User-Agent
    const headers = new Headers(request.headers);
    headers.set('User-Agent', REQUIRED_UA);
    headers.delete('Host'); // Let CF set the correct Host

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    });

    // Pass upstream response back with CORS headers
    const responseHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS)) responseHeaders.set(k, v);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  },
};
