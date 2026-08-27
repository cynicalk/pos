import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CATALOGUE, FAMILIES, TIERS } from '@shared/catalogue';

/**
 * The feature catalogue, on screen — the internal source of truth for what
 * CookLyt actually does, read straight from shared/catalogue.js.
 *
 * This is the honest answer to "is X built?". The deck claims 86 features and
 * 52 live at launch; this page shows the reconciled reality against the code,
 * so a demo, a deck revision or a roadmap conversation all argue from the same
 * numbers rather than from memory. Admin-only, read-only.
 *
 * It renders the catalogue rather than restating it, so it cannot drift from
 * the registry the build guard protects.
 */

const STATUS = {
  built:         { label: 'Built',      tone: 'var(--ok)',   bg: 'var(--ok-soft)',   blurb: 'Working end-to-end' },
  partial:       { label: 'Partial',    tone: 'var(--warn)', bg: 'var(--warn-soft)', blurb: 'Real, narrower than the deck' },
  shell:         { label: 'Shell',      tone: 'var(--info)', bg: 'var(--info-soft)', blurb: 'Honest empty screen, real route' },
  absent:        { label: 'Absent',     tone: 'var(--bad)',  bg: 'var(--bad-soft)',  blurb: 'Nothing implements it' },
  external:      { label: 'Guest app',  tone: 'var(--mute)', bg: 'var(--paper-3)',   blurb: 'Separate repo' },
  'blocked-ext': { label: 'Blocked',    tone: 'var(--bad)',  bg: 'var(--bad-soft)',  blurb: 'Needs a network, feed or partner' },
};

const ORDER = ['built', 'partial', 'shell', 'external', 'blocked-ext', 'absent'];

const CARD = { border: '1px solid var(--line)', borderRadius: 10, background: 'var(--paper)' };
const LABEL = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '.1em', color: 'var(--label)',
};

function Chip({ status }) {
  const s = STATUS[status] || STATUS.absent;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 5, whiteSpace: 'nowrap',
      fontSize: 11, fontWeight: 600, background: s.bg, color: s.tone,
    }}>
      {s.label}
    </span>
  );
}

export default function FeatureStatus() {
  const [filter, setFilter] = useState(null);

  const counts = useMemo(() => {
    const c = {};
    for (const f of CATALOGUE) c[f.status] = (c[f.status] || 0) + 1;
    return c;
  }, []);

  const shown = filter ? CATALOGUE.filter((f) => f.status === filter) : CATALOGUE;
  const byFamily = useMemo(() => {
    const m = new Map(FAMILIES.map((fam) => [fam, []]));
    for (const f of shown) m.get(f.family)?.push(f);
    return m;
  }, [shown]);

  return (
    <div style={{ padding: '26px 24px 48px', maxWidth: 1080, margin: '0 auto' }}>

      <div style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>
          Feature status
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 720 }}>
          The 86 features from the overview deck, reconciled against the code. Status is
          what the POS actually does today, not what the deck sells — every difference from
          the archived registry is recorded on the feature itself.
        </p>
      </div>

      {/* Summary — click to filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '20px 0 26px' }}>
        {ORDER.map((st) => {
          const s = STATUS[st];
          const active = filter === st;
          return (
            <button
              key={st}
              onClick={() => setFilter(active ? null : st)}
              style={{
                ...CARD, padding: '13px 16px', cursor: 'pointer', textAlign: 'left',
                flex: '1 1 150px', minWidth: 0, fontFamily: 'inherit',
                outline: active ? `2px solid ${s.tone}` : 'none', outlineOffset: 1,
              }}
            >
              <div className="mono num" style={{ fontSize: 26, fontWeight: 700, color: s.tone, lineHeight: 1 }}>
                {counts[st] || 0}
              </div>
              <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{s.label}</div>
              <div style={{ marginTop: 2, fontSize: 11, color: 'var(--mute)', lineHeight: 1.4 }}>{s.blurb}</div>
            </button>
          );
        })}
      </div>

      {filter && (
        <p style={{ margin: '0 0 18px', fontSize: 12.5, color: 'var(--mute)' }}>
          Showing {STATUS[filter].label.toLowerCase()} only ·{' '}
          <button
            onClick={() => setFilter(null)}
            style={{ border: 0, background: 'none', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, textDecoration: 'underline' }}
          >
            show all
          </button>
        </p>
      )}

      {/* By family */}
      <div style={{ display: 'grid', gap: 16 }}>
        {FAMILIES.map((fam) => {
          const rows = byFamily.get(fam) || [];
          if (!rows.length) return null;
          return (
            <div key={fam} style={{ ...CARD, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{fam}</h2>
                <span style={{ ...LABEL, color: 'var(--mute)' }}>{rows.length}</span>
              </div>
              <div style={{ display: 'grid', gap: 1, background: 'var(--line)', borderRadius: 7, overflow: 'hidden' }}>
                {rows.map((f) => (
                  <div key={f.slug} style={{
                    background: 'var(--paper)', padding: '11px 13px',
                    display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '4px 12px', alignItems: 'start',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{f.name}</div>
                      {f.note && (
                        <div style={{ marginTop: 3, fontSize: 12, color: 'var(--mute)', lineHeight: 1.5 }}>{f.note}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                      <Chip status={f.status} />
                      <span style={{ fontSize: 10.5, color: 'var(--mute)', whiteSpace: 'nowrap' }}>
                        {TIERS[f.tier]?.label} · P{f.phase}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: 26, fontSize: 12, color: 'var(--mute)', lineHeight: 1.6 }}>
        Source: <code style={{ fontFamily: 'var(--mono, monospace)' }}>shared/catalogue.js</code>, guarded by{' '}
        <code style={{ fontFamily: 'var(--mono, monospace)' }}>npm run check:catalogue</code>. Shells link through to
        their live screens under <Link to="/more" style={{ color: 'var(--ink)' }}>More</Link>.
      </p>
    </div>
  );
}
