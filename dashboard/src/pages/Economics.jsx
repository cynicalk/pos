import { useState } from 'react';
import { Coins, Info, Clock, TicketPercent } from 'lucide-react';
import { useEconomics, useServiceHours, useCouponEconomics } from '../hooks/useInsights';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Unit Economics + Peak/Dead Hours.
 *
 * Everything here is derived from orders the POS already took — no uploads, no
 * data entry. The one discipline that matters: costs the system genuinely
 * cannot see (platform commission, labour) are NAMED rather than counted as
 * zero, so "cost per order" is never presented as complete when it isn't.
 */

const WINDOWS = [7, 30, 90];

const FOOD_COST_TONE = {
  healthy: { color: 'var(--ok)',   label: 'Healthy' },
  watch:   { color: 'var(--warn)', label: 'Watch' },
  high:    { color: 'var(--bad)',  label: 'High' },
  unknown: { color: 'var(--mute)', label: 'Not enough costed dishes' },
};

function Stat({ label, value, sub }) {
  return (
    <div style={{ padding: '13px 15px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--paper)' }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--mute)' }}>
        {label}
      </div>
      <div style={{ marginTop: 5, fontSize: 19, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--mute)' }}>{sub}</div>}
    </div>
  );
}

function HoursChart({ data }) {
  if (!data || !data.buckets?.length) {
    return <p style={{ fontSize: 13, color: 'var(--mute)' }}>No trading recorded in this window yet.</p>;
  }
  const max = Math.max(...data.buckets.map((b) => b.orders), 1);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 118, marginTop: 12 }}>
        {data.buckets.map((b) => {
          const isPeak = data.peakHours.includes(b.hour);
          const isDead = data.deadHours.includes(b.hour);
          return (
            <div key={b.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                 title={`${b.label} — ${b.orders} orders`}>
              <div style={{
                width: '100%',
                height: `${Math.max(2, (b.orders / max) * 92)}px`,
                borderRadius: '3px 3px 0 0',
                background: isPeak ? 'var(--ok)' : isDead ? 'var(--bad-soft)' : 'var(--line-2)',
              }} />
              <span style={{ fontSize: 8.5, color: 'var(--mute)', whiteSpace: 'nowrap' }}>
                {b.label.replace(' ', '')}
              </span>
            </div>
          );
        })}
      </div>
      <p style={{ margin: '11px 0 0', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
        Busiest: {data.peakHours.map((h) => data.buckets.find((b) => b.hour === h)?.label).join(', ') || '—'}
        {data.deadHours.length > 0
          ? ` · Quiet while open: ${data.deadHours.map((h) => data.buckets.find((b) => b.hour === h)?.label).join(', ')}`
          : ' · No dead hours inside your service window'}
        {data.closedHours?.length > 0 && ` · ${data.closedHours.length} hours closed, not counted`}
      </p>
    </>
  );
}

export default function Economics() {
  const [days, setDays] = useState(30);
  const { format } = useCurrency();
  const { data, isLoading } = useEconomics(days);
  const { data: sh } = useServiceHours(days);
  const { data: coupons } = useCouponEconomics(days);

  const food = data?.foodCost;
  const tone = FOOD_COST_TONE[food?.status || 'unknown'];

  return (
    <div style={{ padding: '24px 22px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Coins size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>Economics</h1>
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

      {isLoading || !data ? (
        <p style={{ marginTop: 18, fontSize: 13, color: 'var(--mute)' }}>Loading…</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 10, marginTop: 18 }}>
            <Stat label="Paid orders" value={data.costPerOrder.paidOrders} />
            <Stat label="Average order" value={format(data.costPerOrder.avgOrderValue)} />
            <Stat label="Food cost / order" value={format(data.costPerOrder.foodCostPerOrder)} />
            <Stat label="Discounts / order" value={format(data.costPerOrder.discountsPerOrder)}
                  sub={`${format(data.costPerOrder.discountsTotal)} given away`} />
          </div>

          {/* The honesty note. Rendered as a first-class part of the page, not a
              footnote, because "cost per order" reads as complete otherwise. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '11px 14px',
                        background: 'var(--paper-2)', borderRadius: 9, alignItems: 'flex-start' }}>
            <Info size={14} strokeWidth={2} style={{ color: 'var(--mute)', flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--mute)' }}>
              These are the costs CookLyt can attribute to a single order: {data.costPerOrder.excludes.join(', ')}.
              Platform commission is not attributed per order — it lands per settlement — so it is
              counted at the period level in the operating margin below, not in this per-order floor.
            </p>
          </div>

          <h2 style={{ margin: '26px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Food cost</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 10, marginTop: 10 }}>
            <Stat
              label="Food cost"
              value={food.foodCostPct == null ? 'Unknown' : `${food.foodCostPct.toFixed(1)}%`}
              sub={<span style={{ color: tone.color }}>{tone.label}</span>}
            />
            <Stat label="Cost of goods sold" value={format(food.foodCost)} />
            <Stat
              label="Based on"
              value={`${food.itemsCosted} of ${food.itemsTotal}`}
              sub="sold lines with a costed recipe"
            />
          </div>
          {food.itemsCosted < food.itemsTotal && (
            <p style={{ margin: '9px 0 0', fontSize: 12.5, color: 'var(--mute)' }}>
              {food.itemsTotal - food.itemsCosted} sold lines have no recipe cost, so they're left out of
              the percentage rather than counted as free.
            </p>
          )}

          <h2 style={{ margin: '26px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            Labour &amp; prime cost
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 10, marginTop: 10 }}>
            <Stat label="Hours logged" value={data.labour.totalHours}
                  sub={`${data.labour.shiftsLogged} shift${data.labour.shiftsLogged === 1 ? '' : 's'}`} />
            <Stat label="Labour cost" value={format(data.labour.labourCost)} />
            <Stat
              label="Sales per labour hour"
              value={data.labour.salesPerHour == null ? 'Unknown' : format(data.labour.salesPerHour)}
            />
            <Stat
              label="Prime cost"
              value={data.primeCost.primeCostPct == null
                ? 'Not available'
                : `${data.primeCost.primeCostPct.toFixed(1)}%`}
              sub={data.primeCost.complete ? format(data.primeCost.primeCost) : 'food + labour'}
            />
          </div>

          {/* A prime cost quoted without labour is a food cost wearing its name,
              and it flatters the operator by exactly what they pay their staff.
              So the total is withheld and the reason named. */}
          {!data.primeCost.complete && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '11px 14px',
                          background: 'var(--warn-soft)', borderRadius: 9, alignItems: 'flex-start' }}>
              <Info size={14} strokeWidth={2} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
                Prime cost needs both halves. Missing: {data.primeCost.missing.join('; ')}.
                A prime cost without labour is just a food cost, and it would read better than
                the truth by exactly what you pay your staff.
              </p>
            </div>
          )}

          <h2 style={{ margin: '26px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            Delivery cost &amp; operating margin
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 10, marginTop: 10 }}>
            <Stat
              label="Platform take"
              value={data.delivery.deliveryOrders === 0 ? '—' : format(data.delivery.platformTake)}
              sub={data.delivery.reconciledOrders > 0
                ? `${format(data.delivery.commission)} commission + taxes/penalties`
                : 'no settlements reconciled'}
            />
            <Stat
              label="Reconciled"
              value={data.delivery.deliveryOrders === 0
                ? 'No delivery'
                : `${data.delivery.reconciledOrders} of ${data.delivery.deliveryOrders}`}
              sub={data.delivery.coveragePct == null ? 'delivery orders' : `${data.delivery.coveragePct}% of delivery orders`}
            />
            <Stat
              label="Operating margin"
              value={data.operatingMargin.operatingMarginPct == null
                ? 'Not available'
                : `${data.operatingMargin.operatingMarginPct.toFixed(1)}%`}
              sub={data.operatingMargin.complete ? format(data.operatingMargin.operatingMargin) : 'revenue − food − labour − delivery'}
            />
            <Stat label="Operating cost"
              value={data.operatingMargin.operatingCost == null ? '—' : format(data.operatingMargin.operatingCost)}
              sub="food + labour + platform take" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '11px 14px',
                        background: data.operatingMargin.complete ? 'var(--paper-2)' : 'var(--warn-soft)', borderRadius: 9, alignItems: 'flex-start' }}>
            <Info size={14} strokeWidth={2} style={{ color: data.operatingMargin.complete ? 'var(--mute)' : 'var(--warn)', flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: data.operatingMargin.complete ? 'var(--mute)' : 'var(--ink-2)' }}>
              {data.operatingMargin.complete ? (
                <>Operating margin is revenue less food, labour and the delivery platform's take —
                a contribution margin <strong style={{ fontWeight: 600 }}>before</strong> rent, utilities
                and overheads, not net profit.
                {data.delivery.coveragePct != null && data.delivery.coveragePct < 100 &&
                  ` Delivery commission covers ${data.delivery.coveragePct}% of delivery orders — the rest await their settlement.`}</>
              ) : (
                <>Operating margin needs its cost halves. Missing: {data.operatingMargin.missing.join('; ')}.</>
              )}
            </p>
          </div>

          <h2 style={{ margin: '26px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Cancellations</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 10, marginTop: 10 }}>
            <Stat label="Cancelled" value={data.cancellation.cancelledOrders}
                  sub={`of ${data.cancellation.totalOrders} orders`} />
            <Stat label="Cancellation rate" value={`${data.cancellation.cancellationPct.toFixed(1)}%`} />
            <Stat label="Revenue lost" value={format(data.cancellation.lostRevenue)} />
            <Stat label="Average per cancellation" value={format(data.cancellation.avgLostPerCancellation)} />
          </div>

          <h2 style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '26px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            <TicketPercent size={15} strokeWidth={2} /> Coupon contribution
          </h2>
          {!coupons || coupons.summary.activeCodes === 0 ? (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--mute)' }}>
              No coupons redeemed in this window.
            </p>
          ) : (
            <>
              <p style={{ margin: '6px 0 10px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
                What each code keeps per order after the discount you gave
                {coupons.summary.commissionApplies ? ' and the delivery platform’s cut' : ''} — ranked
                cheapest-kept first. Net revenue kept, not profit (food cost isn’t subtracted here).
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 10, marginBottom: 12 }}>
                <Stat label="Active codes" value={coupons.summary.activeCodes} sub={`${coupons.summary.totalOrders} orders`} />
                <Stat label="Discount given" value={format(coupons.summary.totalDiscount)} sub="across all codes" />
                <Stat label="Avg net kept / order" value={coupons.summary.avgNetPerOrder == null ? '—' : format(coupons.summary.avgNetPerOrder)} />
                <Stat label="Heavy discounters" value={coupons.summary.heavyCodes} sub="≥40% off gross" />
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--mute)', fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0 10px 8px', fontWeight: 600 }}>Code</th>
                      <th style={{ padding: '0 10px 8px', textAlign: 'right', fontWeight: 600 }}>Orders</th>
                      <th style={{ padding: '0 10px 8px', textAlign: 'right', fontWeight: 600 }}>Discount</th>
                      <th style={{ padding: '0 10px 8px', fontWeight: 600 }}>Weight</th>
                      <th style={{ padding: '0 10px 8px', textAlign: 'right', fontWeight: 600 }}>Kept / order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.codes.filter((c) => c.orders > 0).map((c) => {
                      const tone = c.weight === 'heavy' ? 'var(--bad)' : c.weight === 'moderate' ? 'var(--warn)' : 'var(--mute)';
                      const bg = c.weight === 'heavy' ? 'var(--bad-soft)' : c.weight === 'moderate' ? 'var(--warn-soft)' : 'var(--paper-3)';
                      return (
                        <tr key={c.id} style={{ borderTop: '1px solid var(--line)' }}>
                          <td style={{ padding: '9px 10px', fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--mono, monospace)' }}>{c.code}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>{c.orders}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>{format(c.discountPerOrder)}<span style={{ color: 'var(--mute-2)' }}>/order</span></td>
                          <td style={{ padding: '9px 10px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 999, background: bg, color: tone, fontSize: 10.5, fontWeight: 600, textTransform: 'capitalize' }}>
                              {c.weight} · {Math.round(c.discountRate * 100)}%
                            </span>
                          </td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                            {c.netPerOrder == null ? '—' : format(c.netPerOrder)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h2 style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '26px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            <Clock size={15} strokeWidth={2} /> Peak &amp; quiet hours
          </h2>
          <HoursChart data={sh} />
        </>
      )}
    </div>
  );
}
