import { useState } from 'react';
import { Plus, Pencil, X } from 'lucide-react';
import { useCombos, useCreateCombo, useUpdateCombo } from '../hooks/useCombos';
import { useMenuItems } from '../hooks/useMenu';
import Modal from '../components/Modal';
import SelectField from '../components/SelectField';
import { useCurrency } from '../context/CurrencyContext';

const EMPTY_FORM = { name: '', sku: '', price: '', isActive: true, validFrom: '', validUntil: '', items: [] };

function newItem() {
  return { _key: Math.random(), menuItemId: '', quantity: 1 };
}

export default function Combos() {
  const { data: combos = [], isLoading } = useCombos();
  const { data: menuItems = [] }         = useMenuItems();
  const { format, currency }             = useCurrency();

  const createCombo = useCreateCombo();
  const updateCombo = useUpdateCombo();

  const [modal, setModal] = useState(null);
  const [form,  setForm]  = useState(EMPTY_FORM);

  function openAdd() {
    setForm(EMPTY_FORM);
    setModal('add');
  }

  function openEdit(combo) {
    setForm({
      name:       combo.name,
      sku:        combo.sku || '',
      price:      parseFloat(combo.price).toFixed(currency.decimals),
      isActive:   combo.is_active,
      validFrom:  combo.valid_from  ? combo.valid_from.slice(0, 10)  : '',
      validUntil: combo.valid_until ? combo.valid_until.slice(0, 10) : '',
      items:      (combo.items || []).map((ci) => ({
        _key:       ci.id,
        menuItemId: ci.menu_item_id,
        quantity:   ci.quantity,
      })),
    });
    setModal(combo);
  }

  function setItemRow(idx, patch) {
    setForm((f) => ({ ...f, items: f.items.map((r, i) => i === idx ? { ...r, ...patch } : r) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      name:       form.name,
      sku:        form.sku.trim() || undefined,
      price:      parseFloat(form.price),
      isActive:   form.isActive,
      validFrom:  form.validFrom  || null,
      validUntil: form.validUntil || null,
      items:      form.items.map((r, i) => ({ menuItemId: r.menuItemId, quantity: parseInt(r.quantity, 10) || 1, sortOrder: i })),
    };
    if (modal === 'add') {
      await createCombo.mutateAsync(payload);
    } else {
      await updateCombo.mutateAsync({ id: modal.id, ...payload });
    }
    setModal(null);
  }

  const isSaving = createCombo.isPending || updateCombo.isPending;

  // Compute bundle saving per combo
  function saving(combo) {
    const sum = (combo.items || []).reduce((s, ci) => s + parseFloat(ci.item_price || 0) * ci.quantity, 0);
    const diff = sum - parseFloat(combo.price);
    return diff > 0 ? diff : 0;
  }

  return (
    <div className="space-y-5">

      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Combo Meals</h1>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>{combos.length} combos</p>
        </div>
        <div className="ml-auto">
          <button onClick={openAdd} className="btn-primary"><Plus size={13} /> Add combo</button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</div>
      ) : combos.length === 0 ? (
        <div className="py-16 text-center rounded-[8px]" style={{ fontSize: 13, color: 'var(--mute)', border: '1px dashed var(--line-2)' }}>
          No combo meals yet
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {combos.map((combo) => {
            const save = saving(combo);
            return (
              <div key={combo.id} style={{ border: '1px solid var(--line-2)', borderRadius: 8, padding: '14px 16px', background: combo.is_active ? 'var(--paper)' : 'var(--paper-2)' }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: combo.is_active ? 'var(--ink)' : 'var(--mute)' }}>
                      {combo.name}
                    </p>
                    {combo.sku && (
                      <span className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>{combo.sku}</span>
                    )}
                  </div>
                  <button onClick={() => openEdit(combo)} className="btn btn-sm btn-ghost shrink-0"><Pencil size={12} /></button>
                </div>

                <div className="space-y-1 mb-3">
                  {(combo.items || []).map((ci) => (
                    <div key={ci.id} className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--mute)' }}>
                      <span style={{ width: 16, textAlign: 'right', color: 'var(--mute-2)', fontWeight: 500 }}>{ci.quantity}×</span>
                      <span style={{ color: 'var(--ink)' }}>{ci.item_name}</span>
                      <span className="ml-auto mono num">{format(ci.item_price)}</span>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12, color: 'var(--mute)' }}>Bundle price</span>
                    <span className="mono num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{format(combo.price)}</span>
                  </div>
                  {save > 0 && (
                    <div className="flex items-center justify-between mt-1">
                      <span style={{ fontSize: 11, color: 'var(--ok)' }}>Customer saves</span>
                      <span className="mono num" style={{ fontSize: 11, color: 'var(--ok)', fontWeight: 500 }}>{format(save)}</span>
                    </div>
                  )}
                  {(combo.valid_from || combo.valid_until) && (
                    <p style={{ fontSize: 10.5, color: 'var(--mute)', marginTop: 6 }}>
                      Valid: {combo.valid_from ? combo.valid_from.slice(0, 10) : '∞'} → {combo.valid_until ? combo.valid_until.slice(0, 10) : '∞'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal !== null && (
        <Modal title={modal === 'add' ? 'Add Combo Meal' : `Edit: ${modal.name}`} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">SKU (optional)</label>
                <input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} className="input mono" placeholder="COMBO-001" />
              </div>
              <div>
                <label className="label">Bundle price ({currency.code})</label>
                <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="input" required />
              </div>
              <div>
                <label className="label">Valid from</label>
                <input type="date" value={form.validFrom} onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Valid until</label>
                <input type="date" value={form.validUntil} onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))} className="input" />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 13, color: 'var(--ink)' }}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded" />
              Active
            </label>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label" style={{ margin: 0 }}>Menu items in bundle</label>
                <button type="button" onClick={() => setForm((f) => ({ ...f, items: [...f.items, newItem()] }))}
                  style={{ fontSize: 12, color: 'var(--ink)', background: 'transparent', border: 0, cursor: 'pointer' }}>
                  + Add
                </button>
              </div>
              {form.items.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--mute)', fontStyle: 'italic' }}>No items added yet.</p>
              )}
              <div className="space-y-2">
                {form.items.map((row, idx) => (
                  <div key={row._key} className="flex items-center gap-2">
                    <div style={{ flex: 1 }}>
                      <SelectField
                        value={row.menuItemId}
                        onChange={(v) => setItemRow(idx, { menuItemId: v })}
                        options={[
                          { value: '', label: 'Select item…' },
                          ...menuItems.map((m) => ({ value: m.id, label: m.name })),
                        ]}
                      />
                    </div>
                    <input type="number" min="1" value={row.quantity} onChange={(e) => setItemRow(idx, { quantity: e.target.value })} className="input w-16" />
                    <button type="button" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                      className="shrink-0 rounded p-1" style={{ color: 'var(--mute)', background: 'transparent', border: 0, cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--bad)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mute)')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
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

      <style>{`.label { display:block; margin-bottom:4px; font-size:11.5px; font-weight:500; color:var(--mute); }`}</style>
    </div>
  );
}
