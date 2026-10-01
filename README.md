# AI Lab Market

A low-price marketplace where creators sell things they built with AI — plugins, websites,
agents, templates, prompt packs — to everyday people. The platform takes a small cut.

## How the money works

| Event | What happens | Default |
|---|---|---|
| Someone buys an item | Platform keeps a **sale fee**, creator is credited the rest | 10% |
| Creator's balance reaches the threshold | **Withdrawals unlock** | $20.00 |
| Creator withdraws | Platform keeps a **withdrawal share** of the amount, creator receives the rest | 3% |
| Price cap per item | Keeps the market affordable | $25.00 |

Everything is in integer cents and recorded in an append-only `ledger` table. A creator's
balance is the sum of their ledger rows; the platform's revenue is the rows with no user.
Requested withdrawals are held immediately; an admin marks them paid (platform share is booked)
or rejects them (money returns to the creator, no share taken).

All of these are env vars: `SALE_FEE_BPS`, `WITHDRAW_FEE_BPS`, `MIN_WITHDRAW_CENTS`, `MAX_PRICE_CENTS`.

## Run it

Needs Node 22.13+ (uses the built-in SQLite). No `npm install` required.

```bash
npm run seed   # optional demo data (admin@example.com / mia@ / omar@, password: password123)
npm start      # http://localhost:3000
npm test
```

Set `ADMIN_EMAIL=you@example.com` and register with that address to get the admin page
(platform revenue, withdrawal approvals).

## Features

- Browse, search, filter by category, sort by newest / popular / cheapest
- Accounts (scrypt passwords, HttpOnly cookie sessions)
- Creators list items with a private download link — revealed only to buyers (and the creator)
- Buy / get free, personal library
- Creator dashboard: sales, fees, balance, progress to withdrawal, withdrawal requests
- Admin dashboard: platform revenue split, owed-to-creators, withdrawal queue

## Before you take real money — important

**Payments are a demo.** `src/payments.js` approves every charge and "pays out" instantly,
and the UI says so. To launch, implement `charge()` and `payout()` with a real provider —
Stripe Checkout + Stripe Connect is the natural fit for marketplaces (handles creator
onboarding, KYC and tax forms). The ledger stays as your source of truth.

Also still to do for production: HTTPS (set `NODE_ENV=production` for Secure cookies), a
persistent disk for `data/`, email verification / password reset, file hosting or upload
scanning (right now creators supply a download link), a content/abuse review process
(listings go live immediately), refunds/chargebacks policy, and Terms of Service + privacy policy.
