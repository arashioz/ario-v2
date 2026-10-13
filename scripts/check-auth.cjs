// Run from the repository root: node scripts/check-auth.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');
const axios = require('../frontend/node_modules/axios/dist/node/axios.cjs');

const values = new Map();
const localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const window = new EventTarget();
function load(file, dependencies) {
  const source = fs.readFileSync(file, 'utf8').replace('import.meta.env.VITE_API_URL', "'/api'");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, localStorage, window, Event, atob,
    require: (id) => {
      assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
      return dependencies[id];
    },
  });
  return module.exports;
}
const apiModule = load('frontend/src/services/api.ts', {
  axios,
  './pageActivity': load('frontend/src/services/pageActivity.ts', {}),
  './confirmPassword': { askPassword: () => { throw Error('Unexpected password prompt'); } },
});

// A small hook harness exercises the actual provider's session transitions.
function provider(api) {
  const state = [];
  let cursor = 0;
  let mounted = false;
  let effect;
  const React = {
    createContext: () => ({ Provider: 'Provider' }),
    createElement: (type, props) => ({ type, props }),
    useState: (initial) => {
      const index = cursor++;
      if (!mounted) state[index] = initial;
      return [state[index], (value) => { state[index] = value; }];
    },
    useEffect: (callback) => { if (!mounted) effect = callback; },
  };
  const { AuthProvider } = load('frontend/src/context/AuthContext.tsx', {
    react: React, '../services/api': { ...apiModule, api }, '../services/offlineCache': load('frontend/src/services/offlineCache.ts', { './api': apiModule }),
  });
  const render = () => {
    cursor = 0;
    return AuthProvider({ children: null }).props.value;
  };
  const initial = render();
  mounted = true;
  const cleanup = effect();
  return { initial, render, cleanup };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const user = { id: '1', username: 'tester', fullName: 'Tester', role: 'admin' };
const save = (token = 'saved-token') => {
  values.clear();
  localStorage.setItem('ario_token', token);
  localStorage.setItem('ario_user', JSON.stringify(user));
};

async function main() {
  values.clear();
  let h = provider({ get: () => { throw Error('No token should skip profile'); } });
  assert.equal(h.render().isAuthenticated, false);
  assert.equal(h.render().isLoading, false);
  h.cleanup();

  save();
  let finishProfile;
  h = provider({ get: () => new Promise((resolve) => { finishProfile = resolve; }) });
  assert.equal(h.initial.isAuthenticated, false, 'Saved data alone must not grant access');
  assert.equal(h.render().isLoading, true);
  finishProfile({ data: user });
  await flush();
  assert.equal(h.render().isAuthenticated, true, 'A valid saved session should remain usable');
  window.dispatchEvent(new Event(apiModule.AUTH_EXPIRED_EVENT));
  assert.equal(h.render().isAuthenticated, false, 'Expiry must update the rendered auth state');
  h.cleanup();

  save();
  h = provider({ get: () => Promise.reject(Error('Server unavailable')) });
  await flush();
  assert.equal(h.render().isAuthenticated, false);
  assert.equal(localStorage.getItem('ario_token'), null);
  h.cleanup();

  save();
  h = provider({
    get: () => new Promise((resolve) => { finishProfile = resolve; }),
    post: () => Promise.resolve(),
  });
  h.render().logout();
  finishProfile({ data: user });
  await flush();
  assert.equal(h.render().user, null, 'A late profile must not restore a logged-out session');
  h.cleanup();

  const jwt = (exp) => `header.${Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url')}.signature`;
  const validOfflineToken = jwt(Math.floor(Date.now() / 1000) + 3600);
  save(validOfflineToken);
  localStorage.setItem('ario_verified_token', validOfflineToken);
  h = provider({ get: () => Promise.reject(Error('Offline')) });
  await flush();
  assert.equal(h.render().isAuthenticated, true, 'Previously verified sessions can open offline');
  h.cleanup();
  save(jwt(Math.floor(Date.now() / 1000) - 10));
  localStorage.setItem('ario_verified_token', localStorage.getItem('ario_token'));
  h = provider({ get: () => Promise.reject(Error('Offline')) });
  await flush();
  assert.equal(h.render().isAuthenticated, false, 'Expired sessions do not open offline');
  h.cleanup();

  let expiryEvents = 0;
  window.addEventListener(apiModule.AUTH_EXPIRED_EVENT, () => expiryEvents++);
  save();
  apiModule.api.defaults.adapter = async (config) => {
    throw { config, response: { status: 401 } };
  };
  await assert.rejects(apiModule.api.get('/products'));
  assert.equal(localStorage.getItem('ario_token'), null);
  assert.equal(expiryEvents, 1);

  save('old-token');
  apiModule.api.defaults.adapter = async (config) => {
    save('new-token');
    throw { config, response: { status: 401 } };
  };
  await assert.rejects(apiModule.api.get('/products'));
  assert.equal(localStorage.getItem('ario_token'), 'new-token', 'Old 401 must preserve new login');
  assert.equal(expiryEvents, 1);

  const listeners = {};
  let cacheReads = 0;
  vm.runInNewContext(fs.readFileSync('frontend/public/sw.js', 'utf8'), {
    self: { addEventListener: (name, listener) => { listeners[name] = listener; } },
    URL,
    caches: { match: () => { cacheReads++; return { cached: true }; } },
    fetch: async (_request, options) => {
      assert.equal(options.cache, 'no-store');
      throw Error('Offline');
    },
  });
  let response;
  listeners.fetch({
    request: { method: 'GET', url: 'http://localhost:3000/api/auth/profile' },
    respondWith: (promise) => { response = promise; },
  });
  await assert.rejects(response, /Offline/);
  assert.equal(cacheReads, 0, 'Offline auth must never fall back to a cached profile');
  console.log('PASS: session validation, expiry, logout races, stale 401, and uncached auth.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
