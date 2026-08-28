import { Link } from 'react-router-dom';
import { Hourglass, Info, ArrowRight, Users } from 'lucide-react';
import { useShiftPlan } from '../hooks/useForecast';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Shift Planning — forecast covers turned into a starting roster.
 *
 * Covers per labour-hour is learned from this outlet's own completed shifts
 * against its own recorded covers, never an industry standard — so the plan is
 * this kitchen's own productivity applied to tomorrow's forecast, not a textbook
 * ratio. Below enough history to learn it, the page says so and offers no
 * number.
 *
 * It is a starting roster, not an instruction. Who works which section, and the
 * judgement calls a manager makes around a big table or a new hire, stay theirs.
 */

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CARD = { border: '1px solid var(--line)', borderRadius: 12, background: 'var(--paper)', padding: '18px 20px', minWidth: 0 };
const LABEL = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--label)' };
const th = { padding: '8px 11px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)' };
const td = { padding: '9px 11px', fontSize: 12.5, color: 'var(--ink)' };
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DOW[dt.getUTCDay()]}, ${dt.getUTCDate()} ${dt.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
};

function Note({ children, icon: Icon = Info }) {
  return (
    <p style={{ display: 'flex', gap: 7, alignItems: 'flex-start', margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--mute)' }}>
      <Icon size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 3 }} />
      <span>{children}</span>
    </p>
  );
}

export default function ShiftPlan() {
  const { format } = useCurrency();
  const { data, isLoading } = useShiftPlan();

  if (isLoading || !data) return <div style={{ padding: 32, color: 'var(--mute)' }}>Loading…</div>;

  if (!data.productivity.enough || data.forecastCovers.point === null) {
    return (
      <div style={{ padding: '26px 24px', maxWidth: 780, margin: '0 auto' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'var(--info-soft)', color: 'var(--info)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em' }}>
          <Hourglass size={13} strokeWidth={2.2} /> Learning your productivity
        </span>
        <h1 style={{ margin: '14px 0 0', fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>Shift Planning</h1>
        <p style={{ margin: '12px 0 0', fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-2)' }}>
          A roster suggestion needs to know how many covers this kitchen serves per
          labour-hour — learned from your own completed shifts, not an industry figure.
          {data.productivity.sampleDays} usable days on record; it needs {data.productivity.minDays}.
        </p>
      </div>
    );
  }

  const c = data.forecastCovers;

  return (
    <div style={{ padding: '26px 24px 48px', maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div>
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999, background: 'var(--paper-3)', color: 'var(--mute)', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em' }}>Baseline model</span>
          <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>forecast covers ÷ your learned productivity</span>
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>Shift Planning</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)' }}>{fmtDate(data.date)}</p>
      </div>

      <div style={{ padding: '14px 18px', borderLeft: '2px solid var(--warn)', background: 'var(--paper-2)', borderRadius: '0 8px 8px 0' }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--mute)' }}>
          <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{data.note.split('. ')[0]}.</strong>{' '}
          {data.note.split('. ').slice(1).join('. ')}
        </p>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {[
          ['Forecast covers', Math.round(c.point), c.lo !== null ? `range ${Math.round(c.lo)}–${Math.round(c.hi)}` : 'no range measured yet'],
          ['Suggested staff', data.plan.suggestedHeadcount, `${data.plan.suggestedHours.toFixed(0)} labour-hours`],
          ['Est. labour cost', format(data.estimatedLabourCost), `at ${format(data.blendedHourlyRate)}/hr blended`],
          ['Your productivity', `${data.productivity.coversPerLabourHour.toFixed(2)}`, `covers/hour, learned over ${data.productivity.sampleDays} days`],
        ].map(([label, value, sub]) => (
          <div key={label} style={CARD}>
            <div style={LABEL}>{label}</div>
            <div className="mono num" style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={CARD}>
        <div style={{ ...LABEL, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={12} strokeWidth={2} /> Roster by role
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6, maxWidth: 800 }}>
          The suggested hours split the way this kitchen actually staffs — its historical
          share of labour-hours by role — not a fixed front-of-house-to-kitchen ratio. A
          typical shift here runs {data.typicalShiftHours.toFixed(1)} hours.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
            <thead>
              <tr>
                <th style={th}>Role</th>
                <th style={{ ...th, textAlign: 'right' }}>Hours</th>
                <th style={{ ...th, textAlign: 'right' }}>People</th>
              </tr>
            </thead>
            <tbody>
              {data.plan.byRole.map((r) => (
                <tr key={r.role} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ ...td, fontWeight: 500, textTransform: 'capitalize' }}>{r.role}</td>
                  <td style={tdNum} className="mono num">{r.hours.toFixed(1)}</td>
                  <td style={tdNum} className="mono num">{r.headcount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-5 flex-wrap">
        <Link to="/forecast/scheduling" className="flex items-center gap-2" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none', borderBottom: '1px solid var(--line-2)', paddingBottom: 3 }}>
          The week's labour cost <ArrowRight size={14} strokeWidth={2} />
        </Link>
        <Link to="/forecast/demand" className="flex items-center gap-2" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--mute)', textDecoration: 'none', borderBottom: '1px solid var(--line-2)', paddingBottom: 3 }}>
          The covers forecast behind it <ArrowRight size={14} strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}
