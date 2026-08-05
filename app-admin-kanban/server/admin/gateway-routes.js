import { HttpError } from './http.js';
import { PROVIDER_MODELS as PROVIDER_MODEL_LISTS } from './provider-catalog.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROVIDER_RE = /^(?:notion|kimi|google|volcano|weatherapi|mimo)$/;
const PROVIDER_MODELS = new Map(
  Object.entries(PROVIDER_MODEL_LISTS).map(([provider, models]) =>
    [provider, new Set(models)]),
);
const R1_ACTIONS = new Set([
  'provider_probe',
  'support_bundle',
  'retry_sync_job',
  'cancel_sync_job',
  'run_integrity_scan',
]);
const R2_ACTIONS = new Set([
  'receipt_amend',
  'receipt_trash',
  'receipt_restore',
  'trip_amend',
  'itinerary_amend',
  'itinerary_restore',
  'member_add',
  'member_role',
  'member_remove',
]);

function queryObject(searchParams, allowed) {
  const result = {};
  const seen = new Set();
  for (const [key, value] of searchParams.entries()) {
    if (seen.has(key) || !allowed.has(key)) {
      throw new HttpError('VALIDATION_FAILED', 'Query parameter is not allowed', 400);
    }
    seen.add(key);
    if (value.length > 256) throw new HttpError('VALIDATION_FAILED', 'Query parameter is too long', 400);
    result[key] = value;
  }
  return result;
}

function validateEnum(query, key, allowed) {
  if (query[key] !== undefined && !allowed.includes(query[key])) {
    throw new HttpError('VALIDATION_FAILED', 'Query parameter is invalid', 400);
  }
}

function validateUuid(query, key, required = false) {
  const value = query[key];
  if ((required && !value) || (value && !UUID_RE.test(value))) {
    throw new HttpError('VALIDATION_FAILED', 'Query parameter is invalid', 400);
  }
}

function validateListQuery(route, query, sort) {
  if (query.limit !== undefined && !['50', '100', '200'].includes(query.limit)) {
    throw new HttpError('VALIDATION_FAILED', 'List limit is invalid', 400);
  }
  if (query.cursor !== undefined && !/^[A-Za-z0-9_-]{1,256}$/.test(query.cursor)) {
    throw new HttpError('VALIDATION_FAILED', 'List cursor is invalid', 400);
  }
  if (query.direction !== undefined && query.direction !== 'desc') {
    throw new HttpError('VALIDATION_FAILED', 'List direction is invalid', 400);
  }
  if (query.sort !== undefined && query.sort !== sort) {
    throw new HttpError('VALIDATION_FAILED', 'List sort is invalid', 400);
  }
  if (query.q !== undefined && (query.q.length > 100 || query.q.includes('@'))) {
    throw new HttpError('VALIDATION_FAILED', 'Search query is invalid', 400);
  }

  if (route === 'accounts') {
    validateEnum(query, 'platform', ['all', 'compact', 'android']);
    validateEnum(query, 'status', ['all', 'active', 'banned', 'deleted', 'risk']);
  } else if (route === 'trips') {
    validateEnum(query, 'integrity', ['all', 'healthy', 'issue', 'invalid_dates']);
    validateEnum(query, 'status', ['all', 'open', 'past', 'archived']);
  } else if (route === 'receipts') {
    validateUuid(query, 'ownerId');
    validateUuid(query, 'tripId');
    validateEnum(query, 'recordKind', ['all', 'expense', 'settlement']);
    validateEnum(query, 'trash', ['active', 'trash', 'all']);
    validateEnum(query, 'visibility', ['all', 'trip', 'private']);
  } else if (route === 'incidents') {
    validateEnum(query, 'severity', ['all', 'P0', 'P1', 'P2', 'P3']);
    validateEnum(query, 'status', ['all', 'open', 'acknowledged', 'resolved']);
  } else if (route === 'sync-jobs') {
    validateUuid(query, 'userId');
  } else if (route === 'integrity') {
    validateEnum(query, 'severity', ['all', 'high', 'medium', 'low']);
  } else if (route === 'audit') {
    validateUuid(query, 'targetId');
    validateEnum(query, 'result', ['succeeded', 'failed']);
    validateEnum(query, 'risk', ['R0', 'R1', 'R2', 'R3']);
    for (const key of ['startAt', 'endAt']) {
      if (query[key] !== undefined && !Number.isFinite(Date.parse(query[key]))) {
        throw new HttpError('VALIDATION_FAILED', 'Audit date is invalid', 400);
      }
    }
    if (query.startAt && query.endAt && Date.parse(query.startAt) > Date.parse(query.endAt)) {
      throw new HttpError('VALIDATION_FAILED', 'Audit date range is invalid', 400);
    }
  }
}

export function resolveGatewayRoute(pathname, method, searchParams) {
  const prefix = '/api/admin/';
  if (!pathname.startsWith(prefix) || pathname.includes('//')) {
    throw new HttpError('NOT_FOUND', 'Admin route not found', 404);
  }
  const route = pathname.slice(prefix.length);

  if (method === 'POST') {
    if (route === 'operations/preview') {
      return {
        edgeRoute: '/api/operations/preview',
        query: queryObject(searchParams, new Set()),
        mutation: true,
        bodyLimit: 64 * 1024,
        bodyKind: 'operation-preview',
      };
    }
    const commitMatch = route.match(/^operations\/([^/]+)\/commit$/);
    if (commitMatch && UUID_RE.test(commitMatch[1])) {
      return {
        edgeRoute: `/api/operations/${commitMatch[1]}/commit`,
        query: queryObject(searchParams, new Set()),
        mutation: true,
        bodyLimit: 1024,
        bodyKind: 'operation-commit',
      };
    }
    throw new HttpError('WRITES_DISABLED', 'Admin action is not allowlisted', 503);
  }
  if (method !== 'GET') throw new HttpError('METHOD_NOT_ALLOWED', 'Method not allowed', 405);

  const fixed = new Map([
    ['overview', ['/api/overview', new Set()]],
    ['search', ['/api/search', new Set(['q'])]],
    ['accounts', ['/api/accounts', new Set(['cursor', 'direction', 'limit', 'platform', 'q', 'sort', 'status'])]],
    ['trips', ['/api/trips', new Set(['cursor', 'direction', 'integrity', 'limit', 'q', 'sort', 'status'])]],
    ['receipts', ['/api/receipts', new Set(['cursor', 'direction', 'limit', 'ownerId', 'q', 'recordKind', 'sort', 'trash', 'tripId', 'visibility'])]],
    ['incidents', ['/api/incidents', new Set(['cursor', 'direction', 'limit', 'severity', 'sort', 'status'])]],
    ['sync-jobs', ['/api/sync-jobs', new Set(['cursor', 'direction', 'limit', 'provider', 'sort', 'status', 'userId'])]],
    ['integrity', ['/api/integrity', new Set(['cursor', 'direction', 'findingType', 'limit', 'severity', 'sort'])]],
    ['reconciliation', ['/api/reconciliation', new Set(['tripId'])]],
    ['providers', ['/api/providers', new Set()]],
    ['audit', ['/api/audit', new Set(['action', 'cursor', 'direction', 'endAt', 'limit', 'requestId', 'result', 'risk', 'sort', 'startAt', 'targetId', 'targetType'])]],
    ['runtime', ['/api/runtime', new Set()]],
    ['operations', ['/api/operations', new Set(['limit', 'status'])]],
  ]);
  if (fixed.has(route)) {
    const [edgeRoute, allowed] = fixed.get(route);
    const query = queryObject(searchParams, allowed);
    if (route === 'search') {
      if (!query.q || query.q.length < 2 || query.q.length > 100 || query.q.includes('@')) {
        throw new HttpError('VALIDATION_FAILED', 'Search query is invalid', 400);
      }
    } else if (route === 'reconciliation') {
      validateUuid(query, 'tripId', true);
    } else if (['accounts', 'trips', 'receipts', 'incidents', 'sync-jobs', 'integrity', 'audit'].includes(route)) {
      validateListQuery(
        route,
        query,
        ['accounts', 'trips', 'receipts', 'sync-jobs'].includes(route) ? 'updated_at' : 'created_at',
      );
    } else if (route === 'operations') {
      validateEnum(query, 'status', ['active', 'terminal', 'all']);
      if (query.limit !== undefined && !['10', '20', '50'].includes(query.limit)) {
        throw new HttpError('VALIDATION_FAILED', 'Operation limit is invalid', 400);
      }
    }
    return { edgeRoute, query };
  }

  const installationsMatch = route.match(/^accounts\/([^/]+)\/installations$/);
  if (installationsMatch && UUID_RE.test(installationsMatch[1])) {
    return {
      edgeRoute: `/api/accounts/${installationsMatch[1]}/installations`,
      query: queryObject(searchParams, new Set()),
    };
  }
  const accountMatch = route.match(/^accounts\/([^/]+)$/);
  if (accountMatch && UUID_RE.test(accountMatch[1])) {
    return {
      edgeRoute: `/api/accounts/${accountMatch[1]}`,
      query: queryObject(searchParams, new Set()),
    };
  }
  const itineraryMatch = route.match(/^trips\/([^/]+)\/itinerary$/);
  if (itineraryMatch && UUID_RE.test(itineraryMatch[1])) {
    return {
      edgeRoute: `/api/trips/${itineraryMatch[1]}/itinerary`,
      query: queryObject(searchParams, new Set()),
    };
  }
  const itineraryVersionsMatch = route.match(/^trips\/([^/]+)\/itinerary\/versions$/);
  if (itineraryVersionsMatch && UUID_RE.test(itineraryVersionsMatch[1])) {
    const query = queryObject(searchParams, new Set(['beforeVersion', 'limit']));
    if (query.limit !== undefined && !['50', '100', '200'].includes(query.limit)) {
      throw new HttpError('VALIDATION_FAILED', 'List limit is invalid', 400);
    }
    if (query.beforeVersion !== undefined && (
      !/^[1-9]\d{0,15}$/.test(query.beforeVersion)
      || !Number.isSafeInteger(Number(query.beforeVersion))
    )) {
      throw new HttpError('VALIDATION_FAILED', 'Itinerary version is invalid', 400);
    }
    return {
      edgeRoute: `/api/trips/${itineraryVersionsMatch[1]}/itinerary/versions`,
      query,
    };
  }
  const tripMatch = route.match(/^trips\/([^/]+)$/);
  if (tripMatch && UUID_RE.test(tripMatch[1])) {
    return {
      edgeRoute: `/api/trips/${tripMatch[1]}`,
      query: queryObject(searchParams, new Set()),
    };
  }
  const receiptMatch = route.match(/^receipts\/([^/]+)$/);
  if (receiptMatch && UUID_RE.test(receiptMatch[1])) {
    return {
      edgeRoute: `/api/receipts/${receiptMatch[1]}`,
      query: queryObject(searchParams, new Set()),
    };
  }
  const auditMatch = route.match(/^audit\/([^/]+)$/);
  if (auditMatch && UUID_RE.test(auditMatch[1])) {
    return {
      edgeRoute: `/api/audit/${auditMatch[1]}`,
      query: queryObject(searchParams, new Set()),
    };
  }

  const photoMatch = route.match(/^receipts\/([^/]+)\/photo$/);
  if (photoMatch && UUID_RE.test(photoMatch[1])) {
    return {
      edgeRoute: `/api/receipts/${photoMatch[1]}/photo`,
      query: queryObject(searchParams, new Set()),
      responseType: 'stream',
    };
  }
  const operationMatch = route.match(/^operations\/([^/]+)$/);
  if (operationMatch && UUID_RE.test(operationMatch[1])) {
    return { edgeRoute: `/api/operations/${operationMatch[1]}`, query: queryObject(searchParams, new Set()) };
  }
  throw new HttpError('NOT_FOUND', 'Admin route not found', 404);
}

function rejectUnknownKeys(body, allowed) {
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      throw new HttpError('VALIDATION_FAILED', 'Request field is not allowed', 400);
    }
  }
}

function objectPayload(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError('VALIDATION_FAILED', 'Operation payload must be an object', 400);
  }
  return value;
}

function isPositiveVersion(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0;
}

export function validateGatewayBody(kind, body) {
  if (kind === 'operation-commit') {
    rejectUnknownKeys(body, new Set(['grantId']));
    if (body.grantId !== undefined && !UUID_RE.test(String(body.grantId))) {
      throw new HttpError('VALIDATION_FAILED', 'Step-up grant is invalid', 400);
    }
    return body.grantId ? { grantId: String(body.grantId) } : {};
  }
  if (kind !== 'operation-preview') {
    throw new HttpError('VALIDATION_FAILED', 'Request body is not supported', 400);
  }

  rejectUnknownKeys(body, new Set(['action', 'idempotencyKey', 'targetId', 'payload']));
  const action = String(body.action || '');
  const idempotencyKey = String(body.idempotencyKey || '');
  const targetId = String(body.targetId || '');
  const payload = objectPayload(body.payload);
  if ((!R1_ACTIONS.has(action) && !R2_ACTIONS.has(action)) || !UUID_RE.test(idempotencyKey)) {
    throw new HttpError('VALIDATION_FAILED', 'Operation context is invalid', 400);
  }

  if (action === 'provider_probe') {
    rejectUnknownKeys(payload, new Set(['model']));
    if (!PROVIDER_RE.test(targetId)) {
      throw new HttpError('VALIDATION_FAILED', 'Provider is not allowlisted', 400);
    }
    if (payload.model !== undefined && !PROVIDER_MODELS.get(targetId)?.has(String(payload.model))) {
      throw new HttpError('VALIDATION_FAILED', 'Provider model is not allowlisted', 400);
    }
  } else if (action === 'support_bundle') {
    rejectUnknownKeys(payload, new Set(['includeJobs', 'tripId', 'userId']));
    if (payload.userId !== undefined && !UUID_RE.test(String(payload.userId))) {
      throw new HttpError('VALIDATION_FAILED', 'Support account is invalid', 400);
    }
    if (payload.tripId !== undefined && !UUID_RE.test(String(payload.tripId))) {
      throw new HttpError('VALIDATION_FAILED', 'Support trip is invalid', 400);
    }
    if (payload.includeJobs !== undefined && typeof payload.includeJobs !== 'boolean') {
      throw new HttpError('VALIDATION_FAILED', 'Support job option is invalid', 400);
    }
    if (targetId !== 'system' && !UUID_RE.test(targetId)) {
      throw new HttpError('VALIDATION_FAILED', 'Support target is invalid', 400);
    }
  } else if (action === 'run_integrity_scan') {
    rejectUnknownKeys(payload, new Set());
    if (targetId !== 'system') {
      throw new HttpError('VALIDATION_FAILED', 'Integrity scan target is invalid', 400);
    }
  } else if (action === 'receipt_amend') {
    rejectUnknownKeys(payload, new Set(['expectedVersion', 'patch']));
    const patch = objectPayload(payload.patch);
    rejectUnknownKeys(patch, new Set([
      'amount', 'category', 'currency', 'paymentMethod', 'recordDate',
      'recordKind', 'recordTime', 'store', 'visibility',
    ]));
    if (!UUID_RE.test(targetId) || !isPositiveVersion(payload.expectedVersion)) {
      throw new HttpError('VALIDATION_FAILED', 'Receipt amendment context is invalid', 400);
    }
  } else if (action === 'receipt_trash' || action === 'receipt_restore') {
    rejectUnknownKeys(payload, new Set(['expectedVersion']));
    if (!UUID_RE.test(targetId) || !isPositiveVersion(payload.expectedVersion)) {
      throw new HttpError('VALIDATION_FAILED', 'Receipt operation context is invalid', 400);
    }
  } else if (action === 'trip_amend') {
    rejectUnknownKeys(payload, new Set(['expectedVersion', 'patch']));
    const patch = objectPayload(payload.patch);
    rejectUnknownKeys(patch, new Set([
      'archived', 'budgetAmount', 'budgetCurrency', 'destinationSummary',
      'homeCurrency', 'name', 'tripCurrency',
    ]));
    if (!UUID_RE.test(targetId) || !isPositiveVersion(payload.expectedVersion)) {
      throw new HttpError('VALIDATION_FAILED', 'Trip amendment context is invalid', 400);
    }
  } else if (action === 'itinerary_amend') {
    rejectUnknownKeys(payload, new Set([
      'endDate', 'expectedVersion', 'itinerary', 'removedDates', 'startDate',
    ]));
    if (!UUID_RE.test(targetId) || !isPositiveVersion(payload.expectedVersion)
      || !Array.isArray(payload.itinerary) || !Array.isArray(payload.removedDates)
      || payload.removedDates.length > 366
      || new Set(payload.removedDates).size !== payload.removedDates.length
      || payload.removedDates.some(date => typeof date !== 'string' || !DATE_RE.test(date))) {
      throw new HttpError('VALIDATION_FAILED', 'Itinerary context is invalid', 400);
    }
  } else if (action === 'itinerary_restore') {
    rejectUnknownKeys(payload, new Set(['expectedVersion', 'restoreVersion']));
    if (!UUID_RE.test(targetId) || !isPositiveVersion(payload.expectedVersion)
      || !isPositiveVersion(payload.restoreVersion)) {
      throw new HttpError('VALIDATION_FAILED', 'Itinerary restore context is invalid', 400);
    }
  } else if (action === 'member_add') {
    rejectUnknownKeys(payload, new Set(['email', 'role']));
    if (!UUID_RE.test(targetId) || typeof payload.email !== 'string' || typeof payload.role !== 'string') {
      throw new HttpError('VALIDATION_FAILED', 'Member add context is invalid', 400);
    }
  } else if (action === 'member_role') {
    rejectUnknownKeys(payload, new Set(['role', 'userId']));
    if (!UUID_RE.test(targetId) || !UUID_RE.test(String(payload.userId || ''))
      || typeof payload.role !== 'string') {
      throw new HttpError('VALIDATION_FAILED', 'Member role context is invalid', 400);
    }
  } else if (action === 'member_remove') {
    rejectUnknownKeys(payload, new Set(['userId']));
    if (!UUID_RE.test(targetId) || !UUID_RE.test(String(payload.userId || ''))) {
      throw new HttpError('VALIDATION_FAILED', 'Member remove context is invalid', 400);
    }
  } else {
    rejectUnknownKeys(payload, new Set());
    if (!UUID_RE.test(targetId)) {
      throw new HttpError('VALIDATION_FAILED', 'Sync job target is invalid', 400);
    }
  }

  return { action, idempotencyKey, targetId, payload };
}
