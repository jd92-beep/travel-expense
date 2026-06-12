import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const compactDir = resolve(scriptDir, '..');
const repoRoot = resolve(compactDir, '..');
const reactDir = resolve(repoRoot, 'app-react');

const compactUrl = process.env.COMPACT_SHARED_CONTRACT_COMPACT_URL || 'http://127.0.0.1:8913/travel-expense/compact/';
const reactUrl = process.env.COMPACT_SHARED_CONTRACT_REACT_URL || 'http://127.0.0.1:8914/travel-expense/react/';
const userId = '55555555-5555-4555-8555-555555555555';
const storageKey = 'boss-japan-tracker';

const fixture = {
  schemaVersion: 4,
  receipts: [
    {
      id: 'contract_receipt_food',
      supabaseId: '00000000-0000-4000-8000-000000000101',
      notionPageId: 'notion-page-contract-food',
      store: 'Gwangjang Market',
      total: 36000,
      originalAmount: 36000,
      originalCurrency: 'KRW',
      currency: 'KRW',
      hkdAmount: 205,
      exchangeRate: 175.5,
      rateSource: 'fixture',
      date: '2026-07-11',
      time: '12:30',
      category: 'food',
      payment: 'credit',
      region: 'Seoul',
      regionSnapshot: 'Seoul',
      address: 'Seoul, South Korea',
      mapUrl: 'https://maps.google.com/?q=Gwangjang%20Market',
      note: 'Shared lunch',
      itemsText: 'Bibimbap; market snacks',
      personId: 'p_boss',
      splitMode: 'shared',
      tripId: 'contract_trip_korea',
      tripVersion: 3,
      tripDayId: 'contract_trip_korea_day_20260711',
      spotId: 'contract_trip_korea_day_20260711_spot_01_gwangjang_market',
      syncStatus: 'queued',
      source: 'email',
      sourceId: 'email_contract_food_20260711',
      ownerId: userId,
      createdByLabel: 'You',
      ledgerSyncStatus: 'queued',
      createdAt: 1_780_000_100_000,
      updatedAt: 1_780_000_200_000,
    },
    {
      id: 'contract_receipt_private',
      store: 'Olive Young',
      total: 64000,
      originalAmount: 64000,
      originalCurrency: 'KRW',
      currency: 'KRW',
      hkdAmount: 365,
      exchangeRate: 175.5,
      date: '2026-07-12',
      category: 'shopping',
      payment: 'cash',
      personId: 'p_trip_3',
      beneficiaryId: 'p_trip_3',
      splitMode: 'private',
      tripId: 'contract_trip_korea',
      tripVersion: 3,
      syncStatus: 'local',
      sourceId: 'manual_contract_private_20260712',
      ownerId: '66666666-6666-4666-8666-666666666666',
      createdByLabel: 'Trip member',
      ledgerSyncStatus: 'synced',
      createdAt: 1_780_010_100_000,
      updatedAt: 1_780_010_200_000,
    },
  ],
  budget: 2_500_000,
  rate: 175.5,
  tripCurrency: 'KRW',
  autoSync: false,
  proxy: 'https://notion-proxy.ftjdfr.workers.dev',
  notionDb: 'contract-personal-notion-db',
  personalNotionConnected: true,
  scanModel: 'google/gemma-4-31b-it',
  voiceModel: 'google/gemma-4-31b-it',
  emailModel: 'kimi/kimi-code',
  tripUpdateModel: 'kimi/kimi-code',
  googleBackupModel: 'google/gemma-4-31b-it',
  persons: [
    { id: 'p_boss', name: 'User 1', emoji: '👤', color: '#CC2929' },
    { id: 'p_xinxin', name: 'User 2', emoji: '🧳', color: '#FF91A4' },
    { id: 'p_trip_3', name: 'Planner', emoji: '🗺️', color: '#1E4D6B' },
  ],
  shareRatios: {
    p_boss: 2,
    p_xinxin: 1,
    p_trip_3: 0.5,
  },
  tripName: 'Korea Contract Trip',
  tripDateRange: { start: '2026-07-11', end: '2026-07-13' },
  activeTripId: 'contract_trip_korea',
  trips: [
    {
      id: 'contract_trip_korea',
      supabaseId: '00000000-0000-4000-8000-000000000201',
      name: 'Korea Contract Trip',
      destinationSummary: 'Seoul / Jeju Korea',
      startDate: '2026-07-11',
      endDate: '2026-07-13',
      homeCurrency: 'HKD',
      currencies: ['HKD', 'KRW'],
      timezones: ['Asia/Seoul'],
      version: 3,
      active: true,
      archived: false,
      budget: 2_500_000,
      intelligence: {
        countryCode: 'KR',
        countryName: 'Korea',
        primaryCurrency: 'KRW',
        themeKey: 'korea_editorial',
        locale: 'ko-KR',
        timezone: 'Asia/Seoul',
        weatherRegion: 'South Korea',
        confidence: 'high',
        source: 'manual',
        updatedAt: 1_780_000_000_000,
        tripStyle: 'food',
        homeCity: 'Hong Kong',
        weatherPreference: 'rain',
      },
      itinerary: [
        {
          id: 'contract_trip_korea_day_20260711',
          dayId: 'contract_trip_korea_day_20260711',
          date: '2026-07-11',
          day: 1,
          region: 'Seoul',
          city: 'Seoul',
          country: 'South Korea',
          timezone: 'Asia/Seoul',
          currency: 'KRW',
          highlight: 'Food markets',
          lodging: {
            id: 'contract_lodging_1',
            name: 'Hongdae Stay',
            address: 'Hongdae, Seoul',
            mapUrl: 'https://maps.google.com/?q=Hongdae%20Stay',
            checkIn: '15:00',
            checkOut: '11:00',
          },
          spots: [
            {
              id: 'contract_trip_korea_day_20260711_spot_01_gwangjang_market',
              spotId: 'contract_trip_korea_day_20260711_spot_01_gwangjang_market',
              time: '12:00',
              name: 'Gwangjang Market',
              type: 'food',
              address: 'Seoul',
              mapUrl: 'https://maps.google.com/?q=Gwangjang%20Market',
              note: 'Lunch',
              timezone: 'Asia/Seoul',
              lat: 37.5701,
              lon: 126.9996,
            },
          ],
        },
      ],
      notionPageId: 'contract-notion-trip-page',
      sourceId: 'trip_contract_trip_korea',
      notionDb: 'contract-personal-notion-db',
      sharing: {
        role: 'owner',
        isShared: true,
        memberCount: 2,
        pendingInviteCount: 1,
        members: [
          { userId, role: 'owner', status: 'active', displayName: 'You' },
          { userId: '66666666-6666-4666-8666-666666666666', role: 'editor', status: 'active', displayName: 'Trip member' },
        ],
        invites: [
          {
            id: '00000000-0000-4000-8000-000000000301',
            email: 'friend@example.com',
            role: 'viewer',
            status: 'pending',
            expiresAt: '2026-07-01T00:00:00.000Z',
            createdAt: '2026-06-12T00:00:00.000Z',
          },
        ],
        backendHealth: {
          status: 'active',
          syncMode: 'dual_write',
          lastHealthAt: '2026-06-12T00:00:00.000Z',
        },
      },
      createdAt: 1_780_000_000_000,
      updatedAt: 1_780_000_000_000,
    },
  ],
  customItinerary: null,
  itineraryOverrides: {
    contract_trip_korea_day_20260711_spot_01_gwangjang_market: { note: 'Arrive early' },
  },
  statsIncludeTransportLodging: false,
  top10IncludeBigItems: false,
  lastTab: 'dashboard',
  notionDeletedSourceIds: ['email_old_deleted_source'],
  syncQueue: [
    {
      id: 'sync_contract_receipt_food',
      type: 'receipt',
      entityId: 'contract_receipt_food',
      op: 'update',
      status: 'queued',
      attempts: 1,
      createdAt: 1_780_000_300_000,
      updatedAt: 1_780_000_400_000,
      payload: {
        notionPageId: 'notion-page-contract-food',
        supabaseId: '00000000-0000-4000-8000-000000000101',
        tripId: 'contract_trip_korea',
        sourceId: 'email_contract_food_20260711',
        updatedAt: 1_780_000_200_000,
      },
    },
    {
      id: 'sync_contract_trip',
      type: 'trip',
      entityId: 'contract_trip_korea',
      op: 'update',
      status: 'queued',
      attempts: 0,
      createdAt: 1_780_000_500_000,
      updatedAt: 1_780_000_500_000,
      payload: {
        sourceId: 'trip_contract_trip_korea',
        updatedAt: 1_780_000_000_000,
      },
    },
    {
      id: 'sync_contract_settings',
      type: 'settings',
      entityId: 'app-settings',
      op: 'upsert',
      status: 'queued',
      attempts: 0,
      createdAt: 1_780_000_600_000,
      updatedAt: 1_780_000_600_000,
      payload: { updatedAt: 1_780_000_600_000 },
    },
  ],
  settingsUpdatedAt: 1_780_000_600_000,
  lastSyncedAt: 1_780_000_000_000,
  globalSyncStatus: 'idle',
  syncError: '',
  settingsPulledAt: 1_780_000_000_000,
  displayCurrency: 'HKD',
};

function safeEnv(extra = {}) {
  const allowed = new Set([
    'CI',
    'FORCE_COLOR',
    'HOME',
    'LANG',
    'LC_ALL',
    'NODE_OPTIONS',
    'PATH',
    'PLAYWRIGHT_BROWSERS_PATH',
    'SHELL',
    'TMPDIR',
    'USER',
    'npm_config_cache',
    'npm_config_color',
    'npm_config_loglevel',
  ]);
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (allowed.has(key) || key.startsWith('npm_')) env[key] = value;
  }
  return { ...env, ...extra };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probe(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 900);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureServer({ name, cwd, url, port, base }) {
  if (await probe(url)) {
    console.log(`[shared-contract] using existing ${name} server at ${url}`);
    return null;
  }
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const server = spawn(npx, ['vite', '--host', '127.0.0.1', '--port', String(port)], {
    cwd,
    env: safeEnv({ FORCE_COLOR: '0', VITE_BASE_PATH: base }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (chunk) => { output += String(chunk); });
  server.stderr.on('data', (chunk) => { output += String(chunk); });
  for (let i = 0; i < 160; i += 1) {
    if (server.exitCode !== null) {
      throw new Error(`${name} server exited early with code ${server.exitCode}\n${output.slice(-2000)}`);
    }
    if (await probe(url)) {
      console.log(`[shared-contract] started ${name} server at ${url}`);
      return server;
    }
    await delay(250);
  }
  server.kill('SIGTERM');
  throw new Error(`Timed out waiting for ${name} server at ${url}\n${output.slice(-2000)}`);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function commonIntelligence(value = {}) {
  return {
    countryCode: value.countryCode,
    countryName: value.countryName,
    primaryCurrency: value.primaryCurrency,
    themeKey: value.themeKey,
    locale: value.locale,
    timezone: value.timezone,
    weatherRegion: value.weatherRegion,
    confidence: value.confidence,
    source: value.source,
    updatedAt: value.updatedAt,
  };
}

function optionalText(value) {
  return typeof value === 'string' ? value : '';
}

function summarizeState(state) {
  const trips = Array.isArray(state.trips) ? state.trips : [];
  const receipts = Array.isArray(state.receipts) ? state.receipts : [];
  return stable({
    activeTripId: state.activeTripId,
    tripName: state.tripName,
    tripCurrency: state.tripCurrency,
    budget: state.budget,
    autoSync: state.autoSync,
    notionDb: state.notionDb,
    personalNotionConnected: state.personalNotionConnected,
    statsIncludeTransportLodging: state.statsIncludeTransportLodging,
    top10IncludeBigItems: state.top10IncludeBigItems,
    persons: (state.persons || []).map((person) => ({
      id: person.id,
      name: person.name,
      emoji: person.emoji,
      color: person.color,
    })),
    shareRatios: state.shareRatios || {},
    trips: trips.map((trip) => ({
      id: trip.id,
      supabaseId: trip.supabaseId,
      name: trip.name,
      destinationSummary: trip.destinationSummary,
      startDate: trip.startDate,
      endDate: trip.endDate,
      homeCurrency: trip.homeCurrency,
      currencies: trip.currencies,
      timezones: trip.timezones,
      version: trip.version,
      active: trip.active,
      archived: trip.archived,
      budget: trip.budget,
      notionPageId: trip.notionPageId,
      sourceId: trip.sourceId,
      notionDb: trip.notionDb,
      sharing: trip.sharing ? {
        role: trip.sharing.role,
        isShared: trip.sharing.isShared,
        memberCount: trip.sharing.memberCount,
        pendingInviteCount: trip.sharing.pendingInviteCount,
        members: (trip.sharing.members || []).map((member) => ({
          userId: member.userId,
          email: optionalText(member.email),
          displayName: optionalText(member.displayName),
          role: member.role,
          status: member.status,
          defaultPersonId: optionalText(member.defaultPersonId),
        })),
        invites: (trip.sharing.invites || []).map((invite) => ({
          id: invite.id,
          email: invite.email,
          role: invite.role,
          status: invite.status,
          expiresAt: invite.expiresAt,
          createdAt: invite.createdAt,
        })),
        backendHealth: trip.sharing.backendHealth ? {
          status: trip.sharing.backendHealth.status,
          syncMode: trip.sharing.backendHealth.syncMode,
          lastHealthAt: optionalText(trip.sharing.backendHealth.lastHealthAt),
          lastError: optionalText(trip.sharing.backendHealth.lastError),
        } : undefined,
      } : undefined,
      intelligence: commonIntelligence(trip.intelligence),
      itinerary: (trip.itinerary || []).map((day) => ({
        id: day.id,
        dayId: day.dayId,
        date: day.date,
        day: day.day,
        region: day.region,
        city: day.city,
        country: day.country,
        timezone: day.timezone,
        currency: day.currency,
        highlight: day.highlight,
        lodging: day.lodging,
        spots: (day.spots || []).map((spot) => ({
          id: spot.id,
          spotId: spot.spotId,
          time: spot.time,
          name: spot.name,
          type: spot.type,
          address: spot.address,
          mapUrl: spot.mapUrl,
          note: spot.note,
          timezone: spot.timezone,
          lat: spot.lat,
          lon: spot.lon,
        })),
      })),
    })),
    receipts: receipts.map((receipt) => ({
      id: receipt.id,
      supabaseId: receipt.supabaseId,
      notionPageId: receipt.notionPageId,
      store: receipt.store,
      total: receipt.total,
      originalAmount: receipt.originalAmount,
      originalCurrency: receipt.originalCurrency,
      currency: receipt.currency,
      hkdAmount: receipt.hkdAmount,
      exchangeRate: receipt.exchangeRate,
      date: receipt.date,
      time: receipt.time,
      category: receipt.category,
      payment: receipt.payment,
      regionSnapshot: optionalText(receipt.regionSnapshot),
      address: optionalText(receipt.address),
      mapUrl: optionalText(receipt.mapUrl),
      note: optionalText(receipt.note),
      itemsText: optionalText(receipt.itemsText),
      personId: receipt.personId,
      splitMode: receipt.splitMode,
      beneficiaryId: receipt.beneficiaryId,
      ownerId: optionalText(receipt.ownerId),
      createdByEmail: optionalText(receipt.createdByEmail),
      createdByLabel: optionalText(receipt.createdByLabel),
      ledgerSyncStatus: optionalText(receipt.ledgerSyncStatus),
      source: receipt.source,
      sourceId: receipt.sourceId,
      tripId: receipt.tripId,
      tripVersion: receipt.tripVersion,
      tripDayId: receipt.tripDayId,
      spotId: receipt.spotId,
      updatedAt: receipt.updatedAt,
    })),
    notionDeletedSourceIds: state.notionDeletedSourceIds || [],
    settingsUpdatedAt: state.settingsUpdatedAt,
    settingsPulledAt: state.settingsPulledAt,
    displayCurrency: state.displayCurrency,
  });
}

function runtimeSyncSummary(state) {
  const queue = Array.isArray(state.syncQueue) ? state.syncQueue : [];
  return stable({
    globalSyncStatus: state.globalSyncStatus || '',
    lastSyncedAt: Number(state.lastSyncedAt) || 0,
    syncQueueLength: queue.length,
    receiptSyncStatuses: (state.receipts || []).map((receipt) => ({
      id: receipt.id,
      syncStatus: receipt.syncStatus || '',
    })),
  });
}

function compactOnlySummary(state) {
  const trip = (state.trips || [])[0] || {};
  return stable({
    tripStyle: trip.intelligence?.tripStyle,
    homeCity: trip.intelligence?.homeCity,
    weatherPreference: trip.intelligence?.weatherPreference,
  });
}

async function collectNormalizedState(browser, target) {
  const page = await browser.newPage();
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      const text = message.text();
      if (!/offline|failed to fetch|currency|supabase/i.test(text)) {
        console.log(`[shared-contract:${target.name}:console:${message.type()}] ${text}`);
      }
    }
  });
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(target.origin)) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, rates: { JPY: 20, KRW: 175.5, HKD: 1 }, source: 'contract-stub' }),
    });
  });
  await page.addInitScript(({ fixture: input, storageKey: key, userId: uid }) => {
    localStorage.clear();
    indexedDB.deleteDatabase('travel-expense-react');
    window.__disable_supabase_configured = true;
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify({
      access_token: 'contract-fake-access-token',
      refresh_token: 'contract-fake-refresh-token',
      token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: uid,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'contract-user@example.com',
      },
    }));
    localStorage.setItem(key, JSON.stringify(input));
  }, { fixture, storageKey, userId });
  await page.goto(target.url);
  await page.waitForFunction((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return parsed?.activeTripId === 'contract_trip_korea'
        && Array.isArray(parsed.trips)
        && parsed.trips[0]?.itinerary?.[0]?.dayId
        && Array.isArray(parsed.receipts)
        && parsed.receipts.length === 2;
    } catch {
      return false;
    }
  }, storageKey, { timeout: 15_000 });
  await page.waitForTimeout(350);
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), storageKey);
  await page.close();
  return state;
}

function assertDeepEqual(label, left, right) {
  const leftJson = JSON.stringify(left, null, 2);
  const rightJson = JSON.stringify(right, null, 2);
  if (leftJson !== rightJson) {
    throw new Error(`${label} mismatch\ncompact:\n${leftJson}\nreact:\n${rightJson}`);
  }
}

function assertCompatibleSchema(label, state) {
  const schemaVersion = Number(state.schemaVersion);
  if (!Number.isFinite(schemaVersion) || schemaVersion < 3) {
    throw new Error(`${label} schemaVersion is not compatible with shared contract v3+: ${state.schemaVersion}`);
  }
  return schemaVersion;
}

const startedServers = [];
let browser;

try {
  startedServers.push(await ensureServer({
    name: 'compact',
    cwd: compactDir,
    url: compactUrl,
    port: 8913,
    base: '/travel-expense/compact/',
  }));
  startedServers.push(await ensureServer({
    name: 'react',
    cwd: reactDir,
    url: reactUrl,
    port: 8914,
    base: '/travel-expense/react/',
  }));

  browser = await chromium.launch();
  const compactState = await collectNormalizedState(browser, {
    name: 'compact',
    url: compactUrl,
    origin: new URL(compactUrl).origin,
  });
  const reactState = await collectNormalizedState(browser, {
    name: 'react',
    url: reactUrl,
    origin: new URL(reactUrl).origin,
  });

  const compactSummary = summarizeState(compactState);
  const reactSummary = summarizeState(reactState);
  assertDeepEqual('shared storage contract', compactSummary, reactSummary);
  const compactSchemaVersion = assertCompatibleSchema('compact', compactState);
  const reactSchemaVersion = assertCompatibleSchema('react', reactState);

  const compactExtras = compactOnlySummary(compactState);
  if (compactExtras.tripStyle !== 'food' || compactExtras.homeCity !== 'Hong Kong' || compactExtras.weatherPreference !== 'rain') {
    throw new Error(`compact personalization fields were not preserved: ${JSON.stringify(compactExtras)}`);
  }

  console.log(JSON.stringify({
    status: 'passed',
    schemaVersions: {
      compact: compactSchemaVersion,
      react: reactSchemaVersion,
    },
    compared: {
      trips: compactSummary.trips.length,
      receipts: compactSummary.receipts.length,
      persons: compactSummary.persons.length,
      runtimeSync: {
        compact: runtimeSyncSummary(compactState),
        react: runtimeSyncSummary(reactState),
      },
    },
    contract: [
      'trip',
      'receipt',
      'person',
      'shareRatios',
      'settings',
      'syncIdentityMetadata',
      'commonTripIntelligence',
      'notionMetadata',
      'supabaseMetadata',
      'tripSharingMetadata',
      'receiptOwnershipMetadata',
    ],
    compactOnlyPreserved: compactExtras,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  for (const server of startedServers.reverse()) {
    if (server) server.kill('SIGTERM');
  }
}
