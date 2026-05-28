import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const legacy = readFileSync(join(repoRoot, 'index.html'), 'utf8');
const reactManifest = readFileSync(join(repoRoot, 'app-react/src/lib/tabs.ts'), 'utf8');

const legacyTabs = new Set([...legacy.matchAll(/data-tab=["']([a-z-]+)["']/g)].map((match) => match[1]));
const reactTabs = new Set([...reactManifest.matchAll(/id:\s*'([a-z-]+)'/g)].map((match) => match[1]));
const required = ['dashboard', 'scan', 'timeline', 'history', 'weather', 'stats', 'settings'];

const missingLegacy = [...legacyTabs].filter((tab) => !reactTabs.has(tab));
const missingRequired = required.filter((tab) => !reactTabs.has(tab));

if (missingLegacy.length || missingRequired.length) {
  console.error('Tab parity failed');
  if (missingLegacy.length) console.error(`Missing legacy tabs: ${missingLegacy.join(', ')}`);
  if (missingRequired.length) console.error(`Missing required tabs: ${missingRequired.join(', ')}`);
  process.exit(1);
}

console.log(`Tab parity passed: ${[...reactTabs].join(', ')}`);
