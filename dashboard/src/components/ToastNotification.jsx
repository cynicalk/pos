import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ClipboardList, CheckCircle2, CreditCard, Receipt, UserCheck, CalendarClock, XCircle, Trash2 } from 'lucide-react';

const DURATION = 10_000;

const EVENT_CFG = {
  NEW_ORDER:            { label: 'New order',              Icon: ClipboardList, color: 'var(--info)' },
  ORDER_READY:          { label: 'Ready to serve',         Icon: CheckCircle2,  color: 'var(--ok)'   },
  PAYMENT_COMPLETED:    { label: 'Payment received',       Icon: CreditCard,    color: 'var(--ok)'   },
  BILL_REQUESTED:       { label: 'Bill requested',         Icon: Receipt,       color: 'var(--warn)' },
  STAFF_ASSIGNED:       { label: 'Table assigned',         Icon: UserCheck,     color: 'var(--ok)'   },
  RESERVATION_REMINDER: { label: 'Reservation in 15 min', Icon: CalendarClock, color: 'var(--warn)' },
  ITEM_VOIDED:          { label: 'Item voided',            Icon: XCircle,       color: 'var(--mute)' },
  ITEM_WASTED:          { label: 'Item wasted',            Icon: Trash2,        color: '#b45309'     },
};

const CHANNEL_OVERRIDE = {
  delivery: { label: 'New delivery order', color: '#c2590a' },
  takeaway: { label: 'New takeaway order', color: '#7c3abf' },
};

function Toast({ n, onDismiss }) {
  const [entered,  setEntered]  = useState(false);
  const [leaving,  setLeaving]  = useState(false);
  const [barWidth, setBarWidth] = useState('100%');

  const cfg = EVENT_CFG[n.event];
  if (!cfg) return null;

  const chOverride = n.event === 'NEW_ORDER' && n.channel ? CHANNEL_OVERRIDE[n.channel] : null;
  const label      = chOverride?.label ?? cfg.label;
  const color      = chOverride?.color ?? cfg.color;
  const { Icon }   = cfg;

  function dismiss() {
    setLeaving(true);
    setTimeout(onDismiss, 220);
  }

  useEffect(() => {
    // Two rAF frames so the enter transition actually plays after mount
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setEntered(true);
        setBarWidth('0%');
      }),
    );
    const auto = setTimeout(dismiss, DURATION);
    return () => { cancelAnimationFrame(raf); clearTimeout(auto); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = entered && !leaving;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        width: 292,
        background: 'var(--paper)',
        border: '1px solid var(--line-2)',
        borderRadius: 10,
        boxShadow: '0 6px 28px rgba(0,0,0,.14)',
        overflow: 'hidden',
        opacity:   shown ? 1 : 0,
        transform: shown ? 'translateX(0) scale(1)' : 'translateX(20px) scale(.97)',
        transition: 'opacity 210ms ease, transform 210ms ease',
        pointerEvents: 'all',
      }}
    >
      {/* Body */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 12px 10px' }}>
        <span style={{ color, flexShrink: 0, paddingTop: 2 }}>
          <Icon size={14} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.35 }}>
            {label}
          </p>
          {n.token && (
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--mute)', fontFamily: '"Geist Mono", monospace', lineHeight: 1.3 }}>
              {n.token}
            </p>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, marginTop: 1, borderRadius: 4,
            background: 'none', border: 0, cursor: 'pointer',
            color: 'var(--mute)',
            transition: 'background .08s, color .08s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--mute)'; }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Countdown bar */}
      <div style={{ height: 3, background: 'var(--line)' }}>
        <div style={{
          height: '100%',
          width: barWidth,
          background: color,
          transition: entered ? `width ${DURATION}ms linear` : 'none',
        }} />
      </div>
    </div>
  );
}

export default function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return createPortal(
    <div style={{
      position: 'fixed', top: 56, right: 16, zIndex: 300,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map((n) => (
        <Toast key={n.id} n={n} onDismiss={() => onDismiss(n.id)} />
      ))}
    </div>,
    document.body,
  );
}
