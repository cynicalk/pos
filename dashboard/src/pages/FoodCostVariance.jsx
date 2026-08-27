import { useState, useEffect, useMemo } from 'react';
import { Scale, Download, AlertTriangle, Info } from 'lucide-react';
import { useStockCounts } from '../hooks/useStocktake';
import { useFoodCostVariance } from '../hooks/useReports';
import { useCurrency } from '../context/CurrencyContext';

const TH = { padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.07em' };
const TD = { padding: '8px 14px', fontSize: 13, color: 'var(--ink)' };
const THr = { ...TH, textAlign: 'right' };
const TDr = { ...TD, textAlign: 'right' };

// <2% well-managed, 2–5% room to improve, >5% investigate (variance methodology).
function pctColor(pct) {
  const a = Math.abs(pct);
  return a < 2 ? 'var(--ok)' : a <= 5 ? '#d97706' : 'var(--bad)';
}

function Card({ label, value, sub, color }) {
  return (
    <div style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper-2)', minWidth: 130 }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</p>
      <p className="mono num" style={{ fontSize: 20, fontWeight: 700, color: color || 'var(--ink)', marginTop: 2 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--mute)', marginTop: 1 }}>{sub}</p>}
    </div>
  );
}

export default function FoodCostVariance() {
  const { format } = useCurrency();
  const { data: counts = [] } = useStockCounts();
  const finalized = useMemo(() => counts.filter((c) => c.status === 'finalized'), [counts]);

  const [closingId, setClosingId] = useState('');
  const [openingId, setOpeningId] = useState('');

  // Default: most recent finalized as closing, the one before it as opening
  useEffect(() => {
    if (!finalized.length) return;
    if (!closingId) setClosingId(finalized[0].id);
    if (!openingId && finalized[1]) setOpeningId(finalized[1].id);
  }, [finalized, closingId, openingId]);

  const { data, isLoading, error } = useFoodCostVariance(closingId, openingId);
  const totals = data?.totals;
  const rows = data?.rows || [];

  function exportCsv() {
    const headers = ['Ingredient', 'Unit', 'Theoretical qty', 'Actual qty', 'Theoretical cost', 'Actual cost', 'Price variance', 'Usage variance', 'Dollar variance', 'Variance % of theo', 'Flag'];
    const lines = rows.map((r) => [
      r.ingredient_name, r.unit, r.theoretical_qty, r.actual_qty, r.theoretical_cost, r.actual_cost,
      r.price_variance, r.usage_variance, r.dollar_variance, r.variance_pct_of_theo ?? '', r.flag ?? '',
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `food-cost-variance-${data?.closing?.label || 'report'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Food-Cost Variance</h1>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>Theoretical (recipe) vs actual (counted) usage, per ingredient</p>
        </div>
        {rows.length > 0 && (
          <button onClick={exportCsv} className="ml-auto btn btn-sm" style={{ gap: 5 }}><Download size={12} /> Export CSV</button>
        )}
      </div>

      {/* Count pickers */}
      <div className="flex items-center gap-2 flex-wrap">
        <label style={{ fontSize: 11.5, color: 'var(--mute)' }}>Opening</label>
        <select value={openingId} onChange={(e) => setOpeningId(e.target.value)} className="input" style={{ height: 32, fontSize: 12, minWidth: 200 }}>
          <option value="">Auto (previous count)</option>
          {finalized.map((c) => <option key={c.id} value={c.id} disabled={c.id === closingId}>{c.label}</option>)}
        </select>
        <label style={{ fontSize: 11.5, color: 'var(--mute)' }}>Closing</label>
        <select value={closingId} onChange={(e) => setClosingId(e.target.value)} className="input" style={{ height: 32, fontSize: 12, minWidth: 200 }}>
          <option value="">Select…</option>
          {finalized.map((c) => <option key={c.id} value={c.id} disabled={c.id === openingId}>{c.label}</option>)}
        </select>
      </div>

      {finalized.length < 2 ? (
        <div className="py-16 text-center rounded-[8px]" style={{ fontSize: 13, color: 'var(--mute)', border: '1px dashed var(--line-2)' }}>
          Variance needs two finalized stock counts (opening + closing). Create and finalize counts on the Stocktake page.
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-[6px] px-3 py-2" style={{ background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, color: '#991b1b' }}>
          <AlertTriangle size={13} /> {error.response?.data?.error || 'Could not compute variance'}
        </div>
      ) : isLoading || !totals ? (
        <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</div>
      ) : (
        <>
          {/* Summary */}
          <div className="flex items-center gap-3 flex-wrap">
            <Card label="Sales" value={format(totals.sales)} />
            <Card label="Theoretical cost" value={format(totals.theoretical_cost)} sub={totals.theoretical_pct != null ? `${totals.theoretical_pct}% of sales` : null} />
            <Card label="Actual cost" value={format(totals.actual_cost)} sub={totals.actual_pct != null ? `${totals.actual_pct}% of sales` : null} />
            <Card
              label="Total variance"
              value={format(totals.total_variance)}
              color={totals.variance_pct_of_sales != null ? pctColor(totals.variance_pct_of_sales) : 'var(--ink)'}
              sub={totals.variance_pct_of_sales != null ? `${totals.variance_pct_of_sales}% of sales` : null}
            />
          </div>

          {totals.uncounted_ingredients > 0 && (
            <div className="flex items-center gap-2 rounded-[6px] px-3 py-2" style={{ background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
              <Info size={13} /> {totals.uncounted_ingredients} ingredient(s) had no closing count and were excluded.
            </div>
          )}

          {/* Per-ingredient table, ranked by absolute dollar variance */}
          <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr style={{ background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
                    <th style={TH}>Ingredient</th>
                    <th style={THr}>Theo qty</th>
                    <th style={THr}>Actual qty</th>
                    <th style={THr}>Theo cost</th>
                    <th style={THr}>Actual cost</th>
                    <th style={THr}>Price var</th>
                    <th style={THr}>Usage var</th>
                    <th style={THr}>$ Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.ingredient_id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ ...TD, fontWeight: 500 }}>
                        <span className="flex items-center gap-1.5">
                          {r.flag === 'high' && <span title="Actual far exceeds recipe" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bad)', flexShrink: 0 }} />}
                          {r.flag === 'negative' && <span title="Actual below theoretical — possible miscount or unlogged delivery" style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706', flexShrink: 0 }} />}
                          {r.ingredient_name}
                          <span style={{ fontSize: 11, color: 'var(--mute-2)' }}>{r.unit}</span>
                        </span>
                      </td>
                      <td className="mono num" style={{ ...TDr, color: 'var(--mute)' }}>{r.theoretical_qty}</td>
                      <td className="mono num" style={{ ...TDr, color: 'var(--mute)' }}>{r.actual_qty}</td>
                      <td className="mono num" style={TDr}>{format(r.theoretical_cost)}</td>
                      <td className="mono num" style={TDr}>{format(r.actual_cost)}</td>
                      <td className="mono num" style={{ ...TDr, color: 'var(--mute)' }}>{format(r.price_variance)}</td>
                      <td className="mono num" style={{ ...TDr, color: 'var(--mute)' }}>{format(r.usage_variance)}</td>
                      <td className="mono num" style={{ ...TDr, fontWeight: 600, color: r.dollar_variance > 0.01 ? 'var(--bad)' : r.dollar_variance < -0.01 ? '#d97706' : 'var(--mute)' }}>
                        {format(r.dollar_variance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p style={{ fontSize: 11, color: 'var(--mute)', lineHeight: 1.5 }}>
            Ranked by largest dollar impact. <b>Price variance</b> = market/purchase price moved; <b>usage variance</b> = over-portioning, waste, yield loss, or theft.
            A negative variance (amber) often means a miscount or unlogged delivery — verify the data before treating it as a win.
          </p>
        </>
      )}
    </div>
  );
}
