'use strict';

/* =========================================================
   Share studio: turn your progress into images you can post
   (a swipeable carousel, or a photo of an expense with a card).
   Everything is drawn on the device; nothing is uploaded until
   the user picks where to share. Uses helpers from app.js.
   ========================================================= */

const SHARE_W = 1080, SHARE_H = 1350; // 4:5 portrait, the best fit for Instagram and Facebook feeds
const SHARE_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SHARE_TAGS = '#PitakaChallenge #BudgetBuddy #IponChallenge #FinancialLiteracy';

const SHARE_THEMES = {
  forest: { name: 'Forest', bg: ['#065f46', '#022c22'], text: '#ffffff', muted: 'rgba(255,255,255,0.72)', card: 'rgba(255,255,255,0.10)', accent: '#fbbf24', good: '#6ee7b7', bad: '#fca5a5', track: 'rgba(255,255,255,0.18)' },
  night: { name: 'Night', bg: ['#1f2937', '#030712'], text: '#f9fafb', muted: 'rgba(249,250,251,0.68)', card: 'rgba(255,255,255,0.08)', accent: '#fbbf24', good: '#4ade80', bad: '#f87171', track: 'rgba(255,255,255,0.15)' },
  sunset: { name: 'Sunset', bg: ['#f97316', '#be185d'], text: '#ffffff', muted: 'rgba(255,255,255,0.82)', card: 'rgba(255,255,255,0.16)', accent: '#fef08a', good: '#bbf7d0', bad: '#fee2e2', track: 'rgba(255,255,255,0.28)' },
  paper: { name: 'Paper', bg: ['#fffbeb', '#f5f5f4'], text: '#111827', muted: '#6b7280', card: 'rgba(17,24,39,0.06)', accent: '#d97706', good: '#15803d', bad: '#b91c1c', track: 'rgba(17,24,39,0.10)' },
};
const SLIDE_TYPES = [['cover', 'Cover'], ['budget', 'Budget'], ['savings', 'Savings & goals'], ['rewards', 'Rewards'], ['next', 'Next month']];

const shareState = {
  tab: 'carousel', month: null, theme: 'forest', showAmounts: false, includeLink: true,
  slides: new Set(SLIDE_TYPES.map(s => s[0])),
  expenseId: null, photo: null, caption: '', position: 'bottom',
  canvases: [], files: [], token: 0, postText: null,
};

const appLink = () => `${location.host}${location.pathname}`.replace(/index\.html$/, '').replace(/\/$/, '');

/* ---------- Canvas helpers ---------- */
const iconCache = new Map();
function iconImage(name, color, fill = 'none') {
  const key = `${name}|${color}|${fill}`;
  if (!iconCache.has(key)) {
    iconCache.set(key, new Promise(resolve => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="192" height="192" fill="${fill}" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.dots}</svg>`;
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }));
  }
  return iconCache.get(key);
}
async function drawIcon(ctx, name, x, y, size, color, fill) {
  const img = await iconImage(name, color, fill);
  if (img) ctx.drawImage(img, x, y, size, size);
}
function newCanvas() {
  const c = document.createElement('canvas');
  c.width = SHARE_W; c.height = SHARE_H;
  return c;
}
function setFont(ctx, size, weight = 400) { ctx.font = `${weight} ${size}px ${SHARE_FONT}`; }
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function fitText(ctx, s, maxW) {
  s = String(s);
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}
function txt(ctx, s, x, y, { size = 40, weight = 400, color = '#fff', align = 'left', maxW } = {}) {
  setFont(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(maxW ? fitText(ctx, s, maxW) : String(s), x, y);
}
function wrapText(ctx, s, x, y, maxW, lineH, { size = 40, weight = 400, color = '#fff', maxLines = 4, align = 'left' } = {}) {
  setFont(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  const words = String(s).split(/\s+/).filter(Boolean);
  let lines = [], line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = fitText(ctx, `${lines[maxLines - 1]}…`, maxW); }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  return y + lines.length * lineH;
}
function bar(ctx, x, y, w, h, ratio, t, color) {
  ctx.fillStyle = t.track; rrect(ctx, x, y, w, h, h / 2); ctx.fill();
  if (ratio > 0) { ctx.fillStyle = color; rrect(ctx, x, y, Math.max(h, w * Math.min(1, ratio)), h, h / 2); ctx.fill(); }
}
function card(ctx, x, y, w, h, color, r = 36) { ctx.fillStyle = color; rrect(ctx, x, y, w, h, r); ctx.fill(); }
function paintBg(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, SHARE_W, SHARE_H);
  g.addColorStop(0, t.bg[0]); g.addColorStop(1, t.bg[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  ctx.globalAlpha = 0.07; ctx.fillStyle = t.text;
  ctx.beginPath(); ctx.arc(SHARE_W - 90, 150, 280, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(60, SHARE_H - 160, 210, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}
async function footer(ctx, t, idx, total) {
  await drawIcon(ctx, 'wallet', 70, SHARE_H - 102, 44, t.text);
  txt(ctx, 'Pitaka', 126, SHARE_H - 66, { size: 34, weight: 700, color: t.text });
  setFont(ctx, 34, 700);
  txt(ctx, '· budgeting together', 126 + ctx.measureText('Pitaka ').width, SHARE_H - 66, { size: 30, color: t.muted });
  if (total > 1) {
    for (let i = 0; i < total; i++) {
      ctx.fillStyle = i === idx ? t.text : t.track;
      ctx.beginPath(); ctx.arc(SHARE_W - 70 - (total - 1 - i) * 30, SHARE_H - 78, i === idx ? 9 : 7, 0, Math.PI * 2); ctx.fill();
    }
  }
}
async function heading(ctx, t, title, sub, ic) {
  await drawIcon(ctx, ic, 70, 92, 64, t.accent);
  txt(ctx, title, 156, 142, { size: 58, weight: 800, color: t.text, maxW: SHARE_W - 230 });
  if (sub) txt(ctx, sub, 72, 212, { size: 34, color: t.muted, maxW: SHARE_W - 140 });
}

/* ---------- Data for the carousel ---------- */
function shareData(m) {
  const { budgets } = budgetsFor(m);
  const spent = spentByCategory(m);
  const inc = totalIncome(m), exp = totalExpenses(m);
  const cats = Object.keys(budgets).filter(id => budgets[id] > 0).map(id => {
    const c = catById(id), s = spent[id] || 0, b = budgets[id], saving = c.type === 'saving';
    return { id, name: c.name, icon: categoryIconName(c.name), s, b, ratio: s / b, saving, ok: saving ? s >= b : s <= b };
  }).sort((a, b) => Number(b.ok) - Number(a.ok) || a.ratio - b.ratio);
  let savingSpend = 0;
  for (const [id, v] of Object.entries(spent)) if (catById(id).type === 'saving') savingSpend += v;
  const saved = inc - (exp - savingSpend);
  const insights = buildInsights(m);
  const skip = /bill|largest|no data|no income/i;
  return {
    m, inc, exp, cats, saved,
    onBudget: cats.filter(c => c.ok).length,
    rate: inc > 0 ? saved / inc : null,
    r: computeRewards(),
    goals: state.goals.map(g => ({ g, i: goalInfo(g) })).sort((a, b) => Number(a.i.done) - Number(b.i.done) || b.i.ratio - a.i.ratio),
    reached: state.goals.filter(g => g.completedAt && monthOf(g.completedAt) === m),
    wins: insights.filter(i => i.level === 'good' && !skip.test(i.title)).map(i => i.title).slice(0, 2),
    tips: insights.filter(i => i.level !== 'good' && !skip.test(i.title)).map(i => i.title).slice(0, 3),
    inProgress: elapsed(m) < 1,
  };
}

/* ---------- Carousel slides ---------- */
const SLIDES = {
  async cover(ctx, d, t) {
    await drawIcon(ctx, 'wallet', 72, 96, 56, t.accent);
    txt(ctx, 'MONEY CHECK-IN', 146, 138, { size: 32, weight: 700, color: t.muted });
    txt(ctx, `My ${monthLabel(d.m, { month: 'long' })}`, 72, 340, { size: 104, weight: 800, color: t.text, maxW: SHARE_W - 144 });
    txt(ctx, 'money story', 72, 456, { size: 104, weight: 800, color: t.accent });
    txt(ctx, d.inProgress ? 'How it is going so far' : 'How my month went', 72, 530, { size: 40, color: t.muted });

    card(ctx, 72, 610, SHARE_W - 144, 300, t.card);
    await drawIcon(ctx, 'star', 116, 660, 200, t.accent, t.accent);
    txt(ctx, `${d.r.stars} stars`, 360, 750, { size: 80, weight: 800, color: t.text });
    txt(ctx, `Level ${d.r.level} · ${d.r.levelName}`, 360, 812, { size: 40, color: t.muted });
    if (d.r.logStreak.current) {
      await drawIcon(ctx, 'flame', 360, 834, 40, t.accent);
      txt(ctx, `${d.r.logStreak.current}-day logging streak`, 410, 866, { size: 34, color: t.muted });
    }

    let y = 1010;
    for (const g of d.reached.slice(0, 2)) {
      await drawIcon(ctx, 'trophy', 72, y - 46, 56, t.accent);
      txt(ctx, `Reached my ${g.name} goal!`, 146, y, { size: 44, weight: 700, color: t.text, maxW: SHARE_W - 220 });
      y += 76;
    }
    if (!d.reached.length && d.cats.length) {
      txt(ctx, `On budget in ${d.onBudget} of ${d.cats.length} categories`, 72, y, { size: 44, weight: 700, color: t.text, maxW: SHARE_W - 144 });
    }
    txt(ctx, 'Swipe  →', SHARE_W - 72, 1200, { size: 36, weight: 600, color: t.muted, align: 'right' });
  },

  async budget(ctx, d, t) {
    await heading(ctx, t, 'Budget check', monthLabel(d.m), 'budget');
    if (!d.cats.length) {
      wrapText(ctx, 'No budgets set yet. Setting one is my next step!', 72, 520, SHARE_W - 144, 80, { size: 64, weight: 700, color: t.text });
      return;
    }
    txt(ctx, `${d.onBudget}/${d.cats.length}`, 72, 440, { size: 190, weight: 800, color: t.accent });
    txt(ctx, 'categories on budget', 76, 510, { size: 44, color: t.muted });
    let y = 580;
    const rows = d.cats.length > 6 ? 5 : 6;
    for (const c of d.cats.slice(0, rows)) {
      card(ctx, 72, y, SHARE_W - 144, 98, t.card, 26);
      await drawIcon(ctx, c.icon, 104, y + 25, 48, t.text);
      txt(ctx, c.name, 176, y + 48, { size: 36, weight: 600, color: t.text, maxW: 470 });
      bar(ctx, 176, y + 66, 470, 12, c.ratio, t, c.ok ? t.good : t.bad);
      const right = shareState.showAmounts ? `${money(c.s)} / ${money(c.b)}` : `${pct(c.ratio)} ${c.saving ? 'saved' : 'used'}`;
      txt(ctx, right, SHARE_W - 160, y + 62, { size: 32, weight: 600, color: t.text, align: 'right', maxW: 300 });
      await drawIcon(ctx, c.ok ? 'check' : 'alert', SHARE_W - 144, y + 31, 40, c.ok ? t.good : t.bad);
      y += 112;
    }
    if (d.cats.length > rows) txt(ctx, `+ ${d.cats.length - rows} more categories`, 72, y + 34, { size: 32, color: t.muted });
  },

  async savings(ctx, d, t) {
    await heading(ctx, t, 'Saving for my future', monthLabel(d.m), 'piggy');
    let y = 300;
    const showRate = d.rate != null && d.rate > 0;
    if (showRate) {
      txt(ctx, `${Math.round(d.rate * 100)}%`, 72, y + 150, { size: 190, weight: 800, color: t.good });
      txt(ctx, 'of my income saved', 76, y + 220, { size: 44, color: t.muted });
      if (shareState.showAmounts) txt(ctx, `${money(Math.max(0, d.saved))} kept this month`, 76, y + 280, { size: 36, weight: 600, color: t.text });
      y += 340;
    }
    if (d.goals.length) {
      txt(ctx, 'My goals', 72, y + 30, { size: 40, weight: 700, color: t.text });
      y += 70;
      for (const { g, i } of d.goals.slice(0, showRate ? 3 : 5)) {
        card(ctx, 72, y, SHARE_W - 144, 132, t.card, 26);
        await drawIcon(ctx, goalIconName(g.name), 104, y + 30, 52, i.done ? t.accent : t.text);
        txt(ctx, g.name, 180, y + 58, { size: 38, weight: 700, color: t.text, maxW: 520 });
        txt(ctx, i.done ? 'Reached!' : pct(i.ratio), SHARE_W - 108, y + 58, { size: 38, weight: 800, color: i.done ? t.accent : t.text, align: 'right' });
        bar(ctx, 180, y + 82, SHARE_W - 290, 16, i.ratio, t, i.done ? t.accent : t.good);
        if (shareState.showAmounts) txt(ctx, `${money(i.saved)} of ${money(g.target)}`, 180, y + 124, { size: 26, color: t.muted });
        y += 150;
      }
    } else if (!showRate) {
      wrapText(ctx, 'Starting my savings journey. Every peso counts!', 72, 520, SHARE_W - 144, 80, { size: 64, weight: 700, color: t.text });
    }
  },

  async rewards(ctx, d, t) {
    await heading(ctx, t, 'Good habits pay off', 'Stars I earned with Pitaka', 'trophy');
    await drawIcon(ctx, 'star', SHARE_W / 2 - 130, 270, 260, t.accent, t.accent);
    txt(ctx, `${d.r.stars} stars`, SHARE_W / 2, 640, { size: 96, weight: 800, color: t.text, align: 'center' });
    txt(ctx, `Level ${d.r.level} · ${d.r.levelName}`, SHARE_W / 2, 710, { size: 42, color: t.muted, align: 'center' });
    const badges = d.r.badges.filter(b => b.earned).slice(0, 8);
    if (badges.length) {
      txt(ctx, 'Badges unlocked', 72, 830, { size: 38, weight: 700, color: t.text });
      const cols = 4, cw = (SHARE_W - 144) / cols;
      for (let k = 0; k < badges.length; k++) {
        const x = 72 + (k % cols) * cw, y = 870 + Math.floor(k / cols) * 170;
        ctx.fillStyle = t.card; ctx.beginPath(); ctx.arc(x + cw / 2, y + 50, 50, 0, Math.PI * 2); ctx.fill();
        await drawIcon(ctx, badges[k].icon, x + cw / 2 - 28, y + 22, 56, t.accent);
        txt(ctx, badges[k].name, x + cw / 2, y + 140, { size: 26, weight: 600, color: t.text, align: 'center', maxW: cw - 12 });
      }
    }
  },

  async next(ctx, d, t) {
    await heading(ctx, t, 'What I learned', d.inProgress ? 'And what I am working on' : 'And my plan for next month', 'tip');
    let y = 320;
    for (const w of d.wins) {
      await drawIcon(ctx, 'check', 72, y - 40, 48, t.good);
      y = wrapText(ctx, w, 140, y, SHARE_W - 212, 52, { size: 40, weight: 600, color: t.text, maxLines: 1 }) + 26;
    }
    const plan = d.tips.length ? d.tips : ['Keep every category on budget', 'Save at least 20% of my income', 'Log every expense, every day'];
    for (const p of plan) {
      await drawIcon(ctx, 'right', 72, y - 40, 48, t.accent);
      y = wrapText(ctx, p, 140, y, SHARE_W - 212, 52, { size: 40, weight: 600, color: t.text, maxLines: 1 }) + 26;
    }
    const top = 770, h = 430;
    card(ctx, 72, top, SHARE_W - 144, h, t.card);
    await drawIcon(ctx, 'users', 112, top + 36, 68, t.accent);
    txt(ctx, 'Budgeting is easier together.', 112, top + 160, { size: 50, weight: 800, color: t.text, maxW: SHARE_W - 224 });
    wrapText(ctx, "Let's help each other reach financial stability. Who's joining me?", 112, top + 220, SHARE_W - 224, 46, { size: 36, color: t.muted, maxLines: 2 });
    txt(ctx, '#PitakaChallenge', 112, top + 345, { size: 40, weight: 700, color: t.accent });
    if (shareState.includeLink) txt(ctx, appLink(), 112, top + 395, { size: 30, color: t.muted, maxW: SHARE_W - 224 });
  },
};

async function buildCarousel() {
  const t = SHARE_THEMES[shareState.theme];
  const d = shareData(shareState.month);
  const types = SLIDE_TYPES.map(s => s[0]).filter(k => shareState.slides.has(k));
  const out = [];
  for (let i = 0; i < types.length; i++) {
    const c = newCanvas(), ctx = c.getContext('2d');
    paintBg(ctx, t);
    await SLIDES[types[i]](ctx, d, t);
    await footer(ctx, t, i, types.length);
    out.push(c);
  }
  return out;
}

/* ---------- Expense photo ---------- */
function expenseStatus(e) {
  const c = catById(e.categoryId);
  const g = e.goalId && state.goals.find(x => x.id === e.goalId);
  if (g) return { ok: true, text: `Added to my ${g.name} goal` };
  if (c.type === 'saving') return { ok: true, text: 'Saving for my future' };
  const m = monthOf(e.date);
  const b = budgetsFor(m).budgets[e.categoryId];
  if (!b) return { ok: true, text: 'Tracked in my budget' };
  const s = spentByCategory(m)[e.categoryId] || 0;
  if (s <= b) return { ok: true, text: shareState.showAmounts ? `Still on budget · ${money(b - s)} left` : `Still on budget · ${pct(s / b)} used` };
  return { ok: false, text: 'Over budget this month. Back on track next!' };
}

async function buildExpensePhoto() {
  const e = state.expenses.find(x => x.id === shareState.expenseId);
  if (!e) return null;
  const t = SHARE_THEMES[shareState.theme];
  const c = newCanvas(), ctx = c.getContext('2d');
  const cat = catById(e.categoryId);
  const photo = shareState.photo;
  const top = shareState.position === 'top';

  if (photo) {
    const s = Math.max(SHARE_W / photo.width, SHARE_H / photo.height);
    const w = photo.width * s, h = photo.height * s;
    ctx.drawImage(photo, (SHARE_W - w) / 2, (SHARE_H - h) / 2, w, h);
    // Soft shade behind the text areas so they stay readable on any photo.
    for (const [y0, y1, a0, a1] of [[0, 520, 0.55, 0], [SHARE_H - 620, SHARE_H, 0, 0.6]]) {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, `rgba(0,0,0,${a0})`); g.addColorStop(1, `rgba(0,0,0,${a1})`);
      ctx.fillStyle = g; ctx.fillRect(0, y0, SHARE_W, y1 - y0);
    }
  } else {
    paintBg(ctx, t);
    ctx.globalAlpha = 0.16;
    await drawIcon(ctx, categoryIconName(cat.name), SHARE_W / 2 - 260, SHARE_H / 2 - 330, 520, t.text);
    ctx.globalAlpha = 1;
  }
  const ink = photo ? '#ffffff' : t.text;
  const inkMuted = photo ? 'rgba(255,255,255,0.8)' : t.muted;

  // The user's own words, big, on the side opposite the card.
  if (shareState.caption.trim()) {
    ctx.shadowColor = photo ? 'rgba(0,0,0,0.45)' : 'transparent'; ctx.shadowBlur = 24;
    const lines = 3, lineH = 84;
    const y = top ? SHARE_H - 200 - lines * lineH + lineH : 170;
    wrapText(ctx, shareState.caption.trim(), 72, y, SHARE_W - 144, lineH, { size: 72, weight: 800, color: ink, maxLines: lines });
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  }

  // Expense card
  const ch = 320, cy = top ? 90 : SHARE_H - ch - 150;
  card(ctx, 60, cy, SHARE_W - 120, ch, photo ? 'rgba(17,24,39,0.72)' : t.card, 40);
  const cardInk = photo ? '#ffffff' : t.text, cardMuted = photo ? 'rgba(255,255,255,0.75)' : t.muted;
  ctx.fillStyle = photo ? 'rgba(255,255,255,0.14)' : t.card;
  ctx.beginPath(); ctx.arc(170, cy + 110, 70, 0, Math.PI * 2); ctx.fill();
  await drawIcon(ctx, categoryIconName(cat.name), 130, cy + 70, 80, cardInk);
  txt(ctx, e.note || cat.name, 270, cy + 100, { size: 50, weight: 800, color: cardInk, maxW: SHARE_W - 360 });
  txt(ctx, shareState.showAmounts ? `${money(e.amount)} · ${cat.name}` : `${cat.name} · ${fmtDay(e.date)}`, 270, cy + 160, { size: 36, color: cardMuted, maxW: SHARE_W - 360 });
  const st = expenseStatus(e);
  const good = photo ? '#86efac' : t.good, bad = photo ? '#fca5a5' : t.bad;
  await drawIcon(ctx, st.ok ? 'check' : 'alert', 110, cy + 216, 46, st.ok ? good : bad);
  txt(ctx, st.text, 176, cy + 252, { size: 36, weight: 700, color: st.ok ? good : bad, maxW: SHARE_W - 260 });

  // Branding
  const by = top ? SHARE_H - 70 : SHARE_H - 66;
  ctx.shadowColor = photo ? 'rgba(0,0,0,0.5)' : 'transparent'; ctx.shadowBlur = 14;
  await drawIcon(ctx, 'wallet', 72, by - 36, 42, ink);
  txt(ctx, 'Pitaka', 124, by, { size: 32, weight: 700, color: ink });
  txt(ctx, '#PitakaChallenge', SHARE_W - 72, by, { size: 30, weight: 600, color: inkMuted, align: 'right' });
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  return c;
}

/* ---------- Caption ---------- */
function buildPostText() {
  const link = shareState.includeLink ? `\nTry it: https://${appLink()}` : '';
  if (shareState.tab === 'photo') {
    const e = state.expenses.find(x => x.id === shareState.expenseId);
    if (!e) return '';
    const cat = catById(e.categoryId).name;
    const head = shareState.caption.trim() || e.note || cat;
    return `${head}\n${shareState.showAmounts ? `${money(e.amount)} · ` : ''}${cat}. ${expenseStatus(e).text}.\nTracking every peso, one expense at a time. Budgeting is easier together!${link}\n\n${SHARE_TAGS}`;
  }
  const d = shareData(shareState.month);
  const lines = [`My ${monthLabel(d.m)} money check-in${d.inProgress ? ' (so far)' : ''}:`];
  if (d.cats.length) lines.push(`- On budget in ${d.onBudget} of ${d.cats.length} categories`);
  if (d.rate != null && d.rate > 0) lines.push(`- Saved ${pct(d.rate)} of my income${shareState.showAmounts ? ` (${money(d.saved)})` : ''}`);
  for (const g of d.reached) lines.push(`- Reached my ${g.name} goal!`);
  const active = d.goals.find(x => !x.i.done);
  if (active) lines.push(`- ${pct(active.i.ratio)} of the way to my ${active.g.name} goal`);
  lines.push(`- ${d.r.stars} stars, Level ${d.r.level} ${d.r.levelName}`);
  return `${lines.join('\n')}\n\nBudgeting is easier together. Let's help each other reach financial stability. Who's joining me?${link}\n\n${SHARE_TAGS}`;
}

/* ---------- Studio UI ---------- */
function studioControls() {
  const swatches = `<div class="swatches">${Object.entries(SHARE_THEMES).map(([k, t]) => `
    <button class="swatch ${shareState.theme === k ? 'active' : ''}" data-share-action="theme" data-theme="${k}" style="background:linear-gradient(135deg, ${t.bg[0]}, ${t.bg[1]})" aria-label="${t.name} style" title="${t.name}"></button>`).join('')}</div>`;
  const toggles = `
    <label class="switch"><input type="checkbox" data-share="amounts" ${shareState.showAmounts ? 'checked' : ''}><span>Show amounts <span class="small muted">(off = percentages only)</span></span></label>
    <label class="switch"><input type="checkbox" data-share="link" ${shareState.includeLink ? 'checked' : ''}><span>Invite friends with a link to the app</span></label>`;

  if (shareState.tab === 'carousel') {
    const months = [...Array(6)].map((_, i) => shiftMonth(currentMonth(), -i));
    return `
      <label class="field">Month<select data-share="month">${months.map(m => `<option value="${m}" ${m === shareState.month ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select></label>
      <div class="field">Slides<div class="chips">${SLIDE_TYPES.map(([k, label]) => `
        <button class="chip-btn ${shareState.slides.has(k) ? 'on' : ''}" data-share-action="slide" data-slide="${k}" aria-pressed="${shareState.slides.has(k)}">${shareState.slides.has(k) ? icon('check') : ''}${label}</button>`).join('')}</div></div>
      <div class="field">Style${swatches}</div>
      ${toggles}`;
  }

  const recent = [...state.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
  return `
    <label class="field">Expense<select data-share="expense">${recent.map(e => `<option value="${e.id}" ${e.id === shareState.expenseId ? 'selected' : ''}>${esc(`${fmtDay(e.date)} · ${catById(e.categoryId).name} · ${money(e.amount)}${e.note ? ` · ${e.note}` : ''}`)}</option>`).join('')}</select></label>
    <div class="field">Photo
      <div class="form-actions" style="flex-wrap:wrap">
        <button class="btn small" data-share-action="photo">${icon('image')}${shareState.photo ? 'Change photo' : 'Choose a photo'}</button>
        ${shareState.photo ? `<button class="btn small ghost" data-share-action="no-photo">${icon('close')}Remove photo</button>` : '<span class="small muted">or share it with a plain background</span>'}
      </div>
    </div>
    <label class="field">Your words on the photo (optional)<input data-share="caption" maxlength="90" placeholder="e.g. Cooked at home instead of eating out!" value="${esc(shareState.caption)}"></label>
    <div class="field">Card position
      <div class="segmented">${[['top', 'Top'], ['bottom', 'Bottom']].map(([k, l]) => `<button data-share-action="position" data-pos="${k}" class="${shareState.position === k ? 'active' : ''}">${l}</button>`).join('')}</div>
    </div>
    <div class="field">Style${swatches}</div>
    ${toggles}`;
}

function renderStudio() {
  let el = $('#studio');
  if (!el) {
    el = document.createElement('div');
    el.id = 'studio';
    el.className = 'studio';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Share your progress');
    document.body.appendChild(el);
    document.body.classList.add('no-scroll');
  }
  const photoTabReady = state.expenses.length > 0;
  el.innerHTML = `
    <div class="studio-inner">
      <div class="studio-head">
        <button class="icon-btn" data-share-action="close" aria-label="Close">${icon('close')}</button>
        <div><b>Share &amp; inspire</b><div class="small muted">Help others start budgeting too</div></div>
      </div>
      <div class="segmented studio-tabs" role="tablist">
        <button data-share-action="tab" data-tab="carousel" class="${shareState.tab === 'carousel' ? 'active' : ''}">${icon('summary')}Progress carousel</button>
        <button data-share-action="tab" data-tab="photo" class="${shareState.tab === 'photo' ? 'active' : ''}">${icon('image')}Expense photo</button>
      </div>
      ${shareState.tab === 'photo' && !photoTabReady ? empty('Log an expense first, then come back to share it with a photo.') : `
      <div class="studio-grid">
        <div>
          <div id="studio-preview" class="studio-preview"><div class="slide-loading">Making your images…</div></div>
          ${shareState.tab === 'carousel' ? '<div class="small muted center">Swipe to see every slide</div>' : ''}
        </div>
        <div class="studio-side">
          <div class="studio-controls">${studioControls()}</div>
          <label class="field">Caption for your post
            <textarea id="studio-caption" data-share="post" rows="6"></textarea>
          </label>
          <div class="studio-actions">
            <button class="btn" data-share-action="share" id="share-go" disabled>${icon('share')}Share</button>
            <button class="btn ghost" data-share-action="save" id="share-save" disabled>${icon('download')}Save images</button>
            <button class="btn ghost" data-share-action="copy">${icon('copy')}Copy caption</button>
          </div>
          <p class="small muted">Images are made on your phone. Nothing is posted until you pick where to share it, and amounts stay hidden unless you turn them on.</p>
        </div>
      </div>`}
      <input type="file" id="share-photo-file" accept="image/*" hidden>
    </div>`;
  refreshPreview();
}

async function refreshPreview() {
  const box = $('#studio-preview');
  if (!box) return;
  const token = ++shareState.token;
  setShareReady(false);
  let canvases;
  try {
    canvases = shareState.tab === 'carousel' ? await buildCarousel() : [await buildExpensePhoto()].filter(Boolean);
  } catch (err) {
    console.error(err);
    if (token === shareState.token) box.innerHTML = '<div class="slide-loading">Could not make the images.</div>';
    return;
  }
  if (token !== shareState.token) return;
  box.innerHTML = '';
  if (!canvases.length) { box.innerHTML = '<div class="slide-loading">Pick at least one slide.</div>'; return; }
  canvases.forEach((c, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'slide';
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', `Slide ${i + 1} of ${canvases.length}`);
    wrap.appendChild(c);
    box.appendChild(wrap);
  });
  const cap = $('#studio-caption');
  if (cap && shareState.postText == null) cap.value = buildPostText();
  else if (cap) cap.value = shareState.postText;
  shareState.canvases = canvases;
  const stamp = shareState.tab === 'carousel' ? shareState.month : todayStr();
  shareState.files = await Promise.all(canvases.map((c, i) => new Promise(resolve =>
    c.toBlob(b => resolve(new File([b], `pitaka-${shareState.tab}-${stamp}-${i + 1}.jpg`, { type: 'image/jpeg' })), 'image/jpeg', 0.92))));
  if (token === shareState.token) setShareReady(true);
}

function setShareReady(ready) {
  for (const id of ['share-go', 'share-save']) { const b = $(`#${id}`); if (b) b.disabled = !ready; }
}

function openShareStudio(opts = {}) {
  closeSheet();
  shareState.tab = opts.tab || 'carousel';
  shareState.month = opts.month || (['summary', 'dashboard'].includes(ui.view) ? ui.month : currentMonth());
  if (shareState.month > currentMonth()) shareState.month = currentMonth();
  if (opts.expenseId) shareState.expenseId = opts.expenseId;
  if (!state.expenses.some(e => e.id === shareState.expenseId)) {
    shareState.expenseId = [...state.expenses].sort((a, b) => b.date.localeCompare(a.date))[0]?.id || null;
  }
  shareState.postText = null;
  renderStudio();
}

function closeShareStudio() {
  $('#studio')?.remove();
  document.body.classList.remove('no-scroll');
  shareState.photo = null;
  shareState.caption = '';
  shareState.canvases = [];
  shareState.files = [];
}

function markShared() {
  state.stats.shares = (state.stats.shares || 0) + 1;
  save();
  checkRewards();
}

function downloadFiles(files) {
  files.forEach((f, i) => setTimeout(() => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, i * 350));
}

function copyCaption(quiet) {
  const text = $('#studio-caption')?.value || '';
  if (!navigator.clipboard) { if (!quiet) toast('Select the caption and copy it.'); return; }
  navigator.clipboard.writeText(text).then(
    () => { if (!quiet) toast('Caption copied.'); },
    () => { if (!quiet) toast('Select the caption and copy it.'); });
}

function shareNow() {
  const files = shareState.files;
  if (!files.length) return toast('Still making your images…');
  const text = $('#studio-caption')?.value || '';
  copyCaption(true); // many apps drop the text when sharing images, so it's ready to paste
  if (navigator.canShare && navigator.canShare({ files })) {
    navigator.share({ files, text, title: 'My Pitaka progress' })
      .then(() => { markShared(); toast('Shared! Thanks for inspiring others. Caption is copied too.'); })
      .catch(err => { if (err.name !== 'AbortError') { toast("Couldn't open sharing, so the images were saved instead."); saveNow(); } });
  } else {
    saveNow();
  }
}

function saveNow() {
  const files = shareState.files;
  if (!files.length) return toast('Still making your images…');
  downloadFiles(files);
  copyCaption(true);
  markShared();
  toast(`Saved ${files.length} image${files.length === 1 ? '' : 's'}. The caption is copied, ready to paste in your post.`);
}

/* ---------- Events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-share-action]');
  if (!b) return;
  switch (b.dataset.shareAction) {
    case 'open':
      closePopup();
      openShareStudio({ tab: b.dataset.tab, expenseId: b.dataset.id, month: b.dataset.month });
      break;
    case 'close': closeShareStudio(); break;
    case 'tab': shareState.tab = b.dataset.tab; shareState.postText = null; renderStudio(); break;
    case 'theme': shareState.theme = b.dataset.theme; renderStudio(); break;
    case 'slide': {
      const k = b.dataset.slide;
      if (shareState.slides.has(k)) shareState.slides.delete(k); else shareState.slides.add(k);
      renderStudio();
      break;
    }
    case 'position': shareState.position = b.dataset.pos; renderStudio(); break;
    case 'photo': $('#share-photo-file')?.click(); break;
    case 'no-photo': shareState.photo = null; renderStudio(); break;
    case 'share': shareNow(); break;
    case 'save': saveNow(); break;
    case 'copy': copyCaption(); break;
  }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (!t.closest || !t.closest('#studio')) return;
  if (t.id === 'share-photo-file') {
    const file = t.files[0];
    t.value = '';
    if (!file) return;
    try {
      shareState.photo = await createImageBitmap(file);
    } catch {
      shareState.photo = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('bad image'));
        img.src = URL.createObjectURL(file);
      }).catch(() => { toast('That file is not a supported photo.'); return null; });
    }
    renderStudio();
    return;
  }
  const k = t.dataset.share;
  if (!k || k === 'caption' || k === 'post') return;
  if (k === 'month') shareState.month = t.value;
  else if (k === 'amounts') shareState.showAmounts = t.checked;
  else if (k === 'link') shareState.includeLink = t.checked;
  else if (k === 'expense') shareState.expenseId = t.value;
  shareState.postText = null;
  renderStudio();
});

let shareTyping;
document.addEventListener('input', e => {
  const k = e.target.dataset?.share;
  if (k === 'caption') {
    shareState.caption = e.target.value;
    shareState.postText = null;
    clearTimeout(shareTyping);
    shareTyping = setTimeout(refreshPreview, 350);
  } else if (k === 'post') {
    shareState.postText = e.target.value;
  }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#studio') && !$('#popup')) closeShareStudio(); });
