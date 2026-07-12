import { adminEdgeUrl, callSignedEdge } from '../_lib/edge.js';
import { resolveGatewayRoute, validateGatewayBody } from '../_lib/gateway-routes.js';
import { handler, HttpError, readJson, send } from '../_lib/http.js';
import { requireAdminSession } from '../_lib/session.js';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_CONTENT_TYPE_RE = /^image\/(?:jpeg|png|webp|heic|heif)$/i;

export default function adminGateway(req, res) {
  return handler(req, res, async (requestId) => {
    const requestUrl = new URL(req.url, 'https://travel-expense-admin-kanban.vercel.app');
    const route = resolveGatewayRoute(requestUrl.pathname, req.method, requestUrl.searchParams);
    const session = await requireAdminSession(req, { mutation: route.mutation === true });
    const body = route.mutation
      ? validateGatewayBody(route.bodyKind, await readJson(req, route.bodyLimit))
      : undefined;
    const upstream = await callSignedEdge({
      actor: session.actor,
      baseUrl: adminEdgeUrl(),
      body,
      method: req.method,
      query: route.query,
      requestId,
      route: route.edgeRoute,
      sessionHash: session.tokenHash,
    });

    if (route.responseType === 'stream' && upstream.ok) {
      const contentType = String(upstream.headers.get('content-type') || '').split(';')[0].trim();
      const declaredLength = Number(upstream.headers.get('content-length') || '0');
      if (!PHOTO_CONTENT_TYPE_RE.test(contentType)
        || (declaredLength && declaredLength > MAX_PHOTO_BYTES)) {
        throw new HttpError('UPSTREAM_UNAVAILABLE', 'Receipt photo response is invalid', 502, { retryable: true });
      }
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) {
        throw new HttpError('UPSTREAM_UNAVAILABLE', 'Receipt photo response is invalid', 502, { retryable: true });
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(bytes.length));
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Admin-Request-Id', requestId);
      res.end(bytes);
      return;
    }

    const payload = await upstream.json().catch(() => ({
      ok: false,
      data: null,
      error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Admin Edge returned an invalid response', retryable: true },
      meta: { requestId, generatedAt: new Date().toISOString(), warnings: [] },
    }));
    send(res, upstream.status, payload, requestId);
  });
}
