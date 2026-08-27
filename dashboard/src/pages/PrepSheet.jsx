import { Link } from 'react-router-dom';
import { Hourglass, Info, ArrowRight, AlertTriangle, CalendarDays } from 'lucide-react';
import { usePrepSheet } from '../hooks/useForecast';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Prep Sheet — the third level of the hierarchy, and the one that is the product.
 *
 * FORECASTING.md §III.3: "Explode through RecipeItem. Pure arithmetic, fully
 * explainable: *180 covers → 62 butter chicken → 9.3 kg chicken*. That third
 * step is the product. Nobody wants a forecast; they want a prep sheet and a
 * purchase order."
 *
 * Three things this page will not do:
 *
 *   - **It will not tell the kitchen how much to prep.** It shows the forecast
 *     quantity. Choosing a prep quantity is the newsvendor decision of §IV.1 —
 *     the cost of running out against the cost of binning it — and that needs
 *     shelf life and substitution data CookLyt does not hold. Presenting a
 *     forecast as an instruction is how a signature dish and a live seafood
 *     special end up prepped to the same service level.
 *   - **It will not hide what it does not cover.** Dishes too irregular to
 *     forecast, and dishes with no recipe, are both listed. A sheet that quietly
 *     covers four fifths of service is worse than one that says so.
 *   - **It will not round.** "You cannot prep 1.09 portions" — but rounding is
 *     a decision, and this page is not the one making it.
 */

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DOW[dt.getUTCDay()]}, ${dt.getUTCDate()} ${dt.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
};

/** Quantities keep a sensible number of figures for the unit they are in. */
const qty = (n, unit) => {
  if (n === null || n === undefined) return '—';
  if (unit === 'g' || unit === 'ml') return Math.round(n).toString();
  return n < 10 ? n.toFixed(2) : n.toFixed(1);
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

export default function PrepSheet() {
  const { format } = useCurrency();
  const { data, isLoading } = usePrepSheet();

  if (isLoading || !data) {
    return <div style={{ padding: 32, color: 'var(--mute)' }}>Loading…</div>;
  }

  if (data.total.point === null) {
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
          Prep Sheet
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-2)' }}>
          A prep sheet is a forecast walked through your recipes, so it cannot
          start before the forecast can. {data.total.tradingDays} closed trading
          days on record; it needs {data.total.requiredDays}.
        </p>
      </div>
    );
  }

  const mixPct = Math.round((data.mixCoverage ?? 0) * 100);
  const recipePct = Math.round(data.recipeCoveragePct ?? 0);
  const sellsTomorrow = data.irregular.filter((i) => i.sellsOnTargetDay);

  return (
    <div style={{ padding: '26px 24px 48px', maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>

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
            forecast → item mix → your recipes
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>
          Prep Sheet
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)' }}>
          {fmtDate(data.date)}
        </p>
      </div>

      {/* ── The one thing this page must say ────────────────────────────── */}
      <div style={{
        padding: '14px 18px', borderLeft: '2px solid var(--warn)',
        background: 'var(--paper-2)', borderRadius: '0 8px 8px 0',
      }}>
        {/* The note already opens with the sentence that needs emphasis, so it
            is split rather than restated — the first version printed
            "These are forecast quantities, not prep quantities." twice. */}
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--mute)' }}>
          <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>
            {data.prepDecision.note.split('. ')[0]}.
          </strong>{' '}
          {data.prepDecision.note.split('. ').slice(1).join('. ')}
        </p>
      </div>

      {/* ── Headline ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {[
          ['Forecast portions', Math.round(data.total.point),
            data.total.lo !== null ? `range ${Math.round(data.total.lo)}–${Math.round(data.total.hi)}` : 'no range measured yet'],
          ['Expected takings', data.revenue?.point != null ? format(data.revenue.point) : '—', 'same day, in rupees'],
          ['Ingredient lines', data.ingredients.length, `${format(data.totalIngredientCost)} at today's costs`],
          ['Sheet covers', `${mixPct}%`, 'of forecast portions — see below for the rest'],
        ].map(([label, value, sub]) => (
          <div key={label} style={CARD}>
            <div style={LABEL}>{label}</div>
            <div className="mono num" style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>
              {value}
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Ingredients — the actual sheet ──────────────────────────────── */}
      <div style={CARD}>
        <div style={{ ...LABEL, marginBottom: 4 }}>Ingredients</div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6, maxWidth: 780 }}>
          Every line traces back through a named dish to a recipe you wrote — nothing
          here is estimated. Ingredients shared across several dishes are steadier
          than any one dish, which is why this sheet is more reliable than the dish
          list it came from.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead>
              <tr>
                <th style={th}>Ingredient</th>
                <th style={{ ...th, textAlign: 'right' }}>Needed</th>
                <th style={{ ...th, textAlign: 'right' }}>Range</th>
                <th style={{ ...th, textAlign: 'right' }}>Cost</th>
                <th style={th}>Mostly for</th>
              </tr>
            </thead>
            <tbody>
              {data.ingredients.map((i) => (
                <tr key={i.ingredientId} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ ...td, fontWeight: 500 }}>{i.name}</td>
                  <td style={tdNum} className="mono num">
                    {qty(i.quantity, i.unit)} <span style={{ color: 'var(--mute)' }}>{i.unit}</span>
                  </td>
                  <td style={{ ...tdNum, color: 'var(--mute)', fontSize: 11.5 }} className="mono num">
                    {i.lo === i.hi ? '—' : `${qty(i.lo, i.unit)}–${qty(i.hi, i.unit)}`}
                  </td>
                  <td style={tdNum} className="mono num">{format(i.cost)}</td>
                  <td style={{ ...td, color: 'var(--mute)', fontSize: 11.5 }}>
                    {i.fromDishes.slice(0, 2).map((d) => d.dish).join(', ')}
                    {i.fromDishes.length > 2 && ` +${i.fromDishes.length - 2}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Dishes ──────────────────────────────────────────────────────── */}
      <div style={CARD}>
        <div style={{ ...LABEL, marginBottom: 4 }}>Dishes behind it</div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6 }}>
          Shares of the day's portions, normalised — so a new dish takes from its
          neighbours rather than adding volume out of nowhere.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead>
              <tr>
                <th style={th}>Dish</th>
                <th style={{ ...th, textAlign: 'right' }}>Share</th>
                <th style={{ ...th, textAlign: 'right' }}>Forecast</th>
                <th style={{ ...th, textAlign: 'right' }}>Range</th>
                <th style={th}>Sold on</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.name} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ ...td, fontWeight: 500 }}>{i.name}</td>
                  <td style={{ ...tdNum, color: 'var(--mute)' }} className="mono num">
                    {(i.share * 100).toFixed(1)}%
                  </td>
                  <td style={tdNum} className="mono num">{i.qty.toFixed(1)}</td>
                  <td style={{ ...tdNum, color: 'var(--mute)', fontSize: 11.5 }} className="mono num">
                    {i.lo === null ? '—' : `${i.lo.toFixed(1)}–${i.hi.toFixed(1)}`}
                  </td>
                  <td style={{ ...td, color: 'var(--mute)', fontSize: 11.5 }}>
                    {i.soldOnDays} of {i.ofDays} days
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── What the sheet deliberately leaves out (§III.5) ─────────────── */}
      {data.irregular.length > 0 && (
        <div style={{ ...CARD, background: 'var(--paper-2)' }}>
          <div style={{ ...LABEL, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarDays size={12} strokeWidth={2} />
            Too irregular to forecast — {data.irregular.length} dishes, about {100 - mixPct}% of portions
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6, maxWidth: 800 }}>
            These sell in bursts rather than steadily. Averaging a dish that sells
            three on a Saturday down to "half a portion a day" gives a number that
            is wrong every single day, and wrong in the direction of prepping a
            perishable that will not move — so no share is given to them at all.
            Their volume is excluded from the sheet above rather than handed to the
            other dishes.
          </p>
          {sellsTomorrow.length > 0 && (
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
              <strong style={{ fontWeight: 600 }}>{sellsTomorrow.length}</strong> of them
              have sold on a {DOW[new Date(`${data.date}T00:00:00Z`).getUTCDay()]} before —
              worth a look before service.
            </p>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={th}>Dish</th>
                  <th style={th}>Pattern</th>
                  <th style={{ ...th, textAlign: 'right' }}>Sold on</th>
                  <th style={{ ...th, textAlign: 'right' }}>Typical when it sells</th>
                  <th style={th}>Busiest day</th>
                </tr>
              </thead>
              <tbody>
                {data.irregular.slice(0, 12).map((i) => (
                  <tr key={i.name} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ ...td, fontWeight: 500 }}>{i.name}</td>
                    <td style={{ ...td, color: 'var(--mute)' }}>{i.klass}</td>
                    <td style={{ ...tdNum, color: 'var(--mute)' }} className="mono num">
                      {i.soldOnDays} of {i.ofDays}
                    </td>
                    <td style={tdNum} className="mono num">{i.typicalWhenItSells ?? '—'}</td>
                    <td style={{ ...td, color: 'var(--mute)' }}>
                      {i.busiestWeekday === null ? '—' : DOW[i.busiestWeekday]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Uncosted dishes ─────────────────────────────────────────────── */}
      {data.uncosted.length > 0 && (
        <div style={{ ...CARD, background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}>
          <div style={{ ...LABEL, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--warn)' }}>
            <AlertTriangle size={12} strokeWidth={2} /> {data.uncosted.length} dish(es) have no recipe
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            The ingredients above cover {recipePct}% of forecast portions. These
            dishes contribute nothing to the sheet because nothing records what
            goes into them:{' '}
            <strong style={{ fontWeight: 600 }}>{data.uncosted.slice(0, 6).map((u) => u.name).join(', ')}</strong>
            {data.uncosted.length > 6 && ` and ${data.uncosted.length - 6} more`}.{' '}
            <Link to="/recipes" style={{ color: 'var(--ink)' }}>Add their recipes</Link> and
            they will appear here.
          </p>
        </div>
      )}

      <div style={{ ...CARD, background: 'var(--paper-2)' }}>
        <div style={{ ...LABEL, marginBottom: 10 }}>On accuracy</div>
        <Note>{data.accuracy.note}</Note>
      </div>

      <Link
        to="/forecast/demand"
        className="flex items-center gap-2"
        style={{
          fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none',
          borderBottom: '1px solid var(--line-2)', paddingBottom: 3, width: 'fit-content',
        }}
      >
        See the forecast this came from
        <ArrowRight size={14} strokeWidth={2} />
      </Link>
    </div>
  );
}
