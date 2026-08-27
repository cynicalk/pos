import { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Pencil, Trash2, Camera, X, ChevronDown, ChevronUp, Upload } from 'lucide-react';
import { useRecipes, useCreateRecipe, useUpdateRecipe, useDeleteRecipe, useTakeSnapshot } from '../hooks/useRecipes';
import { useIngredients } from '../hooks/useIngredients';
import { useMenuItems } from '../hooks/useMenu';
import Modal from '../components/Modal';
import ImportModal from '../components/ImportModal';
import SelectField from '../components/SelectField';
import { useCurrency } from '../context/CurrencyContext';
import { queryClient } from '../lib/queryClient';

const EMPTY_FORM = {
  name:          '',
  yieldQuantity: '1',
  yieldUnit:     'piece',
  prepTimeSec:   '',
  notes:         '',
  ingredients:   [],
  linkedMenuItemId: '',
};

function IngredientRow({ row, onUpdate, onRemove, allIngredients }) {
  return (
    <div className="flex items-center gap-2">
      <div style={{ flex: 1 }}>
        <SelectField
          value={row.ingredientId}
          onChange={(v) => onUpdate({ ...row, ingredientId: v })}
          options={[
            { value: '', label: 'Select ingredient…' },
            ...allIngredients.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` })),
          ]}
        />
      </div>
      <input
        type="number" step="0.0001" min="0.0001"
        value={row.quantity}
        onChange={(e) => onUpdate({ ...row, quantity: e.target.value })}
        placeholder="Qty" className="input w-24" required
      />
      <input
        value={row.unit}
        onChange={(e) => onUpdate({ ...row, unit: e.target.value })}
        placeholder="unit" className="input w-20" required
      />
      <button
        type="button" onClick={onRemove}
        className="shrink-0 rounded-md p-1 transition-colors"
        style={{ color: 'var(--mute)', background: 'transparent', border: 0, cursor: 'pointer' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--bad)'; e.currentTarget.style.background = 'var(--hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--mute)'; e.currentTarget.style.background = 'transparent'; }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function newIngredientRow() {
  return { _key: Math.random(), ingredientId: '', quantity: '', unit: '' };
}

export default function Recipes() {
  const { data: recipes = [], isLoading } = useRecipes();
  const { data: allIngredients = [] }     = useIngredients();
  const { data: menuItems = [] }          = useMenuItems();
  const { format, currency }              = useCurrency();

  const createRecipe   = useCreateRecipe();
  const updateRecipe   = useUpdateRecipe();
  const deleteRecipe   = useDeleteRecipe();
  const takeSnapshot   = useTakeSnapshot();

  const location = useLocation();
  const rowRefs  = useRef({});

  const [modal,         setModal]         = useState(null);
  const [showImport,    setShowImport]    = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expanded,      setExpanded]      = useState(() => {
    const id = location.state?.expandRecipeId;
    return id ? new Set([id]) : new Set();
  });
  const [form,          setForm]          = useState(EMPTY_FORM);

  // Scroll to the targeted recipe once rows are rendered
  useEffect(() => {
    const id = location.state?.expandRecipeId;
    if (!id) return;
    const el = rowRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.state?.expandRecipeId, recipes.length]);

  // Menu items without a recipe linked yet (for the "Link to menu item" select)
  const linkedIds  = useMemo(() => new Set(recipes.map((r) => r.linked_menu_item_id).filter(Boolean)), [recipes]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setModal('add');
  }

  function openEdit(recipe) {
    setForm({
      name:             recipe.name,
      yieldQuantity:    recipe.yield_quantity,
      yieldUnit:        recipe.yield_unit,
      prepTimeSec:      recipe.prep_time_sec ?? '',
      notes:            recipe.notes ?? '',
      ingredients:      (recipe.ingredients || []).map((i) => ({
        _key:         i.id,
        ingredientId: i.ingredient_id,
        quantity:     i.quantity,
        unit:         i.unit,
        costPerUnit:  i.cost_per_unit,
      })),
      linkedMenuItemId: '',
    });
    setModal(recipe);
  }

  function setIngRow(idx, row) {
    setForm((f) => ({ ...f, ingredients: f.ingredients.map((r, i) => i === idx ? row : r) }));
  }
  function removeIngRow(idx) {
    setForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Sync cost_per_unit from current ingredient data
    const ingredients = form.ingredients.map((row) => {
      const ing = allIngredients.find((i) => i.id === row.ingredientId);
      return {
        ingredientId: row.ingredientId,
        quantity:     parseFloat(row.quantity),
        unit:         row.unit,
        costPerUnit:  ing ? parseFloat(ing.latest_unit_cost) : parseFloat(row.costPerUnit) || 0,
      };
    });

    const payload = {
      name:          form.name,
      yieldQuantity: parseFloat(form.yieldQuantity) || 1,
      yieldUnit:     form.yieldUnit || 'piece',
      prepTimeSec:   parseInt(form.prepTimeSec, 10) || null,
      notes:         form.notes || null,
      ingredients,
    };

    let savedId;
    if (modal === 'add') {
      const r = await createRecipe.mutateAsync(payload);
      savedId = r.id;
    } else {
      await updateRecipe.mutateAsync({ id: modal.id, ...payload });
      savedId = modal.id;
    }

    // Link recipe to menu item if selected
    if (form.linkedMenuItemId) {
      try {
        const api = (await import('../api/client')).default;
        await api.patch(`/menu/${form.linkedMenuItemId}`, { recipeId: savedId });
      } catch { /* non-critical */ }
    }

    setModal(null);
  }

  async function handleDelete(id) {
    await deleteRecipe.mutateAsync(id);
    setConfirmDelete(null);
  }

  async function handleSnapshot(id) {
    await takeSnapshot.mutateAsync({ id });
    alert('Cost snapshot saved.');
  }

  function toggleExpand(id) {
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const isSaving = createRecipe.isPending || updateRecipe.isPending;

  return (
    <div className="space-y-5">

      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Recipes</h1>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>{recipes.length} recipes</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowImport(true)} className="btn">
            <Upload size={13} /> Import
          </button>
          <button onClick={openAdd} className="btn-primary">
            <Plus size={13} /> Add recipe
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</div>
      ) : recipes.length === 0 ? (
        <div className="py-16 text-center rounded-[8px]" style={{ fontSize: 13, color: 'var(--mute)', border: '1px dashed var(--line-2)' }}>
          No recipes yet — add one to start costing your menu
        </div>
      ) : (
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden' }}>
          {recipes.map((recipe, idx) => {
            const isOpen = expanded.has(recipe.id);
            const cost   = parseFloat(recipe.current_cost || 0);
            return (
              <div
                key={recipe.id}
                ref={(el) => { rowRefs.current[recipe.id] = el; }}
                style={{ borderBottom: idx < recipes.length - 1 ? '1px solid var(--line)' : 'none' }}
              >
                {/* Row header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  style={{ background: 'transparent', transition: 'background .1s' }}
                  onClick={() => toggleExpand(recipe.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ color: 'var(--mute)' }}>
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{recipe.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--mute)', marginTop: 1 }}>
                      yield {parseFloat(recipe.yield_quantity).toFixed(2)} {recipe.yield_unit}
                      {recipe.prep_time_sec ? ` · ${Math.ceil(recipe.prep_time_sec / 60)} min prep` : ''}
                      {' · '}{(recipe.ingredients || []).length} ingredients
                      {' · '}<span className="mono num" style={{ fontWeight: 600, color: 'var(--ink)' }}>{format(cost)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleSnapshot(recipe.id)} className="btn btn-sm btn-ghost" title="Save cost snapshot">
                      <Camera size={12} />
                    </button>
                    <button onClick={() => openEdit(recipe)} className="btn btn-sm btn-ghost" title="Edit">
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(recipe)}
                      className="btn btn-sm btn-ghost"
                      style={{ color: 'var(--bad)' }}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Expanded ingredient list */}
                {isOpen && (recipe.ingredients || []).length > 0 && (
                  <div style={{ background: 'var(--paper-2)', borderTop: '1px solid var(--line)', padding: '10px 16px 14px' }}>
                    <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 380 }}>
                      <thead>
                        <tr>
                          {['Ingredient', 'Qty', 'Unit', 'Cost/unit', 'Line cost'].map((h) => (
                            <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.07em', paddingBottom: 6 }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {recipe.ingredients.map((ing) => {
                          const lineCost = parseFloat(ing.quantity) * parseFloat(ing.cost_per_unit);
                          return (
                            <tr key={ing.id}>
                              <td style={{ fontSize: 12.5, color: 'var(--ink)', paddingBottom: 4 }}>{ing.ingredient_name}</td>
                              <td className="mono num" style={{ fontSize: 12, color: 'var(--mute)', paddingBottom: 4 }}>{parseFloat(ing.quantity)}</td>
                              <td style={{ fontSize: 12, color: 'var(--mute)', paddingBottom: 4 }}>{ing.unit}</td>
                              <td className="mono num" style={{ fontSize: 12, color: 'var(--mute)', paddingBottom: 4 }}>{format(ing.cost_per_unit)}</td>
                              <td className="mono num" style={{ fontSize: 12, color: 'var(--ink)', paddingBottom: 4 }}>{format(lineCost)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal !== null && (
        <Modal title={modal === 'add' ? 'Add Recipe' : `Edit: ${modal.name}`} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Recipe name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" required />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Yield qty</label>
                <input type="number" step="0.001" min="0.001" value={form.yieldQuantity} onChange={(e) => setForm((f) => ({ ...f, yieldQuantity: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Yield unit</label>
                <input value={form.yieldUnit} onChange={(e) => setForm((f) => ({ ...f, yieldUnit: e.target.value }))} className="input" placeholder="piece" />
              </div>
              <div>
                <label className="label">Prep (sec)</label>
                <input type="number" min="0" value={form.prepTimeSec} onChange={(e) => setForm((f) => ({ ...f, prepTimeSec: e.target.value }))} className="input" placeholder="—" />
              </div>
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea
                value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="input" rows={2} style={{ resize: 'vertical' }}
              />
            </div>

            {/* Link to menu item */}
            <div>
              <label className="label">Link to menu item (optional)</label>
              <SelectField
                value={form.linkedMenuItemId}
                onChange={(v) => setForm((f) => ({ ...f, linkedMenuItemId: v }))}
                options={[
                  { value: '', label: "— don't link —" },
                  ...menuItems
                    .filter((m) => !m.recipe_id || (modal !== 'add' && m.recipe_id === modal.id))
                    .map((m) => ({ value: m.id, label: m.name + (m.sku ? ` (${m.sku})` : '') })),
                ]}
              />
            </div>

            {/* Ingredients */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label" style={{ margin: 0 }}>Ingredients</label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, ingredients: [...f.ingredients, newIngredientRow()] }))}
                  style={{ fontSize: 12, color: 'var(--ink)', background: 'transparent', border: 0, cursor: 'pointer' }}
                >
                  + Add
                </button>
              </div>
              {form.ingredients.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--mute)', fontStyle: 'italic' }}>No ingredients added yet.</p>
              )}
              <div className="space-y-2">
                {form.ingredients.map((row, idx) => (
                  <IngredientRow
                    key={row._key}
                    row={row}
                    allIngredients={allIngredients}
                    onUpdate={(r) => setIngRow(idx, r)}
                    onRemove={() => removeIngRow(idx)}
                  />
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

      {confirmDelete && (
        <Modal title="Delete Recipe" onClose={() => setConfirmDelete(null)}>
          <p style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 20 }}>
            Delete <strong style={{ color: 'var(--ink)' }}>{confirmDelete.name}</strong>? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button
              onClick={() => handleDelete(confirmDelete.id)}
              disabled={deleteRecipe.isPending}
              className="btn-primary flex-1 justify-center"
              style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }}
            >
              {deleteRecipe.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      <style>{`.label { display:block; margin-bottom:4px; font-size:11.5px; font-weight:500; color:var(--mute); }`}</style>

      {showImport && (
        <ImportModal
          type="recipes"
          onClose={() => setShowImport(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['recipes'] })}
        />
      )}
    </div>
  );
}
