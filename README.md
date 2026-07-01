# Reckon — money, honestly

A blunt, phone-first personal money tracker. Built to do three things:

1. **Save** — multiple savings goals with progress.
2. **Kill stupid spending** — it comes at waste from four angles (below).
3. **Settle loans** — money you owe *and* money owed to you.

Totals are shown in **£ (GBP)**, with **MAD** entries converted at a live
(or manual) exchange rate. Tone is deliberately harsh — it calls you out.

## How to use it

It's a **PWA** (installable web app), no build step, no server needed for the
app itself.

- **On your phone:** open `index.html` over HTTPS (or `localhost`), then
  *Share → Add to Home Screen*. It runs full-screen and works offline.
- **Locally:** serve the folder and open it, e.g.
  ```
  python3 -m http.server 8000
  # visit http://localhost:8000
  ```
- First launch asks you to **sign up with an email and password** (or log in).
- **Dark and light themes** — toggle in Settings (tap the rate chip → Settings).

## The four anti-waste nudges

| When | What happens |
|------|--------------|
| **Before** you buy | Non-essential categories trigger a *"Hold on — do you actually need this?"* prompt |
| **During** the month | Per-category monthly limits, with bars that go orange → red as you near/pass them |
| **At log time** | One tap marks a purchase *worth it* or *stupid*; a running "wasted this month" total shames you |
| **Weekly** | The **Review** tab surfaces unjudged buys so you reckon with them honestly |

## The intelligent layer

- **✦ AI Coach** — reachable from the "Ask your AI coach" card on Home or the
  ✦ button in the top bar. Ask anything ("can I afford £25 tonight?", "plan my
  way out of debt") and it answers with your *actual* numbers: full memory of
  your history, goals, loans, patterns and regrets. Runs on **your own OpenAI
  (`sk-…`) or Google AI (`AIza…`) key** — paste either and the app routes to
  the right provider automatically. The key is stored **only on your device**,
  stripped from cloud sync, and sent straight to the provider (no middleman).
- **⚡ Type-to-log** — in the add sheet, type `45 dh taxi` or `coffee 3.50`
  and it fills amount/currency/category itself. Common patterns parse
  locally and instantly; anything weird falls back to the AI when connected.
  Non-essential buys still go through the pause-and-think gate.
- **🗣️ Check-ins** — the app opens the conversation:
  - **Morning:** shows your safe-to-spend/day and asks you to commit —
    no-spend, essentials-only, or free day.
  - **Evening:** compares what you *did* against what you *promised* that
    morning, and calls you out if you broke it.
  - **Sunday:** a weekly reckoning — spend vs last week, waste %, and a
    guided pass over everything still unjudged.

## Features

- Fast manual logging (spend or income), **GBP or MAD** per entry
- Irregular income supported — log it whenever it lands
- Net worth = cash + savings + owed-to-you − you-owe, all in £
- **6-month trend chart** splitting spent vs *wasted*
- **Recurring items** (rent, subs, salary) that auto-log on their day each month
- Multiple **savings goals** (add/withdraw, per-goal currency)
- **Loans** both directions, with due dates + overdue/soon warnings
- Live FX rate (free, no key) with a manual override
- Passcode lock · offline · installable PWA
- **Cloud backup** across devices via a secret sync code (no email/login)
- One-tap JSON **export** for local backup (Settings)

## Accounts & cloud database

Reckon uses **Supabase** as its database with **email/password** login.
Sign up once, and your money lives in your own row of a Postgres table,
protected by row-level security — log in on any device to see it.

Architecture (`supabase/migrations/0002_reckon_user_data.sql`):

- One `user_data(user_id, data jsonb, updated_at)` row per user, with **RLS
  scoped to `auth.uid()`** so no one can read or write another user's data.
- The client (`Auth` + `Cloud` modules in `script.js`) talks to Supabase
  directly over REST/GoTrue — sign up, log in, and token refresh with no
  third-party library. Sign-up goes through a `signup` **edge function**
  (`supabase/functions/signup`) that creates the account pre-confirmed via the
  admin API, so login works instantly without a confirmation email.
- **Offline-first:** your data is cached in `localStorage` (keyed per user), so
  the app opens and works with no network; changes sync up when you're back
  online. Sync is last-write-wins by a client revision (`_rev`), pushes are
  serialized so a slow request can't clobber newer data, and a rejected token
  sends you back to the login screen without losing your cached edits.
- Your **Google AI key stays on the device only** — it's stripped from both the
  cloud payload and the JSON export.

## Files

- `index.html` — app shell (lock screen, 5 tabs, sheet modal)
- `app.css` — all styling (dark, mobile-first)
- `script.js` — all logic + the `Cloud` sync module
- `manifest.json`, `sw.js`, `icon.svg` — PWA install + offline
- `supabase/migrations/` — the cloud vault schema
