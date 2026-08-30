import { Link } from 'react-router-dom';
import { Tag, Info, ArrowRight, Hourglass } from 'lucide-react';
import { useDemandForecast } from '../hooks/useForecast';
import { CARD, LABEL, th, td, tdNum } from '../lib/ui';

/**
 * Promo-aware Forecast — not a separate model, a property of the demand one.
 *
 * A past promotion is real trade, but it is not the baseline the operator wants
 * a normal day forecast built from: a 25%-off day left in the history teaches
 * every future same-weekday a spike that only happens when there is an offer on.
 * So the forecast detects promo days from coupon redemptions and sets them aside
 * from the level and weekday factors — exactly as it sets aside a day the kitchen
 * was closed. This screen shows which days were set aside and why.
 *
 * It does NOT forecast a promo uplift: that needs the promo's own terms and a
 * history of comparable offers this deployment does not hold, and a made-up
 * uplift is the kind of number the engine refuses to print.
 */

const fmtDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export default function PromoForecast() {
  const { data, isLoading } = useDemandForecast();

  if (isLoading || !data) {
    return <div style={{ padding: 32, color: 'var(--mute)' }}>Loading…</div>;
  }

  const promo = data.promo || { days: [], count: 0 };
  const notEnough = data.forecast?.reason === 'not_enough_history';

  return (
    <div style={{ padding: '26px 24px 48px', maxWidth: 940, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div>
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px',
            borderRadius: 999, background: 'var(--paper-3)', color: 'var(--mute)',
            fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em',
          }}>
            <Tag size={12} strokeWidth={2.2} /> From coupon redemptions
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>
          Promo-aware Forecast
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)', maxWidth: 760 }}>
          The demand forecast sets promo days aside so a discount spike doesn't inflate the normal
          baseline — the same way it excludes days the kitchen was closed.
        </p>
      </div>

      <div style={{ padding: '14px 18px', borderLeft: '2px solid var(--info)', background: 'var(--paper-2)', borderRadius: '0 8px 8px 0' }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--mute)' }}>
          <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>The baseline is the non-promo expectation.</strong>{' '}
          A day counts as a promo when a real share of its orders carried a coupon — not a stray loyalty
          discount. This screen never predicts a promo uplift: that needs the offer's own terms, which the
          POS doesn't hold, so it stays honest about what it can and can't say.
        </p>
      </div>

      {notEnough ? (
        <div style={{ padding: '20px 22px', ...CARD }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
            background: 'var(--info-soft)', color: 'var(--info)', fontSize: 11, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.07em',
          }}>
            <Hourglass size={13} strokeWidth={2.2} /> Collecting history
          </span>
          <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            There isn't yet enough history for a baseline, so there is nothing to exclude promos from.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div style={CARD}>
              <div style={LABEL}>Promo days set aside</div>
              <div className="mono num" style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{promo.count}</div>
              <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>excluded from the level &amp; weekday shape</div>
            </div>
            <div style={CARD}>
              <div style={LABEL}>Baseline history</div>
              <div className="mono num" style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{data.history?.tradingDays}</div>
              <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>normal trading days it's built from</div>
            </div>
          </div>

          {promo.count === 0 ? (
            <div style={{ ...CARD, color: 'var(--mute)', fontSize: 13.5, lineHeight: 1.6 }}>
              No promo days detected in the window — nothing to set aside. As coupon-heavy days appear in
              your history (a real share of a day's orders on an offer), they'll be listed here and left
              out of the baseline automatically.
            </div>
          ) : (
            <div style={CARD}>
              <div style={{ ...LABEL, marginBottom: 4 }}>Days set aside</div>
              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6, maxWidth: 760 }}>
                Each of these had a material share of its orders on a coupon, so it was excluded from the
                normal-demand baseline. They still count as real trade elsewhere — just not as the yardstick
                for an ordinary day.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
                  <thead>
                    <tr>
                      <th style={th}>Day</th>
                      <th style={{ ...th, textAlign: 'right' }}>Orders</th>
                      <th style={{ ...th, textAlign: 'right' }}>On a coupon</th>
                      <th style={{ ...th, textAlign: 'right' }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promo.days.map((d) => (
                      <tr key={d.date} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ ...td, fontWeight: 500 }}>{fmtDate(d.date)}</td>
                        <td style={tdNum} className="mono num">{d.orders}</td>
                        <td style={tdNum} className="mono num">{d.redemptions}</td>
                        <td style={{ ...tdNum, fontWeight: 600 }} className="mono num">{Math.round(d.share * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-5 flex-wrap">
        <Link to="/forecast/demand" className="flex items-center gap-2"
          style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none', borderBottom: '1px solid var(--line-2)', paddingBottom: 3 }}>
          The full demand forecast <ArrowRight size={14} strokeWidth={2} />
        </Link>
        <Link to="/coupons" className="flex items-center gap-2"
          style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--mute)', textDecoration: 'none', borderBottom: '1px solid var(--line-2)', paddingBottom: 3 }}>
          Coupons &amp; offers <ArrowRight size={14} strokeWidth={2} />
        </Link>
      </div>

      <p style={{ display: 'flex', gap: 7, alignItems: 'flex-start', margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--mute)' }}>
        <Info size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 3 }} />
        <span>Promo detection reads coupon redemptions; the exclusion flows into every forecast that
          builds on demand — prep sheet, inventory and reorder included.</span>
      </p>
    </div>
  );
}
