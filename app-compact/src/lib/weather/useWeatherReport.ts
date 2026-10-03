import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState } from '../types';
import { cachedWeatherReport, fetchWeatherReport, weatherReportKey, type WeatherCoord, type WeatherReport } from '../weather';

export function useWeatherReport(coord: WeatherCoord | undefined, date: string, state: AppState) {
  const key = coord && !coord.missing ? weatherReportKey(coord, date) : '';
  const [revision, setRevision] = useState(0);
  const lastRefresh = useRef(0);
  const [result, setResult] = useState<{ key: string; report?: WeatherReport; busy: boolean; error: string }>({ key: '', busy: false, error: '' });
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!key || !coord) return;
    let active = true;
    const force = lastRefresh.current !== revision;
    lastRefresh.current = revision;
    const cached = cachedWeatherReport(coord, date) || undefined;
    setResult({ key, report: cached, busy: true, error: '' });
    void fetchWeatherReport(coord, date, { state, force }).then(
      (report) => { if (active) setResult({ key, report, busy: false, error: '' }); },
      (error: unknown) => { if (active) setResult({ key, busy: false, error: error instanceof Error ? error.message : '天氣暫時未能載入。' }); },
    );
    return () => { active = false; };
    // Identity is based on the request, not unrelated receipt/settings mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision, state.credentialBrokerUrl, state.credentialSession, state.credentialSessionExpiresAt]);
  return {
    report: result.key === key ? result.report : undefined,
    busy: !!key && (result.key !== key || result.busy),
    error: result.key === key ? result.error : '', refresh,
  };
}
