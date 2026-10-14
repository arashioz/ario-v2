const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');
function load(file, dependencies, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, ...globals, require: (id) => {
    assert.ok(id in dependencies, `Unexpected dependency ${id}`); return dependencies[id];
  } });
  return module.exports;
}
const format = load('frontend/src/lib/format.ts', {});
let accepted = false;
const prompts = [];
const { confirmSaleLoss } = load('frontend/src/lib/saleLoss.ts', { './format': format }, {
  window: { confirm: (message) => { prompts.push(message); return accepted; } },
});
const line = { name: 'نبات', quantity: 2, unitPrice: 80, unitCost: 100 };
assert.equal(confirmSaleLoss([line]), false, 'Cancel must stop submission');
assert.ok(prompts.at(-1).includes(format.formatToman(40)));
assert.ok(prompts.at(-1).includes('تاریخ فاکتور'));
accepted = true;
assert.equal(confirmSaleLoss([line]), true, 'Confirmation must allow a losing sale');
assert.equal(line.unitPrice, 80, 'Confirmation must not raise the entered price');
const count = prompts.length;
assert.equal(confirmSaleLoss([{ ...line, unitPrice: 100 }]), true);
assert.equal(prompts.length, count, 'Break-even does not need confirmation');
assert.equal(confirmSaleLoss([{ ...line, unitPrice: 110 }], 30), true);
assert.ok(prompts.at(-1).includes(format.formatToman(10)), 'Discounts can turn a sale into a loss');
confirmSaleLoss([{ ...line, unitPrice: 0 }]);
assert.ok(prompts.at(-1).includes(format.formatToman(200)), 'Zero-price sales must also warn');
confirmSaleLoss([line], 0, true);
assert.ok(prompts.at(-1).includes('قیمت کارخانهٔ همین فاکتور'));
assert.ok(!prompts.at(-1).includes('بهای خرید فعلی'));
confirmSaleLoss([{ ...line, quantity: 0.5, unitPrice: 240, unitCost: 300 }]);
assert.ok(prompts.at(-1).includes(format.formatToman(30)), 'Fractional stock-unit quantities retain the correct loss');
confirmSaleLoss([line, { ...line, name: 'سودده', unitPrice: 500 }]);
assert.ok(prompts.at(-1).includes('نبات'), 'Profitable items must not hide a losing item');
assert.ok(!prompts.at(-1).includes('سودده'));

// Actual quantity sheet: a losing price shows a warning but can enter the cart.
const state = [], dependencies = [], effects = [];
let cursor = 0;
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState: (initial) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (v) => state[i] = v]; },
  useRef: () => ({ current: null }),
  useEffect: (effect, deps) => { const i = cursor++; if (!dependencies[i] || deps.some((d, j) => d !== dependencies[i][j])) { dependencies[i] = deps; effects.push(effect); } },
};
const { QuantitySheet } = load('frontend/src/components/pos/QuantitySheet.tsx', {
  react: React, 'lucide-react': {}, '../ui/Sheet': { Sheet: 'Sheet' }, '../ui/AmountInput': { AmountInput: 'AmountInput' },
  '../../services/settings.service': { SALE_TYPE_LABELS: { retail: 'تکی' } }, '../../lib/format': format,
  './cart': load('frontend/src/components/pos/cart.ts', {}),
}, { setTimeout: () => {} });
let confirmed;
const props = { product: { _id: 'p', name: 'نبات', unit: 'بسته', weightPerUnitKg: 3, buyPrice: 300, sellPrice: 240, stock: 10 }, saleType: 'retail', onConfirm: (row) => confirmed = row };
const render = () => { cursor = 0; const tree = QuantitySheet(props); effects.splice(0).forEach((e) => e()); return tree; };
render(); const tree = render();
const nodes = (n) => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
const add = nodes(tree.props.footer).find((n) => n.type === 'button');
assert.equal(add.props.disabled, false);
add.props.onClick();
assert.equal(confirmed.unitPrice, 240);
assert.equal(confirmed.quantity, 1);
assert.ok(JSON.stringify(tree).includes('تأیید فروش با ضرر'));
console.log('PASS: losing price enters cart, warning and confirm/cancel, unchanged price, discount, zero-price, factory and fractional quantities.');
