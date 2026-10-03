import { useEffect, useState } from 'react';
import { perHkdForCurrency } from '../../lib/currency';
import type { AppState } from '../../lib/types';

// Fixed/live rate editor for the ACTIVE trip currency (state.tripCurrency — the same key
// perHkdForCurrency reads). Keeps a local draft string while typing so rates < 1 (e.g. "0.128")
// don't get clobbered by the parsed-value write-back; commits a valid value on blur/Enter and
// reverts to the committed rate when the draft is empty or invalid.
export function TripRateInput({
  state,
  updateState,
}: {
  state: AppState;
  updateState: (patch: Partial<AppState>) => void;
}) {
  const code = String(state.tripCurrency || 'JPY').toUpperCase();
  const committed = perHkdForCurrency(state, code);
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [code]);
  const commit = () => {
    if (draft === null) return;
    const val = parseFloat(draft);
    setDraft(null);
    if (!Number.isFinite(val) || val <= 0) return; // invalid → revert to committed
    const safe = Math.min(1_000_000, val);
    // Also stamp rateTable[code] so perHkdForCurrency (used by Dashboard/Stats/ReceiptEditor)
    // picks up the same value — it checks rateTable before falling back to state.rate, so
    // without this a stale live-fetched table entry would silently override a manual edit.
    updateState({
      rate: safe,
      rateTable: { ...state.rateTable, [code]: { currency: code, perHkd: safe, source: 'manual', fetchedAt: Date.now() } },
    });
  };
  return (
    <input
      type="number"
      min="0.01"
      step="0.01"
      value={draft ?? String(committed)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}
