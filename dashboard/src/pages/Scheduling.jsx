import { Link } from 'react-router-dom';
import { Hourglass, Info, ArrowRight } from 'lucide-react';
import { useScheduling } from '../hooks/useForecast';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Cost-based Scheduling — a week of labour cost read against forecast takings.
 *
 * Each day's suggested hours (from the shift plan) become a labour cost at the
 * blended paid rate, and that cost is shown as a share of the day's forecast
 * revenue. "Lean" and "heavy" are judged against this outlet's own recent
 * labour-%, not a fixed target — a day reads heavy only relative to how this
 * kitchen normally staffs, which is the only comparison that cannot be quietly
 * wrong the way a borrowed 25%-of-revenue rule would be.
 */

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CARD = { border: '1px solid var(--line)', borderRadius: 12, background: 'var(--paper)', padding: '18px 20px', minWidth: 0 };
const LABEL = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--label)' };
const th = { padding: '8px 11px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)' };
const td = { padding: '9px 11px', fontSize: 12.5, color: 'var(--ink)' };
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const VERDICT = {
  lean:    { label: 'Lean',    color: 'var(--info)', bg: 'var(--info-soft)' },
  healthy: { label: 'Healthy', color: 'var(--ok)',   bg: 'var(--ok-soft)' },
  heavy:   { label: 'Heavy',   color: 'var(--warn)', bg: 'var(--warn-soft)' },
  unknown: { label: '—',       color: 'var(--mute)', bg: 'var(--hover)' },
};

const fmtDay = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DOW[dt.getUTCDay()]} ${dt.getUTCDate()}`;
};

function VerdictPill({ v }) {
  const t = VERDICT[v] || VERDICT.unknown;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 999, background: t.bg, color: t.color, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t.label}</span>
  );
}

function Note({ children, icon: Icon = Info }) {
  return (
    <p style={{ display: 'flex', gap: 7, alignItems: 'flex-start', margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--mute)' }}>
      <Icon size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 3 }} />
      <span>{children}</span>
    </p>
  );
}

export default function Scheduling() {
  const { format } = useCurrency();
  const { data, isLoading } = useScheduling();

  if (isLoading || !data) return <div style={{ padding: 32, color: 'var(--mute)' }}>Loading…</div>;

  if (!data.productivity.enough) {
    return (
      <div style={{ padding: '26px 24px', maxWidth: 780, margin: '0 auto' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'var(--info-soft)', color: 'var(--info)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em' }}>
          <Hourglass size={13} strokeWidth={2.2} /> Learning your normal
        </span>
        <h1 style={{ margin: '14px 0 0', fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>Cost-based Scheduling</h1>
        <p style={{ margin: '12px 0 0', fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-2)' }}>
          Reading a day as lean or heavy needs enough history to know this outlet's
          own labour-% — {data.productivity.sampleDays} usable days so far, of the
          {' '}{data.productivity.minDays} it needs.
        </p>
      </div>
    );
  }

  const band = data.band;
  const weekCost = data.week.reduce((s, d) => s + (d.labourCost || 0), 0);
  const weekRev = data.week.reduce((s, d) => s + (d.forecastRevenue || 0), 0);
  const weekPct = weekRev > 0 ? (weekCost / weekRev) * 100 : null;

  return (
    <div style={{ padding: '26px 24px 48px', maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div>
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999, background: 'var(--paper-3)', color: 'var(--mute)', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em' }}>Baseline model</span>
          <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>labour cost vs forecast revenue, judged against your own band</span>
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>Cost-based Scheduling</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)' }}>
          {data.days} days from {data.startDate}
        </p>
      </div>

      <div style={{ padding: '14px 18px', borderLeft: '2px solid var(--warn)', background: 'var(--paper-2)', borderRadius: '0 8px 8px 0' }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--mute)' }}>
          <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{data.note.split('. ')[0]}.</strong>{' '}
          {data.note.split('. ').slice(1).join('. ')}
        </p>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {[
          ['Week labour cost', format(weekCost), `at ${format(data.blendedHourlyRate)}/hr blended`],
          ['Week labour %', weekPct === null ? '—' : `${weekPct.toFixed(1)}%`, 'of forecast takings'],
          ['Your normal band', band.median === null ? '—' : `${band.low.toFixed(0)}–${band.high.toFixed(0)}%`, `median ${band.median.toFixed(0)}%, ${band.sampleDays} days`],
          ['Heavy days', data.week.filter((d) => d.verdict === 'heavy').length, 'above your own band'],
        ].map(([label, value, sub]) => (
          <div key={label} style={CARD}>
            <div style={LABEL}>{label}</div>
            <div className="mono num" style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={CARD}>
        <div style={{ ...LABEL, marginBottom: 12 }}>The week</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={th}>Day</th>
                <th style={{ ...th, textAlign: 'right' }}>Covers</th>
                <th style={{ ...th, textAlign: 'right' }}>Forecast rev.</th>
                <th style={{ ...th, textAlign: 'right' }}>Staff</th>
                <th style={{ ...th, textAlign: 'right' }}>Hours</th>
                <th style={{ ...th, textAlign: 'right' }}>Labour cost</th>
                <th style={{ ...th, textAlign: 'right' }}>Labour %</th>
                <th style={{ ...th, textAlign: 'right' }}>vs your band</th>
              </tr>
            </thead>
            <tbody>
              {data.week.map((d) => (
                <tr key={d.date} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ ...td, fontWeight: 500 }}>{fmtDay(d.date)}</td>
                  <td style={{ ...tdNum, color: 'var(--mute)' }} className="mono num">{d.forecastCovers === null ? '—' : Math.round(d.forecastCovers)}</td>
                  <td style={tdNum} className="mono num">{d.forecastRevenue === null ? '—' : format(d.forecastRevenue)}</td>
                  <td style={tdNum} className="mono num">{d.suggestedHeadcount ?? '—'}</td>
                  <td style={{ ...tdNum, color: 'var(--mute)' }} className="mono num">{d.suggestedHours === null ? '—' : d.suggestedHours.toFixed(0)}</td>
                  <td style={tdNum} className="mono num">{d.labourCost === null ? '—' : format(d.labourCost)}</td>
                  <td style={{ ...tdNum, fontWeight: 600 }} className="mono num">{d.laborPct === null ? '—' : `${d.laborPct.toFixed(1)}%`}</td>
                  <td style={{ ...tdNum }}><VerdictPill v={d.verdict} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...CARD, background: 'var(--paper-2)' }}>
        <div style={{ ...LABEL, marginBottom: 10 }}>On the band</div>
        <Note>
          The band is this outlet's own 25th–75th percentile of daily labour-cost-to-revenue
          over {band.sampleDays} days. A day above it is only heavy relative to how you
          usually run — it is not a claim about what a restaurant "should" spend on labour.
        </Note>
      </div>

      <Link to="/forecast/shift-plan" className="flex items-center gap-2" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none', borderBottom: '1px solid var(--line-2)', paddingBottom: 3, width: 'fit-content' }}>
        Tomorrow's roster in detail <ArrowRight size={14} strokeWidth={2} />
      </Link>
    </div>
  );
}
