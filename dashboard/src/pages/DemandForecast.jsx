import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Hourglass, Info, TrendingUp, ArrowRight, Users } from 'lucide-react';
import { useDemandForecast, useCapacity } from '../hooks/useForecast';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Demand Forecast — the first of the forecasting family to stop being a shell.
 *
 * What this screen is careful about is not the arithmetic, which is a median
 * and a ratio, but the claims:
 *
 *   - **It says which model produced the number.** There is one, it is the
 *     seasonal-naive baseline, and the page says so in the header rather than
 *     leaving "forecast" to imply something learned. FORECASTING.md §VI.2:
 *     "Until it passes, the shipped forecast *is* the baseline and the UI says
 *     so."
 *   - **It leads with the range, not the point** (§VI.5). "Within the range" is
 *     a visible win; "off by six" is a loss. The band is the headline and the
 *     point sits inside it.
 *   - **It shows its own accuracy, at the grain it was measured** (§VI.3), next
 *     to the range that figure is normally expected to fall in — so a reader can
 *     tell a good week from a bad one without knowing the literature.
 *   - **It reports capacity separately** (§II.2). Sales are demand with a lid on
 *     it, and a full Saturday is a ceiling rather than an answer.
 */

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CARD = {
  border: '1px solid var(--line)', borderRadius: 12,
  background: 'var(--paper)', padding: '18px 20px', minWidth: 0,
};
const LABEL = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '.12em', color: 'var(--label)',
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DOW[dt.getUTCDay()]}, ${dt.getUTCDate()} ${dt.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
};

const shiftIso = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

function Note({ children, icon: Icon = Info }) {
  return (
    <p style={{
      display: 'flex', gap: 7, alignItems: 'flex-start',
      margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--mute)',
    }}>
      <Icon size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 3 }} />
      <span>{children}</span>
    </p>
  );
}

/** The weekday shape the model learned, which is the whole of what it knows. */
function WeekdayShape({ shape, targetDow }) {
  const known = shape.filter((s) => s.factor !== null);
  if (!known.length) return null;
  const max = Math.max(...known.map((s) => s.factor));

  return (
    <div style={CARD}>
      <div style={{ ...LABEL, marginBottom: 4 }}>What the model learned</div>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6 }}>
        One thing: how much each weekday trades relative to the recent level. It
        knows nothing about weather, festivals or offers.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 92 }}>
        {shape.map((s) => {
          const isTarget = s.dow === targetDow;
          const height = s.factor === null ? 0 : Math.round((s.factor / max) * 76);
          return (
            <div key={s.dow} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
              {s.factor === null ? (
                <div style={{
                  height: 76, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                  fontSize: 10, color: 'var(--mute-2)',
                }}>
                  n/a
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 10.5, color: 'var(--mute)', marginBottom: 4 }}>
                    {s.factor.toFixed(2)}
                  </div>
                  <div style={{
                    height, borderRadius: '4px 4px 0 0',
                    background: isTarget ? 'var(--ink)' : 'var(--line-2)',
                  }} />
                </>
              )}
              <div style={{
                marginTop: 6, fontSize: 10.5,
                color: isTarget ? 'var(--ink)' : 'var(--mute)',
                fontWeight: isTarget ? 600 : 400,
              }}>
                {DOW_SHORT[s.dow]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DemandForecast() {
  const { format, formatOrDash } = useCurrency();
  const [offset, setOffset] = useState(1); // days from today; 1 = tomorrow

  const { data, isLoading } = useDemandForecast();
  const targetDate = data ? shiftIso(data.date, offset - 1) : null;
  const dated = useDemandForecast(offset === 1 ? undefined : targetDate);
  const view = offset === 1 ? data : dated.data;
  const { data: capacity } = useCapacity();

  if (isLoading || !view) {
    return <div style={{ padding: 32, color: 'var(--mute)' }}>Loading…</div>;
  }

  const f = view.forecast;
  const targetDow = (() => {
    const [y, m, d] = view.date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  })();

  // Not enough history — the model refuses, and says so in its own words.
  if (f.point === null) {
    return (
      <div style={{ padding: '26px 24px', maxWidth: 780, margin: '0 auto' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          borderRadius: 999, background: 'var(--info-soft)', color: 'var(--info)',
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em',
        }}>
          <Hourglass size={13} strokeWidth={2.2} /> Collecting history
        </span>
        <h1 style={{ margin: '14px 0 0', fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>
          Demand Forecast
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-2)' }}>
          {f.tradingDays} closed trading days on record, and this needs{' '}
          {f.requiredDays} before it will say anything. A day-of-week shape drawn
          from fewer is a confident number with nothing underneath it.
          {f.closedDaysExcluded > 0 && ` ${f.closedDaysExcluded} closed day(s) are not counted — a kitchen that was shut did not trade badly, it did not trade.`}
        </p>
      </div>
    );
  }

  const hasBand = f.lo !== null && f.hi !== null;
  const acc = view.accuracy;
  const worseThanExpected = acc.wmape !== null && acc.wmape > acc.expected.high;

  return (
    <div style={{ padding: '26px 24px 48px', maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px',
            borderRadius: 999, background: 'var(--paper-3)', color: 'var(--mute)',
            fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em',
          }}>
            Baseline model
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>
            seasonal naive — weekday × recent level
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>
          Demand Forecast
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          {fmtDate(view.date)}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {[[1, 'Tomorrow'], [2, 'In two days'], [3, 'In three days']].map(([n, label]) => (
          <button
            key={n}
            onClick={() => setOffset(n)}
            style={{
              padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
              fontWeight: offset === n ? 600 : 500, fontFamily: 'inherit',
              border: `1px solid ${offset === n ? 'var(--ink)' : 'var(--line-2)'}`,
              background: offset === n ? 'var(--ink)' : 'transparent',
              color: offset === n ? 'var(--paper)' : 'var(--ink)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── The range, led with rather than buried (§VI.5) ───────────────── */}
      <div style={{ ...CARD, padding: '22px 24px' }}>
        <div style={{ ...LABEL, marginBottom: 12 }}>Expected takings</div>
        {hasBand ? (
          <>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="mono num" style={{
                fontSize: 30, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--ink)',
              }}>
                {format(f.lo)} – {format(f.hi)}
              </span>
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--mute)' }}>
              Most likely around <span className="mono num" style={{ color: 'var(--ink)', fontWeight: 600 }}>{format(f.point)}</span>
              {view.orders?.point !== null && (
                <> · roughly <span className="mono num" style={{ color: 'var(--ink)', fontWeight: 600 }}>{Math.round(view.orders.point)}</span> orders</>
              )}
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <Note>
                The range comes from this model's own errors on the last{' '}
                {f.residualCount} comparable days — measured, not assumed. Nine
                days in ten have landed inside a band built this way.
              </Note>
            </div>
          </>
        ) : (
          <>
            <span className="mono num" style={{ fontSize: 30, fontWeight: 700, color: 'var(--ink)' }}>
              {format(f.point)}
            </span>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <Note>
                No range yet. There are {f.residualCount} scored days behind this
                model, too few to measure how wide its errors run — so no interval
                is claimed rather than a guessed one being shown.
              </Note>
            </div>
          </>
        )}
      </div>

      {/* ── How it got there ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
        <div style={CARD}>
          <div style={LABEL}>Recent level</div>
          <div className="mono num" style={{ marginTop: 8, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>
            {formatOrDash(f.level)}
          </div>
          <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>
            Median of the last four trading weeks
          </div>
        </div>
        <div style={CARD}>
          <div style={LABEL}>{DOW[targetDow]} factor</div>
          <div className="mono num" style={{ marginTop: 8, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>
            {f.weekdayIsFlat ? '—' : `×${f.weekdayFactor.toFixed(2)}`}
          </div>
          <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>
            {f.weekdayIsFlat
              ? `Only ${f.weekdaySamples} ${DOW[targetDow]}s on record — too few to tilt the level, so it hasn't been`
              : `From ${f.weekdaySamples} ${DOW[targetDow]}s of trading`}
          </div>
        </div>
        <div style={CARD}>
          <div style={LABEL}>Measured error</div>
          <div className="mono num" style={{
            marginTop: 8, fontSize: 21, fontWeight: 600,
            color: worseThanExpected ? 'var(--warn)' : 'var(--ink)',
          }}>
            {acc.wmape === null ? '—' : `${acc.wmape.toFixed(1)}%`}
          </div>
          <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>
            {acc.wmape === null
              ? 'Not enough scored days to measure yet'
              : `Typical for a daily total is ${acc.expected.low}–${acc.expected.high}%. ${worseThanExpected ? 'This restaurant runs lumpier than that.' : 'This is within the usual range.'}`}
          </div>
        </div>
        <div style={CARD}>
          <div style={LABEL}>History behind it</div>
          <div className="mono num" style={{ marginTop: 8, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>
            {f.tradingDays} days
          </div>
          <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>
            {f.closedDaysExcluded > 0
              ? `${f.closedDaysExcluded} closed day(s) excluded — a shut kitchen is not a day of no demand`
              : 'No closures in the window'}
          </div>
        </div>
      </div>

      <WeekdayShape shape={view.weekdayShape} targetDow={targetDow} />

      {/* ── Capacity, kept firmly separate (§II.2) ───────────────────────── */}
      {capacity && (
        <div style={{ ...CARD, background: 'var(--paper-2)' }}>
          <div style={{ ...LABEL, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={12} strokeWidth={2} /> Room to serve it
          </div>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {[
              ['Seats', capacity.seats, `across ${capacity.tables} tables`],
              ['Average turn', capacity.avgTurnMinutes === null ? '—' : `${capacity.avgTurnMinutes} min`,
                capacity.turnSampleSize ? `from ${capacity.turnSampleSize} sittings` : 'not measured yet'],
              ['Cover ceiling', capacity.estimatedCoverCeiling ?? '—',
                capacity.ceilingBasis === 'not_enough_seated_history'
                  ? 'not enough seated history to estimate'
                  : 'seats × measured turns'],
              ['Left the queue', capacity.turnedAwayLast28Days, 'last four weeks'],
            ].map(([label, value, sub]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: 'var(--mute)' }}>{label}</div>
                <div className="mono num" style={{ marginTop: 4, fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
                  {value}
                </div>
                <div style={{ marginTop: 3, fontSize: 11, color: 'var(--mute)', lineHeight: 1.4 }}>{sub}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <Note>{capacity.note}</Note>
          </div>
        </div>
      )}

      {/* ── What it cannot do ───────────────────────────────────────────── */}
      <div style={{ ...CARD, background: 'var(--paper-2)' }}>
        <div style={{ ...LABEL, marginBottom: 10 }}>What this forecast does not know</div>
        <div style={{ display: 'grid', gap: 9 }}>
          <Note>
            <strong style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Weather and events.</strong>{' '}
            It has never seen a forecast or a fixture list. A washout reads to it
            as an ordinary Tuesday that went badly.
          </Note>
          <Note>
            <strong style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Festivals.</strong>{' '}
            One restaurant sees each festival once a year. That effect can only be
            learned by pooling across many restaurants, which needs more than one
            outlet's history.
          </Note>
          <Note>
            <strong style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Your own offers.</strong>{' '}
            A discount running tomorrow will not move this number.
          </Note>
        </div>
      </div>

      <Link
        to="/forecast/prep-sheet"
        className="flex items-center gap-2"
        style={{
          fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none',
          borderBottom: '1px solid var(--line-2)', paddingBottom: 3, width: 'fit-content',
        }}
      >
        <TrendingUp size={14} strokeWidth={2} />
        Turn this into a prep sheet
        <ArrowRight size={14} strokeWidth={2} />
      </Link>
    </div>
  );
}
