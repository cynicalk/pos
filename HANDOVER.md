# CookLyt — Engineering Handover

A working map of the system for whoever picks it up next: **what each part does,
how it's built, why it's built that way, and where it could be better.** It is
deliberately candid about the weak spots — a handover that only lists strengths
isn't one.

For the canonical *what exists* list see the in-app feature catalogue
(`shared/catalogue.js`, rendered at `/feature-status`); for *what's next* see
[ROADMAP.md](ROADMAP.md); for the deeper design narrative see
[ARCHITECTURE.md](ARCHITECTURE.md). This doc is the tour that ties them together.

---

## 1. The one principle that explains most decisions

> **A number we cannot establish is never shown as zero.**

Every computed figure either resolves to a defensible value or **abstains** —
returns `null` and says what's missing. Food cost with an undeclared ingredient,
per-cover spend before any guest count is captured, operating margin before
labour is logged, a week-over-week change with no prior week: each renders "not
recorded", never a `0` that reads like a fact. This is enforced at the module
layer (pure functions return `null`), carried through the services, and honoured
by the UI (a `null` is a dash or an omission, never `.map`-ed into a crash).

If you internalise one thing before changing code here, make it this. Most of the
subtlety in the codebase is a guard protecting this rule. Breaking it — quoting a
plausible-but-unfounded number — is the one regression that erodes the product's
whole reason to exist.

---

## 2. Architecture at a glance

**Stack.** Node/Express + PostgreSQL + a WebSocket layer for live updates
(backend, `:3000`); React + Vite dashboard (`:5173`); guest-facing surfaces; a
local OpenAI-compatible LLM (LM Studio / Ollama) for the AI features. Migrations
are `node-pg-migrate` (`npm run migrate`).

**Layering.** Each domain is a vertical slice under `backend/src/<domain>/`:

```
router  →  service  →  repository  →  SQL
             │
             └── pure computation lives in backend/src/modules/<domain>/
```

- **Routers** (`*.router.js`) do auth, validation, HTTP shape. Mounted in
  `app.js` under `/api/<domain>`.
- **Services** (`*.service.js`) orchestrate: fetch via repositories, call pure
  modules, apply policy.
- **Repositories** (`*.repository.js`) hold parameterised SQL and nothing else.
- **Pure modules** (`backend/src/modules/…`) are the maths — no DB, no I/O — so
  they're unit-tested directly. This is where the abstention rules live.

**Why this shape.** The pure-module split is the load-bearing decision: it lets
the honesty rules be tested exhaustively without a database, and keeps a single
definition of each metric (e.g. revenue = `SUM(payments.amount) WHERE
status='completed'`, identical across reports, snapshots and the group rollup —
two definitions of revenue is a drift bug that only surfaces months later in a
forecast).

**Testing.** 52 Jest suites / 715 tests. Pure-module tests need no DB;
`*-db.test.js` suites run against `pos_test` (`npm run migrate:test`). Run all
with `npx jest` in `backend/`.

---

## 3. Feature families

The catalogue groups 86 deck-reconciled features into ten families. Below, each
family's built core, the key files, and where it could go next.

### 3.1 Guest Experience (14 — POS core)
**What.** Orders across dine-in / takeaway / delivery, the KDS, tables & floor,
waitlist (with honest ETAs), reservations, menu & 86-ing, loyalty, covers.
**How.** `orders/`, `kitchen/`, `tables/`, `waitlist/`, `reservations/`,
`menu/`, `loyalty/`, `payments/`. Live updates over WebSocket; offline-tolerant
order queueing. Covers captured at billing (migration 090) feed per-cover spend.
**Why.** This is the surface staff live in during service, so latency and
never-lose-a-ticket reliability outrank everything; the analytics ride on top of
it rather than the other way round.
**Better.** Covers are captured on the first order of a session only (documented
limitation) — a true per-session cover count would sharpen APC. The waitlist ETA
abstains widely because seated-duration history is thin; more history closes that.

### 3.2 Forecasting & ML (17)
**What.** Demand forecast, prep sheet, inventory reorder, shift/labour planning,
and **waste prediction** — all on one seasonal-naive engine. Promo days are
detected from coupon redemptions and excluded from the baseline.
**How.** `forecast/`, `prep/`, `modules/forecast/` (e.g. `prep-waste.js` —
per-dish/weekday over-prep in portions and rupees, chronic-over-prepper flag,
abstains below a history floor). Each forecast carries the accuracy it earned.
**Why.** Seasonal-naive over a heavier model because it's explainable, cheap, and
honest about uncertainty — an operator trusts a forecast that shows its error
bar far more than a black box that's occasionally very wrong.
**Better.** The waste forecast predicts *surplus*, never a prep quantity — that
needs shelf-life and stockout-cost data the POS doesn't hold yet; capturing those
unlocks a genuine prep recommendation. Weather correlation is deliberately absent
(no data source). The 3 `blocked-ext` items need infra the product won't run.

### 3.3 Compliance & SOP (17)
**What.** FSSAI licence & expiry, staff certificates, a testing calendar, daily
hygiene & shift sign-offs, adopted SOPs, drift findings.
**How.** `compliance/`, `sops/`. It reports only what CookLyt can see — it never
claims an inspection date or an authority-set schedule it has no visibility of.
**Why.** Compliance data that fabricates a date is worse than none; the whole
value is trustworthiness for an audit.
**Better.** 4 `absent` items remain. WhatsApp reminders for expiring
certificates depend on the (still-stubbed) messaging sender.

### 3.4 Payouts & Finance (10)
**What.** Delivery settlement reconciliation & recoverable-leakage detection,
the economics/unit-economics page, and the **accounting bridge** (a period
exported as balanced Tally XML / journal CSV).
**How.** `payouts/`, `insights/` (`getEconomics` assembles food cost, labour,
prime cost, delivery take, operating margin, APC, service-charge-removed),
`accounting/`. Recoverable leakage becomes a ranked action in the action centre.
**Why.** Margin is the product's headline promise, so this family is where the
abstention discipline matters most — every cost that can't yet be measured is
named as excluded rather than silently dropped.
**Better.** Delivery commission is applied at an *average* platform rate because
orders record `channel='delivery'` but not which platform; per-platform mapping
would tighten it. The 1 `shell`/`partial` await settlement-feed coverage.

### 3.5 Menu Intelligence (4, all built)
**What.** Menu insights, cross-sell, new-item performance, and **category attach
rate** (items/order by category vs the prior window, high-margin flagged — "the
0.1 metric").
**How.** `insights/`, `modules/menu/attach-rate.js`.
**Better.** Attach rate is per-order until covers are fully captured; migrating
it to per-cover is the natural next step. A true menu-engineering quadrant
(star/dog/puzzle/plowhorse) is a small addition on top of attach + margin.

### 3.6 Reviews & Reputation (4)
**What.** First-party guest reviews classified into complaint themes (worst-first),
positive/neutral/negative split, an **AI review analysis** (narrated sentiment +
what-to-do), and manually-entered search rankings & competitor ratings.
**How.** `reviews/`, `reputation/`. The analyser (`reputation.service.getReviewAnalysis`
+ pure `modules/reputation/analysis.js`) narrates the same summary the Insights tab
computes; recurring themes are raised as tracked actions by the `review_theme` rule
in the engine, so the narration and the action centre read the same reviews.
**Why/limits.** Reviews are **first-party only** — CookLyt cannot read Swiggy /
Zomato / Google, and says so rather than implying full coverage. Rankings are as
current as the operator's last manual reading.
**Better.** The `partial` item is external-platform ingestion, which needs
integrations the product doesn't currently run.

### 3.7 Winback & Retention (3)
**What.** QR winback offers — a lapsed guest gets a single-use real coupon (sized
by churn severity, minimum order anchored to their own average spend).
**How.** `winback/`, `coupons/`.
**Better.** The 1 `absent`/`partial` is automated multi-touch winback over
WhatsApp, gated on the messaging sender.

### 3.8 Competitor Intel (6)
**What.** Mostly `shell` — honest empty screens on real routes awaiting a data
source CookLyt doesn't yet have; 2 built (manually-entered rankings).
**Better.** This family is the clearest "needs an external feed" cluster; until
one exists, the shells correctly show nothing rather than fake competitor data.

### 3.9 WhatsApp & AI (9) — *the distinctive layer, see §4*
**What.** The AI assistant, the **Daily Brief**, the **Weekly Review**, the
message outbox, and the (still-stubbed) WhatsApp sender.
**Status.** 3 built, 3 partial, 3 absent — the partials/absents almost all wait
on one thing: a real WhatsApp Business API sender worker. The outbox already
records intended messages with honest `queued`/`skipped`/`sent`/`failed` states,
so wiring a sender is additive, not a rework.

### 3.10 Platform & Data (2)
Snapshots/anomaly detection and the shared data layer that everything above
reads. `snapshots/` writes a per-day revenue/orders/items row (same revenue
definition as reports); `modules/analytics/anomaly.js` does median+MAD anomaly
detection (robust to spiky restaurant days) and **excludes today** from
judgement (a half-over day isn't a catastrophic drop).

---

## 4. The AI layer (deep dive)

This is the newest and most differentiated part, and the one most worth
understanding before extending.

### 4.1 The LLM client — `backend/src/ai/llm.client.js`
OpenAI-compatible chat-completions, so the provider is just config (`LLM_BASE_URL`,
`LLM_MODEL`). Local by default (LM Studio at `127.0.0.1:1234`, `qwen2.5-7b-instruct`).
Key exports: `chat()`, `chatStream()` (SSE), `reachable()` (fast liveness probe),
`healthCheck()`.

> **Known trap:** `postCompletions` loops `for (attempt = 1; attempt <= retries)`,
> so **`retries: 0` never fires a request** and throws immediately. Always pass
> `retries: >= 1`. (`warmup()` passes `retries: 0` and is therefore a silent
> no-op — a latent bug worth fixing.)

### 4.2 The assistant — `backend/src/ai/ai.service.js`, `ai.router.js`
A tool-using chat assistant. `TOOLS` (OpenAI function format) + a `READ_TOOLS`
map + `ADMIN_ONLY_TOOLS`; write actions require an explicit confirm turn. The read
tools (`get_unit_economics`, `get_coupon_economics`, `get_category_attach`,
`get_peak_hours`, waste/stock/compliance/reputation, …) each read the *same*
figures the Insights pages show, so the assistant inherits their abstention — it
narrates a real number or says it can't. Chat is SSE-streamed and requires a
UUID `sessionId` (the column is `uuid`; a non-UUID id throws at the DB).

### 4.3 The Daily Brief — `backend/src/ai/brief.service.js` (+ `brief.repository.js`)
The template for the whole "narrate deterministic signals" pattern:

1. **`gatherSignals`** reads yesterday vs normal (via the anomaly detector), the
   top ranked open action and its rupee amount, food cost / operating margin /
   per cover, the week's waste + top reason, the peak hour, and a coupon flag —
   each source wrapped so one failure degrades to `null`, never fails the brief.
2. **`narrateOrFallback`** (shared with the weekly review) calls the model under
   a strict *"use ONLY these figures; null means not recorded; invent nothing"*
   prompt, capped at ~180 tokens / 18s so a slow cold model falls back fast.
3. **`fallbackNarrative`** is an honest templated brief for when the model is
   offline — same facts, plainer words.

Returns `{ date, generatedAt, signals, narrative, model, aiUsed }` from
`GET /api/ai/brief` (gated by the per-restaurant AI switch). Surfaced as the
formatted card at the top of the Overview.

### 4.4 The Weekly Review — `backend/src/ai/weekly-review.service.js`
The brief one horizon up: last seven closed days vs the seven before them
(week-over-week revenue, best/worst day, food cost, per-cover, waste, biggest
attach mover, top action). Reuses `narrateOrFallback`. `GET /api/ai/weekly-review`,
lazy-loaded behind the *Yesterday / This week* toggle on the Overview brief card.

### 4.6 The Review Analyser — `reputation.service.getReviewAnalysis`
The reputation-digest instance of the pattern, and the first that also **raises
actions**: `modules/reputation/analysis.js` builds the strict prompt + templated
fallback over the `summarizeReviews` / `buildActionQueue` output, and the
`review_theme` rule in `modules/rules/engine.js` turns each recurring complaint
into a tracked, ranked action (over `REVIEW_THEME_WINDOW` reviews, a wider lens
than `rating_drop`'s tight `RATING_WINDOW`). Surfaced as a card on Reviews →
Insights. The template to copy for the next "analyse + recommend + act" feature.

### 4.7 Extending the pattern
The recipe is reusable: **deterministic signals gatherer → `narrateOrFallback`
(now in `ai/narrate.js`) → honest templated fallback**, and, where a threshold is
crossed, a **rule → tracked action**. Natural next builds on the same rails (see
ROADMAP): an **Evening Wrap** (end-of-shift close), an **AI-narrated Action
Centre** (plain-language "why this matters" per finding), a **Group Brief** (the
daily brief at multi-outlet level), and **Menu engineering** (the star / plowhorse
/ puzzle / dog quadrant from item sales × margin, each quadrant with its action).
Each is a new signals gatherer plus a prompt; the narration/fallback and
rule→action machinery already exist. Recent instances: the **Evening Wrap**
(`ai/evening-wrap.service.js`, the close-out read on the Shift screen with the
cash-reconciliation signal no brief carries) and the **AI-narrated Action Centre**
(`actions.service.getActionBrief` + pure `modules/rules/action-brief.js`, which
narrates the ranked findings into a sequenced plan without re-ordering them). Menu
engineering already ships as `modules/menu/performance.js`. The big remaining item
is the **WhatsApp sender worker** — it needs real Business-API infra, and the
outbox already models delivery honestly, so it's additive.

### 4.6 Where the AI layer can be better
- **Client timeout vs cold model.** First narration on a cold 7B can take
  15–18s; the client allows 20s. A background warmup (once the `retries:0` bug is
  fixed) or a persisted last-good narrative would make first paint instant.
- **No caching.** Every brief request recomputes and re-narrates. A short
  per-restaurant cache (the signals are stable within a morning) would cut load.
- **Embeddings now in use.** The `text-embedding-nomic-embed-*` model powers
  **semantic review search** (`ai/embeddings.client.js`, `modules/reputation/semantic.js`,
  vectors in `review_embeddings`, cosine ranked in JS since pgvector isn't installed).
  The same index could extend to menu/SOP semantic search next.
- **Narration quality is model-bound.** A local 7B occasionally over-compresses
  or lightly editorialises; the deterministic fallback is always exact, so the
  worst case is safe, but a larger model sharpens the prose.

---

## 5. Cross-cutting concerns

**Feature toggles.** Per-restaurant `feature_flags` setting (JSON of only the
*off* entries; empty = all on), keyed by nav paths. Enforced on both sides:
client (`dashboard/src/lib/features.js` — nav filter + route gate) and server
(`backend/src/shared/middleware/featureGate.js` — `403 feature_disabled`, with
shared routers split by sub-path). `PROTECTED_KEYS` stop an admin locking
themselves out. Admin screen at `/feature-toggles`.

**The catalogue is generated.** `shared/catalogue.js` is built by
`scripts/build-catalogue.mjs` from an in-file source-of-truth map; never hand-edit
the generated file. `dashboard/scripts/check-catalogue.mjs` guards the status
counts (`EXPECTED_BY_STATUS`) — bump it when you flip a feature's status.

**Demo data.** `seed.js` writes a fortnight; `scripts/backfill-history.js` writes
the 90 days behind it. Note the demo dataset can lag the real clock — "yesterday"
may legitimately show *no trade* if the seed ends before it (the brief correctly
says so rather than printing a zero).

**Commit discipline (resume repo).** No Claude co-author trailer. Secrets stay
out of git (`.env` ignored; only `.env.example` tracked). `*.md` is gitignored
except the whitelist in `.gitignore` (READMEs, CONTRIBUTING, ARCHITECTURE,
ROADMAP, CHANGELOG, and this HANDOVER).

---

## 6. Highest-leverage next steps

1. **Ship the WhatsApp sender worker.** It unblocks the largest cluster of
   partial/absent features at once (smart alerts, per-employee entry, winback
   automation, compliance reminders) — the outbox already models delivery
   honestly, so this is additive.
2. **Fix `llm.warmup()`** (the `retries:0` no-op) and warm the model on boot, then
   cache the brief/review per morning — instant first paint.
3. **Move attach rate and the "0.1 metric" to per-cover** once cover capture is
   session-complete; sharpens the single most-repeated margin metric.
4. **Per-platform delivery commission** instead of the average rate — the biggest
   remaining source of softness in operating margin.
5. **Build the next narrated surface** (Evening Wrap or narrated Action Centre) on
   the brief/review rails — high perceived value, low marginal cost.
6. **Use the embedding model** already being served — semantic menu/review search.

---

*Keep this doc honest. If you add a feature, add its family note here; if you find
a figure that lies, that's the bug — fix the figure, not the doc.*
