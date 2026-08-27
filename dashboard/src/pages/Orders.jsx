import { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Clock, ChefHat, ChevronDown, ChevronUp,
  Plus, DollarSign, Utensils, ShoppingBag, Truck, X, Printer, User, UserPlus, Search,
} from 'lucide-react';
import { printKOT } from '../utils/printReceipt';
import { useActiveOrders, useUpdateOrderStatus, useUpdateItemStatus, useCancelPendingItems, useLinkCustomerToOrder } from '../hooks/useOrders';
import { useTables } from '../hooks/useTables';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';
import NewOrderModal from '../components/NewOrderModal';
import AddItemsModal from '../components/AddItemsModal';
import PaymentModal from '../components/PaymentModal';

/* ── Status helpers ──────────────────────────────────────── */

const STATUS_DOT = {
  received:  'var(--mute-2)',
  preparing: 'var(--warn)',
  ready:     'var(--info)',
  served:    'var(--ok)',
};

const ITEM_DOT = {
  pending:   'var(--mute-2)',
  preparing: 'var(--warn)',
  ready:     'var(--info)',
  served:    'var(--ok)',
  cancelled: 'var(--mute-2)',
};

function StatusDot({ status, label }) {
  const dotColor = STATUS_DOT[status] ?? 'var(--mute-2)';
  const text = label ?? (status ? status[0].toUpperCase() + status.slice(1) : '');
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: dotColor, flexShrink: 0, display: 'inline-block',
      }} />
      {text}
    </span>
  );
}

function ItemStatusDot({ status }) {
  const dotColor = ITEM_DOT[status] ?? 'var(--mute-2)';
  const text = status ? status[0].toUpperCase() + status.slice(1) : '';
  const cancelled = status === 'cancelled';
  return (
    <span className="inline-flex items-center gap-1.5" style={{
      fontSize: 11.5,
      color: cancelled ? 'var(--mute-2)' : 'var(--ink-2)',
      textDecoration: cancelled ? 'line-through' : 'none',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: dotColor, flexShrink: 0, display: 'inline-block',
      }} />
      {text}
    </span>
  );
}

const NEXT_STATUS = {
  received:  'preparing',
  preparing: 'ready',
  ready:     'served',
  served:    null,
};

const NEXT_LABEL = {
  received:  'Start preparing',
  preparing: 'Mark ready',
  ready:     'Mark served',
};

const ITEM_NEXT = {
  pending:   'preparing',
  preparing: 'ready',
  ready:     'served',
  served:    null,
};

// pending               → void    (kitchen hasn't started, return stock)
// preparing/ready/served → wastage (kitchen touched it, cost is logged, stock stays out)
const CANCELLABLE_STATUSES = ['pending', 'preparing', 'ready', 'served'];
function autoActionType(status) {
  return status === 'pending' ? 'void' : 'wastage';
}

const CHANNEL_ICON = {
  dining:   Utensils,
  takeaway: ShoppingBag,
  delivery: Truck,
};

// Most urgent status wins: received < preparing < ready < served
const STATUS_URGENCY = { received: 0, preparing: 1, ready: 2, served: 3 };

function elapsed(dateStr) {
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (m < 1)  return { label: 'just now', color: 'var(--mute)' };
  if (m < 10) return { label: `${m}m`,    color: 'var(--mute)' };
  if (m < 20) return { label: `${m}m`,    color: 'var(--warn)', weight: 600 };
  return       { label: `${m}m`,          color: 'var(--bad)',  weight: 600 };
}

/* ── ItemRow ─────────────────────────────────────────────── */

/* ── CancelItemModal ─────────────────────────────────────────────────────── */

function CancelItemModal({ item, actionType, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const isWastage = actionType === 'wastage';

  function handleSubmit(e) {
    e.preventDefault();
    onConfirm(reason.trim() || null);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,.45)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: 'var(--paper)', borderRadius: 12, padding: '20px 22px',
          width: 340, boxShadow: '0 8px 32px rgba(0,0,0,.18)',
          border: '1px solid var(--line)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
              {isWastage ? 'Mark as Wastage' : 'Void Item'}
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 2 }}>
              {isWastage
                ? 'Item was prepared — cost stays, waste is logged'
                : 'Item not prepared — stock will be returned'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mute)', padding: 0, display: 'flex', flexShrink: 0 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Item summary */}
        <div
          style={{
            background: 'var(--paper-2)', borderRadius: 7, padding: '8px 12px',
            border: '1px solid var(--line)', marginBottom: 14,
            fontSize: 13, color: 'var(--ink)',
          }}
        >
          <span style={{ fontWeight: 600 }}>{item.item_name}</span>
          <span style={{ color: 'var(--mute)', marginLeft: 6 }}>×{item.quantity}</span>
        </div>

        {/* Reason form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--mute)', marginBottom: 5 }}>
              Reason <span style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isWastage ? 'e.g. Customer changed mind after food was prepared' : 'e.g. Wrong item entered by mistake'}
              autoFocus
              rows={2}
              style={{
                width: '100%', resize: 'none', borderRadius: 7,
                border: '1px solid var(--line-2)', background: 'var(--paper)',
                padding: '8px 10px', fontSize: 12.5, color: 'var(--ink)',
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--ink)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--line-2)')}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1 justify-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 justify-center"
              style={{
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                padding: '7px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: isWastage ? 'rgba(180,83,9,.12)' : 'var(--bad)',
                color: isWastage ? '#b45309' : '#fff',
              }}
            >
              {isWastage ? 'Confirm Wastage' : 'Confirm Void'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── ItemRow ─────────────────────────────────────────────── */

function ItemRow({ orderId, item, canUpdate }) {
  const updateItemStatus = useUpdateItemStatus();
  const [cancelTarget, setCancelTarget] = useState(false);
  const status    = item.item_status ?? 'pending';
  const next      = ITEM_NEXT[status];
  const busy      = updateItemStatus.isPending;
  const cancelled = status === 'cancelled';
  const canAct    = CANCELLABLE_STATUSES.includes(status) && canUpdate;
  const actionType = autoActionType(status);

  function handleConfirm(cancelReason) {
    updateItemStatus.mutate({ orderId, itemId: item.order_item_id, status: 'cancelled', actionType, cancelReason });
    setCancelTarget(false);
  }

  const custLabels = Object.entries(item.customizations || {})
    .flatMap(([, v]) => Array.isArray(v) ? v : [v]);

  return (
    <>
      <div
        className="flex items-start gap-3 py-2"
        style={{ borderBottom: '1px dashed var(--line)' }}
      >
        <span
          className="mono num shrink-0 text-[13px] w-7"
          style={{ color: 'var(--mute)', textDecoration: cancelled ? 'line-through' : 'none' }}
        >
          {item.quantity}×
        </span>

        <div className="flex-1 min-w-0">
          <span
            className="text-[13px]"
            style={{
              color: cancelled ? 'var(--mute)' : 'var(--ink)',
              textDecoration: cancelled ? 'line-through' : 'none',
            }}
          >
            {item.item_name}
            {item.notes && (
              <span className="ml-2 italic" style={{ fontSize: 11.5, color: 'var(--mute)' }}>
                {item.notes}
              </span>
            )}
          </span>
          {custLabels.length > 0 && (
            <div className="mono mt-0.5" style={{ fontSize: 11, color: 'var(--mute)' }}>
              ↳ {custLabels.join(' · ')}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => canUpdate && next && !busy && updateItemStatus.mutate({ orderId, itemId: item.order_item_id, status: next })}
            disabled={!canUpdate || !next || busy}
            title={next ? `Mark ${next}` : cancelled ? 'Cancelled' : 'Fully served'}
            style={{ background: 'transparent', border: 0, padding: 0, cursor: 'default' }}
          >
            <ItemStatusDot status={status} />
          </button>

          {canAct && (
            <button
              onClick={() => !busy && setCancelTarget(true)}
              disabled={busy}
              title={actionType === 'void' ? 'Void — not prepared, stock returned' : 'Wastage — already prepared, cost logged'}
              className="rounded p-0.5 transition-colors"
              style={{ color: 'var(--mute-2)', background: 'transparent', border: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--bad)'; e.currentTarget.style.background = 'var(--hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--mute-2)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {cancelTarget && (
        <CancelItemModal
          item={item}
          actionType={actionType}
          onConfirm={handleConfirm}
          onClose={() => setCancelTarget(false)}
        />
      )}
    </>
  );
}

/* ── OrderExpandedDetail ─────────────────────────────────── */

function OrderExpandedDetail({ order, table, canOrder, canPrepare, canAddItems, canCancel, onPay, onAddItems, hidePayment = false, hideGlobalActions = false }) {
  const updateStatus  = useUpdateOrderStatus();
  const cancelPending = useCancelPendingItems();

  const time      = elapsed(order.created_at);
  const token     = order.order_ref || order.id.slice(-6).toUpperCase();
  const next      = NEXT_STATUS[order.status];
  const nextLabel = NEXT_LABEL[order.status];

  const hasPending       = order.items.some((i) => ['pending', 'preparing'].includes(i.item_status ?? 'pending'));
  const hasServedOrReady = order.items.some((i) => i.item_status === 'ready' || i.item_status === 'served');

  const orderTitle = order.channel === 'dining'
    ? `Table ${table?.number ?? '?'}`
    : order.customer_ref || (order.channel === 'takeaway' ? 'Takeaway' : 'Delivery');

  const byCategory = order.items.reduce((acc, item) => {
    const cat = item.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div style={{ padding: '14px 8px 18px 52px', borderBottom: '1px solid var(--line)', background: 'var(--paper-2)' }}>
      {/* Meta + actions */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3" style={{ fontSize: 11.5, color: 'var(--mute)' }}>
          <span className="mono">#{token}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {time.label} ago
          </span>
          {order.assigned_staff_email && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1" style={{ color: 'var(--ok)', fontWeight: 500 }}>
                <User size={11} />
                {order.assigned_staff_name || order.assigned_staff_email.split('@')[0]}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!hideGlobalActions && (
            <button className="btn btn-sm" onClick={() => printKOT(order)}>
              <Printer size={12} /> Print KOT
            </button>
          )}
          {!hideGlobalActions && canAddItems && (
            <button onClick={() => onAddItems({ order, orderTitle })} className="btn btn-sm">
              <Plus size={12} /> Add items
            </button>
          )}
          {canCancel && hasPending && order.status !== 'served' && (
            <button
              onClick={() => cancelPending.mutate(order.id)}
              disabled={cancelPending.isPending}
              className="btn btn-sm"
              style={{ color: 'var(--bad)', borderColor: 'rgba(179,55,43,.22)' }}
            >
              {hasServedOrReady ? 'Cancel remaining' : 'Cancel'}
            </button>
          )}
          {order.status === 'served' && canOrder && !hidePayment && (
            <button
              onClick={() => onPay({ order, tableNumber: order.channel === 'dining' ? table?.number : null })}
              className="btn-primary btn-sm"
            >
              <DollarSign size={12} /> Collect payment
            </button>
          )}
          {next && canOrder && (next !== 'preparing' || canPrepare) && (
            <button
              onClick={() => updateStatus.mutate({ id: order.id, status: next })}
              disabled={updateStatus.isPending}
              className="btn-primary btn-sm"
            >
              {nextLabel}
            </button>
          )}
        </div>
      </div>

      {/* Items by category */}
      {Object.entries(byCategory).map(([cat, catItems]) => (
        <div key={cat} className="mb-3">
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)', marginBottom: 4 }}>
            {cat}
          </div>
          {catItems.map((item) => (
            <ItemRow key={item.order_item_id} orderId={order.id} item={item} canUpdate={canOrder} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── OrderRow (non-dining / single standalone) ───────────── */

function OrderRow({ order, table, isOpen, onToggle, canOrder, canPrepare, canAddItems, canCancel, onPay, onAddItems }) {
  const time        = elapsed(order.created_at);
  const ChannelIcon = CHANNEL_ICON[order.channel] ?? Utensils;

  const orderTitle = order.channel === 'dining'
    ? `Table ${table?.number ?? '?'}`
    : order.customer_ref || (order.channel === 'takeaway' ? 'Takeaway' : 'Delivery');

  const liveItems  = order.items.filter((i) => i.item_status !== 'cancelled');
  const readyCount = liveItems.filter((i) => i.item_status === 'ready' || i.item_status === 'served').length;
  const allServed  = liveItems.length > 0 && liveItems.every((i) => i.item_status === 'served');
  const summary = allServed
    ? 'All served'
    : readyCount > 0
    ? `${readyCount}/${liveItems.length} ready`
    : `${liveItems.length} item${liveItems.length !== 1 ? 's' : ''}`;

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left transition-colors duration-75"
        style={{
          display: 'grid',
          gridTemplateColumns: '44px 1fr 110px 70px 16px',
          alignItems: 'center',
          gap: 12,
          minHeight: 44,
          padding: '6px 8px',
          background: isOpen ? 'var(--paper-2)' : 'transparent',
          border: 0,
          borderBottom: '1px solid var(--line)',
          cursor: 'default',
        }}
      >
        <span className="flex items-center justify-center" style={{ color: 'var(--ink)' }}>
          {order.channel === 'dining' ? (
            <span className="mono num font-bold" style={{ fontSize: 13 }}>
              T{String(table?.number ?? '?').padStart(2, '0')}
            </span>
          ) : (
            <ChannelIcon size={14} style={{ color: 'var(--mute)' }} />
          )}
        </span>

        <span className="min-w-0 truncate">
          <span className="font-semibold" style={{ fontSize: 13, color: 'var(--ink)' }}>
            {orderTitle}
          </span>
          <span className="ml-2" style={{ fontSize: 11.5, color: 'var(--mute)' }}>
            {summary}
          </span>
        </span>

        <StatusDot status={order.status} />

        <span
          className="mono num"
          style={{ fontSize: 11.5, color: time.color, fontWeight: time.weight ?? 500, textAlign: 'right' }}
        >
          {time.label}
        </span>

        <span style={{ color: 'var(--mute)', display: 'flex', justifyContent: 'center' }}>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {isOpen && (
        <OrderExpandedDetail
          order={order}
          table={table}
          canOrder={canOrder}
          canPrepare={canPrepare}
          canAddItems={canAddItems}
          canCancel={canCancel}
          onPay={onPay}
          onAddItems={onAddItems}
        />
      )}
    </div>
  );
}

/* ── CustomerLinker ──────────────────────────────────────── */

const TIER_COLOR = { Bronze: '#b45309', Silver: '#6b7280', Gold: '#d97706', Platinum: '#7c3aed' };

function CustomerLinker({ orderId, linkedId, linkedName, linkedPhone, linkedTier }) {
  const [open,     setOpen]     = useState(false);
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [searched, setSearched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving,   setSaving]   = useState(false);
  const inputRef   = useRef(null);
  const nameRef    = useRef(null);
  const { mutate: link } = useLinkCustomerToOrder();

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); setSearched(false); setCreating(false); return; }
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || creating) return;
    if (!query.trim()) { setResults([]); setSearched(false); return; }
    setSearched(false);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(`/loyalty/customers?search=${encodeURIComponent(query)}&limit=6`);
        setResults(data);
      } catch { setResults([]); }
      setSearched(true);
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, creating]);

  function pick(customer) {
    link({ orderId, loyaltyCustomerId: customer.id });
    setOpen(false);
  }

  function clear(e) {
    e.stopPropagation();
    link({ orderId, loyaltyCustomerId: null });
  }

  function startCreate() {
    const looksLikePhone = /^[\d\s+\-()+]+$/.test(query.trim());
    setNewPhone(looksLikePhone ? query.trim() : '');
    setNewName(!looksLikePhone ? query.trim() : '');
    setCreating(true);
    setTimeout(() => nameRef.current?.focus(), 0);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newPhone.trim()) return;
    setSaving(true);
    try {
      const { data: customer } = await api.post('/loyalty/customers', {
        phone: newPhone.trim(),
        name: newName.trim() || null,
      });
      link({ orderId, loyaltyCustomerId: customer.id });
      setOpen(false);
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }

  if (linkedId && !open) {
    return (
      <div className="flex items-center gap-1.5" style={{ fontSize: 11.5 }}>
        <User size={11} style={{ color: 'var(--mute)', flexShrink: 0 }} />
        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{linkedName || linkedPhone || 'Linked'}</span>
        {linkedTier && (
          <span style={{ fontSize: 10, fontWeight: 700, color: TIER_COLOR[linkedTier] ?? 'var(--mute)', background: `${TIER_COLOR[linkedTier] ?? '#888'}18`, padding: '1px 6px', borderRadius: 99 }}>
            {linkedTier}
          </span>
        )}
        <button onClick={clear} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--mute)', lineHeight: 1, marginLeft: 2 }}>
          <X size={11} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {open ? (
        <div className="flex items-center gap-1.5">
          <Search size={11} style={{ color: 'var(--mute)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCreating(false); }}
            placeholder="Search name or phone…"
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            style={{
              fontSize: 12, border: 'none', outline: 'none', background: 'transparent',
              color: 'var(--ink)', width: 160, fontFamily: 'inherit',
            }}
          />
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--mute)', lineHeight: 1 }}>
            <X size={11} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: 'var(--mute)', fontSize: 11.5, fontFamily: 'inherit' }}
        >
          <UserPlus size={11} /> Link customer
        </button>
      )}

      {open && query.trim() && (results.length > 0 || searched) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 4,
          background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,.12)', minWidth: 240,
        }}>
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(c)}
              className="w-full text-left"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <User size={12} style={{ color: 'var(--mute)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', display: 'block' }}>{c.name || c.phone}</span>
                <span style={{ fontSize: 11, color: 'var(--mute)' }}>{c.phone}</span>
              </span>
              {c.tier && (
                <span style={{ fontSize: 10, fontWeight: 700, color: TIER_COLOR[c.tier] ?? 'var(--mute)', flexShrink: 0 }}>
                  {c.tier}
                </span>
              )}
            </button>
          ))}

          {!creating ? (
            <button
              onClick={startCreate}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', width: '100%',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                color: 'var(--ok)', fontSize: 12,
              }}
            >
              <Plus size={12} /> Add "{query.trim()}" as new customer
            </button>
          ) : (
            <form onSubmit={handleCreate} style={{ padding: '10px 12px', borderTop: results.length ? '1px solid var(--line)' : 'none' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', margin: '0 0 8px' }}>
                New customer
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  ref={nameRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Full name (optional)"
                  className="input"
                  style={{ fontSize: 12, padding: '5px 8px' }}
                />
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Phone number *"
                  required
                  className="input"
                  style={{ fontSize: 12, padding: '5px 8px' }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    style={{ flex: 1, fontSize: 12, padding: '5px 0', background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 5, cursor: 'pointer', color: 'var(--mute)', fontFamily: 'inherit' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !newPhone.trim()}
                    style={{ flex: 1, fontSize: 12, padding: '5px 0', background: 'var(--ok)', border: 'none', borderRadius: 5, cursor: 'pointer', color: '#fff', fontFamily: 'inherit', fontWeight: 600 }}
                  >
                    {saving ? '…' : 'Add & Link'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/* ── TableSessionRow ─────────────────────────────────────── */
// Groups all active orders for one dining table into a single row.
// When expanded, each round gets its own collapsible sub-row.

function TableSessionRow({ session, table, isOpen, onToggle, canOrder, canPrepare, canAddItems, canCancel, onPay, onAddItems }) {
  const [expandedRound, setExpandedRound] = useState(null);

  const { orders } = session;
  const tableNumber = table?.number ?? orders[0]?.table_number ?? '?';
  const multiRound  = orders.length > 1;

  const aggStatus = orders.reduce((best, o) =>
    STATUS_URGENCY[o.status] < STATUS_URGENCY[best] ? o.status : best,
  orders[0].status);

  const oldestTime = elapsed(orders[0].created_at);

  const totalLive  = orders.reduce((s, o) => s + o.items.filter((i) => i.item_status !== 'cancelled').length, 0);
  const totalReady = orders.reduce((s, o) => s + o.items.filter((i) => i.item_status === 'ready' || i.item_status === 'served').length, 0);
  const allServed  = orders.every((o) => o.status === 'served');

  const summary = allServed
    ? 'All served'
    : multiRound
    ? `${orders.length} rounds · ${totalLive} item${totalLive !== 1 ? 's' : ''}`
    : totalReady > 0
    ? `${totalReady}/${totalLive} ready`
    : `${totalLive} item${totalLive !== 1 ? 's' : ''}`;

  return (
    <div>
      {/* Session header */}
      <button
        onClick={onToggle}
        className="w-full text-left transition-colors duration-75"
        style={{
          display: 'grid',
          gridTemplateColumns: '44px 1fr 110px 70px 16px',
          alignItems: 'center',
          gap: 12,
          minHeight: 44,
          padding: '6px 8px',
          background: isOpen ? 'var(--paper-2)' : 'transparent',
          border: 0,
          borderBottom: '1px solid var(--line)',
          cursor: 'default',
        }}
      >
        <span className="flex items-center justify-center" style={{ color: 'var(--ink)' }}>
          <span className="mono num font-bold" style={{ fontSize: 13 }}>
            T{String(tableNumber).padStart(2, '0')}
          </span>
        </span>

        <span className="min-w-0 truncate">
          <span className="font-semibold" style={{ fontSize: 13, color: 'var(--ink)' }}>
            Table {tableNumber}
          </span>
          <span className="ml-2" style={{ fontSize: 11.5, color: 'var(--mute)' }}>
            {summary}
          </span>
        </span>

        <StatusDot status={aggStatus} />

        <span
          className="mono num"
          style={{ fontSize: 11.5, color: oldestTime.color, fontWeight: oldestTime.weight ?? 500, textAlign: 'right' }}
        >
          {oldestTime.label}
        </span>

        <span style={{ color: 'var(--mute)', display: 'flex', justifyContent: 'center' }}>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {/* Customer link strip */}
      {isOpen && (
        <div style={{ padding: '6px 8px 6px 52px', borderBottom: '1px solid var(--line)', background: 'var(--paper-2)' }}>
          <CustomerLinker
            orderId={orders[0].id}
            linkedId={orders[0].loyalty_customer_id}
            linkedName={orders[0].loyalty_customer_name}
            linkedPhone={orders[0].loyalty_customer_phone}
            linkedTier={orders[0].loyalty_customer_tier}
          />
        </div>
      )}

      {/* Expanded: one section per round */}
      {isOpen && orders.map((order, i) => {
        const roundLive = order.items.filter((it) => it.item_status !== 'cancelled').length;
        const roundTime = elapsed(order.created_at);
        const roundOpen = expandedRound === order.id;

        return (
          <div key={order.id}>
            {/* Round sub-header — only shown when there are multiple rounds */}
            {multiRound && (
              <button
                onClick={() => setExpandedRound(roundOpen ? null : order.id)}
                className="w-full text-left"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 1fr 110px 70px 16px',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 36,
                  padding: '4px 8px',
                  paddingLeft: 20,
                  background: roundOpen ? 'rgba(0,0,0,.03)' : 'var(--paper)',
                  border: 0,
                  borderBottom: '1px solid var(--line)',
                  borderLeft: '3px solid var(--line-2)',
                  cursor: 'default',
                }}
              >
                <span />
                <span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Round {i + 1}
                  </span>
                  <span className="ml-2" style={{ fontSize: 11.5, color: 'var(--mute-2)' }}>
                    {roundLive} item{roundLive !== 1 ? 's' : ''}
                  </span>
                </span>
                <StatusDot status={order.status} />
                <span className="mono num" style={{ fontSize: 11.5, color: roundTime.color, fontWeight: roundTime.weight ?? 500, textAlign: 'right' }}>
                  {roundTime.label}
                </span>
                <span style={{ color: 'var(--mute)', display: 'flex', justifyContent: 'center' }}>
                  {roundOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>
            )}

            {/* Round detail — always visible for single-round sessions, collapsible for multi */}
            {(!multiRound || roundOpen) && (
              <OrderExpandedDetail
                order={order}
                table={table}
                canOrder={canOrder}
                canPrepare={canPrepare}
                canAddItems={canAddItems}
                canCancel={canCancel}
                onPay={onPay}
                onAddItems={onAddItems}
                hidePayment={multiRound}
                hideGlobalActions={multiRound}
              />
            )}
          </div>
        );
      })}

      {/* Session-level actions: single Print KOT, Add items, Collect payment after all rounds */}
      {isOpen && multiRound && (() => {
        const latestOrder  = [...orders].reverse()[0];
        const payableOrder = [...orders].reverse().find((o) => o.status === 'served');
        const mergedKOT = {
          ...orders[0],
          items: orders.flatMap((o) => o.items),
        };
        return (
          <div className="flex items-center gap-2 flex-wrap" style={{ padding: '10px 8px 10px 52px', borderBottom: '1px solid var(--line)', background: 'var(--paper-2)' }}>
            <button className="btn btn-sm" onClick={() => printKOT(mergedKOT)}>
              <Printer size={12} /> Print KOT
            </button>
            {canAddItems && (
              <button onClick={() => onAddItems({ order: latestOrder, orderTitle: `Table ${tableNumber}` })} className="btn btn-sm">
                <Plus size={12} /> Add items
              </button>
            )}
            {payableOrder && canOrder && (
              <button
                onClick={() => onPay({ orders, tableNumber: table?.number ?? null })}
                className="btn-primary btn-sm"
              >
                <DollarSign size={12} /> Collect payment
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/* ── OrdersScreen ────────────────────────────────────────── */

export default function Orders() {
  const { data: orders = [], isLoading } = useActiveOrders();
  const { data: tables = [] }            = useTables();
  const { isAdmin, user }                = useAuth();
  const location                         = useLocation();

  const canCancel   = isAdmin || user?.role === 'staff' || user?.role === 'cashier';
  const canOrder    = isAdmin || user?.role === 'staff' || user?.role === 'cashier';
  const canPrepare  = isAdmin || user?.role === 'staff';
  const canAddItems = isAdmin || user?.role === 'staff' || user?.role === 'cashier';

  const [expanded,      setExpanded]      = useState(null);
  const [showNewOrder,  setShowNewOrder]  = useState(false);
  const [filter,        setFilter]        = useState('all');
  const [payingOrder,   setPayingOrder]   = useState(null);
  const [addingToOrder, setAddingToOrder] = useState(null);

  const tableMap = useMemo(() => Object.fromEntries(tables.map((t) => [t.id, t])), [tables]);

  // Capture the tableId on mount — stored in a ref so polling re-renders don't re-trigger it.
  // Using a ref (not state) means no extra render; null-ing it after use makes it fire only once.
  const pendingPayTable = useRef(location.state?.payForTable ?? null);
  useEffect(() => {
    const tableId = pendingPayTable.current;
    if (!tableId || isLoading || !orders.length) return;
    const tableOrders = orders.filter((o) => o.table_id === tableId && !['paid', 'cancelled'].includes(o.status));
    if (!tableOrders.length) return;
    pendingPayTable.current = null; // consume once — polling won't re-fire this
    const table = tableMap[tableId];
    setExpanded(`session-${tableId}`);
    setPayingOrder({ orders: tableOrders, tableNumber: table?.number ?? null });
  }, [isLoading, orders, tableMap]);

  const counts = {
    all:      orders.length,
    kitchen:  orders.filter((o) => o.status !== 'served').length,
    dining:   orders.filter((o) => o.channel === 'dining').length,
    takeaway: orders.filter((o) => o.channel === 'takeaway').length,
    delivery: orders.filter((o) => o.channel === 'delivery').length,
  };

  // Build the display list: dining orders grouped by table into sessions,
  // non-dining orders kept as individual entries.
  const displayItems = useMemo(() => {
    const filtered = orders.filter((o) => {
      if (filter === 'all')     return true;
      if (filter === 'kitchen') return o.status !== 'served';
      return o.channel === filter;
    });

    const sessions  = {}; // table_id → { tableId, orders[] }
    const standalone = [];

    for (const order of filtered) {
      if (order.channel === 'dining' && order.table_id) {
        if (!sessions[order.table_id]) sessions[order.table_id] = { tableId: order.table_id, orders: [] };
        sessions[order.table_id].orders.push(order);
      } else {
        standalone.push({ type: 'order', order });
      }
    }

    const items = [
      ...Object.values(sessions).map((s) => ({ type: 'session', ...s })),
      ...standalone,
    ];

    // Sort by the oldest order's created_at so the list is chronological
    return items.sort((a, b) => {
      const aTime = a.type === 'session' ? a.orders[0].created_at : a.order.created_at;
      const bTime = b.type === 'session' ? b.orders[0].created_at : b.order.created_at;
      return new Date(aTime) - new Date(bTime);
    });
  }, [orders, filter]);

  if (isLoading) {
    return <div className="py-16 text-center text-[13px]" style={{ color: 'var(--mute)' }}>Loading orders…</div>;
  }

  return (
    <div>
      {/* Page head */}
      <div className="flex items-baseline gap-3 mb-4 flex-wrap">
        <h1 className="text-[22px] font-semibold m-0" style={{ letterSpacing: '-.015em', color: 'var(--ink)' }}>
          Orders
        </h1>
        <span style={{ fontSize: 12, color: 'var(--mute)' }}>
          {counts.kitchen} in kitchen · {counts.all} total · auto-refreshes 30s
        </span>
        <div className="ml-auto flex gap-2">
          {canOrder && (
            <button onClick={() => setShowNewOrder(true)} className="btn-primary">
              <Plus size={13} /> New order
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div
        className="flex gap-4 mb-0 overflow-x-auto"
        style={{ borderBottom: '1px solid var(--line)', paddingBottom: 0 }}
      >
        {[
          ['all',      'All'],
          ['kitchen',  'Kitchen'],
          ['dining',   'Dine in'],
          ['takeaway', 'Takeaway'],
          ['delivery', 'Delivery'],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className="btn-ghost shrink-0"
            style={{
              height: 32,
              padding: '0 2px',
              borderRadius: 0,
              marginBottom: -1,
              borderBottom: filter === k ? '1.5px solid var(--ink)' : '1.5px solid transparent',
              color: filter === k ? 'var(--ink)' : 'var(--mute)',
              fontWeight: filter === k ? 600 : 500,
            }}
          >
            {label}
            <span className="mono num ml-1.5" style={{ fontSize: 11, color: 'var(--mute-2)' }}>
              {counts[k]}
            </span>
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div
        className="grid items-center gap-3 px-2 pt-1 pb-1.5"
        style={{
          gridTemplateColumns: '44px 1fr 110px 70px 16px',
          fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.08em',
        }}
      >
        <span />
        <span>Order</span>
        <span>Status</span>
        <span style={{ textAlign: 'right' }}>Elapsed</span>
        <span />
      </div>

      {/* Orders list */}
      <div style={{ borderTop: '1px solid var(--line)' }}>
        {displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <ChefHat size={32} style={{ color: 'var(--mute-2)' }} />
            <span style={{ fontSize: 13, color: 'var(--mute)' }}>Kitchen is clear</span>
          </div>
        ) : (
          displayItems.map((item) => {
            if (item.type === 'session') {
              const key = `session-${item.tableId}`;
              return (
                <TableSessionRow
                  key={key}
                  session={item}
                  table={tableMap[item.tableId]}
                  isOpen={expanded === key}
                  onToggle={() => setExpanded(expanded === key ? null : key)}
                  canOrder={canOrder}
                  canPrepare={canPrepare}
                  canAddItems={canAddItems}
                  canCancel={canCancel}
                  onPay={setPayingOrder}
                  onAddItems={setAddingToOrder}
                />
              );
            }
            return (
              <OrderRow
                key={item.order.id}
                order={item.order}
                table={tableMap[item.order.table_id]}
                isOpen={expanded === item.order.id}
                onToggle={() => setExpanded(expanded === item.order.id ? null : item.order.id)}
                canOrder={canOrder}
                canPrepare={canPrepare}
                canAddItems={canAddItems}
                canCancel={canCancel}
                onPay={setPayingOrder}
                onAddItems={setAddingToOrder}
              />
            );
          })
        )}
      </div>

      {showNewOrder && <NewOrderModal onClose={() => setShowNewOrder(false)} />}
      {payingOrder && (
        <PaymentModal
          order={payingOrder.order}
          orders={payingOrder.orders}
          tableNumber={payingOrder.tableNumber}
          onClose={() => setPayingOrder(null)}
        />
      )}
      {addingToOrder && (
        <AddItemsModal
          order={addingToOrder.order}
          orderTitle={addingToOrder.orderTitle}
          onClose={() => setAddingToOrder(null)}
        />
      )}
    </div>
  );
}
