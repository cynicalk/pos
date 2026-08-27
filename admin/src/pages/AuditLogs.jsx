import { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, Lock, TriangleAlert } from 'lucide-react';
import { useAuditLogs, useRestaurants } from '../hooks/useAdmin';
import api from '../api/client';

function exportCsv(logs) {
  const cols = ['timestamp', 'actor', 'actor_type', 'restaurant', 'restaurant_id', 'action', 'resource_type', 'resource_id', 'description'];
  const esc  = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = logs.map((l) => [
    new Date(l.created_at).toISOString(),
    l.actor_email || l.actor_id,
    l.actor_type,
    l.restaurant_name || '',
    l.restaurant_id || '',
    l.action,
    l.resource_type,
    l.resource_id || '',
    l.description,
  ].map(esc).join(','));

  const csv  = [cols.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const ACTION_COLOR = {
  create:       'var(--ok)',
  update:       'var(--info)',
  delete:       'var(--bad)',
  payment:      'var(--mute)',
  login:        'var(--mute)',
  export:       'var(--warn)',
  login_failed: 'var(--bad)',
};

const RESOURCE_LABELS = {
  restaurant:  'Restaurant',
  user:        'User',
  setting:     'Setting',
  order:       'Order',
  menu_item:   'Menu Item',
  payment:     'Payment',
  super_admin: 'Operator',
  audit_log:   'Audit Log',
};

const RESOURCE_TYPES = Object.keys(RESOURCE_LABELS);

function todayStr() { return new Date().toISOString().slice(0, 10); }

function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function PasswordModal({ context, onConfirm, onCancel }) {
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const inputRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/verify-password', { password, context });
      onConfirm();
    } catch (err) {
      setError(err.response?.data?.error || 'Incorrect password');
      setPassword('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,10,10,.4)' }}
    >
      <div style={{ width: '100%', maxWidth: 360, background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8 }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex items-center gap-3">
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(179,120,31,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Lock size={14} style={{ color: 'var(--warn)' }} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Confirm your identity</p>
              <p style={{ fontSize: 11.5, color: 'var(--mute)' }}>Enter your password to export audit logs</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <input
            ref={inputRef}
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="input w-full"
            required
          />
          {error && <p style={{ fontSize: 12, color: 'var(--bad)' }}>{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading || !password} className="btn-primary flex-1 disabled:opacity-50">
              {loading ? 'Verifying…' : 'Export'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export default function AuditLogs() {
  const t = todayStr();
  const [restaurantId, setRestaurantId] = useState('');
  const [from,         setFrom]         = useState(shiftDate(t, -6));
  const [to,           setTo]           = useState(t);
  const [resourceType, setResourceType] = useState('');
  const [limit,        setLimit]        = useState(500);
  const [showPwModal,  setShowPwModal]  = useState(false);

  const { data: restaurants = [] } = useRestaurants();
  const { data: logs = [], isLoading, isError, refetch } = useAuditLogs({
    restaurantId: restaurantId || undefined,
    from, to,
    resourceType: resourceType || undefined,
    limit,
  });

  const atCap = logs.length >= limit;

  const exportContext = useMemo(() => {
    const parts = [];
    if (from || to) parts.push(`${from} → ${to}`);
    if (restaurantId) {
      const r = restaurants.find((r) => r.id === restaurantId);
      parts.push(r ? r.name : restaurantId);
    }
    if (resourceType) parts.push(RESOURCE_LABELS[resourceType] ?? resourceType);
    return parts.join(', ') || 'all';
  }, [from, to, restaurantId, resourceType, restaurants]);

  function handleExportConfirmed() {
    setShowPwModal(false);
    exportCsv(logs);
  }

  const selectStyle = {
    border: '1px solid var(--line-2)',
    borderRadius: 6,
    padding: '6px 11px',
    fontSize: 13,
    background: 'var(--paper)',
    color: 'var(--ink)',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const inputStyle = {
    border: '1px solid var(--line-2)',
    borderRadius: 6,
    padding: '6px 11px',
    fontSize: 13,
    background: 'var(--paper)',
    color: 'var(--ink)',
    outline: 'none',
    fontFamily: 'inherit',
  };

  return (
    <div className="space-y-5">
      {showPwModal && (
        <PasswordModal
          context={exportContext}
          onConfirm={handleExportConfirmed}
          onCancel={() => setShowPwModal(false)}
        />
      )}

      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>Audit Logs</h1>
        <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>Every mutation across all restaurants</p>
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap gap-3 items-end p-4 rounded-[8px]"
        style={{ border: '1px solid var(--line-2)', background: 'var(--paper)' }}
      >
        <div>
          <label className="block mb-1" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Restaurant</label>
          <select style={selectStyle} value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)}>
            <option value="">All restaurants</option>
            {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block mb-1" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>From</label>
          <input type="date" style={inputStyle} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>

        <div>
          <label className="block mb-1" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>To</label>
          <input type="date" style={inputStyle} value={to} min={from} max={t} onChange={(e) => setTo(e.target.value)} />
        </div>

        <div>
          <label className="block mb-1" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Resource</label>
          <select style={selectStyle} value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
            <option value="">All types</option>
            {RESOURCE_TYPES.map((rt) => <option key={rt} value={rt}>{RESOURCE_LABELS[rt]}</option>)}
          </select>
        </div>

        <div>
          <label className="block mb-1" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>Show</label>
          <select style={selectStyle} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[100, 250, 500, 1000, 2000].map((n) => <option key={n} value={n}>{n} records</option>)}
          </select>
        </div>

        <button
          onClick={() => refetch()}
          className="btn btn-sm"
          style={{ padding: '7px 12px', fontSize: 13 }}
        >
          Refresh
        </button>

        <span style={{ fontSize: 12, color: 'var(--mute)', alignSelf: 'flex-end', paddingBottom: 4 }}>
          {logs.length} event{logs.length !== 1 ? 's' : ''}
        </span>

        <button
          onClick={() => setShowPwModal(true)}
          disabled={logs.length === 0}
          className="ml-auto flex items-center gap-1.5 btn btn-sm disabled:opacity-40"
          style={{ padding: '7px 12px', fontSize: 13 }}
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      {atCap && (
        <div
          className="flex items-center gap-2.5 rounded-[6px] px-4 py-2.5"
          style={{ fontSize: 13, color: 'var(--warn)', background: 'rgba(179,120,31,.06)', border: '1px solid rgba(179,120,31,.2)' }}
        >
          <TriangleAlert size={14} style={{ flexShrink: 0 }} />
          Showing the first {limit} records — results may be truncated. Increase the limit or narrow your filters.
        </div>
      )}

      {/* Table */}
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)', overflowX: 'auto' }}>
        <div
          className="grid gap-3 px-4 py-2.5 min-w-[700px]"
          style={{
            gridTemplateColumns: '160px 180px 140px 100px 1fr',
            borderBottom: '1px solid var(--line)',
            background: 'var(--paper-2)',
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '.07em',
            color: 'var(--mute)',
          }}
        >
          <span>Time</span>
          <span>Actor</span>
          <span>Restaurant</span>
          <span>Resource</span>
          <span>Event</span>
        </div>

        {isLoading && <p className="p-8 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>}
        {isError   && <p className="p-8 text-center" style={{ fontSize: 13, color: 'var(--bad)' }}>Failed to load audit logs.</p>}
        {!isLoading && !isError && logs.length === 0 && (
          <p className="p-8 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>No events in this period.</p>
        )}

        {!isLoading && logs.map((log) => (
          <div
            key={log.id}
            className="grid gap-3 px-4 py-2.5 min-w-[700px]"
            style={{
              gridTemplateColumns: '160px 180px 140px 100px 1fr',
              borderBottom: '1px solid var(--line)',
              fontSize: 12,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span className="mono num" style={{ fontSize: 11, color: 'var(--mute)' }}>
              {new Date(log.created_at).toLocaleString('en-US', {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
              })}
            </span>

            <span className="truncate" style={{ color: 'var(--ink)' }} title={log.actor_email || log.actor_id}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--mute)', marginRight: 4 }}>
                {log.actor_type === 'super_admin' ? '★' : '·'}
              </span>
              {log.actor_email || log.actor_id?.slice(0, 8)}
            </span>

            <span className="flex flex-col min-w-0" title={log.restaurant_id || ''}>
              {log.restaurant_name
                ? <span style={{ fontSize: 11.5, color: 'var(--ink)' }} className="truncate">{log.restaurant_name}</span>
                : log.restaurant_id
                  ? <span style={{ fontSize: 11, color: 'var(--mute)', fontStyle: 'italic' }}>deleted</span>
                  : null
              }
              {log.restaurant_id && (
                <span className="mono truncate" style={{ fontSize: 10, color: 'var(--mute-2)' }}>
                  {log.restaurant_id}
                </span>
              )}
            </span>

            <span>
              <span style={{ fontSize: 12, fontWeight: 600, color: ACTION_COLOR[log.action] ?? 'var(--mute)' }}>
                {log.action}
              </span>
              {' '}
              <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>{RESOURCE_LABELS[log.resource_type] ?? log.resource_type}</span>
            </span>

            <span style={{ fontSize: 11.5, color: 'var(--ink)' }}>{log.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
