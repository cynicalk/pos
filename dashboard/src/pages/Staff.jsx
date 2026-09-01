import { useState } from 'react';
import { Users } from 'lucide-react';
import { useStaffPerformance } from '../hooks/useInsights';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Staff performance — per-server dine-in orders, revenue, average order value,
 * items per order (an upsell proxy) and each server's share of the take. Orders
 * are attributed the same way the service-charge-removed breakdown attributes
 * them (assigned staff, else who created the order). Rates abstain where a server
 * had no orders.
 */

const WINDOWS = [7, 30, 90];
const th = { textAlign: 'left', padding: '8px 10px', fontSize: 11.5, color: 'var(--mute-2)', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--line-2)' };
const tdNum = { padding: '9px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--ink)' };

export default function Staff() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useStaffPerformance(days);
  const { format } = useCurrency();

  const servers = data?.servers || [];
  const maxRev = servers.length ? Math.max(...servers.map((s) => s.revenue)) : 0;

  return (
    <div style={{ padding: '24px 22px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Users size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>Staff performance</h1>
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
      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--mute)', lineHeight: 1.55 }}>
        Paid dine-in orders by the server who took them. Average order value and items per order show who
        upsells; the bar is each server's share of the take.
      </p>

      {isLoading ? (
        <p style={{ marginTop: 18, fontSize: 13, color: 'var(--mute)' }}>Loading…</p>
      ) : servers.length === 0 ? (
        <p style={{ marginTop: 18, fontSize: 13, color: 'var(--mute-2)' }}>
          No attributed dine-in orders in this window.
        </p>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead><tr>
              <th style={th}>Server</th>
              <th style={{ ...th, textAlign: 'right' }}>Orders</th>
              <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
              <th style={{ ...th, textAlign: 'right' }}>AOV</th>
              <th style={{ ...th, textAlign: 'right' }}>Items/order</th>
              <th style={{ ...th, textAlign: 'right' }}>Share</th>
            </tr></thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.serverId} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '9px 10px', fontSize: 13, color: 'var(--ink)' }}>{s.name}</td>
                  <td style={tdNum}>{s.orders}</td>
                  <td style={tdNum}>{format(s.revenue)}</td>
                  <td style={tdNum}>{s.avgOrderValue == null ? '—' : format(s.avgOrderValue)}</td>
                  <td style={tdNum}>{s.itemsPerOrder == null ? '—' : s.itemsPerOrder}</td>
                  <td style={{ ...tdNum, minWidth: 120 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                      <div style={{ flex: 1, maxWidth: 80, height: 6, background: 'var(--line)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${maxRev > 0 ? (s.revenue / maxRev) * 100 : 0}%`, height: '100%', background: 'var(--ink)' }} />
                      </div>
                      <span style={{ width: 42, textAlign: 'right' }}>{s.revenueSharePct == null ? '—' : `${s.revenueSharePct}%`}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
