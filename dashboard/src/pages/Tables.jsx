import { useState, useRef, useMemo, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, QrCode, Copy, Check, LayoutGrid, X, Minus, User, UserCheck, ShoppingBag, Map, GripHorizontal, ExternalLink, Clock, CalendarClock } from 'lucide-react';
import QRCode from 'qrcode';
import { useTables, useUpdateTableStatus, useCreateTable, useUpdateTablePosition, useAssignTableStaff } from '../hooks/useTables';
import { useActiveOrders } from '../hooks/useOrders';
import { useUsers, useMeProfile } from '../hooks/useUsers';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import { useCreateReservation } from '../hooks/useReservations';
import Modal from '../components/Modal';
import NewOrderModal from '../components/NewOrderModal';

const GRID_COLS_MIN = 3;  const GRID_COLS_MAX = 20;
const GRID_ROWS_MIN = 3;  const GRID_ROWS_MAX = 14;

const STATUSES = ['available', 'occupied', 'reserved', 'cleaning'];

const STATUS_DOT = {
  available: 'var(--ok)',
  occupied:  'var(--bad)',
  reserved:  'var(--warn)',
  cleaning:  'var(--info)',
};

const STATUS_SOFT = {
  available: 'var(--ok-soft)',
  occupied:  'var(--bad-soft)',
  reserved:  'var(--warn-soft)',
  cleaning:  'var(--info-soft)',
};

const STAFF_PALETTE = ['#B3372B', '#1F5BB3', '#1F8A5B', '#B3781F', '#7A4AE0', '#1F7AB3'];
function staffColor(name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h) ^ name.charCodeAt(i);
  return STAFF_PALETTE[Math.abs(h) % STAFF_PALETTE.length];
}
function staffInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function TableStatusDot({ status }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: STATUS_DOT[status] ?? 'var(--mute-2)',
        display: 'inline-block', flexShrink: 0,
      }} />
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function Tables() {
  const navigate = useNavigate();
  const { data: tables = [], isLoading } = useTables();
  const { data: activeOrders = [] } = useActiveOrders();
  const { data: settings } = useSettings();
  const { data: allUsers = [] }  = useUsers();
  const { data: meProfile }      = useMeProfile();
  const updateStatus   = useUpdateTableStatus();
  const updatePosition = useUpdateTablePosition();
  const createTable    = useCreateTable();
  const assignTableStaff = useAssignTableStaff();
  const createReservation = useCreateReservation();
  const { isAdmin, user } = useAuth();
  const canEdit = isAdmin || user?.role === 'staff' || user?.role === 'cashier';
  const staffAssignmentEnabled = settings?.staff_assignment_enabled === true || settings?.staff_assignment_enabled === 'true';
  const reservationsEnabled    = settings?.reservations_enabled    === true || settings?.reservations_enabled    === 'true';

  // map tableId → assigned staff (from table record directly)
  const staffByTable = tables.reduce((acc, t) => {
    if (t.assigned_staff_id) {
      acc[t.id] = {
        email: t.assigned_staff_email || null,
        name:  t.assigned_staff_name  || null,
      };
    }
    return acc;
  }, {});

  const [selected, setSelected] = useState(null);

const [newOrderForTable, setNewOrderForTable] = useState(null);
  const [reservationForTable, setReservationForTable] = useState(null);
  const [reservationForm, setReservationForm] = useState({ name: '', time: '', party: '', notes: '' });
  const [reservationError, setReservationError] = useState('');
  const [addModal,       setAddModal]       = useState(false);
  const [expandedStaff, setExpandedStaff] = useState(null);
  const [newTable, setNewTable] = useState({ number: '', seats: '' });
  const [addError, setAddError] = useState('');

  const [layoutMode, setLayoutMode] = useState(false);
  const [showFloorPlan, setShowFloorPlan] = useState(false);
  const [fpPos, setFpPos] = useState({ x: 0, y: 0 });
  const fpWindowRef = useRef(null);

  useLayoutEffect(() => {
    if (showFloorPlan && fpWindowRef.current) {
      const { offsetWidth: w, offsetHeight: h } = fpWindowRef.current;
      setFpPos({
        x: Math.max(0, (window.innerWidth  - w) / 2),
        y: Math.max(0, (window.innerHeight - h) / 2),
      });
    }
  }, [showFloorPlan]);
  const [draggingId, setDraggingId] = useState(null);
  const [overCell,   setOverCell]   = useState(null);
  const [gridCols,   setGridCols]   = useState(() => parseInt(localStorage.getItem('layoutGridCols') || '12'));
  const [gridRows,   setGridRows]   = useState(() => parseInt(localStorage.getItem('layoutGridRows') || '8'));

  const gridRef        = useRef(null);
  const unplacedRef    = useRef(null);
  const touchDragIdRef = useRef(null);
  const [touchPos, setTouchPos] = useState(null);

  const [filter, setFilter] = useState('all');

  const sortedTables   = useMemo(() => [...tables].sort((a, b) => a.number - b.number), [tables]);
  const filteredTables = useMemo(() =>
    filter === 'all' ? sortedTables : sortedTables.filter((t) => t.status === filter),
  [sortedTables, filter]);
  const staffUsers     = useMemo(() => allUsers.filter((u) => u.role === 'staff'), [allUsers]);

  const menuBase = import.meta.env.VITE_MENU_URL || `${window.location.protocol}//${window.location.hostname}:5175`;

  const ordersByTable = useMemo(() =>
    activeOrders.reduce((acc, o) => {
      if (!o.table_id) return acc;
      if (!acc[o.table_id] || new Date(o.created_at) < new Date(acc[o.table_id].created_at)) {
        acc[o.table_id] = { id: o.id, created_at: o.created_at, total: 0 };
      }
      acc[o.table_id].total += o.total || 0;
      return acc;
    }, {})
  , [activeOrders]);

  function elapsed(iso) {
    const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return '< 1m';
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  function fmtAmt(amount) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency', currency: settings?.currency || 'USD',
        minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(amount);
    } catch { return String(Math.round(amount)); }
  }

  const cellMap = useMemo(() => Object.fromEntries(
    tables.filter((t) => t.x_pos != null && t.y_pos != null).map((t) => [`${t.x_pos},${t.y_pos}`, t])
  ), [tables]);

  function changeGrid(axis, delta) {
    if (axis === 'cols') {
      const next = Math.min(GRID_COLS_MAX, Math.max(GRID_COLS_MIN, gridCols + delta));
      setGridCols(next); localStorage.setItem('layoutGridCols', next);
    } else {
      const next = Math.min(GRID_ROWS_MAX, Math.max(GRID_ROWS_MIN, gridRows + delta));
      setGridRows(next); localStorage.setItem('layoutGridRows', next);
    }
  }

  function onFpDragStart(e) {
    e.preventDefault();
    const offsetX = e.clientX - fpPos.x;
    const offsetY = e.clientY - fpPos.y;
    function onMove(ev) {
      setFpPos({
        x: Math.max(0, Math.min(window.innerWidth  - 200, ev.clientX - offsetX)),
        y: Math.max(0, Math.min(window.innerHeight - 48,  ev.clientY - offsetY)),
      });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const [qrTable,   setQrTable]   = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied,    setCopied]    = useState(false);

  function nowLocal() {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  async function handleStatusChange(status) {
    if (status === 'reserved' && reservationsEnabled) {
      setReservationForTable(selected);
      setReservationForm({ name: '', phone: '', time: nowLocal(), party: '', notes: '' });
      setReservationError('');
      setSelected(null);
      return;
    }
    await updateStatus.mutateAsync({ id: selected.id, status });
    setSelected(null);
  }

  async function handleReservationSubmit() {
    if (!reservationForm.name.trim()) { setReservationError('Guest name is required.'); return; }
    if (!reservationForm.time)        { setReservationError('Arrival time is required.'); return; }
    setReservationError('');
    try {
      await createReservation.mutateAsync({
        tableId:    reservationForTable.id,
        guestName:  reservationForm.name.trim(),
        guestPhone: reservationForm.phone?.trim() || null,
        partySize:  reservationForm.party ? parseInt(reservationForm.party) : null,
        reservedAt: new Date(reservationForm.time).toISOString(),
        notes:      reservationForm.notes.trim() || null,
      });
      setReservationForTable(null);
    } catch (e) {
      setReservationError(e.response?.data?.error || e.message || 'Failed to save');
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setAddError('');
    try {
      await createTable.mutateAsync({ number: parseInt(newTable.number), seats: parseInt(newTable.seats) });
      setAddModal(false);
      setNewTable({ number: '', seats: '' });
    } catch (err) {
      setAddError(err.response?.data?.error || err.message || 'Failed to create table');
    }
  }

  async function handleQrClick(t) {
    setQrDataUrl(''); setCopied(false); setQrTable(t);
    const url = `${menuBase}/order/${t.public_token}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 256, margin: 2, color: { dark: '#0A0A0A' } });
    setQrDataUrl(dataUrl);
  }

  function handleCopyUrl() {
    const url = `${menuBase}/order/${qrTable.public_token}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const counts = {
    available: tables.filter((t) => t.status === 'available').length,
    occupied:  tables.filter((t) => t.status === 'occupied').length,
    reserved:  tables.filter((t) => t.status === 'reserved').length,
    cleaning:  tables.filter((t) => t.status === 'cleaning').length,
  };

  if (isLoading) {
    return <div className="py-16 text-center text-[13px]" style={{ color: 'var(--mute)' }}>Loading tables…</div>;
  }

  return (
    <div className="space-y-5">
      {/* Page head */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] font-semibold m-0" style={{ letterSpacing: '-.015em', color: 'var(--ink)' }}>
            Tables
          </h1>
          <span style={{ fontSize: 12, color: 'var(--mute)' }}>{tables.length} total</span>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto overflow-x-auto" style={{ flexShrink: 0, scrollbarWidth: 'none' }}>
          {!layoutMode && tables.some((t) => t.x_pos != null) && (
            <button
              onClick={() => setShowFloorPlan((v) => !v)}
              style={{
                position: 'relative',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 108, height: 28, borderRadius: 999,
                border: 0, padding: 0, cursor: 'pointer',
                background: showFloorPlan ? '#0A0A0A' : 'rgba(10,10,10,0.07)',
                boxShadow: showFloorPlan
                  ? '0 2px 10px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.07)'
                  : 'inset 0 0 0 1px rgba(10,10,10,0.12)',
                transition: 'background 260ms cubic-bezier(0.4,0,0.2,1), box-shadow 260ms',
                overflow: 'hidden',
              }}
            >
              <span style={{
                position: 'absolute', top: 4,
                left: showFloorPlan ? 84 : 4,
                width: 20, height: 20, borderRadius: '50%',
                background: showFloorPlan ? 'rgba(255,255,255,0.14)' : 'rgba(10,10,10,0.11)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'left 260ms cubic-bezier(0.4,0,0.2,1), background 260ms',
                pointerEvents: 'none',
              }}>
                <Map size={10} style={{ color: showFloorPlan ? '#fff' : 'rgba(10,10,10,0.5)', transition: 'color 260ms' }} />
              </span>
              <span style={{
                fontSize: 11.5, fontWeight: 600, letterSpacing: '0.01em',
                color: showFloorPlan ? 'rgba(250,250,248,0.92)' : 'rgba(10,10,10,0.45)',
                transition: 'color 260ms',
                pointerEvents: 'none', userSelect: 'none',
              }}>
                Floor Plan
              </span>
            </button>
          )}
          {isAdmin && !layoutMode && (
            <button onClick={() => { setLayoutMode(true); setShowFloorPlan(false); }} className="btn shrink-0">
              <LayoutGrid size={13} /><span className="hidden sm:inline"> Arrange</span>
            </button>
          )}
          {isAdmin && layoutMode && (
            <button onClick={() => setLayoutMode(false)} className="btn shrink-0">
              <X size={13} /><span className="hidden sm:inline"> Done</span>
            </button>
          )}
          {isAdmin && !layoutMode && reservationsEnabled && (
            <button onClick={() => navigate('/tables/reservations')} className="btn shrink-0">
              <CalendarClock size={13} /><span className="hidden sm:inline"> Reservations</span>
            </button>
          )}
          {isAdmin && !layoutMode && (
            <button onClick={() => { setAddError(''); setAddModal(true); }} className="btn-primary shrink-0">
              <Plus size={13} /><span className="hidden sm:inline"> Add table</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats strip */}
      {!layoutMode && (() => {
        const occupiedTables = tables.filter((t) => t.status === 'occupied');
        const activeSpend    = Object.values(ordersByTable).reduce((s, o) => s + (o.total || 0), 0);
        const seatsTotal     = tables.reduce((s, t) => s + t.seats, 0);
        const avgDwellMins   = occupiedTables.length
          ? Math.round(occupiedTables.reduce((s, t) => {
              const ord = ordersByTable[t.id];
              return s + (ord ? (Date.now() - new Date(ord.created_at)) / 60000 : 0);
            }, 0) / occupiedTables.length)
          : 0;
        const pct = tables.length ? Math.round((occupiedTables.length / tables.length) * 100) : 0;
        const statusSegments = tables.length
          ? STATUSES.map((s) => ({ status: s, pct: (tables.filter((t) => t.status === s).length / tables.length) * 100 })).filter((s) => s.pct > 0)
          : [];
        const tiles = [
          { label: 'Occupancy', value: `${pct}%`, sub: `${occupiedTables.length} of ${tables.length} tables`, segments: statusSegments },
          { label: 'Seats total', value: seatsTotal, sub: `Across ${tables.length} tables` },
          { label: 'Active spend', value: fmtAmt(activeSpend), sub: `${occupiedTables.length} open tab${occupiedTables.length === 1 ? '' : 's'}` },
          { label: 'Avg dwell', value: avgDwellMins ? `${avgDwellMins}m` : '—', sub: 'Current sitting' },
        ];
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 10 }}>
            {tiles.map((tile) => (
              <div key={tile.label} className="strip-tile" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)' }}>{tile.label}</span>
                <span className="mono num" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--ink)' }}>{tile.value}</span>
                {tile.segments && (
                  <div style={{ height: 4, borderRadius: 99, background: 'var(--line-2)', overflow: 'hidden', margin: '2px 0', display: 'flex' }}>
                    {tile.segments.map(({ status, pct: w }) => (
                      <div key={status} style={{ height: '100%', width: `${w}%`, background: STATUS_DOT[status], transition: 'width 400ms ease', flexShrink: 0 }} />
                    ))}
                  </div>
                )}
                <span style={{ fontSize: 11, color: 'var(--mute)' }}>{tile.sub}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Filter chips */}
      {!layoutMode && (
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {[{ id: 'all', label: 'All', count: tables.length }, ...STATUSES.map((s) => ({ id: s, label: s[0].toUpperCase() + s.slice(1), count: counts[s] }))].map(({ id, label, count }) => {
            const active = filter === id;
            const color  = id === 'all' ? 'var(--ink)' : STATUS_DOT[id];
            const soft   = id === 'all' ? 'var(--paper-2)' : STATUS_SOFT[id];
            return (
              <button key={id} onClick={() => setFilter(id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                height: 28, padding: '0 10px', borderRadius: 999,
                border: active ? `1px solid ${color}` : '1px solid var(--line-2)',
                background: active ? soft : 'var(--paper)',
                color: active ? color : 'var(--ink-2)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                transition: 'background 100ms, border-color 100ms',
              }}>
                {id !== 'all' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />}
                {label}
                <span className="mono num" style={{ fontSize: 11, fontWeight: 500, opacity: .75 }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Layout editor */}
      {layoutMode && (() => {
        const placed   = tables.filter((t) => t.x_pos != null && t.y_pos != null);
        const unplaced = tables.filter((t) => t.x_pos == null || t.y_pos == null);

        function getTouchCell(touch) {
          if (!gridRef.current) return null;
          const rect    = gridRef.current.getBoundingClientRect();
          const cellW   = rect.width  / gridCols;
          const cellH   = rect.height / gridRows;
          const col     = Math.floor((touch.clientX - rect.left) / cellW);
          const row     = Math.floor((touch.clientY - rect.top)  / cellH);
          if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) return { x: col, y: row };
          return null;
        }

        function isOverUnplaced(touch) {
          if (!unplacedRef.current) return false;
          const r = unplacedRef.current.getBoundingClientRect();
          return touch.clientX >= r.left && touch.clientX <= r.right &&
                 touch.clientY >= r.top  && touch.clientY <= r.bottom;
        }

        function onTouchMove(e) {
          if (!touchDragIdRef.current) return;
          const t = e.touches[0];
          setTouchPos((p) => p ? { ...p, x: t.clientX, y: t.clientY } : null);
          setOverCell(getTouchCell(t));
        }

        function onTouchEnd(e) {
          const id = touchDragIdRef.current;
          if (!id) return;
          const t    = e.changedTouches[0];
          const cell = getTouchCell(t);
          if (cell) {
            const occupant = cellMap[`${cell.x},${cell.y}`];
            if (!occupant || occupant.id === id) updatePosition.mutate({ id, x: cell.x, y: cell.y });
          } else if (isOverUnplaced(t)) {
            updatePosition.mutate({ id, x: null, y: null });
          }
          touchDragIdRef.current = null;
          setDraggingId(null); setOverCell(null); setTouchPos(null);
        }

        function onTouchCancel() {
          touchDragIdRef.current = null;
          setDraggingId(null); setOverCell(null); setTouchPos(null);
        }

        function handleCellDrop(x, y) {
          if (!draggingId) return;
          const occupant = cellMap[`${x},${y}`];
          if (occupant && occupant.id !== draggingId) return;
          updatePosition.mutate({ id: draggingId, x, y });
          setDraggingId(null); setOverCell(null);
        }

        function handleUnplacedDrop() {
          if (!draggingId) return;
          updatePosition.mutate({ id: draggingId, x: null, y: null });
          setDraggingId(null); setOverCell(null);
        }

        return (
          <div className="space-y-4">
            {/* Unplaced strip */}
            <div
              ref={unplacedRef}
              className="min-h-[72px] rounded-[6px] p-3"
              style={{
                border: `2px dashed ${draggingId && placed.find((t) => t.id === draggingId) ? 'var(--warn)' : 'var(--line-2)'}`,
                background: 'var(--paper-2)',
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleUnplacedDrop}
            >
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)', marginBottom: 8 }}>
                Unplaced — drag onto grid
              </p>
              <div className="flex flex-wrap gap-2">
                {unplaced.length === 0 && <span style={{ fontSize: 12, color: 'var(--mute)' }}>All tables placed</span>}
                {unplaced.map((t) => (
                  <div
                    key={t.id} draggable
                    onDragStart={() => setDraggingId(t.id)}
                    onDragEnd={() => { setDraggingId(null); setOverCell(null); }}
                    onTouchStart={(e) => { touchDragIdRef.current = t.id; setDraggingId(t.id); setTouchPos({ x: e.touches[0].clientX, y: e.touches[0].clientY, label: t.number }); }}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    onTouchCancel={onTouchCancel}
                    className="flex h-14 w-14 cursor-grab flex-col items-center justify-center rounded-[6px] select-none"
                    style={{
                      border: '1px solid var(--line-2)', background: 'var(--paper)',
                      opacity: draggingId === t.id ? 0.4 : 1,
                      touchAction: 'none',
                    }}
                  >
                    <span className="mono num font-bold" style={{ fontSize: 16, color: 'var(--ink)' }}>{t.number}</span>
                    <span style={{ fontSize: 10, color: 'var(--mute)' }}>{t.seats}p</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Grid canvas */}
            <div
              className="overflow-x-auto rounded-[6px] p-3"
              style={{ border: '1px solid var(--line)', background: 'var(--paper)' }}
            >
              <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)' }}>
                  Floor layout
                </p>
                <div className="flex items-center gap-4" style={{ fontSize: 12, color: 'var(--mute)' }}>
                  <span className="flex items-center gap-1.5">
                    Columns
                    <button onClick={() => changeGrid('cols', -1)} disabled={gridCols <= GRID_COLS_MIN} className="rounded p-0.5" style={{ color: 'var(--mute)' }}><Minus size={12} /></button>
                    <span className="mono num font-semibold" style={{ width: 20, textAlign: 'center', color: 'var(--ink)' }}>{gridCols}</span>
                    <button onClick={() => changeGrid('cols', +1)} disabled={gridCols >= GRID_COLS_MAX} className="rounded p-0.5" style={{ color: 'var(--mute)' }}><Plus size={12} /></button>
                  </span>
                  <span className="flex items-center gap-1.5">
                    Rows
                    <button onClick={() => changeGrid('rows', -1)} disabled={gridRows <= GRID_ROWS_MIN} className="rounded p-0.5" style={{ color: 'var(--mute)' }}><Minus size={12} /></button>
                    <span className="mono num font-semibold" style={{ width: 20, textAlign: 'center', color: 'var(--ink)' }}>{gridRows}</span>
                    <button onClick={() => changeGrid('rows', +1)} disabled={gridRows >= GRID_ROWS_MAX} className="rounded p-0.5" style={{ color: 'var(--mute)' }}><Plus size={12} /></button>
                  </span>
                </div>
              </div>
              <div ref={gridRef} style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${gridCols}, 64px)`,
                gridTemplateRows: `repeat(${gridRows}, 64px)`,
                gap: 4,
                width: `${gridCols * 68}px`,
              }}>
                {Array.from({ length: gridRows }, (_, row) =>
                  Array.from({ length: gridCols }, (_, col) => {
                    const key    = `${col},${row}`;
                    const table  = cellMap[key];
                    const isOver = overCell?.x === col && overCell?.y === row;
                    const blocked = isOver && table && table.id !== draggingId;
                    return (
                      <div
                        key={key}
                        className="h-16 w-16 rounded-[6px]"
                        style={{
                          border: !table ? '1px dashed var(--line-2)' : 'transparent',
                          background: blocked ? 'rgba(179,55,43,.08)' : isOver && !table ? 'var(--paper-2)' : !table ? 'var(--paper)' : 'transparent',
                        }}
                        onDragOver={(e) => { e.preventDefault(); setOverCell({ x: col, y: row }); }}
                        onDragLeave={() => setOverCell(null)}
                        onDrop={() => handleCellDrop(col, row)}
                      >
                        {table && (
                          <div
                            draggable
                            onDragStart={(e) => { e.stopPropagation(); setDraggingId(table.id); }}
                            onDragEnd={() => { setDraggingId(null); setOverCell(null); }}
                            onTouchStart={(e) => { touchDragIdRef.current = table.id; setDraggingId(table.id); setTouchPos({ x: e.touches[0].clientX, y: e.touches[0].clientY, label: table.number }); }}
                            onTouchMove={onTouchMove}
                            onTouchEnd={onTouchEnd}
                            onTouchCancel={onTouchCancel}
                            className="h-full w-full flex flex-col items-center justify-center rounded-[6px] cursor-grab select-none"
                            style={{
                              border: '1px solid var(--line-2)', background: 'var(--paper)',
                              opacity: draggingId === table.id ? 0.4 : 1,
                              touchAction: 'none',
                            }}
                          >
                            <span className="mono num font-bold" style={{ fontSize: 16, color: 'var(--ink)' }}>{table.number}</span>
                            <span style={{ fontSize: 9, color: 'var(--mute)' }}>{table.seats}p</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Touch drag ghost */}
            {touchPos && draggingId && (
              <div
                style={{
                  position: 'fixed',
                  left: touchPos.x - 28,
                  top:  touchPos.y - 28,
                  width: 56, height: 56,
                  borderRadius: 8,
                  background: 'var(--paper)',
                  border: '2px solid var(--ink)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                  zIndex: 9999,
                  opacity: 0.85,
                }}
              >
                <span className="mono num font-bold" style={{ fontSize: 16, color: 'var(--ink)' }}>
                  {touchPos.label}
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Table grid / list */}
      {!layoutMode && (tables.length === 0 ? (
        <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>
          No tables yet{isAdmin ? ' — add one to get started' : ''}
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))' }}>
          {filteredTables.map((t) => {
            const order       = ordersByTable[t.id];
            const staff       = staffByTable[t.id];
            const staffName   = staff?.name || staff?.email?.split('@')[0] || null;
            const timeStr     = order ? elapsed(order.created_at) : null;
            const amount      = order?.total > 0 ? fmtAmt(order.total) : null;
            const isOcc       = t.status === 'occupied';
            const isCleaning  = t.status === 'cleaning';
            const isAvail     = t.status === 'available';
            const statusColor = STATUS_DOT[t.status] ?? 'var(--mute-2)';
            const statusSoft  = STATUS_SOFT[t.status] ?? 'transparent';
            const isStaffOpen  = expandedStaff === t.id;
            const loggedInPin  = meProfile?.staff_pin;
            const assignedPin  = loggedInPin || allUsers.find((u) => u.id === t.assigned_staff_id)?.staff_pin;
            const menuUrl      = `${menuBase}/order/${t.public_token}${assignedPin ? `?staff=${assignedPin}` : ''}`;

            const iconBtn = {
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 7,
              border: '1px solid var(--line-2)', background: 'var(--paper)',
              cursor: 'pointer', color: 'var(--mute)',
              transition: 'background 120ms, color 120ms',
            };

            return (
              <div key={t.id} className="table-card" style={{
                position: 'relative',
                borderRadius: 14,
                background: 'var(--paper)',
                border: '1px solid var(--line-2)',
                padding: 'clamp(14px, 3vw, 22px) clamp(14px, 3vw, 20px) clamp(12px, 2.5vw, 20px)',
                display: 'flex', flexDirection: 'column',
                gap: 14, overflow: 'hidden',
                minHeight: 'clamp(260px, 40vw, 320px)',
                boxShadow: '0 1px 2px rgba(20,18,10,0.03), 0 1px 0 rgba(255,255,255,0.5) inset',
              }}>
                {/* Left gradient edge */}
                <span style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                  background: `linear-gradient(180deg, ${statusColor} 0%, ${statusColor} 60%, ${statusColor}00 100%)`,
                  opacity: 0.9, pointerEvents: 'none',
                }} />

                {/* Header: eyebrow + number + icon buttons */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--mute-2)' }}>Table</span>
                    <span className="mono num" style={{ fontSize: 'clamp(32px, 6vw, 44px)', fontWeight: 700, letterSpacing: '-.04em', lineHeight: 0.88, color: 'var(--ink)', marginTop: 3 }}>
                      {String(t.number).padStart(2, '0')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button onClick={() => window.open(menuUrl, '_blank')} title="Open menu" style={iconBtn}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-2)'; e.currentTarget.style.color = 'var(--ink)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--paper)'; e.currentTarget.style.color = 'var(--mute)'; }}
                    ><ExternalLink size={12} /></button>
                    <button onClick={() => handleQrClick(t)} title="QR code" style={iconBtn}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-2)'; e.currentTarget.style.color = 'var(--ink)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--paper)'; e.currentTarget.style.color = 'var(--mute)'; }}
                    ><QrCode size={12} /></button>
                  </div>
                </div>

                {/* Status pill + seat dots */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '3px 9px 3px 8px', borderRadius: 999,
                    background: statusSoft, color: statusColor,
                    fontSize: 11.5, fontWeight: 600,
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0,
                      ...(isOcc ? { boxShadow: `0 0 0 2.5px ${statusColor}33` } : {}),
                    }} className={isOcc ? 'live-dot' : ''} />
                    {t.status[0].toUpperCase() + t.status.slice(1)}
                  </span>
                  <span className="mono num" style={{ fontSize: 12, fontWeight: 600, color: 'var(--mute)' }}>{t.seats}p</span>
                </div>

                {/* Occupied body */}
                {isOcc && (
                  <div style={{
                    position: 'relative',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, var(--paper-2) 100%)',
                    border: '1px solid var(--line)',
                    borderRadius: 10, padding: '10px 12px 11px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                  }}>
                    {/* Staff chip + toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      {staffName ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '2px 9px 2px 2px', borderRadius: 999,
                          background: 'var(--paper)', border: '1px solid var(--line-2)',
                          fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 500,
                          boxShadow: '0 1px 2px rgba(20,18,10,0.04)',
                        }}>
                          <span style={{
                            width: 20, height: 20, borderRadius: '50%',
                            background: staffColor(staffName), color: '#fff',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 700, letterSpacing: '.04em', flexShrink: 0,
                          }}>{staffInitials(staffName)}</span>
                          {staffName}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11.5, color: 'var(--mute-2)' }}>
                          {staffAssignmentEnabled ? 'Unassigned' : '—'}
                        </span>
                      )}
                      {isAdmin && staffAssignmentEnabled && (
                        <button onClick={() => setExpandedStaff(isStaffOpen ? null : t.id)}
                          style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '2px 4px', color: 'var(--mute-2)', fontSize: 9, flexShrink: 0 }}>
                          {isStaffOpen ? '▲' : '▼'}
                        </button>
                      )}
                    </div>

                    {/* Inline staff picker */}
                    {isStaffOpen && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {t.assigned_staff_id && (
                          <button onClick={() => { assignTableStaff.mutate({ tableId: t.id, staffId: null }); setExpandedStaff(null); }}
                            style={{ fontSize: 10, color: 'var(--mute)', padding: '3px 7px', borderRadius: 4, border: '1px solid var(--line-2)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                            Clear assignment
                          </button>
                        )}
                        {staffUsers.map((u) => {
                          const isAssigned = u.id === t.assigned_staff_id;
                          return (
                            <button key={u.id}
                              onClick={() => { if (!isAssigned) { assignTableStaff.mutate({ tableId: t.id, staffId: u.id }); setExpandedStaff(null); } }}
                              disabled={isAssigned}
                              style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, textAlign: 'left', border: `1px solid ${isAssigned ? 'var(--ok)' : 'var(--line-2)'}`, background: isAssigned ? 'rgba(31,138,91,0.07)' : 'transparent', color: isAssigned ? 'var(--ok)' : 'var(--ink-2)', cursor: isAssigned ? 'default' : 'pointer', fontWeight: isAssigned ? 600 : 400 }}
                              onMouseEnter={(e) => { if (!isAssigned) e.currentTarget.style.background = 'var(--hover)'; }}
                              onMouseLeave={(e) => { if (!isAssigned) e.currentTarget.style.background = 'transparent'; }}
                            >{u.name || u.email.split('@')[0]}{isAssigned ? ' ✓' : ''}</button>
                          );
                        })}
                      </div>
                    )}

                    {/* Time + amount */}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--mute)' }}>
                        <Clock size={11} style={{ flexShrink: 0 }} />
                        <span className="mono num">{timeStr ?? '—'}</span>
                      </span>
                      {amount && (
                        <span className="mono num" style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--ink)' }}>
                          {amount}
                        </span>
                      )}
                    </div>

                    {/* Add Items */}
                    {isAdmin && (
                      <button onClick={() => setNewOrderForTable(t)} className="btn-primary"
                        style={{ width: '100%', justifyContent: 'center', height: 28, fontSize: 12 }}>
                        <Plus size={12} /> Add Items
                      </button>
                    )}
                  </div>
                )}

                {/* Reserved body */}
                {t.status === 'reserved' && (t.reservation_name || t.reservation_time || t.reservation_party) && (
                  <div style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, var(--paper-2) 100%)',
                    border: '1px solid var(--line)',
                    borderRadius: 10, padding: '10px 12px',
                    display: 'flex', flexDirection: 'column', gap: 6,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                  }}>
                    {t.reservation_name && (
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{t.reservation_name}</span>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {t.reservation_party && (
                        <span style={{ fontSize: 11, color: 'var(--mute)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <User size={10} /> {t.reservation_party} guests
                        </span>
                      )}
                      {t.reservation_time && (
                        <span style={{ fontSize: 11, color: 'var(--mute)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={10} />
                          {new Date(t.reservation_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    {t.reservation_notes && (
                      <span style={{ fontSize: 11, color: 'var(--mute-2)', fontStyle: 'italic' }}>{t.reservation_notes}</span>
                    )}
                  </div>
                )}

                {/* Available: seat + reserve CTAs */}
                {isAvail && isAdmin && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button onClick={() => setNewOrderForTable(t)} className="btn-primary"
                      style={{ width: '100%', justifyContent: 'center', height: 28, fontSize: 12 }}>
                      <User size={12} /> Seat guests
                    </button>
                    {reservationsEnabled && (
                      <button
                        onClick={() => {
                          setReservationForTable(t);
                          setReservationForm({ name: '', phone: '', time: '', party: '', notes: '' });
                          setReservationError('');
                        }}
                        className="btn"
                        style={{ width: '100%', justifyContent: 'center', height: 28, fontSize: 12 }}>
                        <CalendarClock size={12} /> Reserve
                      </button>
                    )}
                  </div>
                )}

                {/* Cleaning: mark ready CTA */}
                {isCleaning && isAdmin && (
                  <button onClick={() => updateStatus.mutate({ id: t.id, status: 'available' })}
                    disabled={updateStatus.isPending}
                    className="btn-primary"
                    style={{ width: '100%', justifyContent: 'center', height: 28, fontSize: 12 }}>
                    <Check size={12} /> Mark ready
                  </button>
                )}

                {/* Status change footer */}
                {isAdmin && (
                  <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {STATUSES.filter((s) => s !== t.status && (s !== 'reserved' || reservationsEnabled)).map((s) => (
                        <button key={s}
                          onClick={() => {
                            if (s === 'reserved' && reservationsEnabled) {
                              setReservationForTable(t);
                              setReservationForm({ name: '', phone: '', time: nowLocal(), party: '', notes: '' });
                              setReservationError('');
                            } else {
                              updateStatus.mutate({ id: t.id, status: s });
                            }
                          }}
                          disabled={updateStatus.isPending}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            height: 22, padding: '0 8px', borderRadius: 999,
                            border: `1px solid ${STATUS_DOT[s]}33`,
                            background: 'transparent', color: STATUS_DOT[s],
                            fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            transition: 'background 100ms, border-color 100ms',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = STATUS_SOFT[s]; e.currentTarget.style.borderColor = `${STATUS_DOT[s]}66`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = `${STATUS_DOT[s]}33`; }}
                        >
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_DOT[s], display: 'inline-block', flexShrink: 0 }} />
                          {s[0].toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Change Status Modal */}
      {selected && canEdit && (() => {
        const staffUsers = allUsers.filter((u) => u.role === 'staff');

        return (
          <Modal title={`Table ${selected.number}`} onClose={() => setSelected(null)}>
            <p style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 16 }}>
              Current: <strong style={{ color: 'var(--ink)' }}>{selected.status}</strong>
              {' '}· {selected.seats} seats
            </p>

            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)', marginBottom: 10 }}>
              Change status to
            </p>
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.filter((s) => s !== selected.status && (s !== 'reserved' || reservationsEnabled)).map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={updateStatus.isPending}
                  className="btn"
                  style={{ height: 36, justifyContent: 'flex-start' }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[s], display: 'inline-block', flexShrink: 0 }} />
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {/* New order + staff assignment — admin only, table occupied */}
            {isAdmin && selected.status === 'occupied' && (
              <div style={{ borderTop: '1px solid var(--line)', marginTop: 18, paddingTop: 16 }}>

                {/* New Order button */}
                <button
                  className="btn w-full mb-4"
                  style={{ height: 36, justifyContent: 'center', gap: 6 }}
                  onClick={() => { setSelected(null); setNewOrderForTable(selected); }}
                >
                  <ShoppingBag size={13} /> New Order
                </button>

                {/* Staff assignment */}
                <div className="flex items-center gap-2 mb-3">
                  <UserCheck size={12} style={{ color: 'var(--mute)' }} />
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)', margin: 0 }}>
                    Assign Staff
                  </p>
                  {selected.assigned_staff_id && (
                    <button
                      onClick={() => assignTableStaff.mutate({ tableId: selected.id, staffId: null })}
                      disabled={assignTableStaff.isPending}
                      className="ml-auto btn btn-sm"
                      style={{ fontSize: 11, color: 'var(--mute)' }}
                    >
                      <X size={10} /> Unassign
                    </button>
                  )}
                </div>

                {staffUsers.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--mute)' }}>No staff members found.</p>
                ) : (
                  <div className="space-y-1">
                    {staffUsers.map((u) => {
                      const isAssigned = u.id === selected.assigned_staff_id;
                      return (
                        <button
                          key={u.id}
                          onClick={() => !isAssigned && assignTableStaff.mutate({ tableId: selected.id, staffId: u.id })}
                          disabled={assignTableStaff.isPending || isAssigned}
                          className="flex w-full items-center gap-2.5 rounded-[6px] px-3 transition-colors"
                          style={{
                            height: 36, border: 0, textAlign: 'left', cursor: isAssigned ? 'default' : 'pointer',
                            background: isAssigned ? 'var(--paper-2)' : 'transparent',
                          }}
                          onMouseEnter={(e) => { if (!isAssigned) e.currentTarget.style.background = 'var(--hover)'; }}
                          onMouseLeave={(e) => { if (!isAssigned) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span style={{
                            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                            background: isAssigned ? 'var(--ok)' : 'var(--paper-2)',
                            border: '1px solid var(--line-2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isAssigned
                              ? <Check size={11} style={{ color: '#fff' }} />
                              : <User size={11} style={{ color: 'var(--mute)' }} />}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: isAssigned ? 600 : 400, color: 'var(--ink)', flex: 1 }}>
                            {u.name || u.email.split('@')[0]}
                          </span>
                          {u.staff_pin && (
                            <span className="mono" style={{ fontSize: 11, color: 'var(--mute-2)', letterSpacing: '0.1em' }}>
                              {u.staff_pin}
                            </span>
                          )}
                          <span style={{
                            fontSize: 10, textTransform: 'capitalize', padding: '1px 6px', borderRadius: 4,
                            background: 'var(--paper-2)', color: 'var(--mute)', border: '1px solid var(--line-2)',
                          }}>
                            {u.role}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Modal>
        );
      })()}

      {/* New Order / Add Items Modal (launched from table card) */}
      {newOrderForTable && (
        <NewOrderModal
          initialTableId={newOrderForTable.id}
          addItems={newOrderForTable.status === 'occupied'}
          orderId={ordersByTable[newOrderForTable.id]?.id ?? null}
          onClose={() => setNewOrderForTable(null)}
        />
      )}

      {/* Reservation Details Modal */}
      {reservationForTable && (
        <Modal title={`Reserve Table ${reservationForTable.number}`} onClose={() => setReservationForTable(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', display: 'block', marginBottom: 5 }}>
                  Guest Name *
                </label>
                <input autoFocus type="text" value={reservationForm.name}
                  onChange={(e) => setReservationForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Smith" className="input w-full" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', display: 'block', marginBottom: 5 }}>
                  Phone
                </label>
                <input type="tel" value={reservationForm.phone}
                  onChange={(e) => setReservationForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+1 555 0100" className="input w-full" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', display: 'block', marginBottom: 5 }}>
                  Arrival Time *
                </label>
                <input type="datetime-local" value={reservationForm.time}
                  onChange={(e) => setReservationForm((f) => ({ ...f, time: e.target.value }))}
                  className="input w-full" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', display: 'block', marginBottom: 5 }}>
                  Party Size
                </label>
                <input type="number" min="1" value={reservationForm.party}
                  onChange={(e) => setReservationForm((f) => ({ ...f, party: e.target.value }))}
                  placeholder={`Max ${reservationForTable.seats}`} className="input w-full" />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', display: 'block', marginBottom: 5 }}>
                Notes
              </label>
              <input type="text" value={reservationForm.notes}
                onChange={(e) => setReservationForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Allergies, occasion, preferences…" className="input w-full" />
            </div>
            {reservationError && <p style={{ fontSize: 12, color: 'var(--bad)' }}>{reservationError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn btn-sm btn-ghost" onClick={() => setReservationForTable(null)}>Cancel</button>
              <button className="btn-primary btn-sm" onClick={handleReservationSubmit} disabled={createReservation.isPending}>
                {createReservation.isPending ? 'Saving…' : 'Reserve Table'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Table Modal */}
      {addModal && isAdmin && (
        <Modal title="Add Table" onClose={() => setAddModal(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--mute)', marginBottom: 4 }}>Table Number</label>
              <input type="number" min="1" value={newTable.number}
                onChange={(e) => setNewTable((f) => ({ ...f, number: e.target.value }))}
                className="input" placeholder="e.g. 12" required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--mute)', marginBottom: 4 }}>Seats</label>
              <input type="number" min="1" value={newTable.seats}
                onChange={(e) => setNewTable((f) => ({ ...f, seats: e.target.value }))}
                className="input" placeholder="e.g. 4" required />
            </div>
            {addError && (
              <p className="rounded-[6px] px-3 py-2" style={{ fontSize: 12, color: 'var(--bad)', background: 'rgba(179,55,43,.06)' }}>
                {addError}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setAddModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button type="submit" disabled={createTable.isPending} className="btn-primary flex-1 justify-center">
                {createTable.isPending ? 'Adding…' : 'Add Table'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Floating Floor Plan Window */}
      {showFloorPlan && !layoutMode && (() => {
        const placed = tables.filter((t) => t.x_pos != null && t.y_pos != null);
        if (placed.length === 0) return null;

        const minCol = Math.min(...placed.map((t) => t.x_pos));
        const maxCol = Math.max(...placed.map((t) => t.x_pos));
        const minRow = Math.min(...placed.map((t) => t.y_pos));
        const maxRow = Math.max(...placed.map((t) => t.y_pos));
        const fpCols = maxCol - minCol + 1;
        const fpRows = maxRow - minRow + 1;

        const GAP = 4;
        const cellSize = Math.max(28, Math.min(48, Math.floor((380 - (fpCols - 1) * GAP) / fpCols)));

        const STATUS_BG = {
          available: 'rgba(31,138,91,0.11)',
          occupied:  'rgba(179,55,43,0.11)',
          reserved:  'rgba(179,120,31,0.11)',
          cleaning:  'rgba(31,91,179,0.11)',
        };
        const STATUS_BG_HOV = {
          available: 'rgba(31,138,91,0.22)',
          occupied:  'rgba(179,55,43,0.22)',
          reserved:  'rgba(179,120,31,0.22)',
          cleaning:  'rgba(31,91,179,0.22)',
        };

        const activeCounts = Object.fromEntries(
          STATUSES.map((s) => [s, placed.filter((t) => t.status === s).length])
        );

        return (
          <div ref={fpWindowRef} style={{
            position: 'fixed',
            left: fpPos.x,
            top: fpPos.y,
            zIndex: 200,
            background: 'rgba(250,250,248,0.70)',
            backdropFilter: 'blur(20px) saturate(1.5)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
            border: '1px solid rgba(255,255,255,0.65)',
            borderRadius: 12,
            boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.09), inset 0 1px 0 rgba(255,255,255,0.85)',
            overflow: 'hidden',
            minWidth: 180,
          }}>
            {/* Minimal drag strip */}
            <div
              onMouseDown={onFpDragStart}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 20, cursor: 'grab', userSelect: 'none',
                position: 'relative',
              }}
            >
              <GripHorizontal size={11} style={{ color: 'rgba(10,10,10,0.22)' }} />
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setShowFloorPlan(false)}
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16, borderRadius: '50%',
                  border: 0, background: 'transparent', cursor: 'pointer',
                  color: 'rgba(10,10,10,0.25)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(179,55,43,0.12)'; e.currentTarget.style.color = 'var(--bad)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(10,10,10,0.25)'; }}
              >
                <X size={10} />
              </button>
            </div>

            {/* Grid */}
            <div style={{ padding: 12 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${fpCols}, ${cellSize}px)`,
                gridTemplateRows: `repeat(${fpRows}, ${cellSize}px)`,
                gap: GAP,
              }}>
                {Array.from({ length: fpRows }, (_, r) =>
                  Array.from({ length: fpCols }, (_, c) => {
                    const key   = `${minCol + c},${minRow + r}`;
                    const table = cellMap[key];
                    const staff = table ? staffByTable[table.id] : null;
                    return (
                      <div
                        key={key}
                        style={{
                          width: cellSize, height: cellSize,
                          borderRadius: cellSize > 36 ? 7 : 4,
                          border: table
                            ? `1.5px solid ${STATUS_DOT[table.status]}`
                            : '1px dashed rgba(10,10,10,0.1)',
                          background: table ? (STATUS_BG[table.status] ?? 'var(--paper)') : 'transparent',
                          cursor: table && canEdit ? 'pointer' : 'default',
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', gap: 1,
                          position: 'relative',
                          transition: 'background 100ms, transform 100ms',
                        }}
                        onClick={() => table && canEdit && setSelected(table)}
                        onMouseEnter={(e) => {
                          if (table && canEdit) {
                            e.currentTarget.style.background = STATUS_BG_HOV[table.status] ?? 'var(--hover)';
                            e.currentTarget.style.transform = 'scale(1.06)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (table) {
                            e.currentTarget.style.background = STATUS_BG[table.status] ?? 'transparent';
                            e.currentTarget.style.transform = 'scale(1)';
                          }
                        }}
                      >
                        {table && (<>
                          <span className="mono num font-bold" style={{ fontSize: Math.max(9, Math.floor(cellSize * 0.3)), lineHeight: 1, color: 'var(--ink)' }}>
                            {table.number}
                          </span>
                          {cellSize >= 36 && (
                            <span style={{ fontSize: 8, color: 'var(--mute-2)', lineHeight: 1 }}>{table.seats}p</span>
                          )}
                          {staffAssignmentEnabled && table.status === 'occupied' && staff && (
                            <span style={{
                              width: 5, height: 5, borderRadius: '50%',
                              background: 'var(--ok)',
                              position: 'absolute',
                              bottom: cellSize > 36 ? 4 : 2,
                              right: cellSize > 36 ? 4 : 2,
                              boxShadow: '0 0 0 1.5px var(--paper)',
                            }} />
                          )}
                        </>)}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Legend — only statuses present on the floor */}
            <div style={{ padding: '7px 12px 9px', borderTop: '1px solid rgba(10,10,10,0.07)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
              {STATUSES.filter((s) => activeCounts[s] > 0).map((s) => (
                <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--mute)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: STATUS_DOT[s], display: 'inline-block', flexShrink: 0 }} />
                  {s[0].toUpperCase() + s.slice(1)}
                  <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{activeCounts[s]}</span>
                </span>
              ))}
              {staffAssignmentEnabled && placed.some((t) => t.status === 'occupied' && staffByTable[t.id]) && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--mute)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block', flexShrink: 0 }} />
                  Staffed
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* QR Code Modal */}
      {qrTable && (
        <Modal title={`Table ${qrTable.number} — QR Code`} onClose={() => setQrTable(null)}>
          <p style={{ fontSize: 12.5, color: 'var(--mute)', marginBottom: 16 }}>
            Customers scan this code to view the menu and place orders.
          </p>
          <div className="flex justify-center">
            {qrDataUrl
              ? <img src={qrDataUrl} alt={`QR code for table ${qrTable.number}`} className="h-56 w-56 rounded-[6px]" />
              : <div className="flex h-56 w-56 items-center justify-center rounded-[6px]" style={{ background: 'var(--paper-2)', fontSize: 12, color: 'var(--mute)' }}>Generating…</div>
            }
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleCopyUrl} className="btn-secondary flex flex-1 items-center justify-center gap-1.5">
              {copied ? <Check size={14} style={{ color: 'var(--ok)' }} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            {qrDataUrl && (
              <a
                href={qrDataUrl}
                download={`table-${qrTable.number}-qr.png`}
                className="btn-primary flex flex-1 items-center justify-center gap-1.5 text-center no-underline"
              >
                Download PNG
              </a>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
