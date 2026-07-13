import crypto from 'node:crypto';

const SAFE_REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class HttpError extends Error {
  constructor(code, message, status = 500, options = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = options.retryable === true;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.fieldErrors = options.fieldErrors;
  }
}

export function requestIdFor(req) {
  const provided = String(req.headers['x-admin-request-id'] || '');
  return SAFE_REQUEST_ID_RE.test(provided) ? provided : crypto.randomUUID();
}

export function send(res, status, payload, requestId = crypto.randomUUID()) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Admin-Request-Id', requestId);
  res.end(JSON.stringify(payload));
}

export function sendData(res, status, data, requestId, meta = {}) {
  send(res, status, {
    ok: true,
    data,
    error: null,
    meta: {
      requestId,
      generatedAt: new Date().toISOString(),
      warnings: [],
      ...meta,
    },
  }, requestId);
}

export function requireMethod(req, method) {
  if (req.method !== method) throw new HttpError('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
}

export async function readJson(req, maxBytes = 16 * 1024) {
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new HttpError('VALIDATION_FAILED', 'Content-Type must be application/json', 400);
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.length;
    if (totalBytes > maxBytes) throw new HttpError('VALIDATION_FAILED', 'JSON body too large', 413);
    chunks.push(bytes);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('object required');
    }
    return parsed;
  } catch {
    throw new HttpError('VALIDATION_FAILED', 'Invalid JSON body', 400);
  }
}

export function adminOrigin() {
  if (process.env.VERCEL_ENV === 'production') {
    return 'https://travel-expense-admin-kanban.vercel.app';
  }
  return process.env.ADMIN_ALLOWED_ORIGIN || 'https://travel-expense-admin-kanban.vercel.app';
}

export function requireSameOriginMutation(req) {
  const origin = String(req.headers.origin || '');
  const fetchSite = String(req.headers['sec-fetch-site'] || '');
  if (origin !== adminOrigin() || fetchSite !== 'same-origin') {
    throw new HttpError('CSRF_REJECTED', 'Cross-site request rejected', 403);
  }
}

function redact(value) {
  return String(value || '')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/(?:sk-|ntn_|secret_)[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/__Host-admin_(session|csrf)=[^;\s]+/g, '__Host-admin_$1=[redacted]');
}

export async function handler(req, res, fn) {
  const requestId = requestIdFor(req);
  try {
    await fn(requestId);
  } catch (error) {
    const known = error instanceof HttpError;
    const status = known ? error.status : 500;
    if (known && error.retryAfterSeconds) res.setHeader('Retry-After', String(error.retryAfterSeconds));
    send(res, status, {
      ok: false,
      data: null,
      error: {
        code: known ? error.code : 'INTERNAL_ERROR',
        message: known ? error.message : 'Admin request failed',
        retryable: known ? error.retryable : false,
        ...(known && error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
        ...(known && error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
      },
      meta: {
        requestId,
        generatedAt: new Date().toISOString(),
        warnings: [],
      },
    }, requestId);
    if (!known) console.error(JSON.stringify({ event: 'admin_bff_error', requestId, message: redact(error?.message || error) }));
  }
}
