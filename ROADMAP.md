# CookLyt Roadmap

Forward-looking companion to the feature catalogue. The catalogue
(`shared/catalogue.js`, surfaced in-app at **/feature-status**) is the source of
truth for *what exists*; this file records *what is next and why*, and the
decisions that shape it. Where the two disagree, the catalogue wins — it is
generated from the code.

_Last updated: 2026-08-30._

---

## Where we are

86 features reconciled from the investor deck, by real status in the code:

| Status | Count | Meaning |
| --- | --- | --- |
| built | **56** | Works against real data today |
| partial | 8 | Core built; one honest gap named in the catalogue note |
| shell | 6 | Honest empty screen on a real route; needs data or infra |
| absent | 9 | Recognised, not implemented |
| external | 4 | Lives in the guest app / another surface |
| blocked-ext | 3 | Needs infrastructure the product deliberately does not run |

Recently shipped: the guest dine-in app integration (`/api/guest`); the
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
**both client and server**: a small `featureGate` middleware maps each toggle key
to its dedicated API prefix and returns `403 feature_disabled` on a direct call to
a switched-off feature, reading the flag from the caller's own token claim and a
short per-restaurant cache that a toggle write busts at once. Features whose API
prefix is shared with another (still-enabled) feature stay client-side for now —
gating a shared router would switch off more than asked — so the server-enforced
set is the dedicated-router subset (Reviews, Rankings, Coupons, Payouts,
Accounting, Compliance, Outbox, Procurement, the Recipe-Mgmt routers, and
Forecasting at the section level); the rest are listed honestly in the code.

The discipline every item here inherits: **a number we cannot establish is not
zero.** Coverage, abstention and "still learning" states survive to the screen;
nothing is described as learned that was not, and no figure is printed that a
model could only guess.

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
- **Recsys — gated on Phase 0 logging.** The group recommender design
  (`cooklyt-recsys-context.md`) is emphatic that nothing is modelled before
  2–3 weeks of clean impression/add/refine/order logs. So the first recsys
  build is event logging, not a model. Apriori co-order mining already ships
  (it backs `/api/guest/affinities`); the learned scorer waits on logs.
- **Vision docs stay vision.** `Cooklyt_V2_Strategic_Features` and
  `Cooklyt_Deep_Feature_Roadmap` (~150 items: AI agents, digital twin,
  knowledge graph) are a direction, not a backlog. Items from them enter this
  roadmap only when they become concrete and buildable on data we hold.

---

## Next up — buildable now

Ordered by leverage against data and infrastructure that already exist.

1. **WhatsApp send channel.** The persisted outbox now exists, waitlist / winback
   route through it, and loyalty-customer consent (`whatsapp_opt_in`) is captured
   at customer creation and order-link time — so messages already resolve to
   `queued` (opted in) or `skipped` (not). Still missing: the channel worker —
   wire WhatsApp Business API credentials/config, drain `queued` rows to `sent`
   or `failed`, then route Smart Alerts and Staff Task nudges through the same
   enqueue path.

2. **Feature-toggle enforcement — widen the map.** The `featureGate` middleware
   now enforces the dedicated-router subset server-side (see *Recently shipped*).
   What remains is the harder half of the map: features whose API prefix is shared
   between two nav entries (Loyalty vs Guests both read `/api/loyalty`; History and
   the Costing/Variance/Economics analytics pages over `/api/reports` and friends).
   Enforcing those needs either per-route gating inside the shared router or a
   finer key→sub-path map, decided feature by feature. Until then they are
   client-side only, and that boundary is documented in `feature-routes.js`.

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

Strategy and specs this roadmap reconciles (kept locally, not in the repo):

| Doc | Role here |
| --- | --- |
| `Cooklyt_ETA_Engine_Spec_v3` | Assessed → keep & enhance the existing engine |
| `CookLyt_LoopAI_Feature_Gaps` | Concrete near-term gaps (F-01/04/06/07); F-07 shipped |
| `cooklyt-recsys-context` + algorithms table | Guest recommender design; gated on Phase 0 logging |
| `Cooklyt_V2_Strategic_Features` | Long-range vision (AI OS, agents) |
| `Cooklyt_Deep_Feature_Roadmap` | ~150-item vision catalogue; several already built |
