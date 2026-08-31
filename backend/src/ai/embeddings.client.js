// Embeddings client — the OpenAI-compatible /embeddings endpoint, same provider
// config as the chat client. Local by default (LM Studio serves nomic-embed);
// swap the model/host via env in production. Kept separate from llm.client so a
// caller that only needs vectors doesn't pull in the chat machinery.

const { AppError } = require('../shared/errors');

const BASE_URL   = (process.env.LLM_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
const EMBED_MODEL = process.env.LLM_EMBED_MODEL || 'text-embedding-nomic-embed-text-v1.5';
const API_KEY    = process.env.LLM_API_KEY || 'ollama';
const TIMEOUT_MS = Number(process.env.LLM_EMBED_TIMEOUT_MS) || 30_000;

/**
 * Embed one or more strings. Returns an array of vectors (arrays of floats), in
 * the same order as the input. Throws AppError on failure so callers can degrade.
 * @param {string|string[]} input
 * @returns {Promise<number[][]>}
 */
async function embed(input, { timeoutMs = TIMEOUT_MS } = {}) {
  const texts = Array.isArray(input) ? input : [input];
  if (!texts.length) return [];

  let res;
  try {
    res = await fetch(`${BASE_URL}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new AppError(`Embedding service unreachable: ${err.message}`, 503);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new AppError(`Embedding request failed (${res.status}): ${t.slice(0, 200)}`, 502);
  }
  const json = await res.json();
  // The API may return data out of order; sort by index to be safe.
  const data = [...(json.data || [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return data.map((d) => d.embedding);
}

/** One vector for one string. */
async function embedOne(text, opts) {
  const [vec] = await embed([text], opts);
  return vec || null;
}

/** Fast liveness probe — true if the endpoint answers within `timeoutMs`. */
async function reachable(timeoutMs = 1500) {
  return fetch(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
    signal: AbortSignal.timeout(timeoutMs),
  }).then((r) => r.ok).catch(() => false);
}

module.exports = { embed, embedOne, reachable, EMBED_MODEL };
