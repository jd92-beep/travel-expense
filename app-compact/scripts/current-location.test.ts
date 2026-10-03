import assert from 'node:assert/strict';

const originals = new Map(['navigator', 'isSecureContext', 'fetch', 'localStorage', 'sessionStorage', 'setTimeout', 'clearTimeout'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const setGlobal = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
let geoCalls = 0;
let fetchCalls = 0;
let options: PositionOptions | undefined;
let geolocate: Geolocation['getCurrentPosition'];
let payload: unknown;
let timezonePayload: unknown = { timezone: 'Asia/Tokyo' };
let fetchError: Error | undefined;
let lastUrl = '';
let lastInit: RequestInit | undefined;
const position = { coords: { latitude: 35.6762345, longitude: 139.6503456, accuracy: 12 } } as GeolocationPosition;

try {
  setGlobal('isSecureContext', true);
  setGlobal('navigator', { geolocation: { getCurrentPosition: (...args: Parameters<Geolocation['getCurrentPosition']>) => {
    geoCalls += 1;
    options = args[2];
    geolocate(...args);
  } } });
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error('Device position must never access storage'); } });
  }
  setGlobal('fetch', async (url: string, init: RequestInit) => {
    fetchCalls += 1;
    lastUrl = url;
    lastInit = init;
    if (fetchError) throw fetchError;
    return { ok: true, json: async () => url.startsWith('https://api.open-meteo.com/') ? timezonePayload : payload };
  });
  const { requestCurrentWeatherLocation } = await import('../src/lib/weather/currentLocation');
  assert.equal(geoCalls, 0, 'Import must not request location');
  assert.equal(fetchCalls, 0, 'Import must not perform an IP lookup');

  geolocate = (success) => success(position);
  payload = { lookupSource: 'coordinates', city: 'Tokyo', countryCode: 'jp', localityInfo: { informative: [{ description: 'time zone', name: 'Asia/Tokyo' }] } };
  const found = await requestCurrentWeatherLocation();
  assert.deepEqual(options, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
  assert.deepEqual(found.coord, { label: '當前位置 · Tokyo', lat: position.coords.latitude, lon: position.coords.longitude, origin: 'device-location', accuracyMeters: 12, countryCode: 'JP', timezone: 'Asia/Tokyo' });
  assert.deepEqual(found.notices, []);
  assert.equal(found.accuracyMeters, 12);
  const url = new URL(lastUrl);
  assert.equal(url.origin, 'https://api.bigdatacloud.net');
  assert.equal(url.searchParams.get('latitude'), String(position.coords.latitude));
  assert.equal(url.searchParams.get('longitude'), String(position.coords.longitude));
  assert.equal(lastInit?.cache, 'no-store', 'GPS-bearing requests must bypass browser cache');
  assert.equal(lastInit?.credentials, 'omit');

  // Current country comes from reverse geocoding, never broad coordinate boxes.
  payload = { lookupSource: 'reverseGeocoding', countryCode: 'KR', locality: 'Jeju', localityInfo: { informative: [{ description: 'time zone', name: 'Asia/Seoul' }] } };
  const korean = await requestCurrentWeatherLocation();
  assert.equal(korean.coord.countryCode, 'KR');
  assert.equal(korean.coord.timezone, 'Asia/Seoul');
  assert.equal(fetchCalls, 2, 'Current-position lookup must not reuse a previous result');

  for (const badPayload of [null, {}, { lookupSource: 'ipGeolocation', countryCode: 'JP' }, { lookupSource: 'coordinates', countryCode: '<script>' }]) {
    payload = badPayload;
    const unknown = await requestCurrentWeatherLocation();
    assert.equal(unknown.coord.countryCode, undefined);
    assert.equal(unknown.coord.timezone, 'Asia/Tokyo', 'Unknown country still needs a verified local date');
    assert.match(unknown.coord.label, /未能確認/);
    assert.match(unknown.notices.join(' '), /Open-Meteo/);
    assert.equal(unknown.coord.lat, position.coords.latitude);
    assert.equal(new URL(lastUrl).searchParams.get('timezone'), 'auto');
    assert.equal(new URL(lastUrl).searchParams.has('hourly'), false, 'Timezone lookup must request metadata only');
  }

  payload = { lookupSource: 'coordinates', countryCode: 'US', city: 'New York', localityInfo: { informative: [{ description: 'time zone', name: 'invalid' }] } };
  timezonePayload = { timezone: 'America/New_York' };
  const recoveredZone = await requestCurrentWeatherLocation();
  assert.equal(recoveredZone.coord.countryCode, 'US');
  assert.equal(recoveredZone.coord.timezone, 'America/New_York', 'Invalid reverse-geocode zone must use verified metadata');
  assert.deepEqual(recoveredZone.notices, []);
  timezonePayload = { timezone: 'invalid' };
  const unknownZone = await requestCurrentWeatherLocation();
  assert.equal(unknownZone.coord.timezone, undefined, 'Invalid metadata timezone must not silently become UTC');
  assert.match(unknownZone.notices.join(' '), /重新定位/);
  fetchError = new Error('Offline');
  const offline = await requestCurrentWeatherLocation();
  assert.equal(offline.coord.countryCode, undefined);
  assert.equal(offline.coord.timezone, undefined);
  assert.match(offline.notices.join(' '), /重新定位/);
  fetchError = undefined;

  geolocate = (success) => success({ ...position, coords: { ...position.coords, accuracy: 5_000 } });
  const approximate = await requestCurrentWeatherLocation();
  assert.equal(approximate.accuracyMeters, 5_000);
  assert.match(approximate.notices.join(' '), /5\.0 公里/);

  for (const [code, message] of [[1, /權限.*拒絕/], [2, /未能取得位置/], [3, /定位逾時/]] as const) {
    const before = fetchCalls;
    geolocate = (_, error) => error!({ code } as GeolocationPositionError);
    await assert.rejects(requestCurrentWeatherLocation(), message);
    assert.equal(fetchCalls, before, 'Denied/failed GPS must not fall back to IP geolocation');
  }
  geolocate = (success) => success({ ...position, coords: { ...position.coords, latitude: NaN } });
  await assert.rejects(requestCurrentWeatherLocation(), /位置無效/);
  geolocate = () => { throw new Error('Native location failure'); };
  await assert.rejects(requestCurrentWeatherLocation(), /未能取得位置/);

  let lateSuccess: PositionCallback | undefined;
  let deadline: (() => void) | undefined;
  let cleared = 0;
  setGlobal('setTimeout', (callback: () => void, delay: number) => { assert.equal(delay, 20_000); deadline = callback; return 1; });
  setGlobal('clearTimeout', () => { cleared += 1; });
  geolocate = (success) => { lateSuccess = success; };
  const beforeDeadline = fetchCalls;
  const pending = requestCurrentWeatherLocation();
  deadline!();
  await assert.rejects(pending, /定位逾時/);
  lateSuccess!(position);
  await Promise.resolve();
  assert.equal(fetchCalls, beforeDeadline, 'Late location callbacks after timeout must not transmit coordinates');
  assert.equal(cleared, 1);

  setGlobal('isSecureContext', false);
  await assert.rejects(requestCurrentWeatherLocation(), /HTTPS/);
  setGlobal('isSecureContext', true);
  setGlobal('navigator', {});
  await assert.rejects(requestCurrentWeatherLocation(), /唔支援定位/);
  console.log('current location: explicit consent, precise coordinates, country/timezone, privacy and error checks passed');
} finally {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
}
