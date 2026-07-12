import assert from 'node:assert/strict';
import test from 'node:test';

import health from './health.js';

function invokeHealth() {
  let body = '';
  const headers = new Map();
  const res = {
    statusCode: 0,
    setHeader(name, value) { headers.set(name, value); },
    end(value) { body = value; },
  };
  health({ headers: {} }, res);
  return { body: JSON.parse(body), headers, status: res.statusCode };
}

test('health accepts read traffic only with explicit provenance-bound enablement', () => {
  const previous = {
    accept: process.env.ADMIN_ACCEPT_READ_TRAFFIC,
    deploy: process.env.VERCEL_DEPLOYMENT_ID,
    sha: process.env.VERCEL_GIT_COMMIT_SHA,
  };
  try {
    process.env.VERCEL_GIT_COMMIT_SHA = 'a'.repeat(40);
    process.env.VERCEL_DEPLOYMENT_ID = 'deployment-1';
    delete process.env.ADMIN_ACCEPT_READ_TRAFFIC;
    assert.equal(invokeHealth().body.acceptingReadTraffic, false);

    process.env.ADMIN_ACCEPT_READ_TRAFFIC = 'true';
    assert.equal(invokeHealth().body.acceptingReadTraffic, true);

    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.ADMIN_GIT_SHA;
    assert.equal(invokeHealth().body.acceptingReadTraffic, false);
  } finally {
    if (previous.accept === undefined) delete process.env.ADMIN_ACCEPT_READ_TRAFFIC;
    else process.env.ADMIN_ACCEPT_READ_TRAFFIC = previous.accept;
    if (previous.deploy === undefined) delete process.env.VERCEL_DEPLOYMENT_ID;
    else process.env.VERCEL_DEPLOYMENT_ID = previous.deploy;
    if (previous.sha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = previous.sha;
  }
});
