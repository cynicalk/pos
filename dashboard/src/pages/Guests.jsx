import { useState } from 'react';
import { Users, Info, Copy, Check, TrendingDown } from 'lucide-react';
import { useGuestMetrics, useChurnRisk } from '../hooks/useReputation';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Guests — repeat rate and the winback list.
 *
 * Built on loyalty_customers and orders. There is no guest table and no visit
 * table, so the POS only sees guests who joined loyalty or gave their number at
 * the till — usually a minority of covers.
 *
 * The coverage banner is therefore not a caveat tucked at the bottom; it is the
 * first thing on the page. A repeat rate quoted without it looks like a fact
 * about the restaurant when it is a fact about the loyalty programme.
 *
 * There is also no way to SEND a winback message from here. Guest messaging is
 * a stub (see waitlist.notify), so the page hands over the number and the
 * message to copy, and does not pretend to have delivered anything.
 */

const WINDOWS = [
  { days: 30,  label: '30 days' },
  { days: 90,  label: '90 days' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
];

const th = {
  padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600,
  color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em',
};
const td = { padding: '7px 10px', fontSize: 12.5 };

const btn = (primary = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
  fontSize: 12, fontWeight: 500,
  border: `1px solid ${primary ? 'var(--ink)' : 'var(--line-2)'}`,
  background: primary ? 'var(--ink)' : 'transparent',
  color: primary ? 'var(--paper)' : 'var(--ink)',
});

function Stat({ value, label, sub }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--mute)' }}>{label}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Copy a phone number. There is no send path, so copying is the honest verb. */
function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <button
      style={btn()}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        }).catch(() => {});
      }}
      aria-label={label}
    >
      {done ? <Check size={12} strokeWidth={2.4} /> : <Copy size={12} strokeWidth={2.2} />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

const CHURN_STATUS = {
  active:       { label: 'Active',       color: 'var(--ok)',   bg: 'var(--ok-soft)' },
  due:          { label: 'Due back',     color: 'var(--info)', bg: 'var(--info-soft)' },
  overdue:      { label: 'Overdue',      color: 'var(--warn)', bg: 'var(--warn-soft)' },
  likely_lost:  { label: 'Likely lost',  color: 'var(--bad)',  bg: 'var(--bad-soft)' },
};

function ChurnPill({ status }) {
  const s = CHURN_STATUS[status] || CHURN_STATUS.active;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.color, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{s.label}</span>
  );
}

const shortDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/**
 * Churn risk from each guest's own cadence — the per-guest answer to the fixed
 * 30-day winback window. "Overdue" means overdue for THIS guest: a weekly
 * regular gone three weeks, not everyone measured against one number.
 */
function ChurnSection({ format }) {
  const { data, isLoading } = useChurnRisk();
  if (isLoading || !data) return null;
  if (data.predictableGuests === 0) {
    return (
      <div style={{ marginBottom: 26 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <TrendingDown size={15} strokeWidth={2} /> Churn risk &amp; reorder prediction
        </h3>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
          No guest yet has the {data.minOrdersForCadence}+ visits needed to measure a cadence, so
          there is nothing to predict against. This fills in as identified guests return.
        </p>
      </div>
    );
  }

  const rows = [...data.atRisk, ...data.dueSoon];

  return (
    <div style={{ marginBottom: 30 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        <TrendingDown size={15} strokeWidth={2} /> Churn risk &amp; reorder prediction
      </h3>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55, maxWidth: 760 }}>
        Predicted from each guest's own visit rhythm — the median gap between their visits — not a
        fixed window. "Overdue for them" is the signal a flat 30-day list misses. Value shown is what
        an at-risk guest has already spent, never a projection of winning them back.
      </p>

      <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap', marginBottom: 16 }}>
        <Stat value={data.atRiskCount} label="at risk of churning"
          sub={data.atRiskCount > 0 ? `${format(data.atRiskHistoricSpend)} spent previously` : null} />
        <Stat value={data.dueSoonCount} label="due back soon" />
        <Stat value={data.predictableGuests} label="guests with a cadence"
          sub={data.insufficientHistory > 0 ? `${data.insufficientHistory} too new to predict` : null} />
      </div>

      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>No guest is overdue or due back right now.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
            <th style={th}>Guest</th>
            <th style={th}>Rhythm</th>
            <th style={th}>Last seen</th>
            <th style={th}>Status</th>
            <th style={th}>Predicted next</th>
            <th style={th}>Spent</th>
            <th style={th} />
          </tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.customerId} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={td}>{g.name || <span style={{ color: 'var(--mute)' }}>no name</span>}</td>
                <td style={{ ...td, color: 'var(--mute)' }}>~every {g.cadenceDays}d · {g.regularity}</td>
                <td style={{ ...td, color: 'var(--mute)' }}>{g.daysSince}d ago</td>
                <td style={td}><ChurnPill status={g.status} /></td>
                <td style={{ ...td, color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>
                  {shortDate(g.predictedNextOrder)}
                  {g.daysUntilPredicted < 0 && <span style={{ color: 'var(--warn)' }}> ({-g.daysUntilPredicted}d late)</span>}
                </td>
                <td style={td}>{format(g.totalSpend)}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <CopyButton text={g.phone} label={`Copy phone number for ${g.name || 'guest'}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Guests() {
  const [days, setDays] = useState(90);
  const { data, isLoading } = useGuestMetrics(days);
  const { format } = useCurrency();

  return (
    <div style={{ padding: '24px 22px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Users size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>Guests</h1>
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

      {data && (
        <>
          {/* First, not last. Everything below is measured over this slice only. */}
          <div style={{
            display: 'flex', gap: 8, padding: '11px 14px', borderRadius: 9,
            background: 'var(--hover)', marginBottom: 18,
          }}>
            <Info size={15} strokeWidth={2} style={{ color: 'var(--mute)', flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              {data.coverage.pct === null ? (
                <>No paid orders in this window, so there is nothing to measure yet.</>
              ) : (
                <>
                  <strong>{data.coverage.pct}%</strong> of paid orders in the last {days} days could
                  be matched to a known guest ({data.coverage.identifiedOrders} of{' '}
                  {data.coverage.totalOrders}). Everything below describes those guests only —
                  the rest of your covers are anonymous to the POS, so this is not a repeat rate
                  for the restaurant as a whole.
                </>
              )}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap', marginBottom: 24 }}>
            <Stat value={data.uniqueGuests} label="known guests" />
            <Stat value={data.repeatGuests} label="came back at least once" />
            <Stat
              value={data.repeatRatePct === null ? '—' : `${data.repeatRatePct}%`}
              label="repeat rate"
              sub={data.repeatRatePct === null
                ? `needs ${data.minGuestsForRate}+ known guests`
                : null}
            />
            <Stat
              value={data.lapsedCount}
              label={`not back in ${data.lapsedAfterDays}+ days`}
              sub={data.lapsedCount > 0 ? `${format(data.lapsedHistoricSpend)} spent previously` : null}
            />
          </div>

          <ChurnSection format={format} />

          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Winback list</h3>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
            Guests who have not been back in {data.lapsedAfterDays} days, most valuable first.
            CookLyt cannot message them — there is no guest messaging channel connected — so copy
            the number and reach out however you normally would.
          </p>

          {data.lapsedGuests.length === 0 ? (
            // Carries the same bottom margin the table it replaces does, so the
            // empty state does not collide with the next heading.
            <p style={{ margin: '0 0 26px', fontSize: 13, color: 'var(--mute)' }}>
              Nobody has lapsed in this window.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 26 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                <th style={th}>Guest</th>
                <th style={th}>Phone</th>
                <th style={th}>Visits</th>
                <th style={th}>Spent</th>
                <th style={th}>Last seen</th>
                <th style={th} />
              </tr></thead>
              <tbody>
                {data.lapsedGuests.map((g) => (
                  <tr key={g.customerId} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={td}>{g.name || <span style={{ color: 'var(--mute)' }}>no name</span>}</td>
                    <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{g.phone}</td>
                    <td style={td}>{g.visits}</td>
                    <td style={td}>{format(g.totalSpend)}</td>
                    <td style={{ ...td, color: 'var(--mute)' }}>{g.daysSince} days ago</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <CopyButton text={g.phone} label={`Copy phone number for ${g.name || 'guest'}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Recently seen</h3>
          {data.recentGuests.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--mute)' }}>No identified guests in this window.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                <th style={th}>Guest</th>
                <th style={th}>Visits</th>
                <th style={th}>Spent</th>
                <th style={th}>Avg per visit</th>
                <th style={th}>Last seen</th>
              </tr></thead>
              <tbody>
                {data.recentGuests.map((g) => (
                  <tr key={g.customerId} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={td}>
                      {g.name || <span style={{ color: 'var(--mute)' }}>no name</span>}
                      {g.repeat && (
                        <span style={{
                          marginLeft: 7, padding: '1px 7px', borderRadius: 999,
                          background: 'var(--ok-soft)', color: 'var(--ok)',
                          fontSize: 10, fontWeight: 600,
                        }}>repeat</span>
                      )}
                    </td>
                    <td style={td}>{g.visits}</td>
                    <td style={td}>{format(g.totalSpend)}</td>
                    <td style={td}>{format(g.avgSpend)}</td>
                    <td style={{ ...td, color: 'var(--mute)' }}>
                      {g.daysSince === 0 ? 'today' : `${g.daysSince} days ago`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
