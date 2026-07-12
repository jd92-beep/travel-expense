import { adminEdgeUrl, callSignedEdge } from './_lib/edge.js';
import { sha256Hex, timingSafeStringEqual } from './_lib/crypto.js';
import { handler, HttpError, readJson, requireMethod, sendData } from './_lib/http.js';

const ALLOWED_CANDIDATE_DRIFT = new Set([
  'ADMIN_FRONTEND_GIT_SHA_MISMATCH',
]);

export function authorizeReadiness(req, expectedToken = process.env.ADMIN_READINESS_TOKEN) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (String(expectedToken || '').length < 32 || !timingSafeStringEqual(token, expectedToken)) {
    throw new HttpError('UNAUTHORIZED', 'Readiness authorization failed', 401);
  }
  return token;
}

export function validateReadinessData(data, { expectedGitSha, expectedSchemaVersion, mode }) {
  const drift = Array.isArray(data?.drift) ? data.drift.map(String) : [];
  const unexpectedDrift = mode === 'candidate'
    ? drift.filter((code) => !ALLOWED_CANDIDATE_DRIFT.has(code))
    : drift;
  const edgeSourceMatches = data?.edge?.sourceSha === expectedGitSha;
  if (!/^[0-9a-f]{40}$/i.test(expectedGitSha)
    || !/^\d{14}$/.test(expectedSchemaVersion)
    || data?.edge?.deploymentId === 'unknown'
    || data?.database?.schemaVersion !== expectedSchemaVersion
    || data?.broker?.health !== 'healthy'
    || !edgeSourceMatches
    || unexpectedDrift.length > 0) {
    throw new HttpError('UPSTREAM_UNAVAILABLE', 'Release dependencies are not ready', 503, {
      retryable: true,
    });
  }
  return {
    ready: true,
    gitSha: expectedGitSha,
    edgeDeploymentId: data.edge.deploymentId,
    schemaVersion: data.database.schemaVersion,
  };
}

export default function readiness(req, res) {
  return handler(req, res, async (requestId) => {
    requireMethod(req, 'POST');
    const token = authorizeReadiness(req);
    const body = await readJson(req, 256);
    const mode = body.mode === 'candidate' ? 'candidate' : body.mode === 'promoted' ? 'promoted' : null;
    if (!mode) throw new HttpError('VALIDATION_FAILED', 'Readiness mode is invalid', 400);

    const expectedGitSha = String(process.env.ADMIN_GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || '');
    const expectedSchemaVersion = String(process.env.ADMIN_EXPECTED_SCHEMA_VERSION || '');
    const response = await callSignedEdge({
      actor: 'release-readiness',
      baseUrl: adminEdgeUrl(),
      method: 'GET',
      requestId,
      route: '/api/runtime',
      sessionHash: sha256Hex(token),
      timeoutMs: 10_000,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true || !payload?.data) {
      throw new HttpError('UPSTREAM_UNAVAILABLE', 'Signed Edge readiness failed', 503, {
        retryable: true,
      });
    }
    const result = validateReadinessData(payload.data, {
      expectedGitSha,
      expectedSchemaVersion,
      mode,
    });
    sendData(res, 200, result, requestId, {
      scope: 'shared-cloud',
      sources: { edge: 'live', database: 'live', broker: 'live' },
    });
  });
}
