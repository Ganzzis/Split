// WKWebView bridge contract in Chromium; actual UIKit/SwiftUI visuals are tested in Simulator.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const context = await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(require('./native-bridge-fixture.cjs'), {platform:'ios'});
  const page = await context.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SPLIT_URL || 'http://127.0.0.1:8000/');
  await page.waitForFunction(()=>document.documentElement.classList.contains('ios-native-chrome'));
  assert.equal(await page.locator('.topbar').isVisible(),false); assert.equal(await page.locator('.mobile-dock').isVisible(),false);
  assert.equal(await page.evaluate(()=>chromeState.view),'history');
  const create = async response => page.evaluate(response=>{window.sheetResponse=response;listeners['SplitChrome.action']({action:'create'});},response);
  await create({confirmed:false,value:''}); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('split-history-v4')).records.length),0);
  await create({confirmed:true,value:'Путешествие с друзьями — очень длинное название расчёта'});
  await page.waitForFunction(()=>chromeState.view==='calculation' && chromeState.title.includes('Путешествие'));
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('split-history-v4')).records[0]);
  await page.evaluate(()=>listeners['SplitChrome.action']({action:'navigate',view:'results'}));
  await page.waitForFunction(()=>chromeState.view==='results');
  await page.evaluate(()=>listeners['SplitChrome.action']({action:'theme'}));
  await page.waitForFunction(()=>chromeState.dark===(document.documentElement.dataset.theme==='dark'));
  await page.evaluate(()=>{window.deferSheet=true;listeners['SplitChrome.action']({action:'rename'});});
  await page.waitForFunction(()=>typeof resolveSheet==='function' && chromeState.modal);
  assert.equal(await page.locator('#rename-dialog').evaluate(n=>n.open),true); assert.equal(await page.locator('#rename-dialog').isVisible(),false);
  await page.evaluate(()=>resolveSheet({confirmed:true,value:'Новое имя'}));
  await page.waitForFunction(()=>chromeState.title==='Новое имя' && !chromeState.modal);
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('split-history-v4')).records[0]);
  assert.deepEqual(after.state,before.state); assert.equal(after.id,before.id); assert.equal(after.name,'Новое имя');
  await page.evaluate(()=>listeners['SplitChrome.action']({action:'navigate',view:'calculation'}));
  await page.waitForFunction(()=>chromeState.view==='calculation');
  // Dynamically added, stacked and removed dialogs must all hold native chrome hidden.
  await page.evaluate(()=>{ for(const id of ['dynamic-one','dynamic-two']) { const d=document.createElement('dialog');d.id=id;document.body.append(d);d.showModal(); } });
  await page.waitForFunction(()=>chromeState.modal);
  await page.evaluate(()=>document.getElementById('dynamic-two').remove());
  await page.waitForTimeout(100); assert.equal(await page.evaluate(()=>chromeState.modal),true);
  await page.evaluate(()=>document.getElementById('dynamic-one').close());
  await page.waitForFunction(()=>!chromeState.modal);
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Quota','QuotaExceededError');};});
  await page.locator('.person-paid').first().fill('10');
  await page.evaluate(()=>listeners['SplitChrome.action']({action:'back'}));
  assert.equal(await page.locator('body').getAttribute('data-view'),'calculation');
  assert.equal(await page.evaluate(()=>chromeState.view),'calculation');
  assert.deepEqual(errors,[]);
  console.log('PASS: one navigation authority; native-only chrome after handshake; create cancel; native rename preserves money; quota guard rejects Back; theme and modal state synchronize');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
