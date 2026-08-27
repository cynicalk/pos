/**
 * Menu translation (MERGE_PLAN.md Phase 7).
 *
 * Pure: the language list, the prompt, and the validation of what comes back.
 * The database and the model call live in the service.
 *
 * Translations are CACHED on the item, so rendering the guest menu card costs
 * zero model calls — a guest scanning a QR code at a table must not wait on a
 * local 7B, and the same reasoning that moved review classification off the
 * request path applies here with more force.
 */

// Kept short and deliberate. Every language here is one an operator can
// plausibly check: a translation nobody in the restaurant can read is a
// translation nobody can catch when it is wrong.
const MENU_LANGUAGES = [
  { code: 'hi', label: 'हिन्दी',    english: 'Hindi' },
  { code: 'kn', label: 'ಕನ್ನಡ',     english: 'Kannada' },
  { code: 'ta', label: 'தமிழ்',      english: 'Tamil' },
  { code: 'fr', label: 'Français',  english: 'French' },
  { code: 'ja', label: '日本語',      english: 'Japanese' },
];

const isSupported = (code) => MENU_LANGUAGES.some((l) => l.code === code);

const languageFor = (code) => MENU_LANGUAGES.find((l) => l.code === code) || null;

/**
 * The instruction given to the model.
 *
 * "Transliterate proper nouns" is the load-bearing part, carried over from the
 * source: a model asked to translate "Butter Naan" into French will happily
 * invent "Pain au Beurre", and a guest then orders a dish the kitchen has never
 * heard of. Dish names must stay orderable across the counter.
 */
function buildPrompt(language) {
  const lang = languageFor(language);
  return `You translate Indian restaurant menu items into ${lang.english} for visitors.\n`
    + 'Rules:\n'
    + '- Keep dish NAMES recognisable. Transliterate proper nouns — biryani, dosa, paneer, '
    + 'naan — rather than inventing a translated dish name. A guest has to be able to say '
    + 'the name out loud and be understood by the staff.\n'
    + '- Translate the DESCRIPTIONS naturally into fluent language.\n'
    + '- Do not add ingredients, spice levels, or claims that are not in the original.\n'
    + '- If a description is empty, return an empty string for it.\n'
    + 'Reply with ONLY a JSON array, one object per numbered item, in the same order: '
    + '[{"name":"...","description":"..."}]. No other text.';
}

/** The items, numbered, as the model sees them. */
function buildItemList(items) {
  return items
    .map((item, i) => `${i + 1}. ${item.name}${item.description ? ` — ${item.description}` : ''}`)
    .join('\n');
}

/**
 * Validate a model response into usable entries, or null.
 *
 * Null on ANY doubt, exactly as the review classifier does — and for the same
 * reason. A list of the wrong length would shift every translation onto the
 * wrong dish, which on a menu means a guest reading the allergen-free dish's
 * name above the one with peanuts in it.
 */
function parseTranslations(content, expectedCount) {
  const match = String(content || '').match(/\[[\s\S]*\]/);
  if (!match) return null;

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length !== expectedCount) return null;

  const entries = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') return null;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    // An entry with no name is unusable — the dish would render blank on the
    // card. Reject the whole batch rather than serving a nameless dish.
    if (!name) return null;
    entries.push({
      name,
      description: typeof entry.description === 'string' ? entry.description.trim() : '',
    });
  }
  return entries;
}

/**
 * Apply a cached translation to an item for display.
 *
 * Falls back to English per FIELD, not per item: a dish whose name translated
 * but whose description did not should show the translated name and the English
 * description, rather than reverting both.
 */
function localise(item, language) {
  const entry = (item.translations || {})[language];
  if (!entry) return { name: item.name, description: item.description, translated: false };
  return {
    name: entry.name || item.name,
    description: entry.description || item.description,
    translated: true,
  };
}

module.exports = {
  MENU_LANGUAGES,
  isSupported,
  languageFor,
  buildPrompt,
  buildItemList,
  parseTranslations,
  localise,
};
