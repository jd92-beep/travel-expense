import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveGatewayRoute, validateGatewayBody } from './gateway-routes.js';

test('gateway maps only production read routes', () => {
  assert.deepEqual(
    resolveGatewayRoute('/api/admin/overview', 'GET', new URLSearchParams()),
    { edgeRoute: '/api/overview', query: {} },
  );
  assert.throws(
    () => resolveGatewayRoute('/api/admin/arbitrary-table', 'GET', new URLSearchParams()),
    /not found/i,
  );
  assert.throws(
    () => resolveGatewayRoute('/api/admin/snapshot', 'GET', new URLSearchParams()),
    /not found/i,
  );
});

test('gateway maps production read resources with bounded queries', () => {
  assert.deepEqual(
    resolveGatewayRoute(
      '/api/admin/accounts',
      'GET',
      new URLSearchParams('limit=50&status=active&platform=android&sort=updated_at&direction=desc'),
    ),
    {
      edgeRoute: '/api/accounts',
      query: {
        limit: '50',
        status: 'active',
        platform: 'android',
        sort: 'updated_at',
        direction: 'desc',
      },
    },
  );
  assert.deepEqual(
    resolveGatewayRoute(
      '/api/admin/reconciliation',
      'GET',
      new URLSearchParams('tripId=97000000-0000-4000-8000-000000000001'),
    ),
    {
      edgeRoute: '/api/reconciliation',
      query: { tripId: '97000000-0000-4000-8000-000000000001' },
    },
  );
  assert.deepEqual(
    resolveGatewayRoute('/api/admin/providers', 'GET', new URLSearchParams()),
    { edgeRoute: '/api/providers', query: {} },
  );
});

test('gateway rejects non-allowlisted mutations, unknown query keys, and duplicate query keys', () => {
  assert.throws(
    () => resolveGatewayRoute('/api/admin/runtime', 'POST', new URLSearchParams()),
    /not allowlisted/i,
  );
  assert.throws(
    () => resolveGatewayRoute('/api/admin/runtime', 'GET', new URLSearchParams('secret=value')),
    /not allowed/i,
  );
  assert.throws(
    () => resolveGatewayRoute('/api/admin/accounts', 'GET', new URLSearchParams('limit=50&limit=100')),
    /not allowed/i,
  );
});

test('gateway permits bounded entity read routes', () => {
  const id = '97000000-0000-4000-8000-000000000001';
  const routes = [
    [`/api/admin/accounts/${id}`, `/api/accounts/${id}`],
    [`/api/admin/accounts/${id}/installations`, `/api/accounts/${id}/installations`],
    [`/api/admin/trips/${id}`, `/api/trips/${id}`],
    [`/api/admin/trips/${id}/itinerary`, `/api/trips/${id}/itinerary`],
    [`/api/admin/receipts/${id}`, `/api/receipts/${id}`],
    [`/api/admin/audit/${id}`, `/api/audit/${id}`],
  ];
  for (const [browserRoute, edgeRoute] of routes) {
    assert.deepEqual(
      resolveGatewayRoute(browserRoute, 'GET', new URLSearchParams()),
      { edgeRoute, query: {} },
    );
  }
  assert.deepEqual(
    resolveGatewayRoute(`/api/admin/trips/${id}/itinerary/versions`, 'GET', new URLSearchParams('limit=50&beforeVersion=7')),
    { edgeRoute: `/api/trips/${id}/itinerary/versions`, query: { limit: '50', beforeVersion: '7' } },
  );
  assert.deepEqual(
    resolveGatewayRoute(`/api/admin/receipts/${id}/photo`, 'GET', new URLSearchParams()),
    { edgeRoute: `/api/receipts/${id}/photo`, query: {}, responseType: 'stream' },
  );
  assert.throws(
    () => resolveGatewayRoute(`/api/admin/trips/${id}/itinerary/versions`, 'GET', new URLSearchParams('beforeVersion=0')),
    /version is invalid/i,
  );
  assert.throws(
    () => resolveGatewayRoute('/api/admin/receipts/not-a-uuid/photo', 'GET', new URLSearchParams()),
    /not found/i,
  );
});

test('gateway exposes only the generic allowlisted operation mutation routes', () => {
  const id = '97000000-0000-4000-8000-000000000001';
  assert.deepEqual(
    resolveGatewayRoute('/api/admin/operations/preview', 'POST', new URLSearchParams()),
    {
      edgeRoute: '/api/operations/preview',
      query: {},
      mutation: true,
      bodyLimit: 64 * 1024,
      bodyKind: 'operation-preview',
    },
  );
  assert.deepEqual(
    resolveGatewayRoute(`/api/admin/operations/${id}/commit`, 'POST', new URLSearchParams()),
    {
      edgeRoute: `/api/operations/${id}/commit`,
      query: {},
      mutation: true,
      bodyLimit: 1024,
      bodyKind: 'operation-commit',
    },
  );
  assert.throws(
    () => resolveGatewayRoute('/api/admin/amend-receipt', 'POST', new URLSearchParams()),
    /not allowlisted/i,
  );
});

test('gateway validates operation actions and strips no unchecked fields', () => {
  const id = '97000000-0000-4000-8000-000000000001';
  const idempotencyKey = '97100000-0000-4000-8000-000000000001';
  assert.deepEqual(
    validateGatewayBody('operation-preview', {
      action: 'retry_sync_job',
      idempotencyKey,
      targetId: id,
      payload: {},
    }),
    { action: 'retry_sync_job', idempotencyKey, targetId: id, payload: {} },
  );
  assert.deepEqual(
    validateGatewayBody('operation-preview', {
      action: 'provider_probe',
      idempotencyKey,
      targetId: 'google',
    }),
    { action: 'provider_probe', idempotencyKey, targetId: 'google', payload: {} },
  );
  assert.deepEqual(
    validateGatewayBody('operation-preview', {
      action: 'run_integrity_scan',
      idempotencyKey,
      targetId: 'system',
      payload: {},
    }),
    { action: 'run_integrity_scan', idempotencyKey, targetId: 'system', payload: {} },
  );
  assert.deepEqual(
    validateGatewayBody('operation-preview', {
      action: 'receipt_amend',
      idempotencyKey,
      targetId: id,
      payload: {
        expectedVersion: 4,
        patch: { amount: 250, store: 'Nagoya dinner', visibility: 'private' },
      },
    }),
    {
      action: 'receipt_amend',
      idempotencyKey,
      targetId: id,
      payload: {
        expectedVersion: 4,
        patch: { amount: 250, store: 'Nagoya dinner', visibility: 'private' },
      },
    },
  );
  assert.deepEqual(
    validateGatewayBody('operation-commit', { grantId: id }),
    { grantId: id },
  );
  assert.deepEqual(
    validateGatewayBody('operation-preview', {
      action: 'member_role',
      idempotencyKey,
      targetId: id,
      payload: { userId: idempotencyKey, role: 'viewer' },
    }),
    {
      action: 'member_role',
      idempotencyKey,
      targetId: id,
      payload: { userId: idempotencyKey, role: 'viewer' },
    },
  );
  assert.deepEqual(
    validateGatewayBody('operation-preview', {
      action: 'itinerary_amend',
      idempotencyKey,
      targetId: id,
      payload: {
        endDate: '2026-04-24',
        expectedVersion: 7,
        itinerary: [{ date: '2026-04-24', title: 'Day 1', spots: [] }],
        removedDates: ['2026-04-25'],
        startDate: '2026-04-24',
      },
    }),
    {
      action: 'itinerary_amend',
      idempotencyKey,
      targetId: id,
      payload: {
        endDate: '2026-04-24',
        expectedVersion: 7,
        itinerary: [{ date: '2026-04-24', title: 'Day 1', spots: [] }],
        removedDates: ['2026-04-25'],
        startDate: '2026-04-24',
      },
    },
  );
  assert.throws(
    () => validateGatewayBody('operation-preview', {
      action: 'reassign_data', idempotencyKey, targetId: id, payload: {},
    }),
    /context is invalid/i,
  );
  assert.throws(
    () => validateGatewayBody('operation-preview', {
      action: 'support_bundle', idempotencyKey, targetId: 'system', payload: { secret: true },
    }),
    /field is not allowed/i,
  );
  assert.throws(
    () => validateGatewayBody('operation-preview', {
      action: 'run_integrity_scan', idempotencyKey, targetId: id, payload: {},
    }),
    /scan target is invalid/i,
  );
  assert.throws(
    () => validateGatewayBody('operation-preview', {
      action: 'receipt_trash',
      idempotencyKey,
      targetId: id,
      payload: { expectedVersion: 0 },
    }),
    /receipt operation context is invalid/i,
  );
  assert.throws(
    () => validateGatewayBody('operation-preview', {
      action: 'itinerary_restore',
      idempotencyKey,
      targetId: id,
      payload: { expectedVersion: 2, restoreVersion: -1 },
    }),
    /itinerary restore context is invalid/i,
  );
  assert.throws(
    () => validateGatewayBody('operation-preview', {
      action: 'itinerary_amend',
      idempotencyKey,
      targetId: id,
      payload: {
        endDate: '2026-04-24',
        expectedVersion: 7,
        itinerary: [],
        startDate: '2026-04-20',
      },
    }),
    /itinerary context is invalid/i,
  );
  assert.throws(
    () => validateGatewayBody('operation-commit', { grantId: id, force: true }),
    /field is not allowed/i,
  );
  assert.throws(
    () => validateGatewayBody('operation-preview', {
      action: 'member_remove',
      idempotencyKey,
      targetId: id,
      payload: {},
    }),
    /member remove context is invalid/i,
  );
});

test('gateway validates production list, search, and reconciliation inputs', () => {
  assert.throws(
    () => resolveGatewayRoute('/api/admin/accounts', 'GET', new URLSearchParams('limit=500')),
    /limit is invalid/i,
  );
  assert.throws(
    () => resolveGatewayRoute('/api/admin/search', 'GET', new URLSearchParams('q=boss@example.com')),
    /search query is invalid/i,
  );
  assert.throws(
    () => resolveGatewayRoute('/api/admin/reconciliation', 'GET', new URLSearchParams()),
    /parameter is invalid/i,
  );
  assert.throws(
    () => resolveGatewayRoute('/api/admin/audit', 'GET', new URLSearchParams('startAt=bad-date')),
    /audit date is invalid/i,
  );
  assert.throws(
    () => resolveGatewayRoute('/api/admin/audit', 'GET', new URLSearchParams('risk=R9')),
    /parameter is invalid/i,
  );
  assert.deepEqual(
    resolveGatewayRoute(
      '/api/admin/audit',
      'GET',
      new URLSearchParams('targetId=97000000-0000-4000-8000-000000000001'),
    ),
    {
      edgeRoute: '/api/audit',
      query: { targetId: '97000000-0000-4000-8000-000000000001' },
    },
  );
  assert.throws(
    () => resolveGatewayRoute('/api/admin/audit', 'GET', new URLSearchParams('targetId=bad')),
    /parameter is invalid/i,
  );
});
