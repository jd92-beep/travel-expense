#!/usr/bin/env node
// Bake the release git SHA into Edge provenance, then deploy admin-kanban.
// Usage: node scripts/deploy-admin-edge.mjs [sha]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const provenancePath = path.join(repoRoot, 'supabase/functions/admin-kanban/source_provenance.ts');
const sha = String(process.argv[2] || execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim());

if (!/^[0-9a-f]{40}$/i.test(sha)) {
  console.error('Expected a full 40-char git SHA');
  process.exit(1);
}

writeFileSync(provenancePath, `// Build-time Edge provenance. Written by scripts/deploy-admin-edge.mjs
// before supabase functions deploy so readiness does not depend on secret
// propagation timing.
export const EDGE_SOURCE_SHA = ${JSON.stringify(sha)} as string;
`, 'utf8');

console.log(`Baked EDGE_SOURCE_SHA=${sha}`);
execFileSync('supabase', [
  'functions', 'deploy', 'admin-kanban',
  '--project-ref', 'fbnnjoahvtdrnigevrtw',
  '--import-map', 'supabase/functions/import_map.json',
], { cwd: repoRoot, stdio: 'inherit' });
console.log('Edge deploy complete');
