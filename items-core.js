/* Itemized expenses: integer kopecks, stable participant IDs, no simple-mode contributions. */
(function(root,factory){
  if(typeof module==='object' && module.exports) module.exports=factory(require('./core.js'));
  else root.SplitItems=factory(root.SplitCore);
})(globalThis,function(core){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const idOK=id=>typeof id==='string' && /^[a-zA-Z0-9-]{1,100}$/.test(id);
  const error=message=>{throw new RangeError(message);};
  function cents(raw) {
    if(!['number','string'].includes(typeof raw) || !/^\d+(?:[.,]\d{1,2})?$/.test(String(raw))) error('Введите сумму с точностью до копейки.');
    return core.toCents(raw);
  }
  function percent(raw) {
    const value=cents(raw); if(value>10000) error('Доля должна быть от 0 до 100%.'); return value;
  }
  function peopleIDs(people){
    if(!Array.isArray(people) || !people.length || people.length>100) error('Нужно от 1 до 100 участников.');
    const ids=people.map(p=>p?.id);
    if(ids.some(id=>!idOK(id)) || new Set(ids).size!==ids.length) error('Участникам нужны уникальные ID.');
    return ids;
  }
  function allocate(expense,people){
    const ids=peopleIDs(people), total=cents(expense.amount);
    if(!idOK(expense.id) || typeof expense.title!=='string' || !expense.title.trim() || expense.title.length>120) error('Укажите название расхода.');
    if(!ids.includes(expense.payerId)) error('Выберите существующего плательщика.');
    if(!['equal','fixed','percent'].includes(expense.split) || !Array.isArray(expense.shares) || !expense.shares.length || expense.shares.length>ids.length) error('Выберите участников и способ распределения.');
    const selected=expense.shares.map(s=>s.personId);
    if(new Set(selected).size!==selected.length || selected.some(id=>!ids.includes(id))) error('Недопустимые участники расхода.');
    // Participant order, not checkbox-click order, determines equal and percentage tie breaks.
    const ordered=ids.filter(id=>selected.includes(id));
    const values=new Map(expense.shares.map(s=>[s.personId,s.value]));
    let amounts;
    if(expense.split==='equal') amounts=ordered.map((_,i)=>Math.floor(total/ordered.length)+(i<total%ordered.length?1:0));
    else if(expense.split==='fixed') {
      amounts=ordered.map(id=>cents(values.get(id)));
      if(amounts.reduce((a,b)=>a+b,0)!==total) error('Фиксированные доли должны совпадать с суммой расхода.');
    } else {
      const weights=ordered.map(id=>percent(values.get(id)));
      if(weights.reduce((a,b)=>a+b,0)!==10000) error('Процентные доли должны давать ровно 100%.');
      // BigInt prevents unsafe multiplication at the 1-billion-ruble limit.
      const products=weights.map(w=>BigInt(total)*BigInt(w));
      amounts=products.map(p=>Number(p/10000n));
      let remainder=total-amounts.reduce((a,b)=>a+b,0);
      const ranks=ordered.map((_,i)=>i).sort((a,b)=>Number(products[b]%10000n-products[a]%10000n)||a-b);
      for(let i=0;i<remainder;i++) amounts[ranks[i]]++;
    }
    return ordered.map((personId,i)=>({personId,amount:amounts[i]}));
  }
  function validate(state){
    const ids=peopleIDs(state.people);
    if(!Array.isArray(state.expenses)||state.expenses.length>500||!Array.isArray(state.payments)||state.payments.length>500) error('Не более 500 расходов и 500 компенсаций.');
    const used=new Set(ids), operations=new Set();
    for(const e of state.expenses){
      if(used.has(e.id)) error('Повторный ID расхода.'); used.add(e.id); allocate(e,state.people);
    }
    for(const p of state.payments){
      if(!idOK(p.id)||used.has(p.id)||!ids.includes(p.fromId)||!ids.includes(p.toId)||p.fromId===p.toId||cents(p.amount)<=0) error('Неверная компенсация.');
      used.add(p.id);
      if(p.operationId!==undefined){if(!idOK(p.operationId)||operations.has(p.operationId)) error('Операция уже проведена.');operations.add(p.operationId);}
    }
    return state;
  }
  function calculate(state){
    validate(state);
    const ids=peopleIDs(state.people), contributions=ids.map(()=>0), shares=ids.map(()=>0);
    for(const e of state.expenses){
      contributions[ids.indexOf(e.payerId)]+=cents(e.amount);
      for(const s of allocate(e,state.people)) shares[ids.indexOf(s.personId)]+=s.amount;
    }
    const net=contributions.slice();
    for(const p of state.payments){net[ids.indexOf(p.fromId)]+=cents(p.amount);net[ids.indexOf(p.toId)]-=cents(p.amount);}
    const balances=net.map((v,i)=>v-shares[i]);
    const debtors=balances.map((v,i)=>({i,amount:-v})).filter(x=>x.amount>0), creditors=balances.map((v,i)=>({i,amount:v})).filter(x=>x.amount>0);
    const settlement=[];let di=0,ci=0;
    while(di<debtors.length && ci<creditors.length){const d=debtors[di],c=creditors[ci],amount=Math.min(d.amount,c.amount,core.MAX_RUBLES*100);settlement.push({from:d.i,to:c.i,amount});d.amount-=amount;c.amount-=amount;if(!d.amount)di++;if(!c.amount)ci++;}
    const totalPaid=contributions.reduce((a,b)=>a+b,0);
    return {n:ids.length,contributions,shares,net,balances,totalPaid,target:totalPaid,delta:0,gap:0,progress:totalPaid?100:0,settlement,cashFlows:[]};
  }
  function digest(value){let h=14695981039346656037n;for(const c of JSON.stringify(value))h=BigInt.asUintN(64,(h^BigInt(c.codePointAt(0)))*1099511628211n);return h.toString(16);}
  function proposals(state){
    const revision=digest([state.people.map(p=>p.id),state.expenses,state.payments]);
    return calculate(state).settlement.map((s,index)=>({...s,fromId:state.people[s.from].id,toId:state.people[s.to].id,operationId:`op-${revision}-${s.from}-${s.to}-${s.amount}-${index}`}));
  }
  function complete(state,operationId,id){
    if(state.expenseDraft) error('Сначала сохраните или отмените редактирование расхода.');
    if(state.payments.some(p=>p.operationId===operationId)) error('Операция уже проведена.');
    const suggestion=proposals(state).find(p=>p.operationId===operationId);if(!suggestion) error('Предложение устарело. Пересчитайте итог.');
    const next=copy(state);next.payments.push({id,fromId:suggestion.fromId,toId:suggestion.toId,amount:(suggestion.amount/100).toFixed(2),operationId});validate(next);return next;
  }
  function removePerson(state,id){
    if(state.people.length<=1) error('Должен остаться хотя бы один участник.');
    const linked=e=>e && (e.payerId===id || e.shares.some(s=>s.personId===id));
    if(state.expenses.some(linked)||linked(state.expenseDraft)||state.payments.some(p=>p.fromId===id||p.toId===id)||state.paymentDraft?.fromId===id||state.paymentDraft?.toId===id) error('Участник связан с расходами или переводами. Сначала измените или удалите связанные записи и черновики.');
    const next=copy(state);next.people=next.people.filter(p=>p.id!==id);validate(next);return next;
  }
  return Object.freeze({cents,percent,allocate,validate,calculate,proposals,complete,removePerson,peopleIDs});
});
