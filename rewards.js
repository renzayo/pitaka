'use strict';

/* =========================================================
   Rewards: stars, levels and badges for good money habits.
   Everything is worked out from the user's data, so it can't
   drift out of sync. Uses helpers defined in app.js.
   ========================================================= */

const LEVELS = [
  { min: 0, name: 'Beginner' },
  { min: 10, name: 'Starter' },
  { min: 25, name: 'Saver' },
  { min: 50, name: 'Budget Pro' },
  { min: 100, name: 'Money Master' },
  { min: 200, name: 'Legend' },
];

/** Stars a month earns (or is on track to earn, for the current month). Null if the month has no budgets or activity. */
function monthRewards(m) {
  const { budgets } = budgetsFor(m);
  const ids = Object.keys(budgets).filter(id => budgets[id] > 0);
  if (!ids.length || (!expensesIn(m).length && !incomeIn(m).length)) return null;
  const spent = spentByCategory(m);
  const items = [];

  // Spending categories earn a star for staying under budget; savings categories for reaching their target.
  const isSaving = id => catById(id).type === 'saving';
  const within = ids.filter(id => isSaving(id) ? (spent[id] || 0) >= budgets[id] : (spent[id] || 0) <= budgets[id]);
  for (const id of within) items.push({ stars: 1, label: isSaving(id) ? `Reached your ${catById(id).name} target` : `${catById(id).name} stayed within budget`, categoryId: id });
  const perfect = within.length === ids.length;
  if (perfect) items.push({ stars: 3, label: 'Perfect month: every category on budget' });

  const inc = totalIncome(m);
  let savingSpend = 0;
  for (const [id, v] of Object.entries(spent)) if (catById(id).type === 'saving') savingSpend += v;
  const saved = inc - (totalExpenses(m) - savingSpend);
  const saver = inc > 0 && saved / inc >= 0.2;
  if (saver) items.push({ stars: 2, label: 'Saved 20% or more of your income' });

  const billStats = state.bills.map(b => billStatus(b, m)).filter(Boolean);
  const billsOnTime = billStats.length > 0 && billStats.every(s => s.status === 'paid' && !s.late);
  if (billsOnTime) items.push({ stars: 1, label: 'Paid every bill on time' });

  return {
    month: m, items, perfect, saver, billsOnTime,
    within: within.length, budgeted: ids.length,
    total: items.reduce((a, b) => a + b.stars, 0),
    possible: ids.length + 3 + (inc > 0 ? 2 : 0) + (billStats.length ? 1 : 0),
  };
}

/** All months from the first month with data up to (but not including) the current month. */
function completedMonths() {
  const dates = [...state.expenses, ...state.income].map(x => x.date).sort();
  if (!dates.length) return [];
  const out = [];
  for (let k = monthOf(dates[0]), cur = currentMonth(); k < cur; k = shiftMonth(k, 1)) out.push(k);
  return out;
}

/** Days with at least one logged entry, as a sorted list of unique date strings. */
function loggedDays() {
  return [...new Set([...state.expenses.filter(e => !e.billId), ...state.income].map(x => x.date))].sort();
}

/** Current and best run of consecutive days with something logged. */
function loggingStreaks() {
  const days = loggedDays();
  const runs = [];
  let prev = null;
  for (const d of days) {
    if (prev && daysBetween(prev, d) === 1) runs[runs.length - 1]++;
    else runs.push(1);
    prev = d;
  }
  const last = days[days.length - 1];
  const current = last && daysBetween(last, todayStr()) <= 1 ? runs[runs.length - 1] : 0;
  return { current, best: Math.max(0, ...runs), runs };
}

function perfectStreaks(months) {
  let run = 0, best = 0;
  for (const m of months) {
    const r = monthRewards(m);
    run = r && r.perfect ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current: run, best };
}

const BADGES = [
  { id: 'first-expense', icon: 'expense', name: 'First Step', desc: 'Log your first expense' },
  { id: 'first-budget', icon: 'budget', name: 'Planner', desc: 'Set your first budget' },
  { id: 'snapper', icon: 'camera', name: 'Snapper', desc: 'Log an expense from a receipt photo' },
  { id: 'habit-7', icon: 'flame', name: 'On a Roll', desc: 'Log something 7 days in a row' },
  { id: 'bill-boss', icon: 'calendarCheck', name: 'Bill Boss', desc: 'Pay every bill on time for a month' },
  { id: 'saver', icon: 'piggy', name: 'Super Saver', desc: 'Save 20% of your income in a month' },
  { id: 'perfect', icon: 'trophy', name: 'Perfect Month', desc: 'Keep every category on budget for a month' },
  { id: 'streak-3', icon: 'medal', name: 'Hat Trick', desc: '3 perfect months in a row' },
  { id: 'dreamer', icon: 'flag', name: 'Dreamer', desc: 'Create a savings goal' },
  { id: 'goal-getter', icon: 'piggy', name: 'Goal Getter', desc: 'Reach a savings goal' },
  { id: 'inspirer', icon: 'users', name: 'Inspirer', desc: 'Share your progress to inspire others' },
  { id: 'stars-25', icon: 'star', name: 'Star Collector', desc: 'Earn 25 stars' },
  { id: 'stars-100', icon: 'star', name: 'Superstar', desc: 'Earn 100 stars' },
];

/** Full rewards picture: stars, level, streaks, badges and per-month history. */
function computeRewards() {
  const months = completedMonths();
  const history = months.map(monthRewards).filter(Boolean).reverse(); // newest first
  const log = loggingStreaks();
  const habitStars = log.runs.reduce((a, r) => a + Math.floor(r / 7), 0); // 1 star per full week logged
  const monthStars = history.reduce((a, h) => a + h.total, 0);
  const goalsReached = state.goals.filter(g => g.completedAt).length;
  const goalStars = goalsReached * GOAL_STARS;
  const stars = monthStars + habitStars + goalStars;
  const perfect = perfectStreaks(months);

  let level = 0;
  LEVELS.forEach((l, i) => { if (stars >= l.min) level = i; });
  const next = LEVELS[level + 1];

  const earned = new Set();
  if (state.expenses.length) earned.add('first-expense');
  if (Object.values(state.budgets).some(b => Object.values(b).some(v => v > 0))) earned.add('first-budget');
  if ((state.stats?.receiptsSnapped || 0) > 0) earned.add('snapper');
  if (log.best >= 7) earned.add('habit-7');
  if (history.some(h => h.billsOnTime)) earned.add('bill-boss');
  if (history.some(h => h.saver)) earned.add('saver');
  if (history.some(h => h.perfect)) earned.add('perfect');
  if (perfect.best >= 3) earned.add('streak-3');
  if (stars >= 25) earned.add('stars-25');
  if (stars >= 100) earned.add('stars-100');
  if (state.goals.length) earned.add('dreamer');
  if (goalsReached) earned.add('goal-getter');
  if ((state.stats?.shares || 0) > 0) earned.add('inspirer');

  return {
    stars, monthStars, habitStars, goalStars, goalsReached, history,
    level: level + 1, levelName: LEVELS[level].name,
    nextLevel: next ? { name: next.name, need: next.min - stars, progress: (stars - LEVELS[level].min) / (next.min - LEVELS[level].min) } : null,
    logStreak: log, perfectStreak: perfect,
    badges: BADGES.map(b => ({ ...b, earned: earned.has(b.id) })),
    current: monthRewards(currentMonth()),
  };
}
