import assert from 'node:assert/strict';
import test from 'node:test';

import { clearSessionCookies, CSRF_COOKIE, parseCookies, SESSION_COOKIE, sessionCookies } from './cookies.js';

test('session cookie is host-only secure strict and HttpOnly', () => {
  const [session, csrf] = sessionCookies('session-token', 'csrf-token');
  assert.match(session, new RegExp(`^${SESSION_COOKIE}=`));
  assert.match(session, /Secure; SameSite=Strict; HttpOnly$/);
  assert.doesNotMatch(session, /Domain=/);
  assert.match(csrf, new RegExp(`^${CSRF_COOKIE}=`));
  assert.doesNotMatch(csrf, /HttpOnly/);
});

test('cookie parser and clear cookies are deterministic', () => {
  assert.deepEqual(parseCookies({ headers: { cookie: 'a=1; __Host-admin_session=abc' } }), {
    a: '1',
    [SESSION_COOKIE]: 'abc',
  });
  for (const value of clearSessionCookies()) assert.match(value, /Max-Age=0/);
});
