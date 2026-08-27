import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Truck, X } from 'lucide-react';
import api from '../api/client';
import { useCurrency } from '../context/CurrencyContext';

const COUNTDOWN_MS = 5_000;
const TICK_MS      = 50;

function DeliveryAlert({ order, onDismiss, onAccept }) {
  const { format } = useCurrency();

  const [entered,     setEntered]     = useState(false);
  const [paused,      setPaused]      = useState(false);
  const [barPct,      setBarPct]      = useState(100);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(COUNTDOWN_MS / 1000));
  const [items,       setItems]       = useState([]);
  const [itemsStatus, setItemsStatus] = useState('loading');

  // Refs let the interval read current values without stale-closure issues
  const pausedRef    = useRef(false);
  const remainingRef = useRef(COUNTDOWN_MS);
  const lastTickRef  = useRef(null);
  const dismissRef   = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; });

  // Fetch order items
  useEffect(() => {
    if (!order.orderId) { setItemsStatus('ok'); return; }
    api.get(`/orders/${order.orderId}/items`)
      .then(({ data }) => { setItems(data); setItemsStatus('ok'); })
      .catch(() => setItemsStatus('error'));
  }, [order.orderId]);

  // Enter animation
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Countdown ticker
  useEffect(() => {
    lastTickRef.current = Date.now();

    const id = setInterval(() => {
      if (pausedRef.current) {
        // While held, keep resetting the reference so paused time is excluded
        lastTickRef.current = Date.now();
        return;
      }
      const now   = Date.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;

      remainingRef.current = Math.max(0, remainingRef.current - delta);
      setBarPct((remainingRef.current / COUNTDOWN_MS) * 100);
      setSecondsLeft(Math.ceil(remainingRef.current / 1000));

      if (remainingRef.current <= 0) {
        clearInterval(id);
        dismissRef.current();
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, []);

  function hold() {
    pausedRef.current = true;
    setPaused(true);
  }

  function release() {
    pausedRef.current = false;
    setPaused(false);
    lastTickRef.current = Date.now(); // exclude time spent held
  }

  const total = items.reduce((s, i) => s + parseFloat(i.price ?? 0) * i.quantity, 0);

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(10,10,10,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        opacity: entered ? 1 : 0,
        transition: 'opacity 200ms ease',
      }}
      onClick={onDismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={hold}
        onPointerUp={release}
        onPointerLeave={release}
        onTouchStart={hold}
        onTouchEnd={release}
        style={{
          width: '100%', maxWidth: 400,
          background: 'var(--paper)',
          border: '1px solid var(--line-2)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,.28)',
          transform: entered ? 'scale(1) translateY(0)' : 'scale(.95) translateY(18px)',
          transition: 'transform 220ms ease',
          userSelect: 'none',
          cursor: paused ? 'grabbing' : 'default',
        }}
      >
        {/* Header */}
        <div style={{ background: '#c2590a', padding: '15px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Truck size={18} color="#fff" strokeWidth={2.2} />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: '#fff' }}>New Delivery Order</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.75)', fontFamily: '"Geist Mono", monospace' }}>
            #{order.orderId?.slice(-6).toUpperCase()}
          </span>
          <button
            onClick={onDismiss}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
              background: 'rgba(255,255,255,.18)', border: 0, cursor: 'pointer', color: '#fff',
              transition: 'background .08s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.3)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.18)'; }}
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>

        {/* Items list */}
        <div style={{ maxHeight: 220, overflowY: 'auto', borderBottom: '1px solid var(--line)' }}>
          {itemsStatus === 'loading' && (
            <p style={{ margin: 0, padding: '20px', fontSize: 13, color: 'var(--mute)', textAlign: 'center' }}>
              Loading order…
            </p>
          )}
          {itemsStatus === 'error' && (
            <p style={{ margin: 0, padding: '20px', fontSize: 13, color: 'var(--mute)', textAlign: 'center' }}>
              Could not load items
            </p>
          )}
          {itemsStatus === 'ok' && items.length === 0 && (
            <p style={{ margin: 0, padding: '20px', fontSize: 13, color: 'var(--mute)', textAlign: 'center' }}>
              No items found
            </p>
          )}
          {itemsStatus === 'ok' && items.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id ?? i} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '9px 20px', color: 'var(--mute)', fontWeight: 600, width: 32, textAlign: 'right' }}>
                      {item.quantity}×
                    </td>
                    <td style={{ padding: '9px 4px', color: 'var(--ink)', fontWeight: 500 }}>
                      {item.name}
                    </td>
                    <td style={{ padding: '9px 20px 9px 8px', color: 'var(--mute)', textAlign: 'right', fontFamily: '"Geist Mono", monospace', whiteSpace: 'nowrap' }}>
                      {format(parseFloat(item.price ?? 0) * item.quantity)}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--paper-2)' }}>
                  <td colSpan={2} style={{ padding: '9px 20px', fontWeight: 700, color: 'var(--ink)', textAlign: 'right' }}>
                    Total
                  </td>
                  <td style={{ padding: '9px 20px', fontWeight: 700, color: 'var(--ink)', textAlign: 'right', fontFamily: '"Geist Mono", monospace' }}>
                    {format(total)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Countdown */}
        <div style={{ padding: '12px 20px 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
            <span style={{ fontSize: 11, color: 'var(--mute)' }}>
              {paused ? 'Timer paused — release to continue' : 'Auto-dismissing in'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: paused ? 'var(--mute)' : '#c2590a', fontFamily: '"Geist Mono", monospace', transition: 'color .15s' }}>
              {paused ? '⏸' : `${secondsLeft}s`}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${barPct}%`,
              background: paused ? 'var(--mute)' : '#c2590a',
              borderRadius: 2,
              transition: paused ? 'background .15s' : 'background .15s',
            }} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 20px 20px' }}>
          <button
            onClick={onDismiss}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              flex: 1, height: 38, borderRadius: 8,
              border: '1px solid var(--line-2)', background: 'var(--paper)',
              fontSize: 13, fontWeight: 600, color: 'var(--mute)', cursor: 'pointer',
              transition: 'background .08s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--paper)'; }}
          >
            Dismiss
          </button>
          <button
            onClick={onAccept}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              flex: 2, height: 38, borderRadius: 8,
              border: 0, background: '#c2590a',
              fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer',
              transition: 'filter .08s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function DeliveryAlertContainer({ alerts, onDismiss, onAccept }) {
  if (!alerts.length) return null;
  const current = alerts[0];
  return (
    <DeliveryAlert
      key={current.id}
      order={current}
      onDismiss={() => onDismiss(current.id)}
      onAccept={() => onAccept(current.id, current.orderId)}
    />
  );
}
