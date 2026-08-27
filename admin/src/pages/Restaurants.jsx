import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ArrowRight, Building2, Users, PowerOff, Power, LayoutGrid } from 'lucide-react';
import { useRestaurants, useCreateRestaurant, useDeleteRestaurant, useSetRestaurantStatus } from '../hooks/useAdmin';

function ConfirmDeleteModal({ restaurant, onConfirm, onClose, isPending }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,10,10,.45)' }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--paper)', border: '1px solid var(--line-2)',
          borderRadius: 10, padding: 24, maxWidth: 380, width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Delete restaurant?</p>
        <p style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 6, lineHeight: 1.55 }}>
          <strong style={{ color: 'var(--ink)' }}>{restaurant.name}</strong> and all its users, menu, tables, orders, and settings will be permanently deleted.
        </p>
        <p style={{ fontSize: 12, color: 'var(--bad)', marginBottom: 20 }}>This action cannot be undone.</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 rounded-[6px] px-4 py-2 disabled:opacity-60"
            style={{ fontSize: 13, fontWeight: 500, background: 'var(--bad)', color: '#fff', border: 0, cursor: 'pointer' }}
          >
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ConfirmSuspendModal({ restaurant, onConfirm, onClose, isPending }) {
  const suspending = restaurant.is_active;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,10,10,.45)' }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--paper)', border: '1px solid var(--line-2)',
          borderRadius: 10, padding: 24, maxWidth: 380, width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
          {suspending ? 'Suspend restaurant?' : 'Reactivate restaurant?'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 20, lineHeight: 1.55 }}>
          {suspending
            ? <><strong style={{ color: 'var(--ink)' }}>{restaurant.name}</strong> will be suspended. Staff can still sign in but the restaurant will be marked as inactive.</>
            : <><strong style={{ color: 'var(--ink)' }}>{restaurant.name}</strong> will be reactivated and marked as active.</>}
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 rounded-[6px] px-4 py-2 disabled:opacity-60"
            style={{
              fontSize: 13, fontWeight: 500, border: 0, cursor: 'pointer', color: '#fff',
              background: suspending ? 'var(--warn)' : 'var(--ok)',
            }}
          >
            {isPending ? '…' : suspending ? 'Suspend' : 'Reactivate'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatusBadge({ isActive }) {
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{
        fontSize: 11, fontWeight: 500, borderRadius: 4, padding: '2px 7px',
        background: isActive ? 'rgba(41,163,97,.10)' : 'rgba(179,120,31,.10)',
        color: isActive ? 'var(--ok)' : 'var(--warn)',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {isActive ? 'Active' : 'Suspended'}
    </span>
  );
}

export default function Restaurants() {
  const navigate = useNavigate();
  const { data: restaurants = [], isLoading } = useRestaurants();
  const createRestaurant  = useCreateRestaurant();
  const deleteRestaurant  = useDeleteRestaurant();
  const setStatus         = useSetRestaurantStatus();

  const [showForm,         setShowForm]         = useState(false);
  const [newName,          setNewName]          = useState('');
  const [createError,      setCreateError]      = useState('');
  const [confirmDelete,    setConfirmDelete]    = useState(null);
  const [confirmSuspend,   setConfirmSuspend]   = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError('');
    try {
      await createRestaurant.mutateAsync(newName);
      setNewName('');
      setShowForm(false);
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create restaurant.');
    }
  }

  async function handleDelete() {
    try {
      await deleteRestaurant.mutateAsync(confirmDelete.id);
      setConfirmDelete(null);
    } catch (err) {
      setConfirmDelete(null);
    }
  }

  async function handleToggleStatus() {
    try {
      await setStatus.mutateAsync({ id: confirmSuspend.id, is_active: !confirmSuspend.is_active });
      setConfirmSuspend(null);
    } catch {
      setConfirmSuspend(null);
    }
  }

  const totalUsers   = restaurants.reduce((s, r) => s + (r.user_count || 0), 0);
  const totalTables  = restaurants.reduce((s, r) => s + (r.table_count || 0), 0);
  const activeCount  = restaurants.filter((r) => r.is_active !== false).length;
  const suspended    = restaurants.length - activeCount;

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>Restaurants</h1>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
            {restaurants.length} restaurant{restaurants.length !== 1 ? 's' : ''} · {totalUsers} total users · {totalTables} tables
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary flex items-center gap-2">
          <Plus size={14} />
          New restaurant
        </button>
      </div>

      {/* KPI cards */}
      {restaurants.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { Icon: Building2,  label: 'Total',      value: restaurants.length, color: 'var(--ink)' },
            { Icon: Power,      label: 'Active',     value: activeCount,        color: 'var(--ok)' },
            { Icon: Users,      label: 'All users',  value: totalUsers,         color: 'var(--info)' },
            { Icon: LayoutGrid, label: 'All tables', value: totalTables,        color: 'var(--warn)' },
          ].map(({ Icon, label, value, color }) => (
            <div
              key={label}
              style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)', padding: '14px 18px' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={13} style={{ color }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</span>
              </div>
              <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{value}</p>
              {label === 'Active' && suspended > 0 && (
                <p style={{ fontSize: 11, color: 'var(--warn)', marginTop: 1 }}>{suspended} suspended</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="flex gap-3 items-start p-4 rounded-[8px]"
          style={{ border: '1px solid var(--line-2)', background: 'var(--paper-2)' }}
        >
          <div className="flex-1">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="input"
              placeholder="Restaurant name"
              autoFocus
              required
            />
            {createError && <p style={{ marginTop: 4, fontSize: 12, color: 'var(--bad)' }}>{createError}</p>}
          </div>
          <button type="submit" disabled={createRestaurant.isPending} className="btn-primary">
            {createRestaurant.isPending ? 'Creating…' : 'Create'}
          </button>
          <button type="button" onClick={() => { setShowForm(false); setCreateError(''); }} className="btn-secondary">Cancel</button>
        </form>
      )}

      {/* Table */}
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)', overflowX: 'auto' }}>
        {isLoading ? (
          <div className="p-8 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</div>
        ) : restaurants.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-3">
            <Building2 size={28} style={{ color: 'var(--mute-2)' }} />
            <p style={{ fontSize: 13, color: 'var(--mute)', margin: 0 }}>No restaurants yet. Create your first one above.</p>
          </div>
        ) : (
          <table className="w-full" style={{ minWidth: 540, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--paper-2)' }}>
                <th className="px-5 py-3 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Name</th>
                <th className="px-5 py-3 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Status</th>
                <th className="px-5 py-3 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Users</th>
                <th className="px-5 py-3 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Tables</th>
                <th className="px-5 py-3 text-left" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)' }}>Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {restaurants.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: '1px solid var(--line)', opacity: r.is_active === false ? 0.65 : 1 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-5 py-3.5" style={{ fontWeight: 500, color: 'var(--ink)' }}>{r.name}</td>
                  <td className="px-5 py-3.5">
                    <StatusBadge isActive={r.is_active !== false} />
                  </td>
                  <td className="px-5 py-3.5 mono num" style={{ color: 'var(--mute)' }}>{r.user_count}</td>
                  <td className="px-5 py-3.5 mono num" style={{ color: 'var(--mute)' }}>{r.table_count}</td>
                  <td className="px-5 py-3.5" style={{ color: 'var(--mute)' }}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/restaurants/${r.id}`)}
                        className="flex items-center gap-1 rounded-[6px] px-3 py-1.5 transition-colors"
                        style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', border: '1px solid var(--line-2)', background: 'transparent' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        Manage <ArrowRight size={12} />
                      </button>
                      <button
                        onClick={() => setConfirmSuspend(r)}
                        className="btn btn-sm btn-ghost"
                        title={r.is_active === false ? 'Reactivate' : 'Suspend'}
                        style={{ color: r.is_active === false ? 'var(--ok)' : 'var(--warn)' }}
                      >
                        {r.is_active === false ? <Power size={13} /> : <PowerOff size={13} />}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(r)}
                        className="btn btn-sm btn-ghost"
                        style={{ color: 'var(--bad)' }}
                        title="Delete restaurant"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDeleteModal
          restaurant={confirmDelete}
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(null)}
          isPending={deleteRestaurant.isPending}
        />
      )}

      {confirmSuspend && (
        <ConfirmSuspendModal
          restaurant={confirmSuspend}
          onConfirm={handleToggleStatus}
          onClose={() => setConfirmSuspend(null)}
          isPending={setStatus.isPending}
        />
      )}
    </div>
  );
}
