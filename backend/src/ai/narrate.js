// Shared narration-or-fallback: the one place the "let the model phrase these
// deterministic figures, but never let it fail the surface" contract lives.
//
// The Daily Brief, the Weekly Review and the Review Analysis all narrate a set
// of figures the app already computed. Each passes its own strict prompt and its
// own honest templated fallback; this helper only decides whether the model gets
// to speak (reachable + fast enough) and hands back the fallback otherwise. It
// depends on nothing but the LLM client, so any service can use it without
// pulling in another surface's dependencies (and without a require cycle).

const llm = require('./llm.client');
const settingsRepo = require('../settings/settings.repository');
const { languageDirective } = require('../shared/ai-languages');

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
      if (text) return { narrative: text, aiUsed: true, model: llm.LLM_MODEL };
    } catch {
      // Fall through to the templated fallback; the surface must never fail
      // because the model did.
    }
  }
  return { narrative: fallback, aiUsed: false, model: null };
}

module.exports = { narrateOrFallback };
