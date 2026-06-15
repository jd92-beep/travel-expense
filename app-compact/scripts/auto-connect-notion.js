/**
 * Auto-connect Notion for Boss using Supabase auth.
 * Run this in the browser console while logged in to the compact app.
 * 
 * Steps:
 * 1. Open https://travel-expense-compact.vercel.app
 * 2. Log in with vc06456@gmail.com
 * 3. Open browser console (F12)
 * 4. Paste this script and press Enter
 */

(async function connectNotion() {
  const BROKER_URL = 'https://travel-expense-credential-broker.ftjdfr.workers.dev';
  const DEFAULT_DB = '3438d94d5f7c81878221fcda6d65d39d';
  const SUPABASE_URL = 'https://fbnnjoahvtdrnigevrtw.supabase.co';

  console.log('=== Auto-Connect Notion ===\n');

  // Step 1: Get Supabase session
  console.log('1. Getting Supabase session...');
  let sessionToken;
  try {
    // Try to get from localStorage (Supabase stores it there)
    const keys = Object.keys(localStorage);
    const supabaseKey = keys.find(k => k.startsWith('sb-') && k.includes('-auth-token'));
    if (supabaseKey) {
      const authData = JSON.parse(localStorage.getItem(supabaseKey));
      sessionToken = authData?.access_token;
    }
    if (!sessionToken) {
      // Try alternative storage
      for (const key of keys) {
        try {
          const val = localStorage.getItem(key);
          if (val && val.includes('access_token')) {
            const parsed = JSON.parse(val);
            if (parsed?.access_token) {
              sessionToken = parsed.access_token;
              break;
            }
          }
        } catch {}
      }
    }
    if (sessionToken) {
      console.log('   ✅ Got Supabase session token');
    } else {
      console.log('   ❌ No Supabase session found. Please log in first.');
      return;
    }
  } catch (err) {
    console.log(`   ❌ Failed to get session: ${err.message}`);
    return;
  }

  // Step 2: Check broker health
  console.log('\n2. Checking broker health...');
  try {
    const res = await fetch(`${BROKER_URL}/health`);
    const health = await res.json();
    console.log(`   ✅ Broker is ${health.service} ${health.version}`);
  } catch (err) {
    console.log(`   ❌ Broker health check failed: ${err.message}`);
    return;
  }

  // Step 3: Check Notion credential status via Supabase auth
  console.log('\n3. Checking Notion credential status...');
  try {
    const res = await fetch(`${BROKER_URL}/credentials/status`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'X-Supabase-Auth': sessionToken,
        'Origin': window.location.origin,
      },
    });
    const status = await res.json();
    const notionProvider = status.providers?.find(p => p.provider === 'notion');
    if (notionProvider) {
      console.log(`   ✅ Notion credential: ${notionProvider.status}`);
    } else {
      console.log('   ⚠️ No Notion credential found in broker vault');
    }
  } catch (err) {
    console.log(`   ❌ Failed to check Notion status: ${err.message}`);
  }

  // Step 4: Test Notion connection
  console.log('\n4. Testing Notion connection...');
  try {
    const res = await fetch(`${BROKER_URL}/credentials/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'X-Supabase-Auth': sessionToken,
        'Content-Type': 'application/json',
        'Origin': window.location.origin,
      },
      body: JSON.stringify({ provider: 'notion' }),
    });
    const test = await res.json();
    console.log(`   ✅ Notion test: ${test.status?.status || 'unknown'}`);
    if (test.status?.message) {
      console.log(`   📝 ${test.status.message}`);
    }
  } catch (err) {
    console.log(`   ❌ Notion test failed: ${err.message}`);
  }

  // Step 5: Set Database ID in app state
  console.log('\n5. Setting Notion Database ID...');
  try {
    // Find the app state in localStorage
    const stateKey = 'boss-japan-tracker';
    const stateStr = localStorage.getItem(stateKey);
    if (stateStr) {
      const state = JSON.parse(stateStr);
      if (!state.notionDb || state.notionDb !== DEFAULT_DB) {
        state.notionDb = DEFAULT_DB;
        localStorage.setItem(stateKey, JSON.stringify(state));
        console.log(`   ✅ Set notionDb = ${DEFAULT_DB}`);
      } else {
        console.log(`   ✅ notionDb already set to ${DEFAULT_DB}`);
      }
      if (!state.autoSync) {
        state.autoSync = true;
        localStorage.setItem(stateKey, JSON.stringify(state));
        console.log('   ✅ Enabled autoSync');
      } else {
        console.log('   ✅ autoSync already enabled');
      }
    } else {
      console.log('   ⚠️ App state not found in localStorage');
    }
  } catch (err) {
    console.log(`   ❌ Failed to set Database ID: ${err.message}`);
  }

  // Step 6: Summary
  console.log('\n=== Summary ===');
  console.log('✅ Broker is healthy');
  console.log('✅ Supabase session found');
  console.log(`📋 Database ID: ${DEFAULT_DB}`);
  console.log('\nNext steps:');
  console.log('1. Refresh the page');
  console.log('2. Go to Settings > Credentials & Connection');
  console.log('3. Verify Notion shows "connected"');
  console.log('4. Create a test receipt and verify it appears in Notion');
  console.log('\nReceipt photos will be automatically uploaded to Notion native storage.');
})();
