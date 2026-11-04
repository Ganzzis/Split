const {test}=require('node:test');const A=require('node:assert/strict'),I=require('../items-core.js'),H=require('../history.js');
const people=n=>Array.from({length:n},(_,i)=>({id:`p${i}`,name:`Участник ${i}`,paid:999}));
const expense=(amount='10.00',n=3,extra={})=>({id:'e1',title:'Ужин',amount,payerId:'p0',split:'equal',shares:people(n).map(p=>({personId:p.id,value:''})),...extra});
const state=(expenses=[expense()],n=3)=>({mode:'items',people:people(n).map(p=>({...p,paid:0})),target:'',transfers:[],drafts:{},expenses,payments:[]});
const sum=a=>a.reduce((a,b)=>a+b,0);
function invariant(s){const r=I.calculate(s);A.equal(sum(r.balances),0);A.equal(sum(r.contributions),sum(r.shares));const balances=r.balances.slice();for(const t of r.settlement){A.ok(Number.isSafeInteger(t.amount)&&t.amount>0);balances[t.from]+=t.amount;balances[t.to]-=t.amount;}A.deepEqual(balances,balances.map(()=>0));return r;}
test('equal splits on 2/3/7/100 people preserve one kopeck and deterministic remainders',()=>{
 for(const n of [2,3,7,100])for(const raw of ['0.01','0.02','1.00','10.01','1000000000.00']){
  const e=expense(raw,n),a=I.allocate(e,people(n));A.equal(sum(a.map(s=>s.amount)),Math.round(Number(raw)*100));
  const reversed={...e,shares:e.shares.toReversed()};A.deepEqual(I.allocate(reversed,people(n)),a);invariant(state([e],n));
 }A.deepEqual(I.allocate(expense('0.01'),people(3)).map(s=>s.amount),[1,0,0]);
});
test('fixed shares and payer outside expense participants',()=>{
 const e=expense('10.01',3,{split:'fixed',shares:[{personId:'p1',value:'3.33'},{personId:'p2',value:'6.68'}]});
 const r=invariant(state([e]));A.deepEqual(r.balances,[1001,-333,-668]);A.deepEqual(r.contributions,[1001,0,0]);
});
test('percent largest remainder uses exact products and stable ties at max amount',()=>{
 const e=expense('0.01',3,{split:'percent',shares:[{personId:'p0',value:'33.33'},{personId:'p1',value:'33.33'},{personId:'p2',value:'33.34'}]});
 A.deepEqual(I.allocate(e,people(3)).map(s=>s.amount),[0,0,1]);
 e.amount='1000000000.00';const allocated=I.allocate(e,people(3));A.deepEqual(allocated.map(s=>s.amount),[33330000000,33330000000,33340000000]);invariant(state([e]));
});
test('several payers, simple contributions ignored, completed manual compensation',()=>{
 const s=state([expense('12.00'),expense('3.00',3,{id:'e2',payerId:'p1'})]);s.people.forEach(p=>p.paid=999);const r=invariant(s);A.deepEqual(r.balances,[700,-200,-500]);
 s.payments.push({id:'t1',fromId:'p2',toId:'p0',amount:'2.00'});A.deepEqual(invariant(s).balances,[500,-200,-300]);
});
test('suggested operation idempotent; stale proposals refused; full settlement balances to zero',()=>{
 let s=state();const first=I.proposals(s)[0];s=I.complete(s,first.operationId,'t1');A.throws(()=>I.complete(s,first.operationId,'t2'),/уже проведена/);
 const stale=I.proposals(s)[0];const edited=structuredClone(s);edited.expenses[0].amount='20.00';A.throws(()=>I.complete(edited,stale.operationId,'t3'),/устарело/);
 let i=2;while(I.proposals(s).length)s=I.complete(s,I.proposals(s)[0].operationId,`t${i++}`);A.deepEqual(invariant(s).balances,[0,0,0]);
 A.throws(()=>I.validate({...s,payments:[...s.payments,s.payments[0]]}));
});
test('participant removal is blocked for payer, shares, payments and saved drafts',()=>{
 const s=state();for(const id of ['p0','p1','p2'])A.throws(()=>I.removePerson(s,id));s.people.push({id:'free',name:'Свободный',paid:0});A.equal(I.removePerson(s,'free').people.length,3);
 const d=state([]);d.expenseDraft=expense();A.throws(()=>I.removePerson(d,'p1'));A.throws(()=>I.calculate({...s,people:s.people.slice(1)}));
});
test('invalid money, percentages, shares, identifiers and payment references rejected',()=>{
 for(const raw of ['-1','1.001','NaN','Infinity','1e2','','1000000000.01'])A.throws(()=>I.allocate(expense(raw),people(3)));
 for(const values of [['40','40','19.99'],['50','50','0.01'],['-1','51','50'],['33.333','33.333','33.334']])A.throws(()=>I.allocate(expense('10',3,{split:'percent',shares:values.map((value,i)=>({personId:`p${i}`,value}))}),people(3)));
 A.throws(()=>I.allocate(expense('10',3,{split:'fixed',shares:[{personId:'p0',value:'9'}]}),people(3)));
 for(const e of [expense('10',3,{payerId:'missing'}),expense('10',3,{shares:[]}),expense('10',3,{shares:[{personId:'p1'},{personId:'p1'}]})])A.throws(()=>I.allocate(e,people(3)));
 A.throws(()=>I.calculate({...state(),people:[{name:'No ID'}]}));A.throws(()=>I.calculate({...state(),payments:[{id:'t',fromId:'p0',toId:'missing',amount:'1'}]}));
});
test('independent randomized fixed-share ledger and monetary invariants (1000 cases)',()=>{
 let seed=83017;const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let k=0;k<1000;k++){
  const n=2+rand(9),s=state([],n),expected=Array(n).fill(0);
  for(let j=0;j<1+rand(12);j++){
   const shares=Array.from({length:n},()=>rand(100001)),total=sum(shares),payer=rand(n);
   s.expenses.push(expense((total/100).toFixed(2),n,{id:`e${j}`,payerId:`p${payer}`,split:'fixed',shares:shares.map((v,i)=>({personId:`p${i}`,value:(v/100).toFixed(2)}))}));
   expected[payer]+=total;shares.forEach((v,i)=>expected[i]-=v);
  }
  for(let j=0;j<rand(5);j++){const from=rand(n),to=(from+1+rand(n-1))%n,value=1+rand(5000);s.payments.push({id:`t${j}`,fromId:`p${from}`,toId:`p${to}`,amount:(value/100).toFixed(2)});expected[from]+=value;expected[to]-=value;}
  A.deepEqual(invariant(s).balances,expected);
 }
});
test('schema 5 roundtrip both modes, draft survives reload; old schema 4 remains simple',()=>{
 const data=new Map(),adapter={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},s=new H.Store(adapter);s.load();
 const st=state();st.people.forEach(p=>p.paid=0);st.expenseDraft=expense('-5',3,{id:'draft',split:'percent',shares:[{personId:'p1',value:'wrong'}]});st.paymentDraft={fromId:'p0',toId:'p1',amount:'-7'};
 const r={id:'one',name:'Позиции',updatedAt:'2026-11-05T00:00:00.000Z',state:st};s.put(r);
 A.deepEqual(new H.Store(adapter).load()[0],r);A.deepEqual(H.decodeBackup(H.encodeBackup([r])),[r]);
 const old={...r,id:'old',state:{target:'',people:people(3).map(p=>({...p,paid:0})),transfers:[],drafts:{}}};adapter.setItem(H.KEY,JSON.stringify({version:4,legacyMigrated:true,records:[old]}));
 const legacy=new H.Store(adapter);legacy.load();A.equal(legacy.list()[0].state.mode,undefined);legacy.put(r);A.equal(JSON.parse(adapter.getItem(H.KEY)).version,5);A.equal(JSON.parse(adapter.getItem('split-history-before-v5')).version,4);
 A.deepEqual(H.decodeBackup(JSON.stringify({format:'split-backup',version:4,records:[old]})),[old]);
});
test('mode switch atomically preserves original including drafts; failure never resets original',()=>{
 const map=new Map(),a={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)},s=new H.Store(a);s.load();const old={id:'one',name:'Old',updatedAt:'2026-11-05T00:00:00.000Z',state:{target:'',people:people(3).map(p=>({...p,paid:0})),transfers:[],drafts:{target:'-2'}}};s.put(old);
 const write=a.setItem;a.setItem=()=>{throw Error('quota');};A.throws(()=>s.switchMode('one',state([])));A.deepEqual(s.list(),[old]);a.setItem=write;s.switchMode('one',state([]));A.equal(s.list().length,2);A.deepEqual(s.list()[1].state,old.state);
});
test('schema rejects dangling IDs, duplicate operations and hidden simple money in items mode',()=>{
 const valid=state();const rec=s=>({id:'record',name:'Test',updatedAt:'2026-11-05T00:00:00.000Z',state:s});
 for(const change of [s=>{delete s.mode;},s=>{s.expenses[0].payerId='deleted';},s=>{s.people[0].id='';},s=>{s.expenses[0].shares[0].personId='deleted';},s=>{s.expenses[0].amount='-2';},s=>{s.expenses[0].shares.push(s.expenses[0].shares[0]);},s=>{s.people[0].paid=100;},s=>{s.transfers=[{id:'t',from:0,to:1,amount:100}];},s=>{s.payments=[{id:'t1',fromId:'p0',toId:'p1',amount:'1',operationId:'op1'},{id:'t2',fromId:'p0',toId:'p1',amount:'1',operationId:'op1'}];}]){
  const s=structuredClone(valid);change(s);A.throws(()=>H.decodeBackup(JSON.stringify({format:'split-backup',version:5,records:[rec(s)]})));
 }
});
test('large aggregate debt is split into executable transfers within per-operation money limits',()=>{
 const s=state([expense('1000000000.00',2,{shares:[{personId:'p1',value:''}]}),expense('1000000000.00',2,{id:'e2',shares:[{personId:'p1',value:''}]})],2);
 const proposals=I.proposals(s);A.equal(proposals.length,2);A.equal(sum(proposals.map(p=>p.amount)),200000000000);let next=I.complete(s,proposals[0].operationId,'t1');next=I.complete(next,I.proposals(next)[0].operationId,'t2');A.deepEqual(I.calculate(next).balances,[0,0]);
});
