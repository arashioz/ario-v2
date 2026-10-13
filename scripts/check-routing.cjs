// Regression check for Ionic outlet discovery. Run: node scripts/check-routing.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');
const React = require('../frontend/node_modules/react');
const router = require('../frontend/node_modules/react-router-dom');
const component = (name) => Object.assign(() => null, { displayName: name });
const ionic = Object.fromEntries(['IonTabs', 'IonRouterOutlet', 'IonTabBar', 'IonTabButton', 'IonIcon', 'IonLabel', 'IonRoute'].map((name) => [name, component(name)]));
const loaders = { PageLoader: component('PageLoader'), PageLoadBoundary: component('PageLoadBoundary') };
const moduleUnderTest = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('frontend/src/pages/TabsLayout.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
vm.runInThisContext(`(function(require, module, exports) { ${code}\n})`)((id) => {
  if (id === 'react') return React;
  if (id === 'react-router-dom') return router;
  if (id === '@ionic/react') return ionic;
  if (id === 'ionicons/icons') return {};
  if (id === '../components/PageLoader') return loaders;
  throw new Error(`Unexpected eager page import: ${id}`);
}, moduleUnderTest, moduleUnderTest.exports);

// Exercise the installed Ionic implementation, not a reimplementation of its traversal.
const source = fs.readFileSync('frontend/node_modules/@ionic/react-router/dist/index.js', 'utf8');
const start = source.indexOf('const getRoutesChildren =');
const end = source.indexOf('\n/**', source.indexOf('const extractRouteChildren =', start));
assert.ok(start >= 0 && end > start, 'Ionic route-discovery implementation was not found');
const extract = new Function('React', 'Routes', 'Route', 'IonRoute', `${source.slice(start, end)}\nreturn extractRouteChildren;`)(React, router.Routes, router.Route, ionic.IonRoute);
const layout = moduleUnderTest.exports.TabsLayout();
const outlet = React.Children.toArray(layout.props.children).find((child) => child.type === ionic.IonRouterOutlet);
assert.ok(outlet, 'Tab layout must contain an Ionic router outlet');
const routes = extract(outlet.props.children);
assert.ok(routes.length >= 25, 'Ionic must discover every app route');
for (const path of ['/tabs/home', '/tabs/pos', '/tabs/customers', '/products', '/workshop']) {
  const route = routes.find((r) => r.props.path === path);
  assert.ok(route, `Ionic cannot discover ${path}`);
  assert.equal(route.props.element.type, loaders.PageLoadBoundary);
  assert.equal(route.props.element.props.children.type, React.Suspense);
}
// This was the regression: wrapping Routes makes every route invisible to Ionic.
const broken = React.createElement(loaders.PageLoadBoundary, null, outlet.props.children);
assert.equal(extract(broken).length, 0);
console.log(`PASS: Ionic discovers ${routes.length} routes; lazy loading stays inside route elements.`);
