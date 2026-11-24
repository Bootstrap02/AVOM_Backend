// Runs under Jest (global test) and under plain `node --test`.
const test = global.test || require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const wa = require('../src/integrations/whatsapp');

test('accepts a correctly signed webhook body and rejects tampering', () => {
  const body = Buffer.from(JSON.stringify({ hello: 'world' }));
  const sig = `sha256=${crypto.createHmac('sha256', 'secret').update(body).digest('hex')}`;
  assert.equal(wa.isValidSignature(body, sig, 'secret'), true);
  assert.equal(wa.isValidSignature(Buffer.from('{"hello":"evil"}'), sig, 'secret'), false);
  assert.equal(wa.isValidSignature(body, undefined, 'secret'), false);
  assert.equal(wa.isValidSignature(body, sig, ''), false);
});

test('extracts text messages and sender names from the nested payload', () => {
  const payload = { entry: [{ changes: [{ value: {
    contacts: [{ wa_id: '2348012345678', profile: { name: 'Grace' } }],
    messages: [{ id: 'wamid.1', from: '2348012345678', type: 'text', text: { body: 'Hello, my quiz will not open' } }, { id: 'wamid.2', from: '2348012345678', type: 'image' }],
  } }] }] };
  const out = wa.extractMessages(payload);
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].id, out[0].from, out[0].name, out[0].text], ['wamid.1', '2348012345678', 'Grace', 'Hello, my quiz will not open']);
  assert.match(out[1].text, /image/);
  assert.deepEqual(wa.extractMessages({}), []);
});
