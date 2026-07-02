import { send } from './_lib/admin.js';

// ponytail: unauthenticated liveness probe — no data, just proves Vercel functions are up
export default function health(req, res) {
  send(res, 200, { ok: true, service: 'admin-kanban-vercel', version: '0.7.0', time: new Date().toISOString() });
}
