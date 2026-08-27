import { X, Plus, Minus } from 'lucide-react';

export function CartSheet({ show, onClose, cart, cartTotal, cartCount, submitting, openNoteKeys, toggleNoteOpen, updateLineNote, changeLineQty, onPlaceOrder, fmt }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(10,10,10,.45)' }}
        onClick={onClose}
      />
      <div className="relative flex flex-col" style={{
        maxHeight: '80vh',
        background: 'var(--paper)',
        borderRadius: '16px 16px 0 0',
      }}>
        <div className="flex items-center justify-between" style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--line)',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
            Your order
          </h2>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 0, color: 'var(--mute)', cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: '12px 16px' }}>
          <div className="space-y-4">
            {cart.map((line) => {
              const unitPrice  = parseFloat(line.item.price) + line.extraPrice;
              const selSummary = Object.values(line.selections).flat().join(', ');
              return (
                <div key={line._key} className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', margin: 0 }} className="truncate">
                      {line.item.name}
                    </p>
                    {selSummary && (
                      <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 1, lineHeight: 1.4 }}>
                        {selSummary}
                      </p>
                    )}
                    {openNoteKeys.has(line._key) ? (
                      <textarea
                        autoFocus
                        value={line.notes}
                        onChange={(e) => updateLineNote(line._key, e.target.value)}
                        onBlur={() => { if (!line.notes) toggleNoteOpen(line._key); }}
                        placeholder="e.g. No onions, extra sauce…"
                        rows={2}
                        style={{
                          marginTop: 6, width: '100%', boxSizing: 'border-box',
                          borderRadius: 7, border: '1px solid var(--line-2)',
                          background: 'var(--paper-2)', color: 'var(--ink)',
                          fontSize: 12, padding: '7px 10px',
                          fontFamily: 'inherit', resize: 'none', outline: 'none',
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => toggleNoteOpen(line._key)}
                        style={{
                          marginTop: 4, background: 'none', border: 'none',
                          padding: 0, cursor: 'pointer', textAlign: 'left',
                          fontFamily: 'inherit', display: 'block',
                        }}
                      >
                        {line.notes
                          ? <span style={{ fontSize: 11.5, color: 'var(--mute)', fontStyle: 'italic' }}>{line.notes}</span>
                          : <span style={{ fontSize: 11.5, color: 'var(--mute-2)' }}>+ Add note</span>
                        }
                      </button>
                    )}
                    <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 4 }}>
                      {fmt(unitPrice)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => changeLineQty(line._key, -1)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        border: '1px solid var(--line-2)', background: 'var(--paper)',
                        color: 'var(--ink)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', cursor: 'pointer',
                      }}
                    >
                      <Minus size={13} />
                    </button>
                    <span style={{ width: 20, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                      {line.quantity}
                    </span>
                    <button
                      onClick={() => changeLineQty(line._key, 1)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        border: 0, background: 'var(--ink)', color: 'var(--accent-on)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  <span style={{
                    width: 56, textAlign: 'right', flexShrink: 0,
                    fontSize: 13, fontWeight: 600, color: 'var(--ink)', paddingTop: 2,
                  }}>
                    {fmt(unitPrice * line.quantity)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', padding: '14px 16px' }}>
          <div className="flex justify-between" style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Subtotal</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{fmt(cartTotal)}</span>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--mute)', marginBottom: 14, lineHeight: 1.5 }}>
            Taxes &amp; charges applied at checkout by staff.
          </p>
          <button
            onClick={onPlaceOrder}
            disabled={submitting || cartCount === 0}
            style={{
              width: '100%', borderRadius: 10, padding: '14px 0',
              background: 'var(--ink)', color: 'var(--accent-on)',
              border: 0, fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              opacity: (submitting || cartCount === 0) ? 0.55 : 1,
            }}
          >
            {submitting ? 'Placing order…' : `Place Order · ${fmt(cartTotal)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
