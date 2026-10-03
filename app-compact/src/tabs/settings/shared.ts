import type { Dispatch, SetStateAction } from 'react';
import type { AppState, Person, TripProfile } from '../../lib/types';

export const COLORS = ['#CC2929', '#FF91A4', '#2D5A8E', '#059669', '#D97706', '#7C3AED', '#0891B2', '#DB2777'];

/** Everything a Settings section needs from the shell: app state plus the shared busy/status channel. */
export type SettingsContext = {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  updateState: (patch: Partial<AppState>) => void;
  busy: string;
  setBusy: (label: string) => void;
  setStatus: (status: string) => void;
  run: (label: string, fn: () => Promise<string>) => Promise<void>;
  copyText: (text: string, ok: string) => Promise<void>;
  persons: Person[];
  currentTrip: TripProfile;
  trips: TripProfile[];
  cloudSyncAvailable: boolean;
  userEmail: string | null;
  showStressPanel: boolean;
  onPull?: () => Promise<void>;
  onPush?: () => Promise<void>;
};

export function currenciesForTrip(state: AppState, trip: Partial<TripProfile> | undefined): string[] {
  const tripCurrencies = Array.isArray(trip?.currencies) && trip.currencies.length ? trip.currencies : [];
  return Array.from(new Set(['HKD', state.tripCurrency || 'JPY', ...tripCurrencies]));
}

export function nonHomeCurrency(state: AppState, trip: Partial<TripProfile> | undefined, fallback = 'JPY'): string {
  return currenciesForTrip(state, trip).find((code) => code !== (trip?.homeCurrency || 'HKD')) || fallback;
}
