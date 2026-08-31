# Changelog

All notable changes to CookLyt POS. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the feature catalogue
(`shared/catalogue.js`, in-app at `/feature-status`) remains the source of truth
for *what exists*, and [ROADMAP.md](ROADMAP.md) for *what's next*.

## [Unreleased]

### 2026-08-31

#### Added
- **AI-narrated Action Centre** — a "Your plan" card on `/actions` that turns the
  ranked list of findings into a plain-language plan: what to tackle first and why,
  the next one or two in the same order, and the rupees at stake across only the
  actions that carry a figure ("at least ₹X", never the whole list). It narrates
  the actions exactly as the opportunity ranking ordered them — it never re-ranks,
  invents a finding, or puts a number on an unquantified one — with an honest
  templated plan when the model is offline (`GET /api/actions/brief`).
- **AI Evening Wrap** — the Daily Brief's bookend, on the Shift close-out screen:
  how today traded against the target, and the one signal no brief carries — the
  **cash reconciliation** (what the drawer should hold since the last count, and,
  only if a count was actually taken today, whether it came up over or short) —
  plus today's waste and a nudge for tomorrow's likely over-prep. Same rails as
  the brief (`GET /api/ai/evening-wrap`, shared narrate-or-fallback, honest
  template offline); it never states a cash variance for a count that didn't
  happen, and abstains on any missing figure.
- **AI Review Analyser** — a narrated sentiment read and *what-to-do* on the
  Reviews → Insights tab, tied into the action centre. It narrates the same
  deterministic summary the page already shows (sentiment split, recurring
  complaint themes with their negative counts and per-theme remedy), under a
  strict *"use only these figures, invent no complaint, first-party only"*
  prompt, with an honest templated analysis when the model is offline
  (`GET /api/reputation/analysis`). Separately, a new **`review_theme` rule**
  raises each recurring complaint pattern as a tracked, ranked action — hygiene
  always high, otherwise by the theme's negative share — carrying the deterministic
  remedy as the action, over a wider review window than the rolling average uses.
  The narration and the action centre read the same reviews, so they can never
  point at different complaints. The brief/review narration helper was extracted
  to `ai/narrate.js` and is now shared by all three surfaces.
- **AI Weekly Review** — the Daily Brief's sibling, one horizon up. The Overview
  brief card now carries a *Yesterday / This week* toggle; the weekly read
  (`GET /api/ai/weekly-review`, lazy-loaded on demand) narrates the last seven
  closed days against the seven before them: week-over-week revenue trend, best
  and worst trading day, food cost, per-cover spend, waste, the biggest attach
  mover, and the top open action. Same architecture as the brief — deterministic
  signals from the reports/insights services, a shared narration-or-fallback
  layer, and the same abstention (a missing prior week yields a null change, not
  a fabricated one).
- **AI Daily Brief** (catalogue: absent → built). The morning moment on the
  Overview: a deterministic signals gatherer reads yesterday versus normal (via
  the anomaly detector), the top ranked open action with its rupee amount,
  food-cost % and operating margin, the week's waste and its top reason, and the
  peak trading hour — all from the same services the Insights/Actions pages use,
  so the brief can never disagree with them. The local model then narrates ONLY
  those figures ("invent nothing; null means not recorded"); an honest templated
  fallback says the same thing when the model is offline. Every figure abstains
  rather than guessing, and a day with no trade is stated as such, never a zero.
  New `GET /api/ai/brief`, gated by the per-restaurant AI switch. WhatsApp push
  still awaits the sender worker.
- **AI assistant reaches the analytics.** Four new grounded read-tools let the
  local-LLM assistant answer the operator-margin questions it previously couldn't:
  `get_unit_economics` (revenue, average per cover, food-cost %, prime cost,
  operating margin, service-charge-removed), `get_coupon_economics` (net kept per
  code — Numerize's headline question), `get_category_attach` (the 0.1 attach
  metric), and `get_peak_hours`. Each reads the same figures the Insights pages
  show and inherits their abstention, so the assistant narrates real numbers or
  says it can't — never invents one.

#### Changed
- **Landing pages — colourful, interactive redesign.** A scoped terracotta +
  forest-green palette on the warm ground (the POS tokens are untouched): hero
  wash and entrance animation, gradient accent buttons, gradient stat numerals,
  hover-lift section cards, and scroll-reveal (respecting reduced-motion). The
  shared nav/footer/CTA and section labels carry the accent, so every subpage
  inherits the new chrome.

### 2026-08-30

#### Added
- **Operator intelligence — Wave 1** (from the per-cover margin research). Two
  new Insights, no migration: **coupon contribution** on the Economics page ranks
  each code by net revenue kept per order after the discount given and, for
  delivery redemptions, the platform's cut (`GET /api/insights/coupon-economics`);
  and **category attach rate** on Menu Insights — items sold per order by
  category with the change vs the prior window, high-margin categories flagged
  (`GET /api/insights/attach`). The "0.1 metric," per order until covers land.
  Both keep the abstention discipline and are gated by the existing feature
  toggles.
- **Operator intelligence — Wave 2.** The group view now carries two per-outlet
  metrics: **same-store sales growth** (this window vs the prior equal window,
  abstaining where there's no prior trade to grow from) and **sales per labour
  hour** (revenue ÷ completed shift hours, abstaining where no roster is logged).
  Both average across only the outlets that could report, and appear as totals
  tiles and columns on the Group page.
- **Operator intelligence — Wave 4.** The Wave 1–3 findings now raise ranked
  actions and route through the message outbox. Three deterministic rules:
  **coupon_loss** (a code giving away ≥40% on real volume, priced by the discount
  actually given), **attach_drop** (a high-margin category's per-order attach
  falling ≥0.03 vs the prior window), and **sc_removal_high** (a server removing
  the service charge on ≥25% of their bills). Every raised action is also enqueued
  to the outbox as an `operator_alert` — queued to the operator's `alert_whatsapp`
  number (a new setting) or skipped honestly when none is set, pending the
  WhatsApp channel worker. Delivery stays truthful: nothing is pretend-sent.
- **Operator intelligence — Wave 3** (the two billing capture points; migration
  090). An optional **guest count** at billing unlocks **average per cover** on
  the Economics page (with the share of bills that carried a count); and a
  persisted **service-charge-removed** flag turns the existing "waive" control
  into a measured leak — the removed rate, an estimate of the rupees foregone,
  and a breakdown by server. Both abstain until the flow has captured a guest
  count / a service charge to remove.
- **Waste Prediction** (catalogue: shell → built), in two phases. Phase 1 captures
  how much of each dish is prepped — a pre-service plan nudged from the forecast and
  a post-service actual (`prep_logs`, migration 089) — and reconciles it against
  what sold and what was binned, so over-prep is measured per dish, not guessed.
  Phase 2 projects the per-dish/weekday over-prep pattern onto the next service:
  likely surplus in portions and rupees, chronic over-preppers flagged, abstaining
  per dish below a history floor. It forecasts the surplus, never a prep quantity
  (that needs shelf-life + stockout-cost data the POS doesn't hold). On one page at
  `/forecast/waste`; new `GET /api/prep/forecast`.
- **Admin Feature Toggles** (`/feature-toggles`) — switch whole modules of the app
  on or off per restaurant. A switched-off feature is hidden from the sidebar and
  its client routes are gated (a typed URL lands on an honest "turned off" panel).
  Flags are one `feature_flags` setting (JSON of only the OFF entries; empty = all
  on), keyed by the same nav paths the sidebar renders; core POS and admin screens
  are protected so an admin can't lock themselves out.
- **Feature-toggle server-side enforcement** — a `featureGate` middleware returns
  `403 feature_disabled` on a direct API call to a switched-off feature, reading the
  flag from the caller's token claim and a short per-restaurant cache that a toggle
  write busts at once. Shared routers are split by sub-path (Guests vs Rankings,
  Variance vs Reports, Economics vs Menu Insights, Playbook vs Compliance,
  Nutrition vs Menu Card). Features with no dedicated route (Costing, Order History,
  Market-Intel shells, Tally) stay client-side, documented in `feature-routes.js`.
- **Promo-aware forecasting** — promo days are detected from coupon redemptions and
  excluded from the demand baseline exactly as closed days are, with which days and
  why reported. No uplift is predicted. Live at `/forecast/promo`.
- **Message Outbox** — waitlist notifications and winback offers record intended
  guest messages in a persisted outbox with honest `queued` / `skipped` / `failed` /
  `sent` states, plus loyalty-customer WhatsApp consent capture and an admin screen
  at `/outbox`. Queue groundwork; no WhatsApp sender worker yet.
- **AI offline notice** — screens backed by the local AI show a clear notice when it
  is unreachable, rather than failing silently.

#### Changed
- Extracted shared dashboard page primitives (`lib/ui.js`) and adopted them across
  the session's new pages.
- Added DB tests for the accounting export and the message outbox.

### 2026-08-28

#### Added
- **AI Nutrition Assistant** (shell → built) — per-serving calories and macros
  exploded from each dish's recipe through per-ingredient nutrition (migration 085),
  the same arithmetic the prep sheet does for cost. A dish with any undeclared
  ingredient reports nothing rather than a number nearly right; coverage is stated
  as a share of costed dishes; the guest app's dish detail now reads these figures.
- **QR Winback Offers** (absent → built) — the Guests churn table issues a
  single-use discount to a lapsed guest, printable as a QR. The discount is a real
  coupon (redeems at the till, status read back), sized by churn severity with the
  minimum order anchored to the guest's own average spend.
- **POS Accounting Bridge** (partial → built) — a period's takings exported as
  balanced double-entry vouchers (Tally-importable XML or a journal CSV), produced
  server-side with no credentials. Every voucher balances by construction; where the
  discount plug disagrees with the POS's own total, the gap is shown.

#### Fixed
- Accounting export now uses the restaurant's own timezone rather than a hardcoded
  IST, so period boundaries are correct for any outlet.
- The winback offer card reuses the shared `Modal`, fixing its off-centre position
  inside a transformed layout ancestor.
