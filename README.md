# BiteVo Admin Panel

Run BiteVo from a phone or a computer: orders, the menu, coupons, customer wallets and the delivery team,
plus who is signed in and how sales are going. Same look as the public website (`../bitevo`).

```
bitevoadminpanel/
  frontend/   React 18 + Vite: the admin panel (port 2001)
  backend/    Node.js + Express API, data in MongoDB (port 4000)
```

## Run it

```bash
npm install
npm run dev
```

This starts both apps. Open http://localhost:2001. The frontend forwards `/api` and `/uploads` to the backend.

| Command | What it does |
|---|---|
| `npm run dev` | Backend (auto-restarts on changes) + frontend together |
| `npm run build` | Production build of the frontend into `frontend/dist/` |
| `npm start` | Runs the backend for production |
| `npm run seed` | Loads demo data into an **empty** database (never touches real data) |
| `npm run seed -- --reset` | Replaces existing *demo* data with fresh demo data |
| `npm run check-db -w backend` | Read-only: lists the databases and collections the API can see |
| `npm run create-admin -w backend -- --email you@bitevo.in --name "Your Name"` | Creates an admin (asks for the password) |

### Sign in

| Email | Password | Role |
|---|---|---|
| admin@gmail.com | admin | Super admin |
| ops@bitevo.in | bitevo@ops | Operations |

These are demo accounts created by the seeder. **Change them before the panel goes online**: create your own admin with
`create-admin`, then set `DEMO_MODE=false`.

## Data: MongoDB

The backend connects to MongoDB using the `.env` in the project root (`MONGO_DB_URL`, `MONGO_DB_USER`,
`MONGO_DB_PASSWORD`), or `backend/.env` (see `backend/.env.example`). Data goes in the **`bitevo`** database
(change with `MONGO_DB_NAME`). Without a connection string the API falls back to a local JSON file
(`backend/data/db.json`), which is handy offline.

Collections: `admins`, `categories`, `products`, `coupons`, `agents`, `customers`, `orders`, `walletTxns`,
`sessions`, `loginEvents`, `meta`. Indexes are created on start. Dates are stored as ISO strings and prices in rupees.

**Demo mode** (`DEMO_MODE=true`, the default) seeds an empty database with 180 days of realistic demo data and
simulates the customer and delivery apps: new orders arrive during opening hours, and orders sent out for delivery
are marked delivered when the agent "arrives". Turn it off for real use.

## Using it on a phone

The same panel adapts to the screen:

- **Phone:** a bottom tab bar (Home, Orders, Menu, Wallet, More), table rows shown as cards, dialogs that slide up
  from the bottom, filter pills you can swipe, and large tap targets.
- **Tablet / laptop / desktop:** sidebar navigation and full tables.
- **Add to Home Screen:** open the panel in Chrome (Android) or Safari (iPhone) and choose *Add to Home Screen*.
  It opens full-screen with the BiteVo icon, like an app.

## What's inside

| Page | What you can do |
|---|---|
| **Dashboard** | Today's revenue and orders vs. the same time yesterday, live orders, available agents, 7-day revenue, a "needs attention" list and the latest orders. |
| **Orders** | Today, 7 or 30 days, refreshed every 30 seconds. Filter by status and search. Accept, send out and mark delivered in one tap; view the bill, customer, payment, timeline and admin activity; assign the delivery agent; cancel with a reason and refund to the BiteVo wallet or the original payment. |
| **Products** | Menu items with an optional heading (e.g. "Chef's special"), category (add your own), veg/non-veg, price, MRP, prep time, description and a photo (upload, drag in, or paste a link). Toggle available / bestseller. |
| **Coupons** | Percentage, flat amount, free delivery, free product and wallet cashback. Minimum order, caps, dates, usage limits, first-order-only, pause/resume, usage tracking. |
| **Wallet** | Customer balances and full history (cashback, refunds, spending, admin changes). Add or deduct money with a reason; balances can't go below zero. |
| **Delivery agents** | Add/edit agents, approve or reject ID checks, suspend (signs them out everywhere), live status and 30-day performance. |
| **Login status** | Every signed-in session across the admin panel, delivery app and customer app. Sign any session out. Sign-in history including failed attempts. |
| **Analytics** | 7 / 30 / 90 days vs. the period before: revenue, orders, order value, new customers, delivery time, cancellations, and charts for sales by day, hour, category, dish and payment method, plus coupon and agent performance. |

Light theme like the website by default, with an optional dark theme in the top bar.

## Security

- Admin passwords are stored as bcrypt hashes; sign-in sets an httpOnly session cookie whose token is stored only as a SHA-256 hash.
- Sign-in is rate limited (10 attempts per 15 minutes per IP) and every attempt is logged in Login status.
- Every API route except sign-in requires a valid session; revoking a session signs that device out immediately.
- The API validates and whitelists all input, checks uploaded files are real images, and sends standard security headers (helmet).
- Keep `.env` out of git (it already is): it holds the MongoDB password.

## Going live

1. Set `DEMO_MODE=false`, create your admin with `create-admin`, and remove the demo accounts (or start from an empty database).
2. Host the backend (any Node.js host) with the `.env` settings, `COOKIE_SECURE=true`, and `TRUST_PROXY=true` behind a proxy.
3. Build the frontend with `VITE_API_URL=https://your-api-address npm run build` and host `frontend/dist/` as a static site.
   If it's on a different domain from the API, set `CLIENT_ORIGIN` to the panel's address, `COOKIE_SAMESITE=none`, and `PUBLIC_URL` to the API's address.
4. Uploaded photos are saved in `backend/uploads/`. On hosts without a persistent disk, move them to S3 or Cloudinary.

## How the code is organised

```
frontend/src/
  api/index.js    <- every call to the backend (one function per endpoint)
  pages/          <- Dashboard, Orders, Products, Coupons, Wallet, Agents, LoginStatus, Analytics, Login
  components/     <- layout (sidebar, phone tab bar), shared UI, charts, photo picker, icons
  lib/            <- formatting, status labels, image shrinking, data-loading hooks
backend/src/
  server.js, app.js  <- start-up, middleware, route table
  auth.js            <- sessions and the "must be signed in" guard
  routes/            <- auth, products (+categories, uploads), coupons, agents, orders, wallets (+customers), activity, reports
  db/                <- MongoDB store, JSON-file fallback, indexes
  demo/              <- demo data generator, seeding rules, live order simulator
  analytics.js       <- dashboard and analytics maths
```
