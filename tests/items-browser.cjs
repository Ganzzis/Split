const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/split-test-tools/node_modules/playwright-core');const A=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});let count=0;const check=async(name,fn)=>{await fn();console.log('PASS:',name);count++;};
try{
const ctx=await browser.newContext({viewport:{width:390,height:844}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(process.env.SPLIT_URL||'http://127.0.0.1:8000/');
const record=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('split-history-v4')).records[0]);
const open=()=>p.getByRole('button',{name:'Открыть',exact:true}).first().click();
const form=async(title,amount)=>{await p.locator('#add-expense').click();await p.locator('#expense-title').fill(title);await p.locator('#expense-amount').fill(amount);};
let backup;
await check('create items mode; participants; equal split and immediate preview',async()=>{
 await p.locator('#new-mode').selectOption('items');await p.locator('#create-calculation').click();A.equal((await record()).state.mode,'items');
 await p.locator('#add-person').click();for(const [i,name]of ['Анна','Борис','Вера'].entries())await p.locator('.person-name').nth(i).fill(name);
 A.ok(await p.locator('#simple-target').isHidden());A.equal(await p.locator('.person-paid:visible').count(),0);
 await form('Ужин','10,01');A.match(await p.locator('#total-paid').innerText(),/10,01/);await p.locator('#save-expense').click();A.equal((await record()).state.expenses.length,1);
 A.match(await p.locator('#balances-list').innerText(),/6,67/);A.match(await p.locator('#balances-list').innerText(),/3,34/);
});
await check('invalid expense draft survives home navigation, export and reload',async()=>{
 await form('<img src=x onerror=window.xss=1>','-5');A.ok(await p.locator('#save-expense').isDisabled());A.match(await p.locator('#total-paid').innerText(),/10,01/);
 await p.locator('#back-history').click();await open();A.equal(await p.locator('#expense-amount').inputValue(),'-5');await p.reload();await open();A.equal(await p.locator('#expense-amount').inputValue(),'-5');
 const dl=await Promise.all([p.waitForEvent('download'),p.locator('#export-current').click()]);const b=JSON.parse(await fs.readFile(await dl[0].path(),'utf8'));A.equal(b.records[0].state.expenseDraft.amount,'-5');
 await p.locator('#expense-amount').fill('0.01');await p.locator('#save-expense').click();A.equal(await p.locator('#expenses-list img').count(),0);A.equal(await p.evaluate(()=>window.xss),undefined);
});
await check('fixed amounts with payer outside recipients; invalid total blocks save',async()=>{
 await form('Такси','5.01');const ids=(await record()).state.people.map(x=>x.id);await p.locator('#expense-split').selectOption('fixed');
 await p.locator(`#expense-shares input[data-person-id="${ids[0]}"]`).uncheck();await p.getByRole('textbox',{name:'Сумма: Борис',exact:true}).fill('2');await p.getByRole('textbox',{name:'Сумма: Вера',exact:true}).fill('3');A.ok(await p.locator('#save-expense').isDisabled());
 await p.getByRole('textbox',{name:'Сумма: Вера',exact:true}).fill('3.01');await p.locator('#save-expense').click();A.equal((await record()).state.expenses[2].shares.length,2);
});
await check('percent sum requires 100; copy/edit/delete expenses',async()=>{
 await form('Покупки','1.01');await p.locator('#expense-split').selectOption('percent');
 for(const [name,value]of [['Анна','33.33'],['Борис','33.33'],['Вера','33.33']])await p.getByRole('textbox',{name:`Процент: ${name}`,exact:true}).fill(value);
 A.ok(await p.locator('#save-expense').isDisabled());await p.getByRole('textbox',{name:'Процент: Вера',exact:true}).fill('33.34');await p.locator('#save-expense').click();
 await p.getByRole('button',{name:'Копировать расход',exact:true}).last().click();A.equal((await record()).state.expenses.length,5);
 await p.getByRole('button',{name:'Изменить расход',exact:true}).last().click();await p.locator('#expense-title').fill('Копия покупок');await p.locator('#save-expense').click();
 await p.getByRole('button',{name:'Удалить расход',exact:true}).last().click();A.equal((await record()).state.expenses.length,4);
});
await check('linked participant cannot be deleted; unlinked participant can',async()=>{
 await p.locator('.person-row').first().getByRole('button',{name:'Удалить участника'}).click();A.equal((await record()).state.people.length,3);
 await p.locator('#add-person').click();A.equal((await record()).state.people.length,4);await p.locator('.person-row').last().getByRole('button',{name:'Удалить участника'}).click();A.equal((await record()).state.people.length,3);
});
await check('manual payment draft survives reload; repeated proposal is not conducted twice',async()=>{
 await p.locator('#payments-section summary').click();const ids=(await record()).state.people.map(x=>x.id);await p.locator('#payment-from').selectOption(ids[1]);await p.locator('#payment-to').selectOption(ids[0]);await p.locator('#payment-amount').fill('-3');
 await p.reload();await open();await p.locator('#payments-section summary').click();A.equal(await p.locator('#payment-amount').inputValue(),'-3');
 await p.locator('#payment-form button[type=submit]').click();A.equal((await record()).state.payments.length,0);await p.locator('#payment-amount').fill('0.01');await p.locator('#payment-form button[type=submit]').click();A.equal((await record()).state.payments.length,1);
 const button=p.getByRole('button',{name:'Отметить выполненным',exact:true}).first();await button.evaluate(b=>{b.click();b.click();});A.equal((await record()).state.payments.length,2);
 const dl=await Promise.all([p.waitForEvent('download'),p.locator('#export-current').click()]);backup=JSON.parse(await fs.readFile(await dl[0].path(),'utf8'));A.equal(backup.version,5);
});
await check('mode switch confirmation keeps an exact original copy, reload and import work',async()=>{
 const before=await record();await p.locator('#switch-mode').click();await p.locator('#mode-dialog [data-close-dialog]').click();A.equal((await record()).state.mode,'items');
 await p.locator('#switch-mode').click();await p.locator('#confirm-mode').click();const records=await p.evaluate(()=>JSON.parse(localStorage.getItem('split-history-v4')).records);A.equal(records.length,2);A.deepEqual(records[1].state,before.state);A.notEqual(records[0].state.mode,'items');
 await p.locator('#back-history').click();await p.locator('#import-file').setInputFiles({name:'items.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await p.waitForFunction(()=>!document.querySelector('#confirm-import').disabled);await p.locator('#confirm-import').click();
 A.equal(await p.locator('#history-list article').count(),3);await p.reload();A.equal(await p.locator('#history-list article').count(),3);
});
await check('mobile widths and both themes; offline item editor reload',async()=>{
 const card=p.locator('#history-list article').filter({has:p.locator('.mode-badge',{hasText:'По позициям'})}).first();await card.getByRole('button',{name:'Открыть',exact:true}).click();
 await p.locator('#add-expense').click();await p.locator('#expense-split').selectOption('percent');
 for(const width of [320,375,390,412,768,1280])for(const theme of ['dark','light']){await p.setViewportSize({width,height:844});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);A.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));A.ok(await p.locator('.person-name').first().evaluate(n=>n.getBoundingClientRect().width>=120));}
 await p.locator('#cancel-expense').click();await p.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
 await ctx.setOffline(true);await p.reload();await p.locator('#history-list article').filter({has:p.locator('.mode-badge',{hasText:'По позициям'})}).first().getByRole('button',{name:'Открыть',exact:true}).click();A.ok(await p.locator('#items-panel').isVisible());A.ok((await record()).state);await ctx.setOffline(false);
});
A.deepEqual(errors,[]);await ctx.close();
const axe=await browser.newContext({bypassCSP:true,viewport:{width:390,height:844}}),ap=await axe.newPage();await ap.goto(process.env.SPLIT_URL||'http://127.0.0.1:8000/');await ap.locator('#new-mode').selectOption('items');await ap.locator('#create-calculation').click();await ap.locator('#add-expense').click();await ap.locator('#expense-title').fill('Тест');await ap.locator('#expense-amount').fill('1.01');await ap.locator('#expense-split').selectOption('percent');// Stabilize static contrast scans; functional scenarios above retain all motion and CSP.
await ap.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});await ap.addScriptTag({path:require.resolve(process.env.AXE_MODULE||'/tmp/split-test-tools/node_modules/axe-core')});
await check('item editor axe dark/light at mobile/desktop widths',async()=>{for(const width of [390,1280])for(const theme of ['dark','light']){await ap.setViewportSize({width,height:844});await ap.evaluate(t=>document.documentElement.dataset.theme=t,theme);const violations=await ap.evaluate(async()=>(await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));A.deepEqual(violations,[]);console.log(`axe ${width}/${theme}: no violations`);await ap.screenshot({path:`/tmp/split-items-${width}-${theme}.png`,fullPage:true});}});await axe.close();console.log(`${count} item browser groups passed`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
