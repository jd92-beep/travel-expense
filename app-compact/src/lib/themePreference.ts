import type { ThemePreference, TripThemeKey } from './types';
import { TRIP_THEME_KEYS } from '../domain/trip/context';

export function isTripThemeKey(value: unknown): value is TripThemeKey {
  return typeof value === 'string' && (TRIP_THEME_KEYS as readonly string[]).includes(value);
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === 'auto' || isTripThemeKey(value) ? value : 'auto';
}

// Remote omission must not overwrite a valid local choice during LWW settings merge.
export function parseRemoteThemePreference(value: unknown): ThemePreference | undefined {
  return value === 'auto' || isTripThemeKey(value) ? value : undefined;
}
