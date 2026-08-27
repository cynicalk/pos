import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { useCurrency } from '../context/CurrencyContext';
import { useShiftFullHistory } from '../hooks/useShift';
import { formatDate } from '../utils/dateUtils';

export default function ShiftHistory() {
  const navigate = useNavigate();
  const { format, currency } = useCurrency();
  const { data: history = [], isLoading } = useShiftFullHistory();
  const [expanded, setExpanded] = useState(null);

  if (isLoading) {
    return <div className="py-12 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</div>;
  }

  const totalCounts = history.length;
  const balanced    = history.filter((h) => Math.abs(parseFloat(h.variance)) < 0.01).length;
  const netVariance = history.reduce((s, h) => s + parseFloat(h.variance || 0), 0);

  return (
    <div className="space-y-5" style={{ maxWidth: 900 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => navigate('/shift')}
          className="flex items-center gap-1"
          style={{ fontSize: 12, color: 'var(--mute)', background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mute)')}
        >
          <ChevronLeft size={14} /> Shift Count
        </button>
        <span style={{ color: 'var(--line-2)', fontSize: 14 }}>/</span>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>History</h1>
      </div>

      {/* Summary strip */}
      <div style={{
        display: 'flex',
        border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden',
        background: 'var(--paper)',
      }}>
        {[
          { label: 'Total Counts',  value: totalCounts,      color: 'var(--ink)' },
          { label: 'Balanced',      value: balanced,          color: 'var(--ok)'  },
          { label: 'Net Variance',
            value: format(netVariance),
            color: Math.abs(netVariance) < 0.01 ? 'var(--ok)' : netVariance < 0 ? 'var(--bad)' : 'var(--warn)',
          },
        ].map(({ label, value, color }, i) => (
          <div key={i} style={{
            flex: 1, padding: '16px 20px',
            borderRight: i < 2 ? '1px solid var(--line)' : 'none',
          }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--mute)', marginBottom: 6 }}>
              {label}
            </p>
            <p className="mono num" style={{ fontSize: 20, fontWeight: 400, color, letterSpacing: '-0.02em' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* History table */}
      {history.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--mute)', fontSize: 13 }}>
          No shift counts recorded yet.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden', background: 'var(--paper)' }}>

          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '190px 1fr 110px 110px 110px 24px',
            gap: 12, padding: '9px 16px',
            borderBottom: '1px solid var(--line)',
            background: 'var(--paper-2)',
          }}>
            {['Date', 'Counted By', 'Expected', 'Actual', 'Variance', ''].map((h, i) => (
              <span key={i} style={{
                fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '.12em', color: 'var(--mute)',
                textAlign: i >= 2 && i < 5 ? 'right' : 'left',
              }}>
                {h}
              </span>
            ))}
          </div>

          {history.map((h, idx) => {
            const v       = parseFloat(h.variance);
            const isOver  = v >  0.005;
            const isShort = v < -0.005;
            const vColor  = Math.abs(v) < 0.005 ? 'var(--ok)' : isShort ? 'var(--bad)' : 'var(--warn)';
            const vLabel  = Math.abs(v) < 0.005
              ? 'Balanced'
              : `${isOver ? '+' : '−'}${format(Math.abs(v))}`;

            const isExpanded = expanded === h.id;
            const rawDenoms  = h.denominations;
            const denoms     = rawDenoms
              ? (typeof rawDenoms === 'string' ? JSON.parse(rawDenoms) : rawDenoms)
              : null;
            const hasDenoms  = Array.isArray(denoms) && denoms.length > 0;

            return (
              <div
                key={h.id}
                style={{ borderBottom: idx < history.length - 1 ? '1px solid var(--line)' : 'none' }}
              >
                {/* Row */}
                <div
                  onClick={() => hasDenoms && setExpanded(isExpanded ? null : h.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '190px 1fr 110px 110px 110px 24px',
                    gap: 12, padding: '12px 16px',
                    alignItems: 'center',
                    cursor: hasDenoms ? 'pointer' : 'default',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={(e) => { if (hasDenoms) e.currentTarget.style.background = 'var(--paper-2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>
                      {formatDate(h.counted_at)}
                    </p>
                    {h.notes && (
                      <p style={{
                        fontSize: 11, color: 'var(--mute)', marginTop: 2,
                        fontStyle: 'italic',
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      }}>
                        {h.notes}
                      </p>
                    )}
                  </div>

                  <p style={{
                    fontSize: 12.5, color: 'var(--mute)',
                    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                  }}>
                    {h.counted_by_email || '—'}
                  </p>

                  <p className="mono num" style={{ fontSize: 13, textAlign: 'right', color: 'var(--mute)' }}>
                    {format(parseFloat(h.expected_cash))}
                  </p>
                  <p className="mono num" style={{ fontSize: 13, textAlign: 'right' }}>
                    {format(parseFloat(h.actual_cash))}
                  </p>
                  <p className="mono num" style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', color: vColor }}>
                    {vLabel}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--mute-2)' }}>
                    {hasDenoms && (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
                  </div>
                </div>

                {/* Denomination breakdown */}
                {isExpanded && hasDenoms && (
                  <div style={{
                    padding: '12px 16px 16px',
                    borderTop: '1px solid var(--line)',
                    background: 'var(--paper-2)',
                  }}>
                    <p style={{
                      fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: '.12em', color: 'var(--mute)', marginBottom: 10,
                    }}>
                      Denomination Breakdown
                    </p>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                      gap: '6px 12px',
                    }}>
                      {denoms.map((d, di) => (
                        <div key={di} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '7px 10px', borderRadius: 6,
                          background: 'var(--paper)', border: '1px solid var(--line)',
                          fontSize: 12,
                        }}>
                          <span className="mono num" style={{ color: 'var(--mute)' }}>
                            {currency.symbol}{d.value % 1 === 0 ? Number(d.value).toLocaleString() : Number(d.value).toFixed(2)}
                            {' '}× {d.count}
                          </span>
                          <span className="mono num" style={{ fontWeight: 600, color: 'var(--ink)' }}>
                            {format(d.subtotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
