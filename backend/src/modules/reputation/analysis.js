// AI Review Analysis — the narration layer over the deterministic review summary.
//
// The maths is already done by summarizeReviews / buildActionQueue: the sentiment
// split, the ranked complaint themes, the negative counts, and the per-theme
// suggested action. This module only turns that into words — a strict prompt that
// forbids inventing a complaint the data doesn't contain, and an honest templated
// fallback that says the same thing when the model is offline.
//
// Pure: signals in, messages/string out. No DB, no model call (that's the caller).

const round1 = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 10) / 10);

/**
 * Shape the summary + action queue into the compact signals the model narrates.
 * @param {object} summary  from summarizeReviews (total, avgRating, positive/neutral/negative, themes)
 * @param {Array}  queue    from buildActionQueue (themes past the negative floor, with suggestedAction)
 * @param {number} days     the window
 */
function buildAnalysisSignals(summary, queue, days) {
  return {
    days,
    total: summary.total,
    withComment: summary.withComment,
    avgRating: round1(summary.avgRating),
    sentiment: {
      positive: summary.positive,
      neutral: summary.neutral,
      negative: summary.negative,
      // How much of the split is still keyword-only rather than model-classified.
      unclassified: summary.unclassified,
    },
    // Only the patterns worth acting on (past the ≥2-negatives floor), each with
    // the operator's next physical action already decided deterministically.
    patterns: queue.map((t) => ({
      theme: t.label,
      negatives: t.negativeCount,
      of: t.totalCount,
      negativeSharePct: t.negativeSharePct,
      avgRating: round1(t.avgRating),
      suggestedAction: t.suggestedAction,
    })),
  };
}

/** The strict prompt: narrate ONLY these figures/themes; invent no complaint. */
function buildAnalysisMessages(signals) {
  const system =
    'You are the review analyst for an Indian restaurant operator. You are given a JSON object of ' +
    'figures the POS already computed from first-party guest reviews: the sentiment split, and the ' +
    'complaint patterns that recur (each with its negative count and a suggested next action). Write ' +
    'a short spoken-style analysis — 3 to 5 sentences, plain, calm, no headings, no bullet points, no ' +
    'emoji. Rules you must not break: use ONLY what is in the JSON; never invent a complaint, a theme, ' +
    'or a number that is not there; these are first-party reviews only, so do not reference Swiggy, ' +
    'Zomato or Google; the reviews are anonymous, so name no guest. Open with the overall sentiment ' +
    '(how many positive vs negative of the total), then the one or two patterns that most need action ' +
    'and, in your own words, what to do about each — you may lean on each pattern\'s suggestedAction ' +
    'but must not contradict it. If patterns is empty, say there is no recurring complaint worth ' +
    'acting on yet. Sound like a trusted manager, not a dashboard.';
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(signals) },
  ];
}

/** Honest templated analysis for when the model is offline — same facts, plainer. */
function fallbackAnalysis(signals) {
  const parts = [];

  if (!signals.total) {
    return 'No reviews in this window yet — nothing to analyse.';
  }

  parts.push(
    `${signals.total} review${signals.total === 1 ? '' : 's'} in the last ${signals.days} days: ` +
    `${signals.sentiment.positive} positive, ${signals.sentiment.negative} negative` +
    (signals.avgRating != null ? `, averaging ${signals.avgRating}★.` : '.'),
  );

  if (!signals.patterns.length) {
    parts.push('No complaint has recurred enough to be a pattern — nothing here is worth acting on yet.');
  } else {
    const top = signals.patterns.slice(0, 2);
    for (const p of top) {
      parts.push(`${p.theme}: ${p.negatives} of ${p.of} negative (${p.negativeSharePct}%). ${p.suggestedAction}`);
    }
    if (signals.patterns.length > 2) {
      parts.push(`${signals.patterns.length - 2} more pattern${signals.patterns.length - 2 === 1 ? '' : 's'} on the reviews page.`);
    }
  }

  return parts.join(' ');
}

module.exports = { buildAnalysisSignals, buildAnalysisMessages, fallbackAnalysis };
