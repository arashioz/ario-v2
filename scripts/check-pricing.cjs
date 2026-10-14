// Component behavior checks without a browser: real TSX, controlled hooks and API responses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');
function load(file, deps) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: (id) => {
    assert.ok(id in deps, `Unexpected dependency ${id}`); return deps[id];
  } });
  return module.exports;
}
let active;
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState: (initial) => {
    const h = active, i = h.cursor++;
    if (!(i in h.values)) h.values[i] = typeof initial === 'function' ? initial() : initial;
    return [h.values[i], (next) => { h.values[i] = typeof next === 'function' ? next(h.values[i]) : next; }];
  },
  useEffect: (callback, deps) => {
    const h = active, i = h.cursor++;
    if (!h.deps[i] || deps.some((d, j) => !Object.is(d, h.deps[i][j]))) {
      h.deps[i] = deps; h.effects.push(() => { h.cleanups[i]?.(); h.cleanups[i] = callback(); });
    }
  },
  useCallback: (callback, deps) => {
    const h = active, i = h.cursor++;
    if (!h.deps[i] || deps.some((d, j) => !Object.is(d, h.deps[i][j]))) {
      h.deps[i] = deps; h.values[i] = callback;
    }
    return h.values[i];
  },
};
function mount(component, props) {
  const h = { values: [], deps: [], cursor: 0, effects: [], cleanups: [] };
  return { render() { active = h; h.cursor = 0; const tree = component(props); h.effects.splice(0).forEach((f) => f()); return tree; } };
}
const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = (tree) => tree == null || typeof tree === 'boolean' ? '' : typeof tree !== 'object' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
const button = (tree, label) => nodes(tree).find((n) => n.type === 'button' && text(n).includes(label));
const flush = () => new Promise((resolve) => setImmediate(resolve));
const format = load('frontend/src/lib/format.ts', {});
const amounts = load('frontend/src/components/ui/AmountInput.tsx', { react: React, '../../lib/format': format });
const notifications = [];
const common = { react: React, '../../lib/format': format, '../ui/AmountInput': amounts,
  '../SplashScreen': { SplashScreen: 'SplashScreen' },
  '../../context/NotificationContext': { useNotification: () => ({ showNotification: (n) => notifications.push(n) }) },
};
const calls = [];
let fail = false;
const sourceRow = { productId: 'p', name: 'نبات', category: 'قند', unit: 'بسته', weightPerUnitKg: 3, lastPurchasePrice: 30000, price: 30000, overridePrice: null };
const invoiceOpens = [];
const factoryModule = load('frontend/src/components/pricing/FactoryPricesPanel.tsx', {
  ...common,
  '../../services/invoices.service': { apiErrorMessage: (_, fallback) => fallback, invoicesService: {
    factoryPrices: async () => [sourceRow],
    getAll: async (params) => { assert.equal(params.fulfillment, 'factory'); assert.equal(params.type, 'sale'); return [{ _id: 'sale', invoiceNumber: 'SAL-1', customerName: 'مشتری' }]; },
  } },
  '../../services/products.service': { productsService: { setFactoryPrice: async (id, price) => { calls.push({ id, price }); if (fail) throw Error('offline'); } } },
  '../reports/useInvoiceOpener': { useInvoiceOpener: () => ({ open: (id) => invoiceOpens.push(id), modal: null }) },
});
async function main() {
  const panel = mount(factoryModule.FactoryPricesPanel, {});
  panel.render(); await flush();
  const tree = panel.render();
  button(tree, 'مشاهده و ویرایش').props.onClick();
  assert.deepEqual(invoiceOpens, ['sale']);
  const rowElement = nodes(tree).find((n) => n.props.row?.productId === 'p');
  const row = mount(rowElement.type, rowElement.props);
  let rowTree = row.render();
  let input = nodes(rowTree).find((n) => n.type === amounts.MoneyTextInput);
  assert.equal(input.props.value, '30000', 'Latest purchase should initialize the editable factory price');
  input.props.onChange('36000'); rowTree = row.render();
  await button(rowTree, 'ذخیره قیمت کارخانه').props.onClick(); await flush();
  assert.deepEqual(calls.at(-1), { id: 'p', price: 36000 });
  const saved = nodes(panel.render()).find((n) => n.props.row?.productId === 'p');
  assert.equal(saved.props.row.price, 36000);
  assert.equal(saved.props.row.lastPurchasePrice, 30000, 'An override must not rewrite purchase history');
  const savedRow = mount(saved.type, saved.props);
  await button(savedRow.render(), 'استفاده از آخرین خرید').props.onClick(); await flush();
  assert.equal(calls.at(-1).price, null);
  assert.equal(nodes(panel.render()).find((n) => n.props.row?.productId === 'p').props.row.price, 30000);
  fail = true;
  assert.equal(await saved.props.onSave('p', 99000), false);
  assert.equal(nodes(panel.render()).find((n) => n.props.row?.productId === 'p').props.row.price, 30000, 'A failed save must retain the confirmed price');

  let entered;
  const zero = amounts.MoneyTextInput({ value: '0', onChange: (v) => entered = v, allowZero: true });
  assert.equal(zero.props.value, '۰');
  zero.props.onChange({ target: { value: '۰' } }); assert.equal(entered, '0');
  zero.props.onChange({ target: { value: '' } }); assert.equal(entered, '', 'Empty and explicit zero are distinct');

  const product = { _id: 'p', name: 'نبات', unit: 'بسته', category: 'قند', weightPerUnitKg: 3, autoPricing: true, commissionAmount: 2000, commissionUnit: 'kg', commissionPercent: 10 };
  const updates = [];
  const pricing = load('frontend/src/components/pricing/ProductPricingPanel.tsx', {
    ...common,
    '../../services/products.service': { productsService: {
      getProducts: async () => [product], update: async (id, payload) => { updates.push({ id, payload }); return { ...product, ...payload, sellPrice: 39600 }; },
    } },
    '../../services/settings.service': { useSettings: () => ({ categoryBasePrices: [{ category: 'قند', amount: 10000, unit: 'kg' }] }), settingsService: { get: async () => ({}) } },
    '../products/CategoryPricingPanel': { CategoryPricingPanel: 'CategoryPricingPanel' },
    '../pos/cart': load('frontend/src/components/pos/cart.ts', {}),
    '../../services/invoices.service': { apiErrorMessage: (_, fallback) => fallback },
  });
  const productPanel = mount(pricing.ProductPricingPanel, { onSaved: () => {} });
  productPanel.render(); await flush();
  const productElement = nodes(productPanel.render()).find((n) => n.props.product?._id === 'p');
  const productRow = mount(productElement.type, productElement.props);
  let pricingTree = productRow.render();
  assert.ok(text(pricingTree).includes(format.formatToman(39600)), '3 kg × (10000 base + 2000 fee) × 1.10 must be 39600');
  await button(pricingTree, 'ذخیره کارمزد و سود').props.onClick(); await flush();
  assert.equal(updates.at(-1).payload.commissionPercent, 10);
  assert.equal(updates.at(-1).payload.commissionUnit, 'kg');
  nodes(pricingTree).find((n) => n.type === 'select').props.onChange({ target: { value: 'unit' } });
  pricingTree = productRow.render();
  assert.ok(text(pricingTree).includes(format.formatToman(35200)), 'A package fee is added once before profit');
  nodes(pricingTree).find((n) => n.type === 'input' && n.props.type === 'number').props.onChange({ target: { value: '-1' } });
  assert.equal(button(productRow.render(), 'ذخیره کارمزد و سود').props.disabled, true);
  console.log('PASS: factory latest price, editable override/reset, failure retention, invoice opener, explicit zero, package/kg commission and profit preview/payload.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
