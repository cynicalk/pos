import { Link } from 'react-router-dom';
import { Hourglass, Info, ArrowRight, AlertTriangle } from 'lucide-react';
import { useReorderPlan } from '../hooks/useForecast';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Auto Reorder — the inventory projection read at the supplier lead time.
 *
 * An order placed today lands in `leadDays`. So the question this answers is not
 * "what is low" but "what will cross its reorder level before a new delivery
 * could arrive" — anything past that point is already too late to save by
 * ordering now. Quantity defaults to the operator's own configured reorder_qty,
 * or the forecast need where none is set.
 *
 * Two refusals, inherited from the prep sheet:
 *   - It is a suggestion, never a placed order — the newsvendor trade-off of
 *     running out against binning it is the operator's to make (§IV.1).
 *   - A perishable whose suggested quantity would outlast a few days of forecast
 *     demand is flagged, not silently proposed, because only the operator holds
 *     its shelf life.
 */

const CARD = {
  border: '1px solid var(--line)', borderRadius: 12,
  background: 'var(--paper)', padding: '18px 20px', minWidth: 0,
};
const LABEL = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '.12em', color: 'var(--label)',
};
const th = {
  padding: '8px 11px', textAlign: 'left', fontSize: 10, fontWeight: 600,
  color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em',
  whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)',
};
const td = { padding: '9px 11px', fontSize: 12.5, color: 'var(--ink)' };
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const qty = (n, unit) => {
  if (n === null || n === undefined) return '—';
  if (unit === 'g' || unit === 'ml') return Math.round(n).toString();
  return n < 10 ? n.toFixed(2) : n.toFixed(1);
};
const days = (n) => (n === null ? '—' : n === 0 ? 'now' : `${n}d`);

function Note({ children, icon: Icon = Info }) {
  return (
    <p style={{ display: 'flex', gap: 7, alignItems: 'flex-start', margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--mute)' }}>
      <Icon size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 3 }} />
      <span>{children}</span>
    </p>
  );
}

export default function ReorderPlan() {
  const { format } = useCurrency();
  const { data, isLoading } = useReorderPlan();

  if (isLoading || !data) {
    return <div style={{ padding: 32, color: 'var(--mute)' }}>Loading…</div>;
  }

  if (data.isBaselineModel && data.suggestions === undefined) {
    return (
      <div style={{ padding: '26px 24px', maxWidth: 780, margin: '0 auto' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          borderRadius: 999, background: 'var(--info-soft)', color: 'var(--info)',
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em',
        }}>
          <Hourglass size={13} strokeWidth={2.2} /> Collecting history
        </span>
        <h1 style={{ margin: '14px 0 0', fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>Auto Reorder</h1>
        <p style={{ margin: '12px 0 0', fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-2)' }}>
          A reorder plan needs a forecast to read at the lead time, and there is not
          yet enough history to produce one.
        </p>
      </div>
    );
  }

  const { suggestions, summary } = data;

  return (
    <div style={{ padding: '26px 24px 48px', maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>

      <div>
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px',
            borderRadius: 999, background: 'var(--paper-3)', color: 'var(--mute)',
            fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em',
          }}>Baseline model</span>
          <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>
            forecast read at a {data.leadDays}-day lead time
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>
          Auto Reorder
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)' }}>
          Order today to beat a stockout before {data.startDate} + {data.leadDays} days
        </p>
      </div>

      {/* ── The one thing this page must say ────────────────────────────── */}
      <div style={{ padding: '14px 18px', borderLeft: '2px solid var(--warn)', background: 'var(--paper-2)', borderRadius: '0 8px 8px 0' }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--mute)' }}>
          <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>
            {data.decision.note.split('. ')[0]}.
          </strong>{' '}
          {data.decision.note.split('. ').slice(1).join('. ')}
        </p>
      </div>

      {/* ── Headline ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {[
          ['To order', summary.lines, 'lines crossing their level within lead time'],
          ['Urgent', summary.urgentNow, 'already at or below the reorder level'],
          ['Est. order value', format(summary.totalCost), "at today's unit costs"],
          ['Perishable flags', summary.perishableWasteFlags, 'suggested qty outlasts a few days of demand'],
        ].map(([label, value, sub]) => (
          <div key={label} style={CARD}>
            <div style={LABEL}>{label}</div>
            <div className="mono num" style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── The plan ────────────────────────────────────────────────────── */}
      {suggestions.length === 0 ? (
        <div style={{ ...CARD, background: 'var(--ok-soft)', border: '1px solid var(--ok)' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            Nothing crosses its reorder level within the next {data.leadDays} days at the
            current forecast. Check back tomorrow — the forecast refreshes with each day's
            closed snapshot.
          </p>
        </div>
      ) : (
        <div style={CARD}>
          <div style={{ ...LABEL, marginBottom: 4 }}>Order today</div>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6, maxWidth: 800 }}>
            Quantity is your configured reorder amount where you set one, or the forecast
            need over lead-plus-review otherwise. "Covers" is how many days of forecast
            demand the suggested quantity holds.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={th}>Ingredient</th>
                  <th style={{ ...th, textAlign: 'right' }}>On hand</th>
                  <th style={{ ...th, textAlign: 'right' }}>Runs out in</th>
                  <th style={{ ...th, textAlign: 'right' }}>Order</th>
                  <th style={{ ...th, textAlign: 'right' }}>Covers</th>
                  <th style={{ ...th, textAlign: 'right' }}>Est. cost</th>
                  <th style={th}>Basis</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ ...td, fontWeight: 500 }}>
                      <span className="flex items-center gap-1.5">
                        {s.urgency === 'now' && (
                          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--bad)', flexShrink: 0 }} />
                        )}
                        {s.name}
                        {s.perishableWasteRisk && (
                          <AlertTriangle size={12} strokeWidth={2} style={{ color: 'var(--warn)' }} title="Perishable — suggested qty outlasts a few days of demand" />
                        )}
                      </span>
                    </td>
                    <td style={tdNum} className="mono num">{qty(s.stockOnHand, s.unit)} <span style={{ color: 'var(--mute)' }}>{s.unit}</span></td>
                    <td style={{ ...tdNum, color: s.daysToStockout !== null ? 'var(--bad)' : 'var(--mute)' }} className="mono num">{days(s.daysToStockout)}</td>
                    <td style={{ ...tdNum, fontWeight: 600 }} className="mono num">{qty(s.suggestedQty, s.unit)} <span style={{ color: 'var(--mute)', fontWeight: 400 }}>{s.unit}</span></td>
                    <td style={{ ...tdNum, color: s.perishableWasteRisk ? 'var(--warn)' : 'var(--mute)' }} className="mono num">
                      {s.coversDays === null ? '—' : `${s.coversDays.toFixed(1)}d`}
                    </td>
                    <td style={tdNum} className="mono num">{format(s.suggestedCost)}</td>
                    <td style={{ ...td, color: 'var(--mute)', fontSize: 11 }}>
                      {s.qtyBasis === 'configured_reorder_qty' ? 'your reorder qty' : 'forecast need'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-5 flex-wrap">
        <Link to="/forecast/inventory" className="flex items-center gap-2"
          style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none', borderBottom: '1px solid var(--line-2)', paddingBottom: 3 }}>
          The full stock projection <ArrowRight size={14} strokeWidth={2} />
        </Link>
        <Link to="/inventory" className="flex items-center gap-2"
          style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--mute)', textDecoration: 'none', borderBottom: '1px solid var(--line-2)', paddingBottom: 3 }}>
          Set reorder levels &amp; quantities <ArrowRight size={14} strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}
