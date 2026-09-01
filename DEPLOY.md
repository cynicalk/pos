# Deploying CookLyt — Vercel + Supabase

This runbook deploys CookLyt to **Supabase** (Postgres) and **Vercel** (the API and
all four frontends). It's the step-by-step you run with *your own* Supabase and
Vercel logins — the scaffolding (serverless entry, `vercel.json`s, env-driven DB
SSL/pooling) is already in the repo.

> **One architecture caveat, up front.** The backend runs a persistent **WebSocket**
> server (`backend/src/server.js`) for instant KDS/order push. Vercel serverless
> functions can't hold a socket open, so on Vercel the API runs *without* WebSocket
> (`backend/api/index.js` imports the Express app alone; every `ws.broadcast` already
> no-ops when the socket server isn't initialised). **Live screens fall back to the
> dashboard's existing 30-second auto-refresh** — correct, just not instant.
> If you want real-time push, host the backend on a **persistent runtime** instead
> (Railway / Render / Fly, `npm start` → `server.js`) with Postgres still on Supabase;
> the frontends only need the API origin, they don't care where it runs. See the last
> section.

---

## 0. Prerequisites

```bash
npm i -g vercel            # Vercel CLI
# A Supabase account (supabase.com) and a Vercel account (vercel.com).
```

Generate a strong JWT secret once and keep it:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## 1. Supabase — the database

1. **Create a project** at supabase.com → note the project ref and DB password.
2. **Get BOTH connection strings.** In *Project → Settings → Database → Connection string*:
   - **Session pooler** (port **5432**) — for migrations and seeding. DDL runs in
     transactions and needs a real session, which the transaction pooler can't give.
   - **Transaction pooler** (port **6543**) — for the serverless runtime (step 2),
     where many short-lived functions each want a connection.
   ```
   session:     postgres://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres
   transaction: postgres://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```
3. **Run migrations + seed** from your machine, using the **session (5432)** URI:
   ```bash
   cd backend
   export DATABASE_URL="postgres://postgres.<ref>:<pwd>@...pooler.supabase.com:5432/postgres"
   export PGSSL=require
   npm run migrate:deploy             # uses the ambient DATABASE_URL (the plain
                                      # `migrate` script is hardcoded to local Docker).
                                      # Only gen_random_uuid() is used — no extensions to enable.
   npm run seed:deploy                # demo menu, users, a fortnight of trade
   node scripts/backfill-history.js   # 90 days behind the seed (optional, richer demo)
   node scripts/backfill-guest-events.js  # reco funnel demo data (optional)
   ```
   `PGSSL=require` (or a `supabase.co` host) turns on TLS automatically — see
   `backend/src/shared/db.js`.

---

## 2. Backend API — Vercel

The serverless entry (`backend/api/index.js`) and `backend/vercel.json` are in place.

```bash
cd backend
vercel link          # create/link a Vercel project, e.g. "cooklyt-api"
```

Set env vars (Vercel dashboard → Project → Settings → Environment Variables, or `vercel env add`):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the Supabase **transaction pooler** URI (port **6543**) — the runtime one |
| `PGSSL` | `require` |
| `PGPOOL_MAX` | `1` (serverless: one connection per instance against the transaction pooler) |
| `JWT_SECRET` | the secret you generated |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | the frontend URLs once known (comma-separated) — see step 5 |
| `LLM_BASE_URL` | your hosted LLM endpoint, or leave unset to run fallback-only |

Deploy:

```bash
vercel --prod
```

Note the resulting API URL, e.g. `https://cooklyt-api.vercel.app`.

> **Function duration + the LLM.** `backend/vercel.json` sets `maxDuration: 30`,
> which needs a **Pro** plan; on **Hobby** the cap is 10s — lower it to `10` there.
> If you set `LLM_BASE_URL` (hosted model), keep `LLM_TIMEOUT_MS` **below** that cap
> so a slow model returns the honest fallback instead of the function timing out.
> Leaving `LLM_BASE_URL` unset runs every narrated surface on its fallback, which
> is fast and safe.

> **Health check:** `curl https://cooklyt-api.vercel.app/health` → `{"status":"ok"}`.

---

## 3. Point the frontends at the API

The three Vite apps call `/api` on their own origin; each `vercel.json` proxies
`/api/*` to the backend (this keeps the browser **same-origin**, so the httpOnly
`SameSite=strict` JWT cookie still works — a plain cross-origin call would drop it).

In **`dashboard/vercel.json`, `admin/vercel.json`, `menu/vercel.json`**, replace
`REPLACE-WITH-BACKEND.vercel.app` with your real API host from step 2.

---

## 4. Frontends — Vercel (one project each)

Each is a separate Vercel project rooted at its folder.

```bash
# Dashboard (operator)
cd dashboard && vercel link && vercel --prod
# Admin
cd ../admin && vercel link && vercel --prod
# Menu
cd ../menu && vercel link && vercel --prod
```

**Guest app (Next.js)** — native on Vercel, talks to the API cross-origin (it's a
public surface with no cookie, and `/api/guest` sends `CORS origin:*`), so it needs
env vars, not a rewrite:

```bash
cd ../guest-app && vercel link
vercel env add NEXT_PUBLIC_COOKLYT_API     # → https://cooklyt-api.vercel.app
vercel env add NEXT_PUBLIC_COOKLYT_OUTLET  # → the restaurant UUID (from the seeded DB)
vercel --prod
```

Get the outlet UUID after seeding:
```bash
psql "$DATABASE_URL" -c "select id from restaurants where name='Demo Restaurant';"
```

---

## 5. Close the loop (CORS + verify)

1. Set the backend's **`CORS_ORIGINS`** env to the deployed frontend origins
   (dashboard/admin/menu/guest URLs, comma-separated), then redeploy the API
   (`cd backend && vercel --prod`).
2. Open the dashboard URL → log in with **`admin@demo.com` / `admin123`**.
3. Open the guest app URL → the Demo Restaurant flow should load its menu.

---

## Alternative: keep real-time (persistent backend)

If instant KDS push matters, deploy the backend to a persistent host instead of
Vercel serverless — everything else (Supabase, the four frontends) is unchanged.
Two ready-made configs are in the repo:

- **Render** — `render.yaml` (repo root) is a blueprint: New → Blueprint → pick the
  repo, then set the `sync:false` secrets (`DATABASE_URL`, `JWT_SECRET`,
  `CORS_ORIGINS`, `LLM_*`) in the dashboard. It runs `npm run migrate:deploy && npm start`
  (Express **+ WebSocket**) and health-checks `/health`.
- **Railway** — `backend/railway.json` sets the same start command and health check;
  `railway up` from `backend/`, then add the env vars in the Railway dashboard.
- Either way use a larger `PGPOOL_MAX` (e.g. `10`) against Supabase's **session**
  pooler (port **5432**), since it's one long-lived process, not many serverless ones.
- Point the frontends' `/api` rewrite (and the guest app's `NEXT_PUBLIC_COOKLYT_API`)
  at that host's URL instead of the Vercel API URL.
- Optionally set `REDIS_URL` to fan WebSocket broadcasts across multiple instances
  (`shared/websocket.js` already supports it).

---

## Files this repo already carries for deploy

- `backend/api/index.js` — Vercel serverless entry (Express app, no WebSocket)
- `backend/vercel.json` — routes all requests to the function
- `backend/src/shared/db.js` — env-driven SSL (`PGSSL`) + pool size (`PGPOOL_MAX`)
- `backend` scripts `migrate:deploy` / `seed:deploy` — honour the ambient
  `DATABASE_URL` (the plain `migrate`/`seed` are pinned to local Docker)
- `dashboard|admin|menu/vercel.json` — `/api` proxy + SPA fallback
- `render.yaml` / `backend/railway.json` — persistent-host configs (the real-time path)
- `.env.example` in each app — the variables each needs
