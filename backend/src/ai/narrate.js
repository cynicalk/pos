// Shared narration-or-fallback: the one place the "let the model phrase these
// deterministic figures, but never let it fail the surface" contract lives.
//
// The Daily Brief, the Weekly Review and the Review Analysis all narrate a set
// of figures the app already computed. Each passes its own strict prompt and its
// own honest templated fallback; this helper only decides whether the model gets
// to speak (reachable + fast enough) and hands back the fallback otherwise. It
// depends on nothing but the LLM client, so any service can use it without
// pulling in another surface's dependencies (and without a require cycle).

const crypto = require('crypto');
const llm = require('./llm.client');
const settingsRepo = require('../settings/settings.repository');
const { languageDirective } = require('../shared/ai-languages');
const { createTtlCache } = require('../shared/ttl-cache');

// Narrated reads change at trading pace, not per request; a short cache spares the
// local model a burst of identical prompts (the same brief opened a few times).
const narrationCache = createTtlCache();
const NARRATION_TTL_MS = 60_000;

/**
 * Every number the narration is allowed to use — flattened from the signals JSON
 * in the prompt's user message. Each value is stored as its rounded integer so a
 * reformatted figure (₹48,231.50 → "₹48,232") still matches.
 */
function allowedNumbers(messages) {
  const set = new Set();
  const user = [...messages].reverse().find((m) => m.role === 'user');
  if (!user) return set;
  let signals;
  try { signals = JSON.parse(user.content); } catch { return set; }
  const walk = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      set.add(Math.round(v));
      set.add(Math.round(v * 100)); // a rate stored as 0.176 vs shown as 17.6%
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(signals);
  return set;
}

/**
 * The safety net the strict prompt asks for, enforced mechanically: every rupee
 * amount and percentage in the narration must trace to a figure in the signals.
 * A model that invents "₹4,82,000" from a real ₹48,200 is caught here and the
 * honest template stands instead. Deliberately scoped to money and percentages —
 * the figures an operator acts on — so ordinary words ("3 to 5 sentences") never
 * trip it. Empty of such figures ⇒ nothing to disprove ⇒ allowed.
 */
function figuresGrounded(text, allowed) {
  const figures = [];
  for (const m of text.matchAll(/₹\s?([\d,]+(?:\.\d+)?)/g)) figures.push(Number(m[1].replace(/,/g, '')));
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)) figures.push(Number(m[1]));
  for (const f of figures) {
    if (!Number.isFinite(f)) continue;
    const r = Math.round(f);
    // Grounded if the rounded figure, or the figure ±1 (rounding slack), is a
    // known signal number. Small counts (< 10, e.g. "3 orders") are not asserted
    // as money/percent risks and pass.
    if (r < 10) continue;
    if (allowed.has(r) || allowed.has(r - 1) || allowed.has(r + 1)) continue;
    return false;
  }
  return true;
}

/**
 * Resolve the restaurant's AI language and, if it isn't English, append the
 * language directive to the narration's system prompt. Central here so every
 * surface (brief, weekly, wrap, review, action plan) localises the same way just
 * by passing its restaurantId — the fallback stays English, the safe net when the
 * model is offline. Best-effort: any failure leaves the prompt untouched.
 */
async function applyLanguage(messages, restaurantId) {
  if (!restaurantId) return messages;
  let directive = null;
  try {
    const code = await settingsRepo.getValue(restaurantId, 'ai_language');
    directive = languageDirective(code);
  } catch { /* leave the prompt in English */ }
  if (!directive) return messages;

  const out = messages.map((m) => ({ ...m }));
  const sys = out.find((m) => m.role === 'system');
  if (sys) sys.content = `${sys.content} ${directive}`;
  else out.unshift({ role: 'system', content: directive });
  return out;
}

/**
 * @param {Array<{role,content}>} messages  the strict narration prompt
 * @param {string} fallback                  the honest templated narrative
 * @param {{maxTokens?:number, temperature?:number, timeoutMs?:number, restaurantId?:string}} [opts]
 * @returns {Promise<{narrative:string, aiUsed:boolean, model:string|null}>}
 */
async function narrateOrFallback(messages, fallback, opts = {}) {
  // Cache by the prompt's content (which includes the signals), so the same brief
  // opened twice inside the window reuses one generation. Keyed per language too.
  const key = crypto
    .createHash('sha1')
    .update(JSON.stringify(messages) + '|' + (opts.restaurantId || '') + '|' + fallback)
    .digest('hex');
  return narrationCache.wrap(`narr:${key}`, NARRATION_TTL_MS, () => narrateOnce(messages, fallback, opts));
}

async function narrateOnce(messages, fallback, opts = {}) {
  if (await llm.reachable()) {
    messages = await applyLanguage(messages, opts.restaurantId);
    try {
      const res = await llm.chat(messages, {
        temperature: opts.temperature ?? 0.4,
        // A short narrated read needs far fewer tokens than a long answer; the
        // tighter cap keeps a local 7B's generation comfortably inside budget.
        maxTokens: opts.maxTokens ?? 180,
        // At least one attempt — postCompletions' loop runs `attempt <= retries`,
        // so retries:0 would never fire a request and always fall through.
        retries: 1,
        // Sized to let the narration finish while staying under the client's
        // request timeout; past this the templated fallback already stands.
        timeoutMs: opts.timeoutMs ?? 18_000,
      });
      const text = (res.content || '').trim();
      // The model may phrase the figures, never invent them. A narration with a
      // rupee amount or percentage the signals don't contain is discarded for the
      // honest template — the prompt's rule, enforced instead of merely asked.
      if (text && figuresGrounded(text, allowedNumbers(messages))) {
        return { narrative: text, aiUsed: true, model: llm.LLM_MODEL };
      }
    } catch {
      // Fall through to the templated fallback; the surface must never fail
      // because the model did.
    }
  }
  return { narrative: fallback, aiUsed: false, model: null };
}

module.exports = { narrateOrFallback, figuresGrounded, allowedNumbers };
