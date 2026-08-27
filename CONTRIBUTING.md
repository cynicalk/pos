# Contributing

Thanks for helping improve CookLyt POS. This is a small project — keep changes
focused and the history clean.

## Project layout

| Package | What | Dev port |
|---|---|---|
| `dashboard/` | POS web app (React + Vite + Tailwind); also serves the public landing page | 5173 |
| `admin/` | Super-admin panel | 5174 |
| `menu/` | Customer QR-menu ordering app | — |
| `backend/` | Express API + PostgreSQL 17 + WebSocket | 3000 |
| `shared/` | Cross-cutting code (e.g. `roles.js`) | — |

## Local setup

Requires **Node 22+** and **Docker** (for PostgreSQL 17).

```bash
# 1. install each package
(cd backend && npm install)
(cd dashboard && npm install)
(cd admin && npm install)
(cd menu && npm install)

# 2. start dev + test Postgres (dev :5434, test :5433)
cd backend && docker compose up -d

# 3. migrate + seed the dev DB, then run the API
npm run migrate
npm run seed
npm run dev                 # API on :3000

# 4. frontends (separate terminals)
cd ../dashboard && npm run dev   # :5173
```

Copy each `.env.example` to `.env` and fill in the values before running.

## Tests

```bash
cd backend && npm test      # runs against the test DB on :5433
```

## Branches & PRs

- Branch off `main`: `feature/…`, `fix/…`, or `chore/…`.
- Keep PRs **small and single-purpose** — one concern per PR.
- Link the issue in the PR body (`Closes #12`).
- PRs are **squash-merged** into `main` to keep history linear and clean.
- Make sure tests pass before requesting review.