import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, UtensilsCrossed, ShoppingBag, Truck, Printer, Download } from 'lucide-react';
import SelectField from '../components/SelectField';
import { useOrderHistory } from '../hooks/useOrders';
import { useCurrency } from '../context/CurrencyContext';
import { useTimezone } from '../context/TimezoneContext';
import api from '../api/client';
import { printReceipt, printKOT, printAllKOTs } from '../utils/printReceipt';
import { escCsv, shiftDate, startOfMonth, startOfWeek } from '../utils/dateUtils';

// ── Date helpers ─────────────────────────────────────────────────────────────

const PRESETS = [
  { id: 'today',     label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week',      label: 'This week' },
  { id: 'month',     label: 'This month' },
  { id: 'custom',    label: 'Custom' },
];

// ── Status / channel config ──────────────────────────────────────────────────

const STATUS_COLORS = {
  paid:      'var(--ok)',
  cancelled: 'var(--bad)',
  served:    'var(--mute)',
  ready:     'var(--info)',
  preparing: 'var(--warn)',
  received:  'var(--mute-2)',
};

const CHANNEL_ICONS = {
  dining:   UtensilsCrossed,
  takeaway: ShoppingBag,
  delivery: Truck,
};

const CHANNEL_COLORS = {
  dining:   'var(--mute)',
  takeaway: 'var(--warn)',
  delivery: 'var(--info)',
};

function mergeHistoryItems(items) {
  const map = {};
  const result = [];
  for (const item of items) {
    const k = `${item.name || ''}|${item.notes || ''}`;
    if (map[k] !== undefined) {
      result[map[k]] = { ...result[map[k]], quantity: result[map[k]].quantity + item.quantity };
    } else {
      map[k] = result.length;
      result.push({ ...item });
    }
  }
  return result;
}

// ── Session grouping ─────────────────────────────────────────────────────────
// Group dining orders that share the same table_session_id into one row.

function buildDisplayRows(orders) {
  const sorted = [...orders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const sessionMap = {}; // table_session_id → row index
  const rows = [];

  for (const order of sorted) {
    const sid = order.table_session_id;
    if (sid && order.channel === 'dining' && sessionMap[sid] !== undefined) {
      rows[sessionMap[sid]].orders.push(order);
    } else if (sid && order.channel === 'dining') {
      sessionMap[sid] = rows.length;
      rows.push({ type: 'session', tableNumber: order.table_number, orders: [order] });
    } else {
      rows.push({ type: 'order', order });
    }
  }

  // Single-order sessions are just plain order rows
  return rows.map((r) => r.type === 'session' && r.orders.length === 1 ? { type: 'order', order: r.orders[0] } : r);
}

// ── Print button ─────────────────────────────────────────────────────────────

function PrintReceiptButton({ orderId, currency }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handlePrint() {
    // Open window synchronously while inside the user-gesture call stack.
    // Browsers block window.open() called after an await (no longer a user gesture).
    const win = window.open('', '_blank', 'width=360,height=700,toolbar=no,menubar=no,scrollbars=yes');
    if (!win) {
      alert('Please allow pop-ups for this site to print receipts.');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const { data } = await api.get(`/payments/${orderId}/receipt`);
      printReceipt(data, currency, win);
    } catch {
      win.close();
      setErr('Failed to load receipt');
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={handlePrint}
        disabled={loading}
        className="flex items-center gap-1.5 disabled:opacity-50 transition-colors"
        style={{ fontSize: 12, color: 'var(--mute)', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mute)')}
      >
        <Printer size={13} />
        {loading ? 'Opening…' : 'Print Receipt'}
      </button>
      {err && <span style={{ fontSize: 12, color: 'var(--bad)' }}>{err}</span>}
    </span>
  );
}

function SessionPrintButton({ orders, currency }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  async function handlePrint() {
    const win = window.open('', '_blank', 'width=360,height=700,toolbar=no,menubar=no,scrollbars=yes');
    if (!win) { alert('Please allow pop-ups for this site to print receipts.'); return; }
    setLoading(true); setErr('');
    try {
      const receipts = await Promise.all(orders.map((o) => api.get(`/payments/${o.id}/receipt`).then((r) => r.data)));
      const combined = {
        ...receipts[0],
        items:                  receipts.flatMap((r) => r.items || []),
        subtotal:               receipts.reduce((s, r) => s + parseFloat(r.subtotal              || 0), 0),
        tax_amount:             receipts.reduce((s, r) => s + parseFloat(r.tax_amount            || 0), 0),
        service_charge_amount:  receipts.reduce((s, r) => s + parseFloat(r.service_charge_amount || 0), 0),
        total_charged:          receipts.reduce((s, r) => s + parseFloat(r.total_charged         || 0), 0),
      };
      printReceipt(combined, currency, win);
    } catch {
      win.close();
      setErr('Failed to load receipt');
    } finally { setLoading(false); }
  }

  return (
    <span className="flex items-center gap-2">
      <button type="button" onClick={handlePrint} disabled={loading}
        className="flex items-center gap-1.5 disabled:opacity-50 transition-colors"
        style={{ fontSize: 12, color: 'var(--mute)', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mute)')}
      >
        <Printer size={13} />
        {loading ? 'Opening…' : 'Print Receipt'}
      </button>
      {err && <span style={{ fontSize: 12, color: 'var(--bad)' }}>{err}</span>}
    </span>
  );
}

// Adapt history item shape → printKOT shape
function toKOTOrder(order) {
  return {
    ...order,
    items: (order.items || []).map((i) => ({
      item_name: i.name,
      item_status: 'received',
      quantity: i.quantity,
      notes: i.notes,
      customizations: {},
      category: i.category,
    })),
  };
}

function PrintKOTButton({ order }) {
  return (
    <button
      type="button"
      onClick={() => printKOT(toKOTOrder(order))}
      className="flex items-center gap-1.5 transition-colors"
      style={{ fontSize: 12, color: 'var(--mute)', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mute)')}
    >
      <Printer size={13} /> Print KOT
    </button>
  );
}

function SessionPrintKOTButton({ orders }) {
  function handlePrint() {
    const merged = {
      ...orders[0],
      items: orders.flatMap((o) => (o.items || []).map((i) => ({
        item_name: i.name,
        item_status: 'received',
        quantity: i.quantity,
        notes: i.notes,
        customizations: {},
        category: i.category,
      }))),
    };
    printKOT(merged);
  }
  return (
    <button
      type="button"
      onClick={handlePrint}
      className="flex items-center gap-1.5 transition-colors"
      style={{ fontSize: 12, color: 'var(--mute)', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mute)')}
    >
      <Printer size={13} /> Print KOT
    </button>
  );
}

// ── Session row (multi-round dining table) ────────────────────────────────────

function SessionRow({ session, format, formatTime, currency }) {
  const [open, setOpen] = useState(false);
  const { tableNumber, orders } = session;
  const firstOrder = orders[0];

  const allPaid  = orders.every((o) => o.status === 'paid');
  const status   = allPaid ? 'paid' : (orders.find((o) => o.status !== 'paid')?.status ?? orders[0].status);
  const paidOrder = orders.find((o) => o.status === 'paid');

  const allItems        = mergeHistoryItems(orders.flatMap((o) => o.items || []));
  const combinedTotal   = orders.reduce((s, o) => s + parseFloat(o.total_charged         || 0), 0);
  const combinedSub     = orders.reduce((s, o) => s + parseFloat(o.bill_subtotal ?? o.items_total ?? 0), 0);
  const combinedTax     = orders.reduce((s, o) => s + parseFloat(o.tax_amount            || 0), 0);
  const combinedSC      = orders.reduce((s, o) => s + parseFloat(o.service_charge_amount || 0), 0);
  const combinedDisc    = orders.reduce((s, o) => s + parseFloat(o.bill_discount_amount  || 0), 0);

  return (
    <div style={{ borderBottom: '1px solid var(--line)' }} className="last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors min-w-[480px]"
        style={{ background: 'transparent', border: 0, cursor: 'pointer' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ color: 'var(--mute-2)', width: 14, flexShrink: 0, display: 'flex' }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="w-14 mono num shrink-0" style={{ fontSize: 12, color: 'var(--mute)' }}>
          {formatTime(new Date(firstOrder.created_at))}
        </span>
        <span className="w-16 mono shrink-0" style={{ fontSize: 11.5, color: 'var(--mute-2)' }}>
          {orders.length} rounds
        </span>
        <span className="w-5 shrink-0 flex" style={{ color: CHANNEL_COLORS.dining }}>
          <UtensilsCrossed size={14} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate" style={{ fontSize: 13, color: 'var(--ink)' }}>Table {tableNumber}</span>
          {firstOrder.customer_name && (
            <span className="block truncate" style={{ fontSize: 11, color: 'var(--mute)' }}>{firstOrder.customer_name}</span>
          )}
        </span>
        <span className="w-28 truncate hidden sm:block" style={{ fontSize: 12, color: 'var(--mute)' }}>
          {firstOrder.created_by_email?.split('@')[0] ?? '—'}
        </span>
        <span className="w-20 text-right mono num shrink-0" style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>
          {allPaid ? format(combinedTotal) : '—'}
        </span>
        <span className="w-20 text-right capitalize shrink-0" style={{ fontSize: 12, fontWeight: 500, color: STATUS_COLORS[status] ?? 'var(--mute-2)' }}>
          {status}
        </span>
      </button>

      {open && (
        <div className="px-10 pb-4 pt-3 space-y-4" style={{ background: 'var(--paper-2)', borderTop: '1px solid var(--line)' }}>
          <div className="space-y-1.5">
            {allItems.map((item, i) => (
              <div key={i} className="flex justify-between" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                <span>
                  {item.name}
                  <span style={{ color: 'var(--mute)', marginLeft: 4 }}>× {item.quantity}</span>
                  {item.notes && (
                    <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--mute)', fontStyle: 'italic' }}>{item.notes}</span>
                  )}
                </span>
                <span className="mono num">{format(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div>
            <SessionPrintKOTButton orders={orders} />
          </div>

          {allPaid && (
            <div className="space-y-1.5" style={{ borderRadius: 6, border: '1px solid var(--line-2)', background: 'var(--paper)', padding: '12px 14px', fontSize: 13 }}>
              <div className="flex justify-between" style={{ color: 'var(--mute)' }}>
                <span>Subtotal</span><span className="mono num">{format(combinedSub)}</span>
              </div>
              {combinedDisc > 0 && (
                <div className="flex justify-between" style={{ color: 'var(--ok)' }}>
                  <span>Discount</span><span className="mono num">−{format(combinedDisc)}</span>
                </div>
              )}
              {combinedTax > 0 && (
                <div className="flex justify-between" style={{ color: 'var(--mute)' }}>
                  <span>Tax</span><span className="mono num">{format(combinedTax)}</span>
                </div>
              )}
              {combinedSC > 0 && (
                <div className="flex justify-between" style={{ color: 'var(--mute)' }}>
                  <span>Service charge</span><span className="mono num">{format(combinedSC)}</span>
                </div>
              )}
              <div className="flex justify-between" style={{ fontWeight: 600, color: 'var(--ink)', borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 4 }}>
                <span>Total charged</span><span className="mono num">{format(combinedTotal)}</span>
              </div>
              <div className="flex items-center justify-between" style={{ paddingTop: 2 }}>
                <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>
                  Paid via <span className="capitalize">{paidOrder?.payment_method}</span>
                </span>
                <SessionPrintButton orders={orders} currency={currency} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function OrderRow({ order, format, formatTime, currency }) {
  const [open, setOpen] = useState(false);
  const ChannelIcon = CHANNEL_ICONS[order.channel] || UtensilsCrossed;
  const token = order.id.slice(-6).toUpperCase();
  const createdBy = order.created_by_email?.split('@')[0] ?? '—';

  const displayTotal = order.status === 'paid'
    ? parseFloat(order.total_charged || 0)
    : parseFloat(order.items_total || 0);

  return (
    <div style={{ borderBottom: '1px solid var(--line)' }} className="last:border-0">
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors min-w-[480px]"
        style={{ background: 'transparent', border: 0, cursor: 'pointer' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ color: 'var(--mute-2)', width: 14, flexShrink: 0, display: 'flex' }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        <span className="w-14 mono num shrink-0" style={{ fontSize: 12, color: 'var(--mute)' }}>
          {formatTime(new Date(order.created_at))}
        </span>

        <span className="w-16 mono shrink-0" style={{ fontSize: 11.5, color: 'var(--mute-2)' }}>
          #{token}
        </span>

        <span className="w-5 shrink-0 flex" style={{ color: CHANNEL_COLORS[order.channel] ?? 'var(--mute)' }}>
          <ChannelIcon size={14} />
        </span>

        <span className="flex-1 min-w-0">
          <span className="block truncate" style={{ fontSize: 13, color: 'var(--ink)' }}>
            {order.channel === 'dining'
              ? order.table_number ? `Table ${order.table_number}` : '—'
              : order.customer_ref || '—'}
          </span>
          {order.customer_name && (
            <span className="block truncate" style={{ fontSize: 11, color: 'var(--mute)' }}>{order.customer_name}</span>
          )}
        </span>

        <span className="w-28 truncate hidden sm:block" style={{ fontSize: 12, color: 'var(--mute)' }}>
          {createdBy}
        </span>

        <span className="w-20 text-right mono num shrink-0" style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>
          {order.status === 'paid' ? format(displayTotal) : '—'}
        </span>

        <span className="w-20 text-right capitalize shrink-0" style={{ fontSize: 12, fontWeight: 500, color: STATUS_COLORS[order.status] ?? 'var(--mute-2)' }}>
          {order.status}
        </span>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-10 pb-4 pt-3 space-y-4" style={{ background: 'var(--paper-2)', borderTop: '1px solid var(--line)' }}>
          {/* Items + KOT button */}
          <div className="space-y-1.5">
            {(order.items || []).map((item, i) => (
              <div key={i} className="flex justify-between" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                <span>
                  {item.name}
                  <span style={{ color: 'var(--mute)', marginLeft: 4 }}>× {item.quantity}</span>
                  {item.notes && (
                    <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--mute)', fontStyle: 'italic' }}>
                      {item.notes}
                    </span>
                  )}
                </span>
                <span className="mono num">{format(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div>
            <PrintKOTButton order={order} />
          </div>

          {/* Bill breakdown — only for paid orders */}
          {order.status === 'paid' && (
            <div className="space-y-1.5" style={{
              borderRadius: 6,
              border: '1px solid var(--line-2)',
              background: 'var(--paper)',
              padding: '12px 14px',
              fontSize: 13,
            }}>
              <div className="flex justify-between" style={{ color: 'var(--mute)' }}>
                <span>Subtotal</span>
                <span className="mono num">{format(order.bill_subtotal ?? order.items_total)}</span>
              </div>
              {parseFloat(order.bill_discount_amount) > 0 && (
                <div className="flex justify-between" style={{ color: 'var(--ok)' }}>
                  <span>
                    Discount
                    {order.discount_type === 'percent' ? ` (${order.discount_value}%)` : ' (flat)'}
                  </span>
                  <span className="mono num">−{format(order.bill_discount_amount)}</span>
                </div>
              )}
              {parseFloat(order.tax_amount) > 0 && (
                <div className="flex justify-between" style={{ color: 'var(--mute)' }}>
                  <span>Tax ({+(parseFloat(order.tax_rate) * 100).toFixed(4)}%)</span>
                  <span className="mono num">{format(order.tax_amount)}</span>
                </div>
              )}
              {parseFloat(order.service_charge_amount) > 0 && (
                <div className="flex justify-between" style={{ color: 'var(--mute)' }}>
                  <span>Service charge ({+(parseFloat(order.service_charge_rate) * 100).toFixed(4)}%)</span>
                  <span className="mono num">{format(order.service_charge_amount)}</span>
                </div>
              )}
              <div className="flex justify-between" style={{
                fontWeight: 600,
                color: 'var(--ink)',
                borderTop: '1px solid var(--line)',
                paddingTop: 8,
                marginTop: 4,
              }}>
                <span>Total charged</span>
                <span className="mono num">{format(order.total_charged)}</span>
              </div>
              <div className="flex items-center justify-between" style={{ paddingTop: 2 }}>
                <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>
                  Paid via <span className="capitalize">{order.payment_method}</span>
                </span>
                <PrintReceiptButton orderId={order.id} currency={currency} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CSV export ───────────────────────────────────────────────────────────────

const ORDER_CSV_COLS = [
  { label: 'Date',           get: (o) => new Date(o.created_at).toLocaleDateString() },
  { label: 'Time',           get: (o) => new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
  { label: 'Token',          get: (o) => o.id.slice(-6).toUpperCase() },
  { label: 'Channel',        get: (o) => o.channel ?? '' },
  { label: 'Table / Ref',    get: (o) => o.channel === 'dining' ? (o.table_number ? `Table ${o.table_number}` : '') : (o.customer_ref ?? '') },
  { label: 'Staff',          get: (o) => o.created_by_email?.split('@')[0] ?? '' },
  { label: 'Status',         get: (o) => o.status },
  { label: 'Items',          get: (o) => (o.items || []).map((i) => `${i.name} ×${i.quantity}`).join('; ') },
  { label: 'Subtotal',       get: (o) => parseFloat(o.bill_subtotal ?? o.items_total ?? 0).toFixed(2) },
  { label: 'Discount',       get: (o) => parseFloat(o.bill_discount_amount ?? 0).toFixed(2) },
  { label: 'Tax',            get: (o) => parseFloat(o.tax_amount ?? 0).toFixed(2) },
  { label: 'Service Charge', get: (o) => parseFloat(o.service_charge_amount ?? 0).toFixed(2) },
  { label: 'Total',          get: (o) => parseFloat(o.total_charged ?? 0).toFixed(2) },
  { label: 'Payment Method', get: (o) => o.payment_method ?? '' },
];

function downloadOrdersCsv(filename, orders) {
  const lines = [
    ORDER_CSV_COLS.map((c) => escCsv(c.label)).join(','),
    ...orders.map((o) => ORDER_CSV_COLS.map((c) => escCsv(c.get(o))).join(',')),
  ].join('\r\n');
  const a = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([lines], { type: 'text/csv;charset=utf-8;' })),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OrderHistory() {
  const { format, currency } = useCurrency();
  const { iana, todayLocal, formatTime } = useTimezone();

  const today = todayLocal();

  const [preset,        setPreset]        = useState('today');
  const [customFrom,    setCustomFrom]    = useState(today);
  const [customTo,      setCustomTo]      = useState(today);
  const [statusFilter,  setStatusFilter]  = useState('');
  const [channelFilter, setChannelFilter] = useState('');

  const { from, to } = useMemo(() => {
    if (preset === 'yesterday') {
      const y = shiftDate(today, -1);
      return { from: y, to: y };
    }
    if (preset === 'week')   return { from: startOfWeek(today),  to: today };
    if (preset === 'month')  return { from: startOfMonth(today), to: today };
    if (preset === 'custom') return { from: customFrom, to: customTo };
    return { from: today, to: today };
  }, [preset, today, customFrom, customTo]);

  const { data, isLoading, isError } = useOrderHistory({
    from,
    to,
    status:   statusFilter  || undefined,
    channel:  channelFilter || undefined,
    timezone: iana,
  });

  const { orders = [], stats } = data ?? {};

  const displayRows = useMemo(() => buildDisplayRows(orders), [orders]);

  return (
    <div className="space-y-5">

      {/* Header + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Order History</h1>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>{iana}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {/* Print all KOTs */}
          <button
            onClick={() => printAllKOTs(orders.map(toKOTOrder))}
            disabled={orders.length === 0}
            className="btn-secondary disabled:opacity-40"
            style={{ height: 32, fontSize: 12, gap: 5 }}
          >
            <Printer size={13} /> Print All KOTs
          </button>

          {/* Export */}
          <button
            onClick={() => downloadOrdersCsv(`orders_${from}_${to}.csv`, orders)}
            disabled={orders.length === 0}
            className="btn-secondary disabled:opacity-40"
            style={{ height: 32, fontSize: 12, gap: 5 }}
          >
            <Download size={13} /> Export CSV
          </button>

          {/* Date presets */}
          <div className="flex overflow-x-auto" style={{ border: '1px solid var(--line-2)', borderRadius: 6 }}>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className="whitespace-nowrap transition-colors"
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '5px 12px',
                  border: 0,
                  cursor: 'pointer',
                  background: preset === p.id ? 'var(--ink)' : 'transparent',
                  color: preset === p.id ? 'var(--accent-on)' : 'var(--mute)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <SelectField
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            style={{ height: 32, fontSize: 12, fontWeight: 500, padding: '0 10px', width: 'auto' }}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'paid',      label: 'Paid' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'served',    label: 'Served' },
              { value: 'ready',     label: 'Ready' },
              { value: 'preparing', label: 'Preparing' },
              { value: 'received',  label: 'Received' },
            ]}
          />

          {/* Channel filter */}
          <SelectField
            value={channelFilter}
            onChange={(v) => setChannelFilter(v)}
            style={{ height: 32, fontSize: 12, fontWeight: 500, padding: '0 10px', width: 'auto' }}
            options={[
              { value: '',         label: 'All channels' },
              { value: 'dining',   label: 'Dining' },
              { value: 'takeaway', label: 'Takeaway' },
              { value: 'delivery', label: 'Delivery' },
            ]}
          />
        </div>
      </div>

      {/* Custom date range */}
      {preset === 'custom' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-2">
            <label style={{ width: 32, flexShrink: 0, fontSize: 13, color: 'var(--mute)' }}>From</label>
            <input
              type="date"
              className="input"
              style={{ fontSize: 13 }}
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label style={{ width: 32, flexShrink: 0, fontSize: 13, color: 'var(--mute)' }}>To</label>
            <input
              type="date"
              className="input"
              style={{ fontSize: 13 }}
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total orders', value: stats.total },
            { label: 'Paid',         value: stats.paid },
            { label: 'Cancelled',    value: stats.cancelled },
            { label: 'Revenue',      value: format(stats.revenue) },
          ].map(({ label, value }) => (
            <div key={label} style={{
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: '14px 16px',
              background: 'var(--paper)',
            }}>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600, color: 'var(--mute)', margin: 0 }}>
                {label}
              </p>
              <p className="mono num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginTop: 4, marginBottom: 0 }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)', overflow: 'hidden' }}>
        <div className="overflow-x-auto">
        {/* Column headers */}
        <div
          className="flex items-center gap-3 px-4 py-2 min-w-[480px]"
          style={{
            background: 'var(--paper-2)',
            borderBottom: '1px solid var(--line)',
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '.07em',
            color: 'var(--mute)',
          }}
        >
          <span style={{ width: 14, flexShrink: 0 }} />
          <span style={{ width: 56, flexShrink: 0 }}>Time</span>
          <span style={{ width: 64, flexShrink: 0 }}>Token</span>
          <span style={{ width: 20, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>Table / Ref</span>
          <span style={{ width: 112, flexShrink: 0 }} className="hidden sm:block">Staff</span>
          <span style={{ width: 80, flexShrink: 0, textAlign: 'right' }}>Total</span>
          <span style={{ width: 80, flexShrink: 0, textAlign: 'right' }}>Status</span>
        </div>

        {isLoading && (
          <p className="p-8 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>
        )}
        {isError && (
          <p className="p-8 text-center" style={{ fontSize: 13, color: 'var(--bad)' }}>Failed to load orders.</p>
        )}
        {!isLoading && !isError && displayRows.length === 0 && (
          <p className="p-8 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>No orders found for this period.</p>
        )}
        {!isLoading && displayRows.map((row) =>
          row.type === 'session' ? (
            <SessionRow
              key={`session-${row.orders[0].table_session_id}`}
              session={row}
              format={format}
              formatTime={formatTime}
              currency={currency}
            />
          ) : (
            <OrderRow
              key={row.order.id}
              order={row.order}
              format={format}
              formatTime={formatTime}
              currency={currency}
            />
          )
        )}
        </div>
      </div>
    </div>
  );
}
