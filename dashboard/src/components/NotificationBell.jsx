import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ClipboardList, CheckCircle2, CreditCard, Receipt, UserCheck, CalendarClock, ChevronRight, XCircle, Trash2 } from 'lucide-react';

const EVENT_CONFIG = {
  NEW_ORDER:            { label: 'New order',              Icon: ClipboardList, color: 'var(--info)', to: '/orders'       },
  ORDER_READY:          { label: 'Ready to serve',         Icon: CheckCircle2,  color: 'var(--ok)',   to: '/orders'       },
  PAYMENT_COMPLETED:    { label: 'Payment received',       Icon: CreditCard,    color: 'var(--ok)',   to: null            },
  BILL_REQUESTED:       { label: 'Bill requested',         Icon: Receipt,       color: 'var(--warn)', to: '/orders'       },
  STAFF_ASSIGNED:       { label: 'Table assigned',         Icon: UserCheck,     color: 'var(--ok)',   to: '/tables'       },
  RESERVATION_REMINDER: { label: 'Reservation in 15 min', Icon: CalendarClock, color: 'var(--warn)', to: '/reservations' },
  ITEM_VOIDED:          { label: 'Item voided',            Icon: XCircle,       color: 'var(--mute)', to: '/orders'       },
  ITEM_WASTED:          { label: 'Item wasted',            Icon: Trash2,        color: '#b45309',     to: '/waste-log'    },
};

const CHANNEL_CONFIG = {
  delivery: { label: 'New delivery', color: '#c2590a' },
  takeaway: { label: 'New takeaway', color: '#7c3abf' },
};

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function NotificationBell({ notifications, unreadCount, onOpen, onClear }) {
  const [open, setOpen] = useState(false);
  const ref             = useRef(null);
  const navigate        = useNavigate();

  useEffect(() => {
    if (!open) return;
    function outside(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) onOpen?.();
  }

  function handleNotificationClick(n) {
    const cfg    = EVENT_CONFIG[n.event];
    const target = cfg?.to ?? null;
    if (!target) return;
    setOpen(false);
    const state = n.event === 'BILL_REQUESTED' && n.meta?.tableId
      ? { payForTable: n.meta.tableId }
      : undefined;
    navigate(target, state ? { state } : undefined);
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={toggle}
        title="Notifications"
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30,
          background: open ? 'var(--hover)' : 'transparent',
          border: 0, borderRadius: 6, cursor: 'pointer',
          color: open ? 'var(--ink)' : 'var(--mute)',
          transition: 'background .08s, color .08s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
        onMouseLeave={(e) => {
          if (!open) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }
        }}
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 5, right: 5,
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--bad)', border: '1.5px solid var(--paper)',
          }} />
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          width: 288,
          background: 'var(--paper)',
          border: '1px solid var(--line-2)',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,.10)',
          zIndex: 200,
          display: 'flex', flexDirection: 'column',
          maxHeight: 360,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 12px',
            borderBottom: '1px solid var(--line)',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)' }}>Notifications</span>
            {notifications.length > 0 && (
              <button
                onClick={onClear}
                style={{ fontSize: 11, color: 'var(--mute)', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mute)')}
              >
                Clear all
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <p style={{ padding: '28px 14px', textAlign: 'center', fontSize: 12.5, color: 'var(--mute)', margin: 0 }}>
                No notifications yet
              </p>
            ) : (
              notifications.map((n) => {
                const cfg        = EVENT_CONFIG[n.event];
                if (!cfg) return null;
                const channelCfg = n.event === 'NEW_ORDER' && n.channel ? CHANNEL_CONFIG[n.channel] : null;
                const Icon       = cfg.Icon;
                const label      = channelCfg?.label ?? cfg.label;
                const color      = channelCfg?.color ?? cfg.color;
                const clickable  = !!cfg.to;

                return (
                  <div
                    key={n.id}
                    onClick={clickable ? () => handleNotificationClick(n) : undefined}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 9,
                      padding: '9px 12px',
                      borderBottom: '1px solid var(--line)',
                      background: n.read ? 'transparent' : 'rgba(10,10,10,.025)',
                      cursor: clickable ? 'pointer' : 'default',
                      transition: 'background .08s',
                    }}
                    onMouseEnter={clickable ? (e) => { e.currentTarget.style.background = 'var(--hover)'; } : undefined}
                    onMouseLeave={clickable ? (e) => { e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(10,10,10,.025)'; } : undefined}
                  >
                    <span style={{ color, flexShrink: 0, paddingTop: 1 }}>
                      <Icon size={13} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)', fontWeight: n.read ? 400 : 500, lineHeight: 1.35 }}>
                        {label}
                        {n.token && (
                          <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--mute-2)', fontFamily: '"Geist Mono", monospace' }}>
                            {n.token}
                          </span>
                        )}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--mute-2)' }}>
                        {timeAgo(n.ts)}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginTop: 2 }}>
                      {!n.read && (
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: color,
                        }} />
                      )}
                      {clickable && (
                        <ChevronRight size={11} style={{ color: 'var(--mute-2)' }} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
