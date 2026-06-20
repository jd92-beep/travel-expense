import assert from 'node:assert/strict';
import { parseNotionSplitNote, serializeNotionSplitNote } from '../src/lib/notionSplitMeta.ts';
import type { Receipt } from '../src/lib/types.ts';

const receipt: Receipt = {
  id: 'receipt_1',
  store: 'Split Cafe',
  total: 100,
  date: '2026-04-20',
  category: 'food',
  payment: 'cash',
  splitMode: 'shared',
  splitType: 'exact',
  splits: [
    { personId: 'p_boss', amount: 60 },
    { personId: 'p_friend', amount: 40 },
  ],
  payers: [
    { personId: 'p_boss', amount: 70 },
    { personId: 'p_friend', amount: 30 },
  ],
  note: 'keep this note',
};

const serialized = serializeNotionSplitNote(receipt);
assert.match(serialized, /\[\[travel-expense-split:v1\]\]/);

const parsed = parseNotionSplitNote(serialized);
assert.equal(parsed.note, 'keep this note');
assert.equal(parsed.splitType, 'exact');
assert.deepEqual(parsed.splits, receipt.splits);
assert.deepEqual(parsed.payers, receipt.payers);

const plain = parseNotionSplitNote('plain note only');
assert.equal(plain.note, 'plain note only');
assert.equal(plain.splitType, undefined);
assert.equal(plain.splits, undefined);
assert.equal(plain.payers, undefined);

const invalid = parseNotionSplitNote('note\n[[travel-expense-split:v1]]{broken');
assert.equal(invalid.note, 'note\n[[travel-expense-split:v1]]{broken');

console.log('notion-split-meta: round-trip assertions passed');
