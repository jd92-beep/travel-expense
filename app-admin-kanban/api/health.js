import { send } from './_lib/http.js';

const ADMIN_VERSION = '1.0.0-rc.1';

// Unauthenticated liveness probe. Keep the response limited to deployment
// provenance and whether read traffic is accepted.
export default function health(req, res) {
  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.ADMIN_GIT_SHA || 'unknown';
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || 'unknown';
  const acceptingReadTraffic = process.env.ADMIN_ACCEPT_READ_TRAFFIC === 'true'
    && /^[0-9a-f]{40}$/i.test(gitSha)
    && deploymentId !== 'unknown';
  send(res, 200, {
    ok: true,
    service: 'travel-expense-admin-console',
    version: ADMIN_VERSION,
    gitSha,
    deploymentId,
    acceptingReadTraffic,
  });
}
