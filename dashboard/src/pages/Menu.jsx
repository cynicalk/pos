import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, X, SlidersHorizontal, Eye, EyeOff, BookOpen, Upload } from 'lucide-react';
import {
  useMenuItems,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
} from '../hooks/useMenu';
import { useRecipes } from '../hooks/useRecipes';
import { useAuth } from '../hooks/useAuth';
import Modal from '../components/Modal';
import ImportModal from '../components/ImportModal';
import SelectField from '../components/SelectField';
import { useCurrency } from '../context/CurrencyContext';
import { queryClient } from '../lib/queryClient';

const FORM_CATEGORIES = ['starters', 'mains', 'desserts', 'drinks', 'sides', 'other'];
const EMPTY_FORM = { name: '', price: '', category: 'mains', available: true, sku: '', recipeId: '', description: '', customizationGroups: [] };

function newGroup() {
  return { name: '', type: 'single', required: false, options: [{ label: '', priceAdd: 0 }] };
}

function CustomizationGroupsEditor({ groups, onChange }) {
  const setGroup = (i, patch) =>
    onChange(groups.map((g, idx) => idx === i ? { ...g, ...patch } : g));

  const setOption = (gi, oi, patch) =>
    setGroup(gi, {
      options: groups[gi].options.map((o, idx) => idx === oi ? { ...o, ...patch } : o),
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal size={11} style={{ color: 'var(--mute)' }} />
          <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)' }}>
            Customizations
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...groups, newGroup()])}
          style={{ fontSize: 12, color: 'var(--ink)', border: 0, background: 'transparent', cursor: 'pointer' }}
        >
          + Add group
        </button>
      </div>

      {groups.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--mute)', fontStyle: 'italic' }}>
          No customizations — customers will only see a notes field.
        </p>
      )}

      {groups.map((group, gi) => (
        <div key={gi} className="space-y-2 rounded-[6px] p-3" style={{ border: '1px solid var(--line-2)', background: 'var(--paper-2)' }}>
          <div className="flex items-center gap-2">
            <input
              value={group.name}
              onChange={(e) => setGroup(gi, { name: e.target.value })}
              placeholder="Group name (e.g. Spice Level)"
              className="input flex-1"
            />
            <button
              type="button"
              onClick={() => onChange(groups.filter((_, idx) => idx !== gi))}
              className="shrink-0 rounded-md p-1 transition-colors"
              style={{ color: 'var(--mute)', border: 0, background: 'transparent', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--bad)'; e.currentTarget.style.background = 'var(--hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--mute)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex rounded-[6px] overflow-hidden" style={{ border: '1px solid var(--line-2)' }}>
              {['single', 'multi'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setGroup(gi, { type: t })}
                  style={{
                    fontSize: 11.5,
                    padding: '3px 10px',
                    background: group.type === t ? 'var(--ink)' : 'transparent',
                    color: group.type === t ? 'var(--accent-on)' : 'var(--mute)',
                    border: 0,
                    cursor: 'pointer',
                  }}
                >
                  {t === 'single' ? 'Pick one' : 'Pick many'}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer" style={{ fontSize: 12, color: 'var(--mute)' }}>
              <input
                type="checkbox"
                checked={group.required}
                onChange={(e) => setGroup(gi, { required: e.target.checked })}
                className="rounded"
              />
              Required
            </label>
          </div>

          <div className="space-y-1.5">
            {group.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  value={opt.label}
                  onChange={(e) => setOption(gi, oi, { label: e.target.value })}
                  placeholder="Option label"
                  className="input flex-1"
                />
                <div className="relative shrink-0 w-24">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2" style={{ fontSize: 11, color: 'var(--mute)' }}>+</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={opt.priceAdd || ''}
                    onChange={(e) => setOption(gi, oi, { priceAdd: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="input pl-5 w-full"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setGroup(gi, { options: group.options.filter((_, idx) => idx !== oi) })}
                  disabled={group.options.length <= 1}
                  className="shrink-0 rounded-md p-1 transition-colors disabled:opacity-30"
                  style={{ color: 'var(--mute)', border: 0, background: 'transparent', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--bad)'; e.currentTarget.style.background = 'var(--hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--mute)'; e.currentTarget.style.background = 'transparent'; }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setGroup(gi, { options: [...group.options, { label: '', priceAdd: 0 }] })}
              style={{ fontSize: 12, color: 'var(--mute)', border: 0, background: 'transparent', cursor: 'pointer' }}
            >
              + Add option
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Menu() {
  const { data: items = [], isLoading } = useMenuItems();
  const { data: recipes = [] } = useRecipes();
  const { isAdmin }  = useAuth();
  const navigate     = useNavigate();
  const { format, currency } = useCurrency();
  const createItem = useCreateMenuItem();
  const updateItem = useUpdateMenuItem();
  const deleteItem = useDeleteMenuItem();

  const [search,        setSearch]        = useState('');
  const [category,      setCategory]      = useState('all');
  const [modal,         setModal]         = useState(null);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [recipePreview, setRecipePreview] = useState(null);
  const [showImport,    setShowImport]    = useState(false);

  // Derive categories dynamically from items, preserving natural order
  const categories = useMemo(() => {
    const seen = new Set();
    const ordered = [];
    for (const item of items) {
      const cat = item.category?.toLowerCase() || 'other';
      if (!seen.has(cat)) { seen.add(cat); ordered.push(cat); }
    }
    return ordered;
  }, [items]);

  // Count per category (for tab badges)
  const countByCategory = useMemo(() => {
    const map = { all: items.length };
    for (const item of items) {
      const cat = item.category?.toLowerCase() || 'other';
      map[cat] = (map[cat] || 0) + 1;
    }
    return map;
  }, [items]);

  const filtered = items.filter((item) => {
    const matchCat    = category === 'all' || (item.category?.toLowerCase() || 'other') === category;
    const q           = search.toLowerCase();
    const matchSearch = !q || item.name.toLowerCase().includes(q) || item.sku?.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  function openAdd()   { setForm(EMPTY_FORM); setModal('add'); }
  function openEdit(item) {
    setForm({
      name:                item.name,
      price:               parseFloat(item.price).toFixed(currency.decimals),
      category:            item.category || 'mains',
      available:           item.available,
      sku:                 item.sku || '',
      recipeId:            item.recipe_id || '',
      description:         item.description || '',
      customizationGroups: item.customization_groups || [],
    });
    setModal(item);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = { ...form, price: parseFloat(form.price), sku: form.sku.trim() || undefined, recipeId: form.recipeId || undefined, description: form.description.trim() || undefined };
    if (modal === 'add') { await createItem.mutateAsync(payload); }
    else                 { await updateItem.mutateAsync({ id: modal.id, ...payload }); }
    setModal(null);
  }

  async function handleDelete(id) {
    await deleteItem.mutateAsync(id);
    setConfirmDelete(null);
  }

  const isSaving = createItem.isPending || updateItem.isPending;

  return (
    <div className="space-y-5">

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Menu</h1>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>{items.length} items</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Search */}
          <div
            className="flex items-center gap-1.5 rounded-[6px] px-2.5"
            style={{ border: '1px solid var(--line-2)', height: 32, width: 210, background: 'var(--paper)' }}
          >
            <Search size={12} style={{ color: 'var(--mute)', flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              style={{ flex: 1, border: 0, background: 'transparent', outline: 0, fontSize: 12.5, color: 'var(--ink)', fontFamily: 'inherit' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="rounded p-0.5 transition-colors"
                style={{ color: 'var(--mute)', background: 'transparent', border: 0, cursor: 'pointer', display: 'flex' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.background = 'var(--hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--mute)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <X size={11} />
              </button>
            )}
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowImport(true)} className="btn">
                <Upload size={13} /> Import
              </button>
              <button onClick={openAdd} className="btn-primary">
                <Plus size={13} /> Add item
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Category tabs */}
      {!isLoading && items.length > 0 && (
        <div className="flex gap-0 overflow-x-auto" style={{ borderBottom: '1px solid var(--line)' }}>
          {['all', ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className="flex items-center gap-1.5 shrink-0 capitalize transition-colors"
              style={{
                height: 34,
                padding: '0 14px',
                marginBottom: -1,
                background: 'transparent',
                border: 0,
                borderBottom: category === c ? '2px solid var(--ink)' : '2px solid transparent',
                color: category === c ? 'var(--ink)' : 'var(--mute)',
                fontWeight: category === c ? 600 : 400,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {c}
              <span
                className="mono num"
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  padding: '1px 5px',
                  borderRadius: 10,
                  background: category === c ? 'var(--ink)' : 'var(--paper-2)',
                  color: category === c ? 'var(--accent-on)' : 'var(--mute)',
                }}
              >
                {countByCategory[c] ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Items list */}
      {isLoading ? (
        <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading menu…</div>
      ) : items.length === 0 ? (
        <div
          className="py-16 text-center rounded-[8px]"
          style={{ fontSize: 13, color: 'var(--mute)', border: '1px dashed var(--line-2)' }}
        >
          No menu items yet{isAdmin ? ' — add one to get started' : ''}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>
          No items match "{search}"
        </div>
      ) : (
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
          <div className={isAdmin ? 'menu-table-admin' : 'menu-table-nonadmin'}>

          {/* Column header */}
          <div
            className={`grid items-center px-4 py-2${isAdmin ? ' menu-row-admin' : ''}`}
            style={{
              gridTemplateColumns: isAdmin ? '1fr 90px 90px 168px' : '1fr 90px 90px',
              fontSize: 10, fontWeight: 600, color: 'var(--mute)',
              textTransform: 'uppercase', letterSpacing: '.07em',
              background: 'var(--paper-2)',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <span>Item</span>
            <span className="mono" style={{ paddingLeft: 14 }}>Price</span>
            <span>Status</span>
            {isAdmin && <span className="menu-action-text" style={{ textAlign: 'right' }}>Actions</span>}
          </div>

          {filtered.map((item) => (
            <div
              key={item.id}
              className={`grid items-center px-4${isAdmin ? ' menu-row-admin' : ''}`}
              style={{
                gridTemplateColumns: isAdmin ? '1fr 90px 90px 168px' : '1fr 90px 90px',
                minHeight: 46,
                borderBottom: '1px solid var(--line)',
                background: 'transparent',
                transition: 'background .1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Name + tags */}
              <div className="min-w-0 py-2">
                <span className="block truncate" style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                  {item.name}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {item.category && (
                    <span className="capitalize" style={{ fontSize: 10.5, color: 'var(--mute)' }}>
                      {item.category}
                    </span>
                  )}
                  {item.sku && (
                    <span
                      className="mono shrink-0 rounded px-1.5 py-0.5"
                      style={{ fontSize: 10, background: 'var(--paper-2)', color: 'var(--mute)', border: '1px solid var(--line)' }}
                    >
                      {item.sku}
                    </span>
                  )}
                  {item.recipe_id && (
                    <button
                      type="button"
                      onClick={() => setRecipePreview(recipes.find(r => r.id === item.recipe_id) || null)}
                      title="View linked recipe"
                      style={{
                        color: '#16a34a', display: 'inline-flex', alignItems: 'center',
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      }}
                    >
                      <BookOpen size={11} />
                    </button>
                  )}
                  {item.customization_groups?.length > 0 && (
                    <span
                      className="inline-flex items-center gap-1 shrink-0"
                      style={{ fontSize: 10, color: 'var(--mute)' }}
                    >
                      <SlidersHorizontal size={9} />
                      {item.customization_groups.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Price */}
              <span className="mono num" style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', paddingLeft: 14 }}>
                {format(item.price)}
              </span>

              {/* Status */}
              <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--mute)' }}>
                <span
                  style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: item.available ? 'var(--ok)' : 'var(--mute-2)',
                  }}
                />
                {item.available ? 'Available' : 'Off menu'}
              </span>

              {/* Actions */}
              {isAdmin && (
                <div className="flex items-center gap-1 justify-end">
                  <button
                    onClick={() => openEdit(item)}
                    className="btn btn-sm btn-ghost"
                    style={{ gap: 4, fontSize: 12 }}
                    title="Edit"
                  >
                    <Pencil size={12} />
                    <span className="menu-action-text">Edit</span>
                  </button>
                  <button
                    onClick={() => updateItem.mutate({ id: item.id, available: !item.available })}
                    className="btn btn-sm btn-ghost"
                    style={{ gap: 4, fontSize: 12 }}
                    title={item.available ? 'Take off menu' : 'Make available'}
                  >
                    {item.available ? <EyeOff size={12} /> : <Eye size={12} />}
                    <span className="menu-action-text">{item.available ? 'Disable' : 'Enable'}</span>
                  </button>
                  <button
                    onClick={() => setConfirmDelete(item)}
                    className="btn btn-sm btn-ghost"
                    style={{ color: 'var(--bad)' }}
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}

          </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal !== null && (
        <Modal title={modal === 'add' ? 'Add Menu Item' : 'Edit Menu Item'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input"
                placeholder="e.g. Grilled Salmon"
                required
              />
            </div>

            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>
                Description <span style={{ fontWeight: 400, color: 'var(--mute-2)' }}>(optional — shown to customers)</span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="input"
                placeholder="e.g. Pan-seared salmon fillet with lemon butter sauce and seasonal vegetables."
                rows={2}
                style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
            </div>

            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>
                SKU <span style={{ fontWeight: 400, color: 'var(--mute-2)' }}>(optional)</span>
              </label>
              <input
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                className="input mono"
                placeholder="e.g. SALMN-001"
              />
            </div>

            <div>
              <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>
                Recipe <span style={{ fontWeight: 400, color: 'var(--mute-2)' }}>(for inventory tracking)</span>
              </label>
              <SelectField
                value={form.recipeId}
                onChange={(v) => setForm((f) => ({ ...f, recipeId: v }))}
                options={[
                  { value: '', label: 'None — no inventory tracking' },
                  ...recipes.map((r) => ({ value: r.id, label: r.name })),
                ]}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>
                  Price ({currency.code})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  className="input"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Category</label>
                <SelectField
                  value={form.category}
                  onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                  options={FORM_CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 13, color: 'var(--ink)' }}>
              <input
                type="checkbox"
                checked={form.available}
                onChange={(e) => setForm((f) => ({ ...f, available: e.target.checked }))}
                className="rounded"
              />
              Available to order
            </label>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <CustomizationGroupsEditor
                groups={form.customizationGroups}
                onChange={(groups) => setForm((f) => ({ ...f, customizationGroups: groups }))}
              />
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

      {/* Recipe Preview Modal */}
      {recipePreview && (
        <Modal title="Linked Recipe" onClose={() => setRecipePreview(null)}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{recipePreview.name}</span>
            </div>
            <div className="flex gap-4" style={{ fontSize: 12.5, color: 'var(--mute)' }}>
              {recipePreview.yield_quantity && (
                <span>Yield: <strong style={{ color: 'var(--ink)' }}>{recipePreview.yield_quantity} {recipePreview.yield_unit}</strong></span>
              )}
              {recipePreview.prep_time_sec && (
                <span>Prep: <strong style={{ color: 'var(--ink)' }}>{Math.round(recipePreview.prep_time_sec / 60)} min</strong></span>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2" style={{ marginTop: 20 }}>
            {isAdmin && (
              <button
                onClick={() => { setRecipePreview(null); navigate('/recipes', { state: { expandRecipeId: recipePreview.id } }); }}
                className="btn-primary"
              >
                <BookOpen size={13} /> View Recipe
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <Modal title="Delete Item" onClose={() => setConfirmDelete(null)}>
          <p style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 20 }}>
            Remove <strong style={{ color: 'var(--ink)' }}>{confirmDelete.name}</strong> from the menu? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button
              onClick={() => handleDelete(confirmDelete.id)}
              disabled={deleteItem.isPending}
              className="btn-primary flex-1 justify-center disabled:opacity-50"
              style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }}
            >
              {deleteItem.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      <style>{`
        .menu-action-text { display: inline; }
        .menu-table-admin    { min-width: 500px; }
        .menu-table-nonadmin { min-width: 300px; }
        @media (max-width: 640px) {
          .menu-action-text { display: none; }
          .menu-row-admin { grid-template-columns: 1fr 90px 90px 92px !important; }
          .menu-table-admin { min-width: 380px; }
        }
      `}</style>

      {showImport && (
        <ImportModal
          type="menu"
          onClose={() => setShowImport(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['menu'] })}
        />
      )}
    </div>
  );
}
