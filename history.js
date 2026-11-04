/* Persistence boundary: UI depends on this store, not on a native/web platform API.
 * A future Capacitor adapter must implement getItem/setItem and equivalent conflict control. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'),require('./items-core.js'));
  else root.SplitHistory = factory(root.SplitCore,root.SplitItems);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, items) {
  'use strict';
  const KEY = 'split-history-v4', LEGACY = 'split-state-v2';
  const MAX_RECORDS = 500, MAX_BYTES = 10 * 1024 * 1024;
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = () => globalThis.crypto.randomUUID();
  const now = () => new Date().toISOString();
  const fail = () => { throw new Error('Некорректный формат или превышены лимиты файла.'); };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const idOK = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value);
  const text = (value, max) => { if (typeof value !== 'string' || value.length > max) fail(); return value; };
  function money(value) {
    if (typeof value !== 'number' && typeof value !== 'string') fail();
    if (!/^\d*(?:[.,]\d{0,2})?$/.test(String(value))) fail();
    core.toCents(value); return value;
  }
  function itemState(value) {
    if (!object(value) || value.mode !== 'items' || !Array.isArray(value.people)) fail();
    if((value.target!==undefined && value.target!=='') || (value.transfers!==undefined && (!Array.isArray(value.transfers)||value.transfers.length)) || (value.drafts!==undefined && (!object(value.drafts)||Object.keys(value.drafts).length)))fail();
    const raw=v=>{if(!['string','number'].includes(typeof v))fail();return text(String(v),1000);};
    const people=value.people.map(p=>{if(!object(p)||!idOK(p.id)||(p.paid!==undefined && p.paid!==0))fail();return {id:p.id,name:text(p.name,80),paid:0};});
    const ids=items.peopleIDs(people);
    const expense=(e,draft=false)=>{
      if(!object(e)||!idOK(e.id)||!ids.includes(e.payerId)||!['equal','fixed','percent'].includes(e.split)||!Array.isArray(e.shares)||e.shares.length>ids.length)fail();
      const result={id:e.id,title:text(e.title,120),amount:raw(e.amount),payerId:e.payerId,split:e.split,shares:e.shares.map(s=>{if(!object(s)||!ids.includes(s.personId))fail();return {personId:s.personId,value:raw(s.value ?? '')};})};
      if(new Set(result.shares.map(s=>s.personId)).size!==result.shares.length)fail();
      if(!draft)items.allocate(result,people);return result;
    };
    if(!Array.isArray(value.expenses)||value.expenses.length>500||!Array.isArray(value.payments)||value.payments.length>500)fail();
    const result={mode:'items',target:'',people,transfers:[],drafts:{},expenses:value.expenses.map(e=>expense(e)),payments:value.payments.map(p=>{
      if(!object(p))fail();const r={id:p.id,fromId:p.fromId,toId:p.toId,amount:money(p.amount)};
      if(p.operationId!==undefined)r.operationId=p.operationId;return r;
    })};
    items.validate(result);
    if(value.expenseDraft!==undefined && value.expenseDraft!==null){
      result.expenseDraft=expense(value.expenseDraft,true);
      if(ids.includes(result.expenseDraft.id)||result.payments.some(p=>p.id===result.expenseDraft.id))fail();
    }
    if(value.paymentDraft!==undefined && value.paymentDraft!==null){
      const p=value.paymentDraft;if(!object(p)||!ids.includes(p.fromId)||!ids.includes(p.toId))fail();
      result.paymentDraft={fromId:p.fromId,toId:p.toId,amount:text(p.amount,1000)};
    }
    return result;
  }
  function state(value, legacy = false) {
    if (value?.mode === 'items') return itemState(value);
    if (value?.mode !== undefined && value.mode !== 'simple') fail();
    if (value && ['expenses','payments','expenseDraft','paymentDraft'].some(key=>value[key]!==undefined)) fail();
    if (!object(value) || !Array.isArray(value.people) || value.people.length < 1 || value.people.length > 100 || !Array.isArray(value.transfers) || value.transfers.length > 500) fail();
    const ids = new Set();
    const getId = raw => {
      let id = raw;
      if (!idOK(id) || ids.has(id)) {
        if (!legacy) fail();
        let suffix = ids.size + 1; do { id = `legacy-${suffix++}`; } while (ids.has(id));
      }
      ids.add(id); return id;
    };
    const result = {
      target: value.target ?? '',
      people: value.people.map(p => {
        if (!object(p)) fail();
        return {id:getId(p.id), name: legacy ? String(p.name ?? '').slice(0,80) : text(p.name,80), paid:money(p.paid ?? 0)};
      }),
      transfers: value.transfers.map(t => {
        if (!object(t) || !Number.isInteger(t.from) || !Number.isInteger(t.to) || t.from < 0 || t.to < 0 || t.from >= value.people.length || t.to >= value.people.length || t.from === t.to) fail();
        return {id:getId(t.id),from:t.from,to:t.to,amount:money(t.amount ?? 0)};
      }), drafts: {}
    };
    const keys = new Set(['target', ...result.people.map(p => `paid-${p.id}`), ...result.transfers.map(t => `transfer-${t.id}`)]);
    if (value.drafts !== undefined) {
      if (!object(value.drafts)) fail();
      for (const [key,raw] of Object.entries(value.drafts)) {
        if (!keys.has(key)) { if (legacy) continue; fail(); }
        const draft = text(raw,1000);
        let valid = false; try { money(draft); valid = true; } catch (_) {}
        if (valid) { if (legacy) continue; fail(); }
        result.drafts[key] = draft;
      }
    }
    try { money(result.target); } catch (e) {
      if (!legacy || typeof result.target !== 'string') throw e;
      result.drafts.target = text(result.target,1000); result.target = '';
    }
    if (value.mode === 'simple') result.mode='simple';
    return result;
  }
  function record(value) {
    if (!object(value) || !idOK(value.id)) fail();
    const updatedAt = text(value.updatedAt,30);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(updatedAt) || !Number.isFinite(Date.parse(updatedAt)) || new Date(updatedAt).toISOString() !== updatedAt) fail();
    const name = text(value.name,120); if (!name.trim()) fail();
    const result = {id:value.id,name,updatedAt,state:state(value.state)};
    if (value.importedFrom !== undefined) { if (!idOK(value.importedFrom)) fail(); result.importedFrom = value.importedFrom; }
    return result;
  }
  function records(values) {
    if (!Array.isArray(values) || values.length > MAX_RECORDS) fail();
    const result = values.map(record);
    if (new Set(result.map(r => r.id)).size !== result.length) fail();
    return result;
  }
  function parse(raw) {
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_BYTES) fail();
    return JSON.parse(raw);
  }
  function decodeBackup(raw) {
    const value = parse(raw);
    if (object(value) && Array.isArray(value.people)) {
      if(value.mode==='items')fail();
      // Split 3.0's downloadable raw-state backup.
      let hash = 14695981039346656037n;
      for (const char of raw) hash = BigInt.asUintN(64,(hash ^ BigInt(char.codePointAt(0))) * 1099511628211n);
      return [{id:`legacy-${hash.toString(16)}`,name:'Расчёт из Split 3.0',updatedAt:now(),state:state(value,true)}];
    }
    if (!object(value) || value.format !== 'split-backup' || ![4,5].includes(value.version)) fail();
    return records(value.records);
  }
  function encodeBackup(values) {
    return JSON.stringify({format:'split-backup',version:5,exportedAt:now(),records:records(values)});
  }
  function planImport(current, incoming) {
    const merged = clone(current), added = [], skipped = [], conflicts = [];
    for (const item of records(incoming)) {
      const existing = merged.find(r => r.id === item.id);
      if (existing && (JSON.stringify(existing) === JSON.stringify(item) || (item.id.startsWith('legacy-') && existing.name === item.name && JSON.stringify(existing.state) === JSON.stringify(item.state)))) { skipped.push(item); continue; }
      // Also detect a previously imported conflict-copy, even after another export/import.
      if (merged.some(r => r.importedFrom === item.id && r.name === item.name && r.updatedAt === item.updatedAt && JSON.stringify(r.state) === JSON.stringify(item.state))) { skipped.push(item); continue; }
      const next = clone(item);
      if (existing) { next.id = uid(); next.importedFrom = item.id; conflicts.push(next); }
      merged.push(next); added.push(next);
    }
    if (merged.length > MAX_RECORDS) throw new Error('Лимит истории: 500 расчётов. Сначала экспортируйте и удалите ненужные.');
    return {records:merged,added,skipped,conflicts};
  }
  class Store {
    constructor(adapter) { this.adapter=adapter; this.data={version:4,legacyMigrated:false,records:[]}; this.snapshot=null; this.blocked=false; this.failed=false; this.recovery=null; this.loadFailed=false; }
    load() {
      try {
        const raw=this.adapter.getItem(KEY); this.snapshot=raw; this.recovery=raw;
        if (raw !== null) {
          const value=parse(raw);
          if (!object(value) || ![4,5].includes(value.version) || typeof value.legacyMigrated !== 'boolean') fail();
          this.data={version:value.version,legacyMigrated:value.legacyMigrated,records:records(value.records)};
        }
        if (!this.data.legacyMigrated) {
          const old=this.adapter.getItem(LEGACY); let legacy;
          this.recovery=old ?? raw;
          if (old !== null) legacy=state(parse(old),true);
          else if (this.adapter.getItem('people') || this.adapter.getItem('transfers')) {
            this.recovery=JSON.stringify({people:this.adapter.getItem('people'),transfers:this.adapter.getItem('transfers'),target:this.adapter.getItem('target')});
            legacy=state({people:JSON.parse(this.adapter.getItem('people') || '[]'),transfers:JSON.parse(this.adapter.getItem('transfers') || '[]'),target:this.adapter.getItem('target') || ''},true);
          }
          const next=clone(this.data); next.legacyMigrated=true;
          if (legacy) next.records.push({id:uid(),name:'Расчёт из Split 3.0',updatedAt:now(),state:legacy});
          if (next.records.length > MAX_RECORDS) fail();
          this.pendingMigration=next; this.commit(next); this.pendingMigration=null;
        }
        this.recovery=null;
      } catch (e) { this.blocked=true; this.loadFailed=true; throw e; }
      return this.list();
    }
    list() { return clone(this.data.records); }
    recoveryList() { return clone(this.pendingMigration?.records || this.data.records); }
    commit(next) {
      if (this.blocked) throw new Error('Запись заблокирована. Скачайте копию и перезагрузите страницу.');
      try {
        if (this.adapter.getItem(KEY) !== this.snapshot) { this.blocked=true; throw new Error('История изменена в другой вкладке. Скачайте копию и перезагрузите страницу.'); }
        next={...next,version:5};
        // Preserve the pre-items document before the first schema-5 write.
        if(this.data.version===4 && this.snapshot && !this.loadFailed && JSON.parse(this.snapshot).version===4 && this.adapter.getItem('split-history-before-v5')===null) this.adapter.setItem('split-history-before-v5',this.snapshot);
        const serialized=JSON.stringify(next);
        if (new TextEncoder().encode(encodeBackup(next.records)).length > MAX_BYTES) throw new Error('История превышает лимит 10 МБ. Экспортируйте и удалите ненужные расчёты.');
        this.adapter.setItem(KEY,serialized); this.snapshot=serialized; this.data=next; this.failed=false;
      } catch (e) { this.failed=true; throw e; }
    }
    put(value) {
      const item=record(value), next=clone(this.data), index=next.records.findIndex(r=>r.id===item.id);
      if (index < 0) { if (next.records.length >= MAX_RECORDS) fail(); next.records.push(item); }
      else next.records[index]=item;
      this.commit(next); return clone(item);
    }
    switchMode(id,nextState) {
      const next=clone(this.data),index=next.records.findIndex(r=>r.id===id);if(index<0)fail();
      if(next.records.length>=MAX_RECORDS)fail();
      const original=next.records[index];
      next.records.push({...clone(original),id:uid(),name:(original.name+' — до смены режима').slice(0,120)});
      next.records[index]=record({...original,updatedAt:now(),state:nextState});
      this.commit(next);
    }
    remove(id) { const next=clone(this.data); next.records=next.records.filter(r=>r.id!==id); this.commit(next); }
    recover(incoming) {
      if (!this.loadFailed || !this.blocked) throw new Error('Восстановление доступно только после ошибки чтения.');
      if (this.adapter.getItem(KEY) !== this.snapshot) throw new Error('Хранилище изменилось. Перезагрузите страницу.');
      const plan=planImport(this.pendingMigration?.records || this.list(),incoming);
      // Preserve the exact unreadable bytes before replacing the main document.
      // If quota prevents archiving or writing, the original document stays intact.
      if (this.recovery !== null) this.adapter.setItem(`split-recovery-${uid()}`,this.recovery);
      this.blocked=false;
      try { this.commit({version:4,legacyMigrated:true,records:plan.records}); }
      catch (e) { this.blocked=true; throw e; }
      this.loadFailed=false; this.recovery=null; return plan;
    }
    restore(incoming) { const plan=planImport(this.list(),incoming); this.commit({...clone(this.data),records:plan.records}); return plan; }
  }
  return {KEY,LEGACY,MAX_BYTES,Store,state,record,decodeBackup,encodeBackup,planImport,uid,now,clone};
});
