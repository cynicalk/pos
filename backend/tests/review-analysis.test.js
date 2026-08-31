const { buildAnalysisSignals, buildAnalysisMessages, fallbackAnalysis } = require('../src/modules/reputation/analysis');
const { summarizeReviews, buildActionQueue } = require('../src/modules/reputation/summary');
const { buildCandidates, DEFAULT_RULES } = require('../src/modules/rules/engine');

/**
 * The review analysis narrates the same summary + action queue the Reviews page
 * shows, and the review_theme rule raises those same patterns as tracked actions.
 * These pin the abstention (no reviews / no pattern says so, never a zero-fact),
 * the strict prompt, and that the narration and the action centre agree.
 */

function signalsFor(rows, days = 30) {
  const summary = summarizeReviews(rows);
  return buildAnalysisSignals(summary, buildActionQueue(summary), days);
}

const HYGIENE = (n) => Array.from({ length: n }, (_, i) => ({
  id: `h${i}`, overall_rating: 2, comment: 'found a hair, very dirty table', theme: 'hygiene', sentiment: 'negative',
}));
const HAPPY = (n) => Array.from({ length: n }, (_, i) => ({
  id: `p${i}`, overall_rating: 5, comment: 'delicious', theme: 'food_quality', sentiment: 'positive',
}));

describe('fallbackAnalysis', () => {
  test('no reviews abstains rather than analysing nothing', () => {
    expect(fallbackAnalysis(signalsFor([]))).toMatch(/no reviews/i);
  });

  test('reviews but no recurring pattern says nothing is worth acting on yet', () => {
    const rows = [...HAPPY(6), { id: 'x', overall_rating: 2, comment: 'slow', theme: 'service', sentiment: 'negative' }];
    const t = fallbackAnalysis(signalsFor(rows));
    expect(t).toContain('7 reviews');
    expect(t).toMatch(/no complaint has recurred|nothing here is worth acting/i);
  });

  test('a real pattern leads with sentiment then the remedy', () => {
    const t = fallbackAnalysis(signalsFor([...HAPPY(4), ...HYGIENE(3)]));
    expect(t).toContain('7 reviews');
    expect(t).toContain('4 positive');
    expect(t).toContain('3 negative');
    expect(t).toContain('Hygiene');
    expect(t).toMatch(/walk the kitchen/i); // the SUGGESTED_ACTIONS remedy
  });
});

describe('buildAnalysisMessages', () => {
  test('forbids inventing complaints and stays first-party', () => {
    const msgs = buildAnalysisMessages(signalsFor([...HAPPY(4), ...HYGIENE(3)]));
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toMatch(/use ONLY what is in the JSON/i);
    expect(msgs[0].content).toMatch(/never invent a complaint/i);
    expect(msgs[0].content).toMatch(/first-party/i);
    expect(JSON.parse(msgs[1].content).patterns[0].theme).toBe('Hygiene');
  });
});

describe('review_theme rule → actions', () => {
  const rules = DEFAULT_RULES
    .filter((r) => r.ruleType === 'review_theme')
    .map((r, i) => ({ id: `r${i}`, rule_type: r.ruleType, condition: r.condition, message_template: r.messageTemplate, severity: r.severity, enabled: true }));

  test('raises one action per recurring theme, hygiene always high', () => {
    const reviewComments = [...HYGIENE(3), ...HAPPY(4)];
    const out = buildCandidates(rules, { reviewComments });
    const theme = out.filter((c) => c.ruleType === 'review_theme');
    expect(theme).toHaveLength(1);
    expect(theme[0].dedupeKey).toBe('review_theme:hygiene');
    expect(theme[0].priority).toBe('high');
    expect(theme[0].title).toMatch(/3 guests flagged hygiene/i);
    expect(theme[0].description).toMatch(/walk the kitchen/i);
  });

  test('a single complaint is not a pattern — nothing raised', () => {
    const reviewComments = [{ id: 'x', overall_rating: 2, comment: 'slow service', theme: 'service', sentiment: 'negative' }, ...HAPPY(5)];
    const out = buildCandidates(rules, { reviewComments }).filter((c) => c.ruleType === 'review_theme');
    expect(out).toHaveLength(0);
  });

  test('classifies by keyword when the row has no stored theme', () => {
    const reviewComments = Array.from({ length: 3 }, (_, i) => ({
      id: `k${i}`, overall_rating: 2, comment: 'a cockroach on the table, filthy', // no theme/sentiment
    }));
    const out = buildCandidates(rules, { reviewComments }).filter((c) => c.ruleType === 'review_theme');
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe('review_theme:hygiene');
  });
});
