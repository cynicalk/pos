import { Link } from 'react-router-dom';
import { Hourglass, Info, ArrowRight, PackageX } from 'lucide-react';
import { useInventoryForecast } from '../hooks/useForecast';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Inventory Forecasting — the prep sheet walked forward.
 *
 * The prep sheet says how much of each ingredient tomorrow needs. This page
 * carries that down the next two weeks: current stock minus each day's forecast
 * consumption, so an ingredient's depletion date is a line an operator can read
 * before it becomes a stockout. Every burn rate traces back through the same
 * recipes the prep sheet uses — nothing here is estimated separately.
 *
 * The discipline that shapes it: an ingredient the forecast cannot speak to —
 * one used only by dishes with no recipe, or by dishes too irregular to
 * forecast — gets no depletion date. Its stock is shown, and it is set apart in
 * its own section rather than handed a confident date with nothing under it.
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
  return Math.abs(n) < 10 ? n.toFixed(2) : n.toFixed(1);
};

const STATUS = {
  below_reorder_now:        { label: 'Below level now', color: 'var(--bad)',  bg: 'var(--bad-soft)' },
  stockout_within_horizon:  { label: 'Runs out',        color: 'var(--bad)',  bg: 'var(--bad-soft)' },
  reorder_within_horizon:   { label: 'Reorder soon',    color: 'var(--warn)', bg: 'var(--warn-soft)' },
  ok:                       { label: 'OK',              color: 'var(--ok)',   bg: 'var(--ok-soft)' },
  no_forecast_demand:       { label: 'No forecast',     color: 'var(--mute)', bg: 'var(--hover)' },
};

function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.no_forecast_demand;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.color,
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em',
      whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

const days = (n) => (n === null ? '—' : n === 0 ? 'now' : `${n}d`);

function Note({ children, icon: Icon = Info }) {
  return (
    <p style={{ display: 'flex', gap: 7, alignItems: 'flex-start', margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--mute)' }}>
      <Icon size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 3 }} />
      <span>{children}</span>
    </p>
  );
}

export default function InventoryForecast() {
  const { format } = useCurrency();
  const { data, isLoading } = useInventoryForecast();

  if (isLoading || !data) {
    return <div style={{ padding: 32, color: 'var(--mute)' }}>Loading…</div>;
  }

  if (data.forecastableDays === 0) {
    return (
      <div style={{ padding: '26px 24px', maxWidth: 780, margin: '0 auto' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          borderRadius: 999, background: 'var(--info-soft)', color: 'var(--info)',
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em',
        }}>
          <Hourglass size={13} strokeWidth={2.2} /> Collecting history
        </span>
        <h1 style={{ margin: '14px 0 0', fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>Inventory Forecast</h1>
        <p style={{ margin: '12px 0 0', fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-2)' }}>
          Projecting stock forward needs a forecast to walk it against, and there
          are not yet enough closed trading days on record to produce one.
        </p>
      </div>
    );
  }

  const drawn = data.projection.filter((p) => p.drawnByForecast);
  const blind = data.projection.filter((p) => !p.drawnByForecast);
  const mixPct = Math.round((data.mixCoverage ?? 0) * 100);

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
            stock on hand − forecast consumption, day by day
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>
          Inventory Forecast
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)' }}>
          Next {data.horizonDays} days from {data.startDate}
        </p>
      </div>

      {/* ── Headline ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {[
          ['Tracked', data.summary.tracked, `${data.summary.drawnByForecast} drawn by the forecast`],
          ['Below level now', data.summary.belowReorderNow, 'already at or under reorder level'],
          ['Run out in window', data.summary.stockoutWithinHorizon, `within ${data.horizonDays} days at forecast burn`],
          ['Reorder in window', data.summary.reorderWithinHorizon, 'cross the reorder level, not yet empty'],
        ].map(([label, value, sub]) => (
          <div key={label} style={CARD}>
            <div style={LABEL}>{label}</div>
            <div className="mono num" style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Projection ──────────────────────────────────────────────────── */}
      <div style={CARD}>
        <div style={{ ...LABEL, marginBottom: 4 }}>Where each ingredient is heading</div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6, maxWidth: 800 }}>
          Soonest to run out first. Burn is the average forecast draw per day across
          the window; ingredients shared across many dishes are steadier than any one
          dish, so these dates are firmer than the dish forecasts underneath them.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th}>Ingredient</th>
                <th style={{ ...th, textAlign: 'right' }}>On hand</th>
                <th style={{ ...th, textAlign: 'right' }}>Burn / day</th>
                <th style={{ ...th, textAlign: 'right' }}>Reorder in</th>
                <th style={{ ...th, textAlign: 'right' }}>Runs out in</th>
                <th style={{ ...th, textAlign: 'right' }}>End of window</th>
                <th style={{ ...th, textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {drawn.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ ...td, fontWeight: 500 }}>
                    {p.name}
                    {p.perishable && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--mute)' }}>perishable</span>}
                  </td>
                  <td style={tdNum} className="mono num">{qty(p.stockOnHand, p.unit)} <span style={{ color: 'var(--mute)' }}>{p.unit}</span></td>
                  <td style={{ ...tdNum, color: 'var(--mute)' }} className="mono num">{qty(p.dailyBurn, p.unit)}</td>
                  <td style={tdNum} className="mono num">{days(p.daysToReorderLevel)}</td>
                  <td style={{ ...tdNum, color: p.daysToStockout !== null ? 'var(--bad)' : 'var(--ink)' }} className="mono num">{days(p.daysToStockout)}</td>
                  <td style={{ ...tdNum, color: p.projectedEndStock < 0 ? 'var(--bad)' : 'var(--mute)' }} className="mono num">
                    {qty(p.projectedEndStock, p.unit)}
                  </td>
                  <td style={{ ...tdNum }}><StatusPill status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Not drawn by the forecast ───────────────────────────────────── */}
      {blind.length > 0 && (
        <div style={{ ...CARD, background: 'var(--paper-2)' }}>
          <div style={{ ...LABEL, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <PackageX size={12} strokeWidth={2} />
            Not drawn by the forecast — {blind.length} ingredients
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6, maxWidth: 800 }}>
            These are used only by dishes with no recipe, or by dishes too irregular
            to forecast. Their stock is real, but there is no forecast draw to project
            a depletion date from — so none is guessed. The projection above speaks for
            about {mixPct}% of forecast portions.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
              <thead>
                <tr>
                  <th style={th}>Ingredient</th>
                  <th style={{ ...th, textAlign: 'right' }}>On hand</th>
                  <th style={{ ...th, textAlign: 'right' }}>Reorder level</th>
                </tr>
              </thead>
              <tbody>
                {blind.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ ...td, fontWeight: 500 }}>{p.name}</td>
                    <td style={tdNum} className="mono num">{qty(p.stockOnHand, p.unit)} <span style={{ color: 'var(--mute)' }}>{p.unit}</span></td>
                    <td style={{ ...tdNum, color: 'var(--mute)' }} className="mono num">{qty(p.reorderLevel, p.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ ...CARD, background: 'var(--paper-2)' }}>
        <div style={{ ...LABEL, marginBottom: 10 }}>On accuracy</div>
        <Note>{data.accuracy.note}</Note>
        <div style={{ marginTop: 8 }}><Note>{data.coverageNote}</Note></div>
      </div>

      <div className="flex items-center gap-5 flex-wrap">
        <Link to="/forecast/reorder" className="flex items-center gap-2"
          style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none', borderBottom: '1px solid var(--line-2)', paddingBottom: 3 }}>
          See what to reorder <ArrowRight size={14} strokeWidth={2} />
        </Link>
        <Link to="/forecast/prep-sheet" className="flex items-center gap-2"
          style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--mute)', textDecoration: 'none', borderBottom: '1px solid var(--line-2)', paddingBottom: 3 }}>
          The prep sheet this walks forward <ArrowRight size={14} strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}
