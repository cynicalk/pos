const repo = require('./actions.repository');
const engine = require('../modules/rules/engine');
const opportunity = require('../modules/rules/opportunity');
const actionBrief = require('../modules/rules/action-brief');
const { narrateOrFallback } = require('../ai/narrate');
const tracker = require('../modules/outcomes/tracker');
const autopilotPolicy = require('../modules/autopilot/policy');
const procurementRepo = require('../procurement/procurement.repository');
const complianceService = require('../compliance/compliance.service');
const reputationService = require('../reputation/reputation.service');
const payoutsService = require('../payouts/payouts.service');
const snapshotsRepo = require('../snapshots/snapshots.repository');
const insightsService = require('../insights/insights.service');
const messagingService = require('../messaging/messaging.service');
const settingsRepo = require('../settings/settings.repository');
const anomaly = require('../modules/analytics/anomaly');
const { ValidationError, NotFoundError } = require('../shared/errors');

// Window the operator-intelligence rules read over — the same 30 days their
// Insights panels default to, so an action and its page agree.
const OI_WINDOW_DAYS = 30;

const VALID_STATUSES = ['open', 'acknowledged', 'acted_on', 'dismissed'];

// An outcome needs fresh data before it can be re-measured. A day is the
// shortest window in which a cancellation rate or a rating could plausibly have
// moved for a reason connected to the operator's action.
const OUTCOME_MIN_AGE_HOURS = 24;

// How long a resolved finding stays quiet before the same condition may be
// raised again. Without this the queue re-raises whatever the operator just
// answered — see findSuppressedDedupeKeys. A day is long enough that a standing
// problem which is genuinely still there gets to speak up tomorrow, and short
// enough that a recurring one isn't silenced for a week.
const RAISE_COOLDOWN_HOURS = 24;

/**
 * The last two prices per ingredient, each with the dishes it appears in.
 *
 * The dish lookup runs only for ingredients whose price actually moved, so a
 * pantry of two hundred items costs two hundred rows and a handful of small
 * follow-up queries rather than one per ingredient.
 */
async function getPriceChanges(restaurantId) {
  const pairs = await procurementRepo.getLatestPricePairs(restaurantId);
  const moved = pairs.filter(
    (p) => Number(p.previous_cost) > 0 && Number(p.current_cost) !== Number(p.previous_cost),
  );

  return Promise.all(moved.map(async (p) => ({
    ...p,
    dishes: await procurementRepo.getDishesUsing(p.ingredient_id, restaurantId),
  })));
}

/**
 * The revenue series and its anomalies.
 *
 * ANOMALY_WINDOW_DAYS must comfortably exceed MIN_BASELINE_DAYS plus the judged
 * window, or the baseline is never long enough and the rule silently never
 * fires. 45 gives a 14-day minimum baseline room to breathe through closed days.
 */
const ANOMALY_WINDOW_DAYS = 45;

async function getRevenueAnomalies(restaurantId) {
  const tz = await snapshotsRepo.getTimezone(restaurantId);
  const [series, today] = await Promise.all([
    snapshotsRepo.getRevenueSeries(restaurantId, tz, ANOMALY_WINDOW_DAYS),
    snapshotsRepo.getLocalToday(restaurantId, tz),
  ]);
  // `today` is passed so the partial current day is excluded from judgement —
  // see the note in modules/analytics/anomaly.js.
  return anomaly.detectAnomalies(series, { today });
}

/**
 * Evaluate every rule for one restaurant and persist the new findings.
 *
 * Fetch → evaluate (pure) → dedupe (pure) → persist. The engine never touches
 * the database, so the thresholds and the dedupe behaviour are testable without
 * one; see tests/rules.test.js.
 */
async function evaluate(restaurantId, now = Date.now()) {
  await repo.seedRules(restaurantId, engine.DEFAULT_RULES);
  const rules = await repo.listRules(restaurantId);
  if (!rules.length) return [];

  const [orderStats, reviews, reviewComments, seatedTables, priceChanges, compliance, rankings, anomalies,
    couponEconomics, attach, scRemoved, menuInsights, recoPerf] =
    await Promise.all([
    repo.getOrderStats(restaurantId, engine.CANCELLATION_WINDOW_DAYS),
    repo.getRecentReviews(restaurantId, engine.RATING_WINDOW),
    repo.getRecentReviewsWithText(restaurantId, engine.REVIEW_THEME_WINDOW),
    repo.getSeatedTables(restaurantId),
    getPriceChanges(restaurantId),
    complianceService.getOverview(restaurantId),
    // Phase 6. getRankings does the grouping AND decides which movements are
    // too far apart in time to call a change, so rank_drop inherits that
    // judgement instead of forming a second opinion about it.
    reputationService.getRankings(restaurantId),
    // Phase 9. Reads the same daily snapshots the revenue report does, so an
    // anomaly alert and the report can never disagree about what a day took.
    getRevenueAnomalies(restaurantId),
    // Wave 4 — the operator-intelligence findings, from the same computed
    // figures their Insights pages show.
    insightsService.getCouponEconomics(restaurantId, OI_WINDOW_DAYS),
    insightsService.getAttachRate(restaurantId, OI_WINDOW_DAYS),
    insightsService.getScRemoved(restaurantId, OI_WINDOW_DAYS),
    insightsService.getMenuInsights(restaurantId, OI_WINDOW_DAYS),
    // The reco→margin loop, as an action source: high-margin dishes the
    // recommender under-shows become "feature it" nudges.
    insightsService.getRecoPerformance(restaurantId, OI_WINDOW_DAYS),
  ]);

  const candidates = engine.buildCandidates(rules, {
    totalOrders: Number(orderStats?.total_orders || 0),
    cancelledOrders: Number(orderStats?.cancelled_orders || 0),
    reviews,
    reviewComments,
    seatedTables,
    priceChanges,
    licence: compliance.licence,
    certs: compliance.certs,
    trackedQueries: rankings.trackedQueries,
    anomalies,
    couponEconomics,
    attach,
    scRemoved,
    menuMatrix: menuInsights?.matrix || null,
    recoPromote: recoPerf?.promote || [],
    recoActive: recoPerf?.funnel?.enoughData === true,
    recoFunnel: recoPerf?.funnel || null,
    recoMargin: recoPerf?.margin || null,
    windowDays: OI_WINDOW_DAYS,
  }, now);

  if (!candidates.length) return [];

  const suppressed = await repo.findSuppressedDedupeKeys(
    restaurantId, candidates.map((c) => c.dedupeKey), RAISE_COOLDOWN_HOURS,
  );
  const fresh = engine.dedupeCandidates(candidates, suppressed);

  // Where operator alerts go, if the operator has set a number. Absent → each
  // enqueued alert records honestly as 'skipped: no recipient on file'.
  const alertRecipient = (await settingsRepo.getAll(restaurantId)).alert_whatsapp || null;

  const created = [];
  for (const c of fresh) {
    const action = await repo.createAction(restaurantId, {
      ...c,
      actionType: engine.actionTypeFor(c.priority),
      deliveredVia: 'dashboard',
    });
    created.push(action);

    // Every raised finding is also logged to the message outbox — the delivery
    // queue that drains to WhatsApp once the channel worker lands. Until then it
    // parks at 'queued' (recipient set) or 'skipped' (none), never pretend-sent.
    // A queue failure must not lose the action, so it is caught and swallowed.
    try {
      await messagingService.enqueue(restaurantId, {
        channel: 'whatsapp',
        kind: 'operator_alert',
        recipient: alertRecipient,
        recipientName: 'Operator',
        body: `${action.title} — ${action.description}`,
        refId: action.id,
        // Operator alerts are opt-in by being the owner's own configured number.
        optIn: true,
      });
    } catch (err) {
      console.error('[actions] outbox enqueue failed for', action.id, '—', err.message);
    }
  }

  // Autopilot rides the same periodic evaluation. Best-effort and fully guarded
  // inside runAutopilot (off unless the operator enabled it); a failure here must
  // never fail the action evaluation.
  try { await runAutopilot(restaurantId); } catch (err) {
    console.error('[autopilot] run failed —', err.message);
  }

  return created;
}

// ── Autopilot: the one autonomous, reversible action ─────────────────────────

function autopilotOn(value) {
  return value === 'on' || value === 'true';
}

/**
 * Run the autopilot policy once. Reads the opt-in setting, the recommender's
 * current margin verdict and promote candidates, and what autopilot has already
 * done, then — if every guardrail passes — features one high-margin dish and logs
 * it. Returns a small status the caller can surface or ignore.
 */
async function runAutopilot(restaurantId) {
  const settings = await settingsRepo.getAll(restaurantId);
  const enabled = autopilotOn(settings.autopilot_enabled);
  if (!enabled) return { enabled: false, acted: false };

  const [reco, active, actedIds] = await Promise.all([
    insightsService.getRecoPerformance(restaurantId, OI_WINDOW_DAYS),
    repo.getActiveAutopilotActions(restaurantId),
    repo.getAutopilotActedIds(restaurantId),
  ]);

  const decision = autopilotPolicy.decideFeatureAction({
    enabled: true,
    marginVerdict: reco?.margin?.verdict,
    promote: reco?.promote || [],
    activeCount: active.length,
    actedIds: new Set(actedIds),
  });
  if (!decision) return { enabled: true, acted: false };

  // Feature + log atomically under the concurrent-active cap (repo advisory lock);
  // a null result means an overlapping run already hit the cap, so nothing changed.
  const logged = await repo.featureDishWithCap({
    restaurantId,
    actionType: decision.actionType,
    menuItemId: decision.menuItemId,
    detail: decision.detail,
  }, autopilotPolicy.MAX_ACTIVE);
  if (!logged) return { enabled: true, acted: false };

  insightsService.bustRecoCache(restaurantId); // featured changed — drop stale reco
  return { enabled: true, acted: true, action: logged };
}

/** The autopilot audit trail — what it did and whether it's been reverted. */
function getAutopilotLog(restaurantId) {
  return repo.getAutopilotLog(restaurantId);
}

/** Undo an autopilot action: un-feature the dish and mark it reverted. */
async function revertAutopilotAction(id, restaurantId) {
  const action = await repo.getAutopilotAction(id, restaurantId);
  if (!action) throw new NotFoundError('Autopilot action');
  if (action.reverted_at) return action; // idempotent
  if (action.action_type === 'feature_dish' && action.menu_item_id) {
    await repo.setDishFeatured(restaurantId, action.menu_item_id, false);
    insightsService.bustRecoCache(restaurantId); // un-featured — drop stale reco
  }
  return repo.markAutopilotReverted(id, restaurantId);
}

/** Same, for every active restaurant. One failure must not stop the rest. */
async function evaluateAll() {
  const ids = await repo.listActiveRestaurants();
  let total = 0;
  for (const id of ids) {
    try {
      total += (await evaluate(id)).length;
    } catch (err) {
      console.error('[rules] evaluate failed for', id, '—', err.message);
    }
  }
  return { restaurants: ids.length, created: total };
}

/** Open actions, ranked by rupee impact where an honest figure exists. */
async function list(restaurantId, status) {
  const [actions, cancellationLoss, payoutLeakage, coupons] = await Promise.all([
    repo.listActions(restaurantId, status),
    repo.getCancellationLoss(restaurantId, engine.CANCELLATION_WINDOW_DAYS),
    payoutsService.getRecoverableBySettlement(restaurantId),
    insightsService.getCouponEconomics(restaurantId, OI_WINDOW_DAYS),
  ]);
  // Price coupon_loss actions by the discount their code actually gave away.
  const couponDiscount = Object.fromEntries(
    (coupons.codes || []).map((c) => [c.code, c.discount]),
  );
  return opportunity.rankActions(actions, { cancellationLoss, payoutLeakage, couponDiscount });
}

/**
 * The AI-narrated action centre: a plain-language plan over the SAME ranked open
 * actions the list returns. The rules engine decided and ranked everything; this
 * only sequences it into "do these first, and why", never re-ordering or inventing
 * a finding, with an honest templated plan when the model is offline.
 */
async function getActionBrief(restaurantId) {
  const actions = await list(restaurantId, 'open');
  const signals = actionBrief.buildActionSignals(actions);
  const { narrative, aiUsed, model } = await narrateOrFallback(
    actionBrief.buildActionMessages(signals),
    actionBrief.fallbackActionBrief(signals),
    { maxTokens: 200, restaurantId },
  );
  return { generatedAt: new Date().toISOString(), signals, narrative, model, aiUsed };
}

/**
 * Current value of a tracked metric, or null when it isn't computable. Each case
 * reads the SAME figure the rule fired on, so a verdict is measured on the same
 * basis as the alert. `entity` is the coupon code / category / theme carried on
 * the action's dedupe_key for the per-entity metrics; it stays null for the
 * restaurant-wide ones. A missing entity (coupon retired, category gone) returns
 * null — the outcome simply stays unmeasured rather than inventing a value.
 */
async function computeMetric(restaurantId, metricName, entity = null) {
  switch (metricName) {
    case 'cancellation_pct': {
      const s = await repo.getOrderStats(restaurantId, engine.CANCELLATION_WINDOW_DAYS);
      const total = Number(s?.total_orders || 0);
      if (total === 0) return null;
      return (Number(s.cancelled_orders) / total) * 100;
    }
    case 'avg_rating': {
      // Mirrors the rating_drop rule exactly, including its minimum sample.
      // A verdict measured on a different basis than the alert would be
      // comparing two different questions.
      const reviews = await repo.getRecentReviews(restaurantId, engine.RATING_WINDOW);
      if (reviews.length < engine.MIN_REVIEWS_FOR_RATING) return null;
      return reviews.reduce((sum, r) => sum + Number(r.overall_rating), 0) / reviews.length;
    }
    case 'sc_removed_pct': {
      const sc = await insightsService.getScRemoved(restaurantId, OI_WINDOW_DAYS);
      // The finding is per-server, so measure THAT server's removed rate; fall
      // back to the restaurant-wide rate only if the server can't be resolved.
      if (entity) {
        const s = (sc?.servers || []).find((x) => x.server === entity);
        return s && s.removedPct != null ? Number(s.removedPct) : null;
      }
      return sc?.removedPct ?? null;
    }
    case 'coupon_discount_rate': {
      if (!entity) return null;
      const { codes = [] } = await insightsService.getCouponEconomics(restaurantId, OI_WINDOW_DAYS);
      const code = codes.find((c) => c.code === entity);
      return code ? Number(code.discountRate) : null;
    }
    case 'category_attach': {
      if (!entity) return null;
      const { categories = [] } = await insightsService.getAttachRate(restaurantId, OI_WINDOW_DAYS);
      const cat = categories.find((c) => c.category === entity);
      return cat && cat.attach != null ? Number(cat.attach) : null;
    }
    case 'review_theme_negshare': {
      if (!entity) return null;
      const { summary } = await reputationService.getInsights(restaurantId, {});
      const theme = (summary?.themes || []).find((t) => t.theme === entity);
      if (!theme || !theme.count) return null;
      return (theme.negativeCount / theme.count) * 100;
    }
    case 'menu_item_margin': {
      // entity is `<quadrant>:<dishId>` — measure the dish's current margin, so
      // "did repricing the plowhorse work?" is answered on the same dish.
      if (!entity) return null;
      const dishId = String(entity).split(':').pop();
      const { performance = [] } = await insightsService.getMenuInsights(restaurantId, OI_WINDOW_DAYS);
      const dish = performance.find((p) => p.id === dishId);
      return dish && dish.hasCost ? Number(dish.profitMargin) : null;
    }
    case 'reco_dish_impressions': {
      // entity is the dishId — measure how often the recommender showed it, so
      // "did featuring it work?" is answered as impressions rising from the
      // baseline taken when the operator featured it. Measurable from zero.
      if (!entity) return null;
      return insightsService.getRecoImpressionsForDish(restaurantId, OI_WINDOW_DAYS, entity);
    }
    case 'reco_high_margin_share': {
      // Restaurant-wide: did the recommender's high-margin share recover? Null
      // while the funnel is still below its floor, so no verdict is forced.
      const { margin } = await insightsService.getRecoPerformance(restaurantId, OI_WINDOW_DAYS);
      return margin && margin.enoughData ? margin.highMarginShare : null;
    }
    case 'reco_acceptance': {
      const { funnel } = await insightsService.getRecoPerformance(restaurantId, OI_WINDOW_DAYS);
      return funnel && funnel.enoughData ? funnel.acceptanceRate : null;
    }
    default:
      return null;
  }
}

/**
 * Move an action through its lifecycle. Marking one `acted_on` also takes the
 * outcome baseline — that is the moment the operator claims to have changed
 * something, so it is the only defensible "before".
 */
async function setStatus(id, restaurantId, status) {
  if (!VALID_STATUSES.includes(status)) {
    throw new ValidationError(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  const action = await repo.getAction(id, restaurantId);
  if (!action) throw new NotFoundError('Action');

  const updated = await repo.updateStatus(id, restaurantId, status);

  if (status === 'acted_on' && action.rule_type) {
    const metric = tracker.metricForRuleType(action.rule_type);
    if (metric) {
      const entity = metric.perEntity ? tracker.entityFromDedupeKey(action.dedupe_key) : null;
      const before = await computeMetric(restaurantId, metric.name, entity);
      // No baseline, no outcome. Recording a null "before" would produce a
      // verdict computed against nothing.
      if (before !== null) {
        await repo.createOutcome(restaurantId, id, metric.name, before.toFixed(4));
      }
    }
  }
  return updated;
}

async function assign(id, restaurantId, userId) {
  const action = await repo.getAction(id, restaurantId);
  if (!action) throw new NotFoundError('Action');
  return repo.assign(id, restaurantId, userId || null);
}

/** Re-measure every outcome old enough to have moved. */
async function measureDueOutcomes() {
  const due = await repo.findUnmeasuredOutcomes(OUTCOME_MIN_AGE_HOURS);
  let measured = 0;

  for (const o of due) {
    try {
      // The entity travels on the action's dedupe_key (joined in by the repo),
      // so a per-entity metric is re-measured for the same coupon / category /
      // theme it was baselined on.
      const entity = tracker.entityFromDedupeKey(o.dedupe_key);
      const after = await computeMetric(o.restaurant_id, o.metric_name, entity);
      if (after === null) continue; // not computable yet; try again next pass

      const { deltaPct, verdict } = tracker.evaluateChange(
        Number(o.before_value), after, o.metric_name,
      );
      await repo.recordMeasurement(
        o.id, o.restaurant_id, after.toFixed(4), deltaPct.toFixed(4), verdict,
      );
      measured += 1;
    } catch (err) {
      console.error('[outcomes] measure failed for', o.id, '—', err.message);
    }
  }
  return measured;
}

module.exports = {
  evaluate, evaluateAll, list, getActionBrief, setStatus, assign,
  computeMetric, measureDueOutcomes,
  runAutopilot, getAutopilotLog, revertAutopilotAction,
  VALID_STATUSES, OUTCOME_MIN_AGE_HOURS, RAISE_COOLDOWN_HOURS,
};
