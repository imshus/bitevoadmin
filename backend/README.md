# BiteVo Admin — Backend

Node.js + Express API for the BiteVo admin panel. Data is stored in MongoDB.

## Run it

```bash
npm install
npm run dev
```

The API listens on http://localhost:4000. Start the frontend separately (see `../frontend`).

| Command | What it does |
|---|---|
| `npm run dev` | Runs the API on port 4000 and restarts on changes |
| `npm start` | Runs the API for production (port from `PORT`) |
| `npm run seed` | Loads demo data into an **empty** database (never touches real data) |
| `npm run seed -- --reset` | Replaces existing *demo* data with fresh demo data |
| `npm run check-db` | Read-only: lists the databases and collections the API can see |
| `npm run create-admin -- --email you@bitevo.in --name "Your Name"` | Creates an admin (asks for the password) |

## Settings (`.env`)

Copy `.env.example` to `.env`. The MongoDB connection is either `MONGODB_URI`, or `MONGO_DB_URL` with
`MONGO_DB_USER` / `MONGO_DB_PASSWORD`. Data goes in the `bitevo` database (`MONGO_DB_NAME`). Without a connection
string the API uses a local JSON file (`data/db.json`) instead. **Never commit `.env`**: it holds the database password
(it's in `.gitignore`).

`DEMO_MODE=true` (the default) seeds an empty database with 180 days of demo data and simulates new orders and
deliveries. Set `DEMO_MODE=false` for real use.

### Demo sign-in

| Email | Password | Role |
|---|---|---|
| admin@gmail.com | admin | Super admin |
| ops@bitevo.in | bitevo@ops | Operations |

Created by the demo seeder. Before going online, create your own admin with `create-admin` and set `DEMO_MODE=false`.

## API

Everything is under `/api` and needs a signed-in admin, except `/api/auth/login` and `/api/health`.

| Area | Routes |
|---|---|
| Sign-in | `POST /auth/login`, `GET /auth/me`, `POST /auth/heartbeat`, `POST /auth/logout` |
| Menu | `GET/POST /products`, `PATCH/DELETE /products/:id`, `GET/POST /categories`, `POST /uploads` (raw image body) |
| Offers | `GET/POST /coupons`, `PATCH/DELETE /coupons/:id` |
| Orders | `GET /orders?days=1`, `GET /orders/:id`, `POST /orders/:id/advance`, `/assign`, `/cancel` |
| Wallets | `GET /wallets`, `POST /wallets/:customerId/adjustments`, `GET /customers?search=` |
| Team | `GET/POST /agents`, `PATCH/DELETE /agents/:id` |
| Login status | `GET /sessions`, `POST /sessions/:id/revoke`, `GET /login-events` |
| Reports | `GET /analytics?days=30`, `GET /dashboard` |
| Settings | `GET /settings`, `PATCH /settings` (zones, vehicle types, cancel reasons, wallet reasons) |
| Demo | `POST /demo/reset` (demo mode only) |

**Settings:** delivery zones, vehicle types, cancel reasons and wallet adjustment reasons live in the `settings`
collection (document `app`); agent and order checks use them.

**Categories** are added from the panel's product form ("+ Add a new category…" opens a popup that saves the
name straight to the `categories` collection).

**Combos** are products with `type: "combo"` and `comboItems: [{ productId, qty }]`. The server fills in item
names, works out veg/non-veg from the items, keeps names in sync when a dish is renamed, and won't delete a dish that
is part of a combo.

## Security

- Admin passwords are bcrypt hashes; sessions use an httpOnly cookie whose token is stored only as a SHA-256 hash.
- Sign-in is rate limited (10 attempts / 15 min / IP) and logged.
- Input is whitelisted and validated; uploads must be real images; security headers via helmet; CORS limited to `CLIENT_ORIGIN`.

## Going live

- Host on any Node.js host with the `.env` settings, `COOKIE_SECURE=true`, and `TRUST_PROXY=true` behind a proxy.
- If the panel is on another domain: `CLIENT_ORIGIN=https://admin.your-domain`, `COOKIE_SAMESITE=none`, `PUBLIC_URL=https://api.your-domain`.
- Uploaded photos are saved in `uploads/`. On hosts without a persistent disk, move them to S3 or Cloudinary.

## Code

```
src/
  server.js, app.js  start-up, middleware, route table
  auth.js            sessions and the "must be signed in" guard
  routes/            auth, products (+categories, uploads), coupons, agents, orders, wallets (+customers), activity, reports
  db/                MongoDB store, JSON-file fallback, indexes
  demo/              demo data, seeding rules, live order simulator
  analytics.js       dashboard and analytics maths
```
