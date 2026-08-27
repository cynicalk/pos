/**
 * Hygiene and shift checklists — ported from `modules/compliance/checklist.ts`
 * and `modules/sops/shift-checklist.ts`, merged because they are the same shape:
 * a fixed list of items, a set of ticks, and a signature.
 *
 * The item lists are FSSAI Schedule 4 requirements. They are code, not data,
 * deliberately: an operator editing the list would be editing what they are
 * audited against, and a checklist that can be shortened to make itself pass is
 * not a checklist.
 */

const CHECKLIST_ITEMS = [
  { id: 'surfaces',     label: 'Kitchen surfaces cleaned and sanitized' },
  { id: 'storage_temp', label: 'Fridge/freezer temperatures checked and logged' },
  { id: 'raw_cooked',   label: 'Raw and cooked food stored separately' },
  { id: 'handwash',     label: 'Handwash stations stocked (soap + sanitizer)' },
  { id: 'waste',        label: 'Waste bins emptied and covered' },
  { id: 'pest_check',   label: 'No pest activity observed' },
  { id: 'grooming',     label: 'Staff grooming: uniforms, hair covers, no jewellery' },
  { id: 'water',        label: 'Potable water source verified' },
];

const SHIFT_ITEMS = {
  opening: [
    { id: 'temps_logged',       label: 'Fridge/freezer temperatures checked and logged' },
    { id: 'pest_inspection',    label: 'Pest inspection done before food out' },
    { id: 'surfaces_sanitized', label: 'Prep surfaces cleaned and sanitized' },
    { id: 'handwash_stocked',   label: 'Handwash stations stocked' },
    { id: 'team_briefed',       label: "Team briefed: specials, 86'd items, allergens" },
  ],
  closing: [
    { id: 'food_labelled',   label: 'Prepped food labelled, dated, refrigerated' },
    { id: 'surfaces_closed', label: 'Surfaces, equipment and floors cleaned' },
    { id: 'bins_out',        label: 'Bins emptied, washed and re-lined' },
    { id: 'temps_closing',   label: 'Closing fridge/freezer temperatures logged' },
    { id: 'secured',         label: 'Equipment off, premises locked and armed' },
  ],
};

const SHIFTS = Object.keys(SHIFT_ITEMS);

/** Keep only ids that exist, so a client cannot invent a passing tick. */
function sanitizeChecked(checkedIds, items) {
  const valid = new Set(items.map((i) => i.id));
  return [...new Set((checkedIds || []).filter((id) => valid.has(id)))];
}

/** Turn a stored compliance_doc row into a checklist record. */
function parseRecord(doc, items) {
  const checked = Array.isArray(doc.metadata?.checked) ? doc.metadata.checked : [];
  const checkedIds = sanitizeChecked(checked, items);
  const missed = items.filter((i) => !checkedIds.includes(i.id));

  return {
    id: doc.id,
    date: doc.created_at,
    signedBy: doc.signed_by || null,
    checkedIds,
    missed: missed.map((i) => ({ id: i.id, label: i.label })),
    allPassed: checkedIds.length === items.length,
  };
}

/**
 * Which items keep failing across recent sign-offs.
 *
 * A single miss is an incident; the same item missed repeatedly is a procedure
 * that is not working, which is what drift detection acts on.
 */
function repeatFailures(records, items) {
  const counts = new Map();
  for (const record of records) {
    for (const item of items) {
      if (!record.checkedIds.includes(item.id)) {
        counts.set(item.id, (counts.get(item.id) || 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([id, fails]) => ({
      id, fails, label: items.find((i) => i.id === id)?.label || id,
    }))
    .sort((a, b) => b.fails - a.fails);
}

/** Days in the window that carry at least one shift sign-off. */
function shiftCoverage(records, windowDays) {
  const days = new Set(
    records.map((r) => new Date(r.created_at).toISOString().slice(0, 10)),
  );
  return {
    windowDays,
    daysCovered: days.size,
    totalSignoffs: records.length,
  };
}

module.exports = {
  CHECKLIST_ITEMS, SHIFT_ITEMS, SHIFTS,
  sanitizeChecked, parseRecord, repeatFailures, shiftCoverage,
};
