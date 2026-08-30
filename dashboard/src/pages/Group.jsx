import { useState } from 'react';
import { Building2, AlertTriangle, Info, Eye } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Group — every outlet in the organization on one screen.
 *
 * Two things this page is careful about.
 *
 * **A blank cell means we do not know.** An outlet that has sold nothing has no
 * food-cost percentage; it does not have one of 0%. Every rate that could not
 * be computed renders as "—" with the reason available, and the group averages
 * say how many outlets they actually cover.
 *
 * **Ranked by who needs attention, not by who is biggest.** Sorting by revenue
 * would put the flagship at the top every single day until nobody read the page.
 */

const WINDOWS = [
  { days: 7,   label: '7 days' },
  { days: 30,  label: '30 days' },
  { days: 90,  label: '90 days' },
];

const PRIORITY_TONE = {
  critical: { color: 'var(--bad)',  bg: 'var(--bad-soft)' },
  high:     { color: 'var(--bad)',  bg: 'var(--bad-soft)' },
  medium:   { color: 'var(--warn)', bg: 'var(--warn-soft)' },
  low:      { color: 'var(--mute)', bg: 'var(--hover)' },
};

const th = {
  padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600,
  color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em',
};
const td = { padding: '8px 10px', fontSize: 12.5 };
const tdNum = { ...td, fontVariantNumeric: 'tabular-nums' };

/** A figure we could not compute. Never rendered as zero. */
const Unknown = ({ title }) => (
  <span style={{ color: 'var(--mute)' }} title={title}>—</span>
);

function Stat({ value, label, sub }) {
  return (
    <div>
      <div style={{ fontSize: 23, fontWeight: 600, color: 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--mute)' }}>{label}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** "across 2 of 3 outlets" — shown whenever an average does not cover everyone. */
const coverageNote = (reporting, total) =>
  (reporting > 0 && reporting < total ? `across ${reporting} of ${total}` : null);

export default function Group() {
  const [days, setDays] = useState(30);
  const { format } = useCurrency();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['group', days],
    queryFn: async () => {
      const { data: d } = await api.get(`/group?days=${days}`);
      return d;
    },
    enabled: !!localStorage.getItem('pos_user'),
    staleTime: 5 * 60_000,
  });

  return (
    <div style={{ padding: '24px 22px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Building2 size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>
          {data?.organization?.name || 'Group'}
        </h1>
      </div>

      <div style={{ display: 'flex', gap: 4, margin: '16px 0 14px', flexWrap: 'wrap' }}>
        {WINDOWS.map((w) => (
          <button key={w.days} onClick={() => setDays(w.days)} style={{
            padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
            border: '1px solid ' + (days === w.days ? 'var(--ink)' : 'var(--line)'),
            background: days === w.days ? 'var(--ink)' : 'transparent',
            color: days === w.days ? 'var(--paper)' : 'var(--mute)',
            fontWeight: days === w.days ? 600 : 500,
          }}>{w.label}</button>
        ))}
      </div>

      {isLoading && <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>}
      {isError && (
        <p style={{ fontSize: 13, color: 'var(--bad)' }}>Could not load the group view.</p>
      )}

      {data && (
        <>
          {/* A manager granted three of eight outlets must not read their slice
              as the whole business. */}
          {data.partialView && (
            <div style={{
              display: 'flex', gap: 8, padding: '11px 14px', borderRadius: 9,
              background: 'var(--hover)', marginBottom: 18,
            }}>
              <Eye size={15} strokeWidth={2} style={{ color: 'var(--mute)', flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                You have access to {data.visibleOutlets} of this organization&apos;s{' '}
                {data.orgOutlets} outlets. Everything below covers only those —
                the group totals are not the whole business.
              </p>
            </div>
          )}

          {data.outlets.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--mute)' }}>No outlets to show.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 24 }}>
                <Stat
                  value={data.totals.outlets}
                  label={data.totals.outlets === 1 ? 'outlet' : 'outlets'}
                />
                <Stat value={format(data.totals.revenue)} label={`revenue · ${days}d`} />
                <Stat
                  value={data.totals.avgCancellationPct === null
                    ? '—' : `${data.totals.avgCancellationPct}%`}
                  label="avg cancellation"
                  sub={coverageNote(data.totals.cancellationReporting, data.totals.outlets)}
                />
                <Stat
                  value={data.totals.avgFoodCostPct === null
                    ? '—' : `${data.totals.avgFoodCostPct}%`}
                  label="avg food cost"
                  sub={coverageNote(data.totals.foodCostReporting, data.totals.outlets)}
                />
                <Stat
                  value={data.totals.avgRating === null ? '—' : data.totals.avgRating}
                  label="avg rating"
                  sub={coverageNote(data.totals.ratingReporting, data.totals.outlets)}
                />
                <Stat
                  value={data.totals.avgSalesGrowthPct === null
                    ? '—' : `${data.totals.avgSalesGrowthPct > 0 ? '+' : ''}${data.totals.avgSalesGrowthPct}%`}
                  label={`avg growth vs prior ${days}d`}
                  sub={coverageNote(data.totals.salesGrowthReporting, data.totals.outlets)}
                />
                <Stat
                  value={data.totals.avgSalesPerLabourHour === null
                    ? '—' : format(data.totals.avgSalesPerLabourHour)}
                  label="avg sales / labour hr"
                  sub={coverageNote(data.totals.splhReporting, data.totals.outlets)}
                />
                <Stat
                  value={data.totals.openActions}
                  label="open findings"
                  sub={data.totals.atStake > 0
                    ? `${format(data.totals.atStake)} priced`
                    : null}
                />
              </div>

              {/* Said plainly, because a small number next to many findings
                  otherwise reads as "barely anything wrong". */}
              {data.totals.unquantifiedActions > 0 && (
                <p style={{ margin: '-12px 0 20px', fontSize: 12, color: 'var(--mute)', lineHeight: 1.55 }}>
                  {data.totals.unquantifiedActions} of {data.totals.openActions} findings
                  carry no rupee figure — they are real risks CookLyt cannot price, not
                  problems worth nothing.
                </p>
              )}

              <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Outlets</h3>
              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
                Ordered by what needs attention — urgent findings first, then rupees at
                stake. Not by size. A dash means the outlet had nothing to measure, which
                is different from measuring zero.
              </p>

              <div style={{ overflowX: 'auto', marginBottom: 26 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                    <th style={th}>Outlet</th>
                    <th style={th}>Revenue</th>
                    <th style={th}>Growth</th>
                    <th style={th}>Sales/hr</th>
                    <th style={th}>Orders</th>
                    <th style={th}>Cancelled</th>
                    <th style={th}>Food cost</th>
                    <th style={th}>Rating</th>
                    <th style={th}>Findings</th>
                  </tr></thead>
                  <tbody>
                    {data.outlets.map((o) => (
                      <tr key={o.outletId} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={td}>
                          {o.name}
                          {o.urgentActions > 0 && (
                            <span style={{
                              marginLeft: 7, padding: '1px 7px', borderRadius: 999,
                              background: 'var(--bad-soft)', color: 'var(--bad)',
                              fontSize: 10, fontWeight: 600,
                            }}>
                              {o.urgentActions} urgent
                            </span>
                          )}
                        </td>
                        <td style={tdNum}>{format(o.revenue)}</td>
                        <td style={tdNum}>
                          {o.salesGrowthPct === null
                            ? <Unknown title="No prior window to compare against yet" />
                            : (
                              <span style={{ color: o.salesGrowthPct > 0 ? 'var(--ok)' : o.salesGrowthPct < 0 ? 'var(--bad)' : 'var(--mute)' }}>
                                {o.salesGrowthPct > 0 ? '+' : ''}{o.salesGrowthPct}%
                              </span>
                            )}
                        </td>
                        <td style={tdNum}>
                          {o.salesPerLabourHour === null
                            ? <Unknown title="No completed shifts logged in this window" />
                            : format(o.salesPerLabourHour)}
                        </td>
                        <td style={tdNum}>{o.orders}</td>
                        <td style={tdNum}>
                          {o.cancellationPct === null
                            ? <Unknown title="No orders in this window" />
                            : `${o.cancellationPct}%`}
                        </td>
                        <td style={tdNum}>
                          {o.foodCostPct === null
                            ? <Unknown title="Nothing with a costed recipe was sold" />
                            : (
                              <>
                                {o.foodCostPct}%
                                {o.foodCostCoveragePct !== null && o.foodCostCoveragePct < 100 && (
                                  <span style={{ color: 'var(--mute)', fontSize: 11 }}>
                                    {' '}({o.foodCostCoveragePct}% costed)
                                  </span>
                                )}
                              </>
                            )}
                        </td>
                        <td style={tdNum}>
                          {o.avgRating === null
                            ? <Unknown title="No reviews yet" />
                            : (
                              <>
                                {o.avgRating}
                                <span style={{ color: 'var(--mute)', fontSize: 11 }}>
                                  {' '}({o.reviewCount})
                                </span>
                              </>
                            )}
                        </td>
                        <td style={tdNum}>
                          {o.openActions}
                          {o.atStake > 0 && (
                            <span style={{ color: 'var(--mute)', fontSize: 11 }}>
                              {' '}· {format(o.atStake)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>
                Needs attention
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
                Every outlet&apos;s open findings in one list, priced ones first. Each
                outlet&apos;s own Actions page has the full set.
              </p>

              {data.attention.length === 0 ? (
                <div style={{
                  display: 'flex', gap: 8, padding: '11px 14px', borderRadius: 9,
                  background: 'var(--hover)',
                }}>
                  <Info size={15} strokeWidth={2} style={{ color: 'var(--mute)', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)' }}>
                    Nothing open across these outlets.
                  </p>
                </div>
              ) : data.attention.map((a) => {
                const tone = PRIORITY_TONE[a.priority] || PRIORITY_TONE.low;
                return (
                  <div key={a.id} style={{
                    border: '1px solid var(--line)', borderRadius: 10,
                    padding: '12px 15px', marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <AlertTriangle size={14} strokeWidth={2.2} style={{ color: tone.color }} />
                      <strong style={{ fontSize: 13.5 }}>{a.title}</strong>
                      <span style={{
                        padding: '1px 8px', borderRadius: 999, background: tone.bg,
                        color: tone.color, fontSize: 10, fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '.05em',
                      }}>{a.priority}</span>
                      <span style={{ fontSize: 12, color: 'var(--mute)' }}>{a.outletName}</span>
                      {/* Only shown when there IS a figure. An unpriced finding
                          shows nothing rather than ₹0. */}
                      {a.amount !== null && (
                        <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600 }}>
                          {format(a.amount)}
                        </span>
                      )}
                    </div>
                    {a.description && (
                      <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                        {a.description}
                      </p>
                    )}
                  </div>
                );
              })}

              {data.attention.length >= data.attentionLimit && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--mute)' }}>
                  Showing the first {data.attentionLimit}. Open an outlet&apos;s Actions
                  page for the rest.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
