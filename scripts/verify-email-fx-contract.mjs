// Guards the email -> Notion currency contract in email-to-notion.gs.
//
// The extraction prompt used to convert amounts to JPY *and* pushToNotion ran
// _convertToJpy over the same value, so every non-JPY booking was multiplied by
// its rate twice. Apps Script has no runtime test harness, so this script loads
// the file into a vm context (top level is only constants and declarations) and
// asserts the two halves of the contract stay in agreement:
//   - the prompt asks for the receipt's own currency and does not convert, and
//   - FX_TO_JPY is the single conversion point, applied to original_amount.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'email-to-notion.gs');
const src = fs.readFileSync(file, 'utf8');

// ── Prompt side: no conversion instructions, no second rate table ──
assert.ok(
  /唔好做任何匯率換算/.test(src),
  'MULTI_BOOKING_PROMPT must tell the model not to convert currency',
);
assert.equal(
  /1 HKD ≈ \d+ JPY/.test(src), false,
  'the prompt must not carry its own rate table — FX_TO_JPY is the only one',
);
assert.equal(
  /×匯率/.test(src), false,
  'the prompt must not ask the model to multiply by a rate',
);
assert.equal(
  /"total":\s*(?:\d|null|number)/.test(src), false,
  'the model contract must not include a `total` field (examples included)',
);

// ── Code side: conversion reads original_amount, never a model-supplied total ──
assert.ok(
  /_convertToJpy\(b\.original_amount, b\.original_currency\)/.test(src),
  'pushToNotion must convert from original_amount',
);
assert.equal(
  /\bb\.total\b/.test(src), false,
  'no code path may read a model-supplied b.total',
);

// ── Behaviour: one conversion, using the shared table ──
const noop = () => ({});
const stub = new Proxy({}, { get: () => noop, has: () => true });
const context = vm.createContext({
  console,
  Utilities: stub,
  PropertiesService: stub,
  ScriptApp: stub,
  GmailApp: stub,
  UrlFetchApp: stub,
  Session: stub,
  SpreadsheetApp: stub,
  MailApp: stub,
});
vm.runInContext(`${src}\n;globalThis.__contract = { FX_TO_JPY, _convertToJpy };`, context);
const { FX_TO_JPY, _convertToJpy } = context.__contract;

assert.equal(_convertToJpy(1720.8, 'HKD'), 1720.8 * FX_TO_JPY.HKD);
assert.equal(_convertToJpy(3240, 'JPY'), 3240);
assert.equal(_convertToJpy(19.9, 'USD'), 19.9 * FX_TO_JPY.USD);
// An unknown currency passes through as JPY rather than silently zeroing out.
assert.equal(_convertToJpy(500, 'XYZ'), 500);

// "Price TBD" bookings carry a null amount by design. Null must survive the
// conversion: a 0 here writes a real ¥0 into Notion, which reads as "free".
assert.equal(_convertToJpy(null, 'HKD'), null);
assert.equal(_convertToJpy(undefined, 'HKD'), null);
assert.equal(_convertToJpy('', 'HKD'), null);
assert.equal(_convertToJpy('not-a-number', 'HKD'), null);
// A genuine zero is still a zero, not a missing value.
assert.equal(_convertToJpy(0, 'HKD'), 0);
assert.ok(
  /jpyRaw === null \? null : Math\.round\(jpyRaw\)/.test(src),
  'pushToNotion must keep a null amount null rather than rounding it to 0',
);
assert.ok(
  /const hkd = jpy === null \? null :/.test(src),
  'the HKD column must stay blank when there is no amount',
);

// The rate a double conversion would have produced must not be reachable.
assert.notEqual(_convertToJpy(1720.8 * FX_TO_JPY.HKD, 'HKD'), _convertToJpy(1720.8, 'HKD'));

console.log('email -> Notion FX contract passed');
