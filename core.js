/* Integer kopecks; no binary floating-point rounding of decimal input. */
(function(root) {
  'use strict';
  const MAX_RUBLES = 1000000000;
  function toCents(value) {
    const raw = String(value ?? '').trim().replace(',', '.');
    if (!raw) return 0;
    if (!/^\d+(?:\.\d*)?$/.test(raw)) throw new RangeError('Введите неотрицательную сумму');
    const [whole, fraction = ''] = raw.split('.');
    const rubles = Number(whole);
    if (!Number.isSafeInteger(rubles) || rubles > MAX_RUBLES) throw new RangeError('Максимум 1 млрд ₽');
    const cents = rubles * 100 + Number((fraction + '00').slice(0,2)) + (Number(fraction[2] || 0) >= 5 ? 1 : 0);
    if (cents > MAX_RUBLES * 100) throw new RangeError('Максимум 1 млрд ₽');
    return cents;
  }
  function calculate(state) {
    if (!state || !Array.isArray(state.people) || !state.people.length || state.people.length > 100 || !Array.isArray(state.transfers) || state.transfers.length > 500) throw new RangeError('Invalid state');
    const n = state.people.length;
    const contributions = state.people.map(p => toCents(p.paid));
    const totalPaid = contributions.reduce((sum, value) => sum + value, 0);
    const explicitTarget = String(state.target ?? '').trim() !== '';
    const target = explicitTarget ? toCents(state.target) : totalPaid;
    const shareBase = Math.floor(target / Math.max(n, 1));
    let remainder = target - shareBase * n;
    const shares = state.people.map(() => shareBase);
    // Distribute remaining kopecks deterministically so shares sum exactly to the target.
    for (let i = 0; i < shares.length && remainder > 0; i++, remainder--) shares[i]++;

    const net = contributions.slice();
    state.transfers.forEach(t => {
      const amount = toCents(t.amount);
      if (!Number.isInteger(t.from) || !Number.isInteger(t.to) || t.from < 0 || t.to < 0 || t.from >= n || t.to >= n || t.from === t.to) throw new RangeError('Invalid transfer');
      net[t.from] += amount; // completed compensation reduces debt
      net[t.to] -= amount; // completed compensation reduces credit
    });
    const balances = net.map((value, i) => value - shares[i]);
    const delta = target - totalPaid; // positive: still needs to be collected into the shared pot
    const progress = target > 0 ? Math.min(100, (totalPaid / target) * 100) : (totalPaid > 0 ? 100 : 0);
    const gap = Math.abs(target - totalPaid);

    // Settle participant-to-participant balances with a deterministic greedy plan (not guaranteed globally minimal).
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
  const api = Object.freeze({toCents, calculate, MAX_RUBLES});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SplitCore = api;
})(globalThis);
