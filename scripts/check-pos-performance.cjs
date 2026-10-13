// Run with: node scripts/check-pos-performance.cjs
// Exercises the same pure helpers used by the sales UI; no browser/database required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const ts = require('../frontend/node_modules/typescript');
const modules = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '..', relative);
  if (modules.has(file)) return modules.get(file);
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireLocal = (id) => load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), id + '.ts')));
  vm.runInThisContext(`(function(require, module, exports) { ${js}\n})`, { filename: file })(requireLocal, module, module.exports);
  modules.set(file, module.exports);
  return module.exports;
}
const format = load('frontend/src/lib/format.ts');
const { sectionsOf, productSearchIndex, filterSections } = load('frontend/src/components/pos/product-catalog.ts');

for (const value of [0, 1, -5000, 125.578, 999999999, null, undefined]) {
  for (const digits of [0, 1, 2, 3, 6]) {
    assert.equal(format.num(value, digits), (value ?? 0).toLocaleString('fa-IR', { maximumFractionDigits: digits, minimumFractionDigits: 0 }));
  }
}
assert.equal(format.formatToman(1234.6), '۱٬۲۳۵ تومان');
assert.equal(format.searchKey('كيك ۱۲۳'), 'کیک 123');
const products = [
  { _id: 'a', name: 'نبات زعفرانی', category: 'نبات', subcategory: 'بسته', barcode: '۱۲۳۴' },
  { _id: 'b', name: 'نبات سفید', category: 'نبات', subcategory: 'فله', barcode: '5678' },
  { _id: 'c', name: 'كيك', category: 'خوراکی', subcategory: '' },
  { _id: 'd', name: 'چای', category: '', subcategory: '' },
  { _id: 'e', name: 'نبات چوبی', category: 'نبات', subcategory: 'بسته' },
];
const original = JSON.stringify(products);
const all = sectionsOf(products, ['نبات', 'خوراکی'], { نبات: ['فله', 'بسته'] }, ['e', 'a']);
assert.deepEqual(all.map((s) => s.name), ['نبات', 'خوراکی', 'سایر']);
assert.deepEqual(all[0].groups.map((g) => g.name), ['فله', 'بسته']);
assert.deepEqual(all[0].groups[1].products.map((p) => p._id), ['e', 'a']);
const index = productSearchIndex(products);
assert.equal(filterSections(all, index, '1234', null)[0].count, 1);
assert.equal(filterSections(all, index, 'کیک', null)[0].groups[0].products[0]._id, 'c');
assert.equal(filterSections(all, index, '', 'نبات')[0].count, 3);
assert.equal(filterSections(all, index, 'چای', 'نبات').length, 0);
assert.equal(filterSections(all, index, 'ناشناخته', null).length, 0);
assert.equal(filterSections(all, index, '', null), all);
assert.equal(JSON.stringify(products), original);
assert.equal(all[0].count, 3); // Filtering must not mutate full catalog counts.

const values = Array.from({ length: 20000 }, (_, i) => i * 127.25);
function timed(fn) { const start = performance.now(); fn(); return performance.now() - start; }
const before = timed(() => values.forEach((n) => n.toLocaleString('fa-IR', { maximumFractionDigits: 2, minimumFractionDigits: 0 })));
const after = timed(() => values.forEach((n) => format.num(n, 2)));
const catalog = Array.from({ length: 3000 }, (_, i) => ({ ...products[i % products.length], _id: String(i), name: `کالای ${i}` }));
const prepared = sectionsOf(catalog);
const search = productSearchIndex(catalog);
const queries = ['ک', 'کا', 'کال', 'کالا', 'کالای', 'کالای 1', 'کالای 12', 'کالای 123'];
const oldFilterMs = timed(() => queries.forEach((query) => { const q = format.searchKey(query); sectionsOf(catalog.filter((p) => format.searchKey(`${p.name} ${p.category} ${p.subcategory || ''} ${p.barcode || ''}`).includes(q))); }));
const newFilterMs = timed(() => queries.forEach((q) => filterSections(prepared, search, q, null)));
console.log('PASS: Persian formatting, category/product ordering, search, counts and immutable catalog.');
console.log(JSON.stringify({ syntheticBenchmark: true, format20000: { beforeMs: +before.toFixed(1), afterMs: +after.toFixed(1) }, search3000Products8Queries: { beforeMs: +oldFilterMs.toFixed(1), afterMs: +newFilterMs.toFixed(1) } }, null, 2));
