import { adminEdgeUrl, callSignedEdge } from './edge.js';
import { resolveGatewayRoute, validateGatewayBody } from './gateway-routes.js';
import { handler, HttpError, readJson, send } from './http.js';
import { fixedAdminRoute } from './routes.js';
import { requireAdminSession } from './session.js';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_CONTENT_TYPE_RE = /^image\/(?:jpeg|png|webp|heic|heif)$/i;

function validEdgeEnvelope(payload, requestId) {
  const meta = payload?.meta;
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    && typeof payload.ok === 'boolean'
    && Object.hasOwn(payload, 'data')
    && Object.hasOwn(payload, 'error')
    && meta && typeof meta === 'object' && !Array.isArray(meta)
    && meta.requestId === requestId
    && typeof meta.generatedAt === 'string'
    && Array.isArray(meta.warnings)
    && meta.warnings.every((warning) => typeof warning === 'string');
}

export default function adminGateway(req, res) {
  const requestUrl = new URL(req.url, 'https://travel-expense-admin-kanban.vercel.app');
  const fixedRoute = fixedAdminRoute(requestUrl.pathname);
  if (fixedRoute) return fixedRoute(req, res);

  return handler(req, res, async (requestId) => {
    const route = resolveGatewayRoute(requestUrl.pathname, req.method, requestUrl.searchParams);
    const session = await requireAdminSession(req, { mutation: route.mutation === true });
    const body = route.mutation
      ? validateGatewayBody(route.bodyKind, await readJson(req, route.bodyLimit))
      : undefined;
    let upstream;
    try {
      upstream = await callSignedEdge({
        actor: session.actor,
        baseUrl: adminEdgeUrl(),
        body,
        method: req.method,
        query: route.query,
        requestId,
        route: route.edgeRoute,
        sessionHash: session.tokenHash,
      });
    } catch (error) {
      const redirected = error instanceof Error && error.message === 'Signed Edge request redirect rejected';
      throw new HttpError(
        'UPSTREAM_UNAVAILABLE',
        redirected ? 'Admin Edge redirect rejected' : 'Admin Edge unavailable',
        redirected ? 502 : 503,
        { retryable: true },
      );
    }

    if (route.responseType === 'stream' && upstream.ok) {
      if (upstream.headers.get('x-admin-request-id') !== requestId) {
        throw new HttpError('UPSTREAM_UNAVAILABLE', 'Receipt photo response provenance is invalid', 502, { retryable: true });
      }
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

    const payload = await upstream.json().catch(() => null);
    if (!validEdgeEnvelope(payload, requestId) || (upstream.ok && payload.ok !== true)) {
      throw new HttpError('UPSTREAM_UNAVAILABLE', 'Admin Edge returned an invalid response', 502, { retryable: true });
    }
    send(res, upstream.status, payload, requestId);
  });
}
