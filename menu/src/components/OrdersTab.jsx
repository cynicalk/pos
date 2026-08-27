import { ClipboardList, Receipt, CheckCircle } from 'lucide-react';
import { ReviewPrompt } from './ReviewPrompt';

const STATUS_CONFIG = {
  received:  { label: 'Order received', color: 'var(--warn)', canCancel: true  },
  preparing: { label: 'Being prepared', color: 'var(--info)', canCancel: false },
  ready:     { label: 'Ready to serve', color: 'var(--ok)',   canCancel: false },
  served:    { label: 'Served',         color: 'var(--mute-2)', canCancel: false },
};

export function OrdersTab({ activeOrders, hadOrders, tableId, fmt, taxMultiplier = 1, cancelling, cancelOrder, billDone, billRequesting, requestBill, showToast }) {
  const hasServedOrders = activeOrders.some((o) => o.status === 'served');
  const paidAndGone     = hadOrders && activeOrders.length === 0;

  const incl = (price) => price * taxMultiplier;

  // Oldest first (API returns DESC)
  const ordered    = [...activeOrders].reverse();
  const multiRound = ordered.length > 1;
  const grandTotal = ordered.reduce((sum, o) =>
    sum + (o.items || []).reduce((s, it) => s + incl(it.price) * it.quantity, 0), 0);

  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: '14px 16px', paddingBottom: 24 }}>
      {activeOrders.length === 0 ? (
        paidAndGone ? (
          <div className="flex flex-col items-center py-12 text-center">
            <CheckCircle size={36} style={{ color: 'var(--ok)', marginBottom: 10 }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>Payment complete</p>
            <p style={{ fontSize: 12, color: 'var(--mute)' }}>Thank you for dining with us!</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardList size={36} style={{ color: 'var(--mute-2)', marginBottom: 12 }} />
            <p style={{ fontSize: 13, color: 'var(--mute)' }}>No active orders yet.</p>
            <p style={{ fontSize: 12, color: 'var(--mute-2)', marginTop: 4 }}>
              Your orders will appear here after you place them.
            </p>
          </div>
        )
      ) : (
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 10, background: 'var(--paper)', overflow: 'hidden' }}>
          {ordered.map((order, i) => {
            const s       = STATUS_CONFIG[order.status] || STATUS_CONFIG.received;
            const served  = order.status === 'served';
            const total   = (order.items || []).reduce((sum, it) => sum + incl(it.price) * it.quantity, 0);

            return (
              <div key={order.id} style={{
                borderTop: i > 0 ? '1px solid var(--line)' : 'none',
                opacity: served ? 0.6 : 1,
              }}>
                <div style={{ padding: '10px 14px 6px' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {multiRound && (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--mute)', letterSpacing: '.03em', textTransform: 'uppercase' }}>
                          Round {i + 1}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5" style={{ fontSize: 11.5, fontWeight: 500, color: s.color }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                        {s.label}
                      </span>
                    </div>
                    {s.canCancel && (
                      <button
                        onClick={() => cancelOrder(order.id)}
                        disabled={cancelling === order.id}
                        style={{
                          borderRadius: 6, border: '1px solid rgba(179,55,43,.22)',
                          padding: '3px 10px', fontSize: 11.5, fontWeight: 500,
                          color: 'var(--bad)', background: 'transparent',
                          cursor: 'pointer', fontFamily: 'inherit',
                          opacity: cancelling === order.id ? 0.4 : 1,
                        }}
                      >
                        {cancelling === order.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}
                  </div>
                  <span className="mono num" style={{ fontSize: 10, color: 'var(--mute-2)', letterSpacing: '.05em', marginTop: 2, display: 'block' }}>
                    Order #{order.id.slice(-6).toUpperCase()}
                  </span>
                </div>

                <div style={{ padding: '0 14px 12px' }} className="space-y-1.5">
                  {(order.items || []).map((item, idx) => (
                    <div key={idx} style={{ fontSize: 13 }}>
                      <div className="flex items-center justify-between">
                        <span style={{ color: 'var(--ink)' }}>
                          {item.name}
                          <span style={{ color: 'var(--mute)', marginLeft: 6 }}>× {item.quantity}</span>
                        </span>
                        <span style={{ color: 'var(--mute)' }}>{fmt(incl(item.price) * item.quantity)}</span>
                      </div>
                      {item.notes && (
                        <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 2, fontStyle: 'italic' }}>
                          {item.notes}
                        </p>
                      )}
                    </div>
                  ))}
                  {!multiRound && total > 0 && (
                    <div className="flex justify-between" style={{
                      borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 4,
                      fontSize: 13, fontWeight: 600,
                    }}>
                      <span style={{ color: 'var(--mute)' }}>Total{taxMultiplier > 1 ? ' (incl. tax)' : ''}</span>
                      <span style={{ color: 'var(--ink)' }}>{fmt(total)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {multiRound && grandTotal > 0 && (
            <div className="flex justify-between" style={{
              borderTop: '1px solid var(--line)',
              padding: '11px 14px',
              fontSize: 13, fontWeight: 700,
              background: 'var(--paper-2)',
            }}>
              <span style={{ color: 'var(--mute)' }}>Total{taxMultiplier > 1 ? ' (incl. tax)' : ''}</span>
              <span style={{ color: 'var(--ink)' }}>{fmt(grandTotal)}</span>
            </div>
          )}
        </div>
      )}

      {activeOrders.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            borderRadius: 10, border: '1px solid var(--line-2)',
            background: 'var(--paper)', padding: '14px 16px',
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: '0 0 4px' }}>
              Ready to pay?
            </p>
            <p style={{ fontSize: 12, color: 'var(--mute)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Notify staff to bring your bill.{taxMultiplier > 1 ? ' Prices above are inclusive of all taxes and charges.' : ''}
            </p>
            <button
              onClick={requestBill}
              disabled={billRequesting || billDone}
              style={{
                width: '100%', borderRadius: 8, padding: '12px 0',
                border: billDone ? '1.5px solid var(--ok)' : '1.5px solid var(--ink)',
                background: billDone ? 'rgba(31,138,91,.06)' : 'transparent',
                color: billDone ? 'var(--ok)' : 'var(--ink)',
                fontSize: 14, fontWeight: 600,
                cursor: billRequesting || billDone ? 'default' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: billRequesting ? 0.6 : 1,
                transition: 'all .15s',
              }}
            >
              <Receipt size={16} />
              {billRequesting ? 'Requesting…' : billDone ? 'Bill requested ✓' : 'Request Bill'}
            </button>
          </div>
        </div>
      )}

      <ReviewPrompt
        key={paidAndGone ? 'paid' : 'active'}
        tableId={tableId}
        showToast={showToast}
        hasServedOrders={hasServedOrders || paidAndGone}
        paid={paidAndGone}
      />
    </div>
  );
}
