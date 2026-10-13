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
const activityModule = load('frontend/src/services/pageActivity.ts', {});
const { pageActivity } = activityModule;
const { api } = load('frontend/src/services/api.ts', {
  axios, './pageActivity': activityModule, './confirmPassword': {},
}, { localStorage: { getItem: () => null }, window: new EventTarget(), Event });
let location = { key: 'first', pathname: '/products', search: '', hash: '' };
let state;
let dependencies;
let effect;
let cleanup;
let rerender;
let bootRemovals = 0;
let nextTimer = 1;
const timers = new Map();
const schedule = (callback) => { const id = nextTimer++; timers.set(id, callback); return id; };
const cancel = (id) => timers.delete(id);
const React = {
  createElement: (type, props) => ({ type, props }),
  useState: (initial) => {
    state ??= initial;
    return [state, (next) => { state = next; rerender = true; }];
  },
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
  useLayoutEffect: (callback, deps) => {
    if (!dependencies || deps.some((dep, i) => !Object.is(dep, dependencies[i]))) {
      dependencies = deps;
      effect = callback;
    }
  },
};
const { NavigationSplash } = load('frontend/src/components/NavigationSplash.tsx', {
  react: React,
  'react-router-dom': { useLocation: () => location },
  '../services/pageActivity': activityModule,
  './SplashScreen': { SplashScreen: 'SplashScreen' },
}, {
  window: { setTimeout: schedule }, clearTimeout: cancel,
  requestAnimationFrame: schedule, cancelAnimationFrame: cancel,
  document: { getElementById: () => ({ remove: () => bootRemovals++ }) },
});
function render() {
  let tree;
  do { rerender = false; tree = NavigationSplash(); } while (rerender);
  if (effect) { cleanup?.(); const run = effect; effect = null; cleanup = run(); }
  return tree;
}
function paint() {
  for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function main() {
  const lazyDone = pageActivity.begin();
  assert.ok(render(), 'Initial route shows the full splash');
  paint(); paint();
  assert.ok(render(), 'An unresolved page must keep the splash visible');
  let finish;
  api.defaults.adapter = (config) => new Promise((resolve) => { finish = () => resolve({ config, data: [], status: 200 }); });
  const request = api.get('/products');
  await flush();
  lazyDone(); lazyDone();
  assert.equal(pageActivity.getSnapshot(), 1, 'A repeated release cannot end another request');
  assert.ok(render());
  finish(); await request;
  assert.equal(pageActivity.getSnapshot(), 0);
  render(); paint(); paint();
  assert.equal(render(), null, 'Ready data dismisses the splash');
  assert.equal(bootRemovals, 1, 'Static boot stays until the app is ready');

  location = { ...location, key: 'next', pathname: '/workshop' };
  assert.ok(render(), 'Even cached page navigation starts with a splash');
  const done = pageActivity.begin();
  render(); paint(); paint();
  assert.ok(render(), 'New work cancels a previously scheduled dismissal');
  done(); render(); paint(); paint();
  assert.equal(render(), null);

  location = { ...location, key: 'back', pathname: '/products' };
  api.defaults.adapter = async (config) => { throw { config, response: { status: 503 } }; };
  const failed = api.get('/products').catch(() => undefined);
  render(); await failed;
  assert.equal(pageActivity.getSnapshot(), 0, 'Failures release the loader');
  render(); paint(); paint();
  assert.equal(render(), null, 'Failures reveal the page error/retry UI');

  location = { ...location, key: 'slow', pathname: '/workshop' };
  assert.ok(render());
  location = { ...location, key: 'back', pathname: '/products' };
  assert.ok(render(), 'Returning during a transition must start a fresh splash');
  paint(); paint(); assert.equal(render(), null);
  const html = fs.readFileSync('frontend/index.html', 'utf8');
  assert.ok(html.indexOf('id="boot"') < html.indexOf('id="root"'), 'Boot survives React mounting');
  console.log('PASS: cold start, lazy pages, pending data, cached navigation, quick back, errors, and boot handoff.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
