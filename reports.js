/* Local result snapshots, text and PNG. No fetch, HTML rendering, or persisted state. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('./items-core.js'));
 else root.SplitReports=factory(root.SplitCore,root.SplitItems);
})(globalThis,function(core,items){
 'use strict';
 const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim();
 const money=cents=>new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100)+' ₽';
 function build(record,{unsaved=false}={}){
  const state=record.state,byItems=state.mode==='items';
  // Deliberately use committed expenses, never the editor's live draft preview.
  const result=byItems?items.calculate(state):core.calculate(state);
  const names=state.people.map((p,i)=>clean(p.name)||`Участник ${i+1}`);
  const warnings=[];
  if(Object.keys(state.drafts||{}).length)warnings.push('Невалидные черновики сумм исключены. Показаны последние корректные значения.');
  if(state.expenseDraft)warnings.push('Открытый черновик расхода исключён. Показаны только сохранённые позиции.');
  if(state.paymentDraft)warnings.push('Черновик перевода исключён. Учтены только проведённые компенсации.');
  if(unsaved)warnings.push('Есть ошибка хранения: отчёт отражает текущие корректные данные, которые могли не сохраниться на устройстве.');
  const transfers=result.settlement.map(t=>({from:names[t.from],to:names[t.to],amount:t.amount}));
  for(const flow of result.cashFlows){if(flow.kind==='pot-in')transfers.push({from:names[flow.from],to:'Общая касса',amount:flow.amount});else transfers.push({from:'Общая касса',to:names[flow.to],amount:flow.amount});}
  return {title:clean(record.name)||'Расчёт',mode:byItems?'По позициям':'Простой',totalPaid:result.totalPaid,target:result.target,
   participants:names.map((name,i)=>({name,paid:result.contributions[i],share:result.shares[i],balance:result.balances[i]})),transfers,warnings};
 }
 function text(report){
  return ['Split · '+report.title,...report.warnings.map(w=>'⚠ '+w),'Режим: '+report.mode,`Оплачено: ${money(report.totalPaid)}`,`Расходы: ${money(report.target)}`,'','Баланс участников:',
   ...report.participants.map(p=>`${p.name}: оплатил ${money(p.paid)}, доля ${money(p.share)}, баланс ${p.balance>0?'+':''}${money(p.balance)}`),'','Необходимые переводы:',
   ...(report.transfers.length?report.transfers.map(t=>`${t.from} → ${t.to}: ${money(t.amount)}`):['Взаиморасчёты не нужны.']), '','Уже выполненные компенсации учтены. Положительный баланс — к получению, отрицательный — к оплате.'].join('\n');
 }
 function wrap(ctx,value,width){
  const lines=[];let line='';
  const segments=word=>typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('ru',{granularity:'grapheme'}).segment(word)].map(s=>s.segment):Array.from(word);
  for(const word of String(value).split(/\s+/).filter(Boolean)){
   const candidate=line?line+' '+word:word;
   if(ctx.measureText(candidate).width<=width){line=candidate;continue;}
   if(line){lines.push(line);line='';}
   if(ctx.measureText(word).width<=width){line=word;continue;}
   for(const char of segments(word)){if(line && ctx.measureText(line+char).width>width){lines.push(line);line=char;}else line+=char;}
  }
  if(line)lines.push(line);return lines.length?lines:[''];
 }
 function round(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
 async function png(report,theme='dark',doc=globalThis.document){
  if(!doc)throw Error('Для PNG нужен браузер с Canvas.');
  const canvas=doc.createElement('canvas');canvas.width=1080;canvas.height=1800;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas недоступен. Используйте текст отчёта.');
  const font=(size,weight=400)=>{ctx.font=`${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;};
  font(48,700);const title=wrap(ctx,report.title,916);font(26);const warnings=report.warnings.flatMap(w=>wrap(ctx,'⚠ '+w,916));
  const top=380+title.length*58+warnings.length*36+(warnings.length?30:0);
  font(32,600);const rows=report.transfers.map(t=>({lines:wrap(ctx,`${t.from} → ${t.to}`,884),amount:money(t.amount)}));
  if(!rows.length)rows.push({lines:['Взаиморасчёты не нужны'],amount:''});
  const pages=[];let page=[],used=top;
  for(const row of rows){const height=48+row.lines.length*42+(row.amount?58:0);if(page.length && used+height>1660){pages.push(page);page=[];used=top;}page.push({...row,height});used+=height+16;}if(page.length)pages.push(page);
  const palette=theme==='light'?{bg:'#f3f0f9',panel:'#ffffff',text:'#292438',muted:'#60576e',accent:'#6946ad',row:'#f3effb',warn:'#86501d'}:{bg:'#12131b',panel:'#20212d',text:'#f5f1fd',muted:'#c1b9d1',accent:'#ccbbff',row:'#2b273c',warn:'#f4c58f'};
  const output=[];
  for(let index=0;index<pages.length;index++){
   const height=Math.min(1800,Math.max(720,top+pages[index].reduce((sum,r)=>sum+r.height+16,0)+110));canvas.width=1080;canvas.height=height;
   ctx.fillStyle=palette.bg;ctx.fillRect(0,0,1080,height);const gradient=ctx.createLinearGradient(0,0,1080,height);gradient.addColorStop(0,theme==='light'?'#e8dff9':'#29213f');gradient.addColorStop(1,palette.bg);ctx.fillStyle=gradient;ctx.fillRect(0,0,1080,height);
   ctx.fillStyle=palette.panel;round(ctx,32,32,1016,height-64,32);ctx.fill();
   ctx.fillStyle=palette.accent;font(30,700);ctx.fillText('split.  /  '+report.mode,82,100);ctx.fillStyle=palette.text;font(48,700);let y=166;for(const line of title){ctx.fillText(line,82,y);y+=58;}
   font(26);ctx.fillStyle=palette.warn;for(const line of warnings){ctx.fillText(line,82,y+10);y+=36;}if(warnings.length)y+=30;
   ctx.fillStyle=palette.muted;font(24);ctx.fillText('ОПЛАЧЕНО',82,y+24);ctx.fillStyle=palette.text;font(48,700);ctx.fillText(money(report.totalPaid),82,y+86);
   ctx.fillStyle=palette.muted;font(27);ctx.fillText(`Расходы: ${money(report.target)} · Участников: ${report.participants.length}`,82,y+136);y=top;
   ctx.fillStyle=palette.muted;font(22,600);ctx.fillText('НЕОБХОДИМЫЕ ПЕРЕВОДЫ',82,top-42);
   for(const row of pages[index]){ctx.fillStyle=palette.row;round(ctx,66,y-18,948,row.height,22);ctx.fill();ctx.fillStyle=palette.text;font(32,600);let textY=y+28;for(const line of row.lines){ctx.fillText(line,98,textY);textY+=42;}if(row.amount){font(38,700);ctx.fillStyle=palette.accent;ctx.fillText(row.amount,98,textY+14);}y+=row.height+16;}
   ctx.fillStyle=palette.muted;font(22);ctx.fillText(`Выполненные компенсации учтены · ${index+1}/${pages.length}`,82,height-62);
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Не удалось создать PNG. Используйте текст отчёта.')),'image/png'));
   output.push({blob,width:1080,height,page:index+1,total:pages.length});
  }
  canvas.width=canvas.height=1;return output;
 }
 function webAdapter(nav=globalThis.navigator){
  return {supported:()=>typeof nav?.share==='function',async share({title,text,files=[]}){
   if(typeof nav?.share!=='function')return {status:'fallback',reason:'Системный обмен недоступен. Выберите копирование или PNG.'};
   const data={title,text};let withFiles=false;
   if(files.length && typeof nav.canShare==='function'){try{if(nav.canShare({files})){data.files=files;withFiles=true;}}catch(_){} }
   try{await nav.share(data);return {status:'shared',withFiles};}catch(e){return e?.name==='AbortError'?{status:'cancelled'}:{status:'fallback',reason:'Системный обмен не выполнен. Используйте текст или PNG.'};}
  }};
 }
 let nativeAdapter=null;
 function setAdapter(adapter){nativeAdapter=adapter&&typeof adapter.share==='function'?adapter:null;}
 function adapter(){return nativeAdapter||webAdapter();}
 return {build,text,money,wrap,png,webAdapter,setAdapter,adapter};
});
