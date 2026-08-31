/**
 * Recommendation funnel — pure shaping over guest-event aggregates.
 *
 * Phase 0 measures whether the recommender *works* before anyone models it. The
 * question an operator can act on is a funnel of sessions:
 *
 *   saw picks  →  added any dish  →  added a recommended dish  →  placed an order
 *
 * plus the acceptance rate the analytics layer defines (reco adds ÷ all adds) and
 * why guests reject picks (refine vs capped). The counts come from SQL; this
 * function only turns them into rates and decides when there is too little data
 * to speak — the same abstention discipline the rest of the system keeps: a rate
 * over a handful of sessions is noise, so below the floor we report "learning"
 * and show the counts, never a confident-looking percentage.
 *
 * `counts` is one row of integers:
 *   sessions              distinct guest sessions in the window
 *   sessions_saw_recos    sessions with a recommendations_shown event
 *   sessions_added        sessions with any dish_added
 *   sessions_added_reco   sessions with a dish_added where source = 'reco'
 *   sessions_ordered      sessions with an order_placed
 *   dish_adds             all dish_added events
 *   dish_adds_reco        dish_added events with source = 'reco'
 *   rejects_refine        reco_rejected with reason 'refine'
 *   rejects_capped        reco_rejected with reason 'capped'
 */

// Below this many sessions that saw picks, rates are noise — abstain.
const MIN_SESSIONS = 20;

const n = (v) => Number(v || 0);
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

function buildRecoFunnel(counts = {}) {
  const sessions = n(counts.sessions);
  const sawRecos = n(counts.sessions_saw_recos);
  const added = n(counts.sessions_added);
  const addedReco = n(counts.sessions_added_reco);
  const ordered = n(counts.sessions_ordered);
  const dishAdds = n(counts.dish_adds);
  const dishAddsReco = n(counts.dish_adds_reco);
  const rejectsRefine = n(counts.rejects_refine);
  const rejectsCapped = n(counts.rejects_capped);

  // Each stage as a rate of the one before it — where the funnel actually leaks.
  const stages = [
    { key: 'saw_recos', label: 'Saw picks', count: sawRecos, ofPrev: null },
    { key: 'added_any', label: 'Added a dish', count: added, ofPrev: pct(added, sawRecos) },
    {
      key: 'added_reco',
      label: 'Added a recommended dish',
      count: addedReco,
      ofPrev: pct(addedReco, added),
    },
    { key: 'ordered', label: 'Placed an order', count: ordered, ofPrev: pct(ordered, addedReco) },
  ];

  // The headline: of every dish added to a cart, the share that came from a pick.
  const acceptanceRate = pct(dishAddsReco, dishAdds);
  // Of sessions shown picks, the share that ordered — the end-to-end conversion.
  const conversionRate = pct(ordered, sawRecos);

  const enoughData = sawRecos >= MIN_SESSIONS;

  return {
    window: { sessions, sessionsSawRecos: sawRecos },
    enoughData,
    // Honest "still learning" until the floor is crossed; counts still shown.
    learning: enoughData ? null : { minSessions: MIN_SESSIONS, have: sawRecos },
    stages,
    acceptanceRate: enoughData ? acceptanceRate : null,
    conversionRate: enoughData ? conversionRate : null,
    dishAdds,
    dishAddsReco,
    rejections: {
      refine: rejectsRefine,
      capped: rejectsCapped,
      total: rejectsRefine + rejectsCapped,
    },
  };
}

module.exports = { buildRecoFunnel, MIN_SESSIONS };
