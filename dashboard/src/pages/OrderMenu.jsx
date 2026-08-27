import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronDown, Plus, Minus, ShoppingCart, CheckCircle, AlertCircle } from 'lucide-react';
import { formatMoney } from '@shared/format-money';

export default function OrderMenu() {
  const { tableId } = useParams();
  const [phase, setPhase]               = useState('loading');
  const [tableInfo, setTableInfo]       = useState(null);
  const [items, setItems]               = useState([]);
  const [cart, setCart]                 = useState({});
  const [openCats, setOpenCats]         = useState(new Set());
  const [error, setError]               = useState('');
  const [orderId, setOrderId]           = useState('');
  const [hasOrdered, setHasOrdered]     = useState(false);
  const [billRequested, setBillRequested] = useState(false);
  const [billStatus, setBillStatus]     = useState('idle'); // 'idle' | 'requesting' | 'done'

  // The public table-order page has no CurrencyProvider above it — it reads the
  // currency off the table payload — so it takes the shared formatter directly.
  const fmt = (v) => {
    if (!tableInfo?.currency) return String(v);
    return formatMoney(v, tableInfo.currency);
  };

  useEffect(() => {
    async function load() {
      try {
        const tr = await fetch(`/api/public/table/${tableId}`);
        if (!tr.ok) throw new Error('Table not found. Please ask staff for help.');
        const table = await tr.json();
        setTableInfo(table);

        const mr = await fetch(`/api/public/menu/${table.restaurant_id}`);
        if (!mr.ok) throw new Error('Failed to load menu.');
        const menu = await mr.json();
        setItems(menu);

        const cats = [...new Set(menu.map((i) => i.category).filter(Boolean))];
        if (cats.length > 0) setOpenCats(new Set([cats[0]]));

        setPhase('menu');
      } catch (e) {
        setError(e.message || 'Could not load menu. Please ask staff for help.');
        setPhase('error');
      }
    }
    load();
  }, [tableId]);

  const categories        = [...new Set(items.map((i) => i.category).filter(Boolean))];
  const cartItems         = items.filter((i) => (cart[i.id] || 0) > 0);
  const cartCount         = Object.values(cart).reduce((s, v) => s + v, 0);
  const taxRate           = tableInfo?.tax_rate        || 0;
  const serviceChargeRate = tableInfo?.service_charge  || 0;
  const taxMultiplier     = 1 + (taxRate + serviceChargeRate) / 100;

  // All prices shown to the customer are tax-inclusive
  const inclPrice = (base) => base * taxMultiplier;

  const cartTotal = cartItems.reduce((s, i) => s + inclPrice(i.price) * cart[i.id], 0);

  function changeQty(id, delta) {
    setCart((prev) => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      return { ...prev, [id]: next };
    });
  }

  function toggleCat(cat) {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  async function placeOrder() {
    setPhase('submitting');
    setError('');
    try {
      const res = await fetch('/api/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId,
          items: cartItems.map((i) => ({ menuItemId: i.id, quantity: cart[i.id] })),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to place order.');
      }
      const json = await res.json();
      setOrderId((json.orderId || '').slice(-6).toUpperCase());
      setHasOrdered(true);
      setPhase('done');
    } catch (e) {
      setError(e.message);
      setPhase('cart');
    }
  }

  async function requestBill() {
    if (billStatus !== 'idle') return;
    setBillStatus('requesting');
    try {
      await fetch('/api/public/request-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId }),
      });
      setBillStatus('done');
      setBillRequested(true);
    } catch {
      setBillStatus('idle');
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--paper-2)' }}>
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading menu…</p>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="flex h-screen items-center justify-center p-6" style={{ background: 'var(--paper-2)' }}>
        <div className="text-center">
          <AlertCircle size={40} style={{ color: 'var(--bad)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, color: 'var(--mute)' }}>{error}</p>
        </div>
      </div>
    );
  }

  // ── Order confirmed ──────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6" style={{ background: 'var(--paper-2)' }}>
        <CheckCircle size={56} style={{ color: 'var(--ok)', marginBottom: 20 }} />
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
          Order placed!
        </h2>
        {orderId && (
          <p className="mono num" style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 6 }}>
            #{orderId}
          </p>
        )}
        <p style={{ fontSize: 13, color: 'var(--mute)', textAlign: 'center', maxWidth: 280, marginBottom: 32, lineHeight: 1.6 }}>
          Your order has been sent to the kitchen. Thank you!
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280 }}>
          <button
            onClick={() => { setCart({}); setPhase('menu'); }}
            style={{
              background: 'var(--ink)', color: 'var(--accent-on)',
              border: 0, borderRadius: 10, padding: '13px 0',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Order more
          </button>
          <button
            onClick={requestBill}
            disabled={billStatus !== 'idle'}
            style={{
              background: billStatus === 'done' ? 'rgba(31,138,91,.1)' : 'var(--paper)',
              color: billStatus === 'done' ? 'var(--ok)' : 'var(--ink)',
              border: `1px solid ${billStatus === 'done' ? 'var(--ok)' : 'var(--line-2)'}`,
              borderRadius: 10, padding: '13px 0',
              fontSize: 14, fontWeight: 600, cursor: billStatus !== 'idle' ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: billStatus === 'requesting' ? 0.6 : 1,
            }}
          >
            {billStatus === 'done' ? '✓ Bill requested' : billStatus === 'requesting' ? 'Requesting…' : 'Request Bill'}
          </button>
        </div>
      </div>
    );
  }

  // ── Cart review ──────────────────────────────────────────────────────────────
  if (phase === 'cart' || phase === 'submitting') {
    return (
      <div className="flex h-screen flex-col" style={{ background: 'var(--paper-2)' }}>
        {/* Header */}
        <div style={{ background: 'var(--paper)', padding: '16px 16px 12px', borderBottom: '1px solid var(--line)' }}>
          <button
            onClick={() => setPhase('menu')}
            style={{
              display: 'block', marginBottom: 8,
              fontSize: 13, fontWeight: 500, color: 'var(--ink)',
              background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            ← Back to menu
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Your Order</h2>
          <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 2 }}>
            {tableInfo?.restaurant_name} · Table {tableInfo?.table_number}
          </p>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto" style={{ padding: 14 }}>
          {error && (
            <div className="flex items-center gap-2" style={{
              borderRadius: 8, background: 'rgba(179,55,43,.07)',
              padding: '10px 12px', marginBottom: 12,
              fontSize: 13, color: 'var(--bad)',
              border: '1px solid rgba(179,55,43,.15)',
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} /> {error}
            </div>
          )}
          <div className="space-y-2">
            {cartItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3" style={{
                background: 'var(--paper)',
                border: '1px solid var(--line)',
                borderRadius: 10,
                padding: 12,
              }}>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }} className="truncate">
                    {item.name}
                  </p>
                  <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 1 }}>
                    {fmt(inclPrice(item.price))} each
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => changeQty(item.id, -1)}
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      border: '1px solid var(--line-2)',
                      background: 'var(--paper)', color: 'var(--ink)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Minus size={13} />
                  </button>
                  <span style={{ width: 20, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                    {cart[item.id]}
                  </span>
                  <button
                    onClick={() => changeQty(item.id, 1)}
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
                <div className="mono num" style={{ width: 64, textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                  {fmt(inclPrice(item.price) * cart[item.id])}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--line)', background: 'var(--paper)', padding: 16 }}>
          {/* Total */}
          <div className="flex justify-between" style={{ marginBottom: 14 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Total</span>
              {(taxRate > 0 || serviceChargeRate > 0) && (
                <p style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>
                  Incl. {[taxRate > 0 && `${taxRate}% tax`, serviceChargeRate > 0 && `${serviceChargeRate}% service charge`].filter(Boolean).join(' + ')}
                </p>
              )}
            </div>
            <span className="mono num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{fmt(cartTotal)}</span>
          </div>
          <button
            onClick={placeOrder}
            disabled={phase === 'submitting' || cartCount === 0}
            style={{
              width: '100%', borderRadius: 10, padding: '14px 0',
              background: 'var(--ink)', color: 'var(--accent-on)',
              border: 0, fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              opacity: (phase === 'submitting' || cartCount === 0) ? 0.55 : 1,
            }}
          >
            {phase === 'submitting' ? 'Placing order…' : `Place Order · ${fmt(cartTotal)}`}
          </button>
        </div>
      </div>
    );
  }

  // ── Menu ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--paper-2)' }}>
      {/* Header */}
      <div style={{ background: 'var(--ink)', padding: '20px 16px 18px' }}>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: 'var(--accent-on)', lineHeight: 1.2, margin: 0 }}>
          {tableInfo?.restaurant_name}
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(250,250,248,.55)', marginTop: 3 }}>
          Table {tableInfo?.table_number}
        </p>
      </div>

      {/* Category accordion */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: hasOrdered && cartCount > 0 ? 160 : 96 }}>
        {categories.map((cat) => {
          const catItems = items.filter((i) => i.category === cat);
          const isOpen   = openCats.has(cat);
          return (
            <div key={cat} style={{ borderBottom: '1px solid var(--line)', background: 'var(--paper)' }}>
              <button
                className="flex w-full items-center justify-between text-left"
                onClick={() => toggleCat(cat)}
                style={{
                  padding: '12px 16px',
                  background: 'transparent', border: 0, cursor: 'pointer',
                }}
              >
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '.09em', color: 'var(--mute)',
                }}>
                  {cat}
                </span>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 11.5, color: 'var(--mute-2)' }}>{catItems.length} items</span>
                  <ChevronDown
                    size={15}
                    style={{
                      color: 'var(--mute-2)',
                      transition: 'transform 150ms',
                      transform: isOpen ? 'rotate(180deg)' : 'none',
                    }}
                  />
                </div>
              </button>

              {isOpen && (
                <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {catItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3"
                      style={{
                        background: 'var(--paper-2)',
                        border: '1px solid var(--line)',
                        borderRadius: 10,
                        padding: 12,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
                          {item.name}
                        </p>
                        <p className="mono num" style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', marginTop: 3 }}>
                          {fmt(inclPrice(item.price))}
                        </p>
                      </div>

                      {(cart[item.id] || 0) > 0 ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => changeQty(item.id, -1)}
                            style={{
                              width: 32, height: 32, borderRadius: '50%',
                              border: '1px solid var(--line-2)',
                              background: 'var(--paper)', color: 'var(--ink)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <Minus size={14} />
                          </button>
                          <span style={{ width: 24, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                            {cart[item.id]}
                          </span>
                          <button
                            onClick={() => changeQty(item.id, 1)}
                            style={{
                              width: 32, height: 32, borderRadius: '50%',
                              border: 0, background: 'var(--ink)', color: 'var(--accent-on)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => changeQty(item.id, 1)}
                          style={{
                            width: 36, height: 36, borderRadius: '50%',
                            border: 0, background: 'var(--ink)', color: 'var(--accent-on)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', flexShrink: 0,
                          }}
                        >
                          <Plus size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {items.length === 0 && phase === 'menu' && (
          <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>
            Menu is empty. Please ask staff for assistance.
          </div>
        )}
      </div>

      {/* Bottom action area — cart FAB and/or Request Bill */}
      {(cartCount > 0 || hasOrdered) && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cartCount > 0 && (
            <button
              onClick={() => { setError(''); setPhase('cart'); }}
              className="flex w-full items-center gap-3"
              style={{
                background: 'var(--ink)', color: 'var(--accent-on)',
                border: 0, borderRadius: 14, padding: '14px 18px',
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 8px 32px -8px rgba(10,10,10,.45)',
              }}
            >
              <span style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'rgba(250,250,248,.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11.5, fontWeight: 700, flexShrink: 0,
              }}>
                {cartCount}
              </span>
              <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 600 }}>View Order</span>
              <span className="mono num" style={{ fontSize: 14, fontWeight: 700 }}>{fmt(cartTotal)}</span>
              <ShoppingCart size={17} />
            </button>
          )}
          {hasOrdered && (
            <button
              onClick={requestBill}
              disabled={billStatus !== 'idle'}
              style={{
                width: '100%', borderRadius: 14, padding: '13px 0',
                background: billStatus === 'done' ? 'rgba(31,138,91,.12)' : 'var(--paper)',
                color: billStatus === 'done' ? 'var(--ok)' : 'var(--ink)',
                border: `1px solid ${billStatus === 'done' ? 'var(--ok)' : 'var(--line-2)'}`,
                fontSize: 14, fontWeight: 600,
                cursor: billStatus !== 'idle' ? 'default' : 'pointer',
                fontFamily: 'inherit',
                opacity: billStatus === 'requesting' ? 0.6 : 1,
                boxShadow: billStatus === 'done' ? 'none' : '0 2px 12px -4px rgba(10,10,10,.15)',
              }}
            >
              {billStatus === 'done' ? '✓ Bill requested — staff will be with you shortly' : billStatus === 'requesting' ? 'Requesting…' : 'Request Bill'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
