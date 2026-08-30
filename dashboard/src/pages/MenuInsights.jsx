import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Grid2X2, Sparkles, Link2, AlertCircle, Coffee, ArrowUp, ArrowDown } from 'lucide-react';
import { useMenuInsights, useCrossSell, useNewItems, useAttachRate } from '../hooks/useInsights';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Menu Intelligence — engineering matrix, cross-sell affinities, new-item curves.
 *
 * The matrix classifies on this restaurant's OWN medians rather than absolute
 * thresholds, and uncosted dishes are shown as a prompt to cost them rather
 * than being classified on a margin of zero.
 */

const WINDOWS = [7, 30, 90];

const QUADRANTS = [
  { key: 'stars',      label: 'Stars',       hint: 'Sells well, earns well — protect these.',        color: 'var(--ok)' },
  { key: 'plowhorses', label: 'Plough-horses', hint: 'Popular but thin — reprice or re-cost.',        color: 'var(--warn)' },
  { key: 'puzzles',    label: 'Puzzles',     hint: 'Good margin, few takers — worth promoting.',     color: 'var(--info)' },
  { key: 'dogs',       label: 'Dogs',        hint: 'Low volume, low margin — candidates to cut.',    color: 'var(--bad)' },
];

const VERDICT_COLOR = {
  outperforming: 'var(--ok)',
  'on pace': 'var(--mute)',
  'slow start': 'var(--bad)',
  'too early': 'var(--mute-2)',
  'no comparison yet': 'var(--mute-2)',
};

function Quadrant({ spec, items, format }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', background: 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: spec.color }} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{spec.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>
          {items.length}
        </span>
      </div>
      <p style={{ margin: '4px 0 10px', fontSize: 11.5, color: 'var(--mute)' }}>{spec.hint}</p>

      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mute-2)' }}>Nothing here.</p>
      ) : (
        items.slice(0, 8).map((p) => (
          <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '3px 0', fontSize: 12.5 }}>
            <span style={{ color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}
            </span>
            <span style={{ color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>{p.totalSold}×</span>
            <span style={{ color: 'var(--mute)', fontVariantNumeric: 'tabular-nums', width: 42, textAlign: 'right' }}>
              {p.profitMargin.toFixed(0)}%
            </span>
            <span style={{ color: 'var(--mute-2)', fontVariantNumeric: 'tabular-nums', width: 64, textAlign: 'right' }}>
              {format(p.revenue)}
            </span>
          </div>
        ))
      )}
      {items.length > 8 && (
        <p style={{ margin: '7px 0 0', fontSize: 11.5, color: 'var(--mute-2)' }}>+{items.length - 8} more</p>
      )}
    </div>
  );
}

export default function MenuInsights() {
  const [days, setDays] = useState(30);
  const { format } = useCurrency();
  const { data, isLoading } = useMenuInsights(days);
  const { data: cross } = useCrossSell(days);
  const { data: newItems } = useNewItems();
  const { data: attach } = useAttachRate(days);

  const matrix = data?.matrix;

  return (
    <div style={{ padding: '24px 22px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Grid2X2 size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>Menu Insights</h1>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {WINDOWS.map((d) => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '4px 11px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
              border: '1px solid ' + (days === d ? 'var(--ink)' : 'var(--line)'),
              background: days === d ? 'var(--ink)' : 'transparent',
              color: days === d ? 'var(--paper)' : 'var(--mute)',
            }}>{d}d</button>
          ))}
        </div>
      </div>

      {isLoading || !matrix ? (
        <p style={{ marginTop: 18, fontSize: 13, color: 'var(--mute)' }}>Loading…</p>
      ) : (
        <>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--mute)', lineHeight: 1.55 }}>
            {matrix.costedCount} dishes classified against your own menu — the split is at your median
            volume ({matrix.medianVolume}×) and median margin ({matrix.medianMargin?.toFixed(0)}%),
            not a generic benchmark.
          </p>

          {matrix.uncostedCount > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '11px 14px',
                          background: 'var(--warn-soft)', borderRadius: 9, alignItems: 'flex-start' }}>
              <AlertCircle size={14} strokeWidth={2} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
                {matrix.uncostedCount} {matrix.uncostedCount === 1 ? 'dish has' : 'dishes have'} no recipe cost,
                so {matrix.uncostedCount === 1 ? 'it is' : 'they are'} left out rather than classified on a
                margin of zero. <Link to="/recipes" style={{ color: 'var(--ink)' }}>Add recipes</Link> to see
                {matrix.uncostedCount === 1 ? ' it' : ' them'} here.
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginTop: 14 }}>
            {QUADRANTS.map((spec) => (
              <Quadrant key={spec.key} spec={spec} items={matrix[spec.key]} format={format} />
            ))}
          </div>

          <h2 style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '28px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            <Link2 size={15} strokeWidth={2} /> Ordered together
          </h2>
          {!cross || cross.pairs.length === 0 ? (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--mute)' }}>
              No pair has come up often enough yet to mean anything.
            </p>
          ) : (
            <>
              <p style={{ margin: '6px 0 10px', fontSize: 12.5, color: 'var(--mute)' }}>
                From {cross.multiItemBaskets} of {cross.baskets} orders with more than one dish. Lift above 1
                means a genuine pairing rather than one dish simply being popular.
              </p>
              {cross.pairs.map((p) => (
                <div key={`${p.a}-${p.b}`} style={{
                  display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0',
                  borderBottom: '1px solid var(--line)', fontSize: 13,
                }}>
                  <span style={{ flex: 1, color: 'var(--ink)' }}>{p.a} <span style={{ color: 'var(--mute-2)' }}>+</span> {p.b}</span>
                  <span style={{ color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>{p.together}×</span>
                  <span style={{ color: 'var(--ok)', fontVariantNumeric: 'tabular-nums', width: 76, textAlign: 'right' }}>
                    {p.lift.toFixed(1)}× lift
                  </span>
                </div>
              ))}
            </>
          )}

          <h2 style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '28px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            <Sparkles size={15} strokeWidth={2} /> New dishes
          </h2>
          {!newItems || newItems.items.length === 0 ? (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--mute)', lineHeight: 1.55 }}>
              No dishes added in the last {newItems?.windowDays ?? 30} days. Dishes that were on the menu
              before launch tracking began have no recorded launch date, so they aren't shown here —
              anything you add from now on will be.
            </p>
          ) : (
            <>
              <p style={{ margin: '6px 0 10px', fontSize: 12.5, color: 'var(--mute)' }}>
                Judged against the menu median of {newItems.menuMedianDaily.toFixed(1)} orders a day per dish.
              </p>
              {newItems.items.map((i) => (
                <div key={i.id} style={{
                  display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0',
                  borderBottom: '1px solid var(--line)', fontSize: 13,
                }}>
                  <span style={{ flex: 1, color: 'var(--ink)' }}>{i.name}</span>
                  <span style={{ color: 'var(--mute)' }}>{i.daysLive}d live</span>
                  <span style={{ color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>
                    {i.avgDailyOrders.toFixed(1)}/day
                  </span>
                  <span style={{ color: VERDICT_COLOR[i.verdict] || 'var(--mute)', width: 118, textAlign: 'right' }}>
                    {i.verdict}
                  </span>
                </div>
              ))}
            </>
          )}

          <h2 style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '28px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            <Coffee size={15} strokeWidth={2} /> Category attach
          </h2>
          {!attach || attach.categories.length === 0 ? (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--mute)' }}>
              No category orders in this window yet.
            </p>
          ) : (
            <>
              <p style={{ margin: '6px 0 10px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
                Items sold per order, by category — the high-margin add-ons that hide in the top line.
                {attach.summary.hasPrior
                  ? ` Change is against the previous ${days} days.`
                  : ' No prior window yet, so change is not shown — it will appear once there is one.'}
                {' '}Per order, not per cover: the bill doesn't yet carry a guest count.
              </p>
              {attach.categories.map((c) => (
                <div key={c.category} style={{
                  display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0',
                  borderBottom: '1px solid var(--line)', fontSize: 13,
                }}>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                    {c.highMargin && <span title="High-margin add-on" style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--ok)', flexShrink: 0 }} />}
                    <span style={{ color: 'var(--ink)', fontWeight: c.highMargin ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.category}</span>
                  </span>
                  <span style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', fontWeight: 600, width: 46, textAlign: 'right' }}>
                    {c.attach == null ? '—' : c.attach.toFixed(2)}
                  </span>
                  <span style={{ color: 'var(--mute-2)', fontVariantNumeric: 'tabular-nums', width: 72, textAlign: 'right' }}>
                    {c.penetration == null ? '' : `${Math.round(c.penetration * 100)}% of orders`}
                  </span>
                  <span style={{
                    width: 66, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3,
                    color: c.trend === 'up' ? 'var(--ok)' : c.trend === 'down' ? 'var(--bad)' : 'var(--mute-2)',
                  }}>
                    {c.delta == null ? '·' : (
                      <>
                        {c.trend === 'up' && <ArrowUp size={12} strokeWidth={2.4} />}
                        {c.trend === 'down' && <ArrowDown size={12} strokeWidth={2.4} />}
                        {c.delta > 0 ? '+' : ''}{c.delta.toFixed(2)}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
