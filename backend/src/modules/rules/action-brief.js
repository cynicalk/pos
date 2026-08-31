// AI-narrated Action Centre — turns the ranked findings into a plain-language plan.
//
// The rules engine already decided WHAT is wrong and ranked it by rupee impact;
// the action centre already shows each finding with its own title, remedy and
// amount. What a list can't do is sequence itself into "do these first, and here
// is why" — that is all this adds. The maths is untouched: this narrates the
// actions exactly as ranked, never re-orders them, and never invents one.
//
// Pure: ranked actions in, signals/messages/string out. No DB, no model call.

const round2 = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 100) / 100);

const TOP_N = 5;

/**
 * Shape the ranked open actions into the compact signals the model narrates.
 * @param {Array} actions  from actions.service.list(id, 'open') — already ranked
 *                         (quantified rupees first, then priority, then newest),
 *                         each with { title, priority, rule_type, created_at,
 *                         opportunity: { amount } }.
 */
function buildActionSignals(actions = [], now = Date.now()) {
  const byPriority = { high: 0, medium: 0, low: 0 };
  let quantifiedTotal = 0;
  let quantifiedCount = 0;

  for (const a of actions) {
    const p = a.priority || 'low';
    if (byPriority[p] === undefined) byPriority[p] = 0;
    byPriority[p] += 1;
    const amt = a.opportunity?.amount;
    if (amt != null) { quantifiedTotal += Number(amt); quantifiedCount += 1; }
  }

  const top = actions.slice(0, TOP_N).map((a) => ({
    title: a.title,
    priority: a.priority || 'low',
    // null means the impact isn't quantifiable — the model must not put a number on it.
    amount: a.opportunity?.amount != null ? round2(a.opportunity.amount) : null,
    ruleType: a.rule_type || null,
    ageHours: a.created_at ? Math.max(0, Math.round((now - new Date(a.created_at).getTime()) / 3.6e6)) : null,
  }));

  return {
    totalOpen: actions.length,
    byPriority,
    // The rupees the ranked list can actually defend a figure for — never the
    // whole list, so a total is never read as more certain than it is.
    quantifiedTotal: quantifiedCount ? round2(quantifiedTotal) : null,
    quantifiedCount,
    top,
  };
}

/** Strict prompt: narrate the plan in the given order; invent nothing. */
function buildActionMessages(signals) {
  const system =
    'You are the operations lead for an Indian restaurant, briefing the owner on their open action ' +
    'list. You are given a JSON object: the open actions, ALREADY RANKED by rupee impact then priority, ' +
    'with a per-action amount (null where the impact cannot be quantified) and how many hours each has ' +
    'been open. Write a short spoken-style plan — 3 to 5 sentences, plain, calm, no headings, no bullet ' +
    'points, no emoji. Rules you must not break: use ONLY the actions in the JSON and keep their order — ' +
    'do not re-rank or invent one; a null amount means the impact is not quantified, so do not attach a ' +
    'number to that action; amounts are Indian rupees; quantifiedTotal is the total rupees at stake across ' +
    'only the actions that carry a figure, so present it as "at least" that, never as the whole list. ' +
    'Lead with what to tackle first and why, name the next one or two in order, and close with the ' +
    'quantified total at stake if there is one. If totalOpen is 0, say the action list is clear. Sound ' +
    'like a trusted second-in-command, not a dashboard.';
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(signals) },
  ];
}

const inr = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;

/** Honest templated plan for when the model is offline — same order, plainer. */
function fallbackActionBrief(signals) {
  if (!signals.totalOpen) return 'Nothing open — the action list is clear.';

  const parts = [];
  const hi = signals.byPriority.high || 0;
  parts.push(
    `${signals.totalOpen} open action${signals.totalOpen === 1 ? '' : 's'}` +
    (hi ? `, ${hi} high priority.` : '.'),
  );

  const first = signals.top[0];
  if (first) {
    parts.push(first.amount != null
      ? `Start with "${first.title}" — ${inr(first.amount)} at stake.`
      : `Start with "${first.title}".`);
  }
  const next = signals.top.slice(1, 3).map((a) => `"${a.title}"`);
  if (next.length) parts.push(`Then ${next.join(', then ')}.`);

  if (signals.quantifiedTotal != null) {
    parts.push(`At least ${inr(signals.quantifiedTotal)} is recoverable across the priced actions.`);
  }

  return parts.join(' ');
}

module.exports = { buildActionSignals, buildActionMessages, fallbackActionBrief, TOP_N };
