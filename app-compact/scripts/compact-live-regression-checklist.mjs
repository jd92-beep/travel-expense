const strict = process.argv.includes('--strict');

const checks = [];
let hasMissing = false;

function checkEnv(name, label) {
  const present = !!String(process.env[name] || '').trim();
  checks.push({ name, label, present });
  if (!present && strict) hasMissing = true;
}

checkEnv('VITE_SUPABASE_URL', 'Supabase URL');
checkEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'Supabase Anon Key');
checkEnv('VITE_CREDENTIAL_BROKER_URL', 'Credential Broker URL');

const supabaseUrl = String(process.env.VITE_SUPABASE_URL || '').trim();
const urlValid = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl);

console.log('\n=== Compact Live Regression Checklist ===\n');

console.log('Environment readiness:');
for (const c of checks) {
  const status = c.present ? '  OK' : (strict ? '  MISSING' : '  (optional)');
  console.log(`  ${status}  ${c.label} (${c.name})`);
}
if (supabaseUrl) {
  console.log(`  ${urlValid ? '  OK' : '  WARN'}  Supabase URL format: ${urlValid ? 'valid' : 'unexpected format'}`);
}

console.log('\nManual verification flows:\n');

const flows = [
  {
    id: 'A',
    name: 'Shared trip + Notion mirror',
    steps: [
      '1. Owner logs in to compact app.',
      '2. Owner creates shared trip and adds people/split ratios.',
      '3. Owner creates invite; editor accepts.',
      '4. Editor confirms correct people/split ratios appear.',
      '5. Editor adds receipt; owner pulls and sees it.',
      '6. Editor/owner updates receipt.',
      '7. Owner connects Notion backend.',
      '8. Add receipt -> Notion page appears.',
      '9. Update receipt -> Notion page updates.',
      '10. Delete receipt -> Notion page archives.',
      '11. receipt_sync_jobs status reflects real outcome.',
    ],
  },
  {
    id: 'B',
    name: 'Multi-currency trip (KRW)',
    steps: [
      '1. Create KRW trip.',
      '2. Refresh FX; confirm rateTable.KRW exists.',
      '3. Add KRW receipt.',
      '4. Dashboard HKD/KRW toggle correct.',
      '5. Stats Top 10 shows W, not Y.',
      '6. Settlement amounts match HKD conversion.',
      '7. Scan FX modal uses fresh snapshot for KRW/HKD and JPY/HKD.',
    ],
  },
  {
    id: 'C',
    name: 'Active trip persistence',
    steps: [
      '1. Create two trips.',
      '2. Switch from Shell topbar.',
      '3. Confirm settings sync item queues.',
      '4. Push/pull; reload.',
      '5. Active trip remains selected.',
    ],
  },
  {
    id: 'D',
    name: 'People/split scope per trip',
    steps: [
      '1. Trip A people: User 1 + Alice.',
      '2. Trip B people: User 1 + Bob + Charlie.',
      '3. Switch offline between trips.',
      '4. Confirm Scan/Receipt Editor/Stats/Settings show correct people.',
    ],
  },
  {
    id: 'E',
    name: 'Auth redirects',
    steps: [
      '1. Password signup with email confirmation enabled.',
      '2. Magic link login.',
      '3. Google OAuth login.',
      '4. All paths land back in compact app and hydrate session.',
    ],
  },
  {
    id: 'F',
    name: 'Empty itinerary safety',
    steps: [
      '1. Import backup with trip that has itinerary: [].',
      '2. Add receipt; click Add to itinerary.',
      '3. Timeline opens with generated fallback day and new spot.',
    ],
  },
];

for (const flow of flows) {
  console.log(`Flow ${flow.id} - ${flow.name}`);
  for (const step of flow.steps) {
    console.log(`  ${step}`);
  }
  console.log('');
}

if (hasMissing) {
  console.log('FAIL: Required environment variables are missing. Run without --strict for checklist-only mode.');
  process.exit(1);
} else {
  console.log(strict ? 'PASS: All required env vars present.' : 'Checklist printed. Run with --strict to enforce env checks.');
}
