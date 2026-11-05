const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

test('build ships local shell resources byte-for-byte and removes stale output', () => {
 execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
 fs.writeFileSync(path.join(root, 'www', 'stale.txt'), 'old asset');
 execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
 assert.equal(fs.existsSync(path.join(root, 'www', 'stale.txt')), false);
 const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
 const sw = fs.readFileSync(path.join(root, 'www/sw.js'), 'utf8');
 const resources = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m => m[1]);
 resources.push(...[...sw.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]));
 for (const resource of new Set(resources)) {
  assert.ok(!/^[a-z]+:/i.test(resource), resource);
  assert.deepEqual(fs.readFileSync(path.join(root, 'www', resource)), fs.readFileSync(path.join(root, resource)), resource);
 }
 for (const privatePath of ['tests', '.git', 'node_modules', 'package.json', 'capacitor.config.json']) {
  assert.equal(fs.existsSync(path.join(root, 'www', privatePath)), false);
 }
 const config = require('../capacitor.config.json');
 assert.equal(config.webDir, 'www');
 assert.equal(config.server, undefined, 'native releases must use bundled assets, not a remote server');
});

test('native shell does not register service worker; browser keeps PWA registration', () => {
 for (const native of [true, false]) {
  const events = [];
  const context = {
   window: { Capacitor: { isNativePlatform: () => native }, isSecureContext: true,
    addEventListener: name => events.push(name) },
   navigator: { serviceWorker: { addEventListener() {} } },
   document: { querySelector: () => ({ addEventListener() {} }), addEventListener() {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pwa.js'), 'utf8'), context);
  assert.equal(events.includes('load'), !native);
 }
});
