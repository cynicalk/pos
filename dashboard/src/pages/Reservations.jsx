import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, UserCheck, UserX, PhoneCall, CalendarClock, ChevronLeft, ChevronRight, Users, Clock, StickyNote, ArrowLeft } from 'lucide-react';
import { useReservations, useCreateReservation, useUpdateReservation, useDeleteReservation, useSeatReservation, useCancelReservation, useNoShowReservation } from '../hooks/useReservations';
import { useTables } from '../hooks/useTables';
import { useTimezone } from '../context/TimezoneContext';
import Modal from '../components/Modal';
import SelectField from '../components/SelectField';

const STATUS_STYLES = {
  upcoming:  { color: 'var(--warn)',   bg: 'rgba(179,120,31,0.10)',  label: 'Upcoming'   },
  seated:    { color: 'var(--ok)',     bg: 'rgba(31,138,91,0.10)',   label: 'Seated'     },
  cancelled: { color: 'var(--mute)',   bg: 'var(--paper-2)',         label: 'Cancelled'  },
  no_show:   { color: 'var(--bad)',    bg: 'rgba(179,55,43,0.08)',   label: 'No-show'    },
};

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const LABEL_STYLE = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', display: 'block', marginBottom: 5 };

const EMPTY_FORM = { tableId: '', guestName: '', guestPhone: '', partySize: '', reservedAt: '', notes: '' };

export default function Reservations() {
  const navigate = useNavigate();
  const { todayLocal } = useTimezone();
  const [date, setDate]             = useState(() => todayLocal());
  const [formOpen, setFormOpen]     = useState(false);
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formError, setFormError]   = useState('');
  const [confirmDel, setConfirmDel] = useState(null);

  const { data: reservations = [], isLoading } = useReservations(date);
  const { data: tables = [] } = useTables();
  const createR = useCreateReservation();
  const updateR = useUpdateReservation();
  const deleteR = useDeleteReservation();
  const seatR   = useSeatReservation();
  const cancelR = useCancelReservation();
  const noShowR = useNoShowReservation();

  function shiftDate(days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  }

  function openAdd() {
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    setForm({ ...EMPTY_FORM, reservedAt: fmtDateTime(now) });
    setEditing(null);
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(r) {
    setForm({
      tableId:    r.table_id    || '',
      guestName:  r.guest_name  || '',
      guestPhone: r.guest_phone || '',
      partySize:  r.party_size  != null ? String(r.party_size) : '',
      reservedAt: fmtDateTime(r.reserved_at),
      notes:      r.notes || '',
    });
    setEditing(r);
    setFormError('');
    setFormOpen(true);
  }

  async function handleSubmit() {
    if (!form.guestName.trim()) { setFormError('Guest name is required.'); return; }
    if (!form.reservedAt)       { setFormError('Arrival time is required.'); return; }
    setFormError('');
    const payload = {
      tableId:    form.tableId    || null,
      guestName:  form.guestName.trim(),
      guestPhone: form.guestPhone.trim() || null,
      partySize:  form.partySize ? parseInt(form.partySize) : null,
      reservedAt: new Date(form.reservedAt).toISOString(),
      notes:      form.notes.trim() || null,
    };
    try {
      if (editing) await updateR.mutateAsync({ id: editing.id, ...payload });
      else         await createR.mutateAsync(payload);
      setFormOpen(false);
    } catch (e) {
      setFormError(e.response?.data?.error || e.message || 'Failed to save');
    }
  }

  const isPending = createR.isPending || updateR.isPending;
  const isToday   = date === todayLocal();

  return (
    <div className="space-y-5">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">

        {/* Left: back + title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/tables')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
              height: 30, padding: '0 10px', borderRadius: 7,
              border: '1px solid var(--line-2)', background: 'var(--paper)',
              color: 'var(--mute)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.background = 'var(--hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--mute)'; e.currentTarget.style.background = 'var(--paper)'; }}
          >
            <ArrowLeft size={12} />
          </button>
          <div className="min-w-0">
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0, lineHeight: 1.2 }}>Reservations</h1>
            <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 1 }}>
              {reservations.length} reservation{reservations.length !== 1 ? 's' : ''} · {isToday ? 'Today' : new Date(date + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Right: date nav + add */}
        <div className="flex items-center gap-2 sm:ml-auto" style={{ flexShrink: 0 }}>
          <div className="flex items-center" style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => shiftDate(-1)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, background: 'transparent', color: 'var(--mute)', cursor: 'pointer' }}>
              <ChevronLeft size={14} />
            </button>
            <input
              type="date" value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ border: 0, background: 'transparent', fontSize: 12, fontWeight: 600, color: 'var(--ink)', padding: '0 2px', cursor: 'pointer', outline: 'none', maxWidth: 130 }}
            />
            <button onClick={() => shiftDate(1)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, background: 'transparent', color: 'var(--mute)', cursor: 'pointer' }}>
              <ChevronRight size={14} />
            </button>
          </div>
          {!isToday && (
            <button onClick={() => setDate(todayLocal())} className="btn btn-sm" style={{ fontSize: 12, flexShrink: 0 }}>Today</button>
          )}
          <button onClick={openAdd} className="btn-primary btn-sm" style={{ flexShrink: 0 }}>
            <Plus size={13} /><span className="hidden xs:inline"> Add</span><span className="hidden sm:inline"> Reservation</span>
          </button>
        </div>
      </div>

      {/* ── List ─────────────────────────────────────────────── */}
      {isLoading ? (
        <p style={{ fontSize: 13, color: 'var(--mute)', textAlign: 'center', padding: '40px 0' }}>Loading…</p>
      ) : reservations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <CalendarClock size={32} style={{ color: 'var(--mute-2)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, color: 'var(--mute)' }}>No reservations for this day</p>
          <button onClick={openAdd} className="btn-primary btn-sm" style={{ marginTop: 14 }}>
            <Plus size={13} /> Add one
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reservations.map((r) => {
            const st     = STATUS_STYLES[r.status] || STATUS_STYLES.upcoming;
            const canAct = r.status === 'upcoming';
            return (
              <div key={r.id} style={{
                background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 12,
                borderLeft: `3px solid ${st.color}`,
                overflow: 'hidden',
              }}>
                {/* Top section: time + info + edit/delete */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px 10px' }}>

                  {/* Time column */}
                  <div style={{ flexShrink: 0, textAlign: 'center', paddingTop: 2 }}>
                    <span className="mono num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', display: 'block' }}>
                      {fmtTime(r.reserved_at)}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 999, background: st.bg, color: st.color, marginTop: 4, display: 'inline-block' }}>
                      {st.label}
                    </span>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: '0 0 5px' }}>{r.guest_name}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px' }}>
                      {r.guest_phone && (
                        <span style={{ fontSize: 12, color: 'var(--mute)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <PhoneCall size={10} /> {r.guest_phone}
                        </span>
                      )}
                      {r.party_size && (
                        <span style={{ fontSize: 12, color: 'var(--mute)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Users size={10} /> {r.party_size} guests
                        </span>
                      )}
                      {r.table_number != null && (
                        <span style={{ fontSize: 12, color: 'var(--mute)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={10} /> Table {r.table_number}
                        </span>
                      )}
                      {r.notes && (
                        <span style={{ fontSize: 12, color: 'var(--mute-2)', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <StickyNote size={10} /> {r.notes}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Edit + delete — always visible */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => openEdit(r)} title="Edit"
                      style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--mute)', cursor: 'pointer' }}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => setConfirmDel(r)} title="Delete"
                      style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--mute)', cursor: 'pointer' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Action bar — only for upcoming, sits at the bottom */}
                {canAct && (
                  <div style={{ display: 'flex', gap: 6, padding: '8px 14px 10px', borderTop: '1px solid var(--line)' }}>
                    <button onClick={() => seatR.mutate(r.id)} disabled={seatR.isPending}
                      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        height: 30, borderRadius: 7, border: '1px solid var(--ok)',
                        background: 'rgba(31,138,91,0.07)', color: 'var(--ok)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <UserCheck size={12} /> Seat
                    </button>
                    <button onClick={() => cancelR.mutate(r.id)} disabled={cancelR.isPending}
                      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        height: 30, borderRadius: 7, border: '1px solid var(--line-2)',
                        background: 'transparent', color: 'var(--mute)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button onClick={() => noShowR.mutate(r.id)} disabled={noShowR.isPending}
                      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        height: 30, borderRadius: 7, border: '1px solid rgba(179,55,43,0.2)',
                        background: 'rgba(179,55,43,0.05)', color: 'var(--bad)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <UserX size={12} /> No-show
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────── */}
      {formOpen && (
        <Modal title={editing ? 'Edit Reservation' : 'New Reservation'} onClose={() => setFormOpen(false)}>
          <div className="space-y-3">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label style={LABEL_STYLE}>Guest Name *</label>
                <input autoFocus type="text" value={form.guestName}
                  onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))}
                  placeholder="e.g. Smith" className="input w-full" />
              </div>
              <div>
                <label style={LABEL_STYLE}>Phone</label>
                <input type="tel" value={form.guestPhone}
                  onChange={(e) => setForm((f) => ({ ...f, guestPhone: e.target.value }))}
                  placeholder="+1 555 0100" className="input w-full" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label style={LABEL_STYLE}>Arrival Time *</label>
                <input type="datetime-local" value={form.reservedAt}
                  onChange={(e) => setForm((f) => ({ ...f, reservedAt: e.target.value }))}
                  className="input w-full" />
              </div>
              <div>
                <label style={LABEL_STYLE}>Party Size</label>
                <input type="number" min="1" value={form.partySize}
                  onChange={(e) => setForm((f) => ({ ...f, partySize: e.target.value }))}
                  placeholder="e.g. 4" className="input w-full" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label style={LABEL_STYLE}>Table (optional)</label>
                <SelectField
                  value={form.tableId}
                  onChange={(v) => setForm((f) => ({ ...f, tableId: v }))}
                  options={[
                    { value: '', label: '— Unassigned —' },
                    ...tables.map((t) => ({ value: t.id, label: `Table ${t.number} (${t.seats}p)` })),
                  ]}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Notes</label>
                <input type="text" value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Allergies, occasion…" className="input w-full" />
              </div>
            </div>

            {formError && <p style={{ fontSize: 12, color: 'var(--bad)' }}>{formError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button className="btn btn-sm btn-ghost" onClick={() => setFormOpen(false)}>Cancel</button>
              <button className="btn-primary btn-sm" onClick={handleSubmit} disabled={isPending}>
                {isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create Reservation'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete confirm ───────────────────────────────────── */}
      {confirmDel && (
        <Modal title="Delete Reservation" onClose={() => setConfirmDel(null)}>
          <p style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 20 }}>
            Delete reservation for <strong style={{ color: 'var(--ink)' }}>{confirmDel.guest_name}</strong> at {fmtTime(confirmDel.reserved_at)}? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: 'var(--bad)', color: '#fff', border: 0 }}
              disabled={deleteR.isPending}
              onClick={async () => { await deleteR.mutateAsync(confirmDel.id); setConfirmDel(null); }}>
              {deleteR.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
