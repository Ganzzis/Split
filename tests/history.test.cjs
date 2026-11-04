const {test}=require('node:test');
const assert=require('node:assert/strict');
const H=require('../history.js');
const memory=()=>{const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
const state=()=>({target:'',people:[{id:'p1',name:'Анна',paid:1000},{id:'p2',name:'Борис',paid:0}],transfers:[{id:'t1',from:1,to:0,amount:200}],drafts:{'paid-p2':'-5'}});
const record=(id='one')=>({id,name:'Поездка',updatedAt:'2026-11-04T12:00:00.000Z',state:state()});
test('migration retains original bytes, drafts, balances and stable record ID after restart',()=>{
 const a=memory(),raw=JSON.stringify(state());a.setItem(H.LEGACY,raw);const s=new H.Store(a);s.load();
 assert.equal(a.getItem(H.LEGACY),raw);assert.equal(s.list().length,1);assert.deepEqual(s.list()[0].state,state());
 const before=s.list();new H.Store(a).load();assert.deepEqual(new H.Store(a).load(),before);
 assert.deepEqual(require('../core.js').calculate(before[0].state),require('../core.js').calculate(state()));
});
test('migration appends to an existing history exactly once',()=>{
 const a=memory();a.setItem(H.KEY,JSON.stringify({version:4,legacyMigrated:false,records:[record()]}));a.setItem(H.LEGACY,JSON.stringify(state()));
 assert.equal(new H.Store(a).load().length,2);assert.equal(new H.Store(a).load().length,2);
});
test('older people/transfers keys migrate without deletion and receiver zero survives',()=>{
 const a=memory();a.setItem('people',JSON.stringify(state().people));a.setItem('transfers',JSON.stringify(state().transfers));
 const s=new H.Store(a);s.load();assert.equal(s.list()[0].state.transfers[0].to,0);assert.ok(a.getItem('people'));
});
test('CRUD and exports persist exact state across store instances',()=>{
 const a=memory(),s=new H.Store(a);s.load();s.put(record());const changed={...record(),name:'Ужин',updatedAt:H.now()};s.put(changed);
 s.put({...changed,id:'copy'});assert.equal(new H.Store(a).load().length,2);
 const single=H.decodeBackup(H.encodeBackup([changed]));assert.deepEqual(single,[changed]);
 assert.deepEqual(H.decodeBackup(H.encodeBackup(s.list())),s.list());
 s.remove('one');assert.equal(new H.Store(a).load()[0].id,'copy');
});
test('preview does not write; confirmation merges; repeated import is idempotent',()=>{
 const a=memory(),s=new H.Store(a);s.load();s.put(record());const raw=a.getItem(H.KEY);
 const incoming=H.decodeBackup(H.encodeBackup([{...record(),name:'Конфликт'},record('two')]));
 const preview=H.planImport(s.list(),incoming);assert.equal(a.getItem(H.KEY),raw);assert.equal(preview.conflicts.length,1);
 s.restore(incoming);assert.equal(s.list().length,3);assert.equal(s.list()[0].name,'Поездка');
 assert.equal(s.restore(incoming).added.length,0);assert.equal(new H.Store(a).load().length,3);
});
test('corrupt and unsupported backups rejected atomically including invalid amounts/IDs/dates',()=>{
 for(const raw of ['{broken','null','{"format":"split-backup","version":5,"records":[]}',JSON.stringify({format:'split-backup',version:4,records:[record(),record()]}), ...[
 {...record(),updatedAt:'yesterday'}, {...record(),id:'__proto__'}, {...record(),state:{...state(),people:[]}}, {...record(),state:{...state(),transfers:[{id:'bad',from:0,to:99,amount:2}]}}, {...record(),state:{...state(),target:-1}}
 ].map(r=>JSON.stringify({format:'split-backup',version:4,records:[r]}))]) assert.throws(()=>H.decodeBackup(raw));
});
test('XSS payload remains literal text and unsupported object fields are dropped',()=>{
 const item={...record(),name:'<img src=x onerror=alert(1)>',extra:'ignored'};
 const decoded=H.decodeBackup(H.encodeBackup([item]));assert.equal(decoded[0].name,item.name);assert.equal(decoded[0].extra,undefined);
});
test('corrupt storage is never overwritten, even when legacy is valid',()=>{
 const a=memory();a.setItem(H.KEY,'{broken');a.setItem(H.LEGACY,JSON.stringify(state()));const s=new H.Store(a);
 assert.throws(()=>s.load());assert.equal(s.recovery,'{broken');assert.throws(()=>s.put(record()));assert.equal(a.getItem(H.KEY),'{broken');
});
test('failed migration preserves legacy and retries in next session',()=>{
 const a=memory(),raw=JSON.stringify(state());a.setItem(H.LEGACY,raw);const set=a.setItem;a.setItem=()=>{throw Error('quota');};
 assert.throws(()=>new H.Store(a).load());assert.equal(a.getItem(H.LEGACY),raw);assert.equal(a.getItem(H.KEY),null);
 a.setItem=set;assert.equal(new H.Store(a).load().length,1);
});
test('quota errors keep persisted history intact; retry succeeds without duplicate',()=>{
 const a=memory(),s=new H.Store(a);s.load();s.put(record());const raw=a.getItem(H.KEY),set=a.setItem;
 a.setItem=()=>{throw Error('quota');};assert.throws(()=>s.put(record('two')));assert.equal(a.getItem(H.KEY),raw);assert.equal(s.list().length,1);
 a.setItem=set;s.put(record('two'));assert.equal(s.list().length,2);
});
test('stale tab cannot overwrite newer records or bypass conflict by deleting',()=>{
 const a=memory(),s=new H.Store(a);s.load();const other=new H.Store(a);other.load();s.put(record());
 assert.throws(()=>other.put(record('two')));assert.throws(()=>other.remove('one'));assert.equal(new H.Store(a).load().length,1);
});
test('Split 3 raw JSON backup imports with invalid drafts preserved',()=>{
 assert.deepEqual(H.decodeBackup(JSON.stringify(state()))[0].state,state());
});
test('same legacy JSON can be imported repeatedly despite distinct import timestamps',()=>{
 const a=memory(),s=new H.Store(a);s.load();const raw=JSON.stringify({...state(),people:state().people.map(({id,...p})=>p),transfers:state().transfers.map(({id,...t})=>t),drafts:{}});
 s.restore(H.decodeBackup(raw));s.restore(H.decodeBackup(raw));assert.equal(s.list().length,1);
});
test('confirmed recovery archives exact corrupt bytes before restoring',()=>{
 const a=memory();a.setItem(H.KEY,'{broken');const s=new H.Store(a);assert.throws(()=>s.load());
 s.recover([record()]);assert.equal(new H.Store(a).load().length,1);assert.ok([...a.data].some(([k,v])=>k.startsWith('split-recovery-') && v==='{broken'));
});
test('recovery refuses to overwrite originals if archival fails or another tab writes',()=>{
 const a=memory();a.setItem(H.KEY,'{broken');const s=new H.Store(a);assert.throws(()=>s.load());const set=a.setItem;
 a.setItem=()=>{throw Error('quota');};assert.throws(()=>s.recover([record()]));assert.equal(a.getItem(H.KEY),'{broken');
 a.setItem=set;a.setItem(H.KEY,'concurrent');assert.throws(()=>s.recover([record()]));assert.equal(a.getItem(H.KEY),'concurrent');
});
test('recovery after failed migration includes the legacy calculation as well as import',()=>{
 const a=memory();a.setItem(H.LEGACY,JSON.stringify(state()));const set=a.setItem;a.setItem=()=>{throw Error('quota');};
 const s=new H.Store(a);assert.throws(()=>s.load());a.setItem=set;s.recover([record()]);assert.equal(new H.Store(a).load().length,2);
});
test('empty history exports can be imported as a no-op',()=>assert.deepEqual(H.decodeBackup(H.encodeBackup([])),[]));
