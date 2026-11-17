'use strict';

/* =========================================================
   Pitaka — Personal Finance App
   Plain JavaScript, data stored in localStorage.
   ========================================================= */

const STORAGE_KEY = 'pitaka-data-v1';
const COLORS = ['#4f6bff', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b', '#14b8a6', '#a855f7'];
const DEFAULT_CATEGORIES = [
  ['Food & Groceries', 'need'], ['Dining Out', 'want'], ['Transportation', 'need'], ['Housing & Rent', 'need'],
  ['Utilities', 'need'], ['Health', 'need'], ['Shopping', 'want'], ['Entertainment', 'want'],
  ['Education', 'need'], ['Personal Care', 'want'], ['Savings & Investments', 'saving'], ['Other', 'want'],
];
const TYPE_LABELS = { need: 'Need', want: 'Want', saving: 'Saving' };
const POPULAR_CURRENCIES = ['PHP', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'AUD', 'CAD', 'NZD', 'HKD', 'CNY', 'TWD', 'KRW', 'AED', 'SAR', 'QAR', 'KWD', 'INR', 'MYR', 'IDR', 'THB', 'VND', 'CHF'];

/** Every currency the browser knows, popular ones first. */
function allCurrencies() {
  let all = [];
  try { all = Intl.supportedValuesOf('currency'); } catch { /* older browsers */ }
  return [...new Set([...POPULAR_CURRENCIES, ...all])];
}
function currencyName(code) {
  try { return new Intl.DisplayNames(undefined, { type: 'currency' }).of(code) || code; } catch { return code; }
}
function currencySymbol(code) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find(p => p.type === 'currency').value;
  } catch { return code; }
}
const currencyLabel = code => `${code} — ${currencyName(code)} (${currencySymbol(code)})`;

/* ---------- Utilities ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const pad = n => String(n).padStart(2, '0');
const sum = arr => arr.reduce((a, b) => a + b, 0);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const toDateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toDateStr(new Date());
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000); // b - a in days
const monthOf = s => s.slice(0, 7);
const currentMonth = () => monthOf(todayStr());
const shiftMonth = (key, n) => { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const daysInMonth = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const monthLabel = (key, opts = { month: 'long', year: 'numeric' }) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, opts); };
const fmtDay = s => parseDate(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const pct = x => `${Math.round(x * 100)}%`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const roundNice = x => { const step = x >= 1000 ? 100 : x >= 100 ? 50 : 10; return Math.ceil(x / step) * step; };

function money(n) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: state.settings.currency, maximumFractionDigits: 2 }).format(n || 0);
  } catch {
    return `${state.settings.currency} ${(n || 0).toFixed(2)}`;
  }
}

/** Fraction of the month that has passed (0 = future, 1 = past). */
function elapsed(month) {
  const cur = currentMonth();
  if (month < cur) return 1;
  if (month > cur) return 0;
  return new Date().getDate() / daysInMonth(month);
}

/* ---------- State ---------- */
function defaultState() {
  return {
    version: 1,
    settings: { currency: 'PHP' },
    categories: DEFAULT_CATEGORIES.map(([name, type], i) => ({ id: uid(), name, type, color: COLORS[i % COLORS.length] })),
    income: [],
    expenses: [],
    budgets: {},
    bills: [],
    goals: [],
    stats: { receiptsSnapped: 0 },
    rewards: { stars: null, badges: [] },
  };
}

function normalize(d) {
  const base = defaultState();
  return {
    ...base, ...d,
    settings: { ...base.settings, ...(d.settings || {}) },
    categories: Array.isArray(d.categories) && d.categories.length ? d.categories : base.categories,
    income: Array.isArray(d.income) ? d.income : [],
    expenses: Array.isArray(d.expenses) ? d.expenses : [],
    budgets: d.budgets && typeof d.budgets === 'object' ? d.budgets : {},
    bills: Array.isArray(d.bills) ? d.bills : [],
    goals: Array.isArray(d.goals) ? d.goals : [],
    stats: { ...base.stats, ...(d.stats || {}) },
    rewards: { ...base.rewards, ...(d.rewards || {}) },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.error('Could not load data', e); }
  return defaultState();
}

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

let state = load();
const ui = { view: 'dashboard', month: currentMonth(), editing: { income: null, expense: null, bill: null }, expenseFilter: '', receipt: null, animate: true };

/* ---------- Queries ---------- */
const catById = id => state.categories.find(c => c.id === id) || { id, name: 'Uncategorized', type: 'want', color: '#94a3b8' };
const incomeIn = m => state.income.filter(i => monthOf(i.date) === m);
const expensesIn = m => state.expenses.filter(e => monthOf(e.date) === m);
const totalIncome = m => sum(incomeIn(m).map(i => i.amount));
const totalExpenses = m => sum(expensesIn(m).map(e => e.amount));

function spentByCategory(m) {
  const out = {};
  for (const e of expensesIn(m)) out[e.categoryId] = (out[e.categoryId] || 0) + e.amount;
  return out;
}

/** Budgets for a month. If none are set, carries over the most recent earlier month's budgets. */
function budgetsFor(m) {
  if (state.budgets[m]) return { budgets: state.budgets[m], inherited: null };
  const earlier = Object.keys(state.budgets).filter(k => k < m).sort();
  const k = earlier[earlier.length - 1];
  return k ? { budgets: state.budgets[k], inherited: k } : { budgets: {}, inherited: null };
}

/** Category ids in display order: known categories first, then any orphaned ids. */
function orderedCategoryIds(...maps) {
  const ids = new Set();
  for (const mp of maps) for (const [id, v] of Object.entries(mp)) if (v) ids.add(id);
  const known = state.categories.map(c => c.id).filter(id => ids.has(id));
  return [...known, ...[...ids].filter(id => !known.includes(id))];
}

/* ---------- Bills ---------- */
function billDue(bill, m) {
  if (bill.recurrence === 'once') return bill.dueDate && monthOf(bill.dueDate) === m ? bill.dueDate : null;
  if (bill.startMonth && m < bill.startMonth) return null;
  return `${m}-${pad(Math.min(bill.dueDay, daysInMonth(m)))}`;
}

function billStatus(bill, m) {
  const due = billDue(bill, m);
  if (!due) return null;
  const paid = bill.paid && bill.paid[m];
  if (paid) return { due, status: 'paid', paidOn: paid.date, late: paid.date > due };
  const days = daysBetween(todayStr(), due);
  return { due, days, status: days < 0 ? 'overdue' : days <= 3 ? 'due-soon' : 'upcoming' };
}

function statusText(s) {
  if (s.status === 'paid') return `Paid ${fmtDay(s.paidOn)}${s.late ? ' (late)' : ''}`;
  if (s.status === 'overdue') return `Overdue ${-s.days}d`;
  if (s.days === 0) return 'Due today';
  if (s.days === 1) return 'Due tomorrow';
  return `Due in ${s.days}d`;
}

/** Unpaid bills that are overdue (last 3 months) or due within the next 14 days. */
function billsNeedingAttention() {
  const cur = currentMonth();
  const items = [];
  for (const m of [shiftMonth(cur, -2), shiftMonth(cur, -1), cur, shiftMonth(cur, 1)]) {
    for (const bill of state.bills) {
      const s = billStatus(bill, m);
      if (!s || s.status === 'paid') continue;
      if (s.status === 'overdue' || s.days <= 14) items.push({ bill, month: m, ...s });
    }
  }
  return items.sort((a, b) => a.due.localeCompare(b.due));
}

function markBillPaid(billId, m) {
  const bill = state.bills.find(b => b.id === billId);
  if (!bill) return;
  let expenseId = null;
  if (bill.logExpense !== false) {
    expenseId = uid();
    state.expenses.push({ id: expenseId, date: todayStr(), categoryId: bill.categoryId, amount: bill.amount, note: `Bill: ${bill.name}`, billId: bill.id });
  }
  bill.paid = bill.paid || {};
  bill.paid[m] = { date: todayStr(), expenseId };
  save();
  toast(`${bill.name} marked as paid${expenseId ? ' and logged as an expense' : ''}.`);
  if (expenseId) setTimeout(() => checkCategoryBudget(bill.categoryId, currentMonth()), 0);
}

function unmarkBillPaid(billId, m) {
  const bill = state.bills.find(b => b.id === billId);
  if (!bill || !bill.paid || !bill.paid[m]) return;
  const { expenseId } = bill.paid[m];
  if (expenseId) state.expenses = state.expenses.filter(e => e.id !== expenseId);
  delete bill.paid[m];
  save();
  toast(`${bill.name} marked as unpaid.`);
}

/* ---------- Insights & suggestions ---------- */
function buildInsights(m) {
  const out = [];
  const prev = shiftMonth(m, -1);
  const inc = totalIncome(m), exp = totalExpenses(m);
  const pInc = totalIncome(prev), pExp = totalExpenses(prev);
  const spent = spentByCategory(m), pSpent = spentByCategory(prev);
  const { budgets } = budgetsFor(m);
  const el = elapsed(m);
  const inProgress = el > 0 && el < 1;
  const monthExpenses = expensesIn(m);

  if (!inc && !exp) {
    out.push({ level: 'info', title: 'No data yet', text: 'Log your income and expenses for this month to get a personalized summary and tips.' });
    return out;
  }

  const byType = { need: 0, want: 0, saving: 0 };
  for (const [id, v] of Object.entries(spent)) byType[catById(id).type || 'want'] += v;
  const saved = inc - (exp - byType.saving); // money not consumed (includes savings transfers)

  // Overall balance & savings rate
  if (inc > 0) {
    const rate = saved / inc;
    if (exp > inc) {
      out.push({ level: 'danger', title: 'You spent more than you earned', text: `Expenses exceeded income by ${money(exp - inc)}. Next month, aim to cut at least that amount — start with your "want" categories (${money(byType.want)} this month).` });
    } else if (rate < 0.1) {
      out.push({ level: 'danger', title: `Low savings rate: ${pct(rate)}`, text: `Try to keep at least 20% of income (${money(inc * 0.2)}). "Pay yourself first": move savings to a separate account on payday before spending.` });
    } else if (rate < 0.2) {
      out.push({ level: 'warn', title: `Savings rate: ${pct(rate)}`, text: `You're close! Saving ${money(inc * 0.2 - saved)} more would get you to the recommended 20%.` });
    } else {
      out.push({ level: 'good', title: `Great savings rate: ${pct(rate)}`, text: `You kept ${money(saved)} of your income. Consider putting it toward an emergency fund (3–6 months of expenses) or investments.` });
    }

    // 50/30/20 rule
    if (byType.want / inc > 0.3) {
      out.push({ level: 'warn', title: `Wants are ${pct(byType.want / inc)} of income`, text: `The 50/30/20 guideline suggests keeping wants (dining out, shopping, entertainment…) at 30% or less. Getting there frees up ${money(byType.want - inc * 0.3)}.` });
    }
    if (byType.need / inc > 0.5) {
      out.push({ level: 'info', title: `Needs are ${pct(byType.need / inc)} of income`, text: 'Essentials are above 50%. Review fixed costs — phone/internet plans, subscriptions, utilities usage, transport — for cheaper options.' });
    }
  } else if (exp > 0) {
    out.push({ level: 'warn', title: 'No income logged', text: 'You logged expenses but no income for this month. Add your income to see your savings rate.' });
  }

  // Budget performance
  for (const [id, b] of Object.entries(budgets)) {
    if (!b) continue;
    const s = spent[id] || 0;
    const c = catById(id);
    if (c.type === 'saving') {
      if (el === 1 && s >= b) out.push({ level: 'good', title: `Savings target reached`, text: `You put ${money(s)} into ${c.name}, meeting your ${money(b)} target.` });
      continue;
    }
    if (s > b) {
      out.push({ level: 'warn', title: `${c.name} is over budget`, text: `Spent ${money(s)} of ${money(b)} — ${money(s - b)} over (${pct(s / b - 1)}). Next month, try a weekly limit of about ${money(b / 4.345)} and check it every week.` });
    } else if (inProgress && s / el > b * 1.05) {
      out.push({ level: 'warn', title: `${c.name} is on pace to overspend`, text: `At this rate you'll spend about ${money(s / el)} against a ${money(b)} budget. Keep the rest of the month under ${money(b - s)}.` });
    } else if (el === 1 && s < b * 0.6 && b - s >= 1) {
      out.push({ level: 'good', title: `${c.name} came in well under budget`, text: `You used only ${pct(s / b)} of the budget. You could lower it to ~${money(roundNice(s * 1.1))} and move the ${money(b - s)} difference to savings.` });
    }
  }

  // Spending with no budget
  const unbudgeted = Object.entries(spent).filter(([id, v]) => v > 0 && !budgets[id]);
  if (unbudgeted.length) {
    const list = unbudgeted.sort((a, b) => b[1] - a[1]).map(([id, v]) => `${catById(id).name} (${money(v)})`).join(', ');
    out.push({ level: 'info', title: 'Spending without a budget', text: `${list}. Set budgets for these categories so you can track them.` });
  }

  // Big jumps vs last month
  if (pExp > 0) {
    for (const id of orderedCategoryIds(spent)) {
      const s = spent[id] || 0, p = pSpent[id] || 0;
      if (p > 0 && s > p * 1.25 && s - p >= exp * 0.03) {
        out.push({ level: 'info', title: `${catById(id).name} is up ${pct(s / p - 1)} vs last month`, text: `${money(s)} vs ${money(p)} in ${monthLabel(prev, { month: 'long' })} (+${money(s - p)}). Check what changed and whether it was planned.` });
      }
    }
  }

  // Frequent small purchases
  const counts = {};
  for (const e of monthExpenses) counts[e.categoryId] = (counts[e.categoryId] || 0) + 1;
  for (const [id, n] of Object.entries(counts)) {
    const c = catById(id);
    if (n >= 10 && c.type === 'want') {
      out.push({ level: 'info', title: `Frequent ${c.name} purchases`, text: `${n} transactions averaging ${money(spent[id] / n)}. Small purchases add up — try planning them ahead or a weekly "no-spend" day.` });
    }
  }

  // Largest single expense
  if (monthExpenses.length > 3) {
    const big = monthExpenses.reduce((a, b) => (b.amount > a.amount ? b : a));
    if (big.amount >= exp * 0.25 && !big.billId) {
      out.push({ level: 'info', title: 'Largest expense', text: `${money(big.amount)} on ${catById(big.categoryId).name}${big.note ? ` (${big.note})` : ''} was ${pct(big.amount / exp)} of your spending. If it happens yearly, set aside a little each month for it.` });
    }
  }

  // Income change
  if (pInc > 0 && !inProgress && inc < pInc * 0.85) {
    out.push({ level: 'warn', title: `Income dropped ${pct(1 - inc / pInc)}`, text: `You earned ${money(inc)} vs ${money(pInc)} last month. Adjust next month's budgets to match your expected income.` });
  }

  // Bills
  const billStats = state.bills.map(b => billStatus(b, m)).filter(Boolean);
  const overdue = billStats.filter(s => s.status === 'overdue').length;
  const late = billStats.filter(s => s.status === 'paid' && s.late).length;
  if (overdue) out.push({ level: 'danger', title: `${overdue} bill${overdue > 1 ? 's' : ''} overdue`, text: 'Pay overdue bills as soon as possible to avoid late fees and interest. Autopay or reminders a few days before the due date help.' });
  if (late) out.push({ level: 'warn', title: `${late} bill${late > 1 ? 's were' : ' was'} paid late`, text: 'Late payments can mean penalties. Try scheduling bill payments right after payday.' });
  if (billStats.length && !overdue && !late && el === 1) out.push({ level: 'good', title: 'All bills paid on time', text: 'Nice work staying on top of your due dates.' });

  // Overall trend
  if (pExp > 0 && !inProgress) {
    if (exp < pExp) out.push({ level: 'good', title: `Spending down ${pct(1 - exp / pExp)} vs last month`, text: `You spent ${money(pExp - exp)} less than in ${monthLabel(prev, { month: 'long' })}. Keep it up!` });
    else if (exp > pExp * 1.1) out.push({ level: 'warn', title: `Spending up ${pct(exp / pExp - 1)} vs last month`, text: `You spent ${money(exp - pExp)} more than in ${monthLabel(prev, { month: 'long' })}.` });
  }

  // Savings goals (only for the current month's summary)
  if (m === currentMonth()) {
    for (const g of state.goals) {
      const gi = goalInfo(g);
      if (gi.done || !g.deadline) continue;
      if (gi.overdue) out.push({ level: 'warn', title: `${g.name}: target date passed`, text: `You still need ${money(gi.left)}. Pick a new target date that feels realistic.` });
      else if (!gi.onTrack) out.push({ level: 'info', title: `${g.name} goal is behind schedule`, text: `Save about ${money(gi.needPerMonth)} a month to reach ${money(g.target)} on time.` });
    }
  }

  const order = { danger: 0, warn: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** Suggested budgets for the month after `m`, based on up to 3 months of spending. */
function suggestBudgets(m) {
  const months = [];
  for (let i = 0; i < 3; i++) {
    const k = shiftMonth(m, -i);
    if (!expensesIn(k).length) continue;
    const e = elapsed(k);
    if (e === 0 || (e < 1 && e < 0.25)) continue; // too early in the month to project
    months.push({ k, factor: e < 1 ? 1 / e : 1 });
  }
  const { budgets } = budgetsFor(m);
  const spent = spentByCategory(m);
  const avgIncome = months.length ? sum(months.map(({ k }) => totalIncome(k))) / months.length : 0;

  const rows = [];
  for (const c of state.categories) {
    const avg = months.length ? sum(months.map(({ k, factor }) => (spentByCategory(k)[c.id] || 0) * factor)) / months.length : 0;
    const current = budgets[c.id] || 0;
    if (!avg && !current) continue;
    let suggested, reason;
    if (c.type === 'saving') {
      const target = Math.max(current, avg, avgIncome * 0.2);
      suggested = roundNice(target);
      reason = 'Aim for at least 20% of income';
    } else if (c.type === 'want') {
      suggested = roundNice(avg * 0.9);
      reason = 'Your average minus 10%';
      if (current && suggested > current) {
        suggested = Math.min(suggested, roundNice(current * 1.1));
        reason = 'You often go over — a realistic step down from your average';
      }
    } else {
      suggested = roundNice(avg);
      reason = 'Based on your average';
    }
    if (c.type !== 'saving' && current && (spent[c.id] || 0) <= current && suggested > current) {
      suggested = current; reason = 'You stayed within budget — keep it';
    }
    rows.push({ cat: c, current, avg, suggested, reason });
  }
  return { rows, avgIncome, monthsUsed: months.length, total: sum(rows.map(r => r.suggested)) };
}

/* ---------- Rendering helpers ---------- */
function chip(id) {
  const c = catById(id);
  return `<span class="chip"><span class="cat-ic">${icon(categoryIconName(c.name))}</span>${esc(c.name)}</span>`;
}

const h = (ic, text) => `<span class="h">${icon(ic)}${text}</span>`;
const STAT_ICONS = {
  'Income': 'income', 'Expenses': 'expense', 'Net balance': 'wallet', 'Budget remaining': 'budget', 'Total budgeted': 'budget',
  'Spent (budgeted categories)': 'expense', 'Unbudgeted income': 'wallet', 'Bills this month': 'bills', 'Paid': 'check',
  'Still to pay': 'alert', 'Net saved': 'piggy', 'Daily average spend': 'trend',
};

function categoryOptions(selected, includeBlank = false) {
  return (includeBlank ? `<option value="">All categories</option>` : '') +
    state.categories.map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}

function budgetRow(id, budget, spentAmt, m) {
  const ratio = budget ? spentAmt / budget : 0;
  if (catById(id).type === 'saving') return savingTargetRow(id, budget, spentAmt, ratio);
  const cls = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : '';
  const remaining = budget - spentAmt;
  const el = elapsed(m);
  let pace = '';
  if (el > 0 && el < 1 && budget && spentAmt / el > budget * 1.05 && remaining > 0) {
    pace = `<span class="badge warn">on pace for ${money(spentAmt / el)} ·</span>`;
  }
  return `
    <div class="budget-row">
      <div class="top"><span class="chip">${chip(id)}${ratio <= 1 && spentAmt > 0 ? `<span title="On budget — earning a star">${icon('star', 'star-ic')}</span>` : ''}</span><span class="nowrap"><b>${money(spentAmt)}</b> <span class="muted">/ ${money(budget)}</span></span></div>
      <div class="bar ${cls}"><span style="width:${Math.min(100, ratio * 100)}%"></span></div>
      <div class="meta">
        <span class="${remaining < 0 ? 'neg' : ''}">${remaining >= 0 ? `${money(remaining)} left` : `${money(-remaining)} over budget`}</span>
        <span>${pace} ${pct(ratio)} used</span>
      </div>
    </div>`;
}

/** Savings categories: the budget is a target to reach, so more is better. */
function savingTargetRow(id, target, saved, ratio) {
  return `
    <div class="budget-row">
      <div class="top"><span class="chip">${chip(id)}${ratio >= 1 ? `<span title="Savings target reached — earning a star">${icon('star', 'star-ic')}</span>` : ''}</span><span class="nowrap"><b>${money(saved)}</b> <span class="muted">/ ${money(target)}</span></span></div>
      <div class="bar goal-bar ${ratio >= 1 ? 'done' : ''}"><span style="width:${Math.min(100, ratio * 100)}%"></span></div>
      <div class="meta">
        <span class="${ratio >= 1 ? 'pos' : ''}">${ratio >= 1 ? 'Savings target reached' : `${money(target - saved)} to go`}</span>
        <span>${pct(ratio)} saved</span>
      </div>
    </div>`;
}

function stat(label, value, sub = '', cls = '') {
  return `<div class="card stat">${STAT_ICONS[label] ? `<span class="s-ic">${icon(STAT_ICONS[label])}</span>` : ''}<div class="label">${label}</div><div class="value ${cls}">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}

function billListItem(item, withMonth = false) {
  const { bill, month, status } = item;
  return `
    <div class="list-item">
      <div>
        <div class="title">${esc(bill.name)}</div>
        <div class="small muted">${money(bill.amount)} · due ${fmtDay(item.due)}${withMonth && month !== currentMonth() ? ` (${monthLabel(month, { month: 'short' })})` : ''}</div>
      </div>
      <div class="form-actions" style="align-items:center">
        <span class="badge ${status}">${statusText(item)}</span>
        ${status !== 'paid' ? `<button class="btn small good" data-action="pay-bill" data-id="${bill.id}" data-month="${month}">${icon('check')}Paid</button>` : ''}
      </div>
    </div>`;
}

const empty = text => `<div class="empty">${text}</div>`;
const INSIGHT_ICONS = { danger: 'alert', warn: 'alert', info: 'tip', good: 'star' };
function insightHtml(i) {
  return `<div class="insight ${i.level}"><div class="i-title">${icon(INSIGHT_ICONS[i.level])}${esc(i.title)}</div><div class="small muted">${esc(i.text)}</div></div>`;
}

/* ---------- Views ---------- */
function renderDashboard() {
  const m = ui.month;
  const inc = totalIncome(m), exp = totalExpenses(m), net = inc - exp;
  const { budgets, inherited } = budgetsFor(m);
  const spent = spentByCategory(m);
  const budgetIds = orderedCategoryIds(budgets);
  const totalBudget = sum(budgetIds.map(id => budgets[id]));
  const budgetSpent = sum(budgetIds.map(id => spent[id] || 0));
  const attention = billsNeedingAttention();

  const recent = [
    ...incomeIn(m).map(i => ({ ...i, kind: 'income' })),
    ...expensesIn(m).map(e => ({ ...e, kind: 'expense' })),
  ].sort((a, b) => b.date.localeCompare(a.date) || 0).slice(0, 8);

  const budgetRows = budgetIds
    .map(id => ({ id, b: budgets[id], s: spent[id] || 0 }))
    .sort((a, b) => (b.s / b.b) - (a.s / a.b))
    .map(r => budgetRow(r.id, r.b, r.s, m)).join('');

  return `
    <div class="grid cols-4">
      ${stat('Income', money(inc), `${incomeIn(m).length} entries`, 'pos')}
      ${stat('Expenses', money(exp), `${expensesIn(m).length} entries`, 'neg')}
      ${stat('Net balance', money(net), inc ? `${pct(Math.max(net, 0) / inc)} of income left` : '', net >= 0 ? 'pos' : 'neg')}
      ${stat('Budget remaining', money(totalBudget - budgetSpent), totalBudget ? `of ${money(totalBudget)} budgeted` : 'No budgets set yet', totalBudget - budgetSpent >= 0 ? '' : 'neg')}
    </div>

    ${rewardStrip()}
    ${goalsHomeCard()}

    <div class="grid cols-2" style="margin-top:16px">
      <div class="card">
        <h2>${h('budget', 'Budgets')} <button class="link-btn" data-view="budgets">Edit</button></h2>
        ${inherited ? `<p class="small muted">Using budgets carried over from ${monthLabel(inherited)}.</p>` : ''}
        ${budgetRows || empty('No budgets yet. <button class="link-btn" data-view="budgets">Set your budgets</button>')}
      </div>

      <div class="card">
        <h2>${h('bills', 'Upcoming bills')} <button class="link-btn" data-view="bills">All bills</button></h2>
        ${attention.length ? attention.map(a => billListItem(a, true)).join('') : empty(state.bills.length ? 'No bills due in the next 14 days.' : 'No bills yet. <button class="link-btn" data-view="bills">Add a bill</button>')}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h2>${h('trend', 'Recent activity')}
        <span class="form-actions">
          <button class="btn small" data-view="expenses">${icon('plus')}Add expense</button>
          <button class="btn small ghost" data-action="snap-receipt">${icon('camera')}Snap receipt</button>
          <button class="btn small ghost" data-view="income">${icon('plus')}Add income</button>
        </span>
      </h2>
      ${recent.length ? `<div class="table-wrap"><table class="tx">
        <thead><tr><th>Date</th><th>Description</th><th>Category / Source</th><th class="right">Amount</th></tr></thead>
        <tbody>${recent.map(r => `<tr>
          <td class="nowrap c-date">${fmtDay(r.date)}</td>
          <td class="c-desc">${esc(r.note || (r.kind === 'income' ? r.source : '')) || '<span class="muted">—</span>'}</td>
          <td class="c-main">${r.kind === 'income' ? `<span class="chip"><span class="cat-ic">${icon('income')}</span>${esc(r.source)}</span>` : chip(r.categoryId)}</td>
          <td class="right nowrap c-amt ${r.kind === 'income' ? 'pos' : 'neg'}">${r.kind === 'income' ? '+' : '−'}${money(r.amount)}</td>
        </tr>`).join('')}</tbody></table></div>` : empty(`No transactions in ${monthLabel(m)} yet.`)}
    </div>`;
}

function defaultDateFor(m) {
  return m === currentMonth() ? todayStr() : `${m}-01`;
}

function renderIncome() {
  const m = ui.month;
  const editing = ui.editing.income ? state.income.find(i => i.id === ui.editing.income) : null;
  const items = incomeIn(m).sort((a, b) => b.date.localeCompare(a.date));
  const sources = [...new Set(state.income.map(i => i.source).filter(Boolean))];
  const bySource = {};
  for (const i of items) bySource[i.source] = (bySource[i.source] || 0) + i.amount;
  const total = sum(items.map(i => i.amount));

  return `
    <div class="card">
      <h2>${h('income', editing ? 'Edit income' : 'Log income')}</h2>
      <form class="form" data-form="income">
        <label class="field">Date<input type="date" name="date" required value="${editing ? editing.date : defaultDateFor(m)}"></label>
        <label class="field">Source<input name="source" list="sources" required placeholder="e.g. Salary, Freelance" value="${esc(editing?.source || '')}"></label>
        <label class="field">Amount<input type="number" inputmode="decimal" name="amount" min="0.01" step="0.01" required placeholder="0.00" value="${editing?.amount ?? ''}"></label>
        <label class="field">Note<input name="note" placeholder="Optional" value="${esc(editing?.note || '')}"></label>
        <div class="form-actions">
          <button class="btn" type="submit">${editing ? 'Save changes' : 'Add income'}</button>
          ${editing ? '<button class="btn ghost" type="button" data-action="cancel-edit" data-kind="income">Cancel</button>' : ''}
        </div>
        <datalist id="sources">${sources.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      </form>
    </div>

    <div class="grid cols-3" style="margin-top:16px">
      <div class="card span-2">
        <h2>${h('income', `Income for ${monthLabel(m)}`)} <span class="pos">${money(total)}</span></h2>
        ${items.length ? `<div class="table-wrap"><table class="tx">
          <thead><tr><th>Date</th><th>Source</th><th>Note</th><th class="right">Amount</th><th></th></tr></thead>
          <tbody>${items.map(i => `<tr>
            <td class="nowrap c-date">${fmtDay(i.date)}</td><td class="c-main"><span class="chip"><span class="cat-ic">${icon('income')}</span>${esc(i.source)}</span></td><td class="muted c-desc">${esc(i.note)}</td>
            <td class="right nowrap pos c-amt">${money(i.amount)}</td>
            <td class="actions"><button class="act-btn" data-action="edit-income" data-id="${i.id}" aria-label="Edit" title="Edit">${icon('edit')}</button><button class="act-btn danger" data-action="del-income" data-id="${i.id}" aria-label="Delete" title="Delete">${icon('trash')}</button></td>
          </tr>`).join('')}</tbody></table></div>` : empty('No income logged for this month.')}
      </div>
      <div class="card">
        <h2>${h('wallet', 'By source')}</h2>
        ${Object.keys(bySource).length ? Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([s, v]) => `
          <div class="list-item"><span>${esc(s)}</span><span class="nowrap"><b>${money(v)}</b> <span class="muted small">${pct(v / total)}</span></span></div>`).join('') : empty('—')}
      </div>
    </div>`;
}

/* ---------- Snap receipt ---------- */
const OCR_SCRIPT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
let ocrWorkerPromise = null;
let ocrProgress = null;

function receiptPanel() {
  const r = ui.receipt;
  if (!r) return '';
  let body;
  if (r.status === 'reading') {
    body = `<div id="receipt-status">${esc(r.label)}</div><div class="small muted">Keep the app open — this can take 10–30 seconds.</div>`;
  } else if (r.status === 'error') {
    body = `<div class="neg">Couldn't read this receipt.</div><div class="small muted">${esc(r.error)} You can still type the details below.</div>`;
  } else {
    const p = r.parsed;
    const missing = [!p.amount && 'total', !p.date && 'date'].filter(Boolean);
    const note = !p.amount ? "Couldn't find the total — please type the amount."
      : !p.amountConfident ? 'Not sure about the total — please double-check the amount.'
      : missing.length ? `Couldn't find the ${missing.join(' or ')} — please check it.`
      : 'Found the store, date and total.';
    body = `<div><b>Receipt read.</b> Check the details below, then tap <b>Add expense</b>.</div>
      <div class="small ${missing.length || !p.amountConfident ? 'badge warn' : 'muted'}">${note}</div>
      <details class="small muted"><summary>Text read from the photo</summary><pre class="ocr-text">${esc(r.text.trim() || '(no text found)')}</pre></details>`;
  }
  return `<div class="receipt-panel">
    ${r.preview ? `<img src="${r.preview}" alt="Receipt photo">` : ''}
    <div class="receipt-body">${body}</div>
    ${r.status !== 'reading' ? '<button class="link-btn" type="button" data-action="discard-receipt">Remove</button>' : ''}
  </div>`;
}

function setReceiptStatus(label) {
  if (!ui.receipt) return;
  ui.receipt.label = label;
  const el = $('#receipt-status');
  if (el) el.textContent = label;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not download the text reader. Check your internet connection.'));
    document.head.appendChild(s);
  });
}

function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      if (!window.Tesseract) await loadScript(OCR_SCRIPT);
      return Tesseract.createWorker('eng', 1, { logger: m => ocrProgress && ocrProgress(m) });
    })().catch(err => { ocrWorkerPromise = null; throw err; });
  }
  return ocrWorkerPromise;
}

/** Shrink, grey-scale and boost contrast so the text reader works faster and better. */
async function prepareImage(file) {
  let src;
  try {
    src = await createImageBitmap(file);
  } catch {
    src = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file is not a supported image.'));
      img.src = URL.createObjectURL(file);
    });
  }
  const w0 = src.width, h0 = src.height;
  const scale = Math.min(1, 1800 / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, (g - 128) * 1.5 + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function findCategoryId(name) {
  if (!name) return null;
  return state.categories.find(c => c.name.toLowerCase() === name.toLowerCase())?.id || null;
}

async function scanReceipt(file) {
  discardReceipt();
  ui.receipt = { status: 'reading', preview: URL.createObjectURL(file), label: 'Preparing photo…' };
  ui.editing.expense = null;
  ui.view = 'expenses';
  render();
  window.scrollTo({ top: 0 });
  const current = ui.receipt;
  try {
    const image = await prepareImage(file);
    setReceiptStatus('Loading text reader…');
    ocrProgress = m => {
      if (m.status === 'recognizing text') setReceiptStatus(`Reading receipt… ${Math.round(m.progress * 100)}%`);
      else if (/load|initializ/i.test(m.status)) setReceiptStatus('Loading text reader… (needs internet the first time)');
    };
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(image);
    if (ui.receipt !== current) return; // removed while reading
    const parsed = parseReceipt(data.text);
    Object.assign(current, {
      status: 'done', text: data.text, parsed,
      fields: {
        date: parsed.date || todayStr(),
        amount: parsed.amount ?? '',
        categoryId: findCategoryId(parsed.categoryName),
        note: parsed.merchant,
      },
    });
  } catch (err) {
    if (ui.receipt !== current) return;
    Object.assign(current, { status: 'error', error: err.message || String(err) });
  } finally {
    ocrProgress = null;
  }
  if (ui.view === 'expenses') render();
}

function discardReceipt() {
  if (ui.receipt?.preview) URL.revokeObjectURL(ui.receipt.preview);
  ui.receipt = null;
}

function renderExpenses() {
  const m = ui.month;
  const editing = ui.editing.expense ? state.expenses.find(e => e.id === ui.editing.expense) : null;
  let items = expensesIn(m).sort((a, b) => b.date.localeCompare(a.date));
  if (ui.expenseFilter) items = items.filter(e => e.categoryId === ui.expenseFilter);
  const total = sum(items.map(e => e.amount));
  const otherId = state.categories.find(c => c.name === 'Food & Groceries')?.id || state.categories[0]?.id;
  const draft = !editing && ui.receipt?.status === 'done' ? ui.receipt.fields : null;
  const v = editing || draft || {};

  return `
    <div class="card">
      <h2>${h('expense', editing ? 'Edit expense' : 'Log expense')}
        ${editing ? '' : `<button class="btn small ghost" type="button" data-action="snap-receipt">${icon('camera')}Snap receipt</button>`}
      </h2>
      ${editing ? '' : receiptPanel()}
      <form class="form" data-form="expense">
        <label class="field">Date<input type="date" name="date" required value="${v.date || defaultDateFor(m)}"></label>
        <label class="field">Category<select name="categoryId" required>${categoryOptions(v.categoryId || ui.expenseFilter || otherId)}</select></label>
        <label class="field">Amount<input type="number" inputmode="decimal" name="amount" min="0.01" step="0.01" required placeholder="0.00" value="${v.amount ?? ''}"></label>
        <label class="field">Description<input name="note" placeholder="e.g. Weekly groceries" value="${esc(v.note || '')}"></label>
        <div class="form-actions">
          <button class="btn" type="submit">${editing ? 'Save changes' : 'Add expense'}</button>
          ${editing ? '<button class="btn ghost" type="button" data-action="cancel-edit" data-kind="expense">Cancel</button>' : ''}
          ${draft ? '<button class="btn ghost" type="button" data-action="discard-receipt">Discard</button>' : ''}
        </div>
      </form>
    </div>

    <div class="card" style="margin-top:16px">
      <h2>
        <span class="h">${icon('expense')}<span>Expenses for ${monthLabel(m)} <span class="neg">${money(total)}</span></span></span>
        <select id="expense-filter" aria-label="Filter by category">${categoryOptions(ui.expenseFilter, true)}</select>
      </h2>
      ${items.length ? `<div class="table-wrap"><table class="tx">
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="right">Amount</th><th></th></tr></thead>
        <tbody>${items.map(e => `<tr>
          <td class="nowrap c-date">${fmtDay(e.date)}</td><td class="c-main">${chip(e.categoryId)}</td>
          <td class="c-desc">${esc(e.note)}</td>
          <td class="right nowrap neg c-amt">${money(e.amount)}</td>
          <td class="actions"><button class="act-btn" data-action="edit-expense" data-id="${e.id}" aria-label="Edit" title="Edit">${icon('edit')}</button><button class="act-btn danger" data-action="del-expense" data-id="${e.id}" aria-label="Delete" title="Delete">${icon('trash')}</button></td>
        </tr>`).join('')}</tbody></table></div>` : empty('No expenses found for this month.')}
    </div>`;
}

function renderBudgets() {
  const m = ui.month;
  const { budgets, inherited } = budgetsFor(m);
  const spent = spentByCategory(m);
  const inc = totalIncome(m);
  const totalBudget = sum(Object.values(budgets).map(Number).filter(Boolean));
  const ids = orderedCategoryIds(budgets);

  return `
    <div class="grid cols-3">
      ${stat('Total budgeted', money(totalBudget), inc ? `${pct(totalBudget / inc)} of this month's income` : 'No income logged yet')}
      ${stat('Spent (budgeted categories)', money(sum(ids.map(id => spent[id] || 0))))}
      ${stat('Unbudgeted income', money(inc - totalBudget), 'Income not yet assigned to a budget', inc - totalBudget >= 0 ? 'pos' : 'neg')}
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <div class="card">
        <h2>${h('budget', `Set budgets for ${monthLabel(m)}`)}</h2>
        ${inherited ? `<p class="alert info small">These amounts are carried over from ${monthLabel(inherited)}. Saving will set budgets specifically for ${monthLabel(m)}.</p>` : ''}
        <form data-form="budgets">
          <div class="table-wrap"><table>
            <thead><tr><th>Category</th><th>Type</th><th class="right">Spent</th><th class="right">Budget</th></tr></thead>
            <tbody>${state.categories.map(c => `<tr>
              <td>${chip(c.id)}</td>
              <td class="muted small">${TYPE_LABELS[c.type] || 'Want'}</td>
              <td class="right nowrap muted">${money(spent[c.id] || 0)}</td>
              <td class="right"><input type="number" inputmode="decimal" min="0" step="0.01" name="b_${c.id}" value="${budgets[c.id] || ''}" placeholder="0" style="width:120px;text-align:right"></td>
            </tr>`).join('')}</tbody>
          </table></div>
          <div class="form-actions" style="margin-top:12px;justify-content:flex-end">
            ${state.budgets[m] ? '<button class="btn ghost" type="button" data-action="clear-budgets">Clear month</button>' : ''}
            <button class="btn" type="submit">Save budgets</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>${h('wallet', 'Remaining budget')}</h2>
        ${ids.length ? ids.map(id => budgetRow(id, budgets[id], spent[id] || 0, m)).join('') : empty('Enter amounts on the left to start tracking.')}
      </div>
    </div>`;
}

function renderBills() {
  const m = ui.month;
  const editing = ui.editing.bill ? state.bills.find(b => b.id === ui.editing.bill) : null;
  const rec = editing?.recurrence || 'monthly';
  const rows = state.bills.map(bill => ({ bill, month: m, ...(billStatus(bill, m) || {}) })).filter(r => r.due).sort((a, b) => a.due.localeCompare(b.due));
  const total = sum(rows.map(r => r.bill.amount));
  const paidTotal = sum(rows.filter(r => r.status === 'paid').map(r => r.bill.amount));
  const overdue = rows.filter(r => r.status === 'overdue');

  return `
    <div class="card">
      <h2>${h('bills', editing ? 'Edit bill' : 'Add a bill')}</h2>
      <form class="form" data-form="bill">
        <label class="field">Bill name<input name="name" required placeholder="e.g. Electricity" value="${esc(editing?.name || '')}"></label>
        <label class="field">Amount<input type="number" inputmode="decimal" name="amount" min="0.01" step="0.01" required value="${editing?.amount ?? ''}"></label>
        <label class="field">Category<select name="categoryId">${categoryOptions(editing?.categoryId || state.categories.find(c => c.name === 'Utilities')?.id)}</select></label>
        <label class="field">Repeats<select name="recurrence" id="bill-recurrence">
          <option value="monthly" ${rec === 'monthly' ? 'selected' : ''}>Every month</option>
          <option value="once" ${rec === 'once' ? 'selected' : ''}>One time</option>
        </select></label>
        <label class="field ${rec === 'monthly' ? '' : 'hidden'}" data-rec="monthly">Due day of month<input type="number" inputmode="decimal" name="dueDay" min="1" max="31" value="${editing?.dueDay || ''}" placeholder="1–31"></label>
        <label class="field ${rec === 'monthly' ? '' : 'hidden'}" data-rec="monthly">Starting<input type="month" name="startMonth" value="${editing?.startMonth || m}"></label>
        <label class="field ${rec === 'once' ? '' : 'hidden'}" data-rec="once">Due date<input type="date" name="dueDate" value="${editing?.dueDate || ''}"></label>
        <label class="field check"><input type="checkbox" name="logExpense" ${editing?.logExpense === false ? '' : 'checked'}> Log as expense when paid</label>
        <div class="form-actions">
          <button class="btn" type="submit">${editing ? 'Save changes' : 'Add bill'}</button>
          ${editing ? '<button class="btn ghost" type="button" data-action="cancel-edit" data-kind="bill">Cancel</button>' : ''}
        </div>
      </form>
    </div>

    <div class="grid cols-3" style="margin-top:16px">
      ${stat('Bills this month', money(total), `${rows.length} bill${rows.length === 1 ? '' : 's'}`)}
      ${stat('Paid', money(paidTotal), `${rows.filter(r => r.status === 'paid').length} paid`, 'pos')}
      ${stat('Still to pay', money(total - paidTotal), overdue.length ? `<span class="neg">${overdue.length} overdue</span>` : 'Nothing overdue', total - paidTotal > 0 ? 'neg' : '')}
    </div>

    <div class="card" style="margin-top:16px">
      <h2>${h('calendarCheck', `Bills for ${monthLabel(m)}`)}</h2>
      ${rows.length ? `<div class="table-wrap"><table class="tx">
        <thead><tr><th>Due</th><th>Bill</th><th>Category</th><th class="right">Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td class="nowrap c-date">${fmtDay(r.due)}</td>
          <td class="c-main"><b>${esc(r.bill.name)}</b><div class="small muted">${r.bill.recurrence === 'once' ? 'One time' : `Monthly, day ${r.bill.dueDay}`}</div></td>
          <td class="c-cat">${chip(r.bill.categoryId)}</td>
          <td class="right nowrap c-amt">${money(r.bill.amount)}</td>
          <td class="c-desc"><span class="badge ${r.status}">${statusText(r)}</span></td>
          <td class="actions">
            ${r.status === 'paid'
              ? `<button class="link-btn" data-action="unpay-bill" data-id="${r.bill.id}" data-month="${m}">Undo</button>`
              : `<button class="btn small good" data-action="pay-bill" data-id="${r.bill.id}" data-month="${m}">${icon('check')}Mark paid</button>`}
            <button class="act-btn" data-action="edit-bill" data-id="${r.bill.id}" aria-label="Edit" title="Edit">${icon('edit')}</button>
            <button class="act-btn danger" data-action="del-bill" data-id="${r.bill.id}" aria-label="Delete" title="Delete">${icon('trash')}</button>
          </td>
        </tr>`).join('')}</tbody></table></div>` : empty(state.bills.length ? 'No bills due this month.' : 'Add your recurring bills (rent, electricity, internet, loans…) to track due dates.')}
    </div>`;
}

function renderSummary() {
  const m = ui.month, prev = shiftMonth(m, -1), next = shiftMonth(m, 1);
  const inc = totalIncome(m), exp = totalExpenses(m), pInc = totalIncome(prev), pExp = totalExpenses(prev);
  const spent = spentByCategory(m), pSpent = spentByCategory(prev);
  const { budgets } = budgetsFor(m);
  const el = elapsed(m);
  const ids = orderedCategoryIds(spent, budgets, pSpent);
  const insights = buildInsights(m);
  const sugg = suggestBudgets(m);
  const delta = (a, b) => (b ? `${a >= b ? '+' : '−'}${pct(Math.abs(a / b - 1))}` : '—');

  const spentIds = orderedCategoryIds(spent).sort((a, b) => spent[b] - spent[a]);
  const top = spent[spentIds[0]] || 1;

  const byType = { need: 0, want: 0, saving: 0 };
  for (const [id, v] of Object.entries(spent)) byType[catById(id).type || 'want'] += v;

  return `
    ${el > 0 && el < 1 ? `<div class="alert info small">${monthLabel(m)} is still in progress (${pct(el)} through the month). Figures and tips are based on activity so far.</div>` : ''}
    <div class="grid cols-4">
      ${stat('Income', money(inc), `${delta(inc, pInc)} vs last month`, 'pos')}
      ${stat('Expenses', money(exp), `${delta(exp, pExp)} vs last month`, 'neg')}
      ${stat('Net saved', money(inc - exp), inc ? `Savings rate ${pct((inc - exp + byType.saving) / inc)}` : '', inc - exp >= 0 ? 'pos' : 'neg')}
      ${stat('Daily average spend', money(exp / Math.max(1, Math.round(el * daysInMonth(m)) || daysInMonth(m))), `${expensesIn(m).length} transactions`)}
    </div>

    <div class="card" style="margin-top:16px">
      <h2>${h('summary', 'Where your money went')}</h2>
      ${exp ? spentIds.map(id => `
        <div class="budget-row">
          <div class="top"><span>${chip(id)}</span><span class="nowrap">${money(spent[id])} <span class="muted small">${pct(spent[id] / exp)}</span></span></div>
          <div class="bar"><span style="width:${spent[id] / top * 100}%"></span></div>
        </div>`).join('') : empty('No expenses this month.')}
      ${inc && exp ? `<p class="small muted" style="margin:14px 0 0">50/30/20 check — Needs ${pct(byType.need / inc)} (aim ≤50%) · Wants ${pct(byType.want / inc)} (aim ≤30%) · Savings ${pct(Math.max(0, inc - byType.need - byType.want) / inc)} (aim ≥20%)</p>` : ''}
    </div>

    <div class="card" style="margin-top:16px">
      <h2>${h('budget', 'Category breakdown')}</h2>
      ${ids.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Category</th><th class="right">Spent</th><th class="right">Budget</th><th class="right">Difference</th><th class="right">Last month</th><th class="right">Change</th></tr></thead>
        <tbody>${ids.map(id => {
          const s = spent[id] || 0, b = budgets[id] || 0, p = pSpent[id] || 0;
          return `<tr>
            <td>${chip(id)}</td>
            <td class="right nowrap">${money(s)}</td>
            <td class="right nowrap muted">${b ? money(b) : '—'}</td>
            <td class="right nowrap ${b ? (s > b ? 'neg' : 'pos') : ''}">${b ? (s > b ? `${money(s - b)} over` : `${money(b - s)} under`) : '—'}</td>
            <td class="right nowrap muted">${money(p)}</td>
            <td class="right nowrap">${delta(s, p)}</td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="right">${money(exp)}</td><td class="right">${money(sum(Object.values(budgets).map(Number)))}</td><td></td><td class="right">${money(pExp)}</td><td class="right">${delta(exp, pExp)}</td></tr></tfoot>
      </table></div>` : empty('Nothing to show yet.')}
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <div class="card">
        <h2>${h('tip', 'How to improve next month')}</h2>
        ${insights.map(insightHtml).join('')}
      </div>
      <div class="card">
        <h2>${h('trend', `Suggested budgets for ${monthLabel(next)}`)}</h2>
        ${sugg.rows.length ? `
          <p class="small muted">Based on ${sugg.monthsUsed > 1 ? `your last ${sugg.monthsUsed} months` : 'this month'} of spending. "Want" categories are trimmed 10% to help you save more.</p>
          <div class="table-wrap"><table>
            <thead><tr><th>Category</th><th class="right">Current</th><th class="right">Suggested</th></tr></thead>
            <tbody>${sugg.rows.map(r => `<tr>
              <td>${chip(r.cat.id)}<div class="small muted">${esc(r.reason)}</div></td>
              <td class="right nowrap muted">${r.current ? money(r.current) : '—'}</td>
              <td class="right nowrap"><b>${money(r.suggested)}</b></td>
            </tr>`).join('')}</tbody>
            <tfoot><tr><td>Total</td><td class="right">${money(sum(sugg.rows.map(r => r.current)))}</td><td class="right">${money(sugg.total)}</td></tr></tfoot>
          </table></div>
          ${sugg.avgIncome && sugg.total > sugg.avgIncome ? `<p class="alert warn small">Suggested budgets exceed your average income (${money(sugg.avgIncome)}). Look for categories to cut further.</p>` : ''}
          <div class="form-actions" style="justify-content:flex-end;margin-top:12px">
            <button class="btn" data-action="apply-suggestions">Apply to ${monthLabel(next)}</button>
          </div>` : empty('Log a few expenses to get budget suggestions.')}
      </div>
    </div>`;
}

function renderSettings() {
  const counts = {};
  for (const e of state.expenses) counts[e.categoryId] = (counts[e.categoryId] || 0) + 1;
  const cur = state.settings.currency;

  return `
    <div class="card currency-card">
      <div class="cur-symbol">${esc(currencySymbol(cur))}</div>
      <div class="cur-body">
        <div class="small muted">Currency</div>
        <div><b>${esc(cur)}</b> — ${esc(currencyName(cur))}</div>
        <div class="small muted">Example: ${money(1234.5)}</div>
      </div>
      <button class="btn" data-action="change-currency">${icon('wallet')}Change</button>
    </div>

    <div class="card appearance-card" style="margin-top:16px">
      <div>
        <div class="small muted">Appearance</div>
        <div><b>${{ light: 'Light mode', dark: 'Dark mode', system: 'Same as device' }[themeChoice()]}</b></div>
      </div>
      <div class="segmented" role="group" aria-label="Appearance">
        ${[['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'monitor', 'Auto']].map(([t, ic, label]) => `
          <button data-action="set-theme" data-theme="${t}" class="${themeChoice() === t ? 'active' : ''}" aria-pressed="${themeChoice() === t}">${icon(ic)}${label}</button>`).join('')}
      </div>
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <div class="card">
        <h2>${h('dots', 'Categories')}</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Type</th><th class="right">Used</th><th></th></tr></thead>
          <tbody>${state.categories.map(c => `<tr>
            <td><input value="${esc(c.name)}" data-cat="${c.id}" data-field="name" aria-label="Name" style="width:100%"></td>
            <td><select data-cat="${c.id}" data-field="type" aria-label="Type">${Object.entries(TYPE_LABELS).map(([k, v]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td class="right muted">${counts[c.id] || 0}</td>
            <td class="actions"><button class="act-btn danger" data-action="del-category" data-id="${c.id}" aria-label="Delete" title="Delete">${icon('trash')}</button></td>
          </tr>`).join('')}</tbody>
        </table></div>
        <form class="form" data-form="category" style="margin-top:12px">
          <label class="field">New category<input name="name" required placeholder="e.g. Pets"></label>
          <label class="field">Type<select name="type">${Object.entries(TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <div class="form-actions"><button class="btn" type="submit">Add category</button></div>
        </form>
        <p class="small muted">Types power the 50/30/20 analysis: <b>Needs</b> are essentials, <b>Wants</b> are discretionary, <b>Saving</b> is money set aside.</p>
      </div>

      <div class="stack">
        <div class="card">
          <h2>${h('wallet', 'Your data')}</h2>
          <p class="small muted">Everything is stored locally in this browser. Export a backup regularly, especially before clearing browser data.</p>
          <div class="form-actions" style="flex-wrap:wrap">
            <button class="btn" data-action="export">Export backup</button>
            <button class="btn ghost" data-action="import">Import backup</button>
            <button class="btn ghost" data-action="demo">Load demo data</button>
            <button class="btn danger" data-action="reset">Erase all data</button>
          </div>
        </div>
      </div>
    </div>`;
}

const VIEWS = {
  dashboard: ['Home', renderDashboard],
  income: ['Income', renderIncome],
  expenses: ['Expenses', renderExpenses],
  budgets: ['Budgets', renderBudgets],
  bills: ['Bills', renderBills],
  summary: ['Monthly Summary', renderSummary],
  goals: ['Savings Goals', renderGoals],
  rewards: ['Rewards', renderRewards],
  settings: ['Settings', renderSettings],
};

/* ---------- Rewards view ---------- */
const starsText = n => `${n} star${n === 1 ? '' : 's'}`;

function rewardStrip() {
  const r = computeRewards();
  const cur = r.current;
  return `
    <button class="card reward-strip" data-view="rewards" style="margin-top:16px">
      <span class="rs-star">${icon('star', 'star-fill')}</span>
      <span class="rs-main">
        <b><span data-count="${r.stars}">${r.stars}</span> stars</b> · Level ${r.level} ${esc(r.levelName)}
        <span class="small muted">${cur ? `This month: on track for ${starsText(cur.total)}` : 'Set budgets to start earning stars'}</span>
      </span>
      ${r.logStreak.current ? `<span class="rs-streak">${icon('flame')}${r.logStreak.current}-day streak</span>` : ''}
      <span class="rs-go">${icon('right')}</span>
    </button>`;
}

function renderRewards() {
  const r = computeRewards();
  const cur = r.current;
  const curMonth = currentMonth();
  const { budgets } = budgetsFor(curMonth);
  const spent = spentByCategory(curMonth);
  const offTrack = Object.keys(budgets).filter(id => budgets[id] > 0 && (spent[id] || 0) > budgets[id]);
  const earnedBadges = r.badges.filter(b => b.earned).length;

  return `
    <div class="card reward-hero">
      <div class="hero-star">${icon('star', 'big-star')}</div>
      <div class="hero-body">
        <div class="count"><span data-count="${r.stars}">${r.stars}</span> <span class="muted small">stars</span></div>
        <div><b>Level ${r.level} · ${esc(r.levelName)}</b></div>
        ${r.nextLevel ? `
          <div class="bar level-bar"><span style="width:${Math.round(r.nextLevel.progress * 100)}%"></span></div>
          <div class="small muted">${starsText(r.nextLevel.need)} to reach ${esc(r.nextLevel.name)}</div>` : '<div class="small muted">Top level reached. Amazing!</div>'}
      </div>
    </div>

    <div class="grid cols-3" style="margin-top:16px">
      <div class="card stat"><span class="s-ic">${icon('star')}</span><div class="label">This month so far</div>
        <div class="value gold">${cur ? starsText(cur.total) : '—'}</div>
        <div class="sub">${cur ? `out of ${cur.possible} possible · added when the month ends` : 'Set budgets to start earning'}</div></div>
      <div class="card stat"><span class="s-ic">${icon('flame')}</span><div class="label">Logging streak</div>
        <div class="value">${r.logStreak.current} day${r.logStreak.current === 1 ? '' : 's'}</div>
        <div class="sub">Best: ${r.logStreak.best} days · +1 star every 7 days in a row</div></div>
      <div class="card stat"><span class="s-ic">${icon('trophy')}</span><div class="label">Perfect months in a row</div>
        <div class="value">${r.perfectStreak.current}</div>
        <div class="sub">Best: ${r.perfectStreak.best}</div></div>
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <div class="card">
        <h2>${h('calendarCheck', `${monthLabel(curMonth)} progress`)}</h2>
        ${cur ? `
          ${cur.items.map(i => `<div class="list-item"><span>${esc(i.label)}</span><span class="stars">+${i.stars}${icon('star', 'star-ic')}</span></div>`).join('')}
          ${offTrack.map(id => `<div class="list-item"><span class="muted">${chip(id)} is over budget — no star yet</span><span class="muted">+0</span></div>`).join('')}
          <p class="small muted" style="margin:10px 0 0">${offTrack.length ? 'Spend less in the categories above next month to win their stars back.' : cur.perfect ? 'Every category is on budget. Keep going for the Perfect Month bonus!' : ''}</p>`
          : empty('Set budgets for this month to start earning stars. <button class="link-btn" data-view="budgets">Set budgets</button>')}
      </div>
      <div class="card">
        <h2>${h('tip', 'How to earn stars')}</h2>
        <div class="list-item"><span>Each category that stays within budget for the month</span><span class="stars">+1${icon('star', 'star-ic')}</span></div>
        <div class="list-item"><span>Perfect month: every category on budget</span><span class="stars">+3${icon('star', 'star-ic')}</span></div>
        <div class="list-item"><span>Save 20% or more of your income</span><span class="stars">+2${icon('star', 'star-ic')}</span></div>
        <div class="list-item"><span>Pay every bill on time</span><span class="stars">+1${icon('star', 'star-ic')}</span></div>
        <div class="list-item"><span>Log something 7 days in a row</span><span class="stars">+1${icon('star', 'star-ic')}</span></div>
        <div class="list-item"><span>Reach a savings goal</span><span class="stars">+${GOAL_STARS}${icon('star', 'star-ic')}</span></div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h2>${h('medal', 'Badges')} <span class="small muted">${earnedBadges} of ${r.badges.length}</span></h2>
      <div class="badge-grid">${r.badges.map(b => `
        <div class="badge-card ${b.earned ? '' : 'locked'}">
          <div class="b-ic">${icon(b.earned ? b.icon : 'lock')}</div>
          <div class="b-name">${esc(b.name)}</div>
          <div class="b-desc">${esc(b.desc)}</div>
        </div>`).join('')}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h2>${h('trophy', 'Stars by month')}</h2>
      ${r.history.length ? r.history.map(m => `
        <div class="list-item">
          <span><b>${monthLabel(m.month)}</b><div class="small muted">${m.within} of ${m.budgeted} categories on budget${m.perfect ? ' · Perfect month' : ''}${m.saver ? ' · Saved 20%+' : ''}${m.billsOnTime ? ' · Bills on time' : ''}</div></span>
          <span class="stars">${m.total}${icon('star', 'star-ic')}</span>
        </div>`).join('') : empty('Your first stars arrive at the end of this month.')}
      ${r.goalStars ? `<div class="list-item"><span><b>Savings goals reached</b><div class="small muted">${r.goalsReached} goal${r.goalsReached === 1 ? '' : 's'} × ${GOAL_STARS} stars</div></span><span class="stars">${r.goalStars}${icon('star', 'star-ic')}</span></div>` : ''}
      ${r.habitStars ? `<div class="list-item"><span><b>Logging streaks</b><div class="small muted">1 star for every 7 days in a row</div></span><span class="stars">${r.habitStars}${icon('star', 'star-ic')}</span></div>` : ''}
    </div>`;
}

/* ---------- Pop-ups, celebrations, animations ---------- */
const popupQueue = [];

/** Short vibration on phones that support it (only after the user has tapped something). */
function buzz(pattern) {
  if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(pattern);
}

function openPopup(inner, opts = {}) {
  if ($('#popup')) { popupQueue.push([inner, opts]); return; }
  const el = document.createElement('div');
  el.id = 'popup';
  el.className = 'popup-backdrop';
  el.innerHTML = inner;
  document.body.appendChild(el);
  el.querySelector('.btn')?.focus();
  if (opts.confetti) confetti();
  if (opts.vibrate) buzz(opts.vibrate);
}

function closePopup() {
  $('#popup')?.remove();
  const next = popupQueue.shift();
  if (next) setTimeout(() => openPopup(...next), 200);
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function confetti() {
  if (reduceMotion()) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#f5b301', '#22c55e', '#3b82f6', '#ef4444', '#a855f7', '#f97316'];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = `${1.4 + Math.random() * 1.4}s`;
    p.style.animationDelay = `${Math.random() * 0.4}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3500);
}

const CHEERS = [
  'Great job sticking to your plan!',
  'Small wins add up. Keep it going!',
  'Your future self says thank you!',
  'You are building great money habits!',
];

/** Compare rewards with what the user has already seen and celebrate anything new. */
function checkRewards() {
  const r = computeRewards();
  const seen = state.rewards || {};
  const earnedIds = r.badges.filter(b => b.earned).map(b => b.id);
  const newBadges = r.badges.filter(b => b.earned && !(seen.badges || []).includes(b.id));
  const newStars = seen.stars == null ? r.stars : r.stars - seen.stars;
  if (seen.stars === r.stars && !newBadges.length && (seen.badges || []).length === earnedIds.length) return;
  state.rewards = { stars: r.stars, badges: earnedIds };
  save();
  if (newStars <= 0 && !newBadges.length) return;

  const title = newStars > 0 ? `You earned ${starsText(newStars)}!` : `Badge unlocked!`;
  openPopup(`
    <div class="popup celebrate" role="alertdialog" aria-modal="true" aria-labelledby="popup-title">
      <div class="hero-star">${icon('star', 'big-star')}</div>
      <div class="popup-title" id="popup-title">${title}</div>
      <p class="small muted" style="margin:0 0 12px">${CHEERS[Math.floor(Math.random() * CHEERS.length)]}</p>
      ${newBadges.map(b => `<div class="badge-line"><span class="b-ic">${icon(b.icon)}</span><span><b>${esc(b.name)}</b><span class="small muted"> · ${esc(b.desc)}</span></span></div>`).join('')}
      <div class="small" style="margin:12px 0 14px">Total: <b>${starsText(r.stars)}</b> · Level ${r.level} ${esc(r.levelName)}</div>
      <div class="form-actions">
        <button class="btn gold" data-action="close-popup">Awesome!</button>
        <button class="btn ghost" data-action="popup-rewards">See rewards</button>
      </div>
    </div>`, { confetti: true, vibrate: [30, 40, 30] });
}

/** Count numbers up from zero when a screen opens. */
function animateCounts(root) {
  if (reduceMotion()) return;
  root.querySelectorAll('.stat .value, [data-count]').forEach(el => {
    if (el.querySelector('[data-count]')) return;
    const text = el.textContent.trim();
    let target, fmt;
    if (el.dataset.count != null) { target = Number(el.dataset.count); fmt = n => String(Math.round(n)); }
    else {
      target = parseFloat(text.replace(/[^\d.-]/g, ''));
      if (!Number.isFinite(target) || money(target) !== text) return;
      fmt = money;
    }
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / 650);
      el.textContent = fmt(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step); else el.textContent = text;
    };
    requestAnimationFrame(step);
  });
}

/* ---------- Quick-add sheet (phone) ---------- */
function openSheet() {
  closeSheet();
  const el = document.createElement('div');
  el.id = 'sheet';
  el.className = 'sheet-backdrop';
  el.innerHTML = `
    <div class="sheet" role="dialog" aria-label="Quick add">
      <div class="sheet-grip"></div>
      <div class="sheet-grid">
        <button class="sheet-btn" data-view="expenses">${icon('expense')}Add expense</button>
        <button class="sheet-btn" data-action="snap-receipt">${icon('camera')}Snap receipt</button>
        <button class="sheet-btn" data-view="income">${icon('income')}Add income</button>
        <button class="sheet-btn" data-view="bills">${icon('bills')}Add bill</button>
        <button class="sheet-btn" data-action="sheet-goal">${icon('piggy')}Add to goal</button>
        <button class="sheet-btn" data-view="budgets">${icon('budget')}Set budget</button>
      </div>
    </div>`;
  document.body.appendChild(el);
}
function closeSheet() { $('#sheet')?.remove(); }

/* ---------- Theme (light / dark / system) ---------- */
const THEME_KEY = 'pitaka-theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const themeChoice = () => localStorage.getItem(THEME_KEY) || 'system';
const effectiveTheme = () => {
  const t = themeChoice();
  return t === 'system' ? (darkQuery.matches ? 'dark' : 'light') : t;
};

function applyTheme() {
  const t = themeChoice();
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const dark = effectiveTheme() === 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111111' : '#ffffff');
  const btn = $('#theme-btn');
  if (btn) {
    btn.innerHTML = icon(dark ? 'sun' : 'moon');
    btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  }
}

function setTheme(t) {
  localStorage.setItem(THEME_KEY, t);
  applyTheme();
  if (ui.view === 'settings') render();
}

darkQuery.addEventListener?.('change', () => { if (themeChoice() === 'system') applyTheme(); });

/* ---------- Currency ---------- */
function openCurrencyDialog() {
  const cur = state.settings.currency;
  const list = allCurrencies();
  const opt = c => `<option value="${c}" ${c === cur ? 'selected' : ''}>${esc(currencyLabel(c))}</option>`;
  const hasData = state.income.length || state.expenses.length || state.bills.length || Object.keys(state.budgets).length;
  openPopup(`
    <div class="popup plain" role="dialog" aria-modal="true" aria-labelledby="popup-title">
      <div class="popup-title" id="popup-title">${icon('wallet')}Change currency</div>
      <form data-form="currency" class="popup-form">
        <label class="field">Currency
          <select name="code" id="currency-select">
            <optgroup label="Popular">${list.slice(0, POPULAR_CURRENCIES.length).map(opt).join('')}</optgroup>
            <optgroup label="All currencies">${list.slice(POPULAR_CURRENCIES.length).map(opt).join('')}</optgroup>
          </select>
        </label>
        ${hasData ? `
        <div class="choice">
          <label class="radio"><input type="radio" name="cur-mode" value="keep" checked>
            <span><b>Just change the symbol</b><span class="small muted">Your numbers stay the same. Pick this if you already entered them in the new currency.</span></span></label>
          <label class="radio"><input type="radio" name="cur-mode" value="convert">
            <span><b>Convert all my amounts</b><span class="small muted">Recalculates every income, expense, budget and bill with an exchange rate.</span></span></label>
        </div>
        <div id="convert-box" class="convert-box hidden">
          <label class="field"><span id="rate-label"></span>
            <input id="rate-input" name="rate" type="number" inputmode="decimal" step="any" min="0" placeholder="Exchange rate"></label>
          <div class="form-actions"><button type="button" class="btn small ghost" data-action="fetch-rate">${icon('trend')}Get today's rate</button><span id="rate-status" class="small muted"></span></div>
        </div>` : '<input type="hidden" name="cur-mode" value="keep">'}
        <div class="form-actions" style="margin-top:6px">
          <button class="btn" type="submit">Save</button>
          <button class="btn ghost" type="button" data-action="close-popup">Cancel</button>
        </div>
      </form>
    </div>`);
  updateRateLabel();
}

function updateRateLabel() {
  const sel = $('#currency-select');
  const label = $('#rate-label');
  if (!sel || !label) return;
  label.textContent = `1 ${state.settings.currency} = how many ${sel.value}?`;
  const input = $('#rate-input');
  if (input) input.value = '';
  const status = $('#rate-status');
  if (status) status.textContent = '';
}

async function fetchRate() {
  const sel = $('#currency-select'), input = $('#rate-input'), status = $('#rate-status');
  if (!sel || !input) return;
  const from = state.settings.currency, to = sel.value;
  status.textContent = 'Getting rate…';
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`);
    const data = await res.json();
    const rate = data?.rates?.[to];
    if (!rate) throw new Error('no rate');
    if ($('#currency-select')?.value !== to) return; // user picked another currency meanwhile
    input.value = Number(rate.toPrecision(6));
    const when = data.time_last_update_unix ? new Date(data.time_last_update_unix * 1000).toLocaleDateString() : 'today';
    status.textContent = `Rate as of ${when}. You can edit it.`;
  } catch {
    status.textContent = "Couldn't get the rate. Check your internet, or type it in.";
  }
}

/** Multiply every stored amount by `rate` (used when switching currency). */
function convertAmounts(rate) {
  const conv = x => Math.round(x * rate * 100) / 100;
  for (const i of state.income) i.amount = conv(i.amount);
  for (const e of state.expenses) e.amount = conv(e.amount);
  for (const b of state.bills) b.amount = conv(b.amount);
  for (const m of Object.values(state.budgets)) for (const id of Object.keys(m)) m[id] = conv(m[id]);
}

/* ---------- Budget warnings ---------- */
const NEAR_LIMIT = 0.8; // warn at 80% of a category budget

/** Categories at or above 80% of their budget for a month, worst first. */
function budgetWarnings(m = currentMonth()) {
  const { budgets } = budgetsFor(m);
  const spent = spentByCategory(m);
  return Object.entries(budgets)
    .filter(([id, b]) => b > 0 && catById(id).type !== 'saving')
    .map(([id, b]) => ({ id, name: catById(id).name, spent: spent[id] || 0, budget: b, ratio: (spent[id] || 0) / b }))
    .filter(w => w.ratio >= NEAR_LIMIT)
    .sort((a, b) => b.ratio - a.ratio);
}

function warningText(w) {
  if (w.spent > w.budget) return `${money(w.spent - w.budget)} over budget`;
  if (w.spent === w.budget) return 'Budget fully used';
  return `${pct(w.ratio)} used — only ${money(w.budget - w.spent)} left`;
}

function showBudgetPopup(list, title) {
  if (!list.length) return;
  const anyOver = list.some(w => w.spent > w.budget);
  openPopup(`
    <div class="popup" role="alertdialog" aria-modal="true" aria-labelledby="popup-title">
      <div class="popup-title" id="popup-title">${icon('alert')}${esc(title || (anyOver ? 'Over budget' : 'Almost at your budget'))}</div>
      <ul class="popup-list">${list.map(w => `
        <li>
          <div class="row"><b>${esc(w.name)}</b><span class="nowrap">${money(w.spent)} / ${money(w.budget)}</span></div>
          <div class="bar over"><span style="width:${Math.min(100, w.ratio * 100)}%"></span></div>
          <div class="small">${warningText(w)}</div>
        </li>`).join('')}
      </ul>
      <div class="form-actions">
        <button class="btn danger-solid" data-action="close-popup">OK</button>
        <button class="btn ghost" data-action="popup-budgets">See budgets</button>
      </div>
    </div>`, { vibrate: 150 });
}

/** After spending in a category, pop up if it is now near or over budget. Returns true if shown. */
function checkCategoryBudget(categoryId, m) {
  const w = budgetWarnings(m).find(x => x.id === categoryId);
  if (!w) return false;
  showBudgetPopup([w], w.spent > w.budget ? `${w.name} is over budget` : `${w.name} is almost at its budget`);
  return true;
}

/** Once a day, when the app opens, list every category that is near or over budget. */
function dailyBudgetCheck() {
  const key = 'pitaka-budget-check-day';
  if (localStorage.getItem(key) === todayStr()) return;
  const list = budgetWarnings();
  if (!list.length) return;
  localStorage.setItem(key, todayStr());
  showBudgetPopup(list, 'Budget check');
}

function renderAlerts() {
  const items = billsNeedingAttention();
  const overdue = items.filter(i => i.status === 'overdue');
  const soon = items.filter(i => i.status === 'due-soon');
  let html = '';
  if (overdue.length) html += `<div class="alert danger"><span><b>${overdue.length} overdue bill${overdue.length > 1 ? 's' : ''}:</b> ${overdue.map(i => `${esc(i.bill.name)} (${money(i.bill.amount)})`).join(', ')}</span>${ui.view !== 'bills' ? '<button class="link-btn" data-view="bills">View bills</button>' : ''}</div>`;
  if (soon.length) html += `<div class="alert warn"><span><b>Due soon:</b> ${soon.map(i => `${esc(i.bill.name)} — ${statusText(i).toLowerCase()}`).join(', ')}</span></div>`;
  const warnings = budgetWarnings();
  if (warnings.length) html += `<div class="alert danger"><span><b>Budget alert:</b> ${warnings.map(w => `${esc(w.name)} — ${w.spent > w.budget ? `${money(w.spent - w.budget)} over` : `${pct(w.ratio)} used`}`).join(', ')}</span>${ui.view !== 'budgets' ? '<button class="link-btn" data-view="budgets">See budgets</button>' : ''}</div>`;
  $('#alerts').innerHTML = ui.view === 'settings' ? '' : html;
}

function render() {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === ui.view));
  const [title, fn] = VIEWS[ui.view];
  $('#view-title').textContent = title;
  $('#month-input').value = ui.month;
  $('#month-picker').hidden = ['settings', 'rewards', 'goals'].includes(ui.view);
  renderAlerts();
  const view = $('#view');
  view.innerHTML = fn();
  view.classList.remove('enter');
  if (ui.animate) {
    void view.offsetWidth; // restart the entrance animation
    view.classList.add('enter');
    animateCounts(view);
    ui.animate = false;
  }
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ---------- Events ---------- */
function go(view) {
  closeSheet();
  ui.view = view;
  ui.animate = true;
  ui.editing = { income: null, expense: null, bill: null };
  render();
  window.scrollTo({ top: 0 });
}

document.addEventListener('click', e => {
  if (e.target.id === 'popup') { closePopup(); return; }
  if (e.target.id === 'sheet') { closeSheet(); return; }
  const viewBtn = e.target.closest('[data-view]');
  if (viewBtn) { go(viewBtn.dataset.view); return; }
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, month, kind } = btn.dataset;

  switch (action) {
    case 'prev-month': ui.month = shiftMonth(ui.month, -1); ui.animate = true; break;
    case 'next-month': ui.month = shiftMonth(ui.month, 1); ui.animate = true; break;
    case 'quick-add': openSheet(); return;
    case 'change-currency': openCurrencyDialog(); return;
    case 'sheet-goal': closeSheet(); go('goals'); return;
    case 'goal-new': openGoalForm(null, { name: btn.dataset.name, target: btn.dataset.target }); return;
    case 'goal-new-after': closePopup(); go('goals'); openGoalForm(null); return;
    case 'goal-edit': openGoalForm(state.goals.find(g => g.id === id)); return;
    case 'goal-add': openGoalMoneyForm(state.goals.find(g => g.id === id), 'add'); return;
    case 'goal-withdraw': openGoalMoneyForm(state.goals.find(g => g.id === id), 'withdraw'); return;
    case 'fill-amount': { const input = $('#popup input[name=amount]'); if (input) input.value = btn.dataset.amount; return; }
    case 'goal-delete': if (!deleteGoal(id)) return; save(); toast('Goal deleted.'); break;
    case 'goal-del-entry': if (!deleteGoalEntry(id, btn.dataset.entry)) return; save(); toast('Entry removed.'); break;
    case 'toggle-theme': {
      const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      setTheme(next);
      toast(`${next === 'dark' ? 'Dark' : 'Light'} mode on.`);
      return;
    }
    case 'set-theme': setTheme(btn.dataset.theme); return;
    case 'fetch-rate': fetchRate(); return;
    case 'popup-rewards': closePopup(); go('rewards'); return;
    case 'this-month': ui.month = currentMonth(); break;
    case 'cancel-edit': ui.editing[kind] = null; break;
    case 'edit-income': ui.editing.income = id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return;
    case 'edit-expense': ui.editing.expense = id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return;
    case 'edit-bill': ui.editing.bill = id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return;
    case 'del-income':
      if (!confirm('Delete this income entry?')) return;
      state.income = state.income.filter(i => i.id !== id); save(); toast('Income deleted.'); break;
    case 'del-expense': {
      if (!confirm('Delete this expense?')) return;
      const exp = state.expenses.find(x => x.id === id);
      state.expenses = state.expenses.filter(x => x.id !== id);
      if (exp?.goalId) { // keep the savings goal in step
        const g = state.goals.find(x => x.id === exp.goalId);
        if (g) g.contributions = g.contributions.filter(c => c.expenseId !== id);
      }
      if (exp?.billId) { // keep bill payment record consistent
        const bill = state.bills.find(b => b.id === exp.billId);
        if (bill?.paid) for (const [k, p] of Object.entries(bill.paid)) if (p.expenseId === id) p.expenseId = null;
      }
      save(); toast('Expense deleted.'); break;
    }
    case 'pay-bill': markBillPaid(id, month); buzz(15); break;
    case 'unpay-bill': unmarkBillPaid(id, month); break;
    case 'del-bill': {
      const bill = state.bills.find(b => b.id === id);
      if (!bill || !confirm(`Delete the bill "${bill.name}"? Expenses already logged for it are kept.`)) return;
      state.bills = state.bills.filter(b => b.id !== id); save(); toast('Bill deleted.'); break;
    }
    case 'clear-budgets':
      if (!confirm(`Remove budgets set for ${monthLabel(ui.month)}?`)) return;
      delete state.budgets[ui.month]; save(); toast('Budgets cleared.'); break;
    case 'apply-suggestions': {
      const next = shiftMonth(ui.month, 1);
      const { rows } = suggestBudgets(ui.month);
      if (state.budgets[next] && !confirm(`Replace the budgets already set for ${monthLabel(next)}?`)) return;
      state.budgets[next] = Object.fromEntries(rows.filter(r => r.suggested > 0).map(r => [r.cat.id, r.suggested]));
      save(); toast(`Budgets applied to ${monthLabel(next)}.`); break;
    }
    case 'del-category': {
      const c = state.categories.find(x => x.id === id);
      const used = state.expenses.some(x => x.categoryId === id) || state.bills.some(b => b.categoryId === id);
      if (used) { alert(`"${c.name}" is used by expenses or bills. Rename it instead, or reassign those first.`); return; }
      if (!confirm(`Delete category "${c.name}"?`)) return;
      state.categories = state.categories.filter(x => x.id !== id);
      for (const b of Object.values(state.budgets)) delete b[id];
      save(); break;
    }
    case 'close-popup': closePopup(); return;
    case 'popup-budgets': closePopup(); ui.month = currentMonth(); go('budgets'); return;
    case 'snap-receipt': closeSheet(); $('#receipt-file').click(); return;
    case 'discard-receipt': discardReceipt(); break;
    case 'export': exportData(); return;
    case 'import': $('#import-file').click(); return;
    case 'demo':
      if ((state.income.length || state.expenses.length || state.bills.length) && !confirm('Replace your current data with demo data?')) return;
      state = buildDemoData(); save(); ui.month = currentMonth(); go('dashboard'); toast('Demo data loaded.'); return;
    case 'reset':
      if (!confirm('Erase ALL your data? This cannot be undone. Export a backup first if needed.')) return;
      state = defaultState(); save(); toast('All data erased.'); break;
    default: return;
  }
  render();
  checkRewards();
});

document.addEventListener('submit', e => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(form).entries());
  const amount = parseFloat(f.amount);

  switch (form.dataset.form) {
    case 'income': {
      if (!(amount > 0)) return toast('Please enter an amount greater than zero.');
      const data = { date: f.date, source: f.source.trim(), amount, note: f.note.trim() };
      if (ui.editing.income) Object.assign(state.income.find(i => i.id === ui.editing.income), data);
      else state.income.push({ id: uid(), ...data });
      toast(ui.editing.income ? 'Income updated.' : `Income of ${money(amount)} added.`);
      ui.editing.income = null;
      if (monthOf(f.date) !== ui.month) ui.month = monthOf(f.date);
      break;
    }
    case 'expense': {
      if (!(amount > 0)) return toast('Please enter an amount greater than zero.');
      const data = { date: f.date, categoryId: f.categoryId, amount, note: f.note.trim() };
      const wasEditing = ui.editing.expense;
      if (wasEditing) Object.assign(state.expenses.find(x => x.id === wasEditing), data);
      else {
        state.expenses.push({ id: uid(), ...data });
        if (ui.receipt?.status === 'done') state.stats.receiptsSnapped = (state.stats.receiptsSnapped || 0) + 1;
        discardReceipt();
      }
      ui.editing.expense = null;
      const m = monthOf(f.date);
      if (m !== ui.month) ui.month = m;
      const b = budgetsFor(m).budgets[f.categoryId];
      const left = b ? b - (spentByCategory(m)[f.categoryId] || 0) : null;
      const name = catById(f.categoryId).name;
      const warned = budgetWarnings(m).some(w => w.id === f.categoryId);
      toast(`${wasEditing ? 'Expense updated.' : `Expense of ${money(amount)} added.`}${left === null || warned ? '' : ` ${money(left)} left in ${name}.`}`);
      setTimeout(() => checkCategoryBudget(f.categoryId, m), 0);
      break;
    }
    case 'bill': {
      if (!(amount > 0)) return toast('Please enter an amount greater than zero.');
      const data = { name: f.name.trim(), amount, categoryId: f.categoryId, recurrence: f.recurrence, logExpense: f.logExpense === 'on' };
      if (f.recurrence === 'monthly') {
        const day = parseInt(f.dueDay, 10);
        if (!(day >= 1 && day <= 31)) return toast('Please enter a due day between 1 and 31.');
        Object.assign(data, { dueDay: day, startMonth: f.startMonth || currentMonth(), dueDate: null });
      } else {
        if (!f.dueDate) return toast('Please choose a due date.');
        Object.assign(data, { dueDate: f.dueDate, dueDay: null, startMonth: null });
      }
      if (ui.editing.bill) Object.assign(state.bills.find(b => b.id === ui.editing.bill), data);
      else state.bills.push({ id: uid(), paid: {}, ...data });
      toast(ui.editing.bill ? 'Bill updated.' : `Bill "${data.name}" added.`);
      ui.editing.bill = null;
      break;
    }
    case 'budgets': {
      const b = {};
      for (const c of state.categories) {
        const v = parseFloat(f[`b_${c.id}`]);
        if (v > 0) b[c.id] = v;
      }
      state.budgets[ui.month] = b;
      toast(`Budgets saved for ${monthLabel(ui.month)}.`);
      break;
    }
    case 'goal': if (!saveGoalForm(f)) return; break;
    case 'goal-money': if (!saveGoalMoney(f)) return; break;
    case 'currency': {
      const from = state.settings.currency, to = f.code;
      if (to === from) { closePopup(); return; }
      let note = 'Amounts were not changed.';
      if (f['cur-mode'] === 'convert') {
        const rate = parseFloat(f.rate);
        if (!(rate > 0)) return toast('Enter the exchange rate, or tap "Get today\'s rate".');
        convertAmounts(rate);
        note = `All amounts converted at 1 ${from} = ${rate} ${to}.`;
      }
      state.settings.currency = to;
      closePopup();
      toast(`Currency changed to ${to}. ${note}`);
      break;
    }
    case 'category': {
      const name = f.name.trim();
      if (state.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) return toast('That category already exists.');
      state.categories.push({ id: uid(), name, type: f.type, color: COLORS[state.categories.length % COLORS.length] });
      toast(`Category "${name}" added.`);
      break;
    }
  }
  save();
  render();
  buzz(15);
  checkRewards();
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'month-input' && t.value) { ui.month = t.value; render(); return; }
  if (t.id === 'expense-filter') { ui.expenseFilter = t.value; render(); return; }
  if (t.id === 'currency-select') { updateRateLabel(); return; }
  if (t.name === 'cur-mode') { $('#convert-box')?.classList.toggle('hidden', t.value !== 'convert'); if (t.value === 'convert') $('#rate-input')?.focus(); return; }
  if (t.id === 'bill-recurrence') {
    document.querySelectorAll('[data-rec]').forEach(el => el.classList.toggle('hidden', el.dataset.rec !== t.value));
    return;
  }
  if (t.dataset.cat) {
    const c = state.categories.find(x => x.id === t.dataset.cat);
    if (!c) return;
    const val = t.value.trim();
    if (t.dataset.field === 'name' && !val) { t.value = c.name; return; }
    c[t.dataset.field] = val;
    save();
    toast('Category updated.');
  }
});

$('#receipt-file').addEventListener('change', e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) scanReceipt(file);
});

$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || !Array.isArray(data.expenses)) throw new Error('Not a Pitaka backup file');
    if (!confirm('Importing will replace all current data. Continue?')) return;
    state = normalize(data); save(); render(); toast('Backup imported.');
  } catch (err) {
    alert(`Could not import: ${err.message}`);
  }
});

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pitaka-backup-${todayStr()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup downloaded.');
}

/* ---------- Demo data ---------- */
function buildDemoData() {
  const d = defaultState();
  const cat = name => d.categories.find(c => c.name === name).id;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cur = currentMonth();
  const today = new Date().getDate();

  for (let i = 3; i >= 0; i--) {
    const m = shiftMonth(cur, -i);
    const dim = daysInMonth(m);
    const lastDay = i === 0 ? today : dim;
    const add = (day, name, amount, note) => { if (day <= lastDay) d.expenses.push({ id: uid(), date: `${m}-${pad(Math.min(day, dim))}`, categoryId: cat(name), amount: Math.round(amount), note }); };

    // Income: twice-monthly salary + occasional freelance
    if (15 <= lastDay) d.income.push({ id: uid(), date: `${m}-15`, source: 'Salary', amount: 22500, note: '1st half' });
    if (dim <= lastDay) d.income.push({ id: uid(), date: `${m}-${dim}`, source: 'Salary', amount: 22500, note: '2nd half' });
    if (i % 2 === 1) d.income.push({ id: uid(), date: `${m}-20`, source: 'Freelance', amount: 6000 + Math.round(rand() * 4000), note: 'Design project' });

    // Variable spending
    for (let w = 0; w < 4; w++) add(3 + w * 7, 'Food & Groceries', 1800 + rand() * 900, 'Groceries');
    const dining = i === 1 ? 12 : 6; // one "bad" month
    for (let k = 0; k < dining; k++) add(2 + Math.floor(rand() * 27), 'Dining Out', 250 + rand() * 600, ['Coffee', 'Lunch out', 'Dinner w/ friends', 'Food delivery'][k % 4]);
    for (let k = 0; k < 8; k++) add(1 + k * 3, 'Transportation', 150 + rand() * 250, ['Grab', 'Gas', 'Jeep/MRT load'][k % 3]);
    add(9, 'Shopping', 1200 + rand() * 2500, 'Clothes');
    if (i === 2) add(22, 'Shopping', 8500, 'New phone case & earbuds');
    add(14, 'Entertainment', 549, 'Streaming subscription');
    add(24, 'Entertainment', 600 + rand() * 900, 'Movies');
    add(11, 'Personal Care', 400 + rand() * 500, 'Haircut & toiletries');
    if (i === 1) add(17, 'Health', 1800, 'Check-up & medicine');
    add(16, 'Savings & Investments', 5000, 'Emergency fund');

    // Budgets
    d.budgets[m] = {
      [cat('Food & Groceries')]: 9000, [cat('Dining Out')]: 3000, [cat('Transportation')]: 2500,
      [cat('Housing & Rent')]: 12000, [cat('Utilities')]: 4500, [cat('Shopping')]: 3000,
      [cat('Entertainment')]: 1500, [cat('Personal Care')]: 1000, [cat('Health')]: 1500,
      [cat('Savings & Investments')]: 8000,
    };
  }

  // Bills
  const start = shiftMonth(cur, -3);
  const bills = [
    ['Rent', 12000, 'Housing & Rent', 5],
    ['Internet', 1699, 'Utilities', 12],
    ['Electricity', 2400, 'Utilities', Math.min(28, today + 2)],
    ['Water', 450, 'Utilities', 18],
    ['Mobile plan', 999, 'Utilities', Math.max(1, today - 3)],
  ];
  for (const [name, amount, catName, dueDay] of bills) {
    const bill = { id: uid(), name, amount, categoryId: cat(catName), recurrence: 'monthly', dueDay, startMonth: start, logExpense: true, paid: {} };
    for (let i = 3; i >= 0; i--) {
      const m = shiftMonth(cur, -i);
      const due = `${m}-${pad(Math.min(dueDay, daysInMonth(m)))}`;
      if (i === 0 && (name === 'Mobile plan' || due > todayStr())) continue; // leave one overdue + upcoming ones unpaid
      const late = i === 2 && name === 'Electricity';
      const payDate = toDateStr(new Date(parseDate(due).getTime() + (late ? 4 : -1) * 86400000));
      const expenseId = uid();
      d.expenses.push({ id: expenseId, date: payDate, categoryId: bill.categoryId, amount, note: `Bill: ${name}`, billId: bill.id });
      bill.paid[m] = { date: payDate, expenseId };
    }
    d.bills.push(bill);
  }

  // Savings goals: the monthly "Emergency fund" transfers above feed the first goal.
  const savingsId = cat('Savings & Investments');
  const ef = { id: uid(), name: 'Emergency fund', target: 60000, deadline: `${shiftMonth(cur, 8)}-28`, createdAt: `${shiftMonth(cur, -3)}-01`, contributions: [
    { id: uid(), date: `${shiftMonth(cur, -3)}-01`, amount: 15000, note: 'Starting amount' },
  ] };
  for (const e of d.expenses.filter(x => x.categoryId === savingsId)) {
    e.goalId = ef.id;
    ef.contributions.push({ id: uid(), date: e.date, amount: e.amount, note: 'From salary', expenseId: e.id });
  }
  const trip = { id: uid(), name: 'Japan trip', target: 45000, deadline: `${shiftMonth(cur, 5)}-15`, createdAt: `${shiftMonth(cur, -2)}-01`,
    contributions: [2, 1, 0].map(i => ({ id: uid(), date: `${shiftMonth(cur, -i)}-${pad(i === 0 ? Math.min(today, 5) : 5)}`, amount: 4000, note: 'Travel jar' })) };
  d.goals = [ef, trip];
  return d;
}

/* ---------- Init ---------- */
document.querySelectorAll('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
applyTheme();
render();
checkRewards();
dailyBudgetCheck();
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePopup(); closeSheet(); } });
// Refresh due-date statuses if the app is left open across midnight.
setInterval(() => { if (!document.querySelector('form :focus')) renderAlerts(); }, 60 * 60 * 1000);

// Register the service worker so the app can be installed and works offline.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker not registered', err));
}
