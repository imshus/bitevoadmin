# BiteVo Admin Panel

Admin panel for BiteVo: manage the menu, coupons and delivery team, see who is signed in, and track sales.
Built with React 18 + Vite, same stack and brand as the public website (`../bitevo`).

> **Demo data.** The panel currently runs on dummy data stored in your browser. Nothing is sent to a server yet.
> See [Connecting MongoDB](#connecting-mongodb) for the next step.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:2001 (the website uses port 2000, so both can run together).
`npm run build` creates a production build in `dist/`.

### Demo sign-in

| Email | Password | Role |
|---|---|---|
| admin@bitevo.in | bitevo@admin | Super admin |
| ops@bitevo.in | bitevo@ops | Operations |

These exist only for the demo (they're in `src/api/seed.js`). Real admin accounts must be checked on the server.

## What's inside

| Page | What you can do |
|---|---|
| **Dashboard** | Today's revenue and orders vs. the same time yesterday, live orders, available agents, 7-day revenue, a "needs attention" list (out-of-stock items, pending ID checks, expiring coupons, failed sign-ins) and the latest orders. |
| **Products** | Add, edit and delete menu items (name, category, veg/non-veg, price, MRP, prep time, photo link, description). Toggle *available / out of stock* and *bestseller*. Search and filter by category and stock. |
| **Coupons** | Create percentage, flat-amount or free-delivery coupons with minimum order, max discount, start/end dates, total and per-customer limits and first-order-only. Pause/resume, see usage against the limit, filter by Active / Scheduled / Paused / Ended. Codes are unique. |
| **Delivery agents** | Add and edit agents (phone, zone, vehicle), approve or reject ID checks (KYC), suspend or reactivate accounts, and see live status (online / on delivery / offline) plus 30-day deliveries, average time and rating. Suspending or removing an agent signs them out everywhere. |
| **Login status** | Every signed-in session across the admin panel, delivery app and customer app, with device, IP, sign-in time and last activity (Active now / Idle / Inactive / Signed out). Sign any session out. A sign-in history shows successful and failed attempts. Refreshes every 30 seconds. |
| **Analytics** | Last 7 / 30 / 90 days compared with the period before: revenue, orders, average order value, new customers, delivery time and cancellations; revenue per day, orders by hour, sales by category, best-selling dishes, payment methods, coupon performance and agent performance. Every chart can switch to a table. |

Also: light and dark themes (top bar), works on phones (menu slides in), and **Reset demo data** in the account menu.

## How the code is organised

```
src/
  api/
    index.js      ← the only API the pages use (swap this for the real backend)
    seed.js       ← dummy products, coupons, agents, sessions, demo admins
    orders.js     ← simulated 180-day order history that powers analytics
    analytics.js  ← turns orders into the dashboard/analytics numbers
    db.js         ← stores the dummy collections in localStorage
  pages/          ← Dashboard, Products, Coupons, Agents, LoginStatus, Analytics, Login
  components/     ← layout, shared UI, charts, icons, toasts
  lib/            ← formatting, status rules, data-loading hooks
```

## Connecting MongoDB

A browser can't (and shouldn't) connect to MongoDB directly — the connection string would be visible to anyone.
The plan is a small backend (Node + Express + the MongoDB driver or Mongoose) that the panel calls over HTTP:

| Panel function (`src/api/index.js`) | Backend route |
|---|---|
| `products.list / create / update / remove` | `GET/POST /api/products`, `PATCH/DELETE /api/products/:id` |
| `coupons.*` | same pattern on `/api/coupons` (list adds `usedCount`) |
| `agents.*` | same pattern on `/api/agents` (list adds 30-day `stats`) |
| `sessions.list`, `sessions.revoke(id)` | `GET /api/sessions`, `POST /api/sessions/:id/revoke` |
| `loginEvents.list` | `GET /api/login-events` |
| `analytics.get(days)` | `GET /api/analytics?days=30` (aggregation over `orders`) |
| `dashboard.summary()` | `GET /api/dashboard` |
| `auth.login / logout / me` | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` (httpOnly cookie) |

The pages don't change — only the bodies of the functions in `src/api/index.js`.
The expected document shapes are the ones in `src/api/seed.js` and `src/api/orders.js` (`_id`, ISO dates, prices in rupees).

To wire it up, share the collection names and one sample document from each (products, coupons, delivery agents,
orders, users/sessions). Keep the connection string in a server-side `.env` file, never in this frontend.
