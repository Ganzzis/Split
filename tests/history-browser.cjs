const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/split-test-tools/node_modules/playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 let count=0;const check=async(name,fn)=>{await fn();console.log('PASS:',name);count++;};
 try {
 const ctx=await browser.newContext({viewport:{width:390,height:844}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const base=process.env.SPLIT_URL||'http://127.0.0.1:8000/';await p.goto(base);
 const data=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('split-history-v4')));
 const upload=async value=>{await p.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});await p.waitForFunction(()=>{const t=document.querySelector('#import-preview').textContent;return t && t!=='Чтение файла…';});};
 const open=()=>p.getByRole('button',{name:'Открыть',exact:true}).first().click();
 let original,backup;
 await check('home, create, edit, rename and reload',async()=>{
  assert.ok(await p.locator('#home-screen').isVisible());assert.equal((await data()).records.length,0);
  await p.locator('#create-calculation').click();await p.locator('.person-paid').first().fill('1200,50');await p.locator('.person-paid').nth(1).fill('-7');
  await p.locator('#rename-current').click();await p.locator('#rename-name').fill('<img src=x onerror=window.xss=1>');await p.locator('#rename-form button[type=submit]').click();
  original=(await data()).records[0];assert.ok(original.id);assert.ok(Date.parse(original.updatedAt));
  await p.reload();assert.ok(await p.locator('#home-screen').isVisible());assert.equal(await p.locator('#history-list img').count(),0);assert.equal(await p.evaluate(()=>window.xss),undefined);
  await open();assert.equal(await p.locator('.person-paid').first().inputValue(),'1200.5');assert.equal(await p.locator('.person-paid').nth(1).inputValue(),'-7');
 });
 await check('individual and full export are downloadable and preserve invalid draft',async()=>{
  let download=await Promise.all([p.waitForEvent('download'),p.locator('#export-current').click()]);backup=JSON.parse(await fs.readFile(await download[0].path(),'utf8'));
  assert.equal(backup.records.length,1);assert.equal(backup.records[0].state.drafts[Object.keys(backup.records[0].state.drafts)[0]],'-7');
  await p.locator('#back-history').click();download=await Promise.all([p.waitForEvent('download'),p.locator('#export-history').click()]);
  assert.deepEqual(JSON.parse(await fs.readFile(await download[0].path(),'utf8')).records,backup.records);
 });
 await check('duplicate gets unique ID; cancel deletion leaves both; confirm deletes only selected',async()=>{
  await p.getByRole('button',{name:'Дублировать',exact:true}).click();const values=(await data()).records;
  assert.equal(values.length,2);assert.notEqual(values[0].id,values[1].id);assert.deepEqual(values[0].state,values[1].state);
  await p.getByRole('button',{name:'Удалить',exact:true}).first().click();await p.locator('#delete-dialog [data-close-dialog]').click();assert.equal((await data()).records.length,2);
  await p.locator('#history-list article').filter({has:p.getByRole('heading',{name:original.name,exact:true})}).getByRole('button',{name:'Удалить',exact:true}).click();await p.locator('#confirm-delete').click();assert.equal((await data()).records.length,1);
 });
 await check('invalid file and cancelled preview do not write history',async()=>{
  const before=await data();await upload('{broken');assert.ok(await p.locator('#confirm-import').isDisabled());await p.locator('#import-dialog [data-close-dialog]').click();
  await upload(backup);assert.match(await p.locator('#import-preview').innerText(),/Добавится:/);assert.deepEqual(await data(),before);
  assert.equal(await p.locator('#import-preview img').count(),0);await p.locator('#import-dialog [data-close-dialog]').click();assert.deepEqual(await data(),before);
 });
 await check('confirmed restore and repeat import preserve existing calculations',async()=>{
  await upload(backup);await p.locator('#confirm-import').click();assert.equal((await data()).records.length,2);
  await upload(backup);assert.match(await p.locator('#import-preview').innerText(),/Добавится: 0/);await p.locator('#confirm-import').click();assert.equal((await data()).records.length,2);
  await p.reload();assert.equal(await p.locator('#history-list article').count(),2);
 });
 await check('same ID with changed content restores a separate copy, repeat skips it',async()=>{
  const changed=structuredClone(backup);changed.records[0].name='Конфликтующий файл';
  await upload(changed);assert.match(await p.locator('#import-preview').innerText(),/будут копиями\): 1/);await p.locator('#confirm-import').click();
  assert.equal((await data()).records.length,3);assert.equal(new Set((await data()).records.map(r=>r.id)).size,3);
  await upload(changed);await p.locator('#confirm-import').click();assert.equal((await data()).records.length,3);
 });
 await check('history responsive in both themes',async()=>{
  for(const width of [320,390,768,1280]) for(const theme of ['dark','light']){
   await p.setViewportSize({width,height:844});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }

 });
 await check('corrupt storage recovery requires confirmation and preserves exact original',async()=>{
  await p.evaluate(()=>localStorage.setItem('split-history-v4','{damaged-original'));await p.reload();
  const dl=await Promise.all([p.waitForEvent('download'),p.locator('#backup-btn').click()]);assert.equal(await fs.readFile(await dl[0].path(),'utf8'),'{damaged-original');
  await upload(backup);assert.match(await p.locator('#import-preview').innerText(),/оригинал будет сохранён/);
  assert.equal(await p.evaluate(()=>localStorage.getItem('split-history-v4')),'{damaged-original');
  await p.locator('#confirm-import').click();assert.equal((await data()).records.length,1);
  assert.ok(await p.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('split-recovery-') && localStorage.getItem(k)==='{damaged-original')));
  await open();assert.equal(await p.locator('.person-paid').first().inputValue(),'1200.5');
 });
 assert.deepEqual(errors,[]);await ctx.close();
 const ax=await browser.newContext({bypassCSP:true,viewport:{width:390,height:844}}),ap=await ax.newPage();await ap.goto(base);
 await ap.addScriptTag({path:require.resolve(process.env.AXE_MODULE||'/tmp/split-test-tools/node_modules/axe-core')});
 const scan=async()=>{await ap.evaluate(()=>new Promise(requestAnimationFrame));await ap.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));const violations=await ap.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));assert.deepEqual(violations,[]);};
 await check('axe home and import dialog, dark/light',async()=>{
  for(const theme of ['dark','light']) {await ap.evaluate(t=>document.documentElement.dataset.theme=t,theme);await scan();}
  await ap.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await ap.waitForFunction(()=>!document.querySelector('#confirm-import').disabled);
  for(const theme of ['dark','light']) {await ap.evaluate(t=>document.documentElement.dataset.theme=t,theme);await scan();}
 });
 await ax.close();console.log(`${count} history browser groups passed`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
