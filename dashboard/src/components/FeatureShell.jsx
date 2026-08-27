import { Link } from 'react-router-dom';
import { Hourglass, Globe, Camera, KeyRound, Upload, ArrowRight, ChevronDown, Info } from 'lucide-react';
import { REASON } from '../lib/plannedFeatures';
import { HistoryMeter } from './Unavailable';

/**
 * The real screen behind a Tier-3 feature, rendered with nothing in it.
 *
 * The original shells rendered prose only, on the rule that a greyed-out
 * dashboard full of plausible numbers is the thing that eventually gets
 * screenshotted and believed. That rule stands, but it was doing more work than
 * it needed to: it is the *numbers* that must not be invented, not the layout.
 * A screen that shows its filters, its figures, its axes and its columns —
 * every one of them empty — tells an operator what they will get without
 * asserting a single thing that is not true.
 *
 * The invariants, all of them enforced rather than intended:
 *
 *   - No value slot ever contains anything but an em dash. There is no prop by
 *     which a caller could put a figure into one.
 *   - Tables render their headers and an empty body. There are no skeleton
 *     rows, because a row of grey bars reads as data still loading.
 *   - The chart draws axes and their labels, and says plainly that there is no
 *     series in them. It never draws a line.
 *   - Every control is inert and marked `disabled`, so it cannot be mistaken
 *     for a filter that failed to apply.
 *   - The banner above the preview is not dismissible and is not below the
 *     fold. Whatever gets screenshotted, it is in the frame.
 *
 * The single real number any of these screens may show is the history meter,
 * which reads measured coverage from /api/snapshots/coverage.
 */

const PRESENTATION = {
  [REASON.COLLECTING]: {
    Icon: Hourglass, kicker: 'Collecting history',
    tone: 'var(--info)', toneSoft: 'var(--info-soft)',
  },
  [REASON.NEEDS_INFRASTRUCTURE]: {
    Icon: Globe, kicker: 'Not available',
    tone: 'var(--mute)', toneSoft: 'var(--hover)',
  },
  [REASON.NEEDS_HARDWARE]: {
    Icon: Camera, kicker: 'Needs hardware',
    tone: 'var(--mute)', toneSoft: 'var(--hover)',
  },
  [REASON.NEEDS_CREDENTIALS]: {
    Icon: KeyRound, kicker: 'Needs credentials',
    tone: 'var(--warn)', toneSoft: 'var(--warn-soft)',
  },
  [REASON.NEEDS_UPLOAD]: {
    Icon: Upload, kicker: 'Waiting on a file',
    tone: 'var(--warn)', toneSoft: 'var(--warn-soft)',
  },
};

/** The only thing a value slot on this page is ever allowed to be. */
const BLANK = '—';

const card = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  // Grid and flex children default to `min-width: auto`, so a card holding a
  // seven-column table refuses to shrink and drags the whole page sideways on a
  // phone. Caught on live output at mobile width, not by anything else.
  minWidth: 0,
};

const sectionTitle = {
  margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--ink)',
};

const captionStyle = {
  margin: '0 0 10px', fontSize: 12, lineHeight: 1.55, color: 'var(--mute)', maxWidth: 760,
};

const th = {
  padding: '8px 11px', textAlign: 'left', fontSize: 10, fontWeight: 600,
  color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em',
  whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)',
};

/** An inert control. Disabled so nothing reads as a filter that silently failed. */
function DeadFilter({ label }) {
  return (
    <button
      type="button"
      disabled
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 11px', borderRadius: 7,
        border: '1px dashed var(--line-2)', background: 'transparent',
        color: 'var(--mute)', fontSize: 12.5, cursor: 'not-allowed',
      }}
    >
      {label}
      <ChevronDown size={13} strokeWidth={2} />
    </button>
  );
}

function Kpi({ label, hint }) {
  return (
    <div style={{ ...card, padding: '13px 15px', minWidth: 0 }}>
      <div style={{
        fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '.06em', color: 'var(--mute)',
      }}>
        {label}
      </div>
      <div style={{
        marginTop: 7, fontSize: 25, fontWeight: 500, lineHeight: 1.1,
        color: 'var(--line-2)', fontVariantNumeric: 'tabular-nums',
      }}>
        {BLANK}
      </div>
      {hint && (
        <div style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.5, color: 'var(--mute)' }}>
          {hint}
        </div>
      )}
    </div>
  );
}

/**
 * Axes and their labels, and an explicit statement that there is no series in
 * them. Deliberately not a sparkline of zeros — a flat line at the bottom of a
 * chart is a claim that trade was nil.
 */
function EmptyChart({ title, x, y }) {
  return (
    <div style={{ ...card, padding: '14px 16px' }}>
      <h3 style={sectionTitle}>{title}</h3>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <div style={{
          writingMode: 'vertical-rl', transform: 'rotate(180deg)',
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '.06em', color: 'var(--mute)',
          display: 'flex', alignItems: 'center',
        }}>
          {y}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            height: 168,
            borderLeft: '1px solid var(--line-2)',
            borderBottom: '1px solid var(--line-2)',
            background:
              'repeating-linear-gradient(to top, transparent, transparent 41px, var(--line) 41px, var(--line) 42px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 12, color: 'var(--mute)' }}>No series to plot yet</span>
          </div>
          <div style={{
            marginTop: 6, textAlign: 'center',
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '.06em', color: 'var(--mute)',
          }}>
            {x}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyTable({ title, caption, columns }) {
  return (
    <div style={{ ...card, padding: '14px 16px' }}>
      <h3 style={sectionTitle}>{title}</h3>
      {caption && <p style={captionStyle}>{caption}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr>{columns.map((c) => <th key={c} style={th}>{c}</th>)}</tr>
          </thead>
          <tbody>
            <tr>
              <td
                colSpan={columns.length}
                style={{ padding: '26px 11px', textAlign: 'center', fontSize: 12.5, color: 'var(--mute)' }}
              >
                Nothing to show — no rows exist for this yet
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A definition list of empty fields — used for the Tally connection card. */
function EmptyStatus({ title, rows }) {
  return (
    <div style={{ ...card, padding: '14px 16px' }}>
      <h3 style={{ ...sectionTitle, marginBottom: 10 }}>{title}</h3>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '9px 20px' }}>
        {rows.map((r) => (
          <div key={r} style={{ display: 'contents' }}>
            <dt style={{ fontSize: 12, color: 'var(--mute)' }}>{r}</dt>
            <dd style={{ margin: 0, fontSize: 12.5, color: 'var(--line-2)' }}>{BLANK}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Panel({ title, body }) {
  return (
    <div style={{ ...card, padding: '14px 16px', background: 'var(--paper-2)' }}>
      <h3 style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Info size={13} strokeWidth={2} style={{ color: 'var(--mute)', flexShrink: 0 }} />
        {title}
      </h3>
      <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--mute)' }}>
        {body}
      </p>
    </div>
  );
}

export default function FeatureShell({ title, summary, reason, blocker, alternative, layout }) {
  const { Icon, kicker, tone, toneSoft } =
    PRESENTATION[reason] || PRESENTATION[REASON.NEEDS_INFRASTRUCTURE];

  const { filters, kpis, chart, table, tableSecondary, status, panels } = layout;

  return (
    <div style={{ padding: '26px 24px 48px', maxWidth: 1080, margin: '0 auto' }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 999,
        background: toneSoft, color: tone,
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em',
      }}>
        <Icon size={13} strokeWidth={2.2} />
        {kicker}
      </span>

      <h1 style={{
        margin: '14px 0 0', fontSize: 24, fontWeight: 600,
        color: 'var(--ink)', letterSpacing: '-.01em',
      }}>
        {title}
      </h1>

      <p style={{
        margin: '10px 0 0', fontSize: 14.5, lineHeight: 1.62,
        color: 'var(--ink-2)', maxWidth: 760,
      }}>
        {summary}
      </p>

      {/* ── Why it is empty. Above the preview, and not dismissible. ────── */}
      <div style={{
        marginTop: 20, padding: '14px 18px',
        borderLeft: `2px solid ${tone}`, background: 'var(--paper-2)',
        borderRadius: '0 8px 8px 0', maxWidth: 800,
      }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--mute)' }}>
          {blocker}
        </p>
        {reason === REASON.COLLECTING && <HistoryMeter compact />}
      </div>

      {alternative && (
        <Link
          to={alternative.to}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16,
            fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none',
            borderBottom: '1px solid var(--line-2)', paddingBottom: 2,
          }}
        >
          {alternative.label}
          <ArrowRight size={14} strokeWidth={2} />
        </Link>
      )}

      {/* ── The screen itself ──────────────────────────────────────────── */}
      <div style={{
        marginTop: 30, paddingTop: 16,
        borderTop: '1px dashed var(--line-2)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap', marginBottom: 14,
        }}>
          <span style={{
            fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '.07em', color: 'var(--mute)',
          }}>
            The screen, with nothing in it
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>
            Every value is blank because none has been measured — nothing below is an example
          </span>
        </div>

        <div style={{ opacity: 0.92, display: 'grid', gap: 14, minWidth: 0 }}>
          {filters?.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {filters.map((f) => <DeadFilter key={f} label={f} />)}
            </div>
          )}

          {status && <EmptyStatus {...status} />}

          {kpis?.length > 0 && (
            <div style={{
              display: 'grid', gap: 12, minWidth: 0,
              gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
            }}>
              {kpis.map((k) => <Kpi key={k.label} {...k} />)}
            </div>
          )}

          {chart && <EmptyChart {...chart} />}
          {table && <EmptyTable {...table} />}
          {tableSecondary && <EmptyTable {...tableSecondary} />}

          {panels?.length > 0 && (
            <div style={{
              display: 'grid', gap: 12, minWidth: 0,
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            }}>
              {panels.map((p) => <Panel key={p.title} {...p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
