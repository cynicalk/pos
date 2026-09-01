import { useState } from 'react';
import { LineChart } from 'lucide-react';
import { useGuestCohorts } from '../hooks/useInsights';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Guest cohorts — the retention triangle and cumulative LTV, grouped by the month
 * a guest first visited. Toggle between "who came back" (retention %) and "what
 * they're worth" (cumulative revenue per guest). Each cohort only fills the months
 * it's actually had; empty cells are "not yet", not zero.
 */

const heat = (pct) => {
  if (pct == null) return 'transparent';
  // Jade at high retention → faded at low; alpha scales with the value.
  const a = Math.max(0.06, Math.min(0.9, pct / 100));
  return `color-mix(in srgb, var(--ok) ${Math.round(a * 100)}%, transparent)`;
};

export default function Cohorts() {
  const [mode, setMode] = useState('retention'); // 'retention' | 'ltv'
  const { data, isLoading } = useGuestCohorts();
  const { format } = useCurrency();

  const cohorts = data?.cohorts || [];
  const cols = Array.from({ length: (data?.maxOffset ?? 0) + 1 }, (_, i) => i);

  const cell = { padding: '8px 10px', textAlign: 'center', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', border: '1px solid var(--line)' };

  return (
    <div style={{ padding: '24px 22px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <LineChart size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>Guest cohorts</h1>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {[['retention', 'Retention'], ['ltv', 'LTV']].map(([v, label]) => (
            <button key={v} onClick={() => setMode(v)} style={{
              padding: '4px 11px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
              border: '1px solid ' + (mode === v ? 'var(--ink)' : 'var(--line)'),
              background: mode === v ? 'var(--ink)' : 'transparent',
              color: mode === v ? 'var(--paper)' : 'var(--mute)',
            }}>{label}</button>
          ))}
        </div>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--mute)', lineHeight: 1.55 }}>
        Guests grouped by the month they first visited. {mode === 'retention'
          ? 'Each cell is the share of that cohort who came back that many months later.'
          : 'Each cell is cumulative revenue per original guest — how much a cohort is worth over time.'}
        {' '}Measured only on guests whose orders are attributed; abstains where a cohort hasn't reached that month.
      </p>

      {isLoading ? (
        <p style={{ marginTop: 18, fontSize: 13, color: 'var(--mute)' }}>Loading…</p>
      ) : cohorts.length === 0 ? (
        <p style={{ marginTop: 18, fontSize: 13, color: 'var(--mute-2)' }}>
          No attributed guest visit history yet.
        </p>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: 16 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>
              <th style={{ ...cell, textAlign: 'left', color: 'var(--mute-2)' }}>Cohort</th>
              <th style={{ ...cell, color: 'var(--mute-2)' }}>Guests</th>
              {cols.map((o) => <th key={o} style={{ ...cell, color: 'var(--mute-2)' }}>M{o}</th>)}
            </tr></thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.cohort}>
                  <td style={{ ...cell, textAlign: 'left', color: 'var(--ink)', fontWeight: 600 }}>{c.cohort}</td>
                  <td style={{ ...cell, color: 'var(--mute)' }}>{c.size}</td>
                  {cols.map((o) => {
                    const m = c.months[o];
                    if (!m) return <td key={o} style={{ ...cell, color: 'var(--mute-2)' }}>·</td>;
                    if (mode === 'retention') {
                      return <td key={o} style={{ ...cell, background: heat(m.retentionPct), color: 'var(--ink)' }}>{m.retentionPct}%</td>;
                    }
                    return <td key={o} style={{ ...cell, color: 'var(--ink)' }}>{format(m.cumulativeLtv)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
