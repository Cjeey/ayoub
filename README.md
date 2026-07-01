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
- First launch asks you to **set a 4-digit passcode**.

## The four anti-waste nudges

| When | What happens |
|------|--------------|
| **Before** you buy | Non-essential categories trigger a *"Hold on — do you actually need this?"* prompt |
| **During** the month | Per-category monthly limits, with bars that go orange → red as you near/pass them |
| **At log time** | One tap marks a purchase *worth it* or *stupid*; a running "wasted this month" total shames you |
| **Weekly** | The **Review** tab surfaces unjudged buys so you reckon with them honestly |

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

## Cloud backup — how it works

Reckon is private by design, so cloud sync uses **no email or password**.
When you turn it on, the app generates a long random **sync code** and stores
your data in a Supabase vault reachable *only* with that code. To use your
money on another device, install Reckon there and enter the same code.

**The code is the only key to your data — save it, keep it private, and
don't lose it (there's no reset).**

Security model (`supabase/migrations/0001_reckon_vault_sync.sql`):

- One `vaults(code, data, updated_at)` table with **RLS on and no policies**,
  so the public key can't read or write it directly.
- All access goes through two `SECURITY DEFINER` functions, `vault_pull` /
  `vault_push`, that require a 16+ char code (the client generates ~118 bits).
- Sync is last-write-wins by revision timestamp; the app pulls a newer cloud
  copy on open and pushes local changes shortly after you make them.

Local-only settings (your passcode, the sync code itself) never leave the
device — only your ledger does.

## Data & storage

Data is stored locally in `localStorage` under `reckon.v1`, behind a small
storage layer (`load` / `save`) with a `Cloud` module layered on top. With
cloud backup off, everything stays on the device.

## Files

- `index.html` — app shell (lock screen, 5 tabs, sheet modal)
- `app.css` — all styling (dark, mobile-first)
- `script.js` — all logic + the `Cloud` sync module
- `manifest.json`, `sw.js`, `icon.svg` — PWA install + offline
- `supabase/migrations/` — the cloud vault schema
