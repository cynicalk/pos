import { useState } from 'react';
import { Truck, Upload, PackageCheck, AlertTriangle, Plus, Check } from 'lucide-react';
import {
  useSuppliers, useReorder, useSuggestions, usePurchaseOrders,
  useCreateSupplier, useCreatePurchaseOrder, useReceivePurchaseOrder, useImportInvoice,
} from '../hooks/useProcurement';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Procurement — suppliers, reorder positions, drafted orders and invoice intake.
 *
 * Two honesty rules carried through from the backend:
 *   · an ingredient with no observed usage gets no reorder advice at all,
 *     because there is no defensible quantity to suggest;
 *   · an ingredient with no supplier still appears, in its own list, rather
 *     than vanishing from a per-supplier grouping.
 */

const TABS = [
  { key: 'reorder',   label: 'Reorder' },
  { key: 'orders',    label: 'Purchase orders' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'invoice',   label: 'Invoice import' },
];

const btn = (primary = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 11px', borderRadius: 7, cursor: 'pointer',
  fontSize: 12.5, fontWeight: 500,
  border: `1px solid ${primary ? 'var(--ink)' : 'var(--line-2)'}`,
  background: primary ? 'var(--ink)' : 'transparent',
  color: primary ? 'var(--paper)' : 'var(--ink)',
});

const input = {
  padding: '6px 9px', borderRadius: 7, border: '1px solid var(--line-2)',
  background: 'var(--paper)', color: 'var(--ink)', fontSize: 13,
};

const TH = { padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em' };
const TD = { padding: '7px 10px', fontSize: 12.5, color: 'var(--ink)' };
const NUM = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

function ReorderTab({ format }) {
  const { data, isLoading } = useReorder();
  const [onlyNeeded, setOnlyNeeded] = useState(true);
  if (isLoading || !data) return <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>;

  const items = onlyNeeded ? data.items.filter((i) => i.shouldReorder) : data.items;
  const noSignal = data.items.filter((i) => !i.hasUsageSignal).length;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mute)' }}>
          Reorder point = usage over the supplier's lead time, plus a half-lead-time buffer.
          Usage is measured from your stock ledger over {data.consumptionDays} days.
        </p>
        <button onClick={() => setOnlyNeeded((v) => !v)} style={{ ...btn(), marginLeft: 'auto' }}>
          {onlyNeeded ? 'Show all' : 'Only what needs ordering'}
        </button>
      </div>

      {noSignal > 0 && (
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--mute)' }}>
          {noSignal} {noSignal === 1 ? 'ingredient has' : 'ingredients have'} no recorded usage in
          this window, so no reorder point is calculated for {noSignal === 1 ? 'it' : 'them'} —
          a quantity with nothing behind it would be a guess.
        </p>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
            <th style={TH}>Ingredient</th>
            <th style={TH}>Supplier</th>
            <th style={{ ...TH, textAlign: 'right' }}>On hand</th>
            <th style={{ ...TH, textAlign: 'right' }}>Usage / day</th>
            <th style={{ ...TH, textAlign: 'right' }}>Reorder at</th>
            <th style={{ ...TH, textAlign: 'right' }}>Cover</th>
          </tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={TD}>
                  {i.name}
                  {i.shouldReorder && (
                    <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 600, color: 'var(--bad)' }}>ORDER</span>
                  )}
                </td>
                <td style={{ ...TD, color: i.supplierName ? 'var(--ink)' : 'var(--mute-2)' }}>
                  {i.supplierName || 'unassigned'}
                </td>
                <td style={{ ...NUM, color: i.onHand < 0 ? 'var(--bad)' : 'var(--ink)' }}>
                  {i.onHand} {i.unit}
                </td>
                <td style={NUM}>{i.hasUsageSignal ? i.dailyUsage : '—'}</td>
                <td style={NUM}>{i.hasUsageSignal ? i.reorderPoint : '—'}</td>
                <td style={NUM}>
                  {i.daysOfCover === null ? '—' : `${i.coverCapped ? '>' : ''}${i.daysOfCover}d`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>Nothing needs ordering right now.</p>
      )}
    </>
  );
}

function OrdersTab({ format }) {
  const { data: suggestions } = useSuggestions();
  const { data: orders = [] } = usePurchaseOrders();
  const create = useCreatePurchaseOrder();
  const receive = useReceivePurchaseOrder();

  return (
    <>
      <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Suggested orders</h3>
      {!suggestions || suggestions.suggestions.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--mute)', lineHeight: 1.55 }}>
          Nothing to suggest. Orders are drafted from measured usage, so an ingredient with no
          recorded consumption — or no supplier assigned — is never guessed at.
          {suggestions?.unassigned?.length > 0 &&
            ` ${suggestions.unassigned.length} ingredient(s) need ordering but have no supplier.`}
        </p>
      ) : (
        suggestions.suggestions.map((s) => (
          <div key={s.supplierId} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '13px 15px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{s.supplierName}</span>
              <span style={{ fontSize: 12, color: 'var(--mute)' }}>lead {s.leadTimeDays}d</span>
              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600 }}>{format(s.total)}</span>
            </div>
            {s.lines.map((l) => (
              <div key={l.ingredientId} style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '3px 0', color: 'var(--mute)' }}>
                <span style={{ flex: 1, color: 'var(--ink)' }}>{l.name}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{l.quantity} {l.unit}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', width: 90, textAlign: 'right' }}>
                  {l.hasCost ? format(l.lineTotal) : 'no cost on file'}
                </span>
              </div>
            ))}
            <button
              style={{ ...btn(true), marginTop: 10 }}
              disabled={create.isPending}
              onClick={() => create.mutate({ supplierId: s.supplierId, lines: s.lines })}
            >
              <Plus size={13} strokeWidth={2.2} /> Create draft order
            </button>
          </div>
        ))
      )}

      <h3 style={{ margin: '22px 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Orders</h3>
      {orders.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>No purchase orders yet.</p>
      ) : (
        orders.map((po) => (
          <div key={po.id} style={{
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 13,
          }}>
            <span style={{ fontWeight: 500 }}>{po.supplier_name}</span>
            <span style={{ color: 'var(--mute)' }}>{(po.lines || []).length} line(s)</span>
            <span style={{ color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>{format(po.total)}</span>
            <span style={{
              padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '.06em',
              background: po.status === 'received' ? 'var(--ok-soft)' : 'var(--hover)',
              color: po.status === 'received' ? 'var(--ok)' : 'var(--mute)',
            }}>{po.status}</span>
            {po.status !== 'received' && po.status !== 'cancelled' && (
              <button
                style={{ ...btn(), marginLeft: 'auto' }}
                disabled={receive.isPending}
                onClick={() => receive.mutate(po.id)}
              >
                <PackageCheck size={13} strokeWidth={2.2} /> Mark received
              </button>
            )}
          </div>
        ))
      )}
    </>
  );
}

function SuppliersTab() {
  const { data: suppliers = [] } = useSuppliers();
  const create = useCreateSupplier();
  const [form, setForm] = useState({ name: '', phone: '', leadTimeDays: 2 });

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <input style={{ ...input, flex: 1, minWidth: 150 }} placeholder="Supplier name"
               value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input style={{ ...input, width: 130 }} placeholder="Phone"
               value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input style={{ ...input, width: 110 }} type="number" min="0" placeholder="Lead days"
               value={form.leadTimeDays}
               onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })} />
        <button
          style={btn(true)}
          disabled={!form.name.trim() || create.isPending}
          onClick={() => create.mutate(form, { onSuccess: () => setForm({ name: '', phone: '', leadTimeDays: 2 }) })}
        >
          <Plus size={13} strokeWidth={2.2} /> Add
        </button>
      </div>

      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
        Lead time is how long a delivery takes to arrive. It sets the reorder point, so a wrong
        lead time is what makes a kitchen run out mid-service.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
          <th style={TH}>Supplier</th><th style={TH}>Phone</th>
          <th style={{ ...TH, textAlign: 'right' }}>Lead time</th>
          <th style={{ ...TH, textAlign: 'right' }}>Ingredients</th>
        </tr></thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid var(--line)' }}>
              <td style={TD}>{s.name}</td>
              <td style={{ ...TD, color: 'var(--mute)' }}>{s.phone || '—'}</td>
              <td style={NUM}>{s.lead_time_days}d</td>
              <td style={NUM}>{s.ingredient_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {suppliers.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>No suppliers yet.</p>
      )}
    </>
  );
}

function InvoiceTab({ format }) {
  const [csv, setCsv] = useState('');
  const importInvoice = useImportInvoice();
  const result = importInvoice.data;

  return (
    <>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
        Paste a supplier invoice as CSV with columns <code>ingredient_name, quantity, unit_cost</code>.
        Matched ingredients have their cost updated and the change is recorded in their price
        history. Names that don't match an existing ingredient are reported, never created — a new
        row from a supplier's spelling would split that ingredient's cost history in two.
      </p>

      <textarea
        style={{ ...input, width: '100%', minHeight: 120, fontFamily: 'monospace', fontSize: 12 }}
        placeholder={'ingredient_name,quantity,unit_cost\nTomatoes,25,62\nOnions,10,38'}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />
      <button
        style={{ ...btn(true), marginTop: 10 }}
        disabled={!csv.trim() || importInvoice.isPending}
        onClick={() => importInvoice.mutate(csv)}
      >
        <Upload size={13} strokeWidth={2.2} /> {importInvoice.isPending ? 'Importing…' : 'Import'}
      </button>

      {result && (
        <div style={{ marginTop: 16 }}>
          {result.updated.length > 0 && (
            <>
              <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--ok)' }}>
                <Check size={13} strokeWidth={2.4} /> {result.updated.length} price(s) updated
              </h4>
              {result.updated.map((u) => (
                <div key={u.id} style={{ fontSize: 12.5, padding: '3px 0', color: 'var(--mute)' }}>
                  {u.name}: {format(u.previousCost)} → <strong style={{ color: 'var(--ink)' }}>{format(u.newCost)}</strong>
                  {u.changePct != null && ` (${u.changePct > 0 ? '+' : ''}${u.changePct.toFixed(1)}%)`}
                </div>
              ))}
            </>
          )}
          {result.unmatched.length > 0 && (
            <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--warn)' }}>
              <AlertTriangle size={12} strokeWidth={2.2} /> No ingredient matches: {result.unmatched.join(', ')}
            </p>
          )}
          {result.errors.length > 0 && (
            <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12.5, color: 'var(--bad)' }}>
              {result.errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

export default function Procurement() {
  const [tab, setTab] = useState('reorder');
  const { format } = useCurrency();

  return (
    <div style={{ padding: '24px 22px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Truck size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>Procurement</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, margin: '16px 0 14px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
            border: '1px solid ' + (tab === t.key ? 'var(--ink)' : 'var(--line)'),
            background: tab === t.key ? 'var(--ink)' : 'transparent',
            color: tab === t.key ? 'var(--paper)' : 'var(--mute)',
            fontWeight: tab === t.key ? 600 : 500,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'reorder'   && <ReorderTab format={format} />}
      {tab === 'orders'    && <OrdersTab format={format} />}
      {tab === 'suppliers' && <SuppliersTab />}
      {tab === 'invoice'   && <InvoiceTab format={format} />}
    </div>
  );
}
