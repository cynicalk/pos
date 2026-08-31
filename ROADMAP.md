# CookLyt Roadmap

The single roadmap for CookLyt. Forward-looking companion to the feature
catalogue (`shared/catalogue.js`, surfaced in-app at **/feature-status**), which
is the source of truth for *what exists*; this file records *what is next and
why*, and the decisions that shape it. Where the two disagree, the catalogue wins
— it is generated from the code. For *what already shipped*, see
[`CHANGELOG.md`](CHANGELOG.md); for the deeper design, [`ARCHITECTURE.md`](ARCHITECTURE.md).

This file consolidates every planning doc into one place. It supersedes the
earlier `MERGE_PLAN.md` (the back-office → POS merge, now complete) and
`FULL_APP_REVIEW_CONTINUATION.md` (the P0/P1 review handoff, now shipped) —
their still-live content is folded in below, under **Origins** and **Next up**.

_Last updated: 2026-08-30._

---

## Where we are

86 features reconciled from the investor deck, by real status in the code:

| Status | Count | Meaning |
| --- | --- | --- |
| built | **57** | Works against real data today |
| partial | 8 | Core built; one honest gap named in the catalogue note |
| shell | 6 | Honest empty screen on a real route; needs data or infra |
| absent | 8 | Recognised, not implemented |
| external | 4 | Lives in the guest app / another surface |
| blocked-ext | 3 | Needs infrastructure the product deliberately does not run |

Recently shipped: the **AI narration set** — the **Daily Brief** and its
**Weekly Review** on the Overview, and the **AI Review Analyser** (narrated
sentiment + what-to-do on Reviews → Insights), all sharing one narrate-or-fallback
helper and the abstention discipline; the analyser also raises recurring
complaint themes as tracked actions via a new `review_theme` rule. The guest
dine-in app integration (`/api/guest`); the
**Tier 0 forecasting set** — Demand Forecast, Prep Sheet, Inventory Forecast,
Auto Reorder, Shift Planning, Cost-based Scheduling — all on one seasonal-naive
engine, each carrying the accuracy it earned and abstaining where it cannot
speak; the **ETA enhancement** (visit intent + party-size); and the **Delivery
P&L** — the operating margin on Economics now counts the delivery platform's
take (from settlements) alongside food and labour, closing the last cost the
page previously only named (F-01's per-order commission breakdown was already
present in the Payouts settlement detail); and two **data-gated wins** — the New
Item Performance tracker now has spread launch dates to track against, and the
Payout Leakage detector raises a recoverable-leakage task in the action centre,
ranked by its rupee shortfall; and **Churn & Reorder Prediction** (LoopAI F-04)
— the Guests page predicts churn from each guest's own visit cadence (median
gap), banding them active / due / overdue / likely-lost with a predicted next
visit, superseding the flat 30-day winback window for the guests it can measure;
and the **AI Nutrition Assistant** (shell → built) — per-serving calories and
macros exploded from each dish's recipe through per-ingredient nutrition
(migration 085), the same arithmetic the prep sheet does for cost. It never
guesses: a dish with even one undeclared ingredient reports nothing rather than a
number nearly right, coverage is stated as a percentage of costed dishes, and the
same figures now feed the guest app's dish detail (previously hardcoded null);
**QR Winback Offers** (absent → built) — the Guests churn table can issue a
single-use discount to a lapsed guest, printable as a QR; the discount is a real
coupon (redeems at the till through the existing engine, status read back from
it), sized by churn severity with the minimum order anchored to the guest's own
average spend, and honest that there is no send channel — it is printed and
handed over; and the **POS Accounting Bridge** (partial → built) — a period's
takings exported as balanced double-entry vouchers, either Tally-importable XML
or a journal CSV, produced server-side with no credentials (that is the separate
blocked Tally auto-sync). Every voucher balances by construction (the discount is
the billed-minus-collected plug), and where that plug disagrees with the POS's
own discount total the gap is shown, not swallowed; and the first **Message
Outbox** pass — waitlist notifications and winback offers now record intended
guest messages in a persisted outbox, with honest `queued` / `skipped` /
`failed` / `sent` states and an admin read screen at `/outbox`. There is still
no WhatsApp sender worker, so this is queue groundwork rather than a claimed
delivery channel; and **Waste Prediction** (shell → built, in two phases) — the
number the waste picture always lacked is *how much of each dish was prepped*,
now captured at two points (a pre-service plan nudged from the forecast, a
post-service actual; `prep_logs`, migration 089) and reconciled against what sold
and what was binned, so over-prep is measured per dish, not guessed (Phase 1);
then the per-dish/weekday over-prep pattern is projected onto the next service —
likely surplus in portions and rupees, chronic over-preppers flagged, abstaining
per dish below a history floor (Phase 2), all on one page at `/forecast/waste`.
It forecasts the surplus and never a prep quantity: choosing how much to make
weighs the cost of running out against the cost of binning, which needs
shelf-life and stockout-cost data the POS does not hold — the same line the prep
sheet already draws; and **Admin Feature Toggles** — an admin can switch whole
modules of the app on or off for their restaurant at `/feature-toggles`, hiding
them from the sidebar and gating their routes (a typed URL to a switched-off page
lands on an honest "turned off" panel). Flags are one `feature_flags` setting
(JSON of only the OFF entries; empty means everything on), keyed by the same nav
paths the sidebar renders so the list cannot drift; core POS and admin screens
are protected so an admin cannot lock the till or themselves out. Enforcement is
**both client and server**: a `featureGate` middleware maps each toggle key to its
backend route(s) and returns `403 feature_disabled` on a direct call to a
switched-off feature, reading the flag from the caller's own token claim and a
short per-restaurant cache that a toggle write busts at once. Shared routers are
split by **sub-path**, longest prefix winning — `/api/reputation/guests` is Guests
while the rest is Rankings, `/api/reports/food-cost-variance` is Variance while the
rest is Reports, `/api/compliance/sops` is the Playbook, `/api/insights/{economics
vs menu…}` splits Economics from Menu Insights — so switching one feature off never
switches off the other. A protected page that reads a gated feature (Overview's
widgets) simply gets a 403 for that one call and renders empty; the client already
tolerates it, so a disabled feature shows no data anywhere. The only features left
client-side are the handful with **no dedicated server route** — Costing (reads
Inventory + Recipes), Order History (reads Orders), the Market-Intel shells and the
Tally integration (no live data route) — documented in `feature-routes.js`.

The discipline every item here inherits: **a number we cannot establish is not
zero.** Coverage, abstention and "still learning" states survive to the screen;
nothing is described as learned that was not, and no figure is printed that a
model could only guess.

---

## Origins — how we got here

CookLyt POS is the merge target: an Express + Postgres + React/Vite POS
(WebSocket, KDS, payments, modifiers/combos/coupons/loyalty, super-admin, guest
app, Jest suite) that a Next.js + Prisma operator back-office was ported *into*
in August 2026. The direction was deliberate: the back-office learned about sales
by ingesting day-old CSVs; the POS **generates** that data live, so every ported
feature reads live rows instead of an upload. Two rules governed the merge and
still govern new work:

- **No Prisma in the backend.** Every ported query became a POS repository method
  on the `Router → Service → Repository → SQL` spine — the largest line-item of
  the merge, paid on purpose (see [`ARCHITECTURE.md`](ARCHITECTURE.md)).
- **A real answer or an honest shell — never a fake number.** A feature that
  can't yet produce a truthful figure gets a navigable, self-explaining empty
  screen, not mocked-up data. This is the same discipline the catalogue's
  `shell` status and the abstention rule above enforce.

The merge is complete; the counts in **Where we are** are the current reconciled
state, not the pre-merge 77-feature catalog.

---

## Decisions on record

- **ETA engine — kept and enhanced, not rebuilt.** The `Cooklyt_ETA_Engine`
  spec v3 was assessed against the shipped `/api/eta` engine. The engine already
  implements the spec's category-weight tier *and exceeds it*: the weights are
  learned (blended seed → observed, per category) rather than a static map, and
  it does greedy floor-wide queue assignment the spec never covers. Rebuilding to
  the spec would be a regression, so instead the two predictive signals it
  lacked were **added** (shipped): **visit intent** (eating 1.0× / both 1.3× /
  chill 1.6×, captured at waitlist intake, with the chill→both mid-session
  drift) and a **party-size factor** measured as a deviation from the outlet's
  average party so it does not double-count the learned duration. A missing
  signal stays neutral, so nothing that predates the change moves.
- **Recsys — Phase 0 logging shipped; model still gated on volume.** The group
  recommender design (`cooklyt-recsys-context.md`) is emphatic that nothing is
  modelled before 2–3 weeks of clean impression/add/refine/order logs. So the
  first recsys build is event logging, not a model — now **shipped**: the guest
  app's events land in `guest_events` (migration 093) via a best-effort sink, and
  the **Recommendations** page (`/api/insights/reco-performance`) reads the funnel
  and joins reco-driven adds to the menu-engineering matrix (the reco→margin loop),
  abstaining below a session/add floor. **Phase 1 has its first coefficient**: a
  learned acceptance prior (per dish, added÷shown vs the menu average) is served in
  the guest menu payload and blended into the client model, abstaining below an
  impression floor — the full logistic/embedding scorer still waits on real volume.
  Apriori co-order mining already ships (it backs `/api/guest/affinities`).
- **Vision docs stay vision.** `Cooklyt_V2_Strategic_Features` and
  `Cooklyt_Deep_Feature_Roadmap` (~150 items: AI agents, digital twin,
  knowledge graph) are a direction, not a backlog. Items from them enter this
  roadmap only when they become concrete and buildable on data we hold.
- **Numerize / operator-intelligence teardown — assemble, don't rebuild.** A
  competitor scan (Numerize's "Friday" agent) and a multi-outlet operator's
  weekly sheet were analysed against our data model
  ([research brief](https://claude.ai/code/artifact/03ecc932-db4a-45d0-b642-25a1df80994c)).
  Finding: their headline moves — telling an operator which coupon quietly loses
  money, and reading category attach-rate to the first decimal — are computable
  from tables CookLyt already holds. The differentiator isn't the maths, it's
  **delivery**: a plain-language nudge pushed to the right person, not a dashboard
  to remember to open. We already have the machinery for that (rules → ranked
  actions → message outbox), so these become the **operator-intelligence** backlog
  under *Next up*, not a new product. Their real dependency is the same WhatsApp
  channel worker already on the list.

---

## Next up — buildable now

Ordered by leverage against data and infrastructure that already exist.

### 1. Operator intelligence — the per-cover margin layer

From the [competitor / operator teardown](https://claude.ai/code/artifact/03ecc932-db4a-45d0-b642-25a1df80994c).
Most of these need no new capture — the maths runs on tables we already hold —
and each keeps the abstention discipline (per-cover metrics abstain until a cover
count exists; year-on-year abstains until a year of history does). Delivered
first as Insights panels and action-centre rules, then pushed through the outbox.

| Metric | Data today | Status | First build |
| --- | --- | --- | --- |
| **Coupon contribution** | `coupons` + `orders` (revenue, discount) + delivery commission rate | ✅ **shipped** | Codes ranked by ₹ kept per order after discount + (delivery) commission, on the Economics page (`GET /api/insights/coupon-economics`). Numerize's headline insight. Next: raise an action on loss-making codes. |
| **Category attach rate** (the "0.1") | `order_items → menu_items.category` | ✅ **shipped** | Items per order by category + penetration, with the delta vs the prior window and high-margin categories flagged, on Menu Insights (`GET /api/insights/attach`). Per-cover once covers land. |
| **Same-store sales growth (SSSG)** | `daily_snapshots` + the `group` module | ✅ **shipped** | Per-outlet growth vs the prior equal window in the group view, abstaining where there's no prior trade. YoY still abstains until ≥1 yr history. |
| **Sales per labour hour (SPLH)** | `labour` module + cost-based scheduling | ✅ **shipped** | Per-outlet revenue ÷ completed shift hours in the group view, abstaining where no roster is logged. Station-level planned-vs-actual headcount needs station tags (smaller follow-on). |
| **APC / per-cover average** | optional cover count captured at billing (migration 090) | ✅ **shipped** | Average per cover on the Economics page, with the share of dine-in bills that carried a guest count. AOV (per order) always shown; APC abstains until covers exist. |
| **Service-charge-removed %** | persisted `service_charge_waived` flag (migration 090) | ✅ **shipped** | Removed rate on the Economics page — of dine-in bills where a service charge applied, the share guests declined — with an estimate of the rupees foregone and a per-server breakdown. |
| **Always-on delivery** ("Friday" layer) | rules/actions engine + AI narration + message outbox | ✅ **shipped** | Three rules (coupon_loss, attach_drop, sc_removal_high) raise ranked actions; each is enqueued to the outbox as an `operator_alert`, queued to the operator's `alert_whatsapp` number. Actual WhatsApp send still waits on the channel worker (item 2). |

**Sequencing:** Wave 1 — coupon contribution + category attach (no migration)
✅ **shipped**. Wave 2 — SSSG + SPLH in the group view (read-layer on existing
tables) ✅ **shipped**. Wave 3 — covers-on-the-bill + SC-removed capture
(migration 090 + billing UI) ✅ **shipped**. Wave 4 — route it all through the
agent we already have (rules → ranked actions → outbox) ✅ **shipped**; live
WhatsApp send remains gated on the channel worker.

### 2. WhatsApp send channel

The persisted outbox now exists, waitlist / winback route through it, and
loyalty-customer consent (`whatsapp_opt_in`) is captured at customer creation and
order-link time — so messages already resolve to `queued` (opted in) or `skipped`
(not). Still missing: the channel worker — wire WhatsApp Business API
credentials/config, drain `queued` rows to `sent` or `failed`, then route Smart
Alerts, Staff Task nudges, and the operator-intelligence actions above through the
same enqueue path. This is the one dependency the "always-on delivery" item shares.

---

## Gated / later

After Waste Prediction Phase 2, the feature toggles, and the enforcement pass
above, essentially everything left is **externally gated** — it needs a
credential, a hardware feed, or a network the product deliberately does not run,
not more code against data we hold. The non-built catalogue features (partial,
shell, absent, external, blocked-ext — the catalogue holds the exact counts), by
what each waits on:

| Gate | Features waiting on it |
| --- | --- |
| **WhatsApp Business API** (outbox is the groundwork; needs the channel worker) | Smart Alerts delivery, Staff Task nudge, Repeat-Rate & Winback send, WhatsApp Assistant, Automated Winback Campaigns, Per-employee Data Entry |
| **Aggregator scraping** (product does not run it) | Collection Gap Finder, Competitor Price / Offer Tracker, New Competitor Alerts |
| **Other third-party creds / APIs** | Tally auto-sync (creds), AI Review Reply *posting* (Google), Invoice Parser (OCR), Platform Connections (Swiggy/Zomato auto-connect), Weather & Event Forecasting (weather+events feed) |
| **Cameras + a CV model** | Allergen Cross-Contamination, Cross-Contamination / Handwash / Headgear-Glove / Spill-Pest Detection |
| **A multi-outlet network** (unlearnable on one restaurant) | Menu Modelling, Pricing Prediction, Wholesale Pricing |
| **Separate guest-app repo** (off-limits here) | E-Waiter, Joined Cart, Personalized Ordering, Smart Upsells |

Outcome Tracking is already built (demo-empty only); Smart Alerts and
Repeat-Rate & Winback now route through the real outbox rather than a stub, so
their catalogue notes are due a refresh even though the honest status stays
`partial` until the channel worker lands.

- **Recsys learning pipeline** — Phase 0 event logging first, then logistic
  regression → content embeddings → LambdaMART. Guest recommender + co-order
  mining already live; the rest waits on logs (and multi-restaurant scale for
  the deep/graph models).
- **External-blocked** — competitor scraping (4 shells), Tally API credentials,
  invoice OCR, Google-review posting. Documented, not built; they need infra or
  credentials the product deliberately does not run.
- **Camera hygiene monitoring** — removed from the nav; recognised as a future
  line on Compliance › Hygiene. Needs cameras + a CV model no deployment runs.
- **Autopilot / agentic tier** (LoopAI §2, V2 strategic) — Procurement Agent,
  Waste Agent, etc. A tier shift from "tells you" to "does it", built on the
  autonomous-decision groundwork; revisited once the intelligence layer is broad
  and trusted.

---

## Source documents

Strategy, specs, and research this roadmap reconciles:

| Doc | Role here |
| --- | --- |
| [Margin in the Decimals](https://claude.ai/code/artifact/03ecc932-db4a-45d0-b642-25a1df80994c) | Numerize + operator-metrics teardown → the operator-intelligence backlog |
| `MERGE_PLAN.md` *(folded in)* | Back-office → POS merge plan; complete — its live content is now **Origins** above |
| `FULL_APP_REVIEW_CONTINUATION.md` *(folded in)* | P0/P1 review handoff; shipped — remainder is the WhatsApp worker in **Next up** |
| `Cooklyt_ETA_Engine_Spec_v3` | Assessed → keep & enhance the existing engine |
| `CookLyt_LoopAI_Feature_Gaps` | Concrete near-term gaps (F-01/04/06/07); F-07 shipped |
| `cooklyt-recsys-context` + algorithms table | Guest recommender design; gated on Phase 0 logging |
| `Cooklyt_V2_Strategic_Features` | Long-range vision (AI OS, agents) |
| `Cooklyt_Deep_Feature_Roadmap` | ~150-item vision catalogue; several already built |

The specs marked without a link are kept locally, not in the repo. The two
*folded-in* docs have been consolidated here and removed as standalone files.
