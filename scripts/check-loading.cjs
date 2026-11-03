// Run from the repository root: node scripts/check-loading.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');
const axios = require('../frontend/node_modules/axios/dist/node/axios.cjs');
function load(file, dependencies, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8').replace('import.meta.env.VITE_API_URL', "'/api'"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, ...globals,
    require: (id) => { assert.ok(id in dependencies, `Unexpected dependency ${id}`); return dependencies[id]; },
  });
  return module.exports;
}
const { api } = load('frontend/src/services/api.ts', {
  axios, './confirmPassword': {},
}, { localStorage: { getItem: () => null }, window: new EventTarget(), Event });
let state;
let dependencies;
let effect;
let cleanup;
let rerender;
let bootRemovals = 0;
const React = {
  createElement: (type, props) => ({ type, props }),
  useState: (initial) => {
    state ??= initial;
    return [state, (next) => { state = typeof next === 'function' ? next(state) : next; rerender = true; }];
  },
  useLayoutEffect: (callback, deps) => {
    if (!dependencies || deps.some((dep, i) => !Object.is(dep, dependencies[i]))) {
      dependencies = deps;
      effect = callback;
    }
  },
};
const { NavigationSplash } = load('frontend/src/components/NavigationSplash.tsx', {
  react: React,
  './SplashScreen': { SplashScreen: 'SplashScreen' },
}, {
  document: { getElementById: () => ({ remove: () => bootRemovals++ }) },
});
function render() {
  let tree;
  do { rerender = false; tree = NavigationSplash(); } while (rerender);
  if (effect) { cleanup?.(); const run = effect; effect = null; cleanup = run(); }
  return tree;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function main() {
  assert.ok(render(), 'The first paint still shows the splash');
  assert.equal(render(), null, 'The splash leaves as soon as the app is mounted');
  assert.equal(bootRemovals, 1, 'The static boot screen is removed once');
  assert.equal(render(), null, 'Moving to another page does not bring the splash back');

  let finish;
  api.defaults.adapter = (config) => new Promise((resolve) => { finish = () => resolve({ config, data: [], status: 200 }); });
  const request = api.get('/products');
  await flush();
  finish();
  await request;
  assert.equal(render(), null, 'A request in flight does not cover the page');

  const html = fs.readFileSync('frontend/index.html', 'utf8');
  assert.ok(html.indexOf('id="boot"') < html.indexOf('id="root"'), 'Boot survives React mounting');
  const loader = fs.readFileSync('frontend/src/components/PageLoader.tsx', 'utf8');
  assert.match(loader, /export const PageLoader[^\n]*=[\s\S]*SplashScreen/, 'A missing chunk uses the splash, not a blank page');
  assert.ok(!loader.includes('pageActivity'), 'Chunk loading must not hold later pages');
  console.log('PASS: boot splash, instant later routes, and requests that do not cover the page.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
