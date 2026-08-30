/**
 * Shared page primitives — the card, label and table styles that had been
 * copy-pasted into the top of nearly every admin page.
 *
 * Extracted so a new page imports them instead of redeclaring them, and so a
 * change to the look lands in one place. The values are the ones the forecast /
 * finance pages already used, kept identical on purpose: this is a de-duplication,
 * not a restyle.
 */

export const CARD = {
  border: '1px solid var(--line)', borderRadius: 12,
  background: 'var(--paper)', padding: '18px 20px', minWidth: 0,
};

export const LABEL = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '.12em', color: 'var(--label)',
};

export const th = {
  padding: '8px 11px', textAlign: 'left', fontSize: 10, fontWeight: 600,
  color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em',
  whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)',
};

export const td = { padding: '9px 11px', fontSize: 12.5, color: 'var(--ink)' };

export const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
