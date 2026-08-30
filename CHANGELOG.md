# Changelog

All notable changes to CookLyt POS. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the feature catalogue
(`shared/catalogue.js`, in-app at `/feature-status`) remains the source of truth
for *what exists*, and [ROADMAP.md](ROADMAP.md) for *what's next*.

## [Unreleased]

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
