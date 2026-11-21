import { SupabaseAuthAdapter } from '@neon/auth/vanilla/adapters';
import { createClient } from '@supabase/supabase-js';

const status = document.querySelector('#status');
const neonButton = document.querySelector('#neon');
const legacyButton = document.querySelector('#legacy');
const signOutButton = document.querySelector('#signout');
const photoButton = document.querySelector('#photo');
const ledger = document.querySelector('#ledger');
const picture = document.querySelector('#picture');

async function run() {
  const config = await fetch('/ready').then(response => response.ok ? response.json() : null);
  if (!config) throw new Error('The test is still being prepared.');
  const neon = SupabaseAuthAdapter()(config.neonAuthUrl);
  const legacy = createClient(config.supabaseUrl, config.publishableKey, {
    auth: { flowType: 'pkce', storageKey: 'travel-expense:neon-rehearsal:legacy', autoRefreshToken: false },
  });
  const redirectTo = location.origin + '/';

  async function request(path, options = {}) {
    const token = await neon.getJWTToken(false);
    if (!token) throw new Error('The Neon session expired. Sign in again.');
    return fetch(path, {
      ...options,
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    });
  }

  function action(button, work) {
    button.onclick = async () => {
      button.disabled = true;
      try { await work(); }
      catch (error) { status.textContent = error.message || 'The test request failed.'; }
      finally { button.disabled = false; }
    };
  }

  const login = auth => async () => {
    status.textContent = 'Opening Google sign-in…';
    const { error } = await auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) throw new Error('Google sign-in could not start.');
  };
  action(neonButton, login(neon));
  action(legacyButton, login(legacy.auth));
  action(signOutButton, async () => {
    const { error } = await neon.signOut();
    if (error) throw new Error('Unable to sign out.');
    await legacy.auth.signOut({ scope: 'local' });
    location.replace('/');
  });

  const jwt = await neon.getJWTToken(false);
  if (!jwt) {
    neonButton.hidden = false;
    status.textContent = 'Step 1 of 2. Sign in with Neon and Google.';
    return;
  }
  signOutButton.hidden = false;
  let account = await request('/identity/v1/account');
  if (account.status === 409) {
    const { data } = await legacy.auth.getSession();
    if (!data.session) {
      legacyButton.hidden = false;
      status.textContent = 'Step 2 of 2. Confirm the same Google account in Supabase.';
      return;
    }
    const linked = await request('/identity/v1/link', {
      method: 'POST', body: JSON.stringify({ legacyToken: data.session.access_token }),
    });
    if (!linked.ok) throw new Error('The accounts could not be linked. Use your original Google account for both sign-ins.');
    account = await request('/identity/v1/account');
  }
  if (!account.ok) throw new Error('Could not verify this account.');
  const snapshot = await request('/preview/ledger');
  if (!snapshot.ok) throw new Error('Account verified. The trip snapshot could not be loaded.');
  const data = await snapshot.json();
  const names = data.trips.map(trip => Object.assign(document.createElement('li'), { textContent: trip.name }));
  document.querySelector('#trips').replaceChildren(...names);
  document.querySelector('#counts').textContent = `${data.receiptCount} receipts and ${data.photoCount} saved photos`;
  if (data.samplePath) {
    photoButton.hidden = false;
    action(photoButton, async () => {
      const signed = await request('/storage/v1/object/sign/receipt-photos/' + data.samplePath, {
        method: 'POST', body: JSON.stringify({ expiresIn: 120 }),
      });
      if (!signed.ok) throw new Error('The saved photo could not be opened.');
      const { signedURL } = await signed.json();
      const photo = new Image();
      photo.alt = 'Saved receipt photo';
      photo.onerror = () => { status.textContent = 'The saved photo download failed.'; };
      photo.onload = () => { status.textContent = 'Your account, trip snapshot and photo are available in the test.'; };
      photo.src = '/storage/v1' + signedURL;
      picture.replaceChildren(photo);
    });
  }
  ledger.hidden = false;
  status.textContent = 'Your account is linked to the Neon test snapshot.';
}

run().catch(error => { status.textContent = error.message || 'The test is unavailable.'; });
