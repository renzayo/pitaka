'use strict';

/* =========================================================
   Savings goals: targets you save toward over time.
   Uses helpers defined in app.js (state, money, icon, …).
   ========================================================= */

const GOAL_STARS = 5; // stars for reaching a goal
const GOAL_PRESETS = [
  ['Emergency fund', 50000],
  ['Travel', 30000],
  ['New phone', 25000],
  ['House', 200000],
];

const goalSaved = g => Math.max(0, (g.contributions || []).reduce((a, c) => a + c.amount, 0));
const goalDone = g => goalSaved(g) >= g.target;
const savingsCategoryId = () => state.categories.find(c => c.type === 'saving')?.id || null;

function goalIconName(name) {
  const n = String(name || '').toLowerCase();
  const map = [
    [/emergenc|rainy|safety/, 'heart'], [/travel|trip|vacation|holiday|japan|korea|flight|tour/, 'plane'],
    [/house|home|condo|lot|renovat/, 'home'], [/car|motor|bike/, 'car'], [/phone|laptop|gadget|iphone|computer|camera/, 'phone'],
    [/school|tuition|educ|course/, 'book'], [/wedding|gift|christmas|birthday|anniversary/, 'gift'], [/invest|stock|retire/, 'trend'],
  ];
  for (const [re, ic] of map) if (re.test(n)) return ic;
  return 'piggy';
}

/** Progress details for one goal: pace, monthly amount needed, expected finish. */
function goalInfo(g) {
  const saved = goalSaved(g);
  const left = Math.max(0, g.target - saved);
  const done = saved >= g.target;
  const today = todayStr();
  const info = { saved, left, done, ratio: g.target ? Math.min(1, saved / g.target) : 0 };

  // Average saved per month over the last 90 days (only money added, not taken out).
  const recent = (g.contributions || []).filter(c => c.amount > 0 && daysBetween(c.date, today) <= 90);
  const firstDate = (g.contributions || []).map(c => c.date).sort()[0] || g.createdAt || today;
  const spanMonths = Math.min(3, Math.max(1, daysBetween(firstDate, today) / 30.44));
  info.perMonth = recent.reduce((a, c) => a + c.amount, 0) / spanMonths;

  if (!done && info.perMonth > 0) {
    const months = Math.ceil(left / info.perMonth);
    info.etaMonth = shiftMonth(currentMonth(), months);
  }
  if (g.deadline && !done) {
    const days = daysBetween(today, g.deadline);
    info.daysLeft = days;
    info.overdue = days < 0;
    info.needPerMonth = days >= 0 ? left / Math.max(1, Math.ceil(days / 30.44)) : left;
    info.onTrack = info.etaMonth ? info.etaMonth <= monthOf(g.deadline) : false;
  }
  return info;
}

/* ---------- Rendering ---------- */
function goalStatus(g, i) {
  if (i.done) return `<span class="badge good">${icon('check')} Reached${g.completedAt ? ` ${fmtDay(g.completedAt)}` : ''}</span>`;
  if (i.overdue) return '<span class="badge danger">Target date passed</span>';
  if (g.deadline) return i.onTrack ? '<span class="badge good">On track</span>' : '<span class="badge warn">Behind</span>';
  return '';
}

function goalCard(g) {
  const i = goalInfo(g);
  const history = [...(g.contributions || [])].sort((a, b) => b.date.localeCompare(a.date));
  return `
    <div class="card goal-card ${i.done ? 'done' : ''}">
      <div class="goal-top">
        <span class="goal-ic">${icon(goalIconName(g.name))}</span>
        <div class="goal-title">
          <b>${esc(g.name)}</b>
          <div class="small muted">${g.deadline ? `Target date: ${parseDate(g.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No target date'}</div>
        </div>
        <span class="goal-actions">
          <button class="act-btn" data-action="goal-edit" data-id="${g.id}" aria-label="Edit goal" title="Edit">${icon('edit')}</button>
          <button class="act-btn danger" data-action="goal-delete" data-id="${g.id}" aria-label="Delete goal" title="Delete">${icon('trash')}</button>
        </span>
      </div>
      <div class="goal-amounts">
        <span class="goal-saved">${money(i.saved)}</span>
        <span class="muted">of ${money(g.target)}</span>
        <span class="goal-pct">${pct(i.ratio)}</span>
      </div>
      <div class="bar goal-bar ${i.done ? 'done' : ''}"><span style="width:${i.ratio * 100}%"></span>
        <i style="left:25%"></i><i style="left:50%"></i><i style="left:75%"></i></div>
      <div class="goal-meta small">
        <span>${i.done ? 'Goal reached. Well done!' : `${money(i.left)} to go`}</span>
        ${goalStatus(g, i)}
      </div>
      ${!i.done && g.deadline && !i.overdue ? `<div class="small muted">Save about <b>${money(i.needPerMonth)}</b> a month to reach it on time.</div>` : ''}
      ${!i.done && i.etaMonth ? `<div class="small muted">At your pace (${money(i.perMonth)}/month) you'll get there around <b>${monthLabel(i.etaMonth)}</b>.</div>` : ''}
      ${!i.done && !i.etaMonth && !history.length ? '<div class="small muted">Add your first deposit to get started.</div>' : ''}
      <div class="form-actions goal-buttons">
        ${i.done ? '' : `<button class="btn small" data-action="goal-add" data-id="${g.id}">${icon('plus')}Add money</button>`}
        ${i.saved > 0 ? `<button class="btn small ghost" data-action="goal-withdraw" data-id="${g.id}">${icon('minus')}Take out</button>` : ''}
      </div>
      ${history.length ? `
        <details class="goal-history">
          <summary class="small muted">History (${history.length})</summary>
          ${history.slice(0, 20).map(c => `
            <div class="list-item small">
              <span><span class="muted">${fmtDay(c.date)}</span> ${esc(c.note || (c.amount > 0 ? 'Deposit' : 'Withdrawal'))}</span>
              <span class="nowrap"><b class="${c.amount > 0 ? 'pos' : 'neg'}">${c.amount > 0 ? '+' : '−'}${money(Math.abs(c.amount))}</b>
                <button class="act-btn danger" data-action="goal-del-entry" data-id="${g.id}" data-entry="${c.id}" aria-label="Remove entry" title="Remove">${icon('trash')}</button></span>
            </div>`).join('')}
        </details>` : ''}
    </div>`;
}

function renderGoals() {
  const goals = state.goals;
  const active = goals.filter(g => !goalDone(g));
  const done = goals.filter(goalDone);
  const totalSaved = sum(goals.map(goalSaved));
  const totalTarget = sum(goals.map(g => g.target));

  if (!goals.length) {
    return `
      <div class="card goal-empty">
        <div class="goal-empty-ic">${icon('piggy')}</div>
        <h2 style="justify-content:center">Save for what matters</h2>
        <p class="muted">Set a target, add money whenever you can, and watch your progress grow. You earn ${GOAL_STARS} stars for every goal you reach.</p>
        <button class="btn" data-action="goal-new">${icon('plus')}Create a goal</button>
        <div class="small muted" style="margin-top:16px">Or start with one of these:</div>
        <div class="goal-presets">${GOAL_PRESETS.map(([n, t]) => `
          <button class="btn small ghost" data-action="goal-new" data-name="${esc(n)}" data-target="${t}">${icon(goalIconName(n))}${esc(n)}</button>`).join('')}
        </div>
      </div>`;
  }

  return `
    <div class="grid cols-3">
      <div class="card stat"><span class="s-ic">${icon('piggy')}</span><div class="label">Saved in goals</div><div class="value pos">${money(totalSaved)}</div><div class="sub">of ${money(totalTarget)} in total</div></div>
      <div class="card stat"><span class="s-ic">${icon('flag')}</span><div class="label">Active goals</div><div class="value">${active.length}</div><div class="sub">${money(sum(active.map(g => goalInfo(g).left)))} still to save</div></div>
      <div class="card stat"><span class="s-ic">${icon('trophy')}</span><div class="label">Goals reached</div><div class="value gold">${done.length}</div><div class="sub">+${GOAL_STARS} stars each</div></div>
    </div>

    <div class="section-head">
      <h2>${h('flag', 'Your goals')}</h2>
      <button class="btn small" data-action="goal-new">${icon('plus')}New goal</button>
    </div>
    ${active.length ? `<div class="grid cols-2">${active.map(goalCard).join('')}</div>` : empty('All your goals are reached. Time to set a new one!')}

    ${done.length ? `
      <div class="section-head"><h2>${h('trophy', 'Reached')}</h2></div>
      <div class="grid cols-2">${done.map(goalCard).join('')}</div>` : ''}`;
}

/** Small card for the Home screen. */
function goalsHomeCard() {
  const active = state.goals.filter(g => !goalDone(g));
  if (!state.goals.length) {
    return `<button class="card goal-prompt" data-view="goals" style="margin-top:16px">
      <span class="goal-ic">${icon('piggy')}</span>
      <span class="rs-main"><b>Start a savings goal</b><span class="small muted">Emergency fund, travel, a new phone… track it here.</span></span>
      <span class="rs-go">${icon('right')}</span></button>`;
  }
  const show = (active.length ? active : state.goals).slice(0, 3);
  return `
    <div class="card" style="margin-top:16px">
      <h2>${h('piggy', 'Savings goals')} <button class="link-btn" data-view="goals">All goals</button></h2>
      ${show.map(g => { const i = goalInfo(g); return `
        <div class="budget-row">
          <div class="top"><span class="chip"><span class="cat-ic">${icon(goalIconName(g.name))}</span>${esc(g.name)}</span><span class="nowrap"><b>${money(i.saved)}</b> <span class="muted">/ ${money(g.target)}</span></span></div>
          <div class="bar goal-bar ${i.done ? 'done' : ''}"><span style="width:${i.ratio * 100}%"></span></div>
          <div class="meta"><span>${i.done ? 'Reached!' : `${money(i.left)} to go`}</span><span>${pct(i.ratio)}</span></div>
        </div>`; }).join('')}
    </div>`;
}

/* ---------- Pop-up forms ---------- */
function openGoalForm(goal, preset = {}) {
  const g = goal || {};
  openPopup(`
    <div class="popup plain" role="dialog" aria-modal="true" aria-labelledby="popup-title">
      <div class="popup-title" id="popup-title">${icon('flag')}${goal ? 'Edit goal' : 'New savings goal'}</div>
      <form data-form="goal" class="popup-form">
        <input type="hidden" name="id" value="${g.id || ''}">
        <label class="field">What are you saving for?<input name="name" required maxlength="40" placeholder="e.g. Emergency fund" value="${esc(g.name || preset.name || '')}"></label>
        <label class="field">Target amount<input name="target" type="number" inputmode="decimal" min="1" step="0.01" required placeholder="0.00" value="${g.target || preset.target || ''}"></label>
        <label class="field">Target date (optional)<input name="deadline" type="date" value="${g.deadline || ''}"></label>
        ${goal ? '' : '<label class="field">Already saved (optional)<input name="start" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00"></label>'}
        <div class="form-actions">
          <button class="btn" type="submit">${goal ? 'Save changes' : 'Create goal'}</button>
          <button class="btn ghost" type="button" data-action="close-popup">Cancel</button>
        </div>
      </form>
    </div>`);
}

function openGoalMoneyForm(goal, kind) {
  const i = goalInfo(goal);
  const adding = kind === 'add';
  const savingsId = savingsCategoryId();
  openPopup(`
    <div class="popup plain" role="dialog" aria-modal="true" aria-labelledby="popup-title">
      <div class="popup-title" id="popup-title">${icon(adding ? 'plus' : 'minus')}${adding ? 'Add money to' : 'Take money out of'} ${esc(goal.name)}</div>
      <p class="small muted" style="margin:0 0 10px">${money(i.saved)} saved · ${money(i.left)} to go</p>
      <form data-form="goal-money" class="popup-form">
        <input type="hidden" name="goalId" value="${goal.id}">
        <input type="hidden" name="kind" value="${kind}">
        <label class="field">Amount<input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required placeholder="0.00" ${adding ? '' : `max="${i.saved}"`}></label>
        ${adding && i.left > 0 ? `<div class="quick-amounts">${[...new Set([i.needPerMonth, i.left].filter(x => x > 0).map(x => Math.round(x * 100) / 100))].map(x => `<button type="button" class="btn small ghost" data-action="fill-amount" data-amount="${x}">${x === Math.round(i.left * 100) / 100 ? 'All remaining ' : 'Monthly target '}${money(x)}</button>`).join('')}</div>` : ''}
        <label class="field">Date<input name="date" type="date" required value="${todayStr()}"></label>
        <label class="field">Note (optional)<input name="note" maxlength="60" placeholder="${adding ? 'e.g. From salary' : 'e.g. Used for emergency'}"></label>
        ${adding && savingsId ? `<label class="field check"><input type="checkbox" name="logExpense" checked> Also log it under ${esc(catById(savingsId).name)} so your budget and savings rate include it</label>` : ''}
        <div class="form-actions">
          <button class="btn" type="submit">${adding ? 'Add money' : 'Take out'}</button>
          <button class="btn ghost" type="button" data-action="close-popup">Cancel</button>
        </div>
      </form>
    </div>`);
}

/* ---------- Saving changes ---------- */
function saveGoalForm(f) {
  const target = parseFloat(f.target);
  const name = f.name.trim();
  if (!name) return toast('Please give your goal a name.');
  if (!(target > 0)) return toast('Please enter a target amount.');
  if (f.id) {
    const g = state.goals.find(x => x.id === f.id);
    Object.assign(g, { name, target, deadline: f.deadline || null });
    if (goalSaved(g) >= g.target && !g.completedAt) g.completedAt = todayStr();
    toast('Goal updated.');
  } else {
    const start = parseFloat(f.start);
    const g = { id: uid(), name, target, deadline: f.deadline || null, createdAt: todayStr(), contributions: [] };
    if (start > 0) g.contributions.push({ id: uid(), date: todayStr(), amount: start, note: 'Starting amount' });
    if (goalSaved(g) >= target) g.completedAt = todayStr();
    state.goals.push(g);
    toast(`Goal "${name}" created. You've got this!`);
  }
  closePopup();
  return true;
}

function saveGoalMoney(f) {
  const g = state.goals.find(x => x.id === f.goalId);
  if (!g) return;
  let amount = parseFloat(f.amount);
  if (!(amount > 0)) return toast('Please enter an amount greater than zero.');
  const before = goalSaved(g) / g.target;
  if (f.kind === 'withdraw') {
    if (amount > goalSaved(g) + 0.001) return toast(`You can take out at most ${money(goalSaved(g))}.`);
    amount = -amount;
  }
  const entry = { id: uid(), date: f.date || todayStr(), amount, note: f.note.trim() };
  if (amount > 0 && f.logExpense === 'on' && savingsCategoryId()) {
    entry.expenseId = uid();
    state.expenses.push({ id: entry.expenseId, date: entry.date, categoryId: savingsCategoryId(), amount, note: `Savings goal: ${g.name}`, goalId: g.id });
  }
  g.contributions = [...(g.contributions || []), entry];
  closePopup();

  const after = goalSaved(g) / g.target;
  if (amount < 0) { toast(`${money(-amount)} taken out of ${g.name}.`); return true; }
  if (after >= 1 && before < 1) {
    if (!g.completedAt) g.completedAt = todayStr();
    celebrateGoal(g);
  } else {
    const milestone = [0.75, 0.5, 0.25].find(m => before < m && after >= m);
    toast(milestone
      ? `${milestone === 0.5 ? 'Halfway there' : `${pct(milestone)} of the way`} to ${g.name}! Keep going.`
      : `${money(amount)} added to ${g.name}. ${money(goalInfo(g).left)} to go.`);
  }
  return true;
}

function celebrateGoal(g) {
  openPopup(`
    <div class="popup celebrate" role="alertdialog" aria-modal="true" aria-labelledby="popup-title">
      <div class="hero-star goal-hero">${icon(goalIconName(g.name), 'big-star')}</div>
      <div class="popup-title" id="popup-title">Goal reached!</div>
      <p style="margin:0 0 6px">You saved <b>${money(goalSaved(g))}</b> for <b>${esc(g.name)}</b>.</p>
      <p class="small muted" style="margin:0 0 14px">That's +${GOAL_STARS} stars. Be proud of yourself!</p>
      <div class="form-actions">
        <button class="btn gold" data-action="close-popup">Awesome!</button>
        <button class="btn ghost" data-action="goal-new-after">Set a new goal</button>
      </div>
      <button class="link-btn" data-share-action="open" style="margin-top:12px">${icon('share')} Share this win and inspire others</button>
    </div>`, { confetti: true, vibrate: [40, 60, 40, 60, 80] });
}

function deleteGoalEntry(goalId, entryId) {
  const g = state.goals.find(x => x.id === goalId);
  const entry = g?.contributions.find(c => c.id === entryId);
  if (!entry) return false;
  if (!confirm(`Remove this ${entry.amount > 0 ? 'deposit' : 'withdrawal'} of ${money(Math.abs(entry.amount))}?${entry.expenseId ? ' The matching savings expense will be removed too.' : ''}`)) return false;
  g.contributions = g.contributions.filter(c => c.id !== entryId);
  if (entry.expenseId) state.expenses = state.expenses.filter(e => e.id !== entry.expenseId);
  // A goal keeps its "reached" date (and its stars) even if money is later removed.
  return true;
}

function deleteGoal(goalId) {
  const g = state.goals.find(x => x.id === goalId);
  if (!g) return false;
  if (!confirm(`Delete the goal "${g.name}"? Its history will be removed. Savings expenses already logged stay in your expenses.`)) return false;
  state.goals = state.goals.filter(x => x.id !== goalId);
  for (const e of state.expenses) if (e.goalId === goalId) delete e.goalId;
  return true;
}
