(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const els = {
    target: $('#target'),
    people: $('#people-list'),
    transfers: $('#transfers-list'),
    peopleCount: $('#people-count'),
    transfersCount: $('#transfers-count'),
    totalPaid: $('#total-paid'),
    targetTotal: $('#target-total'),
    shareTotal: $('#share-total'),
    gapLabel: $('#gap-label'),
    gapTotal: $('#gap-total'),
    progressLabel: $('#progress-label'),
    progressValue: $('#progress-value'),
    progressTrack: $('#progress-track'),
    progressFill: $('#progress-fill'),
    notice: $('#notice'),
    balances: $('#balances-list'),
    balanceCount: $('#balance-count'),
    settlement: $('#settlement-list'),
    settlementFooter: $('#settlement-footer'),
    copy: $('#copy-results'),
    toast: $('#toast'),
    resetDialog: $('#reset-dialog')
  };

  const STORAGE_KEY = SplitHistory.KEY;
  const history = new SplitHistory.Store({getItem:key => localStorage.getItem(key), setItem:(key,value) => localStorage.setItem(key,value)});
  let active = null;
  let pendingImport = null;
  let importGeneration = 0;
  const THEME_KEY = 'split-theme';
  const DEFAULT_STATE = () => ({
    target: '',
    people: [{ id: uid(), name: '', paid: 0 }, { id: uid(), name: '', paid: 0 }],
    transfers: []
  });
  const freshItems = people => ({mode:'items',target:'',people:people.map(p=>({id:p.id,name:p.name,paid:0})),transfers:[],drafts:{},expenses:[],payments:[]});
  const isItems = () => state.mode === 'items';
  let state = DEFAULT_STATE();
  const itemsUI = SplitItemsUI.create({get:()=>state,save:()=>persist(false),recalculate:()=>calculateAndRender(),money,uid,toast:showToast,replace:next=>{state=next;drafts={};persist();}});
  const shell=SplitShell.create({hasCurrent:()=>!!active,isItems,canNavigate:canLeave,history:home});
  let lastTotal='';
  let toastTimer = null;
  let reportReady = false;
  let drafts = {};
  let recoveryRaw = null;
  let storageBlocked = false;
  let saveFailed = false;

  function uid() {
    try { return crypto.randomUUID(); }
    catch (_) { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
  }
  const toCents = SplitCore.toCents;
  function money(cents) {
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format((Number.isFinite(cents) ? cents : 0) / 100) + '\u00a0₽';
  }
  function personName(person, index) {
    const name = String(person.name || '').trim();
    return name || `Участник ${index + 1}`;
  }
  function initials(name) {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || '?').slice(0, 2)).toLocaleUpperCase('ru-RU');
  }
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2300);
  }
  function storageStatus(message, error = false) {
    $('#storage-status').textContent = message;
    $('#storage-status').dataset.error = String(error);
  }
  function validMoney(raw) {
    if (!/^\d*(?:[.,]\d{0,2})?$/.test(String(raw))) return false;
    try { toCents(raw); return true; } catch (_) { return false; }
  }
  function safeLoad() {
    try { history.load(); storageStatus('История сохранена на устройстве'); }
    catch (_) { storageBlocked = true; recoveryRaw = history.recovery; storageStatus('Не удалось прочитать или сохранить историю. Скачайте исходную копию. Данные не перезаписаны.',true); }
  }
  function currentRecord() {
    return active ? {...active,state:{...state,drafts}} : null;
  }
  function storageError(error) {
    SplitShell.feedback('error');
    saveFailed = true; storageBlocked = history.blocked;
    storageStatus(error.message + ' Скачайте копию до закрытия страницы.',true);
  }
  function persist(shouldRender = true) {
    if (active) {
      active.updatedAt = SplitHistory.now();
      try {
        history.put(currentRecord()); saveFailed = false;
        storageStatus('Сохранено на устройстве');
      } catch (error) { storageError(error); }
    }
    if (shouldRender) renderAll();
  }
  function bindMoney(input, key, value, onValue) {
    input.type = 'text'; input.maxLength = 1000; input.inputMode = 'decimal'; input.autocomplete = 'off'; input.enterKeyHint = 'done';
    input.value = Object.hasOwn(drafts,key) ? drafts[key] : String(value || '');
    const error = el('span','field-error'); error.id = `error-${key}`; error.setAttribute('aria-live','polite');
    input.setAttribute('aria-describedby',error.id);
    input.validateMoney = () => {
      const ok = validMoney(input.value);
      input.setAttribute('aria-invalid',String(!ok));
      error.textContent = ok ? '' : 'От 0 до 1 млрд ₽, до 2 знаков после запятой.';
      return ok;
    };
    input.validateMoney();
    input.addEventListener('input', () => {
      if (input.validateMoney()) { delete drafts[key]; onValue(input.value); }
      else drafts[key] = input.value;
      calculateAndRender(); persist(false);
    });
    input.addEventListener('keydown',event => { if (event.key === 'Enter') input.blur(); });
    return error;
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function makeRemoveButton(label, onClick) {
    const button = el('button', 'remove-button');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg>';
    button.addEventListener('click', onClick);
    return button;
  }
  function makeMoneyInput(className, value, placeholder, onChange, label, key) {
    const wrap = el('div','money-small'); const input = el('input',className);
    input.placeholder = placeholder; input.setAttribute('aria-label',label);
    const error = bindMoney(input,key,value,raw => onChange(toCents(raw)/100));
    wrap.append(input,el('span','currency-symbol','₽'),error); return wrap;
  }
  function renderPeople() {
    els.people.replaceChildren();
    state.people.forEach((person, index) => {
      const row = el('div', 'person-row');
      const avatar = el('span', 'person-avatar', initials(person.name || `У${index + 1}`));
      avatar.setAttribute('aria-hidden', 'true');
      const name = el('input', 'person-name');
      name.type = 'text'; name.maxLength = 80; name.autocomplete = 'off';
      name.placeholder = 'Имя участника'; name.value = person.name;
      name.setAttribute('aria-label', `Имя участника ${index + 1}`);
      name.addEventListener('input', () => {
        person.name = name.value.slice(0, 80);
        avatar.textContent = initials(person.name || `У${index + 1}`);
        refreshTransferOptions();
        if (isItems()) itemsUI.render();
        calculateAndRender();
        persist(false);
      });
      const paid = makeMoneyInput('person-paid', person.paid, 'Внёс', value => {
        person.paid = value;
      }, `Сколько внёс участник ${index + 1}`, `paid-${person.id}`);
      if (isItems()) { paid.hidden=true; row.classList.add('items-person-row'); }
      row.append(avatar, name, paid, makeRemoveButton('Удалить участника', () => removePerson(index)));
      els.people.append(row);
    });
    els.peopleCount.textContent = `${state.people.length} ${plural(state.people.length, 'участник', 'участника', 'участников')}`;
  }
  function refreshTransferOptions() {
    els.transfers.querySelectorAll('select[data-transfer-id]').forEach(select => {
      const transfer = state.transfers.find(t => t.id === select.dataset.transferId);
      if (!transfer) return;
      select.replaceChildren();
      state.people.forEach((person, index) => {
        const option = el('option', '', personName(person, index));
        option.value = String(index);
        select.append(option);
      });
      const wanted = select.dataset.side === 'from' ? transfer.from : transfer.to;
      select.value = String(wanted);
    });
  }
  function renderTransfers() {
    els.transfers.replaceChildren();
    state.transfers.forEach((transfer, index) => {
      const row = el('div', 'transfer-row');
      const from = makePersonSelect(transfer, 'from');
      const arrow = el('span', 'transfer-arrow');
      arrow.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
      const to = makePersonSelect(transfer, 'to');
      const amount = makeMoneyInput('transfer-amount', transfer.amount, 'Сумма', value => {
        transfer.amount = value;
      }, `Сумма перевода ${index + 1}`, `transfer-${transfer.id}`);
      row.append(from, arrow, to, amount, makeRemoveButton('Удалить перевод', () => {
        delete drafts[`transfer-${transfer.id}`]; state.transfers.splice(index, 1); persist();
        (els.transfers.children[Math.min(index,state.transfers.length-1)]?.querySelector('select') || $('#add-transfer')).focus();
      }));
      els.transfers.append(row);
    });
    els.transfersCount.textContent = `${state.transfers.length} ${plural(state.transfers.length, 'перевод', 'перевода', 'переводов')}`;
  }
  function makePersonSelect(transfer, side) {
    const select = el('select', 'transfer-select');
    select.dataset.transferId = transfer.id;
    select.dataset.side = side;
    select.setAttribute('aria-label', side === 'from' ? 'Кто отправляет перевод' : 'Кто получает перевод');
    state.people.forEach((person, index) => {
      const option = el('option', '', personName(person, index));
      option.value = String(index);
      select.append(option);
    });
    select.value = String(transfer[side]);
    select.addEventListener('change', () => {
      const previous = transfer[side];
      transfer[side] = Number(select.value);
      if (transfer.from === transfer.to && state.people.length > 1) {
        transfer[side === 'from' ? 'to' : 'from'] = previous;
        refreshTransferOptions();
        showToast('Направление перевода изменено.');
      }
      calculateAndRender(); persist(false);
    });
    return select;
  }
  function removePerson(index) {
    if (isItems()) {try {state=SplitItems.removePerson(state,state.people[index].id);persist();els.people.children[Math.min(index,state.people.length-1)]?.querySelector('input')?.focus();}catch(e){showToast(e.message);}return;}
    if (state.people.length <= 1) {
      showToast('В расчёте должен остаться хотя бы один участник.');
      return;
    }
    delete drafts[`paid-${state.people[index].id}`];
    state.transfers.filter(t => t.from === index || t.to === index).forEach(t => delete drafts[`transfer-${t.id}`]);
    state.people.splice(index, 1);
    // Remove transfers touching the deleted participant and shift indexes above it.
    state.transfers = state.transfers.filter(t => t.from !== index && t.to !== index).map(t => ({
      ...t, from: t.from > index ? t.from - 1 : t.from, to: t.to > index ? t.to - 1 : t.to
    }));
    persist();
    els.people.children[Math.min(index,state.people.length-1)]?.querySelector('input')?.focus();
    showToast('Участник удалён. Связанные переводы обновлены.');
  }
  function plural(n, one, few, many) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }

  function calculate() { return isItems() ? SplitItems.calculate(SplitItemsUI.preview(state).state) : SplitCore.calculate(state); }
  function setText(selector, text) { $(selector).textContent = text; }
  function renderMetrics(result) {
    setText('#total-paid', money(result.totalPaid));
    setText('#target-total', money(result.target));
    const low = Math.min(...result.shares), high = Math.max(...result.shares);
    setText('#share-total', low === high ? money(low) : `${money(low)}–${money(high)}`);
    els.gapLabel.textContent = result.delta > 0 ? 'Осталось собрать' : result.delta < 0 ? 'Излишек в кассе' : 'Сумма совпала';
    els.gapTotal.textContent = money(result.gap);
    els.progressLabel.textContent = result.target === 0 ? 'Заполнено от цели' : 'Собрано от целевой суммы';
    els.progressValue.textContent = `${Math.round(result.progress)}%`;
    els.progressFill.style.width = `${result.progress}%`;
    els.progressTrack.setAttribute('aria-valuenow', String(Math.round(result.progress)));
    let message = 'Введите целевую сумму или оставьте поле пустым для автоматического итога.';
    let kind = '';
    if (result.target > result.totalPaid) {
      message = `До целевой суммы не хватает ${money(result.target - result.totalPaid)}. Учитывайте этот остаток при пополнении общего бюджета.`;
      kind = 'warning';
    } else if (result.target < result.totalPaid) {
      message = `Внесено на ${money(result.totalPaid - result.target)} больше целевой суммы. Проверьте возврат остатка из общей кассы.`;
      kind = 'warning';
    } else if (result.target > 0) {
      message = 'Внесённая сумма совпадает с целевой. Ниже — итоговые балансы и взаиморасчёты.';
      kind = 'success';
    }
    els.notice.textContent = message;
    if (isItems()) { els.gapLabel.textContent='Уже компенсировано';els.gapTotal.textContent=money(state.payments.reduce((sum,p)=>sum+SplitItems.cents(p.amount),0));message='Учтены только позиции и выполненные компенсации. Взносы простого режима не используются.'; kind=''; }
    els.notice.dataset.kind = kind; els.notice.textContent = message;
  }
  function renderBalances(result) {
    els.balances.replaceChildren();
    els.balanceCount.textContent = `${result.n} ${plural(result.n, 'участник', 'участника', 'участников')}`;
    result.balances.forEach((balance, index) => {
      const row = el('div', 'balance-row');
      const person = el('div', 'balance-person');
      const avatar = el('span', 'balance-avatar', initials(personName(state.people[index], index)));
      const info = el('div', '');
      info.append(el('div', 'balance-name', personName(state.people[index], index)));
      info.append(el('div', 'balance-sub', `Внёс ${money(result.contributions[index])} · Доля ${money(result.shares[index])}`));
      person.append(avatar, info);
      const amount = el('div', 'balance-value');
      const status = el('div', 'balance-status');
      if (balance > 0) {
        amount.classList.add('positive'); amount.textContent = `+${money(balance)}`; status.textContent = 'К получению';
      } else if (balance < 0) {
        amount.classList.add('negative'); amount.textContent = `−${money(-balance)}`; status.textContent = 'Нужно доплатить';
      } else {
        amount.classList.add('neutral'); amount.textContent = money(0); status.textContent = 'В балансе';
      }
      const right = el('div', ''); right.append(amount, status);
      row.append(person, right); els.balances.append(row);
    });
  }
  function renderSettlement(result) {
    els.settlement.replaceChildren();
    const items = [];
    result.settlement.forEach(item => items.push({
      from: personName(state.people[item.from], item.from),
      to: personName(state.people[item.to], item.to),
      amount: item.amount,
      fromRole: 'Переводит', toRole: 'Получает'
    }));
    if (result.delta > 0) {
      result.cashFlows.forEach(flow => {
        if (flow.kind === 'pot-in') items.push({
          from: personName(state.people[flow.from], flow.from), to: 'Общая касса',
          amount: flow.amount, fromRole: 'Пополняет бюджет', toRole: 'Целевой фонд'
        });
      });
    } else if (result.delta < 0) {
      result.cashFlows.forEach(flow => {
        if (flow.kind === 'pot-out') items.push({
          from: 'Общая касса', to: personName(state.people[flow.to], flow.to),
          amount: flow.amount, fromRole: 'Возвращает', toRole: 'Получает остаток'
        });
      });
    }
    if (!items.length) {
      const empty = el('div', 'empty-state compact');
      empty.append(el('span', 'empty-symbol', '✓'), el('strong', '', 'Взаиморасчёты не нужны'), el('p', '', 'Все участники находятся в балансе.'));
      els.settlement.append(empty);
      els.settlementFooter.textContent = 'Итог: дополнительные переводы не требуются.';
      reportReady = true;
      els.copy.disabled = false;
      return;
    }
    items.forEach((item, index) => {
      const row = el('div', 'settlement-row');
      const from = el('div', '');
      from.append(el('div', 'settlement-name', item.from), el('div', 'settlement-role', item.fromRole));
      const direction = el('span', 'settlement-direction');
      direction.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
      const to = el('div', '');
      to.append(el('div', 'settlement-name', item.to), el('div', 'settlement-role', item.toRole));
      row.append(from, direction, to, el('div', 'settlement-amount', money(item.amount)));
      row.style.animationDelay = `${Math.min(index * 35, 210)}ms`;
      els.settlement.append(row);
    });
    els.settlementFooter.textContent = `${items.length} ${plural(items.length, 'операция', 'операции', 'операций')} · Суммы рассчитаны в копейках, округление распределено прозрачно.`;
    reportReady = true;
    els.copy.disabled = false;
  }
  function calculateAndRender() {
    const result = calculate();
    renderMetrics(result);
    const totalSignature=String(result.totalPaid);if(lastTotal!==totalSignature && shell.view==='results')SplitShell.pulse(els.totalPaid);lastTotal=totalSignature;
    renderBalances(result);
    renderSettlement(result);
    if (isItems()) {
      const preview=SplitItemsUI.preview(state);
      if(state.expenseDraft){els.notice.textContent=preview.error || 'Предпросмотр открытого расхода включён в итог. Сначала сохраните расход.';els.notice.dataset.kind='warning';els.copy.disabled=true;reportReady=false;}
      const proposals=SplitItems.proposals(preview.state);
      proposals.forEach((proposal,index)=>{
        const button=action('Отметить выполненным',()=>{
          if(!canLeave())return;
          try{state=SplitItems.complete(state,proposal.operationId,uid());persist();$('#results-heading').focus({preventScroll:true});showToast('Компенсация отмечена выполненной.');}catch(e){showToast(e.message);}
        });button.disabled=!!state.expenseDraft;
        els.settlement.children[index]?.append(button);
      });
    }
    if (Object.keys(drafts).length) {
      els.notice.textContent = 'Исправьте выделенные суммы. Расчёт показан по последним корректным значениям.';
      els.notice.dataset.kind = 'warning'; els.copy.disabled = true; reportReady = false;
    }
  }
  function renderAll() {
    $('#editor-screen').dataset.mode=isItems()?'items':'simple';
    $('#participants-help').textContent=isItems()?'Кто участвует в расходах':'Кто участвует и сколько уже внёс';
    $('.progress-meta').hidden=isItems();els.progressTrack.hidden=isItems();
    $('#target-total').closest('.metric-card').querySelector('.metric-label').textContent=isItems()?'Всего по позициям':'Целевая сумма';
    $('#share-total').closest('.metric-card').querySelector('.metric-label').textContent=isItems()?'Доли участников':'Доля каждого';
    $('#simple-target').hidden=isItems();$('#simple-transfers').hidden=isItems();
    $('#editor-title').dataset.mode=isItems()?'По позициям':'Простой';
    itemsUI.render();
    els.target.value = Object.hasOwn(drafts,'target') ? drafts.target : state.target;
    els.target.validateMoney?.();
    renderPeople();
    renderTransfers();
    calculateAndRender();
    shell.sync();
  }
  function addPerson() {
    if (state.people.length >= 100) { showToast('Можно добавить не более 100 участников.'); return; }
    state.people.push({ id: uid(), name: '', paid: 0 });
    persist();
    const inputs = els.people.querySelectorAll('.person-name');
    inputs[inputs.length - 1]?.focus();
  }
  function addTransfer() {
    if (state.people.length < 2) { showToast('Для перевода нужны минимум два участника.'); return; }
    if (state.transfers.length >= 500) { showToast('Слишком много переводов для одного расчёта.'); return; }
    state.transfers.push({ id: uid(), from: 0, to: 1, amount: 0 });
    persist();
    els.transfers.lastElementChild?.querySelector('.transfer-amount')?.focus();
  }
  function resetAll() {
    drafts = {};
    state = isItems() ? freshItems(DEFAULT_STATE().people) : DEFAULT_STATE();
    reportReady = false;
    persist();
    showToast('Создан новый расчёт.');
  }
  function clearResults() {
    els.balances.replaceChildren();
    els.settlement.replaceChildren();
    const empty1 = el('div', 'empty-state');
    empty1.append(el('span', 'empty-symbol', '↗'), el('strong', '', 'Расчёт очищен'), el('p', '', 'Измените данные, чтобы построить новый итог.'));
    const empty2 = el('div', 'empty-state compact');
    empty2.append(el('span', 'empty-symbol', '⇄'), el('strong', '', 'Здесь появится план переводов'), el('p', '', 'Результат пересчитывается автоматически.'));
    els.balances.append(empty1); els.settlement.append(empty2);
    els.copy.disabled = true; reportReady = false;
    showToast('Отображение результата очищено. Данные сохранены.');
  }
  function setTheme(theme, save = true) {
    document.documentElement.dataset.theme = theme;
    if (save) {
      try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    }
    const isDark = theme === 'dark';
    $('#theme-toggle').setAttribute('aria-label', isDark ? 'Включить светлую тему' : 'Включить тёмную тему');
    $('#theme-toggle').title = isDark ? 'Включить светлую тему' : 'Включить тёмную тему';
    try { $('meta[name="theme-color"]').content = isDark ? '#111216' : '#f4f3f8'; } catch (_) {}
  }

  $('#theme-toggle').addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  $('#add-person').addEventListener('click', addPerson);
  $('#add-transfer').addEventListener('click', addTransfer);
  $('#reset-btn').addEventListener('click', () => {
    $('#reset-description').textContent=isItems()?'Позиции, участники, выполненные компенсации и черновики текущего расчёта будут удалены. Остальная история сохранится. Сначала экспортируйте копию при необходимости.':'Участники, переводы и суммы текущего расчёта будут удалены. При необходимости сначала скачайте копию.';
    if (typeof els.resetDialog.showModal === 'function') els.resetDialog.showModal();
    else if (window.confirm('Удалить участников, переводы и суммы?')) resetAll();
  });
  $('#confirm-reset').addEventListener('click', event => {
    event.preventDefault();
    els.resetDialog.close();
    resetAll();
  });
  $('#clear-results').addEventListener('click', clearResults);
  els.target.parentElement.after(bindMoney(els.target,'target','',raw => { state.target = raw; }));
  els.copy.addEventListener('click', async () => {
    if (!reportReady || !active) return;
    const report=SplitReports.text(SplitReports.build(currentRecord(),{unsaved:saveFailed||storageBlocked}));
    const ok=await SplitShareUI.copyText(report);
    els.copy.focus();showToast(ok?'Итоги скопированы.':'Не удалось скопировать. Откройте «Поделиться» для ручного копирования.');
  });

  function download(raw, filename) {
    if (window.SplitNative?.exportJSON) { window.SplitNative.exportJSON(raw,filename).catch(() => showToast('Сохранение JSON отменено или не выполнено. История не изменена.')); return; }
    const blob = new Blob([raw], {type:'application/json'});
    const url = URL.createObjectURL(blob), link = el('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  function exportRecords(single = false) {
    try {
      if (recoveryRaw !== null && storageBlocked) { download(recoveryRaw,'split-recovery-original.json'); return; }
      let values = history.list();
      if (active) {
        const current = currentRecord(), index = values.findIndex(r => r.id === current.id);
        if (index < 0) values.push(current); else values[index] = current;
      }
      download(SplitHistory.encodeBackup(single && active ? [currentRecord()] : values), single ? 'split-calculation.json' : 'split-history.json');
    } catch (error) { storageError(error); }
  }
  $('#backup-btn').addEventListener('click', () => exportRecords());
  $('#export-history').addEventListener('click', () => exportRecords());
  $('#export-current').addEventListener('click', () => exportRecords(true));

  function action(label, fn, className = 'secondary-button') {
    const button = el('button',className,label); button.type = 'button'; button.addEventListener('click',fn); return button;
  }
  function renderHistory() {
    const list = $('#history-list'); list.replaceChildren();
    const values = history.list().sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
    $('#history-empty').hidden = values.length > 0;
    for (const item of values) {
      const card = el('article','panel history-card');
      const title = el('h2','',item.name), date = el('time','',new Date(item.updatedAt).toLocaleString('ru-RU')); date.dateTime = item.updatedAt;
      const buttons = el('div','history-actions');
      buttons.append(action('Открыть',() => openRecord(item.id)), action('Переименовать',() => renameRecord(item)),
        action('Дублировать',() => {
          if (!canLeave()) return;
          try { history.put({...item,id:uid(),name:(item.name + ' — копия').slice(0,120),updatedAt:SplitHistory.now()}); renderHistory(); storageStatus('Копия сохранена'); }
          catch (e) { storageError(e); }
        }), action('Экспорт JSON',() => download(SplitHistory.encodeBackup([item]),'split-calculation.json')),
        action('Удалить',() => {
          $('#delete-name').textContent = item.name;
          $('#delete-dialog').dataset.recordId = item.id; $('#delete-dialog').showModal();
        }));
      const summary=item.state.mode==='items'?SplitItems.calculate(item.state):SplitCore.calculate(item.state);
      SplitShell.compactActions(buttons,[null,'✎','⧉','↓','×']);
      card.dataset.recordId=item.id;
      card.append(title,el('p','mode-badge',item.state.mode==='items'?'По позициям':'Простой'),el('div','history-card-sum',money(summary.totalPaid)),el('p','history-card-meta',`${item.state.people.length} ${plural(item.state.people.length,'участник','участника','участников')}`),date,buttons); list.append(card);
      if(list.children.length<=6)SplitShell.enter(card);
    }
  }
  function canLeave() {
    if (saveFailed || storageBlocked) { showToast('Скачайте копию и устраните ошибку хранения перед переходом.'); return false; }
    return true;
  }
  function home() {
    if (!canLeave()) return;
    renderHistory(); shell.show('history');
  }
  function openRecord(id) {
    if (!canLeave()) return;
    const item = history.list().find(r => r.id === id); if (!item) return;
    active = item; state = SplitHistory.clone(item.state); drafts = state.drafts || {}; delete state.drafts;
    $('#editor-title').textContent = item.name;
    itemsUI.reopen();shell.resetSection();renderAll();shell.show('calculation');
  }
  function renameRecord(item) {
    if (!canLeave()) return;
    $('#rename-name').value = item.name; $('#rename-dialog').dataset.recordId = item.id; $('#rename-dialog').showModal();
  }
  $('#rename-form').addEventListener('submit',event => {
    event.preventDefault(); const name = $('#rename-name').value.trim(); if (!name) return;
    const item = history.list().find(r => r.id === $('#rename-dialog').dataset.recordId); if (!item) return;
    try {
      const updated = {...item,name,updatedAt:SplitHistory.now()}; history.put(updated);
      if (active?.id === item.id) { active = updated; $('#editor-title').textContent = name; }
      $('#rename-dialog').close(); renderHistory(); storageStatus('Название сохранено');
    } catch (e) { storageError(e); }
  });
  $('#confirm-delete').addEventListener('click',() => {
    if (!canLeave()) return;
    try {
      const id=$('#delete-dialog').dataset.recordId;history.remove(id);if(active?.id===id)active=null;
      $('#delete-dialog').close();shell.sync();storageStatus('Расчёт удалён');
      const card=$('#history-list').querySelector(`[data-record-id="${id}"]`);SplitShell.exit(card).then(()=>{renderHistory();$('#history-heading').focus({preventScroll:true});});
    }
    catch (e) { storageError(e); }
  });
  $('#create-calculation').addEventListener('click',() => {
    if (!canLeave()) return;
    try {
      const item = {id:uid(),name:'Новый расчёт',updatedAt:SplitHistory.now(),state:$('#new-mode').value==='items'?freshItems(DEFAULT_STATE().people):{...DEFAULT_STATE(),drafts:{}}};
      history.put(item); openRecord(item.id);
    } catch (e) { storageError(e); }
  });
  $('#switch-mode').addEventListener('click',()=>{if(canLeave())$('#mode-dialog').showModal();});
  $('#confirm-mode').addEventListener('click',()=>{
    if(!active || !canLeave())return;
    try{
      const next=isItems()?{...DEFAULT_STATE(),people:state.people.map(p=>({id:p.id,name:p.name,paid:0})),drafts:{}}:freshItems(state.people);
      history.switchMode(active.id,next);$('#mode-dialog').close();openRecord(active.id);showToast('Исходный расчёт сохранён отдельной копией.');
    }catch(e){storageError(e);}
  });
  $('#back-history').addEventListener('click',home);
  $('.brand').addEventListener('click',event => { event.preventDefault(); home(); });
  $('#rename-current').addEventListener('click',() => { if (active) renameRecord(active); });
  for (const button of document.querySelectorAll('[data-close-dialog]')) button.addEventListener('click',() => button.closest('dialog').close());
  $('#import-file').addEventListener('change',async event => {
    const file = event.target.files[0]; event.target.value = ''; pendingImport = null; $('#confirm-import').disabled = true;
    if (!file) return;
    const generation = ++importGeneration;
    $('#import-dialog').showModal(); $('#import-preview').textContent = 'Чтение файла…';
    try {
      if (file.size > SplitHistory.MAX_BYTES) throw new Error('Файл больше 10 МБ.');
      const raw = await file.text();
      if (generation !== importGeneration) return;
      const incoming = SplitHistory.decodeBackup(raw);
      const plan = SplitHistory.planImport(history.recoveryList(),incoming);
      const summary = el('p','',`Добавится: ${plan.added.length}. Уже есть: ${plan.skipped.length}. Конфликты ID (будут копиями): ${plan.conflicts.length}. Существующие расчёты сохранятся.`);
      if (history.loadFailed) summary.append(document.createTextNode(' Повреждённый оригинал будет сохранён отдельно на устройстве до восстановления. Рекомендуем также скачать исходную копию.'));
      const list = el('ul'); for (const item of incoming) list.append(el('li','',`${item.name} · ${new Date(item.updatedAt).toLocaleString('ru-RU')} · ${item.state.people.length} участн.`));
      $('#import-preview').replaceChildren(summary,list); pendingImport = incoming; $('#confirm-import').disabled = false;
    } catch (_) { if (generation !== importGeneration) return; $('#import-preview').textContent = 'Не удалось прочитать файл: неверный JSON, версия, данные или превышены лимиты. История не изменена.'; }
  });
  $('#import-dialog').addEventListener('close',() => { if (!$('#import-dialog').open) { pendingImport = null; importGeneration++; } });
  $('#confirm-import').addEventListener('click',() => {
    if (!pendingImport || (!history.loadFailed && !canLeave())) return;
    try {
      const plan = history.loadFailed ? history.recover(pendingImport) : history.restore(pendingImport);
      storageBlocked = false; saveFailed = false; recoveryRaw = null; pendingImport = null; $('#import-dialog').close();
      renderHistory(); storageStatus(`Восстановлено: ${plan.added.length}. Повторы пропущены: ${plan.skipped.length}.`);
    } catch (e) { storageError(e); }
  });
  window.addEventListener('storage',event => {
    if ((event.key === STORAGE_KEY || event.key === null) && event.newValue !== history.snapshot) {
      history.blocked = true; storageBlocked = true; storageStatus('Данные изменены в другой вкладке. Скачайте копию и перезагрузите страницу.',true);
    }
  });
  window.addEventListener('beforeunload',event => {
    if (saveFailed || storageBlocked) { event.preventDefault(); event.returnValue = ''; }
  });
  SplitShareUI.create({record:currentRecord,unsaved:()=>saveFailed||storageBlocked,toast:showToast});
  safeLoad();
  // Preserve the original theme preference key during migration.
  try {
    const oldTheme = localStorage.getItem('theme');
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (!savedTheme && (oldTheme === 'dark' || oldTheme === 'light')) setTheme(oldTheme);
    else setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', false);
  } catch (_) {}
  renderAll();
  SplitShell.compactActions($('.editor-navigation'),[null,'⇄','✎','↓']);
  renderHistory();shell.sync();
})();
