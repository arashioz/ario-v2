// Exercise the actual queue with persistent storage and simulated network failures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');
const { webcrypto } = require('node:crypto');
const values = new Map();
let quotaFull = false;
const localStorage = {
  get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null,
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => { if (quotaFull) throw Error('QuotaExceeded'); values.set(key, value); },
  removeItem: (key) => values.delete(key),
};
const navigator = { onLine: false };
const window = new EventTarget();
let owner = 'alice';
let outcome = 'success';
const calls = [];
const api = { post: async (url, data, config) => {
  calls.push({ url, data, config });
  if (outcome === 'timeout') throw { code: 'ECONNABORTED' };
  if (outcome === 'validation') throw { response: { status: 400, data: { message: 'موجودی کافی نیست' } } };
  if (outcome === 'unauthorized') throw { response: { status: 401, data: { message: 'ورود مجدد' } } };
  return { data: url === '/invoices' ? { invoiceNumber: 'SAL-1', _id: 'invoice-1' } : { number: 'PRE-1', _id: 'proforma-1' } };
} };
function queue() {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('frontend/src/services/offlineOrders.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, localStorage, navigator, window, Event, crypto: webcrypto,
    require: (id) => id === './api' ? { api } : { currentOwner: () => owner, isConnectionError: (e) => !e.response },
  });
  return module.exports;
}
const payload = { customerName: 'مشتری', items: [{ productId: 'p', quantity: 2 }], finalAmount: 200 };
async function main() {
  let q = queue();
  const first = q.enqueueOrder('invoice', payload);
  assert.equal(await q.sendOrder(first), null);
  assert.equal(calls.length, 0);
  assert.equal(q.pendingOrders().length, 1);
  assert.equal(q.reserveQueuedStock([{ _id: 'p', stock: 5 }])[0].stock, 3);
  q = queue(); // Restart the app, same device storage.
  assert.equal(q.pendingOrders()[0].id, first.id);
  navigator.onLine = true; outcome = 'timeout';
  await q.syncOrders();
  assert.equal(q.pendingOrders().length, 1, 'Lost response must preserve the original request');
  const sentKey = calls[0].config.headers['Idempotency-Key'];
  outcome = 'success';
  const [a, b] = await Promise.all([q.syncOrders(), q.syncOrders()]);
  assert.equal(a.count, 1); assert.equal(b.count, 1);
  assert.equal(q.pendingOrders().length, 0);
  assert.equal(calls.length, 2, 'Parallel sync shares one in-flight send');
  assert.equal(calls[1].config.headers['Idempotency-Key'], sentKey, 'Retry uses identical idempotency key');

  q.enqueueOrder('proforma', payload);
  assert.equal((await q.syncOrders()).labels[0], 'PRE-1');
  q.enqueueOrder('invoice', payload);
  owner = 'bob';
  assert.equal(q.pendingOrders().length, 0);
  const before = calls.length;
  await q.syncOrders(); assert.equal(calls.length, before, 'Never sync another user’s queue');
  owner = 'alice'; outcome = 'unauthorized';
  await q.syncOrders(); assert.equal(q.pendingOrders().length, 1);
  assert.equal(q.pendingOrders()[0].review, false, 'An expired login may retry after sign-in');
  outcome = 'validation'; await q.syncOrders();
  assert.equal(q.pendingOrders()[0].review, true);
  const failedCount = calls.length;
  await q.syncOrders(); assert.equal(calls.length, failedCount, 'Rejected orders need review, not repeated writes');
  assert.equal(q.pendingOrders().length, 1, 'Never delete an unconfirmed order');

  const second = q.enqueueOrder('invoice', payload);
  assert.notEqual(second.id, first.id);
  assert.equal(q.pendingOrders().length, 2, 'Each order has its own storage entry');
  quotaFull = true;
  assert.throws(() => q.enqueueOrder('invoice', payload), /فضای ذخیره/);
  assert.equal(q.pendingOrders().length, 2, 'Quota failure must not pretend the order was saved');
  console.log('PASS: offline persistence, restart, reconnect, lost response, duplicate sync, account isolation, validation/auth errors, and storage quota.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
