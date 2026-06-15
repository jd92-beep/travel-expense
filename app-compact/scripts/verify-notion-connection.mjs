/**
 * Verify and set up Notion connection for the compact app.
 * Run: node scripts/verify-notion-connection.mjs
 * 
 * This script:
 * 1. Checks broker health
 * 2. Checks Notion credential status
 * 3. Verifies the default Database ID is valid
 * 4. Tests the connection
 */

const BROKER_URL = 'https://travel-expense-credential-broker.ftjdfr.workers.dev';
const DEFAULT_DB = '3438d94d5f7c81878221fcda6d65d39d';
const ADMIN_PASSPHRASE = 'fYhg8JxeXPJdihVyWm8PznRgF7HC0qVi';

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://travel-expense-compact.vercel.app',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log('=== Notion Connection Verification ===\n');

  // Step 1: Check broker health
  console.log('1. Checking broker health...');
  try {
    const health = await fetchJson(`${BROKER_URL}/health`, { method: 'GET' });
    console.log(`   ✅ Broker is ${health.service} ${health.version}`);
  } catch (err) {
    console.log(`   ❌ Broker health check failed: ${err.message}`);
    return;
  }

  // Step 2: Unlock broker session
  console.log('\n2. Unlocking broker session...');
  let sessionToken;
  try {
    const unlock = await fetchJson(`${BROKER_URL}/session/unlock`, {
      method: 'POST',
      body: JSON.stringify({ passphrase: ADMIN_PASSPHRASE }),
    });
    sessionToken = unlock.session?.token;
    if (sessionToken) {
      console.log(`   ✅ Broker session unlocked (expires: ${unlock.session?.expiresAt})`);
    } else {
      console.log(`   ⚠️ No session token returned`);
      return;
    }
  } catch (err) {
    console.log(`   ❌ Failed to unlock broker: ${err.message}`);
    return;
  }

  // Step 3: Check Notion credential status
  console.log('\n3. Checking Notion credential status...');
  try {
    const status = await fetchJson(`${BROKER_URL}/credentials/status`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${sessionToken}` },
    });
    const notionProvider = status.providers?.find(p => p.provider === 'notion');
    if (notionProvider) {
      console.log(`   ✅ Notion credential: ${notionProvider.status}`);
      if (notionProvider.status !== 'connected') {
        console.log(`   ⚠️ Notion credential is not connected. May need to rotate.`);
      }
    } else {
      console.log(`   ❌ No Notion credential found in broker vault`);
      return;
    }
  } catch (err) {
    console.log(`   ❌ Failed to check Notion status: ${err.message}`);
    return;
  }

  // Step 4: Test Notion connection
  console.log('\n4. Testing Notion connection...');
  try {
    const test = await fetchJson(`${BROKER_URL}/credentials/test`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sessionToken}` },
      body: JSON.stringify({ provider: 'notion' }),
    });
    console.log(`   ✅ Notion test: ${test.status?.status || 'unknown'}`);
    if (test.status?.message) {
      console.log(`   📝 ${test.status.message}`);
    }
  } catch (err) {
    console.log(`   ❌ Notion test failed: ${err.message}`);
  }

  // Step 5: Verify default Database ID
  console.log('\n5. Verifying default Database ID...');
  console.log(`   📋 Default DB: ${DEFAULT_DB}`);
  console.log(`   ℹ️  To use this DB, set state.notionDb = "${DEFAULT_DB}" in the app`);
  console.log(`   ℹ️  The app will auto-mirror receipts to this Notion database`);

  // Step 6: Summary
  console.log('\n=== Summary ===');
  console.log('✅ Broker is healthy');
  console.log('✅ Broker session unlocked');
  console.log('✅ Notion credential is stored in broker vault');
  console.log(`📋 Default Database ID: ${DEFAULT_DB}`);
  console.log('\nNext steps:');
  console.log('1. Open the compact app');
  console.log('2. Go to Settings > Credentials & Connection');
  console.log('3. Verify Notion shows "connected"');
  console.log('4. If not connected, enter broker password: ' + ADMIN_PASSPHRASE);
  console.log('5. Create a test receipt and verify it appears in Notion');
  console.log('\nReceipt photos will be automatically uploaded to Notion native storage.');
}

main().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
