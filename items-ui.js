/* DOM-only item editor. Financial rules and persistence stay in separate modules. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const button=(label,fn)=>{const b=node('button','secondary-button',label);b.type='button';b.addEventListener('click',fn);return b;};
  function preview(state){
    const result=JSON.parse(JSON.stringify(state));let error='';
    if(state.expenseDraft){
      try{SplitItems.allocate(state.expenseDraft,state.people);const index=result.expenses.findIndex(e=>e.id===state.expenseDraft.id);if(index<0)result.expenses.push(state.expenseDraft);else result.expenses[index]=state.expenseDraft;SplitItems.validate(result);}
      catch(e){return {state:JSON.parse(JSON.stringify(state)),error:e.message};}
    }
    return {state:result,error};
  }
  function create(api){
    const name=id=>{const s=api.get(),index=s.people.findIndex(p=>p.id===id);return s.people[index]?.name || `Участник ${index+1}`;};
    function change(render=false){api.save();if(render)renderAll();else validateDraft();api.recalculate();}
    function editable(){if(api.get().expenseDraft){api.toast('Сначала сохраните или отмените открытый расход.');return false;}return true;}
    function select(id,value,onChange){const s=$(id);s.replaceChildren();for(const p of api.get().people){const o=node('option','',name(p.id));o.value=p.id;s.append(o);}s.value=value;s.onchange=()=>onChange(s.value);}
    function validateDraft(){
      const s=api.get(),draft=s.expenseDraft;if(!draft)return;
      let message='Предпросмотр включён в итог. Сохраните расход, чтобы проводить компенсации.';let valid=true;
      try{SplitItems.allocate(draft,s.people);if(s.expenses.length>=500&&!s.expenses.some(e=>e.id===draft.id))throw Error('Не более 500 расходов.');}catch(e){valid=false;message=e.message+' В итоге — сохранённая версия расхода.';}
      $('expense-error').textContent=message;$('expense-error').dataset.error=String(!valid);$('save-expense').disabled=!valid;
      $('expense-amount').setAttribute('aria-invalid',String(!/^\d+(?:[.,]\d{1,2})?$/.test(draft.amount)));
    }
    function shares(){
      const s=api.get(),draft=s.expenseDraft,list=$('expense-shares');list.replaceChildren();if(!draft)return;
      for(const p of s.people){
        const row=node('div','share-row'),label=node('label','share-person'),check=node('input');check.type='checkbox';check.checked=draft.shares.some(x=>x.personId===p.id);check.dataset.personId=p.id;
        label.append(check,document.createTextNode(name(p.id)));row.append(label);
        check.onchange=()=>{if(check.checked)draft.shares.push({personId:p.id,value:''});else draft.shares=draft.shares.filter(x=>x.personId!==p.id);change(true);};
        if(check.checked && draft.split!=='equal'){
          const input=node('input','share-value');input.type='text';input.inputMode='decimal';input.maxLength=1000;input.value=draft.shares.find(x=>x.personId===p.id).value;
          input.setAttribute('aria-label',`${draft.split==='percent'?'Процент':'Сумма'}: ${name(p.id)}`);
          input.oninput=()=>{draft.shares.find(x=>x.personId===p.id).value=input.value;change();};row.append(input,node('span','',draft.split==='percent'?'%':'₽'));
        }
        list.append(row);
      }
    }
    function renderDraft(){
      const s=api.get(),draft=s.expenseDraft;$('expense-editor').hidden=!draft;$('add-expense').disabled=!!draft;if(!draft)return;
      for(const [id,key] of [['expense-title','title'],['expense-amount','amount']]){const input=$(id);input.value=draft[key];input.oninput=()=>{draft[key]=input.value;change();};}
      select('expense-payer',draft.payerId,value=>{draft.payerId=value;change();});
      $('expense-split').value=draft.split;$('expense-split').onchange=()=>{draft.split=$('expense-split').value;change(true);};shares();validateDraft();
    }
    function renderPayments(){
      const s=api.get(),list=$('payments-list');list.replaceChildren();
      for(const payment of s.payments){const row=node('div','expense-card');row.append(node('p','',`${name(payment.fromId)} → ${name(payment.toId)} · ${api.money(SplitItems.cents(payment.amount))}`),button('Удалить перевод',()=>{
        if(!confirm('Отменить выполненную компенсацию? Она снова отразится в долге.'))return;
        s.payments=s.payments.filter(p=>p.id!==payment.id);change(true);
      }));list.append(row);}
      const draft=s.paymentDraft || {fromId:s.people[0].id,toId:s.people[Math.min(1,s.people.length-1)].id,amount:''};
      const update=()=>{s.paymentDraft=draft;change();};
      select('payment-from',draft.fromId,value=>{draft.fromId=value;update();});select('payment-to',draft.toId,value=>{draft.toId=value;update();});
      $('payment-amount').value=draft.amount;$('payment-amount').oninput=()=>{draft.amount=$('payment-amount').value;update();};
    }
    function renderAll(){
      const s=api.get();if(s.mode!=='items')return;
      const list=$('expenses-list');list.replaceChildren();$('expenses-empty').hidden=s.expenses.length>0;
      for(const expense of s.expenses){const card=node('article','expense-card');card.append(node('h3','',expense.title),node('p','',`${api.money(SplitItems.cents(expense.amount))} · Оплатил: ${name(expense.payerId)} · ${expense.shares.length} участн.`));
        const actions=node('div','history-actions');actions.append(button('Изменить расход',()=>{if(!editable())return;s.expenseDraft=structuredClone(expense);change(true);$('expense-title').focus();}),
          button('Копировать расход',()=>{if(!editable())return;if(s.expenses.length>=500){api.toast('Не более 500 расходов.');return;}s.expenses.push({...structuredClone(expense),id:api.uid()});change(true);}),
          button('Удалить расход',()=>{if(!editable()||!confirm('Удалить расход? Балансы будут пересчитаны.'))return;s.expenses=s.expenses.filter(e=>e.id!==expense.id);change(true);}));card.append(actions);list.append(card);
      }
      renderDraft();renderPayments();
    }
    $('add-expense').onclick=()=>{const s=api.get();if(!editable())return;if(s.expenses.length>=500){api.toast('Не более 500 расходов.');return;}s.expenseDraft={id:api.uid(),title:'',amount:'',payerId:s.people[0].id,split:'equal',shares:s.people.map(p=>({personId:p.id,value:''}))};change(true);$('expense-title').focus();};
    $('expense-form').onsubmit=event=>{event.preventDefault();const s=api.get(),draft=s.expenseDraft;if(!draft)return;try{SplitItems.allocate(draft,s.people);if(s.expenses.length>=500&&!s.expenses.some(e=>e.id===draft.id))throw Error('Не более 500 расходов.');const index=s.expenses.findIndex(e=>e.id===draft.id);if(index<0)s.expenses.push(draft);else s.expenses[index]=draft;delete s.expenseDraft;change(true);}catch(e){api.toast(e.message);}};
    $('cancel-expense').onclick=()=>{if(!confirm('Отменить изменения открытого расхода? Несохранённый черновик будет удалён.'))return;delete api.get().expenseDraft;change(true);};
    $('payment-form').onsubmit=event=>{event.preventDefault();const s=api.get();try{if(s.expenseDraft)throw Error('Сначала сохраните или отмените расход.');const d=s.paymentDraft;if(!d)throw Error('Введите сумму перевода.');const next=structuredClone(s);next.payments.push({id:api.uid(),...d});delete next.paymentDraft;SplitItems.validate(next);api.replace(next);$('payment-error').textContent='';}catch(e){$('payment-error').textContent=e.message;}};
    $('cancel-payment').onclick=()=>{delete api.get().paymentDraft;change(true);$('payment-error').textContent='';};
    return {render:renderAll};
  }
  root.SplitItemsUI={create,preview};
})(globalThis);
