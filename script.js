/* =====================================================================
   Reckon — money, honestly.  Phone-first, harsh-accountability ledger.
   Storage: localStorage now, structured so a cloud (Supabase) sync
   drops into the `Store` layer without touching the UI.
   ===================================================================== */

'use strict';

/* ------------------------------------------------------------------ *
 * Store — single source of truth. Swap the guts of load/save later   *
 * for Supabase; the rest of the app only talks to `db` + save().     *
 * ------------------------------------------------------------------ */
const KEY = 'reckon.v1';

const DEFAULTS = () => ({
  settings: {
    passcode: null,            // set on first run (local device lock only)
    mainCurrency: 'GBP',       // totals shown in £
    tone: 'harsh',
    rate: 12.5,                // MAD per 1 GBP (fallback / manual)
    rateLive: true,
    rateFetched: null,
    cloudOn: false,            // cloud backup enabled
    syncCode: null,            // secret vault key (local)
    lastSync: null,            // last successful cloud sync (ms)
  },
  categories: [
    { id: 'food',   name: 'Food & groceries', emoji: '🛒', limit: 250, essential: true },
    { id: 'eat',    name: 'Eating out',       emoji: '🍔', limit: 60,  essential: false },
    { id: 'trans',  name: 'Transport',        emoji: '🚌', limit: 80,  essential: true },
    { id: 'bills',  name: 'Bills & rent',     emoji: '🧾', limit: 500, essential: true },
    { id: 'subs',   name: 'Subscriptions',    emoji: '📺', limit: 40,  essential: false },
    { id: 'fun',    name: 'Shopping & fun',   emoji: '🛍️', limit: 50,  essential: false },
    { id: 'coffee', name: 'Coffee & snacks',  emoji: '☕', limit: 30,  essential: false },
    { id: 'health', name: 'Health',           emoji: '💊', limit: 40,  essential: true },
    { id: 'going',  name: 'Going out',        emoji: '🍻', limit: 60,  essential: false },
    { id: 'phone',  name: 'Phone & internet', emoji: '📱', limit: 40,  essential: true },
    { id: 'gifts',  name: 'Gifts & family',   emoji: '🎁', limit: 0,   essential: false },
    { id: 'other',  name: 'Other',            emoji: '•',  limit: 0,   essential: false },
  ],
  tx: [],         // { id, kind:'expense'|'income', amount, cur, cat, note, regret, date }
  goals: [],      // { id, name, target, cur, saved }
  loans: [],      // { id, dir:'owe'|'owed', who, amount, cur, due, settled }
  recurring: [],  // { id, name, amount, cur, cat, kind, day, active, lastPosted:'YYYY-M' }
  _rev: null,     // ISO string, bumped on every save() — drives cloud last-write-wins
});

let db = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS();
    const parsed = JSON.parse(raw);
    const base = DEFAULTS();
    return { ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } };
  } catch (e) {
    console.warn('load failed', e);
    return DEFAULTS();
  }
}
function save(skipCloud) {
  db._rev = new Date().toISOString();
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { console.warn('save failed', e); }
  if (!skipCloud && db.settings.cloudOn && db.settings.syncCode) Cloud.pushSoon();
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ------------------------------------------------------------------ *
 * Cloud — secret-code vault sync via Supabase RPC (no login needed).  *
 * The publishable key is safe to embed; the vault is unreachable      *
 * without the long random syncCode.                                   *
 * ------------------------------------------------------------------ */
const SUPABASE_URL = 'https://sjxixnltjxpygcvxmfrx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Pcuq62al1sYYAAW7HzYHSA_xoHcCYe4';

const Cloud = {
  _timer: null,
  _busy: false,

  makeCode() {
    const bytes = new Uint8Array(24);
    (self.crypto || window.crypto).getRandomValues(bytes);
    const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (const b of bytes) s += abc[b % abc.length];   // 24 chars, ~118 bits
    return 'rk-' + s.slice(0, 6) + '-' + s.slice(6, 12) + '-' + s.slice(12, 18) + '-' + s.slice(18, 24);
  },

  // strip local-only settings before it leaves the device
  payload() {
    const copy = JSON.parse(JSON.stringify(db));
    delete copy.settings.passcode;
    delete copy.settings.syncCode;
    delete copy.settings.cloudOn;
    delete copy.settings.lastSync;
    return copy;
  },

  async rpc(fn, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${fn} ${r.status}`);
    return r.json();
  },

  async push() {
    if (!db.settings.cloudOn || !db.settings.syncCode) return;
    this._busy = true;
    try {
      await this.rpc('vault_push', {
        p_code: db.settings.syncCode,
        p_data: this.payload(),
        p_updated_at: db._rev || new Date().toISOString(),
      });
      db.settings.lastSync = Date.now();
      save(true);
      renderCloudStatus();
    } catch (e) { console.warn('cloud push failed', e); renderCloudStatus('error'); }
    finally { this._busy = false; }
  },

  pushSoon() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.push(), 1500);
  },

  // pull remote; adopt it if it's newer than local. returns 'pulled'|'pushed'|'same'
  async sync() {
    if (!db.settings.syncCode) throw new Error('no code');
    const rows = await this.rpc('vault_pull', { p_code: db.settings.syncCode });
    const remote = Array.isArray(rows) ? rows[0] : rows;
    const localRev = db._rev ? Date.parse(db._rev) : 0;
    if (remote && remote.data) {
      const remoteRev = remote.updated_at ? Date.parse(remote.updated_at) : 0;
      if (remoteRev > localRev) {
        const incoming = remote.data;
        // keep local-only settings, take everything else from cloud
        const localOnly = {
          passcode: db.settings.passcode, syncCode: db.settings.syncCode,
          cloudOn: true, lastSync: Date.now(),
        };
        db = { ...DEFAULTS(), ...incoming };
        db.settings = { ...DEFAULTS().settings, ...(incoming.settings || {}), ...localOnly };
        save(true);
        return 'pulled';
      }
    }
    await this.push();
    return remote && remote.data ? 'pushed' : 'pushed';
  },

  // link this device to an existing code: always adopt the remote copy
  async link(code) {
    db.settings.syncCode = code.trim();
    const rows = await this.rpc('vault_pull', { p_code: db.settings.syncCode });
    const remote = Array.isArray(rows) ? rows[0] : rows;
    if (!remote || !remote.data) { db.settings.syncCode = null; throw new Error('No vault found for that code.'); }
    const localOnly = { passcode: db.settings.passcode, syncCode: db.settings.syncCode, cloudOn: true, lastSync: Date.now() };
    db = { ...DEFAULTS(), ...remote.data };
    db.settings = { ...DEFAULTS().settings, ...(remote.data.settings || {}), ...localOnly };
    save(true);
  },
};

/* ------------------------------------------------------------------ *
 * Currency helpers — everything reduces to GBP for the big numbers.  *
 * ------------------------------------------------------------------ */
function toGBP(amount, cur) {
  if (cur === 'GBP') return amount;
  const rate = db.settings.rate || 12.5;   // MAD per GBP
  return amount / rate;
}
function fmt(amount, cur = 'GBP') {
  const n = Math.round(amount * 100) / 100;
  const abs = Math.abs(n);
  const s = abs >= 1000 ? abs.toLocaleString(undefined, { maximumFractionDigits: 0 })
                        : abs.toLocaleString(undefined, { maximumFractionDigits: abs % 1 === 0 ? 0 : 2 });
  const sign = n < 0 ? '−' : '';
  return cur === 'MAD' ? `${sign}${s} د.م` : `${sign}£${s}`;
}
const fmtGBP = (a) => fmt(a, 'GBP');

/* live FX: free, no-key. MAD per GBP. Cached ~6h. Manual fallback. */
async function refreshRate(force) {
  if (!db.settings.rateLive) return;
  const last = db.settings.rateFetched || 0;
  if (!force && Date.now() - last < 6 * 3600 * 1000) return;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/GBP');
    const j = await r.json();
    if (j && j.rates && j.rates.MAD) {
      db.settings.rate = Math.round(j.rates.MAD * 100) / 100;
      db.settings.rateFetched = Date.now();
      save();
      renderRateChip();
      if (currentScreen === 'home') renderHome();
    }
  } catch (e) { /* offline — keep last/manual rate */ }
}

/* ------------------------------------------------------------------ *
 * Date helpers                                                        *
 * ------------------------------------------------------------------ */
const now = () => new Date();
const monthKey = (d) => `${d.getFullYear()}-${d.getMonth()}`;
const thisMonth = () => monthKey(now());
const isThisMonth = (iso) => monthKey(new Date(iso)) === thisMonth();
function daysBetween(a, b) { return Math.round((a - b) / 86400000); }
function relDate(iso) {
  const d = new Date(iso), t = now();
  const diff = daysBetween(new Date(t.toDateString()), new Date(d.toDateString()));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/* ------------------------------------------------------------------ *
 * DOM helpers                                                         *
 * ------------------------------------------------------------------ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const catById = (id) => db.categories.find(c => c.id === id) || { name: 'Other', emoji: '•', essential: false };

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ==================================================================== *
 *  LOCK SCREEN                                                          *
 * ==================================================================== */
let pinBuf = '';
let pinMode = 'enter';   // 'enter' | 'set' | 'confirm'
let pinFirst = '';

function startLock() {
  const first = !db.settings.passcode;
  pinMode = first ? 'set' : 'enter';
  pinBuf = ''; pinFirst = '';
  $('#lock-sub').textContent = first ? 'Create a passcode (4 digits).' : 'Enter your passcode.';
  $('#lock-sub').classList.remove('err');
  renderDots();
  $('#lock').classList.remove('hidden');
  $('#app').classList.add('hidden');
}
function renderDots() {
  const box = $('#pin-dots'); box.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const d = el('div', 'dot' + (i < pinBuf.length ? ' on' : ''));
    box.appendChild(d);
  }
}
function pinKey(k) {
  if (k === 'del') { pinBuf = pinBuf.slice(0, -1); renderDots(); return; }
  if (k === 'reset') {
    if (confirm('Reset everything and wipe all data? This cannot be undone.')) {
      localStorage.removeItem(KEY); db = DEFAULTS(); startLock();
    }
    return;
  }
  if (pinBuf.length >= 4) return;
  pinBuf += k; renderDots();
  if (pinBuf.length === 4) setTimeout(submitPin, 120);
}
function submitPin() {
  if (pinMode === 'set') {
    pinFirst = pinBuf; pinBuf = ''; pinMode = 'confirm';
    $('#lock-sub').textContent = 'Confirm it.'; renderDots();
  } else if (pinMode === 'confirm') {
    if (pinBuf === pinFirst) {
      db.settings.passcode = pinBuf; save(); unlock();
    } else { failPin('Didn\'t match. Start again.'); pinMode = 'set'; pinFirst = ''; }
  } else {
    if (pinBuf === db.settings.passcode) unlock();
    else failPin('Wrong passcode.');
  }
}
function failPin(msg) {
  pinBuf = '';
  const sub = $('#lock-sub'); sub.textContent = msg; sub.classList.add('err');
  $('.lock-box').classList.add('shake');
  setTimeout(() => $('.lock-box').classList.remove('shake'), 420);
  renderDots();
}
function unlock() {
  $('#lock').classList.add('hidden');
  $('#app').classList.remove('hidden');
  bootApp();
}

/* ------------------------------------------------------------------ *
 * Recurring — auto-log monthly bills/income once their day arrives.   *
 * ------------------------------------------------------------------ */
function postRecurring() {
  const t = now();
  const mk = thisMonth();
  let posted = 0;
  for (const r of db.recurring || []) {
    if (!r.active) continue;
    if (r.lastPosted === mk) continue;
    if (t.getDate() < (r.day || 1)) continue;         // day hasn't arrived yet
    const date = new Date(t.getFullYear(), t.getMonth(), Math.min(r.day || 1, 28), 9, 0, 0);
    db.tx.unshift({
      id: uid(), kind: r.kind || 'expense',
      amount: r.amount, cur: r.cur,
      cat: r.kind === 'income' ? 'income' : r.cat,
      note: r.name + ' (auto)', regret: null,
      date: date.toISOString(), auto: true,
    });
    r.lastPosted = mk; posted++;
  }
  if (posted) save();
  return posted;
}

/* ==================================================================== *
 *  NAVIGATION                                                          *
 * ==================================================================== */
let currentScreen = 'home';
function go(screen) {
  currentScreen = screen;
  $$('.screen').forEach(s => s.classList.toggle('hidden', s.dataset.screen !== screen));
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === screen));
  window.scrollTo(0, 0);
  renderScreen(screen);
}
function renderScreen(s) {
  ({ home: renderHome, spend: renderSpend, save: renderSave, loans: renderLoans, review: renderReview }[s] || (() => {}))();
}

/* ==================================================================== *
 *  HOME                                                                *
 * ==================================================================== */
function monthExpenses() { return db.tx.filter(t => t.kind === 'expense' && isThisMonth(t.date)); }
function monthIncome() { return db.tx.filter(t => t.kind === 'income' && isThisMonth(t.date)); }

function liquidGBP() {
  // running balance from all income - all expenses, converted to GBP
  let bal = 0;
  for (const t of db.tx) {
    const g = toGBP(t.amount, t.cur);
    bal += t.kind === 'income' ? g : -g;
  }
  return bal;
}
function savedGBP()  { return db.goals.reduce((s, g) => s + toGBP(g.saved, g.cur), 0); }
function oweGBP()    { return db.loans.filter(l => l.dir === 'owe'  && !l.settled).reduce((s, l) => s + toGBP(l.amount, l.cur), 0); }
function owedGBP()   { return db.loans.filter(l => l.dir === 'owed' && !l.settled).reduce((s, l) => s + toGBP(l.amount, l.cur), 0); }

function renderAlerts() {
  const box = $('#alerts'); box.innerHTML = '';
  const items = [];

  // Loans you owe: overdue, then due soon
  const owe = db.loans.filter(l => l.dir === 'owe' && !l.settled && l.due);
  for (const l of owe) {
    const d = daysBetween(new Date(new Date(l.due).toDateString()), new Date(now().toDateString()));
    if (d < 0) items.push({ cls: 'a-bad', ic: '🔴', html: `You're <b>${-d}d overdue</b> paying <b>${esc(l.who)}</b> ${fmt(l.amount, l.cur)}. Sort it.`, nav: 'loans' });
    else if (d <= 3) items.push({ cls: 'a-warn', ic: '⏰', html: `Pay <b>${esc(l.who)}</b> ${fmt(l.amount, l.cur)} ${d === 0 ? '<b>today</b>' : `in <b>${d}d</b>`}.`, nav: 'loans' });
  }

  // Money owed to you, overdue
  for (const l of db.loans.filter(l => l.dir === 'owed' && !l.settled && l.due)) {
    const d = daysBetween(new Date(new Date(l.due).toDateString()), new Date(now().toDateString()));
    if (d < 0) items.push({ cls: 'a-warn', ic: '📌', html: `<b>${esc(l.who)}</b> is <b>${-d}d late</b> paying you back ${fmt(l.amount, l.cur)}. Chase it.`, nav: 'loans' });
  }

  // Weekly review nudge
  const weekAgo = new Date(now() - 7 * 86400000);
  const pending = db.tx.filter(t => t.kind === 'expense' && t.regret == null && !catById(t.cat).essential && new Date(t.date) >= weekAgo);
  if (pending.length) items.push({ cls: 'a-warn', ic: '⚖️', html: `<b>${pending.length}</b> purchase${pending.length > 1 ? 's' : ''} from this week need${pending.length > 1 ? '' : 's'} an honest verdict.`, nav: 'review' });

  for (const it of items.slice(0, 4)) {
    const a = el('div', 'alert ' + it.cls, `<span class="ai">${it.ic}</span><span>${it.html}</span><span class="go">›</span>`);
    a.addEventListener('click', () => go(it.nav));
    box.appendChild(a);
  }
}

function renderHome() {
  renderAlerts();
  const net = liquidGBP() + savedGBP() + owedGBP() - oweGBP();
  const nv = $('#net-value');
  nv.textContent = fmtGBP(net);
  nv.classList.toggle('neg', net < 0);
  $('#net-break').innerHTML =
    `<span>Cash <b>${fmtGBP(liquidGBP())}</b></span>` +
    `<span>Saved <b>${fmtGBP(savedGBP())}</b></span>` +
    `<span>Owed you <b>${fmtGBP(owedGBP())}</b></span>` +
    `<span>You owe <b>${fmtGBP(oweGBP())}</b></span>`;

  const exp = monthExpenses();
  const spent = exp.reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
  const wasted = exp.filter(t => t.regret === 'stupid').reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
  $('#stat-spent').textContent = fmtGBP(spent);
  $('#stat-wasted').textContent = fmtGBP(wasted);

  renderVerdict(spent, wasted, exp);
  renderTrend();
  renderHomeCats(exp);
  renderRecent();
}

/* 6-month spending trend, splitting wasted (red) from the rest. */
function renderTrend() {
  const card = $('#trend-card');
  const months = [];
  const base = now();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    months.push({ key: monthKey(d), label: d.toLocaleDateString(undefined, { month: 'short' }), total: 0, waste: 0 });
  }
  const idx = {}; months.forEach((m, i) => idx[m.key] = i);
  for (const t of db.tx) {
    if (t.kind !== 'expense') continue;
    const k = monthKey(new Date(t.date));
    if (!(k in idx)) continue;
    const g = toGBP(t.amount, t.cur);
    months[idx[k]].total += g;
    if (t.regret === 'stupid') months[idx[k]].waste += g;
  }
  const max = Math.max(1, ...months.map(m => m.total));
  if (months.every(m => m.total === 0)) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const bars = months.map((m, i) => {
    const h = Math.round(m.total / max * 100);
    const wh = m.total ? Math.round(m.waste / m.total * 100) : 0;
    const cur = i === months.length - 1;
    return `<div class="tb ${cur ? 'cur' : ''}">
      <div class="col" style="height:${Math.max(3, h)}%">
        <span class="good" style="height:${100 - wh}%"></span>
        <span class="bad" style="height:${wh}%"></span>
      </div>
      <div class="val">${m.total ? fmtGBP(m.total) : ''}</div>
      <div class="lbl">${m.label}</div>
    </div>`;
  }).join('');
  card.innerHTML =
    `<div class="trend-head">
       <span class="trend-title">Last 6 months</span>
       <span class="trend-legend">
         <i><span class="sw" style="background:#3a4a6b"></span>spent</i>
         <i><span class="sw" style="background:var(--bad)"></span>wasted</i>
       </span>
     </div>
     <div class="trend-bars">${bars}</div>`;
}

function renderVerdict(spent, wasted, exp) {
  const v = $('#verdict');
  const unflagged = exp.filter(t => t.regret == null && !catById(t.cat).essential).length;
  let cls = 'v-good', msg;

  if (wasted > 0 && wasted >= spent * 0.25) {
    cls = 'v-bad';
    msg = `You've thrown <b>${fmtGBP(wasted)}</b> at stupid stuff this month — that's <b>${Math.round(wasted / spent * 100)}%</b> of everything you spent. Cut it out.`;
  } else if (wasted > 0) {
    cls = 'v-warn';
    msg = `<b>${fmtGBP(wasted)}</b> already wasted this month. Small leaks sink ships. Log the next one and think twice.`;
  } else if (overCats(exp).length) {
    cls = 'v-warn';
    const c = overCats(exp)[0];
    msg = `You've blown past your <b>${esc(c.name)}</b> limit. Ease off before the month's out.`;
  } else if (exp.length === 0) {
    cls = 'v-good';
    msg = `Clean slate this month. Keep it boring — boring is how you save.`;
  } else if (unflagged > 0) {
    cls = 'v-warn';
    msg = `${unflagged} non-essential buy${unflagged > 1 ? 's' : ''} unflagged. Head to <b>Review</b> and be honest with yourself.`;
  } else {
    cls = 'v-good';
    msg = `Nothing wasted so far. This is what discipline looks like — don't get comfortable.`;
  }
  v.className = 'verdict ' + cls;
  v.innerHTML = msg;
}

function overCats(exp) {
  const spentBy = {};
  for (const t of exp) spentBy[t.cat] = (spentBy[t.cat] || 0) + toGBP(t.amount, t.cur);
  return db.categories.filter(c => c.limit > 0 && (spentBy[c.id] || 0) > c.limit);
}

function renderHomeCats(exp) {
  const box = $('#home-cats'); box.innerHTML = '';
  const spentBy = {};
  for (const t of exp) spentBy[t.cat] = (spentBy[t.cat] || 0) + toGBP(t.amount, t.cur);
  const cats = db.categories
    .map(c => ({ c, spent: spentBy[c.id] || 0 }))
    .filter(x => x.spent > 0 || x.c.limit > 0)
    .sort((a, b) => b.spent - a.spent);
  if (!cats.length) { box.appendChild(el('div', 'empty', 'No spending yet this month.')); return; }
  for (const { c, spent } of cats) box.appendChild(catRow(c, spent, false));
}

function catRow(c, spent, tappable) {
  const has = c.limit > 0;
  const pct = has ? Math.min(100, spent / c.limit * 100) : 0;
  const over = has && spent > c.limit;
  const near = has && !over && pct >= 80;
  const row = el('div', 'cat' + (tappable ? ' tap' : ''));
  row.innerHTML =
    `<div class="cat-top">
       <div class="cat-name"><span class="cat-emoji">${c.emoji}</span>${esc(c.name)}</div>
       <div class="cat-amt"><b>${fmtGBP(spent)}</b>${has ? ' / ' + fmtGBP(c.limit) : ''}</div>
     </div>
     <div class="bar ${over ? 'over' : near ? 'near' : ''}"><span style="width:${has ? pct : 0}%"></span></div>`;
  if (tappable) row.addEventListener('click', () => openCategory(c));
  return row;
}

function renderRecent() {
  const box = $('#home-recent'); box.innerHTML = '';
  const recent = [...db.tx].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  if (!recent.length) { box.appendChild(el('div', 'empty', 'Nothing logged yet. Tap ＋ to start.')); return; }
  for (const t of recent) box.appendChild(txRow(t));
}

function txRow(t) {
  const c = catById(t.cat);
  const income = t.kind === 'income';
  const row = el('div', 'tx');
  const tag = t.regret === 'stupid' ? '<span class="tag tag-stupid">STUPID</span>'
            : t.regret === 'worth' ? '<span class="tag tag-worth">WORTH IT</span>' : '';
  row.innerHTML =
    `<div class="tx-ic">${income ? '💰' : c.emoji}</div>
     <div class="tx-mid">
       <div class="tx-title">${esc(t.note || (income ? 'Income' : c.name))} ${tag}</div>
       <div class="tx-sub">${income ? 'Income' : esc(c.name)} · ${relDate(t.date)}</div>
     </div>
     <div class="tx-right">
       <div class="tx-amt ${income ? 'in' : ''}">${income ? '+' : '−'}${fmt(t.amount, t.cur)}</div>
       ${t.cur !== 'GBP' ? `<div class="tx-cur">≈ ${fmtGBP(toGBP(t.amount, t.cur))}</div>` : ''}
     </div>`;
  row.addEventListener('click', () => openTx(t));
  return row;
}

/* ==================================================================== *
 *  SPEND                                                               *
 * ==================================================================== */
function renderSpend() {
  renderRecurList();
  const exp = monthExpenses();
  const spentBy = {};
  for (const t of exp) spentBy[t.cat] = (spentBy[t.cat] || 0) + toGBP(t.amount, t.cur);
  const box = $('#spend-cats'); box.innerHTML = '';
  for (const c of db.categories) box.appendChild(catRow(c, spentBy[c.id] || 0, true));

  const list = $('#spend-tx'); list.innerHTML = '';
  const all = [...db.tx].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!all.length) { list.appendChild(el('div', 'empty', 'No transactions yet.')); return; }
  for (const t of all.slice(0, 100)) list.appendChild(txRow(t));
}

/* ---------- Recurring list + editor ---------- */
function renderRecurList() {
  const box = $('#recur-list'); box.innerHTML = '';
  const list = db.recurring || [];
  if (!list.length) { box.appendChild(el('div', 'empty', 'No recurring items. Add rent, subs, salary — they log themselves each month.')); return; }
  for (const r of list) {
    const c = r.kind === 'income' ? { name: 'Income', emoji: '💰' } : catById(r.cat);
    const card = el('div', 'loan');
    card.innerHTML =
      `<div class="loan-top">
         <div class="loan-who">${c.emoji} ${esc(r.name)}</div>
         <div class="loan-amt" style="color:${r.kind === 'income' ? 'var(--good)' : 'var(--text)'}">${r.kind === 'income' ? '+' : ''}${fmt(r.amount, r.cur)}</div>
       </div>
       <div class="loan-meta"><span>Day ${r.day} each month</span>${r.active ? '' : '<span class="overdue">Paused</span>'}${r.cur !== 'GBP' ? `<span>≈ ${fmtGBP(toGBP(r.amount, r.cur))}</span>` : ''}</div>
       <div class="loan-actions"><button class="gbtn" data-edit>Edit</button></div>`;
    card.querySelector('[data-edit]').addEventListener('click', () => openRecur(r));
    box.appendChild(card);
  }
}
function openRecur(r) {
  const isNew = !r;
  r = r || { id: uid(), name: '', amount: '', cur: db.settings.mainCurrency, cat: 'bills', kind: 'expense', day: 1, active: true, lastPosted: null, _new: true };
  const cats = db.categories.filter(c => c.id !== 'other').map(c =>
    `<option value="${c.id}" ${r.cat === c.id ? 'selected' : ''}>${c.emoji} ${esc(c.name)}</option>`).join('');
  const body = openSheet(`
    <h2>${isNew ? 'New recurring item' : 'Edit recurring'}</h2>
    <p class="sub">Auto-logs on its day each month. Great for rent, subscriptions, salary.</p>
    <div class="seg" style="margin-bottom:14px">
      <button data-k="expense" class="${r.kind==='expense'?'on neg':''}">Expense</button>
      <button data-k="income" class="${r.kind==='income'?'on pos':''}">Income</button>
    </div>
    <div class="field"><label>Name</label><input id="rc-name" type="text" placeholder="e.g. Rent, Netflix, Salary" value="${esc(r.name)}" /></div>
    <div class="field"><label>Amount</label><input id="rc-amt" type="number" inputmode="decimal" placeholder="0" value="${r.amount || ''}" /></div>
    <div class="field"><label>Currency</label>
      <div class="seg"><button data-c="GBP" class="${r.cur==='GBP'?'on':''}">£ GBP</button><button data-c="MAD" class="${r.cur==='MAD'?'on':''}">د.م MAD</button></div>
    </div>
    <div class="field" id="rc-catwrap" ${r.kind==='income'?'style="display:none"':''}><label>Category</label><select id="rc-cat">${cats}</select></div>
    <div class="field"><label>Day of month (1–28)</label><input id="rc-day" type="number" inputmode="numeric" min="1" max="28" value="${r.day || 1}" /></div>
    <div class="field"><label>Status</label>
      <div class="seg"><button data-a="1" class="${r.active?'on pos':''}">Active</button><button data-a="0" class="${!r.active?'on':''}">Paused</button></div>
    </div>
    <button class="btn-primary" id="rc-save">${isNew ? 'Add' : 'Save'}</button>
    ${isNew ? '' : '<button class="btn-ghost del" id="rc-del">Delete</button>'}
  `);
  let kind = r.kind, cur = r.cur, active = r.active;
  body.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; body.querySelectorAll('[data-k]').forEach(x => x.className = ''); b.className = 'on ' + (kind === 'income' ? 'pos' : 'neg'); $('#rc-catwrap').style.display = kind === 'income' ? 'none' : ''; });
  body.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cur = b.dataset.c; body.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); });
  body.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { active = b.dataset.a === '1'; body.querySelectorAll('[data-a]').forEach(x => x.className = ''); b.className = 'on ' + (active ? 'pos' : ''); });
  $('#rc-save').onclick = () => {
    const name = $('#rc-name').value.trim(); const amt = parseFloat($('#rc-amt').value);
    if (!name) { toast('Name it.'); return; } if (!amt || amt <= 0) { toast('Amount?'); return; }
    r.name = name; r.amount = Math.round(amt * 100) / 100; r.cur = cur; r.kind = kind;
    r.cat = kind === 'income' ? 'income' : $('#rc-cat').value;
    r.day = Math.min(28, Math.max(1, parseInt($('#rc-day').value) || 1)); r.active = active;
    if (r._new) { delete r._new; db.recurring.push(r); }
    save(); closeSheet(); postRecurring(); renderSpend();
  };
  const del = $('#rc-del'); if (del) del.onclick = () => { if (confirm('Delete this recurring item? Past logged entries stay.')) { db.recurring = db.recurring.filter(x => x.id !== r.id); save(); closeSheet(); renderSpend(); } };
}

/* ==================================================================== *
 *  SAVE (goals)                                                        *
 * ==================================================================== */
function renderSave() {
  const box = $('#goal-list'); box.innerHTML = '';
  if (!db.goals.length) {
    box.appendChild(el('div', 'empty', 'No goals yet. What are you actually saving for? Tap + Goal.'));
    return;
  }
  for (const g of db.goals) {
    const pct = g.target > 0 ? Math.min(100, g.saved / g.target * 100) : 0;
    const done = g.target > 0 && g.saved >= g.target;
    const card = el('div', 'goal' + (done ? ' done' : ''));
    card.innerHTML =
      `<div class="goal-top">
         <div class="goal-name">${esc(g.name)}</div>
         <div class="goal-pct">${done ? '✓ Done' : Math.round(pct) + '%'}</div>
       </div>
       <div class="goal-nums"><b>${fmt(g.saved, g.cur)}</b> of ${fmt(g.target, g.cur)}${g.cur !== 'GBP' ? ` · ≈ ${fmtGBP(toGBP(g.saved, g.cur))} saved` : ''}</div>
       <div class="bar"><span style="width:${pct}%"></span></div>
       <div class="goal-actions">
         <button class="gbtn primary" data-add>＋ Add money</button>
         <button class="gbtn" data-edit>Edit</button>
       </div>`;
    card.querySelector('[data-add]').addEventListener('click', () => addToGoal(g));
    card.querySelector('[data-edit]').addEventListener('click', () => openGoal(g));
    box.appendChild(card);
  }
}

/* ==================================================================== *
 *  LOANS                                                                *
 * ==================================================================== */
function renderLoans() {
  $('#loan-summary').innerHTML =
    `<div class="box owe"><div class="l">You owe</div><div class="v">${fmtGBP(oweGBP())}</div></div>
     <div class="box owed"><div class="l">Owed to you</div><div class="v">${fmtGBP(owedGBP())}</div></div>`;
  fillLoans('#owe-list', 'owe');
  fillLoans('#owed-list', 'owed');
}
function fillLoans(sel, dir) {
  const box = $(sel); box.innerHTML = '';
  const list = db.loans.filter(l => l.dir === dir).sort((a, b) => (a.settled - b.settled) || (new Date(a.due || 0) - new Date(b.due || 0)));
  if (!list.length) { box.appendChild(el('div', 'empty', dir === 'owe' ? 'No debts. Keep it that way.' : 'You haven\'t lent anyone money.')); return; }
  for (const l of list) box.appendChild(loanCard(l));
}
function loanCard(l) {
  const card = el('div', 'loan ' + l.dir + (l.settled ? ' settled' : ''));
  let meta = '';
  if (l.settled) meta = '<span>✓ Settled</span>';
  else if (l.due) {
    const d = daysBetween(new Date(new Date(l.due).toDateString()), new Date(now().toDateString()));
    if (d < 0) meta = `<span class="overdue">Overdue by ${-d}d</span>`;
    else if (d === 0) meta = `<span class="due-soon">Due today</span>`;
    else if (d <= 7) meta = `<span class="due-soon">Due in ${d}d</span>`;
    else meta = `<span>Due ${new Date(l.due).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>`;
  } else meta = '<span>No due date</span>';

  card.innerHTML =
    `<div class="loan-top">
       <div class="loan-who">${esc(l.who)}</div>
       <div class="loan-amt">${fmt(l.amount, l.cur)}</div>
     </div>
     <div class="loan-meta">${meta}${l.cur !== 'GBP' ? `<span>≈ ${fmtGBP(toGBP(l.amount, l.cur))}</span>` : ''}</div>
     <div class="loan-actions">
       ${l.settled ? '' : `<button class="gbtn primary" data-settle>Mark ${l.dir === 'owe' ? 'paid' : 'received'}</button>`}
       <button class="gbtn" data-edit>Edit</button>
     </div>`;
  if (!l.settled) card.querySelector('[data-settle]').addEventListener('click', () => { l.settled = true; save(); toast('Nice. One less thing hanging over you.'); renderLoans(); });
  card.querySelector('[data-edit]').addEventListener('click', () => openLoan(l));
  return card;
}

/* ==================================================================== *
 *  REVIEW (weekly regret)                                               *
 * ==================================================================== */
function renderReview() {
  const weekAgo = new Date(now() - 7 * 86400000);
  const recent = db.tx.filter(t => t.kind === 'expense' && new Date(t.date) >= weekAgo)
                      .sort((a, b) => new Date(b.date) - new Date(a.date));
  const spent = recent.reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
  const wasted = recent.filter(t => t.regret === 'stupid').reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
  const unflagged = recent.filter(t => t.regret == null && !catById(t.cat).essential);

  const head = $('#review-head');
  if (!recent.length) {
    head.innerHTML = `<b>Nothing spent in the last 7 days.</b><br>Either you're disciplined or you forgot to log. Don't lie to yourself.`;
  } else {
    head.innerHTML =
      `<span class="big">${fmtGBP(wasted)}</span> wasted in the last 7 days out of ${fmtGBP(spent)} spent.
       ${unflagged.length ? `<br>${unflagged.length} non-essential buy${unflagged.length > 1 ? 's' : ''} below still need an honest verdict. Tap each one.` : '<br>All judged. Respect.'}
       <div class="review-flags">
         <span class="rf rf-stupid">${recent.filter(t => t.regret === 'stupid').length} stupid</span>
         <span class="rf rf-worth">${recent.filter(t => t.regret === 'worth').length} worth it</span>
       </div>`;
  }

  renderInsights();

  const box = $('#review-list'); box.innerHTML = '';
  // unjudged non-essentials first, then the rest
  const ordered = [...unflagged, ...recent.filter(t => !unflagged.includes(t))];
  if (!ordered.length) { box.appendChild(el('div', 'empty', 'Nothing to review.')); return; }
  for (const t of ordered) box.appendChild(reviewRow(t));
}
/* Data-driven, blunt insights on your patterns. */
function renderInsights() {
  const box = $('#insights'); box.innerHTML = '';
  const out = [];
  const exp = db.tx.filter(t => t.kind === 'expense');
  const thisM = exp.filter(t => isThisMonth(t.date));

  // 1) This month vs last month total
  const lastMkDate = new Date(now().getFullYear(), now().getMonth() - 1, 1);
  const lastMk = monthKey(lastMkDate);
  const lastM = exp.filter(t => monthKey(new Date(t.date)) === lastMk);
  const sumT = thisM.reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
  const sumL = lastM.reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
  if (sumL > 0 && thisM.length) {
    const pct = Math.round((sumT - sumL) / sumL * 100);
    if (pct > 5) out.push({ ic: '📈', html: `You're spending <span class="up">${pct}% more</span> than this time last month (${fmtGBP(sumT)} vs ${fmtGBP(sumL)}). Watch it.` });
    else if (pct < -5) out.push({ ic: '📉', html: `You're spending <span class="down">${Math.abs(pct)}% less</span> than last month. Keep that going.` });
    else out.push({ ic: '➖', html: `Spending's flat vs last month (${fmtGBP(sumT)}). Steady, but flat isn't saving.` });
  }

  // 2) Biggest leak — category with the most 'stupid' this month, else most non-essential
  const wasteBy = {}, neBy = {};
  for (const t of thisM) {
    const g = toGBP(t.amount, t.cur);
    if (t.regret === 'stupid') wasteBy[t.cat] = (wasteBy[t.cat] || 0) + g;
    if (!catById(t.cat).essential) neBy[t.cat] = (neBy[t.cat] || 0) + g;
  }
  const leak = Object.entries(wasteBy).sort((a, b) => b[1] - a[1])[0] || Object.entries(neBy).sort((a, b) => b[1] - a[1])[0];
  if (leak && leak[1] > 0) {
    const isWaste = !!wasteBy[leak[0]];
    out.push({ ic: '🩸', html: `Your biggest ${isWaste ? 'money leak' : 'non-essential'} this month is <b>${esc(catById(leak[0]).name)}</b> at <b>${fmtGBP(leak[1])}</b>.` });
  }

  // 3) Worst weekday for stupid spending (all time)
  const dow = [0, 0, 0, 0, 0, 0, 0];
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let anyWaste = false;
  for (const t of exp) if (t.regret === 'stupid') { dow[new Date(t.date).getDay()] += toGBP(t.amount, t.cur); anyWaste = true; }
  if (anyWaste) {
    let mi = 0; for (let i = 1; i < 7; i++) if (dow[i] > dow[mi]) mi = i;
    if (dow[mi] > 0) out.push({ ic: '📅', html: `<b>${names[mi]}s</b> are your weak spot — most of your wasted money goes out then.` });
  }

  // 4) Average stupid purchase
  const stupids = exp.filter(t => t.regret === 'stupid');
  if (stupids.length >= 2) {
    const avg = stupids.reduce((s, t) => s + toGBP(t.amount, t.cur), 0) / stupids.length;
    out.push({ ic: '🧮', html: `Your average regret buy is <b>${fmtGBP(avg)}</b>, and you've made <b>${stupids.length}</b> of them. It adds up.` });
  }

  if (!out.length) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  for (const o of out) box.appendChild(el('div', 'insight', `<span class="ii">${o.ic}</span><span>${o.html}</span>`));
}

function reviewRow(t) {
  const c = catById(t.cat);
  const row = el('div', 'tx');
  const needs = t.regret == null && !c.essential;
  const tag = t.regret === 'stupid' ? '<span class="tag tag-stupid">STUPID</span>'
            : t.regret === 'worth' ? '<span class="tag tag-worth">WORTH IT</span>'
            : needs ? '<span class="tag" style="background:var(--warn-soft);color:var(--warn)">JUDGE?</span>' : '';
  row.innerHTML =
    `<div class="tx-ic">${c.emoji}</div>
     <div class="tx-mid">
       <div class="tx-title">${esc(t.note || c.name)} ${tag}</div>
       <div class="tx-sub">${esc(c.name)} · ${relDate(t.date)} · ${fmt(t.amount, t.cur)}</div>
     </div>`;
  row.addEventListener('click', () => judgeSheet(t));
  return row;
}

/* ==================================================================== *
 *  SHEETS / MODALS                                                      *
 * ==================================================================== */
function openSheet(html) {
  $('#sheet-body').innerHTML = `<div class="grab"></div>` + html;
  $('#sheet').classList.remove('hidden');
  return $('#sheet-body');
}
function closeSheet() { $('#sheet').classList.add('hidden'); }

/* ---------- Add transaction (the core fast flow) ---------- */
let draft = null;
function openAdd() {
  draft = { kind: 'expense', amount: '', cur: db.settings.mainCurrency, cat: 'food', note: '', regret: null };
  renderAddSheet();
}
function renderAddSheet() {
  const cats = db.categories.map(c =>
    `<button class="chip ${draft.cat === c.id ? 'on' : ''}" data-cat="${c.id}"><span>${c.emoji}</span>${esc(c.name)}</button>`).join('');
  const body = openSheet(`
    <div class="seg" style="margin-bottom:18px">
      <button data-kind="expense" class="${draft.kind === 'expense' ? 'on neg' : ''}">Spent</button>
      <button data-kind="income" class="${draft.kind === 'income' ? 'on pos' : ''}">Got money</button>
    </div>
    <div class="amount-in">
      <span class="cur">${draft.cur === 'GBP' ? '£' : 'د.م'}</span>
      <input id="amt" type="number" inputmode="decimal" placeholder="0" value="${draft.amount}" />
    </div>
    <div class="cur-toggle">
      <button data-cur="GBP" class="${draft.cur === 'GBP' ? 'on' : ''}">£ GBP</button>
      <button data-cur="MAD" class="${draft.cur === 'MAD' ? 'on' : ''}">د.م MAD</button>
    </div>
    <div class="field" ${draft.kind === 'income' ? 'style="display:none"' : ''}>
      <label>Category</label>
      <div class="chip-row" id="cat-row">${cats}</div>
    </div>
    <div class="field">
      <label>Note ${draft.kind === 'income' ? '(where from?)' : '(what was it?)'}</label>
      <input id="note" type="text" placeholder="${draft.kind === 'income' ? 'e.g. freelance gig' : 'e.g. lunch, taxi...'}" value="${esc(draft.note)}" />
    </div>
    <button class="btn-primary" id="add-next">${draft.kind === 'income' ? 'Add income' : 'Continue'}</button>
    <button class="btn-ghost" data-close>Cancel</button>
  `);

  body.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { draft.kind = b.dataset.kind; syncDraft(body); renderAddSheet(); });
  body.querySelectorAll('[data-cur]').forEach(b => b.onclick = () => { draft.cur = b.dataset.cur; syncDraft(body); renderAddSheet(); });
  body.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { draft.cat = b.dataset.cat; body.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#add-next').onclick = () => { syncDraft(body); proceedAdd(); };
  setTimeout(() => $('#amt') && $('#amt').focus(), 150);
}
function syncDraft(body) {
  draft.amount = (body.querySelector('#amt') || {}).value || draft.amount;
  draft.note = (body.querySelector('#note') || {}).value || '';
}
function proceedAdd() {
  const amt = parseFloat(draft.amount);
  if (!amt || amt <= 0) { toast('Put in an amount first.'); return; }
  if (draft.kind === 'income') return commitTx(null);

  const cat = catById(draft.cat);
  // Pause-and-think for non-essential spends
  if (!cat.essential) return pauseAndThink(amt);
  commitTx(null);
}
function pauseAndThink(amt) {
  const gbp = toGBP(amt, draft.cur);
  openSheet(`
    <div class="pause">
      <div class="big">✋</div>
      <h2>Hold on.</h2>
      <p class="q">You're about to log <span class="amt">${fmt(amt, draft.cur)}</span> on
      <b>${esc(catById(draft.cat).name)}</b>${draft.cur !== 'GBP' ? ` (≈ ${fmtGBP(gbp)})` : ''}.<br><br>
      Do you <b>actually</b> need this — or is it another one for the pile?</p>
    </div>
    <button class="btn-primary" data-worth>I need it — it's worth it</button>
    <button class="btn-primary danger" data-stupid>It's stupid, but log it anyway</button>
    <button class="btn-ghost" data-back>← Back</button>
  `);
  const body = $('#sheet-body');
  body.querySelector('[data-worth]').onclick = () => commitTx('worth');
  body.querySelector('[data-stupid]').onclick = () => commitTx('stupid');
  body.querySelector('[data-back]').onclick = renderAddSheet;
}
function commitTx(regret) {
  const amt = parseFloat(draft.amount);
  const t = {
    id: uid(), kind: draft.kind, amount: Math.round(amt * 100) / 100,
    cur: draft.cur, cat: draft.kind === 'income' ? 'income' : draft.cat,
    note: draft.note.trim(), regret: draft.kind === 'income' ? null : regret,
    date: new Date().toISOString(),
  };
  db.tx.unshift(t); save(); closeSheet();
  if (regret === 'stupid') toast('Logged. You knew it too.');
  else if (draft.kind === 'income') toast('Money in. Now save some before it vanishes.');
  else toast('Logged.');
  renderScreen(currentScreen);
}

/* ---------- Existing transaction ---------- */
function openTx(t) {
  const income = t.kind === 'income';
  const body = openSheet(`
    <h2>${income ? 'Income' : esc(catById(t.cat).name)}</h2>
    <p class="sub">${fmt(t.amount, t.cur)} · ${new Date(t.date).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})}</p>
    <div class="field"><label>Note</label><input id="e-note" type="text" value="${esc(t.note)}" /></div>
    ${income ? '' : `
    <div class="field"><label>Verdict</label>
      <div class="seg">
        <button data-r="worth" class="${t.regret==='worth'?'on pos':''}">Worth it</button>
        <button data-r="stupid" class="${t.regret==='stupid'?'on neg':''}">Stupid</button>
        <button data-r="none" class="${t.regret==null?'on':''}">Neutral</button>
      </div>
    </div>`}
    <button class="btn-primary" id="e-save">Save</button>
    <button class="btn-ghost del" id="e-del">Delete transaction</button>
  `);
  let r = t.regret;
  body.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
    r = b.dataset.r === 'none' ? null : b.dataset.r;
    body.querySelectorAll('[data-r]').forEach(x => { x.className = ''; });
    b.className = 'on ' + (r === 'worth' ? 'pos' : r === 'stupid' ? 'neg' : '');
  });
  $('#e-save').onclick = () => { t.note = $('#e-note').value.trim(); t.regret = r; save(); closeSheet(); toast('Updated.'); renderScreen(currentScreen); };
  $('#e-del').onclick = () => { if (confirm('Delete this transaction?')) { db.tx = db.tx.filter(x => x.id !== t.id); save(); closeSheet(); renderScreen(currentScreen); } };
}

/* quick judge from review */
function judgeSheet(t) {
  if (t.kind === 'income') return openTx(t);
  const body = openSheet(`
    <h2>${esc(t.note || catById(t.cat).name)}</h2>
    <p class="sub">${fmt(t.amount, t.cur)} · ${esc(catById(t.cat).name)} · ${relDate(t.date)}</p>
    <p class="q" style="color:var(--muted);text-align:center;margin:6px 0 18px">Looking back — was this a good use of money?</p>
    <button class="btn-primary" data-worth>Worth it</button>
    <button class="btn-primary danger" data-stupid>Stupid</button>
    <button class="btn-ghost" data-close>Skip</button>
  `);
  body.querySelector('[data-worth]').onclick = () => { t.regret = 'worth'; save(); closeSheet(); renderReview(); };
  body.querySelector('[data-stupid]').onclick = () => { t.regret = 'stupid'; save(); closeSheet(); toast('Honest. Remember this next time.'); renderReview(); };
}

/* ---------- Category editor ---------- */
function openCategory(c) {
  const body = openSheet(`
    <h2>${c.emoji} ${esc(c.name)}</h2>
    <p class="sub">Set a monthly limit. The app warns you as you approach it.</p>
    <div class="field"><label>Name</label><input id="c-name" type="text" value="${esc(c.name)}" /></div>
    <div class="field"><label>Emoji</label><input id="c-emoji" type="text" maxlength="2" value="${esc(c.emoji)}" /></div>
    <div class="field"><label>Monthly limit (£, 0 = none)</label><input id="c-limit" type="number" inputmode="decimal" value="${c.limit}" /></div>
    <div class="field"><label>Type</label>
      <div class="seg">
        <button data-e="1" class="${c.essential?'on':''}">Essential</button>
        <button data-e="0" class="${!c.essential?'on neg':''}">Non-essential</button>
      </div>
    </div>
    <p class="sub" style="margin-top:-6px">Non-essential buys trigger the pause-and-think prompt.</p>
    <button class="btn-primary" id="c-save">Save</button>
    ${c.id !== 'other' && c.id !== 'income' ? '<button class="btn-ghost del" id="c-del">Delete category</button>' : ''}
  `);
  let ess = c.essential;
  body.querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
    ess = b.dataset.e === '1';
    body.querySelectorAll('[data-e]').forEach(x => x.className = '');
    b.className = 'on ' + (ess ? '' : 'neg');
  });
  $('#c-save').onclick = () => {
    c.name = $('#c-name').value.trim() || c.name;
    c.emoji = $('#c-emoji').value.trim() || '•';
    c.limit = Math.max(0, parseFloat($('#c-limit').value) || 0);
    c.essential = ess; save(); closeSheet(); renderScreen(currentScreen);
  };
  const del = $('#c-del');
  if (del) del.onclick = () => {
    if (confirm('Delete category? Its transactions move to Other.')) {
      db.tx.forEach(t => { if (t.cat === c.id) t.cat = 'other'; });
      db.categories = db.categories.filter(x => x.id !== c.id);
      save(); closeSheet(); renderScreen(currentScreen);
    }
  };
}
function openNewCategory() {
  const body = openSheet(`
    <h2>New category</h2>
    <div class="field"><label>Name</label><input id="n-name" type="text" placeholder="e.g. Coffee" /></div>
    <div class="field"><label>Emoji</label><input id="n-emoji" type="text" maxlength="2" placeholder="☕" /></div>
    <div class="field"><label>Monthly limit (£, 0 = none)</label><input id="n-limit" type="number" inputmode="decimal" placeholder="0" /></div>
    <div class="field"><label>Type</label>
      <div class="seg"><button data-e="1" class="on">Essential</button><button data-e="0">Non-essential</button></div>
    </div>
    <button class="btn-primary" id="n-save">Add category</button>
    <button class="btn-ghost" data-close>Cancel</button>
  `);
  let ess = true;
  body.querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
    ess = b.dataset.e === '1'; body.querySelectorAll('[data-e]').forEach(x => x.className = '');
    b.className = 'on ' + (ess ? '' : 'neg');
  });
  $('#n-save').onclick = () => {
    const name = $('#n-name').value.trim(); if (!name) { toast('Give it a name.'); return; }
    db.categories.splice(db.categories.length - 1, 0, {
      id: uid(), name, emoji: $('#n-emoji').value.trim() || '•',
      limit: Math.max(0, parseFloat($('#n-limit').value) || 0), essential: ess,
    });
    save(); closeSheet(); renderSpend();
  };
}

/* ---------- Goals ---------- */
function openGoal(g) {
  const isNew = !g;
  g = g || { id: uid(), name: '', target: '', cur: db.settings.mainCurrency, saved: 0, _new: true };
  const body = openSheet(`
    <h2>${isNew ? 'New savings goal' : 'Edit goal'}</h2>
    <div class="field"><label>What for?</label><input id="g-name" type="text" placeholder="e.g. Emergency fund, trip home" value="${esc(g.name)}" /></div>
    <div class="field"><label>Target amount</label><input id="g-target" type="number" inputmode="decimal" placeholder="2000" value="${g.target || ''}" /></div>
    <div class="field"><label>Currency</label>
      <div class="seg"><button data-c="GBP" class="${g.cur==='GBP'?'on':''}">£ GBP</button><button data-c="MAD" class="${g.cur==='MAD'?'on':''}">د.م MAD</button></div>
    </div>
    <button class="btn-primary" id="g-save">${isNew ? 'Create goal' : 'Save'}</button>
    ${isNew ? '' : '<button class="btn-ghost del" id="g-del">Delete goal</button>'}
  `);
  let cur = g.cur;
  body.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cur = b.dataset.c; body.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#g-save').onclick = () => {
    g.name = $('#g-name').value.trim() || 'Goal';
    g.target = Math.max(0, parseFloat($('#g-target').value) || 0);
    g.cur = cur;
    if (g._new) { delete g._new; db.goals.push(g); }
    save(); closeSheet(); renderSave();
  };
  const del = $('#g-del'); if (del) del.onclick = () => { if (confirm('Delete this goal?')) { db.goals = db.goals.filter(x => x.id !== g.id); save(); closeSheet(); renderSave(); } };
}
function addToGoal(g) {
  const body = openSheet(`
    <h2>Add to ${esc(g.name)}</h2>
    <p class="sub">${fmt(g.saved, g.cur)} saved so far${g.target ? ` of ${fmt(g.target, g.cur)}` : ''}.</p>
    <div class="amount-in"><span class="cur">${g.cur === 'GBP' ? '£' : 'د.م'}</span><input id="ga" type="number" inputmode="decimal" placeholder="0" /></div>
    <button class="btn-primary" id="ga-save">Stash it</button>
    <button class="btn-ghost" id="ga-sub">Take some out</button>
  `);
  setTimeout(() => $('#ga').focus(), 150);
  $('#ga-save').onclick = () => {
    const v = parseFloat($('#ga').value); if (!v || v <= 0) { toast('Amount?'); return; }
    g.saved = Math.round((g.saved + v) * 100) / 100; save(); closeSheet();
    toast('Saved. Future you says thanks.'); renderSave();
  };
  $('#ga-sub').onclick = () => {
    const v = parseFloat($('#ga').value); if (!v || v <= 0) { toast('Amount?'); return; }
    g.saved = Math.max(0, Math.round((g.saved - v) * 100) / 100); save(); closeSheet();
    toast('Taken out. Hope it was worth it.'); renderSave();
  };
}

/* ---------- Loans ---------- */
function openLoan(l) {
  const isNew = !l.who && l._new;
  const body = openSheet(`
    <h2>${isNew ? (l.dir === 'owe' ? 'Money you owe' : 'Money you lent') : 'Edit'}</h2>
    <div class="field"><label>${l.dir === 'owe' ? 'Who do you owe?' : 'Who owes you?'}</label><input id="l-who" type="text" placeholder="Name" value="${esc(l.who || '')}" /></div>
    <div class="field"><label>Amount</label><input id="l-amt" type="number" inputmode="decimal" placeholder="0" value="${l.amount || ''}" /></div>
    <div class="field"><label>Currency</label>
      <div class="seg"><button data-c="GBP" class="${l.cur==='GBP'?'on':''}">£ GBP</button><button data-c="MAD" class="${l.cur==='MAD'?'on':''}">د.م MAD</button></div>
    </div>
    <div class="field"><label>Due date (optional)</label><input id="l-due" type="date" value="${l.due ? l.due.slice(0,10) : ''}" /></div>
    <button class="btn-primary" id="l-save">Save</button>
    ${isNew ? '' : '<button class="btn-ghost del" id="l-del">Delete</button>'}
  `);
  let cur = l.cur || 'GBP';
  body.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cur = b.dataset.c; body.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#l-save').onclick = () => {
    const who = $('#l-who').value.trim(); const amt = parseFloat($('#l-amt').value);
    if (!who) { toast('Who?'); return; } if (!amt || amt <= 0) { toast('How much?'); return; }
    l.who = who; l.amount = Math.round(amt * 100) / 100; l.cur = cur;
    l.due = $('#l-due').value ? new Date($('#l-due').value).toISOString() : null;
    if (l._new) { delete l._new; db.loans.push(l); }
    save(); closeSheet(); renderLoans();
  };
  const del = $('#l-del'); if (del) del.onclick = () => { if (confirm('Delete this loan?')) { db.loans = db.loans.filter(x => x.id !== l.id); save(); closeSheet(); renderLoans(); } };
}
function newLoan(dir) { openLoan({ id: uid(), dir, cur: db.settings.mainCurrency, settled: false, _new: true }); }

/* ---------- Rate / settings ---------- */
function renderRateChip() {
  $('#rate-chip').innerHTML = `£1 = <b>${db.settings.rate}</b> د.م`;
}
function openRate() {
  const s = db.settings;
  const body = openSheet(`
    <h2>Exchange rate</h2>
    <p class="sub">Totals are shown in £. This converts your MAD entries.</p>
    <div class="field"><label>Rate source</label>
      <div class="seg">
        <button data-live="1" class="${s.rateLive?'on':''}">Live (auto)</button>
        <button data-live="0" class="${!s.rateLive?'on':''}">Manual</button>
      </div>
    </div>
    <div class="field"><label>£1 = ? MAD</label><input id="r-val" type="number" inputmode="decimal" value="${s.rate}" ${s.rateLive?'disabled':''} /></div>
    <p class="sub">${s.rateFetched ? 'Last live update: ' + new Date(s.rateFetched).toLocaleString() : 'No live update yet.'}</p>
    <button class="btn-primary" id="r-save">Save</button>
    <div class="settings-link"><button id="open-settings">App settings</button></div>
  `);
  let live = s.rateLive;
  body.querySelectorAll('[data-live]').forEach(b => b.onclick = () => {
    live = b.dataset.live === '1';
    body.querySelectorAll('[data-live]').forEach(x => x.classList.toggle('on', x === b));
    $('#r-val').disabled = live;
  });
  $('#r-save').onclick = async () => {
    s.rateLive = live;
    if (!live) s.rate = Math.max(0.01, parseFloat($('#r-val').value) || s.rate);
    save(); closeSheet(); renderRateChip();
    if (live) await refreshRate(true);
    renderScreen(currentScreen);
  };
  $('#open-settings').onclick = openSettings;
}
function openSettings() {
  const s = db.settings;
  const cloud = s.cloudOn
    ? `<div class="cloud-box on">
         <div class="cloud-row"><b>☁︎ Cloud backup is ON</b><span class="cloud-dot" id="cloud-dot"></span></div>
         <div class="cloud-status" id="cloud-status">${s.lastSync ? 'Last synced ' + relTime(s.lastSync) : 'Not synced yet'}</div>
         <button class="btn-ghost" id="st-code">Show my sync code</button>
         <button class="btn-ghost" id="st-syncnow">Sync now</button>
         <button class="btn-ghost del" id="st-cloudoff">Turn off cloud backup</button>
       </div>`
    : `<div class="cloud-box">
         <div class="cloud-row"><b>☁︎ Cloud backup is OFF</b></div>
         <div class="cloud-status">Your data lives only on this phone. Turn on backup to survive phone loss and sync across devices — no email needed.</div>
         <button class="btn-primary" id="st-cloudon">Turn on cloud backup</button>
         <button class="btn-ghost" id="st-link">I already have a sync code</button>
       </div>`;
  const body = openSheet(`
    <h2>Settings</h2>
    <p class="sub">Reckon · your money, honestly.</p>
    ${cloud}
    <button class="btn-ghost" id="st-pin">Change passcode</button>
    <button class="btn-ghost" id="st-export">Export my data (JSON)</button>
    <button class="btn-ghost del" id="st-wipe">Wipe everything</button>
  `);
  $('#st-pin').onclick = () => { db.settings.passcode = null; save(); closeSheet(); startLock(); };
  $('#st-export').onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'reckon-backup.json'; a.click(); toast('Backup downloaded.');
  };
  $('#st-wipe').onclick = () => { if (confirm('Wipe ALL data permanently? If cloud backup is on, your cloud copy stays under its code.')) { localStorage.removeItem(KEY); db = DEFAULTS(); closeSheet(); startLock(); } };
  const on = $('#st-cloudon'); if (on) on.onclick = cloudTurnOn;
  const link = $('#st-link'); if (link) link.onclick = cloudLinkSheet;
  const code = $('#st-code'); if (code) code.onclick = () => showCode();
  const syncnow = $('#st-syncnow'); if (syncnow) syncnow.onclick = async () => { toast('Syncing…'); try { const r = await Cloud.sync(); toast(r === 'pulled' ? 'Pulled newer data from cloud.' : 'Synced.'); renderScreen(currentScreen); openSettings(); } catch (e) { toast('Sync failed. Check connection.'); } };
  const off = $('#st-cloudoff'); if (off) off.onclick = () => { if (confirm('Turn off cloud backup on this device? Your cloud copy stays under its code; this device just stops syncing.')) { db.settings.cloudOn = false; save(true); closeSheet(); toast('Cloud backup off.'); } };
}

function relTime(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function renderCloudStatus(state) {
  const st = $('#cloud-status'); if (st) st.textContent = state === 'error' ? 'Last sync failed — will retry.' : (db.settings.lastSync ? 'Last synced ' + relTime(db.settings.lastSync) : 'Not synced yet');
}

async function cloudTurnOn() {
  const code = Cloud.makeCode();
  db.settings.syncCode = code; db.settings.cloudOn = true;
  save(true);
  try { await Cloud.push(); } catch (e) {}
  showCode(true);
}
function showCode(firstTime) {
  const code = db.settings.syncCode;
  openSheet(`
    <h2>${firstTime ? 'Cloud backup is on 🎉' : 'Your sync code'}</h2>
    <p class="sub">This code <b>is</b> the key to your data. To open your money on another phone, install Reckon there and enter this exact code. Anyone with it can see your data — keep it private, and don't lose it (there's no email reset).</p>
    <div class="code-box" id="code-box">${esc(code)}</div>
    <button class="btn-primary" id="cp-copy">Copy code</button>
    <button class="btn-ghost" data-close>Done</button>
  `);
  $('#cp-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(code); toast('Copied. Store it somewhere safe.'); }
    catch (e) { toast('Select the code and copy it manually.'); }
  };
}
function cloudLinkSheet() {
  const body = openSheet(`
    <h2>Link this device</h2>
    <p class="sub">Enter the sync code from your other phone to pull your data here. This replaces whatever's on this device.</p>
    <div class="field"><label>Sync code</label><input id="lk-code" type="text" placeholder="rk-xxxxxx-xxxxxx-…" autocapitalize="off" autocomplete="off" /></div>
    <button class="btn-primary" id="lk-go">Pull my data</button>
    <button class="btn-ghost" data-close>Cancel</button>
  `);
  $('#lk-go').onclick = async () => {
    const c = $('#lk-code').value.trim();
    if (c.length < 16) { toast('That code looks too short.'); return; }
    if (db.tx.length && !confirm('This will replace the data currently on this device with the cloud copy. Continue?')) return;
    toast('Linking…');
    try { await Cloud.link(c); closeSheet(); toast('Linked. Your data is here.'); bootApp(); }
    catch (e) { toast(e.message || 'Could not link. Check the code.'); }
  };
  setTimeout(() => $('#lk-code') && $('#lk-code').focus(), 150);
}

/* ==================================================================== *
 *  WIRING                                                               *
 * ==================================================================== */
function bindOnce() {
  // lock keypad
  $$('.key').forEach(k => k.onclick = () => pinKey(k.dataset.k));
  // nav
  $$('.nav-btn').forEach(b => b.onclick = () => go(b.dataset.nav));
  // fab
  $('#fab').onclick = openAdd;
  // rate chip
  $('#rate-chip').onclick = openRate;
  // sheet close
  $('#sheet').addEventListener('click', e => { if (e.target.matches('[data-close], .sheet-backdrop')) closeSheet(); });
  // add buttons per screen
  document.addEventListener('click', e => {
    const id = e.target.id;
    if (id === 'add-cat') openNewCategory();
    else if (id === 'add-goal') openGoal(null);
    else if (id === 'add-owe') newLoan('owe');
    else if (id === 'add-owed') newLoan('owed');
    else if (id === 'add-recur') openRecur(null);
  });
}

async function bootApp() {
  // Cloud first: adopt a newer remote copy before we render or post recurring.
  if (db.settings.cloudOn && db.settings.syncCode) {
    try { await Cloud.sync(); } catch (e) { console.warn('boot sync failed', e); }
  }
  postRecurring();

  const h = now().getHours();
  const hi = h < 5 ? 'Still up?' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
  $('#greeting').textContent = hi;
  const wasted = monthExpenses().filter(t => t.regret === 'stupid').reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
  $('#topbar-sub').textContent = wasted > 0 ? `${fmtGBP(wasted)} wasted this month` : 'the honest ledger';
  renderRateChip();
  go('home');
  refreshRate(false);
}

/* start */
bindOnce();
startLock();

/* PWA service worker */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
