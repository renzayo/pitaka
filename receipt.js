'use strict';

/* =========================================================
   Receipt reading: turns the text read from a receipt photo
   into expense details (store, date, total, category guess).
   ========================================================= */

/** Keywords that hint at a category. Keys are default category names. */
const RECEIPT_CATEGORY_HINTS = {
  'Dining Out': ['jollibee', 'mcdonald', 'mcdo', 'chowking', 'mang inasal', 'greenwich', 'kfc', 'starbucks', 'coffee', 'cafe', 'café', 'restaurant', 'resto', 'grill', 'pizza', 'burger', 'bakery', 'tea', 'milk tea', 'dine in', 'take out', 'takeout', 'dine-in', 'food court', 'shakeys', 'yellow cab', 'max\'s', 'army navy', 'tim hortons', 'dunkin', 'krispy', 'bonchon', 'wendy', 'subway', 'red ribbon', 'goldilocks', 'cbtl', 'bo\'s coffee'],
  'Food & Groceries': ['supermarket', 'grocery', 'groceries', 'puregold', 'savemore', 'save more', 'waltermart', 'robinsons supermarket', 'shopwise', 'landers', 's&r', 'metro mart', 'hypermarket', 'market', 'mart', '7-eleven', '7 eleven', 'ministop', 'family mart', 'familymart', 'alfamart', 'lawson', 'uncle john'],
  'Transportation': ['petron', 'shell', 'caltex', 'seaoil', 'phoenix', 'cleanfuel', 'unioil', 'gasoline', 'diesel', 'unleaded', 'fuel', 'parking', 'toll', 'autosweep', 'easytrip', 'grab', 'angkas', 'joyride', 'lrt', 'mrt', 'beep', 'bus', 'taxi'],
  'Health': ['mercury drug', 'pharmacy', 'drugstore', 'drug store', 'southstar', 'rose pharmacy', 'generika', 'the generics', 'tgp', 'watsons pharmacy', 'clinic', 'hospital', 'medical', 'diagnostic', 'laboratory', 'dental', 'optical'],
  'Personal Care': ['watsons', 'salon', 'barber', 'spa', 'nail', 'cosmetic', 'beauty', 'wellness'],
  'Utilities': ['meralco', 'maynilad', 'manila water', 'pldt', 'globe', 'smart', 'converge', 'sky cable', 'electric', 'water district', 'internet'],
  'Entertainment': ['cinema', 'movie', 'theater', 'theatre', 'netflix', 'spotify', 'timezone', 'concert', 'ticket', 'arcade', 'bowling', 'karaoke'],
  'Education': ['bookstore', 'national book', 'fully booked', 'school', 'tuition', 'university', 'college', 'school supplies'],
  'Shopping': ['uniqlo', 'h&m', 'zara', 'sm store', 'department store', 'ace hardware', 'handyman', 'wilcon', 'ikea', 'miniso', 'daiso', 'lazada', 'shopee', 'apparel', 'clothing', 'shoes', 'mall', 'abenson', 'anson', 'electronics', 'gadget'],
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Amounts with 2 decimals, e.g. 1,234.50  1234.50  1 234,50  ₱99.00 */
const AMOUNT_RE = /(\d{1,3}(?:[,.]\d{3})+|\d+)\s?[.,]\s?(\d{2})(?!\d)/g;

function parseAmounts(line) {
  const out = [];
  for (const m of line.matchAll(AMOUNT_RE)) {
    const whole = m[1].replace(/[,.]/g, '');
    const value = parseFloat(`${whole}.${m[2]}`);
    if (Number.isFinite(value) && value > 0 && value < 10000000) out.push(value);
  }
  return out;
}

function findTotal(lines) {
  // Ordered from most to least specific. Each candidate line must not be a subtotal/tax/discount line.
  const patterns = [
    /grand\s*total/i,
    /(amount|total|balance)\s*(due|payable)/i,
    /total\s*(amount|amt|sales|purchase|bill)/i,
    /net\s*(amount|amt|total|sales)/i,
    /\btotal\b/i,
    /amount/i,
  ];
  const exclude = /sub\s*-?\s*total|total\s*(items?|qty|quantity|discount|savings)|^\W*(vat|tax|less|discount|zero|exempt)|change|tendered|points|item\s*count/i;

  for (const re of patterns) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!re.test(line) || exclude.test(line)) continue;
      let amounts = parseAmounts(line);
      if (!amounts.length && lines[i + 1]) amounts = parseAmounts(lines[i + 1]); // amount on the next line
      if (amounts.length) return { amount: amounts[amounts.length - 1], confident: true };
    }
  }
  // Fallback: the largest amount that isn't on a cash/change line.
  const all = lines.filter(l => !/change|cash|tendered|card\s*no|tin|vat\s*reg/i.test(l)).flatMap(parseAmounts);
  return all.length ? { amount: Math.max(...all), confident: false } : null;
}

function validDate(y, m, d, today) {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  const ageDays = (today - dt) / 86400000;
  if (ageDays < -1 || ageDays > 400) return null; // receipts should be recent and not in the future
  return `${dt.getFullYear()}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function findDate(text, today) {
  const t = text.toLowerCase();
  let m;
  // 2026-11-16 or 2026/11/16
  for (m of t.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const r = validDate(+m[1], +m[2], +m[3], today); if (r) return r;
  }
  // 11/16/2026, 16/11/2026, 11-16-26 (month first is tried first, as on most PH/US receipts)
  for (m of t.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/g)) {
    const r = validDate(+m[3], +m[1], +m[2], today) || validDate(+m[3], +m[2], +m[1], today); if (r) return r;
  }
  // Nov 16, 2026 / November 16 2026
  for (m of t.matchAll(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{2,4})\b/g)) {
    const mi = MONTHS.indexOf(m[1]); if (mi < 0) continue;
    const r = validDate(+m[3], mi + 1, +m[2], today); if (r) return r;
  }
  // 16 Nov 2026 / 16-Nov-26
  for (m of t.matchAll(/\b(\d{1,2})[\s-]+([a-z]{3})[a-z]*\.?[\s-,]+(\d{2,4})\b/g)) {
    const mi = MONTHS.indexOf(m[2]); if (mi < 0) continue;
    const r = validDate(+m[3], mi + 1, +m[1], today); if (r) return r;
  }
  return null;
}

function findMerchant(lines) {
  const skip = /receipt|invoice|official|tin\b|vat\s*reg|non-?vat|min\b|serial|s\/n|permit|ptu|accred|tel|phone|www\.|http|@|welcome|thank|cashier|terminal|pos\b|date|time|^\W*$/i;
  for (const line of lines.slice(0, 8)) {
    const clean = line.replace(/[^\p{L}\p{N}&'.\- ]/gu, ' ').replace(/\s+/g, ' ').trim();
    const letters = (clean.match(/\p{L}/gu) || []).length;
    if (letters < 3 || letters / clean.length < 0.6 || skip.test(clean)) continue;
    // Title-case shouty receipt headers: "SM SUPERMARKET" -> "Sm Supermarket"
    return clean.length > 40 ? clean.slice(0, 40).trim() : clean.toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase());
  }
  return '';
}

function guessCategoryName(text) {
  const t = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  let best = null, bestScore = 0;
  for (const [name, words] of Object.entries(RECEIPT_CATEGORY_HINTS)) {
    let score = 0;
    for (const w of words) {
      const re = new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
      if (re.test(t)) score += w.length; // longer (more specific) matches count more
    }
    if (score > bestScore) { best = name; bestScore = score; }
  }
  return best;
}

/**
 * Parse OCR text from a receipt.
 * @returns {{merchant: string, date: string|null, amount: number|null, amountConfident: boolean, categoryName: string|null}}
 */
function parseReceipt(text, today = new Date()) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const total = findTotal(lines);
  return {
    merchant: findMerchant(lines),
    date: findDate(text || '', today),
    amount: total ? total.amount : null,
    amountConfident: total ? total.confident : false,
    categoryName: guessCategoryName(text || ''),
  };
}

if (typeof module !== 'undefined') module.exports = { parseReceipt };
