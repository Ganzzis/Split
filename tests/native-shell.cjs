// Native bridge contract + real WebView DOM in Chromium. Does not emulate OS sheets.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
 try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(require('./native-bridge-fixture.cjs'), {platform:'android'});
  const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.SPLIT_URL || 'http://127.0.0.1:8000/');
  await page.waitForSelector('.native-tools');
  assert.equal(await page.evaluate(() => navigator.serviceWorker.controller), null);
  await page.locator('#create-calculation').click();
  await page.locator('.person-paid').first().fill('1000.01');
  await page.locator('.mobile-dock [data-view="results"]').click();
  await page.locator('#share-results').click(); await page.locator('#share-image').waitFor({ state: 'visible' });
  for (const [width, height] of [[320,568],[390,844],[844,390],[390,420]]) {
   await page.setViewportSize({ width, height });
   await page.waitForFunction(() => parseFloat(document.documentElement.style.getPropertyValue('--native-vh')) <= innerHeight + 1);
   await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
   const bounds = await page.locator('#share-dialog').boundingBox();
   assert.ok(bounds.y >= -1 && bounds.y + bounds.height <= height + 1, JSON.stringify(bounds));
   for (const selector of ['#share-system', '[aria-label="Закрыть обмен"]']) {
    const box = await page.locator(selector).boundingBox(); assert.ok(box.y >= 0 && box.y + box.height <= height + 1, selector);
   }
   await page.locator('.native-sheet-content').evaluate(n => n.scrollTop = n.scrollHeight);
   const button = await page.locator('#share-system').boundingBox(); assert.ok(button.y + button.height <= height + 1);
  }
  console.log('PASS: native WebView sheet bounded at narrow, landscape and keyboard-sized viewports; actions remain visible');
  await page.locator('#share-system').click();
  await page.waitForFunction(() => calls.some(c => c.plugin === 'Share' && c.method === 'share'));
  const delivery = await page.evaluate(() => calls.find(c => c.plugin === 'Share' && c.method === 'share').data);
  assert.match(delivery.text, /1\s*000,01/); assert.ok(delivery.files.length > 0);
  const shareCount = await page.evaluate(() => calls.filter(c => c.plugin === 'Share' && c.method === 'share').length);
  await page.evaluate(() => { const original = window.fetch; window.fetch = (url, ...args) => { if (String(url).startsWith('blob:')) throw Error('Blob fetch blocked'); return original(url,...args); }; });
  await page.locator('#share-download-png').click();
  await page.waitForFunction(count => calls.filter(c => c.plugin === 'Share' && c.method === 'share').length > count, shareCount);
  assert.equal(await page.evaluate(() => calls.filter(c => c.plugin === 'Share' && c.method === 'share').at(-1).data.files.length), 1);
  assert.match(await page.evaluate(() => calls.find(c => c.plugin === 'Filesystem' && c.method === 'writeFile').data.data), /^iVBORw0KGgo/);
  console.log('PASS: selected PNG delivery works with blob fetch blocked; no CSP-dependent refetch');
  await page.evaluate(() => listeners['Keyboard.keyboardWillShow']({ keyboardHeight: 300 }));
  assert.equal(await page.locator('.mobile-dock').isVisible(), false);
  await page.evaluate(() => listeners['App.backButton']({}));
  assert.equal(await page.locator('#share-dialog').evaluate(n => n.open), true);
  assert.ok(await page.evaluate(() => calls.some(c => c.plugin === 'Keyboard' && c.method === 'hide')));
  await page.evaluate(() => listeners['Keyboard.keyboardWillHide']({}));
  await page.evaluate(() => listeners['App.backButton']({}));
  await page.locator('#share-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => calls.some(c => c.plugin === 'App' && c.method === 'exitApp')), false);
  await page.evaluate(() => listeners['App.backButton']({}));
  assert.equal(await page.locator('body').getAttribute('data-view'), 'calculation');
  await page.evaluate(() => listeners['App.backButton']({}));
  assert.equal(await page.locator('body').getAttribute('data-view'), 'history');
  console.log('PASS: native Share adapter receives PNG and text; Back dismisses dialog then navigates without exiting');
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage));
  await page.locator('#export-history').click(); await page.waitForFunction(() => exportedJSON !== null);
  await page.locator('.native-tools button').filter({ hasText: 'Резервная копия на устройстве' }).click();
  await page.waitForFunction(() => prefs['split-native-backup-current']);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storageBefore);
  await page.locator('.native-tools button').filter({ hasText: 'Восстановить копию с устройства' }).click();
  await page.locator('#confirm-import:not(:disabled)').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#confirm-import').isDisabled(), false);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storageBefore);
  await page.evaluate(() => listeners['App.backButton']({})); await page.locator('#import-dialog').waitFor({ state: 'hidden' });
  await page.evaluate(() => { window.importCancelled = true; });
  await page.locator('.import-label').click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#import-dialog').evaluate(n => n.open), false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.native-tools button').filter({ hasText: 'Эффекты' }).click();
  assert.ok(await page.locator('html').evaluate(n => n.classList.contains('low-effects') && n.classList.contains('reduced-motion')));
  assert.deepEqual(errors, []);
  console.log('PASS: JSON export uses document provider; opt-in backup and preview do not mutate history; import cancellation and reduced effects work');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
