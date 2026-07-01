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
- Multiple **savings goals** (add/withdraw, per-goal currency)
- **Loans** both directions, with due dates + overdue/soon warnings
- Live FX rate (free, no key) with a manual override
- Passcode lock · offline · **your data stays on your device**
- One-tap JSON **export** for backup (Settings)

## Data & storage

Everything is stored locally in your browser (`localStorage`) under the
`reckon.v1` key. The storage lives behind a small `Store` layer
(`load` / `save` in `script.js`) so **cloud backup (Supabase) can be wired
in without touching the UI** — that's the planned next step for cross-device
sync.

## Files

- `index.html` — app shell (lock screen, 5 tabs, sheet modal)
- `app.css` — all styling (dark, mobile-first)
- `script.js` — all logic + the `Store` layer
- `manifest.json`, `sw.js`, `icon.svg` — PWA install + offline
