import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseProtectedResponse,
  protectedRequestArgs,
} from '../../scripts/vercel-protected-request.mjs';

test('protected candidate requests preserve the complete fail-closed Vercel curl contract', () => {
  const args = protectedRequestArgs({
    baseArgs: ['--yes', 'vercel@54.17.3'],
    body: '{"mode":"candidate"}',
    deploymentUrl: 'https://admin-candidate.example.vercel.app',
    headerFile: '/tmp/travel-expense-admin-readiness/headers',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Request-Id': 'candidate-request-id',
    },
    method: 'POST',
    pathname: '/api/readiness',
  });

  assert.deepEqual(args, [
    '--yes',
    'vercel@54.17.3',
    'curl',
    '/api/readiness',
    '--deployment',
    'https://admin-candidate.example.vercel.app',
    '--yes',
    '--',
    '--silent',
    '--show-error',
    '--request',
    'POST',
    '--write-out',
    '\n%{http_code}',
    '--header',
    'Content-Type: application/json',
    '--header',
    'X-Admin-Request-Id: candidate-request-id',
    '--header',
    '@/tmp/travel-expense-admin-readiness/headers',
    '--data-raw',
    '{"mode":"candidate"}',
  ]);
  assert.equal(args.includes('--location'), false);
  assert.equal(args.some((arg) => arg.includes('readiness-token')), false);
});

test('protected candidate response parser accepts JSON only from a 2xx response', () => {
  assert.deepEqual(parseProtectedResponse('{"ok":true}\n200', 'canary'), { ok: true });
  assert.throws(
    () => parseProtectedResponse('redirect\n302', 'canary'),
    /canary failed \(302\)/,
  );
  assert.throws(
    () => parseProtectedResponse('not-json\n200', 'canary'),
    /canary did not return JSON/,
  );
});

test('protected candidate request rejects non-Vercel targets and header injection', () => {
  assert.throws(() => protectedRequestArgs({
    baseArgs: [],
    deploymentUrl: 'https://example.com',
    pathname: '/api/health',
  }), /URL is invalid/);
  assert.throws(() => protectedRequestArgs({
    baseArgs: [],
    deploymentUrl: 'https://admin.vercel.app',
    headers: { Authorization: 'safe\r\nInjected: true' },
    pathname: '/api/health',
  }), /header is invalid/);
  assert.throws(() => protectedRequestArgs({
    baseArgs: [],
    deploymentUrl: 'https://admin.vercel.app',
    headers: { Authorization: 'Bearer readiness-token' },
    pathname: '/api/health',
  }), /header is invalid/);
  assert.throws(() => protectedRequestArgs({
    baseArgs: [],
    deploymentUrl: 'https://admin.vercel.app',
    headerFile: 'headers\nnext',
    pathname: '/api/health',
  }), /header file is invalid/);
});
