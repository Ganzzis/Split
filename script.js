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

  const STORAGE_KEY = 'split-state-v2';
  const THEME_KEY = 'split-theme';
  const DEFAULT_STATE = () => ({
    target: '',
    people: [{ id: uid(), name: '', paid: 0 }, { id: uid(), name: '', paid: 0 }],
    transfers: []
  });
  let state = DEFAULT_STATE();
  let toastTimer = null;
  let lastReport = '';

  function uid() {
    try { return crypto.randomUUID(); }
    catch (_) { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
  }
  function toCents(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.round((number + Number.EPSILON) * 100);
  }
  function money(cents) {
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format((Number.isFinite(cents) ? cents : 0) / 100) + ' ₽';
  }
  function moneyPlain(cents) {
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format((Number.isFinite(cents) ? cents : 0) / 100);
  }
  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
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
  function safeLoad() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Migrate the original app's separate keys where possible.
        const oldPeople = localStorage.getItem('people');
        const oldTransfers = localStorage.getItem('transfers');
        if (oldPeople || oldTransfers) {
          const parsedPeople = oldPeople ? JSON.parse(oldPeople) : [];
          const parsedTransfers = oldTransfers ? JSON.parse(oldTransfers) : [];
          state.people = Array.isArray(parsedPeople) ? parsedPeople.map(p => ({
            id: uid(), name: String(p?.name ?? '').slice(0, 80), paid: toCents(p?.paid) / 100
          })) : [];
          state.transfers = Array.isArray(parsedTransfers) ? parsedTransfers.map(t => ({
            id: uid(), from: Number(t?.from) || 0, to: Number(t?.to) || 1, amount: toCents(t?.amount) / 100
          })) : [];
          state.target = localStorage.getItem('target') || '';
          normalizeState();
          persist(false);
          return;
        }
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid saved state');
      state = {
        target: typeof parsed.target === 'string' || typeof parsed.target === 'number' ? String(parsed.target) : '',
        people: Array.isArray(parsed.people) ? parsed.people.map(p => ({
          id: typeof p?.id === 'string' ? p.id : uid(),
          name: String(p?.name ?? '').slice(0, 80),
          paid: toCents(p?.paid) / 100
        })) : [],
        transfers: Array.isArray(parsed.transfers) ? parsed.transfers.map(t => ({
          id: typeof t?.id === 'string' ? t.id : uid(),
          from: Number.isInteger(Number(t?.from)) ? Number(t.from) : 0,
          to: Number.isInteger(Number(t?.to)) ? Number(t.to) : 1,
          amount: toCents(t?.amount) / 100
        })) : []
      };
      normalizeState();
    } catch (error) {
      console.warn('Не удалось прочитать сохранённые данные Split:', error);
      state = DEFAULT_STATE();
      showToast('Сохранённые данные повреждены — создан новый расчёт.');
    }
  }
  function normalizeState() {
    if (!Array.isArray(state.people)) state.people = [];
    if (state.people.length === 0) state.people = [{ id: uid(), name: '', paid: 0 }];
    state.people = state.people.slice(0, 100).map(p => ({
      id: p.id || uid(), name: String(p.name || '').slice(0, 80), paid: toCents(p.paid) / 100
    }));
    const maxIndex = state.people.length - 1;
    state.transfers = (Array.isArray(state.transfers) ? state.transfers : []).filter(t =>
      Number.isInteger(t.from) && Number.isInteger(t.to) &&
      t.from >= 0 && t.from <= maxIndex && t.to >= 0 && t.to <= maxIndex && t.from !== t.to
    ).slice(0, 500).map(t => ({
      id: t.id || uid(), from: t.from, to: t.to, amount: toCents(t.amount) / 100
    }));
    state.target = String(state.target ?? '');
  }
  function persist(shouldRender = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      // Remove old keys after successful migration to the new state shape.
      localStorage.removeItem('people');
      localStorage.removeItem('transfers');
      localStorage.removeItem('target');
    } catch (error) {
      console.warn('Не удалось сохранить данные Split:', error);
      showToast('Не удалось сохранить данные. Проверьте свободное место браузера.');
    }
    if (shouldRender) renderAll();
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
  function makeMoneyInput(className, value, placeholder, onChange, label) {
    const wrap = el('div', 'money-small');
    const input = el('input', className);
    input.type = 'number';
    input.min = '0';
    input.step = '0.01';
    input.inputMode = 'decimal';
    input.value = value ? String(value) : '';
    input.placeholder = placeholder;
    input.setAttribute('aria-label', label);
    input.addEventListener('change', () => {
      const val = input.value.trim();
      if (val && (!Number.isFinite(Number(val)) || Number(val) < 0)) {
        input.value = '0';
        showToast('Введите сумму не меньше нуля.');
      }
      onChange(toCents(input.value) / 100);
    });
    wrap.append(input, el('span', '', '₽'));
    return wrap;
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
        calculateAndRender();
        persist(false);
      });
      const paid = makeMoneyInput('person-paid', person.paid, 'Внёс', value => {
        person.paid = value; calculateAndRender(); persist(false);
      }, `Сколько внёс участник ${index + 1}`);
      row.append(avatar, name, paid, makeRemoveButton('Удалить участника', () => removePerson(index)));
      els.people.append(row);
    });
    els.peopleCount.textContent = `${state.people.length} ${plural(state.people.length, 'участник', 'участника', 'участников')}`;
  }
  function refreshTransferOptions() {
    els.transfers.querySelectorAll('select[data-transfer-id]').forEach(select => {
      const transfer = state.transfers.find(t => t.id === select.dataset.transferId);
      if (!transfer) return;
      const previous = select.value;
      select.replaceChildren();
      state.people.forEach((person, index) => {
        const option = el('option', '', personName(person, index));
        option.value = String(index);
        select.append(option);
      });
      const wanted = select.dataset.side === 'from' ? transfer.from : transfer.to;
      select.value = String(wanted);
      if (previous !== select.value) select.dispatchEvent(new Event('change', { bubbles: true }));
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
        transfer.amount = value; calculateAndRender(); persist(false);
      }, `Сумма перевода ${index + 1}`);
      row.append(from, arrow, to, amount, makeRemoveButton('Удалить перевод', () => {
        state.transfers.splice(index, 1); persist();
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
      transfer[side] = Number(select.value);
      if (transfer.from === transfer.to && state.people.length > 1) {
        transfer[side] = side === 'from' ? (transfer.to + 1) % state.people.length : (transfer.from + 1) % state.people.length;
        select.value = String(transfer[side]);
        showToast('Отправитель и получатель должны отличаться.');
      }
      calculateAndRender(); persist(false);
    });
    return select;
  }
  function removePerson(index) {
    if (state.people.length <= 1) {
      showToast('В расчёте должен остаться хотя бы один участник.');
      return;
    }
    state.people.splice(index, 1);
    // Remove transfers touching the deleted participant and shift indexes above it.
    state.transfers = state.transfers.filter(t => t.from !== index && t.to !== index).map(t => ({
      ...t, from: t.from > index ? t.from - 1 : t.from, to: t.to > index ? t.to - 1 : t.to
    }));
    persist();
    showToast('Участник удалён. Связанные переводы обновлены.');
  }
  function plural(n, one, few, many) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }

  // Calculate integer kopecks to avoid floating-point rounding drift.
  function calculate() {
    const n = state.people.length;
    const contributions = state.people.map(p => toCents(p.paid));
    const totalPaid = contributions.reduce((sum, value) => sum + value, 0);
    const explicitTarget = state.target.trim() !== '' && Number.isFinite(Number(state.target));
    const target = explicitTarget ? toCents(state.target) : totalPaid;
    const shareBase = Math.floor(target / Math.max(n, 1));
    let remainder = target - shareBase * n;
    const shares = state.people.map(() => shareBase);
    // Distribute remaining kopecks deterministically so shares sum exactly to the target.
    for (let i = 0; i < shares.length && remainder > 0; i++, remainder--) shares[i]++;

    const net = contributions.slice();
    state.transfers.forEach(t => {
      const amount = toCents(t.amount);
      if (t.from < 0 || t.to < 0 || t.from >= n || t.to >= n || t.from === t.to) return;
      net[t.from] -= amount; // sender pays
      net[t.to] += amount;   // receiver gets
    });
    const balances = net.map((value, i) => value - shares[i]);
    const delta = target - totalPaid; // positive: still needs to be collected into the shared pot
    const progress = target > 0 ? Math.min(100, (totalPaid / target) * 100) : (totalPaid > 0 ? 100 : 0);
    const gap = Math.abs(target - totalPaid);

    // Settle participant-to-participant balances with a greedy minimum-transfer plan.
    const creditors = [];
    const debtors = [];
    balances.forEach((value, i) => {
      if (value > 0) creditors.push({ i, amount: value });
      else if (value < 0) debtors.push({ i, amount: -value });
    });
    const debtorsTotal = debtors.reduce((s, x) => s + x.amount, 0);
    const creditorsTotal = creditors.reduce((s, x) => s + x.amount, 0);
    const settlement = [];
    let di = 0, ci = 0;
    while (di < debtors.length && ci < creditors.length) {
      const d = debtors[di], c = creditors[ci];
      const amount = Math.min(d.amount, c.amount);
      if (amount > 0) settlement.push({ from: d.i, to: c.i, amount });
      d.amount -= amount; c.amount -= amount;
      if (d.amount === 0) di++;
      if (c.amount === 0) ci++;
    }
    // The target pool is explicitly represented when contributions do not match the target.
    const cashFlows = [];
    if (delta > 0) {
      // Amount still due to the shared pot; positive balances can be refunds/overpayments.
      debtors.forEach(d => { if (d.amount > 0) cashFlows.push({ kind: 'pot-in', from: d.i, amount: d.amount }); });
    } else if (delta < 0) {
      // Excess money in the pot is returned to those who have overpaid relative to their share.
      creditors.forEach(c => { if (c.amount > 0) cashFlows.push({ kind: 'pot-out', to: c.i, amount: c.amount }); });
    }
    return { n, contributions, totalPaid, target, shares, net, balances, progress, gap, delta, settlement, cashFlows, debtorsTotal, creditorsTotal };
  }
  function setText(selector, text) { $(selector).textContent = text; }
  function renderMetrics(result) {
    setText('#total-paid', moneyPlain(result.totalPaid));
    setText('#target-total', money(result.target));
    setText('#share-total', money(Math.floor(result.target / Math.max(result.n, 1))));
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
    els.notice.dataset.kind = kind;
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
        amount.classList.add('positive'); amount.textContent = `+${money(balance)}`; status.textContent = 'Переплатил';
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
      lastReport = `Split — взаиморасчёты\nЦелевая сумма: ${money(result.target)}\nВнесено: ${money(result.totalPaid)}\nПереводы не требуются.`;
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
    lastReport = [
      'Split — взаиморасчёты',
      `Целевая сумма: ${money(result.target)}`,
      `Внесено: ${money(result.totalPaid)}`,
      '',
      ...items.map(item => `${item.from} → ${item.to}: ${money(item.amount)}`)
    ].join('\n');
    els.copy.disabled = false;
  }
  function calculateAndRender() {
    const result = calculate();
    renderMetrics(result);
    renderBalances(result);
    renderSettlement(result);
  }
  function renderAll() {
    els.target.value = state.target;
    renderPeople();
    renderTransfers();
    calculateAndRender();
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
    els.transfers.querySelector('.transfer-amount:last-of-type')?.focus();
  }
  function resetAll() {
    state = DEFAULT_STATE();
    lastReport = '';
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
    els.copy.disabled = true; lastReport = '';
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
    try { $('meta[name="theme-color"]').content = isDark ? '#111019' : '#f5f4f9'; } catch (_) {}
  }

  $('#theme-toggle').addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  $('#add-person').addEventListener('click', addPerson);
  $('#add-transfer').addEventListener('click', addTransfer);
  $('#reset-btn').addEventListener('click', () => {
    if (typeof els.resetDialog.showModal === 'function') els.resetDialog.showModal();
    else if (window.confirm('Удалить участников, переводы и суммы?')) resetAll();
  });
  $('#confirm-reset').addEventListener('click', event => {
    event.preventDefault();
    els.resetDialog.close();
    resetAll();
  });
  $('#clear-results').addEventListener('click', clearResults);
  els.target.addEventListener('input', () => {
    const raw = els.target.value;
    if (raw !== '' && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) {
      els.target.value = '0';
      showToast('Целевая сумма не может быть отрицательной.');
    }
    state.target = els.target.value;
    calculateAndRender();
    persist(false);
  });
  els.copy.addEventListener('click', async () => {
    if (!lastReport) return;
    try {
      await navigator.clipboard.writeText(lastReport);
      showToast('Итоги скопированы в буфер обмена.');
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = lastReport;
      area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.append(area); area.select();
      const ok = document.execCommand('copy'); area.remove();
      showToast(ok ? 'Итоги скопированы.' : 'Не удалось скопировать. Выделите текст вручную.');
    }
  });

  safeLoad();
  // Preserve the original theme preference key during migration.
  try {
    const oldTheme = localStorage.getItem('theme');
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (!savedTheme && (oldTheme === 'dark' || oldTheme === 'light')) setTheme(oldTheme);
    else setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', false);
  } catch (_) {}
  renderAll();
})();