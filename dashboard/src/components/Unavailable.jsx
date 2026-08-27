import { Link } from 'react-router-dom';
import { Hourglass, Globe, Camera, KeyRound, Upload, ArrowRight } from 'lucide-react';
import { REASON } from '../lib/plannedFeatures';
import { useSnapshotCoverage } from '../hooks/useSnapshots';

/**
 * The prose-only shell, and the history meter that both shells share.
 *
 * This was once the component every not-yet-possible screen rendered. Since
 * 2026-08-27 those screens render <FeatureShell> instead, which shows the real
 * page with every value empty and keeps this file's banner above it. This
 * remains the fallback for a feature registered without a layout — a state
 * `npm run check:planned` fails on, so it should not occur.
 *
 * The rule that matters more than any styling decision here: **nothing on this
 * page may be invented.** No dimmed sample charts, no skeleton rows, no
 * placeholder figures shaped like real ones. An empty page that explains itself
 * is honest; a greyed-out dashboard full of plausible numbers is the thing that
 * eventually gets screenshotted and believed.
 *
 * The single exception is the `collecting` meter, and it is not an exception at
 * all: it renders a true count of closed trading days actually stored, read from
 * /api/snapshots/coverage. That figure makes the wait visible instead of
 * pretending it isn't happening.
 */

const PRESENTATION = {
  [REASON.COLLECTING]: {
    Icon: Hourglass,
    kicker: 'Collecting history',
    tone: 'var(--info)',
    toneSoft: 'var(--info-soft)',
  },
  [REASON.NEEDS_INFRASTRUCTURE]: {
    Icon: Globe,
    kicker: 'Not available',
    tone: 'var(--mute)',
    toneSoft: 'var(--hover)',
  },
  [REASON.NEEDS_HARDWARE]: {
    Icon: Camera,
    kicker: 'Needs hardware',
    tone: 'var(--mute)',
    toneSoft: 'var(--hover)',
  },
  [REASON.NEEDS_CREDENTIALS]: {
    Icon: KeyRound,
    kicker: 'Needs credentials',
    tone: 'var(--warn)',
    toneSoft: 'var(--warn-soft)',
  },
  [REASON.NEEDS_UPLOAD]: {
    Icon: Upload,
    kicker: 'Waiting on a file',
    tone: 'var(--warn)',
    toneSoft: 'var(--warn-soft)',
  },
};

/**
 * Real progress, or an honest silence.
 *
 * If coverage hasn't loaded or the request failed, this renders nothing rather
 * than guessing at a number — a wrong progress figure would be exactly the kind
 * of invented data the rest of the page exists to avoid.
 */
export function HistoryMeter({ compact = false }) {
  const { data, isLoading, isError } = useSnapshotCoverage();
  if (isLoading || isError || !data) return null;

  const { days, requiredDays, remainingDays, firstDay, ready } = data;
  const pct = requiredDays > 0 ? Math.min(100, (days / requiredDays) * 100) : 0;

  return (
    <div style={compact
      ? { marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }
      : { marginTop: 22, padding: '16px 18px', background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>
          History collected
        </span>
        <span style={{ fontSize: 13, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
          {days} of {requiredDays} days
        </span>
      </div>

      <div style={{ marginTop: 10, height: 6, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--info)', borderRadius: 999, transition: 'width .4s ease' }} />
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
        {ready
          ? 'Enough history has accumulated. This screen is ready to be built.'
          : days === 0
            ? 'Collection starts with your first day of orders and runs nightly from then on.'
            : `Counting closed trading days${firstDay ? ` since ${firstDay}` : ''}. ` +
              `About ${remainingDays} more before this can say anything worth acting on.`}
      </p>
    </div>
  );
}

export default function Unavailable({ title, summary, reason, blocker, alternative }) {
  const { Icon, kicker, tone, toneSoft } = PRESENTATION[reason] || PRESENTATION[REASON.NEEDS_INFRASTRUCTURE];

  return (
    <div style={{ padding: '32px 24px', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 999,
          background: toneSoft, color: tone,
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em',
        }}>
          <Icon size={13} strokeWidth={2.2} />
          {kicker}
        </span>
      </div>

      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>
        {title}
      </h1>

      <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.65, color: 'var(--ink-2)' }}>
        {summary}
      </p>

      <div style={{
        marginTop: 22, padding: '14px 18px',
        borderLeft: `2px solid ${tone}`, background: 'var(--paper-2)',
        borderRadius: '0 8px 8px 0',
      }}>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--mute)' }}>
          {blocker}
        </p>
      </div>

      {reason === REASON.COLLECTING && <HistoryMeter />}

      {alternative && (
        <Link
          to={alternative.to}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 22,
            fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none',
            borderBottom: '1px solid var(--line-2)', paddingBottom: 2,
          }}
        >
          {alternative.label}
          <ArrowRight size={14} strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}
