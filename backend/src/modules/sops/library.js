/**
 * SOP library and version control — ported from `modules/sops/library.ts`.
 *
 * The templates below ARE the SOPs when no model is available: real procedures,
 * written to be followed, not placeholder text. That was the source's design and
 * it is worth keeping — a "generate" button that produces nothing without an API
 * key leaves the operator with no procedure at all, which is worse than a
 * generic one.
 *
 * In POS the model is a local one (Yumzy / LM Studio), so generation is
 * available at no cost. The templates remain the grounding and the fallback.
 */

const SOP_TOPICS = [
  {
    slug: 'opening',
    title: 'Opening procedure',
    template: `## Purpose
Bring the restaurant from closed to service-ready, the same way every day.

## Steps
1. Unlock, disarm, switch on lights and ventilation.
2. Check fridge and freezer temperatures; log them. Anything above 5C (fridge) or -15C (freezer): move stock, flag to the manager.
3. Inspect for pest activity before any food comes out.
4. Sanitize all prep surfaces and cutting boards.
5. Confirm handwash stations have soap and paper towels.
6. Complete the opening shift checklist in CookLyt and sign off.
7. Brief the team: today's specials, 86'd items, reservations, any table allergens already on file.

## Owner
Opening manager. Escalate failures to the owner before service starts.`,
  },
  {
    slug: 'closing',
    title: 'Closing procedure',
    template: `## Purpose
Leave the kitchen safe, clean, and ready for tomorrow's opening.

## Steps
1. Stop new orders; finish and serve everything already fired.
2. Label, date, and refrigerate all usable prepped food. When in doubt, throw it out.
3. Clean and sanitize all surfaces, equipment, and floors.
4. Empty, wash, and re-line all bins; waste out to the collection point.
5. Run the dishwasher's final cycle; leave it open to dry.
6. Check fridge/freezer doors are sealed; log closing temperatures.
7. Complete the closing shift checklist in CookLyt and sign off.
8. Switch off equipment (not refrigeration), lights, lock up, arm the alarm.

## Owner
Closing manager. The sign-off is the handover to tomorrow's opener.`,
  },
  {
    slug: 'allergen-handling',
    title: 'Allergen handling',
    template: `## Purpose
No guest is ever served a dish containing their declared allergen. This is the
one procedure where "almost" is a failure.

## Steps
1. Table allergens appear on the CookLyt table card and on the order's kitchen note. Read them BEFORE firing any dish for that table.
2. Use dedicated boards and utensils for allergen-free preparation; wash hands and change gloves before starting.
3. Never fry allergen-free items in shared oil that has cooked the allergen.
4. If cross-contact happens or is suspected: remake the dish. Never scrape off, pick out, or serve anyway.
5. When a guest asks whether a dish contains an allergen and you are not certain, check the menu disclosure in CookLyt. Do not guess.

## Owner
Every cook individually. The expediter confirms allergen tickets before pass.`,
  },
  {
    slug: 'goods-receiving',
    title: 'Goods receiving',
    template: `## Purpose
Nothing enters the kitchen that should not, and every delivery is recorded
against what was ordered.

## Steps
1. Check the delivery against the purchase order in CookLyt before signing anything.
2. Reject chilled goods above 5C, frozen goods showing thaw, and any damaged or undated packaging.
3. Record short deliveries and substitutions on the order rather than accepting them silently.
4. Mark the order received in CookLyt. This books the stock and updates ingredient costs.
5. Move chilled and frozen items into storage first, within fifteen minutes of arrival.
6. Rotate stock front-to-back so the oldest is used first.

## Owner
Whoever accepts the delivery signs for it, by name.`,
  },
  {
    slug: 'food-waste',
    title: 'Food waste handling',
    template: `## Purpose
Waste is recorded honestly so the kitchen can find out why it happens.

## Steps
1. Log every discard in CookLyt at the moment it happens, with the real reason.
2. Use the true reason code. Over-prep, spoilage and spill are different problems with different fixes; recording them all as "other" makes the pattern invisible.
3. Never adjust a waste log to make a shift look better. The number is only useful if it is true.
4. Anything discarded for a safety reason is escalated to the manager the same shift.

## Owner
The person who discards it logs it. The closing manager reviews the day's log.`,
  },
];

const SLUGS = SOP_TOPICS.map((t) => t.slug);

/**
 * The active SOP per slug: the highest version, with earlier ones kept as
 * history. Nothing is edited in place, so a past revision stays readable.
 */
function activeVersions(rows) {
  const bySlug = new Map();
  for (const row of rows) {
    const current = bySlug.get(row.slug);
    if (!current || row.version > current.version) bySlug.set(row.slug, row);
  }
  return bySlug;
}

/**
 * Every topic, whether or not the operator has saved one — an unwritten SOP is
 * the most important row on the page, so a missing topic appears with its
 * template rather than being omitted.
 */
function buildLibrary(rows) {
  const active = activeVersions(rows);
  const versionCounts = rows.reduce((map, r) => {
    map.set(r.slug, (map.get(r.slug) || 0) + 1);
    return map;
  }, new Map());

  return SOP_TOPICS.map((topic) => {
    const saved = active.get(topic.slug);
    return {
      slug: topic.slug,
      title: saved?.title || topic.title,
      content: saved?.content || topic.template,
      version: saved?.version || 0,
      source: saved?.source || 'template',
      savedAt: saved?.created_at || null,
      versionCount: versionCounts.get(topic.slug) || 0,
      // version 0 means nothing has been adopted yet and what is shown is the
      // built-in template, not this restaurant's procedure.
      adopted: Boolean(saved),
    };
  });
}

const templateFor = (slug) => SOP_TOPICS.find((t) => t.slug === slug) || null;

module.exports = { SOP_TOPICS, SLUGS, activeVersions, buildLibrary, templateFor };
