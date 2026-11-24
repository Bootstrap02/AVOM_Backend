// Runs under Jest (global test) and under plain `node --test`.
const test = global.test || require('node:test');
const assert = require('node:assert/strict');
const { purgeAsset } = require('../src/services/expiry.service');

const now = new Date('2027-01-01T00:00:00Z');
const storageOk = () => ({ calls: [], async deleteAsset(a) { this.calls.push(a); return { ok: true, raw: 'ok' }; } });
const storageFail = { async deleteAsset() { throw new Error('network down'); } };
const storageRefuse = { async deleteAsset() { return { ok: false, raw: 'error' }; } };

test('deletes an existing asset once and records success', async () => {
  const s = storageOk();
  const update = await purgeAsset(s, { publicId: 'avom/lectures/a', deletionStatus: 'none' }, { resourceType: 'video', deliveryType: 'authenticated', now });
  assert.equal(update.deletionStatus, 'deleted');
  assert.deepEqual(s.calls[0], { publicId: 'avom/lectures/a', resourceType: 'video', deliveryType: 'authenticated' });
});

test('is idempotent: an already-deleted asset is never deleted again', async () => {
  const s = storageOk();
  assert.equal(await purgeAsset(s, { publicId: 'x', deletionStatus: 'deleted' }, { resourceType: 'video', now }), null);
  assert.equal(s.calls.length, 0);
});

test('skips records with no asset identifier', async () => {
  const s = storageOk();
  assert.equal(await purgeAsset(s, { deletionStatus: 'none' }, { resourceType: 'video', now }), null);
  assert.equal(await purgeAsset(s, undefined, { resourceType: 'video', now }), null);
  assert.equal(s.calls.length, 0);
});

test('a thrown error becomes a recorded failure, never an exception', async () => {
  const update = await purgeAsset(storageFail, { publicId: 'x', deletionStatus: 'none', deletionAttempts: 1 }, { resourceType: 'video', now });
  assert.equal(update.deletionStatus, 'failed');
  assert.equal(update.deletionAttempts, 2);
  assert.match(update.lastError, /network down/);
});

test('a provider refusal is recorded as a failure, not as deleted', async () => {
  const update = await purgeAsset(storageRefuse, { publicId: 'x', deletionStatus: 'none' }, { resourceType: 'video', now });
  assert.equal(update.deletionStatus, 'failed');
});

test('stops retrying after the attempt limit so admins can intervene', async () => {
  const s = storageOk();
  assert.equal(await purgeAsset(s, { publicId: 'x', deletionStatus: 'failed', deletionAttempts: 5 }, { resourceType: 'video', now }), null);
  assert.equal(s.calls.length, 0);
});
