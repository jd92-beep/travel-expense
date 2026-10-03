import React, { StrictMode, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useAppState } from '../../src/lib/useAppState';
import { useSyncEngine } from '../../src/lib/useSyncEngine';
import { DEFAULT_STATE } from '../../src/lib/constants';
const w = window as any;
w.seed = (id: string) => ({ ...structuredClone(DEFAULT_STATE), autoSync: false, trips: [], receipts: [], activeTripId: '', budget: id === 'A' ? 100 : 200, syncQueue: [] });
w.hydrates = []; w.calls = []; w.views = [];
w.defer = (kind: string, account: string, value?: unknown) => new Promise((resolve) => (kind === 'hydrate' ? w.hydrates : w.calls).push({ kind, account, value, resolve }));
function Harness() {
  const [account, switchAccount] = useState('A');
  const app = useAppState(true, `supabase:${account}`, `${account}@example.com`);
  const [sessions] = useState(() => Object.fromEntries(['A', 'B'].map(id => [id, { user: { id, email: `${id}@example.com` }, access_token: `fixture-${id}` }])));
  const engine = useSyncEngine(app.state, app.setState, sessions[account]);
  useLayoutEffect(() => { w.api = { ...app, ...engine, switchAccount, account }; w.views.push({ account, budget: app.state.budget }); });
  return <output>{account}:{app.state.budget}</output>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
