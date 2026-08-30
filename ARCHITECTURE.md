# Architecture

CookLyt is a restaurant management platform built as a monorepo: an
operations dashboard, a super-admin panel, a customer QR-menu ordering app,
and a Node.js/Express + PostgreSQL backend that ties them together with
real-time updates over WebSocket.

This document describes how the system is put together and the principles that
shaped it.

---

## The pieces

| App          | Stack                    | Port | Purpose                                              |
| ------------ | ------------------------ | ---- | ---------------------------------------------------- |
| `backend/`   | Express, PostgreSQL, `ws`| 3000 | REST API, WebSocket hub, scheduled jobs              |
| `dashboard/` | React, Vite              | 5173 | Operator app — also serves the public landing pages  |
| `admin/`     | React, Vite              | 5174 | Super-admin: tenant management across restaurants    |
| `menu/`      | React, Vite              | 5175 | Public QR-menu ordering for dine-in guests           |
| `guest-app/` | Next.js                  | 3001 | Reservation-first guest dine-in app — group recommender, shared table, order, pay, feedback; talks to the backend's `/api/guest` adapter |
| `shared/`    | Plain ES modules         | —    | Code the apps agree on: money formatting, timezone helpers, the feature catalogue |

A single PostgreSQL database backs the whole system, multi-tenant by
`restaurant_id`, with an `organizations` layer above it for multi-outlet
groups.

---

## Backend layering

Every request travels the same four layers, and each layer has exactly one job:

```
Router  →  Service  →  Repository  →  SQL
```

- **Router** authenticates, authorises, and translates HTTP. It contains no
  business logic — it reads `req`, calls one service method, and writes `res`.
- **Service** owns decisions: what a rule means, when to abstain, which model
  to call. It never writes SQL directly.
- **Repository** owns every query. All SQL lives here, one method per read or
  write, so the data-access story is in one place and mockable.
- **SQL** is parameterised throughout; transactions go through a
  `withTransaction` helper rather than hand-rolled `BEGIN`/`COMMIT`.

### Pure computation is separated from I/O

`backend/src/modules/` holds pure functions only — no database import, no
network. Anything that can be expressed as *inputs → output* lives here:
forecasting maths, settlement reconciliation, prep reconciliation and over-prep
prediction, review classification, the rules engine. Two consequences follow:

1. **It is testable without a database.** The bulk of the test suite exercises
   these modules directly, in milliseconds, with hand-built inputs.
2. **Every threshold is one search away.** A business constant — the cancellation
   rate that raises an alert, the minimum history a forecast needs — is a named
   export in a pure module, not buried in a query.

The services wire these pure modules to repositories; the modules never reach
back.

---

## Real-time

The backend runs a WebSocket hub alongside the HTTP server. Clients authenticate
the upgrade with the same HttpOnly cookie the REST API uses, and the server
pushes order, table, and kitchen state to the operator dashboard as it changes —
so the floor view, the kitchen queue, and the live-ops rail update without
polling.

---

## Feature toggles

An admin can switch whole modules of the app off for their restaurant. The state
is one `feature_flags` setting — a JSON object that stores only the *off* entries,
so the default (and anything not listed) is on, and "enable everything" is the
empty object. The keys are the nav paths themselves, which matters: the toggle
list is *derived* from the same `ALL_NAV` the sidebar renders, so it cannot drift
from the menu the operator actually sees.

Enforcement is deliberately in two places, because each alone is insufficient:

- **Client** — the sidebar filters switched-off entries out, and the router gates
  their pages, so a disabled feature disappears from the UI and a typed URL lands
  on an honest "turned off" panel rather than a blank screen.
- **Server** — a `featureGate` middleware maps each toggle key to the backend
  route(s) that serve it and returns `403 feature_disabled` on a direct call, so a
  curl or a stale tab can't sail past a toggle. Routers shared by two features are
  split by sub-path (longest prefix wins), so switching one off never switches off
  the other. It reads the flag from the caller's own token claim and a short
  per-restaurant cache that a toggle write busts at once.

Two safety rules hold the mechanism together: the core POS flow and the admin
screens needed to switch things back on are **protected** — they carry no switch
and the filter forces them on, so an admin cannot lock out the till or themselves;
and a handful of features whose data has no dedicated route (Costing reads
Inventory and Recipes; Order History reads Orders) stay client-side only, a
boundary documented in `feature-routes.js` rather than half-enforced.

---

## Data and migrations

- **PostgreSQL**, accessed through `node-pg-migrate` for schema changes.
  Migrations are sequential and never edited once applied.
- **Snapshots.** A nightly job rolls each trading day into a `daily_snapshots`
  row — revenue, orders, per-item counts — using the *same* revenue definition
  the live reports use, so historical analysis and the daily report can never
  disagree. This is the substrate the forecasting layer reads.
- **Timezone correctness is explicit.** A restaurant's trading day is a *local*
  day. Timestamps are built from local wall-clock time through a shared helper
  (`shared/timezone.js`) rather than assembled in UTC, which keeps a late-evening
  order on the correct calendar date. The helper is covered by tests, including
  a daylight-saving boundary.

---

## The design principle that runs through everything

> **A number we cannot establish is not zero, and "we don't know" is a valid
> answer that has to survive all the way to the screen.**

This is the distinctive idea in the codebase, and it is enforced with tests
rather than left to convention:

- An action nobody can price carries `amount: null`, never `0` — because `0`
  sorts as "nothing at stake" rather than "we cannot say."
- Prime cost is withheld when labour data is missing, rather than reported as if
  it were complete; food-cost percentages ship with the share of the menu they
  actually cover.
- Guest repeat-rate ships with its own coverage — what fraction of orders could
  be attributed to a known guest at all.
- Settlement reconciliation **abstains** when it lacks a contracted rate to check
  against, instead of guessing and reporting a false discrepancy.
- Features that cannot yet produce an honest answer render a real, navigable
  screen that states plainly why it is empty — never a mocked-up dashboard of
  plausible-looking numbers.

The last point has infrastructure behind it: a feature catalogue
(`shared/catalogue.js`) records every planned capability and its true status,
and a build-time guard fails if a screen claims data it does not have.

---

## Working with models

The system integrates a local LLM (OpenAI-compatible; runs against LM Studio or
Ollama) for review classification and narrative summaries. Two rules bound it:

1. **The maths decides; the model may only narrate it.** No rule, threshold,
   score, or currency figure originates from a model. Anything a model writes
   that a person might act on is constrained by an explicit prohibition list,
   and a test asserts those prohibitions stay in the prompt.
2. **A model never sits on a request path a person is waiting behind.** Model
   work runs in a scheduler or behind an explicit button, with a deterministic
   fallback and a timeout that sits under the client's own — because a reachable
   endpoint is not the same as one that will answer in time.

---

## Forecasting

Demand forecasting and the prep sheet it produces are built as a hierarchy:

```
outlet-total forecast  →  per-dish share  →  ingredient quantities
```

The current model is a seasonal-naive baseline (weekday × recent level). It is
deliberately labelled as the baseline everywhere it appears, and it declines to
answer rather than guess: it refuses below a minimum history, excludes closed
days from the level (and past promotion days, so a discount spike doesn't inflate
a normal weekday), derives its uncertainty band from its own backtested errors
rather than a parametric assumption, and routes intermittent dishes out of the
prep sheet instead of averaging a dish that sells three on a Saturday down to
"half a portion a day."

**Waste prediction** is the same discipline turned toward what was *made*. The
one number the waste picture always lacked — how much of each dish was prepped —
is captured at two points (a pre-service plan, a post-service actual) and
reconciled against what sold, so over-prep is measured per dish, not guessed.
Once enough history accrues, the per-dish/weekday over-prep pattern is projected
onto the next service, abstaining per dish below a history floor. It forecasts the
likely *surplus* and flags chronic over-preppers; it never prescribes a prep
quantity, because choosing one weighs the cost of running out against the cost of
binning — shelf-life and stockout-cost data the POS does not hold.

---

## Testing

The suite favours the pure modules, where behaviour is pinned without a
database, and adds integration tests against a dedicated test database for the
repository and service layers. The tests pin *decisions* — when a computation
refuses to answer, when it abstains, when it excludes an input — more than they
pin arithmetic, because the arithmetic is the easy part.

---

## Local setup

Each app reads its own `.env` (templates are committed as `.env.example`).
`CONTRIBUTING.md` has the full setup, ports, and database bootstrap.

```bash
# backend
cd backend && npm install && npm run migrate && node seed.js && npm run dev

# dashboard (in a second terminal)
cd dashboard && npm install && npm run dev
```
