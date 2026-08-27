import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Tag, Search, Check, Copy, ToggleLeft, ToggleRight } from 'lucide-react';
import { useCoupons, useCreateCoupon, useUpdateCoupon, useDeleteCoupon } from '../hooks/useCoupons';
import { useCurrency } from '../context/CurrencyContext';
import Modal from '../components/Modal';
import SelectField from '../components/SelectField';
import { fmtDate } from '../utils/dateUtils';

const LABEL = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', display: 'block', marginBottom: 5 };
const INPUT = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--paper-2)', color: 'var(--fg)', fontSize: 14, boxSizing: 'border-box' };
const EMPTY = { code: '', description: '', discount_type: 'percent', discount_value: '', min_order_amount: '', max_uses: '', expires_at: '' };

function isExpired(iso) {
  return iso && new Date(iso) < new Date();
}

function CopyCode({ code }) {
  const [copied, setCopied] = useState(false);
  function copy(e) {
    e.stopPropagation();
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="mono" style={{ fontWeight: 700, fontSize: 15, letterSpacing: 1, color: 'var(--accent)' }}>{code}</span>
      <button
        onClick={copy}
        title="Copy code"
        style={{ width: 22, height: 22, borderRadius: 5, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: copied ? 'var(--ok)' : 'var(--mute)', opacity: copied ? 1 : 0.6 }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </div>
  );
}

function UsageBar({ uses, max }) {
  if (!max) return null;
  const pct = Math.min(Math.round((uses / max) * 100), 100);
  const full = pct >= 100;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--mute)', marginBottom: 3, fontWeight: 500 }}>
        <span>{uses} / {max} uses</span>
        <span style={{ color: full ? 'var(--bad)' : 'var(--mute)' }}>{pct}%{full ? ' — exhausted' : ''}</span>
      </div>
      <div style={{ height: 4, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: full ? 'var(--bad)' : 'var(--ok)', transition: 'width .3s' }} />
      </div>
    </div>
  );
}

export default function Coupons() {
  const { format } = useCurrency();
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch]             = useState('');
  const [formOpen, setFormOpen]         = useState(false);
  const [editing, setEditing]           = useState(null);
  const [form, setForm]                 = useState(EMPTY);
  const [formError, setFormError]       = useState('');
  const [confirmDel, setConfirmDel]     = useState(null);

  const { data: coupons = [], isLoading } = useCoupons({ includeInactive: showInactive });
  const createC = useCreateCoupon();
  const updateC = useUpdateCoupon();
  const deleteC = useDeleteCoupon();

  const filtered = useMemo(() => {
    if (!search.trim()) return coupons;
    const q = search.toLowerCase();
    return coupons.filter((c) =>
      c.code.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q),
    );
  }, [coupons, search]);

  const stats = useMemo(() => ({
    total:      coupons.length,
    active:     coupons.filter((c) => c.is_active && !isExpired(c.expires_at)).length,
    expired:    coupons.filter((c) => isExpired(c.expires_at)).length,
    totalUses:  coupons.reduce((s, c) => s + (c.uses_count || 0), 0),
  }), [coupons]);

  function openAdd() {
    setEditing(null); setForm(EMPTY); setFormError(''); setFormOpen(true);
  }

  function openEdit(c) {
    setEditing(c);
    setForm({
      code:             c.code,
      description:      c.description || '',
      discount_type:    c.discount_type,
      discount_value:   String(c.discount_value),
      min_order_amount: c.min_order_amount ? String(c.min_order_amount) : '',
      max_uses:         c.max_uses != null ? String(c.max_uses) : '',
      expires_at:       c.expires_at ? c.expires_at.slice(0, 10) : '',
    });
    setFormError(''); setFormOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault(); setFormError('');
    const payload = {
      code:             form.code.trim().toUpperCase(),
      description:      form.description || undefined,
      discount_type:    form.discount_type,
      discount_value:   parseFloat(form.discount_value),
      min_order_amount: form.min_order_amount ? parseFloat(form.min_order_amount) : undefined,
      max_uses:         form.max_uses ? parseInt(form.max_uses) : undefined,
      expires_at:       form.expires_at || undefined,
    };
    try {
      if (editing) await updateC.mutateAsync({ id: editing.id, ...payload });
      else         await createC.mutateAsync(payload);
      setFormOpen(false);
    } catch (err) {
      setFormError(err?.response?.data?.error || 'Failed to save coupon');
    }
  }

  async function handleToggleActive(c) {
    try { await updateC.mutateAsync({ id: c.id, is_active: !c.is_active }); } catch { /* ignore */ }
  }

  async function handleDelete() {
    try { await deleteC.mutateAsync(confirmDel.id); } catch { /* ignore */ }
    setConfirmDel(null);
  }

  return (
    <div className="space-y-5">

      {/* Page head */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-[22px] font-semibold m-0" style={{ letterSpacing: '-.015em', color: 'var(--ink)' }}>
            Coupons
          </h1>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
            {isLoading ? '…' : `${stats.active} active · ${stats.total} total`}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto" style={{ flexShrink: 0 }}>
          <button
            onClick={() => setShowInactive((v) => !v)}
            className="btn shrink-0"
            style={{ color: showInactive ? 'var(--ink)' : 'var(--mute)' }}
          >
            {showInactive ? 'Hide inactive' : 'Show all'}
          </button>
          <button onClick={openAdd} className="btn-primary shrink-0">
            <Plus size={13} /> New Coupon
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 10 }}>
        {[
          { label: 'Active',      value: isLoading ? '…' : stats.active      },
          { label: 'Total',       value: isLoading ? '…' : stats.total        },
          { label: 'Expired',     value: isLoading ? '…' : stats.expired      },
          { label: 'Total Uses',  value: isLoading ? '…' : stats.totalUses    },
        ].map(({ label, value }) => (
          <div key={label} className="strip-tile" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)' }}>{label}</span>
            <span className="mono num" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--ink)' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 180, background: 'var(--paper-2)', borderRadius: 999, padding: '6px 12px' }}>
          <Search size={14} style={{ color: 'var(--mute)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code or description…"
            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'var(--ink)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--mute)', lineHeight: 1, padding: 0 }}>×</button>
          )}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <p style={{ color: 'var(--mute)', textAlign: 'center', paddingTop: 40 }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--mute)' }}>
          <Tag size={40} strokeWidth={1.2} style={{ margin: '0 auto' }} />
          <p style={{ marginTop: 12, fontSize: 13 }}>
            {search ? 'No coupons match your search.' : 'No coupons yet. Create your first one.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((c) => {
            const expired = isExpired(c.expires_at);
            return (
              <div key={c.id} style={{
                background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 12,
                padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14,
                opacity: c.is_active && !expired ? 1 : 0.6,
              }}>
                {/* Icon */}
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--paper-2)', display: 'grid', placeItems: 'center', color: 'var(--mute)', flexShrink: 0, marginTop: 1 }}>
                  <Tag size={16} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CopyCode code={c.code} />
                    {!c.is_active && (
                      <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--paper-2)', color: 'var(--mute)', borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Inactive</span>
                    )}
                    {expired && (
                      <span style={{ fontSize: 10, fontWeight: 600, background: 'rgba(179,55,43,0.1)', color: 'var(--bad)', borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Expired</span>
                    )}
                  </div>

                  {c.description && (
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--mute)' }}>{c.description}</p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ marginTop: 6, fontSize: 12, color: 'var(--mute)' }}>
                    <span style={{ color: 'var(--ok)', fontWeight: 600 }}>
                      {c.discount_type === 'percent' ? `${c.discount_value}% off` : `${format(c.discount_value)} off`}
                    </span>
                    {parseFloat(c.min_order_amount) > 0 && (
                      <span>Min order: {format(c.min_order_amount)}</span>
                    )}
                    {c.expires_at && !expired && <span>Expires {fmtDate(c.expires_at)}</span>}
                    {expired && <span style={{ color: 'var(--bad)' }}>Expired {fmtDate(c.expires_at)}</span>}
                    {c.max_uses == null && c.uses_count > 0 && <span>{c.uses_count} uses</span>}
                  </div>

                  <UsageBar uses={c.uses_count || 0} max={c.max_uses} />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                  <button
                    onClick={() => handleToggleActive(c)}
                    title={c.is_active ? 'Deactivate' : 'Activate'}
                    style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'transparent', border: '1px solid var(--line-2)', cursor: 'pointer', color: c.is_active ? 'var(--ok)' : 'var(--mute)' }}
                  >
                    {c.is_active ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
                  </button>
                  <button
                    onClick={() => openEdit(c)}
                    style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'transparent', border: '1px solid var(--line-2)', cursor: 'pointer', color: 'var(--mute)' }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmDel(c)}
                    style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'transparent', border: '1px solid var(--line-2)', cursor: 'pointer', color: 'var(--bad)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length < coupons.length && (
            <p style={{ fontSize: 12, color: 'var(--mute)', textAlign: 'center', paddingTop: 4 }}>
              Showing {filtered.length} of {coupons.length} coupons
            </p>
          )}
        </div>
      )}

      {/* Form modal */}
      {formOpen && (
        <Modal onClose={() => setFormOpen(false)} title={editing ? 'Edit Coupon' : 'New Coupon'}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label style={LABEL}>Code</label>
                <input style={{ ...INPUT, textTransform: 'uppercase', letterSpacing: 1 }} placeholder="e.g. SAVE20"
                  value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} required />
              </div>
              <div>
                <label style={LABEL}>Discount Type</label>
                <SelectField
                  value={form.discount_type}
                  onChange={(v) => setForm((f) => ({ ...f, discount_type: v }))}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--paper-2)', color: 'var(--fg)', fontSize: 14 }}
                  options={[
                    { value: 'percent', label: 'Percentage (%)' },
                    { value: 'flat',    label: 'Flat amount' },
                  ]}
                />
              </div>
              <div>
                <label style={LABEL}>Discount Value</label>
                <input style={INPUT} type="number" min="0.01" step="0.01"
                  placeholder={form.discount_type === 'percent' ? '0–100' : '0.00'}
                  value={form.discount_value} onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))} required />
              </div>
              <div>
                <label style={LABEL}>Min Order Amount</label>
                <input style={INPUT} type="number" min="0" step="0.01" placeholder="0 = no minimum"
                  value={form.min_order_amount} onChange={(e) => setForm((f) => ({ ...f, min_order_amount: e.target.value }))} />
              </div>
              <div>
                <label style={LABEL}>Max Uses (optional)</label>
                <input style={INPUT} type="number" min="1" step="1" placeholder="Unlimited"
                  value={form.max_uses} onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value }))} />
              </div>
              <div>
                <label style={LABEL}>Expires At (optional)</label>
                <input style={INPUT} type="date"
                  value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))} />
              </div>
            </div>
            <div>
              <label style={LABEL}>Description (optional)</label>
              <input style={INPUT} placeholder="Internal note about this coupon"
                value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            {formError && <p style={{ color: 'var(--bad)', fontSize: 13, margin: 0 }}>{formError}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setFormOpen(false)} className="btn">Cancel</button>
              <button type="submit" className="btn-primary">
                {editing ? 'Save Changes' : 'Create Coupon'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <Modal onClose={() => setConfirmDel(null)} title="Delete Coupon">
          <p style={{ margin: '0 0 20px', fontSize: 14 }}>
            Delete coupon <strong>{confirmDel.code}</strong>? This cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmDel(null)} className="btn">Cancel</button>
            <button onClick={handleDelete} disabled={deleteC.isPending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px', height: 30, borderRadius: 8, border: 'none', background: 'var(--bad)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              {deleteC.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
