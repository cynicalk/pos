import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { useCostReport } from '../hooks/useRecipes';
import { useWasteReport } from '../hooks/useInventory';
import { useCurrency } from '../context/CurrencyContext';
import { useTimezone } from '../context/TimezoneContext';
import { startOfMonth } from '../utils/dateUtils';

function MarginBadge({ pct }) {
  if (pct === null || pct === undefined) {
    return <span style={{ fontSize: 11, color: 'var(--mute)' }}>—</span>;
  }
  const color = pct >= 60 ? 'var(--ok)' : pct >= 40 ? '#d97706' : 'var(--bad)';
  const Icon  = pct >= 60 ? TrendingUp : pct >= 40 ? Minus : TrendingDown;
  return (
    <span className="flex items-center gap-1" style={{ fontSize: 12, fontWeight: 600, color }}>
      <Icon size={12} />
      {pct.toFixed(1)}%
    </span>
  );
}

const TABS = ['Cost Cards', 'Waste Report'];

export default function CostingReports() {
  const { todayLocal } = useTimezone();
  const [tab,  setTab]  = useState('Cost Cards');
  const [from, setFrom] = useState(() => startOfMonth(todayLocal()));
  const [to,   setTo]   = useState(() => todayLocal());

  const { data: costReport = [], isLoading: loadingCost } = useCostReport();
  const { data: wasteRows  = [], isLoading: loadingWaste } = useWasteReport(from, to);
  const { format, formatOrDash } = useCurrency();

  const totalWasteCost = wasteRows.reduce((s, r) => s + parseFloat(r.total_cost || 0), 0);

  // Sort cost report: no selling price (unlinked) at bottom, then by margin asc
  const sortedCost = [...costReport].sort((a, b) => {
    if (a.margin_pct === null && b.margin_pct !== null) return 1;
    if (b.margin_pct === null && a.margin_pct !== null) return -1;
    return (a.margin_pct ?? 0) - (b.margin_pct ?? 0);
  });

  return (
    <div className="space-y-5">

      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Costing</h1>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>Recipe margins & waste analysis</p>
        </div>
        {tab === 'Waste Report' && (
          <div className="ml-auto flex items-center gap-1.5">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" style={{ height: 32, width: 130, fontSize: 12 }} />
            <span style={{ fontSize: 12, color: 'var(--mute)' }}>–</span>
            <input type="date" value={to}   onChange={(e) => setTo(e.target.value)}   className="input" style={{ height: 32, width: 130, fontSize: 12 }} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0" style={{ borderBottom: '1px solid var(--line)' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              height: 34, padding: '0 16px', background: 'transparent', border: 0,
              borderBottom: tab === t ? '2px solid var(--ink)' : '2px solid transparent',
              marginBottom: -1, fontSize: 13, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--ink)' : 'var(--mute)', cursor: 'pointer',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Cost Cards ───────────────────────────────────────────── */}
      {tab === 'Cost Cards' && (
        loadingCost ? (
          <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</div>
        ) : costReport.length === 0 ? (
          <div className="py-16 text-center rounded-[8px]" style={{ fontSize: 13, color: 'var(--mute)', border: '1px dashed var(--line-2)' }}>
            No recipes found — add recipes to see cost cards
          </div>
        ) : (
          <>
            {sortedCost.some((r) => r.selling_price === null) && (
              <div className="flex items-center gap-2 rounded-[6px] px-3 py-2"
                style={{ background: '#fef3c7', border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
                <AlertTriangle size={13} />
                Some recipes aren't linked to a menu item — link them on the Recipes page to see margins.
              </div>
            )}
            <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 540 }}>
                  <thead>
                    <tr style={{ background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
                      {['Recipe', 'Menu item', 'Ingredients', 'Cost', 'Sell price', 'Gross margin', 'GP%'].map((h) => (
                        <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCost.map((r) => (
                      <tr key={r.id}
                        style={{ borderBottom: '1px solid var(--line)', transition: 'background .1s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{r.name}</td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--mute)' }}>
                          {r.menu_item_name ?? <span style={{ color: 'var(--mute-2)' }}>unlinked</span>}
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--mute)' }}>
                          {(r.ingredients || []).length}
                        </td>
                        <td className="mono num" style={{ padding: '10px 16px', fontSize: 13, color: 'var(--ink)' }}>
                          {format(r.current_cost)}
                        </td>
                        <td className="mono num" style={{ padding: '10px 16px', fontSize: 13, color: 'var(--mute)' }}>
                          {formatOrDash(r.selling_price)}
                        </td>
                        <td className="mono num" style={{ padding: '10px 16px', fontSize: 13, color: 'var(--ink)' }}>
                          {formatOrDash(r.gross_margin)}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <MarginBadge pct={r.margin_pct} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      )}

      {/* ── Waste Report ─────────────────────────────────────────── */}
      {tab === 'Waste Report' && (
        loadingWaste ? (
          <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</div>
        ) : wasteRows.length === 0 ? (
          <div className="py-16 text-center rounded-[8px]" style={{ fontSize: 13, color: 'var(--mute)', border: '1px dashed var(--line-2)' }}>
            No waste recorded for this period
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper-2)' }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Total waste cost</p>
                <p className="mono num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginTop: 2 }}>{format(totalWasteCost)}</p>
              </div>
              <div style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper-2)' }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Line items</p>
                <p className="mono num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginTop: 2 }}>{wasteRows.length}</p>
              </div>
            </div>

            <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                  <thead>
                    <tr style={{ background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
                      {['Ingredient', 'Reason', 'Total qty', 'Total cost'].map((h) => (
                        <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {wasteRows.map((row, i) => (
                      <tr key={i}
                        style={{ borderBottom: '1px solid var(--line)', transition: 'background .1s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{row.ingredient_name}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                            {row.reason}
                          </span>
                        </td>
                        <td className="mono num" style={{ padding: '10px 16px', fontSize: 12, color: 'var(--mute)' }}>
                          {parseFloat(row.total_quantity).toFixed(3)} {row.unit}
                        </td>
                        <td className="mono num" style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                          {format(row.total_cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
