# CookLyt POS — Restaurant Management Platform

A full restaurant management monorepo: a point-of-sale dashboard (which also serves the public landing page), a super-admin panel, a customer QR-menu ordering app, and a Node.js/Express + PostgreSQL backend with real-time updates over WebSocket.

The product is built around **waste intelligence** — alongside the usual floor, kitchen, and billing workflows, it tracks food waste per ingredient, shift, and reason, costed against live recipe data.

## Monorepo Layout

| Package | Description | Dev port |
|---|---|---|
| `dashboard/` | Main POS web app (React + Vite + Tailwind) — orders, tables, kitchen, inventory, waste tracking, loyalty, reports. Also serves the public landing page at `/`. | 5173 |
| `admin/` | Super-admin panel — restaurant provisioning, users, audit logs. | 5174 |
| `menu/` | Customer-facing QR menu & ordering app. | 5175 |
| `backend/` | Express API + PostgreSQL + WebSocket server. | 3000 |

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Backend Modules](#backend-modules)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [Running the Apps](#running-the-apps)
- [Running Tests](#running-tests)
- [Database & Migrations](#database--migrations)
- [API Reference](#api-reference)
- [WebSocket Events](#websocket-events)
- [Roles & Permissions](#roles--permissions)
- [Branding & White-labelling](#branding--white-labelling)
- [Deployment](#deployment)
- [License](#license)

---

## Architecture

The backend follows a **layered architecture** with clear separation of concerns:

```
Router  →  Service  →  Repository  →  PostgreSQL
```

- **Router** (`*.router.js`) — Express route definitions. Handles HTTP method/path, applies authentication/authorization middleware, delegates to the service layer.
- **Service** (`*.service.js`) — Business logic. Validates inputs, orchestrates cross-module calls, emits WebSocket events.
- **Repository** (`*.repository.js`) — All raw SQL queries. The only layer that talks to the database.

Each domain lives in its own self-contained folder under `backend/src/`. Cross-module calls go service → service; there is no separate adapter layer.

Shared helpers live in `backend/src/shared/`:

| Helper | Purpose |
|---|---|
| `db.js` | `pg` connection pool, plus `db.withTransaction()` for atomic multi-statement writes |
| `websocket.js` | WebSocket server wrapper and broadcast helpers |
| `errors.js` | `AppError`, `NotFoundError`, `UnauthorizedError`, etc. |
| `asyncHandler.js` | Wraps async route handlers so rejections reach the error middleware |
| `sql.js` | `buildUpdateSet()` for partial-update queries |
| `email.service.js` | Nodemailer transport + transactional email templates |
| `middleware/` | `auth.js` (authenticate + authorize), `validate.js` (body schema validation), rate limiting |

The role list is defined once in `shared/roles.js` so auth and admin can't drift. On the frontend, `dashboard/src/lib/queryClient.js` exports an `invalidate()` helper for TanStack Query cache invalidation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+ |
| Framework | Express 4 |
| Database | PostgreSQL 17 |
| DB Driver | `pg` (node-postgres) |
| Migrations | `node-pg-migrate` |
| Auth | JWT (`jsonwebtoken`) + bcrypt, optional Google OAuth |
| Real-time | WebSocket (`ws`) |
| Cache / queues | Redis (`ioredis`) |
| Email | `nodemailer` (any SMTP provider) |
| File upload / images | `multer`, `sharp` |
| Exports | `exceljs` |
| Security | `helmet`, `cors`, rate limiting |
| Testing | Jest + Supertest |
| Frontends | React 18, Vite 8, Tailwind 3, TanStack Query, React Router 6, Recharts, Dexie (offline cache) |
| AI (optional) | Any OpenAI-compatible endpoint — Ollama locally, vLLM/llama.cpp in production |

---

## Backend Modules

Twenty-eight routers are mounted in `backend/src/app.js`:

| Mount | Module | Purpose |
|---|---|---|
| `/api/auth` | `auth/` | Login, registration, email verification, password reset, Google OAuth |
| `/api/restaurants` | `restaurants/` | Multi-tenant restaurant records |
| `/api/menu` | `menu/` | Menu items, categories, availability |
| `/api/tables` | `tables/` | Floor plan, table status, positions, sessions |
| `/api/orders` | `orders/` | Order lifecycle, items, discounts |
| `/api/payments` | `payments/` | Payment capture, splits, bill breakdown |
| `/api/kitchen` | `kitchen/` | Kitchen display queue |
| `/api/reports` | `reports/` | Sales, category, and shift reporting |
| `/api/settings` | `settings/` | Per-restaurant configuration |
| `/api/shift` | `shift/` | Shift open/close and cash counts |
| `/api/ingredients` | `ingredients/` | Ingredient master and costs |
| `/api/recipes` | `recipes/` | Recipe definitions linking menu items to ingredients |
| `/api/combos` | `combos/` | Combo/meal deals |
| `/api/modifiers` | `modifiers/` | Normalized item modifiers |
| `/api/waste` | `waste/` | Waste logging by ingredient, shift, and reason |
| `/api/wastage-reviews` | `wastage-reviews/` | Review and approval flow for waste entries |
| `/api/inventory` | `inventory/` | Stock levels and movements |
| `/api/stocktake` | `stocktake/` | Stocktake sessions and variance |
| `/api/notifications` | `notifications/` | Staff notifications |
| `/api/reservations` | `reservations/` | Table reservations and reminders |
| `/api/loyalty` | `loyalty/` | Loyalty points, tiers, rewards |
| `/api/coupons` | `coupons/` | Coupon issuance and redemption |
| `/api/reviews` | `reviews/` | Customer reviews |
| `/api/eta` | `eta/` | Order ETA estimation |
| `/api/waitlist` | `waitlist/` | Walk-in waitlist and notifications |
| `/api/ai` | `ai/` | LLM-backed insights and summaries |
| `/api/public` | `public/` | Unauthenticated endpoints for the QR menu app |
| `/admin` | `admin/` | Super-admin panel API |

Static uploads are served from `/uploads`.

---

## Setup & Installation

### Prerequisites

- Node.js 22+ and npm 10+
- Docker (recommended, for PostgreSQL) or a local PostgreSQL 17 instance

### 1. Clone and install

```bash
git clone <repo-url>
cd cooklyt-pos

# Install each package
(cd backend   && npm install)
(cd dashboard && npm install)
(cd admin     && npm install)
(cd menu      && npm install)
```

### 2. Start the databases

```bash
cd backend
docker compose up -d
```

This starts two PostgreSQL 17 containers:

| Service | Host port | Database | User | Password |
|---|---|---|---|---|
| `db` (dev) | **5434** | `pos_dev` | `pos_user` | `pos_password` |
| `db_test` | **5433** | `pos_test` | `pos_user` | `pos_password` |

> The dev database is on host port **5434**, not the PostgreSQL default. The `migrate` and `seed` npm scripts already point at it.

Dev data persists in a named Docker volume (`postgres_data`). The test database has no volume and resets on container restart.

If you use your own PostgreSQL instance, create the database and user manually and set `DATABASE_URL` accordingly.

### 3. Configure environment variables

Each package ships a `.env.example`. Copy it and fill in the blanks:

```bash
cp backend/.env.example   backend/.env
cp dashboard/.env.example dashboard/.env
cp admin/.env.example     admin/.env
```

A minimal `backend/.env` for local development:

```env
DATABASE_URL=postgres://pos_user:pos_password@localhost:5434/pos_dev
JWT_SECRET=replace-with-32+-characters-of-random-data
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175
APP_URL=http://localhost:5173
```

SMTP, Google OAuth, and LLM settings are all optional — leave them blank to disable those features.

### 4. Run migrations and seed

```bash
cd backend
npm run migrate
npm run seed     # optional — demo restaurant, menu, and users
```

---

## Environment Variables

### `backend/.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Signing key for JWTs. Must be 32+ characters of high-entropy random data. |
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | `development` | `development`, `production`, or `test` |
| `CORS_ORIGINS` | No | — | Comma-separated list of allowed browser origins for CORS and WebSocket |
| `TRUST_PROXY` | No | — | Set when running behind a reverse proxy (e.g. `1` or `loopback, linklocal, uniquelocal`) |
| `APP_URL` | No | — | Public URL of the dashboard, used in email links |
| `ADMIN_URL` | No | `http://localhost:5174` | Public URL of the admin panel, used for OAuth redirects |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | No | port `587` | SMTP transport for transactional email. Leave blank to disable outbound mail. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | — | Google OAuth credentials. Leave blank to hide the Google sign-in button. |
| `GOOGLE_CALLBACK_URL` | No | — | Must exactly match the redirect URI registered in Google Cloud Console |
| `GOOGLE_ADMIN_CALLBACK_URL` | No | — | Separate callback for the admin panel |
| `LLM_BASE_URL` | No | `http://localhost:11434/v1` | Any OpenAI-compatible endpoint |
| `LLM_MODEL` | No | `qwen3:8b` | Model name passed to the endpoint |
| `LLM_API_KEY` | No | — | Ignored by Ollama; required by hosted endpoints |
| `LLM_TIMEOUT_MS` | No | `120000` | Per-request timeout |

### `dashboard/.env` and `admin/.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | Yes | `http://localhost:3000` | Backend API base URL |
| `VITE_GOOGLE_CLIENT_ID` | No | — | Same value as the backend `GOOGLE_CLIENT_ID`. Set to show the Google sign-in button. |

---

## Running the Apps

Backend:

```bash
cd backend
npm run dev      # nodemon, auto-restarts on change
npm start        # production
```

Frontends (each in its own terminal):

```bash
(cd dashboard && npm run dev)   # http://localhost:5173
(cd admin     && npm run dev)   # http://localhost:5174
(cd menu      && npm run dev)   # http://localhost:5175
```

Backend endpoints:

- REST API — `http://localhost:3000/api/...`
- Health check — `http://localhost:3000/health`
- WebSocket — `ws://localhost:3000`

Production builds:

```bash
(cd dashboard && npm run build)
(cd admin     && npm run build)
(cd menu      && npm run build)
```

---

## Running Tests

Tests use Jest + Supertest against the test database (`pos_test` on port `5433`). The `test` script sets `DATABASE_URL`, `JWT_SECRET`, and `NODE_ENV` for you.

```bash
cd backend
docker compose up -d
npm run migrate:test
npm test
```

Tests run serially (`--runInBand`) to avoid database race conditions. Suites in `backend/tests/`:

`auth` · `menu` · `orders` · `payments` · `tables` · `kitchen` · `reports` · `stocktake` · `variance` · `waitlist` · `waste-insights` · `eta` · `rateLimit`

Shared fixtures live in `tests/helpers.js`; module stubs in `tests/stubs/`.

---

## Database & Migrations

Migrations live in `backend/migrations/` and run in order via `node-pg-migrate`. There are 71 of them, covering the original core (users, tables, menu items, orders, order items, payments) through multi-tenancy, audit logs, ingredients and recipes, waste and inventory, loyalty and coupons, reservations, reviews, and email verification.

```bash
npm run migrate          # dev database
npm run migrate:test     # test database
npm run migrate:create   # scaffold a new migration
```

### Core tables

<details>
<summary><code>users</code>, <code>tables</code>, <code>menu_items</code>, <code>orders</code>, <code>order_items</code>, <code>payments</code></summary>

#### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, auto-generated |
| email | varchar(255) | unique, not null |
| password | varchar(255) | bcrypt hash |
| role | varchar(50) | `admin`, `staff`, `cashier`, `kitchen` |
| created_at | timestamp | defaults to now |

#### `tables`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| number | integer | unique |
| status | varchar(50) | `available`, `occupied` |
| seats | integer | |

#### `menu_items`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | varchar(255) | |
| price | numeric(10,2) | |
| category | varchar(100) | |
| available | boolean | defaults to true |

#### `orders`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| table_id | uuid | FK → tables |
| status | varchar(50) | `open`, `preparing`, `ready`, `paid`, `cancelled` |
| created_by | uuid | FK → users |
| created_at | timestamp | |

#### `order_items`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| order_id | uuid | FK → orders |
| menu_item_id | uuid | FK → menu_items |
| quantity | integer | |
| notes | text | optional |

#### `payments`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| order_id | uuid | FK → orders |
| amount | numeric(10,2) | |
| method | varchar(50) | `cash`, `card`, `mobile` |
| status | varchar(50) | `pending`, `completed`, `failed` |
| created_at | timestamp | |

Later migrations add columns to these tables (multi-tenancy, discounts, split payments, item-level status, table positions) and introduce the ingredient, recipe, waste, inventory, loyalty, coupon, reservation, and review tables.

</details>

---

## API Reference

All endpoints are prefixed with `/api` and require a valid JWT in the `Authorization: Bearer <token>` header, except `POST /api/auth/login`, `/health`, and everything under `/api/public`.

> The reference below covers the original core modules. The other twenty-odd modules follow the same conventions — see [Backend Modules](#backend-modules) and the routers under `backend/src/`.

### Health Check

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Returns `{ status: "ok", timestamp }` |

### Auth — `/api/auth`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/auth/login` | None | — | Login with email + password. Returns JWT token. |
| POST | `/api/auth/register` | Required | admin | Register a new staff/admin account. |
| GET | `/api/auth/me` | Required | any | Get the current user's profile. |

**Login request body:**
```json
{ "email": "admin@example.com", "password": "secret" }
```

**Login response:**
```json
{
  "token": "<jwt>",
  "user": { "id": "...", "email": "admin@example.com", "role": "admin" }
}
```

JWT expires in **8 hours**.

### Menu — `/api/menu`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/menu` | Required | any | Get all menu items. |
| GET | `/api/menu/available` | Required | any | Get only available menu items. |
| GET | `/api/menu/:id` | Required | any | Get a single menu item by ID. |
| POST | `/api/menu` | Required | admin | Create a new menu item. |
| PATCH | `/api/menu/:id` | Required | admin | Update a menu item. |
| DELETE | `/api/menu/:id` | Required | admin | Delete a menu item. |

### Tables — `/api/tables`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/tables` | Required | any | List all tables. |
| GET | `/api/tables/:id` | Required | any | Get a single table. |
| POST | `/api/tables` | Required | admin | Create a new table. |
| PATCH | `/api/tables/:id/status` | Required | any | Update table status (`available` / `occupied`). |
| DELETE | `/api/tables/:id` | Required | admin | Delete a table. |

### Orders — `/api/orders`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/orders/:id` | Required | any | Get a single order with its items. |
| GET | `/api/orders/table/:tableId` | Required | any | Get active orders for a table. |
| POST | `/api/orders` | Required | any | Create a new order. |
| POST | `/api/orders/:id/items` | Required | any | Add items to an existing order. |
| PATCH | `/api/orders/:id/status` | Required | any | Update order status. |

**Create order request body:**
```json
{
  "tableId": "<uuid>",
  "items": [
    { "menuItemId": "<uuid>", "quantity": 2, "notes": "no onions" }
  ]
}
```

Valid order statuses: `open`, `preparing`, `ready`, `paid`, `cancelled`

Creating an order marks the table `occupied` and broadcasts `NEW_ORDER`.

### Payments — `/api/payments`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/payments/:orderId` | Required | any | Process payment for an order. |
| GET | `/api/payments/:orderId` | Required | any | Get all payments for an order. |

**Process payment request body:**
```json
{ "method": "cash", "amountTendered": 50.00 }
```

Valid methods: `cash`, `card`, `mobile`

On success the order is marked `paid`, the table is freed, and `PAYMENT_COMPLETED` is broadcast. Stock deduction and loyalty accrual run in the same transaction — if either fails, the payment rolls back. If `amountTendered` is provided, the response includes the change owed.

### Kitchen — `/api/kitchen`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/kitchen/queue` | Required | admin, kitchen, staff | Get all orders currently needing preparation. |
| PATCH | `/api/kitchen/:orderId/preparing` | Required | any | Mark an order as being prepared. |
| PATCH | `/api/kitchen/:orderId/ready` | Required | any | Mark an order as ready for pickup. |

### Reports — `/api/reports`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/reports/daily` | Required | admin | Get daily sales summary. |

**Query parameter:** `?date=YYYY-MM-DD` (defaults to today)

**Response includes:** `summary` (total orders, revenue), `byCategory`, `topItems`, `hourly`.

---

## WebSocket Events

Connect to `ws://localhost:3000`. On connection you receive a `CONNECTED` event. All messages are JSON: `{ event, data, timestamp }`.

| Event | Trigger |
|---|---|
| `CONNECTED` | Client connects |
| `NEW_ORDER` | Order created |
| `ORDER_UPDATED` | Items added to an order |
| `ORDER_STATUS_CHANGED` | Order status updated |
| `ORDER_PREPARING` | Order moved to preparing |
| `ORDER_READY` | Order marked ready |
| `ORDER_SERVED` | Order marked served |
| `PAYMENT_COMPLETED` | Payment processed |
| `BILL_REQUESTED` | Customer requests the bill from the QR menu |
| `TABLE_UPDATED` | Table status or position changed |
| `STAFF_ASSIGNED` | Staff member assigned to a table or order |
| `USER_PRESENCE` | Staff presence changed |
| `SETTINGS_UPDATED` | Restaurant settings changed |
| `RESERVATION_REMINDER` | Reservation reminder due |
| `WAITLIST_UPDATED` | Waitlist entry added, removed, or reordered |
| `WAITLIST_NOTIFY` | Waitlist party notified their table is ready |

---

## Roles & Permissions

| Role | Description |
|---|---|
| `admin` | Full access. Manages users, menu, tables, inventory, settings, and reports. |
| `staff` | Creates and views orders, updates table status, serves. |
| `cashier` | Processes payments and closes bills. |
| `kitchen` | Views the kitchen queue, marks orders preparing/ready. |

Super-admin accounts are separate and authenticate against the `/admin` API, not `/api/auth`.

---

## Branding & White-labelling

Brand-specific values are centralised so a fork only needs to touch a few places:

| What | Where |
|---|---|
| Contact email, mailto link, WhatsApp link | `dashboard/src/shared.jsx` (`DEMO_EMAIL`, `MAILTO_HREF`, `WHATSAPP_HREF`) |
| Logo and wordmark SVGs | `dashboard/src/shared.jsx` (`LOGO_SVG`, `WORDMARK_SVG`) |
| Landing footer and CTA copy | `dashboard/src/shared.jsx` (`PageFooter`, `PageCTA`) |
| Page title, meta description, Open Graph, schema.org | `dashboard/index.html` |
| Favicon, OG image, `robots.txt`, `sitemap.xml` | `dashboard/public/` |
| Transactional email header and footer | `backend/src/shared/email.service.js` |
| Admin panel title | `admin/index.html` |

Marketing copy on the landing pages (`dashboard/src/pages/Landing.jsx`, `Mission.jsx`, `Compare.jsx`, `Problem.jsx`, `Waste.jsx`, `Features.jsx`, `Access.jsx`) is prose rather than configuration — a fork that isn't selling CookLyt will usually delete these routes outright. The POS application itself carries almost no brand text.

---

## Deployment

`deploy.sh` at the repo root is the production deploy script. It is self-locating, so it works from wherever the repo is checked out:

```bash
./deploy.sh
```

It resets the checkout to `origin/master`, runs migrations, installs production dependencies, restarts the `cooklyt-pos-api` systemd unit, and rebuilds all three frontends.

The API runs as a systemd service (not pm2) under a non-root user. The frontends are built to static assets and served by the web server.

---

## License

Licensed under the **GNU Affero General Public License v3.0**. The full text is in [`LICENSE`](LICENSE).

In short: you may read, self-host, modify, and redistribute this software. If you run a modified version as a network service, AGPL section 13 requires you to offer that version's complete source to its users. There is no exception for hosted or SaaS deployments — that is the specific gap this license closes.

Contributions are accepted under the same license.
