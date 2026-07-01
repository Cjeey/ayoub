/* =====================================================================
   Reckon — money, honestly.  Phone-first, harsh-accountability ledger.
   Storage: localStorage now, structured so a cloud (Supabase) sync
   drops into the `Store` layer without touching the UI.
   ===================================================================== */

'use strict';

/* ------------------------------------------------------------------ *
 * Store — single source of truth. Data lives in Supabase (per-user,   *
 * row-level-secured) with a local cache so the app works offline.     *
 * The rest of the app only talks to `db` + save().                    *
 * ------------------------------------------------------------------ */
const SUPABASE_URL = 'https://sjxixnltjxpygcvxmfrx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Pcuq62al1sYYAAW7HzYHSA_xoHcCYe4';
const SESSION_KEY = 'reckon.session';
const dataKey = (id) => 'reckon.data.' + id;

const DEFAULTS = () => ({
  settings: {
    mainCurrency: 'GBP',       // totals shown in £
    tone: 'harsh',
    theme: 'dark',             // 'dark' | 'light'
    rate: 12.5,                // MAD per 1 GBP (fallback / manual)
    rateLive: true,
    rateFetched: null,
    aiKey: null,               // Google AI Studio key (LOCAL ONLY, never synced)
    aiModel: 'gemini-2.5-flash',
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
  coach: { messages: [] },   // chat history with the AI coach
  checkins: {},   // { lastMorning, lastEvening, lastWeekly, intention:{day,mode} }
  _rev: null,     // ISO string, bumped on every save() — drives cloud last-write-wins
});

let session = loadSession();
let lastUserId = session && session.user ? session.user.id : null;   // survives clearSession
let db = DEFAULTS();

function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; } }
function saveSession(s) { session = s; lastUserId = s.user.id; try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {} }
function clearSession() { session = null; try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }

// Load this user's cached document; migrate legacy single-key data on first login.
function loadLocalDB() {
  const base = DEFAULTS();
  if (!session) return base;
  try {
    const raw = localStorage.getItem(dataKey(session.user.id));
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } };
    }
    const legacy = localStorage.getItem('reckon.v1');   // pre-auth local data
    if (legacy) {
      // consume it once so it can't seed a second account on this device
      try { localStorage.removeItem('reckon.v1'); } catch (e) {}
      const p = JSON.parse(legacy);
      return { ...base, ...p, settings: { ...base.settings, ...(p.settings || {}) } };
    }
  } catch (e) { console.warn('loadLocalDB failed', e); }
  return base;
}

function save(skipCloud) {
  db._rev = new Date().toISOString();
  // Local cache keyed on the last known user — persists even if the session
  // token expired in the background, so edits are never silently dropped.
  if (lastUserId) { try { localStorage.setItem(dataKey(lastUserId), JSON.stringify(db)); } catch (e) {} }
  if (!skipCloud && session) Cloud.pushSoon();
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ------------------------------------------------------------------ *
 * Auth — Supabase email/password (GoTrue). Session cached locally so  *
 * the app opens offline; tokens auto-refresh before expiry.           *
 * ------------------------------------------------------------------ */
const Auth = {
  async signup(email, password) {
    // pre-confirmed account is created by the `signup` edge function
    const r = await fetch(`${SUPABASE_URL}/functions/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ email, password }),
    });
    if (r.status === 409) throw new Error('exists');
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error === 'weak_password' ? 'weak' : j.error === 'invalid_email' ? 'email' : 'signup');
    }
    return this.login(email, password);
  },
  async login(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.error || 'login');
    saveSession({
      access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: Date.now() + (j.expires_in || 3600) * 1000,
      user: { id: j.user.id, email: j.user.email },
    });
  },
  async refresh() {
    if (!session) throw new Error('no-session');
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      // token genuinely rejected — surface the login screen instead of silently
      // running session-less. Local edits are safe (cached under lastUserId).
      clearSession();
      try { showAuth(); } catch (e) {}
      throw new Error('refresh');
    }
    saveSession({
      access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: Date.now() + (j.expires_in || 3600) * 1000,
      user: { id: j.user.id, email: j.user.email },
    });
  },
  async token() {
    if (!session) throw new Error('no-session');
    if (Date.now() > session.expires_at - 60000) await this.refresh();
    return session.access_token;
  },
  logout() { clearSession(); },
};

/* ------------------------------------------------------------------ *
 * Cloud — sync the document to the user's RLS-protected Supabase row. *
 * ------------------------------------------------------------------ */
const Cloud = {
  _timer: null,
  _inflight: false,
  _pending: false,
  headers(token) { return { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }; },
  payload() { const c = JSON.parse(JSON.stringify(db)); delete c.settings.aiKey; return c; },   // AI key stays local

  async pull() {
    const token = await Auth.token();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_data?user_id=eq.${session.user.id}&select=data`, { headers: this.headers(token) });
    if (!r.ok) throw new Error('pull ' + r.status);
    const rows = await r.json();
    return (rows[0] && rows[0].data) || null;
  },
  // Only one push in flight; a save during a push queues one more, so the very
  // latest db always wins and a slow/stale request can't clobber newer data.
  async push() {
    if (!session) return;
    if (this._inflight) { this._pending = true; return; }
    this._inflight = true;
    try {
      do {
        this._pending = false;
        const token = await Auth.token();
        const row = { user_id: session.user.id, data: this.payload() };   // re-read latest each loop
        const r = await fetch(`${SUPABASE_URL}/rest/v1/user_data?on_conflict=user_id`, {
          method: 'POST',
          headers: { ...this.headers(token), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(row),
        });
        if (!r.ok) throw new Error('push ' + r.status);
      } while (this._pending);
      syncState('ok');
    } catch (e) { console.warn('cloud push failed', e); syncState('error'); }
    finally { this._inflight = false; }
  },
  pushSoon() { clearTimeout(this._timer); this._timer = setTimeout(() => this.push(), 1200); },

  // pull remote; adopt if its client-rev is newer than local, else push local up
  async sync() {
    const remote = await this.pull();
    const localRev = db._rev ? Date.parse(db._rev) : 0;
    if (remote && Object.keys(remote).length) {
      const remoteRev = remote._rev ? Date.parse(remote._rev) : 0;
      if (remoteRev > localRev) {
        const keepAi = db.settings.aiKey;
        db = { ...DEFAULTS(), ...remote };
        db.settings = { ...DEFAULTS().settings, ...(remote.settings || {}), aiKey: keepAi };
        save(true);
        return 'pulled';
      }
    }
    await this.push();
    return 'pushed';
  },
};

// sync status indicator (topbar dot); defined for early calls, real render later
function syncState(state) { try { const d = document.getElementById('sync-dot'); if (d) d.className = 'sync-dot ' + (state || ''); } catch (e) {} }

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
  // Wrap the dirham amount in an LTR isolate (U+2066…U+2069) so its Arabic
  // glyph can't reorder surrounding Latin text on the same line (bidi bug).
  return cur === 'MAD' ? `⁦${sign}${s} د.م⁩` : `${sign}£${s}`;
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
 *  AUTH SCREEN — email / password                                      *
 * ==================================================================== */
let authMode = 'login';   // 'login' | 'signup'
let authBusy = false;

function showAuth() {
  $('#auth').classList.remove('hidden');
  $('#app').classList.add('hidden');
  renderAuth();
}
function showApp() {
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
}
function renderAuth() {
  const signup = authMode === 'signup';
  $('#auth-title').textContent = signup ? 'Create your account' : 'Welcome back';
  $('#auth-sub').textContent = signup ? 'Start tracking in 30 seconds.' : 'Log in to your money.';
  $('#auth-submit').textContent = signup ? 'Create account' : 'Log in';
  $('#auth-switch').innerHTML = signup
    ? 'Already have an account? <b>Log in</b>'
    : 'New here? <b>Create an account</b>';
  $('#auth-err').textContent = '';
}
async function submitAuth() {
  if (authBusy) return;
  const email = $('#auth-email').value.trim();
  const pw = $('#auth-pw').value;
  const err = $('#auth-err');
  err.textContent = '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Enter a valid email.'; return; }
  if (pw.length < 8) { err.textContent = 'Password needs at least 8 characters.'; return; }

  authBusy = true;
  const btn = $('#auth-submit'); btn.textContent = '…'; btn.disabled = true;
  try {
    if (authMode === 'signup') await Auth.signup(email, pw);
    else await Auth.login(email, pw);
    db = loadLocalDB();
    applyTheme();
    try { await Cloud.sync(); } catch (e) { console.warn('initial sync failed', e); }
    showApp();
    bootApp();
  } catch (e) {
    const m = e.message;
    err.textContent =
      m === 'exists' ? 'That email already has an account — log in instead.'
      : m === 'weak' ? 'Password needs at least 8 characters.'
      : m === 'email' ? 'That email looks invalid.'
      : /invalid.*credent|invalid login|bad/i.test(m) ? 'Wrong email or password.'
      : authMode === 'signup' ? 'Could not sign up. Check your connection.'
      : 'Could not log in. Check your details and connection.';
    if (m === 'exists') { authMode = 'login'; renderAuth(); $('#auth-err').textContent = 'Account exists — just log in.'; }
  } finally {
    authBusy = false; btn.disabled = false;
    btn.textContent = authMode === 'signup' ? 'Create account' : 'Log in';   // mode-correct
  }
}
function logout() {
  Auth.logout();
  db = DEFAULTS();
  closeSheet();
  showAuth();
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
  $('#fab').classList.toggle('hidden', screen === 'coach');   // FAB would cover the chat bar
  window.scrollTo(0, 0);
  renderScreen(screen);
}
function renderScreen(s) {
  ({ home: renderHome, spend: renderSpend, money: renderMoney, review: renderReview, coach: renderCoach }[s] || (() => {}))();
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

function daysLeftInMonthHome() {
  const t = now();
  return Math.max(1, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate() - t.getDate() + 1);
}

function renderHome() {
  renderHomeBanner();

  // HERO — safe to spend (cash that's truly yours, after debts)
  const cash = liquidGBP();
  const safe = cash - oweGBP();
  const perDay = safe > 0 ? safe / daysLeftInMonthHome() : 0;
  const hv = $('#hero-value');
  animateNumber(hv, safe, (v) => fmtGBP(v));
  hv.classList.toggle('neg', safe < 0);
  $('#hero-sub').innerHTML = safe >= 0
    ? `yours to spend · <b>${fmtGBP(perDay)}</b>/day for the next <b>${daysLeftInMonthHome()}</b> days`
    : `you owe <b>${fmtGBP(-safe)}</b> more than you have. Careful.`;

  // MONTH STRIP — spent vs budget, wasted inline
  const exp = monthExpenses();
  const spent = exp.reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
  const wasted = exp.filter(t => t.regret === 'stupid').reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
  const budget = db.categories.reduce((s, c) => s + (c.limit || 0), 0);
  const pct = budget > 0 ? Math.min(100, spent / budget * 100) : 0;
  const over = budget > 0 && spent > budget;
  $('#month-strip').innerHTML = `
    <div class="ms-top">
      <span>Spent this month</span>
      <span class="ms-amt"><b>${fmtGBP(spent)}</b>${budget ? ' / ' + fmtGBP(budget) : ''}</span>
    </div>
    <div class="bar ${over ? 'over' : pct >= 80 ? 'near' : ''}"><span style="width:${budget ? pct : 0}%"></span></div>
    <div class="ms-sub">${wasted > 0
      ? `<span class="ms-waste">${fmtGBP(wasted)} of it wasted</span> · net worth ${fmtGBP(cash + savedGBP() + owedGBP() - oweGBP())}`
      : `Nothing wasted yet · net worth ${fmtGBP(cash + savedGBP() + owedGBP() - oweGBP())}`}</div>`;

  renderHomeCats(exp);
  renderRecent();
}

// One banner, most important first: check-in → overdue debt → overspend → review nudge
function renderHomeBanner() {
  const box = $('#home-banner'); box.innerHTML = '';
  const p = pendingCheckin();
  if (p) {
    const copy = {
      morning: ['☀️', '<b>Morning check-in.</b> Set the tone before the day spends you.', () => openCheckin('morning')],
      evening: ['🌙', '<b>Evening check-in.</b> Did you keep your word today?', () => openCheckin('evening')],
      weekly:  ['🧾', '<b>Sunday reckoning.</b> Time to face your week.', () => openCheckin('weekly')],
    }[p];
    const c = el('div', 'banner accent', `<span class="bi">${copy[0]}</span><span>${copy[1]}</span><span class="go">›</span>`);
    c.addEventListener('click', copy[2]); box.appendChild(c); return;
  }
  // else: the single most urgent alert
  const a = topAlert();
  if (a) {
    const c = el('div', 'banner ' + a.cls, `<span class="bi">${a.ic}</span><span>${a.html}</span><span class="go">›</span>`);
    c.addEventListener('click', () => go(a.nav)); box.appendChild(c);
  }
}
function topAlert() {
  const items = [];
  for (const l of db.loans.filter(l => l.dir === 'owe' && !l.settled && l.due)) {
    const d = daysBetween(new Date(new Date(l.due).toDateString()), new Date(now().toDateString()));
    if (d < 0) items.push({ pri: 0, cls: 'bad', ic: '🔴', html: `You're <b>${-d}d overdue</b> paying <b>${esc(l.who)}</b> ${fmt(l.amount, l.cur)}.`, nav: 'money' });
    else if (d <= 3) items.push({ pri: 2, cls: 'warn', ic: '⏰', html: `Pay <b>${esc(l.who)}</b> ${fmt(l.amount, l.cur)} ${d === 0 ? '<b>today</b>' : `in <b>${d}d</b>`}.`, nav: 'money' });
  }
  const exp = monthExpenses();
  const wasted = exp.filter(t => t.regret === 'stupid').reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
  const spent = exp.reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
  if (wasted > 0 && wasted >= spent * 0.25) items.push({ pri: 1, cls: 'bad', ic: '🩸', html: `<b>${fmtGBP(wasted)}</b> wasted this month — ${Math.round(wasted / spent * 100)}% of everything you spent. Cut it.`, nav: 'review' });
  const weekAgo = new Date(now() - 7 * 86400000);
  const pending = db.tx.filter(t => t.kind === 'expense' && t.regret == null && !catById(t.cat).essential && new Date(t.date) >= weekAgo);
  if (pending.length) items.push({ pri: 3, cls: 'warn', ic: '⚖️', html: `<b>${pending.length}</b> purchase${pending.length > 1 ? 's' : ''} need${pending.length > 1 ? '' : 's'} an honest verdict.`, nav: 'review' });
  items.sort((a, b) => a.pri - b.pri);
  return items[0] || null;
}

// count-up animation for the hero figure
function animateNumber(node, target, fmtFn) {
  const start = parseFloat(node.dataset.val || '0') || 0;
  if (start === target) { node.textContent = fmtFn(target); return; }
  const t0 = performance.now(), dur = 500;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = fmtFn(start + (target - start) * e);
    if (k < 1) requestAnimationFrame(step); else node.dataset.val = target;
  };
  node.dataset.val = target;
  requestAnimationFrame(step);
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
         <i><span class="sw" style="background:var(--chart-spent)"></span>spent</i>
         <i><span class="sw" style="background:var(--waste)"></span>wasted</i>
       </span>
     </div>
     <div class="trend-bars">${bars}</div>`;
}

function renderHomeCats(exp) {
  const box = $('#home-cats'); box.innerHTML = '';
  const spentBy = {};
  for (const t of exp) spentBy[t.cat] = (spentBy[t.cat] || 0) + toGBP(t.amount, t.cur);
  // top 3 by how close to (or over) the limit, else by spend
  const cats = db.categories
    .map(c => ({ c, spent: spentBy[c.id] || 0 }))
    .filter(x => x.spent > 0)
    .sort((a, b) => {
      const ra = a.c.limit ? a.spent / a.c.limit : 0, rb = b.c.limit ? b.spent / b.c.limit : 0;
      return (rb - ra) || (b.spent - a.spent);
    })
    .slice(0, 3);
  if (!cats.length) {
    box.appendChild(emptyState('🍃', 'Nothing spent yet this month', 'Tap ＋ to log your first expense.'));
    return;
  }
  for (const { c, spent } of cats) box.appendChild(catRow(c, spent, true));
  box.appendChild(seeAll('See all categories', () => go('spend')));
}
function emptyState(icon, title, sub, cta, onCta) {
  const e = el('div', 'empty-state');
  e.innerHTML = `<div class="es-ic">${icon}</div><div class="es-title">${esc(title)}</div>${sub ? `<div class="es-sub">${esc(sub)}</div>` : ''}`;
  if (cta) { const b = el('button', 'mini-btn', esc(cta)); b.onclick = onCta; e.appendChild(b); }
  return e;
}
function seeAll(label, fn) {
  const d = el('div', 'see-all');
  const b = el('button', null, esc(label) + ' ›');
  b.onclick = fn; d.appendChild(b); return d;
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
  const recent = [...db.tx].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);
  if (!recent.length) { box.appendChild(emptyState('📝', 'Nothing logged yet', 'Your recent activity shows up here.')); return; }
  for (const t of recent) box.appendChild(txRow(t));
  if (db.tx.length > 4) box.appendChild(seeAll('See all transactions', () => go('spend')));
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
// Money tab = Goals + Loans combined
function renderMoney() {
  renderSave();
  renderLoans();
}

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
  renderTrend();
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
    <div class="quick-wrap">
      <input id="quick" type="text" placeholder="⚡ Type it: &quot;45 dh taxi&quot; or &quot;coffee 3.50&quot;" autocomplete="off" value="" />
      <div class="quick-hint">Hit enter and I'll fill everything in below${AI.ready() ? ' (AI-assisted)' : ''}</div>
    </div>
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

  const quick = body.querySelector('#quick');
  quick.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const v = quick.value.trim();
    if (!v) return;
    quick.disabled = true;
    applyQuick(v, quick).finally(() => { const q = $('#quick'); if (q) q.disabled = false; });
  });
  body.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { draft.kind = b.dataset.kind; syncDraft(body); renderAddSheet(); });
  body.querySelectorAll('[data-cur]').forEach(b => b.onclick = () => { draft.cur = b.dataset.cur; syncDraft(body); renderAddSheet(); });
  body.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { draft.cat = b.dataset.cat; body.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#add-next').onclick = () => { syncDraft(body); proceedAdd(); };
  setTimeout(() => { const q = $('#quick'); if (q && !draft.amount) q.focus(); else if ($('#amt')) $('#amt').focus(); }, 150);
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
  const email = session ? session.user.email : '—';
  const body = openSheet(`
    <h2>Settings</h2>
    <div class="set-card">
      <div class="set-row"><span>Signed in as</span><b>${esc(email)}</b></div>
      <div class="set-sub">Your money syncs securely to your account — log in on any device to see it.</div>
      <button class="btn-ghost del" id="st-logout">Log out</button>
    </div>
    <div class="set-card">
      <div class="set-row"><span>Appearance</span></div>
      <div class="seg" style="margin-top:10px">
        <button data-theme="dark" class="${s.theme !== 'light' ? 'on' : ''}">🌙 Dark</button>
        <button data-theme="light" class="${s.theme === 'light' ? 'on' : ''}">☀️ Light</button>
      </div>
    </div>
    <div class="set-card">
      <div class="set-row"><span>✦ AI coach</span><b>${s.aiKey ? 'Connected' : 'Off'}</b></div>
      <div class="set-sub">${s.aiKey ? 'Runs on your Google AI key, stored on this device only.' : 'Connect a Google AI key in the Coach tab to chat with your money.'}</div>
      ${s.aiKey ? '<button class="btn-ghost" id="st-aikey">Change API key</button><button class="btn-ghost del" id="st-aioff">Disconnect AI</button>' : ''}
    </div>
    <button class="btn-ghost" id="st-export">Export my data (JSON)</button>
    <button class="btn-ghost" id="st-import">Import data</button>
    <button class="btn-ghost del" id="st-wipe">Wipe all my data</button>
  `);
  body.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => {
    db.settings.theme = b.dataset.theme; save(); applyTheme();
    body.querySelectorAll('[data-theme]').forEach(x => x.classList.toggle('on', x === b));
  });
  $('#st-logout').onclick = () => { if (confirm('Log out on this device? Your data stays safe in your account.')) logout(); };
  $('#st-import').onclick = openImport;
  const aik = $('#st-aikey'); if (aik) aik.onclick = () => {
    const k = (prompt('Paste your new Google AI Studio key:') || '').trim();
    if (!k) return;
    if (k.length < 20) { toast('That doesn\'t look like a key.'); return; }
    db.settings.aiKey = k; save(true); toast('AI key updated.');
  };
  const aio = $('#st-aioff'); if (aio) aio.onclick = () => { db.settings.aiKey = null; save(true); closeSheet(); toast('AI disconnected.'); };
  $('#st-export').onclick = () => {
    const copy = JSON.parse(JSON.stringify(db));
    delete copy.settings.aiKey;   // never share the API key
    const blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'reckon-backup.json'; a.click(); toast('Backup downloaded (AI key excluded).');
  };
  $('#st-wipe').onclick = () => {
    if (!confirm('Wipe ALL your data — transactions, goals, loans — from this account everywhere? This cannot be undone.')) return;
    const keepAi = db.settings.aiKey, keepTheme = db.settings.theme;
    db = DEFAULTS(); db.settings.aiKey = keepAi; db.settings.theme = keepTheme;
    save(); closeSheet(); go('home'); toast('Wiped clean.');
  };
}

function openImport() {
  const body = openSheet(`
    <h2>Import data</h2>
    <p class="sub">Paste a Reckon backup (JSON) or a starter file below. This merges in categories, transactions, goals, loans and recurring items. Your login and AI key are untouched.</p>
    <div class="field"><label>Backup JSON</label><textarea id="imp-txt" rows="7" placeholder='{ "goals": [...], "loans": [...] }' style="width:100%;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;color:var(--text);font-family:ui-monospace,monospace;font-size:13px;resize:vertical"></textarea></div>
    <div class="field"><label>Or upload a file</label><input id="imp-file" type="file" accept="application/json,.json" /></div>
    <div class="seg" style="margin-bottom:14px">
      <button data-mode="merge" class="on">Merge (add to what's here)</button>
      <button data-mode="replace">Replace everything</button>
    </div>
    <button class="btn-primary" id="imp-go">Import</button>
    <button class="btn-ghost" data-close>Cancel</button>
  `);
  let mode = 'merge';
  body.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; body.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#imp-file').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = () => { $('#imp-txt').value = rd.result; }; rd.readAsText(f);
  };
  $('#imp-go').onclick = () => {
    let data; try { data = JSON.parse($('#imp-txt').value.trim()); }
    catch (e) { toast('That isn\'t valid JSON.'); return; }
    if (typeof data !== 'object' || !data) { toast('Nothing to import.'); return; }
    importData(data, mode);
    closeSheet(); toast('Imported.'); bootApp();
  };
}
function importData(data, mode) {
  const arrays = ['tx', 'goals', 'loans', 'recurring', 'categories'];
  if (mode === 'replace') {
    const keepAi = db.settings.aiKey, keepTheme = db.settings.theme;
    db = { ...DEFAULTS(), ...data };
    db.settings = { ...DEFAULTS().settings, ...(data.settings || {}), aiKey: keepAi, theme: keepTheme };
  } else {
    // merge: append arrays (skip exact id dupes), take scalar settings we care about
    for (const k of arrays) {
      if (!Array.isArray(data[k])) continue;
      const have = new Set((db[k] || []).map(x => x.id));
      for (const item of data[k]) {
        if (k === 'categories' && db.categories.some(c => c.id === item.id)) continue;
        if (item.id && have.has(item.id)) continue;
        (db[k] = db[k] || []).push(item);
      }
    }
    if (data.settings && typeof data.settings.rate === 'number') db.settings.rate = data.settings.rate;
  }
  save();
}

/* ==================================================================== *
 *  AI (Gemini) — the brain behind the coach and smart parsing.          *
 *  The key lives in localStorage only; the app calls Google directly.   *
 * ==================================================================== */
const AI = {
  ready() { return !!db.settings.aiKey; },

  async generate(contents, systemText, jsonMode) {
    const model = db.settings.aiModel || 'gemini-2.5-flash';
    const body = {
      contents,
      systemInstruction: { parts: [{ text: systemText }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    };
    if (jsonMode) { body.generationConfig.responseMimeType = 'application/json'; body.generationConfig.temperature = 0.1; }
    // 2.5-series models think by default; turn it off for snappy, cheap replies
    if (model.startsWith('gemini-2.5')) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };

    const call = async (b) => {
      try {
        return await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': db.settings.aiKey }, body: JSON.stringify(b) });
      } catch (e) { throw new Error('network'); }   // fetch itself failed = actual connectivity problem
    };
    const keyRejected = async (r) => /API_KEY_INVALID|API key not valid/i.test(await r.clone().text().catch(() => ''));

    let r = await call(body);
    if (r.status === 400) {
      if (await keyRejected(r)) throw new Error('bad-key');  // Google says 400, not 401, for bad keys
      if (body.generationConfig.thinkingConfig) {
        delete body.generationConfig.thinkingConfig;         // model doesn't take the field — retry without
        r = await call(body);
        if (r.status === 400 && await keyRejected(r)) throw new Error('bad-key');
      }
    }
    if (r.status === 401 || r.status === 403) throw new Error('bad-key');
    if (r.status === 429) throw new Error('rate-limit');
    if (r.status >= 500) throw new Error('server');
    if (!r.ok) throw new Error('ai-' + r.status);
    const j = await r.json();
    if (j.promptFeedback?.blockReason || (j.candidates || [])[0]?.finishReason === 'SAFETY') throw new Error('blocked');
    const text = (((j.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text).join('') || '';
    if (!text) throw new Error('empty');
    return text;
  },
};

/* Full-memory snapshot of the user's money, fed to the coach. */
function buildCoachContext() {
  const L = [];
  const rate = db.settings.rate;
  L.push(`You are the coach inside "Reckon", a personal money app. The user tracks money in GBP (£, main) and MAD (Moroccan dirham, د.م). Current rate: £1 = ${rate} MAD.`);
  L.push(`PERSONA: harsh-but-fair accountability coach. Blunt, direct, a little sharp — but always concrete and helpful. Use their real numbers. Keep replies short (2–6 sentences, plain text, no markdown headers). If they ask "can I afford X", do the actual math against cash, upcoming debts and category limits, then give a straight yes/no with the reason.`);

  L.push(`\n== CURRENT POSITION (all £) ==`);
  L.push(`Cash: ${fmtGBP(liquidGBP())} | Saved in goals: ${fmtGBP(savedGBP())} | Owed to them: ${fmtGBP(owedGBP())} | They owe: ${fmtGBP(oweGBP())} | Net: ${fmtGBP(liquidGBP() + savedGBP() + owedGBP() - oweGBP())}`);

  const exp = monthExpenses();
  const spent = exp.reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
  const wasted = exp.filter(t => t.regret === 'stupid').reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
  L.push(`\n== THIS MONTH ==`);
  L.push(`Spent ${fmtGBP(spent)}, of which flagged stupid/wasted: ${fmtGBP(wasted)}. Income this month: ${fmtGBP(monthIncome().reduce((s, t) => s + toGBP(t.amount, t.cur), 0))}.`);
  const spentBy = {};
  for (const t of exp) spentBy[t.cat] = (spentBy[t.cat] || 0) + toGBP(t.amount, t.cur);
  for (const c of db.categories) {
    const sp = spentBy[c.id] || 0;
    if (sp > 0 || c.limit > 0) L.push(`- ${c.name}: ${fmtGBP(sp)}${c.limit ? ` of ${fmtGBP(c.limit)} limit${sp > c.limit ? ' (OVER)' : ''}` : ''}${c.essential ? '' : ' [non-essential]'}`);
  }

  const hist = {};
  for (const t of db.tx) {
    if (t.kind !== 'expense') continue;
    const k = monthKey(new Date(t.date));
    hist[k] = hist[k] || { total: 0, waste: 0 };
    hist[k].total += toGBP(t.amount, t.cur);
    if (t.regret === 'stupid') hist[k].waste += toGBP(t.amount, t.cur);
  }
  L.push(`\n== MONTHLY HISTORY (spend / wasted) ==`);
  const base = now();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const h = hist[monthKey(d)];
    if (h) L.push(`- ${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}: ${fmtGBP(h.total)} / ${fmtGBP(h.waste)}`);
  }

  if (db.goals.length) {
    L.push(`\n== SAVINGS GOALS ==`);
    for (const g of db.goals) L.push(`- ${g.name}: ${fmt(g.saved, g.cur)} of ${fmt(g.target, g.cur)}`);
  }
  const activeLoans = db.loans.filter(l => !l.settled);
  if (activeLoans.length) {
    L.push(`\n== LOANS ==`);
    for (const l of activeLoans) L.push(`- ${l.dir === 'owe' ? 'They owe' : 'Owed to them by'} ${l.who}: ${fmt(l.amount, l.cur)}${l.due ? `, due ${new Date(l.due).toLocaleDateString()}` : ''}`);
  }
  if ((db.recurring || []).length) {
    L.push(`\n== RECURRING (monthly) ==`);
    for (const r of db.recurring) if (r.active) L.push(`- ${r.name}: ${r.kind === 'income' ? '+' : ''}${fmt(r.amount, r.cur)} on day ${r.day}`);
  }

  const recent = [...db.tx].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 30);
  if (recent.length) {
    L.push(`\n== RECENT TRANSACTIONS (newest first) ==`);
    for (const t of recent) L.push(`- ${new Date(t.date).toLocaleDateString()} ${t.kind === 'income' ? 'IN' : catById(t.cat).name} ${fmt(t.amount, t.cur)}${t.note ? ` "${t.note}"` : ''}${t.regret ? ` [${t.regret}]` : ''}`);
  }
  const intent = (db.checkins || {}).intention;
  if (intent && intent.day === dayKeyOf(now())) {
    L.push(`\n== TODAY'S INTENTION == ${intent.mode === 'nospend' ? 'No-spend day' : intent.mode === 'essentials' ? 'Essentials only' : 'Free day'} (they committed to this at morning check-in — hold them to it).`);
  }
  L.push(`\nToday is ${now().toDateString()}. Days left in month: ${daysLeftInMonth()}.`);
  return L.join('\n');
}

function daysLeftInMonth() {
  const t = now();
  return new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate() - t.getDate() + 1;
}
const dayKeyOf = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/* ==================================================================== *
 *  COACH — chat UI                                                      *
 * ==================================================================== */
let chatBusy = false;

function renderCoach() {
  const log = $('#chat-log'); log.innerHTML = '';
  if (!AI.ready()) {
    $('#chat-bar').classList.add('hidden');
    log.innerHTML = `
      <div class="chat-hello"><span class="big">✦</span><b>Meet your coach.</b><br>
      Ask anything about your money and get straight answers using your real numbers.
      It runs on your own Google AI key — free tier is plenty.</div>
      <div class="ai-setup">
        <h3>Connect Google AI</h3>
        <p>Paste your Google AI Studio API key (aistudio.google.com → Get API key). It's stored <b>only on this phone</b> — never synced, never sent anywhere except Google.</p>
        <div class="field"><label>API key</label><input id="ai-key" type="password" placeholder="AIza…" autocomplete="off" /></div>
        <button class="btn-primary" id="ai-save">Connect</button>
      </div>`;
    $('#ai-save').onclick = () => {
      const k = $('#ai-key').value.trim();
      if (k.length < 20) { toast('That doesn\'t look like a key.'); return; }
      db.settings.aiKey = k; save(true);
      toast('Connected. Ask away.');
      renderCoach();
    };
    return;
  }
  $('#chat-bar').classList.remove('hidden');
  const msgs = (db.coach && db.coach.messages) || [];
  if (!msgs.length) {
    log.innerHTML = `
      <div class="chat-hello"><span class="big">✦</span><b>Your money. Ask it anything.</b><br>I can see everything you've logged — and I don't sugarcoat.</div>
      <div class="chat-sugs">
        <button class="chip" data-sug>How am I doing this month?</button>
        <button class="chip" data-sug>Where am I leaking money?</button>
        <button class="chip" data-sug>Make me a plan to clear my debts</button>
        <button class="chip" data-sug>Can I afford £25 tonight?</button>
      </div>`;
    log.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => { $('#chat-in').value = b.textContent; sendChat(); });
  } else {
    for (const m of msgs) log.appendChild(el('div', 'msg ' + (m.role === 'user' ? 'user' : 'ai') + (m.err ? ' err' : ''), esc(m.text)));
    if (chatBusy) log.appendChild(el('div', 'msg ai typing', '<i></i><i></i><i></i>'));
    else log.appendChild(clearChatLink());
  }
  scrollChat();
}
function clearChatLink() {
  const d = el('div', 'settings-link');
  const b = el('button', null, 'Clear conversation');
  b.onclick = () => { if (confirm('Clear the coach conversation?')) { db.coach.messages = []; save(); renderCoach(); } };
  d.appendChild(b); return d;
}
function scrollChat() {
  if (currentScreen !== 'coach') return;
  requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
}

async function sendChat() {
  if (chatBusy) return;
  const inp = $('#chat-in');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  db.coach = db.coach || { messages: [] };
  db.coach.messages.push({ role: 'user', text });
  save();
  renderCoach();

  const log = $('#chat-log');
  const typing = el('div', 'msg ai typing', '<i></i><i></i><i></i>');
  log.appendChild(typing); scrollChat();
  chatBusy = true; $('#chat-send').disabled = true;

  try {
    const history = db.coach.messages.filter(m => !m.err).slice(-12).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
    const reply = await AI.generate(history, buildCoachContext(), false);
    db.coach.messages.push({ role: 'ai', text: reply.trim() });
    if (db.coach.messages.length > 40) db.coach.messages = db.coach.messages.slice(-40);
    save();
  } catch (e) {
    const msg = e.message === 'bad-key' ? 'Your API key was rejected. Check it in Settings → AI coach.'
      : e.message === 'rate-limit' ? 'Google says slow down (rate limit). Try again in a minute.'
      : e.message === 'blocked' ? 'Google\'s safety filter blocked that reply. Rephrase and try again.'
      : (e.message === 'server' || e.message === 'empty') ? 'The AI service had a problem answering. Try again in a moment.'
      : 'Couldn\'t reach the AI. Check your connection and try again.';
    db.coach.messages.push({ role: 'ai', text: msg, err: true });
    save(true);
  } finally {
    chatBusy = false; $('#chat-send').disabled = false;
    if (currentScreen === 'coach') renderCoach();   // reply is saved; other screens re-render on nav
  }
}

/* ==================================================================== *
 *  TYPE-TO-LOG — parse "45 dh taxi" locally, AI fallback for the rest.  *
 * ==================================================================== */
const QUICK_KW = [
  [/taxi|uber|bus|train|tram|petrol|fuel|gas station|metro/, 'trans'],
  [/coffee|cafe|café|snack|croissant|tea\b/, 'coffee'],
  [/lunch|dinner|breakfast|restaurant|takeaway|take-away|delivery|pizza|burger|kebab|tacos|mcdo|kfc/, 'eat'],
  [/grocer|supermarket|market|carrefour|marjane|aswak|lidl|aldi|tesco|food shop/, 'food'],
  [/netflix|spotify|youtube|subscription|sub\b|icloud|prime/, 'subs'],
  [/rent|electric|water bill|gaz|wifi bill|bill\b|bills\b/, 'bills'],
  [/pharmacy|medicine|doctor|dentist|gym/, 'health'],
  [/clothes|shoes|sneakers|hoodie|game|console|amazon|shein|zara/, 'fun'],
  [/cinema|club|drinks|bar\b|shisha|night out|concert/, 'going'],
  [/recharge|phone credit|sim|internet|data\b/, 'phone'],
  [/gift|present|family|mum|mom|dad/, 'gifts'],
];
function parseQuick(raw) {
  const t = raw.toLowerCase().trim();
  // "1,500" is a thousands separator; "3,50" is a European decimal
  const m = t.match(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?/);
  if (!m) return null;
  const amount = parseFloat(/^\d{1,3}(?:,\d{3})+/.test(m[0]) ? m[0].replace(/,/g, '') : m[0].replace(',', '.'));
  if (!amount || amount <= 0) return null;
  let cur = db.settings.mainCurrency;
  if (/(dh\b|dhs\b|mad\b|dirhams?\b|درهم|د\.م)/.test(t)) cur = 'MAD';
  else if (/(£|gbp\b|pound|quid)/.test(t)) cur = 'GBP';
  const income = /(salary|income|got paid|paid me|received|freelance|payday)/.test(t);
  let cat = 'other';
  if (!income) for (const [re, id] of QUICK_KW) { if (re.test(t) && db.categories.some(c => c.id === id)) { cat = id; break; } }
  const note = raw.replace(m[0], '').replace(/(dirhams?|dhs?|mad|gbp|£|د\.م|درهم)/ig, '').replace(/\s+/g, ' ').trim();
  return { kind: income ? 'income' : 'expense', amount, cur, cat, note };
}
async function parseQuickAI(raw) {
  const catIds = db.categories.map(c => `"${c.id}" (${c.name})`).join(', ');
  const sys = `Parse a money note into strict JSON: {"kind":"expense"|"income","amount":number,"currency":"GBP"|"MAD","category":string,"note":string}. Category must be one of: ${catIds}. "dh"/"dirham" means MAD; default currency GBP. note = short human description. Reply with JSON only.`;
  const text = await AI.generate([{ role: 'user', parts: [{ text: raw }] }], sys, true);
  const p = JSON.parse(text);
  if (!p || typeof p.amount !== 'number' || p.amount <= 0) throw new Error('bad-parse');
  return {
    kind: p.kind === 'income' ? 'income' : 'expense',
    amount: p.amount,
    cur: p.currency === 'MAD' ? 'MAD' : 'GBP',
    cat: db.categories.some(c => c.id === p.category) ? p.category : 'other',
    note: String(p.note || '').slice(0, 60),
  };
}
async function applyQuick(raw, srcInput) {
  let p = parseQuick(raw);
  if ((!p || p.cat === 'other') && AI.ready()) {
    try { p = await parseQuickAI(raw) || p; } catch (e) { /* fall back to local result */ }
  }
  // The AI call can take seconds — if the user closed the sheet, confirmed the
  // add, or moved into pause-and-think meanwhile, don't hijack their state.
  // (closeSheet only hides #sheet, so check visibility as well as attachment.)
  if (srcInput && (!srcInput.isConnected || $('#sheet').classList.contains('hidden'))) return;
  if (!p) { toast('Couldn\'t read that — need at least an amount.'); return; }
  draft.kind = p.kind; draft.amount = String(p.amount); draft.cur = p.cur;
  draft.cat = p.cat; draft.note = p.note;
  renderAddSheet();
  toast(`Read it: ${fmt(p.amount, p.cur)} ${p.kind === 'income' ? 'in' : '· ' + catById(p.cat).name}. Check & confirm.`);
}

/* ==================================================================== *
 *  CHECK-INS — the app starts the conversation.                         *
 * ==================================================================== */
function weekKeyOf(d) {
  const y = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}-w${Math.floor((d - y) / 604800000)}`;
}
function pendingCheckin() {
  const t = now(), h = t.getHours();
  const ck = db.checkins || (db.checkins = {});
  if (t.getDay() === 0 && h >= 9 && ck.lastWeekly !== weekKeyOf(t)) return 'weekly';
  if (h >= 5 && h < 12 && ck.lastMorning !== dayKeyOf(t)) return 'morning';
  if (h >= 18 && ck.lastEvening !== dayKeyOf(t)) return 'evening';
  return null;
}
// check-ins now surface in the single Home banner
function renderCheckinCard() {
  if (currentScreen === 'home') renderHomeBanner();
}
function todayExpenses() {
  const k = dayKeyOf(now());
  return db.tx.filter(t => t.kind === 'expense' && dayKeyOf(new Date(t.date)) === k);
}
function openCheckin(type) {
  const ck = db.checkins;
  if (type === 'morning') {
    const cash = liquidGBP();
    const daily = Math.max(0, (cash - oweGBP()) / Math.max(1, daysLeftInMonth()));
    const body = openSheet(`
      <h2>☀️ Morning.</h2>
      <p class="sub">Cash: <b>${fmtGBP(cash)}</b> · after debts that's roughly <b>${fmtGBP(daily)}</b>/day for the rest of the month.</p>
      <div class="field"><label>What kind of day is today?</label>
        <div class="intent-row">
          <button data-i="nospend"><span class="em">🚫</span>No-spend</button>
          <button data-i="essentials"><span class="em">🥖</span>Essentials only</button>
          <button data-i="free"><span class="em">🌊</span>Free day</button>
        </div>
      </div>
      <p class="sub" style="text-align:center">Pick one. Tonight I'll check if you kept it.</p>
      <button class="btn-ghost" data-close>Skip today</button>
    `);
    body.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
      ck.intention = { day: dayKeyOf(now()), mode: b.dataset.i };
      ck.lastMorning = dayKeyOf(now()); save(); closeSheet();
      toast(b.dataset.i === 'nospend' ? 'No-spend day. I\'m watching.' : b.dataset.i === 'essentials' ? 'Essentials only. Hold the line.' : 'Free day — still log everything.');
      renderCheckinCard();
    });
    body.querySelector('[data-close]').addEventListener('click', () => { ck.lastMorning = dayKeyOf(now()); save(true); renderCheckinCard(); });
  } else if (type === 'evening') {
    const todays = todayExpenses();
    const total = todays.reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
    const intent = ck.intention && ck.intention.day === dayKeyOf(now()) ? ck.intention.mode : null;
    let verdict = '';
    if (intent === 'nospend') verdict = todays.length === 0
      ? `<div class="ck-stat good">🚫 You said no-spend — and you spent <b>nothing</b>. That's how it's done.</div>`
      : `<div class="ck-stat bad">🚫 You promised a no-spend day, then spent <b>${fmtGBP(total)}</b>. You broke your own word.</div>`;
    else if (intent === 'essentials') {
      const bad = todays.filter(t => !catById(t.cat).essential);
      verdict = bad.length === 0
        ? `<div class="ck-stat good">🥖 Essentials only — kept. ${todays.length ? `You spent ${fmtGBP(total)}, all necessary.` : 'Nothing spent at all.'}</div>`
        : `<div class="ck-stat bad">🥖 "Essentials only" — but ${fmtGBP(bad.reduce((s, t) => s + toGBP(t.amount, t.cur), 0))} of today's spend wasn't essential. Own it below.</div>`;
    }
    const body = openSheet(`
      <h2>🌙 Evening reckoning.</h2>
      <p class="sub">Today: <b>${todays.length}</b> expense${todays.length === 1 ? '' : 's'}, <b>${fmtGBP(total)}</b> total.</p>
      ${verdict}
      <button class="btn-primary" id="ev-add">＋ Log something I forgot</button>
      <button class="btn-ghost" data-close id="ev-done">All logged — good night</button>
    `);
    // only an explicit choice consumes the check-in — a stray backdrop tap doesn't
    const evDone = () => { ck.lastEvening = dayKeyOf(now()); save(); renderCheckinCard(); };
    $('#ev-add').onclick = () => { evDone(); closeSheet(); openAdd(); };
    $('#ev-done').addEventListener('click', evDone);
  } else {
    const weekAgo = new Date(now() - 7 * 86400000);
    const wk = db.tx.filter(t => t.kind === 'expense' && new Date(t.date) >= weekAgo);
    const spent = wk.reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
    const wasted = wk.filter(t => t.regret === 'stupid').reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
    const prevStart = new Date(now() - 14 * 86400000);
    const prev = db.tx.filter(t => t.kind === 'expense' && new Date(t.date) >= prevStart && new Date(t.date) < weekAgo)
      .reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
    const unjudged = wk.filter(t => t.regret == null && !catById(t.cat).essential).length;
    const cmp = prev > 0 ? (spent > prev * 1.05 ? `<div class="ck-stat bad">📈 Up <b>${Math.round((spent - prev) / prev * 100)}%</b> on last week (${fmtGBP(prev)}). Wrong direction.</div>`
      : spent < prev * 0.95 ? `<div class="ck-stat good">📉 Down <b>${Math.round((prev - spent) / prev * 100)}%</b> on last week. Keep going.</div>`
      : `<div class="ck-stat">➖ Flat vs last week.</div>`) : '';
    const body = openSheet(`
      <h2>🧾 Sunday reckoning.</h2>
      <p class="sub">The week, in cold numbers:</p>
      <div class="ck-stat">Spent <b>${fmtGBP(spent)}</b> · wasted <b>${fmtGBP(wasted)}</b>${spent > 0 ? ` (${Math.round(wasted / spent * 100) || 0}%)` : ''}</div>
      ${cmp}
      ${unjudged ? `<div class="ck-stat bad">⚖️ <b>${unjudged}</b> purchase${unjudged > 1 ? 's' : ''} still unjudged. Face them.</div>` : `<div class="ck-stat good">⚖️ Everything judged. Respect.</div>`}
      <button class="btn-primary" id="wk-review">Go through the week →</button>
      <button class="btn-ghost" data-close id="wk-done">Done</button>
    `);
    const wkDone = () => { ck.lastWeekly = weekKeyOf(now()); save(); renderCheckinCard(); };
    $('#wk-review').onclick = () => { wkDone(); closeSheet(); go('review'); };
    $('#wk-done').addEventListener('click', wkDone);
  }
}

/* ==================================================================== *
 *  WIRING                                                               *
 * ==================================================================== */
function bindOnce() {
  // auth screen
  $('#auth-submit').onclick = submitAuth;
  $('#auth-switch').onclick = () => { authMode = authMode === 'login' ? 'signup' : 'login'; renderAuth(); };
  $('#auth-pw').addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
  // nav
  $$('.nav-btn').forEach(b => b.onclick = () => go(b.dataset.nav));
  // fab
  $('#fab').onclick = openAdd;
  // topbar actions
  $('#rate-chip').onclick = openRate;
  $('#coach-btn').onclick = () => go('coach');
  // coach chat
  $('#chat-send').onclick = sendChat;
  $('#chat-in').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
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

function applyTheme() {
  const t = (db.settings && db.settings.theme) || 'dark';
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#f3f5f9' : '#0b0d12');
}

async function bootApp() {
  applyTheme();
  postRecurring();

  const h = now().getHours();
  const hi = h < 5 ? 'Still up?' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
  $('#greeting').textContent = hi;
  const wasted = monthExpenses().filter(t => t.regret === 'stupid').reduce((s, t) => s + toGBP(t.amount, t.cur), 0);
  $('#topbar-sub').textContent = wasted > 0 ? `${fmtGBP(wasted)} wasted this month` : 'the honest ledger';
  renderRateChip();
  go('home');
  refreshRate(false);

  // background: pull any newer copy from another device, then re-render
  Cloud.sync().then(r => { if (r === 'pulled') { applyTheme(); if (currentScreen) renderScreen(currentScreen); } }).catch(e => console.warn('bg sync', e));

  // The app opens the conversation: surface today's check-in once per slot.
  const pending = pendingCheckin();
  if (pending) setTimeout(() => { if (!$('#sheet').classList.contains('hidden')) return; openCheckin(pending); }, 700);
}

/* start */
bindOnce();
if (session) { db = loadLocalDB(); applyTheme(); showApp(); bootApp(); }
else { applyTheme(); showAuth(); }

/* PWA service worker */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
