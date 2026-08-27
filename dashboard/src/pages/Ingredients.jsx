import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, AlertTriangle, ShoppingCart, X, ArrowUp, ArrowDown, ChevronsUpDown, Bell, Upload } from 'lucide-react';
import {
  useIngredients,
  useCreateIngredient,
  useUpdateIngredient,
  useRecordPurchase,
} from '../hooks/useIngredients';
import Modal from '../components/Modal';
import ImportModal from '../components/ImportModal';
import Combobox from '../components/Combobox';

const UNITS = ['kg', 'g', 'mg', 'L', 'ml', 'piece', 'dozen', 'box', 'bag', 'bottle', 'can', 'pack', 'tbsp', 'tsp', 'cup', 'oz', 'lb', 'portion', 'serving', 'bunch', 'slice'];
import { useCurrency } from '../context/CurrencyContext';
import { queryClient } from '../lib/queryClient';

const EMPTY_FORM = { name: '', unit: '', reorderLevel: '', reorderQty: '', latestUnitCost: '', perishable: false };
const EMPTY_PURCHASE = { quantity: '', unitCost: '' };

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <ChevronsUpDown size={11} style={{ color: 'var(--line-2)', marginLeft: 3, flexShrink: 0 }} />;
  return sortDir === 'asc'
    ? <ArrowUp  size={11} style={{ color: 'var(--ink)', marginLeft: 3, flexShrink: 0 }} />
    : <ArrowDown size={11} style={{ color: 'var(--ink)', marginLeft: 3, flexShrink: 0 }} />;
}

export default function Ingredients() {
  const { data: items = [], isLoading } = useIngredients({ refetchInterval: 30_000 });
  const { format, currency }            = useCurrency();
  const createIngredient  = useCreateIngredient();
  const updateIngredient  = useUpdateIngredient();
  const recordPurchase    = useRecordPurchase();

  const [modal,      setModal]      = useState(null);
  const [purchase,   setPurchase]   = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [purForm,  setPurForm]  = useState(EMPTY_PURCHASE);
  const [filter,   setFilter]   = useState('all');

  const [sortCol,  setSortCol]  = useState('name');
  const [sortDir,  setSortDir]  = useState('asc');
  const [notification, setNotification] = useState(null);
  const notifTimer  = useRef(null);
  const prevLowIds  = useRef(null);

  // Detect newly low-stock items on each refetch
  useEffect(() => {
    if (!items.length) return;
    const lowNow = new Set(
      items
        .filter((i) => i.is_active && parseFloat(i.stock_on_hand) <= parseFloat(i.reorder_level))
        .map((i) => i.id),
    );
    if (prevLowIds.current !== null) {
      const newLow = [...lowNow].filter((id) => !prevLowIds.current.has(id));
      if (newLow.length > 0) {
        const names = newLow
          .map((id) => items.find((i) => i.id === id)?.name)
          .filter(Boolean)
          .join(', ');
        clearTimeout(notifTimer.current);
        setNotification(names);
        notifTimer.current = setTimeout(() => setNotification(null), 6000);
      }
    }
    prevLowIds.current = lowNow;
  }, [items]);

  useEffect(() => () => clearTimeout(notifTimer.current), []);

  function toggleSort(col) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  const filtered = items.filter((i) => {
    if (filter === 'perishable') return i.perishable;
    if (filter === 'dry')        return !i.perishable;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av, bv;
    switch (sortCol) {
      case 'name':    av = a.name.toLowerCase();              bv = b.name.toLowerCase();              break;
      case 'stock':   av = parseFloat(a.stock_on_hand);       bv = parseFloat(b.stock_on_hand);       break;
      case 'reorder': av = parseFloat(a.reorder_level);       bv = parseFloat(b.reorder_level);       break;
      case 'cost':    av = parseFloat(a.latest_unit_cost);    bv = parseFloat(b.latest_unit_cost);    break;
      default: return 0;
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  function openAdd() { setForm(EMPTY_FORM); setModal('add'); }
  function openEdit(ing) {
    setForm({
      name:            ing.name,
      unit:            ing.unit,
      reorderLevel:    ing.reorder_level,
      reorderQty:      ing.reorder_qty,
      latestUnitCost:  parseFloat(ing.latest_unit_cost).toFixed(currency.decimals),
      perishable:      ing.perishable ?? false,
    });
    setModal(ing);
  }
  function openPurchase(ing) {
    setPurForm({ quantity: '', unitCost: parseFloat(ing.latest_unit_cost).toFixed(currency.decimals) });
    setPurchase(ing);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      ...form,
      latestUnitCost: parseFloat(form.latestUnitCost) || 0,
      reorderLevel:   parseFloat(form.reorderLevel)   || 0,
      reorderQty:     parseFloat(form.reorderQty)     || 0,
      perishable:     form.perishable,
    };
    if (modal === 'add') await createIngredient.mutateAsync(payload);
    else                 await updateIngredient.mutateAsync({ id: modal.id, ...payload });
    setModal(null);
  }

  async function handlePurchase(e) {
    e.preventDefault();
    await recordPurchase.mutateAsync({
      id:       purchase.id,
      quantity: parseFloat(purForm.quantity),
      unitCost: parseFloat(purForm.unitCost),
    });
    setPurchase(null);
  }

  const isSaving = createIngredient.isPending || updateIngredient.isPending;
  const lowStock = items.filter(
    (i) => i.is_active && parseFloat(i.stock_on_hand) <= parseFloat(i.reorder_level),
  );
  const perishableCount = items.filter((i) => i.perishable).length;
  const dryCount        = items.filter((i) => !i.perishable).length;

  const COLS = [
    { key: 'name',    label: 'Ingredient' },
    { key: null,      label: 'Type'       },
    { key: null,      label: 'Unit'       },
    { key: 'stock',   label: 'Stock'      },
    { key: 'reorder', label: 'Reorder at' },
    { key: 'cost',    label: 'Unit cost'  },
    { key: null,      label: ''           },
  ];

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Ingredients</h1>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
            {items.length} total · {perishableCount} perishable · {dryCount} dry goods · refreshes every 30 s
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {lowStock.length > 0 && (
            <span
              className="flex items-center gap-1.5 rounded-[6px] px-2.5"
              style={{ height: 32, fontSize: 12, background: 'var(--warn-bg, #fef9c3)', color: '#92400e', border: '1px solid #fde68a' }}
            >
              <AlertTriangle size={13} />
              {lowStock.length} low stock
            </span>
          )}
          <button onClick={() => setShowImport(true)} className="btn">
            <Upload size={13} /> Import
          </button>
          <button onClick={openAdd} className="btn-primary">
            <Plus size={13} /> Add ingredient
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-4 overflow-x-auto" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 0, marginBottom: -4 }}>
        {[
          ['all',        'All',        items.length],
          ['perishable', 'Perishable', perishableCount],
          ['dry',        'Dry Goods',  dryCount],
        ].map(([k, label, count]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className="btn-ghost shrink-0"
            style={{
              height: 32, padding: '0 2px', borderRadius: 0, marginBottom: -1,
              borderBottom: filter === k ? '1.5px solid var(--ink)' : '1.5px solid transparent',
              color: filter === k ? 'var(--ink)' : 'var(--mute)',
              fontWeight: filter === k ? 600 : 500,
            }}
          >
            {label}
            <span className="mono num ml-1.5" style={{ fontSize: 11, color: 'var(--mute-2)' }}>{count}</span>
          </button>
        ))}
      </div>

      {/* Low stock summary banner */}
      {lowStock.length > 0 && (
        <div
          className="rounded-[8px] px-4 py-3"
          style={{ background: 'rgba(180,83,9,.05)', border: '1px solid rgba(180,83,9,.2)' }}
        >
          <p style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
            <AlertTriangle size={12} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />
            Low stock items — reorder soon
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px 20px', marginTop: 8 }}>
            {lowStock.map((i) => {
              const stock = parseFloat(i.stock_on_hand);
              const outOfStock = stock <= 0;
              return (
                <div key={i.id} className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: '#78350f', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.name}
                  </span>
                  <span style={{ whiteSpace: 'nowrap', flexShrink: 0, color: outOfStock ? '#b91c1c' : '#92400e', fontWeight: 500 }}>
                    {outOfStock ? 'Out of stock' : `${stock.toFixed(2)} ${i.unit}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</div>
      ) : sorted.length === 0 ? (
        <div
          className="py-16 text-center rounded-[8px]"
          style={{ fontSize: 13, color: 'var(--mute)', border: '1px dashed var(--line-2)' }}
        >
          {filter === 'all' ? 'No ingredients yet — add one to start tracking stock' : `No ${filter === 'perishable' ? 'perishable' : 'dry goods'} ingredients`}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
                  {COLS.map(({ key, label }) => (
                    <th
                      key={label}
                      onClick={key ? () => toggleSort(key) : undefined}
                      style={{
                        padding: '8px 16px', textAlign: 'left',
                        fontSize: 10, fontWeight: 600, color: key && sortCol === key ? 'var(--ink)' : 'var(--mute)',
                        textTransform: 'uppercase', letterSpacing: '.07em',
                        cursor: key ? 'pointer' : 'default',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {label}
                        {key && <SortIcon col={key} sortCol={sortCol} sortDir={sortDir} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((ing) => {
                  const isLow = ing.is_active && parseFloat(ing.stock_on_hand) <= parseFloat(ing.reorder_level);
                  return (
                    <tr
                      key={ing.id}
                      style={{ borderBottom: '1px solid var(--line)', transition: 'background .1s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '10px 16px' }}>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{ing.name}</span>
                          {!ing.is_active && (
                            <span style={{ fontSize: 10, color: 'var(--mute)', background: 'var(--paper-2)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--line)' }}>
                              inactive
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        {ing.perishable ? (
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#b45309', background: 'rgba(180,83,9,.08)', border: '1px solid rgba(180,83,9,.2)', padding: '2px 7px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                            Perishable
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--mute)', background: 'var(--paper-2)', border: '1px solid var(--line)', padding: '2px 7px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                            Dry goods
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--mute)' }}>{ing.unit}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span
                          className="mono num"
                          style={{ fontSize: 13, fontWeight: 500, color: isLow ? '#b45309' : 'var(--ink)' }}
                        >
                          {parseFloat(ing.stock_on_hand).toFixed(2)}
                          {isLow && <AlertTriangle size={11} style={{ marginLeft: 4, verticalAlign: 'middle', color: '#b45309' }} />}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--mute)' }} className="mono num">
                        {parseFloat(ing.reorder_level).toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--ink)' }} className="mono num">
                        {format(ing.latest_unit_cost)}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openPurchase(ing)}
                            className="btn btn-sm btn-ghost"
                            title="Record purchase"
                            style={{ gap: 4, fontSize: 12 }}
                          >
                            <ShoppingCart size={12} /> Purchase
                          </button>
                          <button
                            onClick={() => openEdit(ing)}
                            className="btn btn-sm btn-ghost"
                            title="Edit"
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal !== null && (
        <Modal title={modal === 'add' ? 'Add Ingredient' : 'Edit Ingredient'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="input" placeholder="e.g. Whole Milk" required
                />
              </div>
              <div>
                <label className="label">Unit</label>
                <Combobox
                  value={form.unit}
                  onChange={(v) => setForm((f) => ({ ...f, unit: v }))}
                  options={UNITS}
                  placeholder="Select or type a unit…"
                  required
                />
              </div>
              <div>
                <label className="label">Unit cost ({currency.code})</label>
                <input
                  type="number" step="0.0001" min="0"
                  value={form.latestUnitCost}
                  onChange={(e) => setForm((f) => ({ ...f, latestUnitCost: e.target.value }))}
                  className="input" placeholder="0.00"
                />
              </div>
              <div>
                <label className="label">Reorder level</label>
                <input
                  type="number" step="0.001" min="0"
                  value={form.reorderLevel}
                  onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))}
                  className="input" placeholder="0"
                />
              </div>
              <div>
                <label className="label">Reorder qty</label>
                <input
                  type="number" step="0.001" min="0"
                  value={form.reorderQty}
                  onChange={(e) => setForm((f) => ({ ...f, reorderQty: e.target.value }))}
                  className="input" placeholder="0"
                />
              </div>
            </div>
            <div className="col-span-2">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                <div
                  onClick={() => setForm((f) => ({ ...f, perishable: !f.perishable }))}
                  style={{
                    width: 36, height: 20, borderRadius: 99, flexShrink: 0,
                    background: form.perishable ? '#b45309' : 'var(--line-2)',
                    position: 'relative', transition: 'background .15s', cursor: 'pointer',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: form.perishable ? 18 : 2,
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                  }} />
                </div>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Perishable</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--mute)' }}>
                    {form.perishable ? 'Needs daily stock check' : 'Long-lasting dry goods'}
                  </span>
                </div>
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button type="submit" disabled={isSaving} className="btn-primary flex-1 justify-center">
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Purchase Modal */}
      {purchase && (
        <Modal title={`Record Purchase — ${purchase.name}`} onClose={() => setPurchase(null)}>
          <form onSubmit={handlePurchase} className="space-y-4">
            <p style={{ fontSize: 12, color: 'var(--mute)' }}>
              Current stock: <strong style={{ color: 'var(--ink)' }}>{parseFloat(purchase.stock_on_hand).toFixed(2)} {purchase.unit}</strong>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Quantity ({purchase.unit})</label>
                <input
                  type="number" step="0.001" min="0.001"
                  value={purForm.quantity}
                  onChange={(e) => setPurForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="input" placeholder="0" required
                />
              </div>
              <div>
                <label className="label">Unit cost ({currency.code})</label>
                <input
                  type="number" step="0.0001" min="0"
                  value={purForm.unitCost}
                  onChange={(e) => setPurForm((f) => ({ ...f, unitCost: e.target.value }))}
                  className="input" placeholder="0.00"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setPurchase(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button type="submit" disabled={recordPurchase.isPending} className="btn-primary flex-1 justify-center">
                {recordPurchase.isPending ? 'Saving…' : 'Record'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Low-stock toast notification */}
      {notification && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            background: 'var(--paper)', border: '1px solid rgba(180,83,9,.35)',
            borderRadius: 10, padding: '14px 16px', maxWidth: 320,
            boxShadow: '0 4px 20px rgba(0,0,0,.12)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}
        >
          <Bell size={15} style={{ color: '#b45309', flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 2 }}>Low Stock Alert</p>
            <p style={{ fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.4 }}>{notification} dropped below reorder level.</p>
          </div>
          <button
            onClick={() => { clearTimeout(notifTimer.current); setNotification(null); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--mute)', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <style>{`
        .label { display: block; margin-bottom: 4px; font-size: 11.5px; font-weight: 500; color: var(--mute); }
      `}</style>

      {showImport && (
        <ImportModal
          type="ingredients"
          onClose={() => setShowImport(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['ingredients'] })}
        />
      )}
    </div>
  );
}
