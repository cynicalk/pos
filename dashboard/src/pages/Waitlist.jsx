import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Hourglass, QrCode, Copy, Check, UserPlus, Clock, Users, X } from 'lucide-react';
import { useTables } from '../hooks/useTables';
import {
  useWaitlistQueue, useRestaurant, useAddWalkIn,
  useSeatParty, useCancelParty, useNoShowParty,
} from '../hooks/useWaitlist';

const menuBase = import.meta.env.VITE_MENU_URL || `${window.location.protocol}//${window.location.hostname}:5175`;

const card = { background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 };
const btn = {
  height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--line-2)',
  background: 'var(--paper)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
};
const inputStyle = {
  height: 34, border: '1px solid var(--line-2)', borderRadius: 8, padding: '0 10px',
  fontSize: 13, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', fontFamily: 'inherit',
};

function prefsSummary(prefs) {
  if (!prefs || typeof prefs !== 'object') return '';
  const parts = [];
  if (prefs.purpose) parts.push(prefs.purpose);
  if (prefs.group) parts.push(prefs.group);
  if (Array.isArray(prefs.tastes) && prefs.tastes.length) parts.push(prefs.tastes.join('/'));
  return parts.join(' · ');
}

function DoorQrCard({ restaurant }) {
  const [dataUrl, setDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const url = restaurant?.public_token ? `${menuBase}/wait/${restaurant.public_token}` : '';

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 220, margin: 2, color: { dark: '#0A0A0A' } }).then(setDataUrl).catch(() => {});
  }, [url]);

  function copy() {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  return (
    <div style={{ ...card, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      {dataUrl
        ? <img src={dataUrl} alt="Door QR" width={120} height={120} style={{ borderRadius: 8, flexShrink: 0 }} />
        : <div style={{ width: 120, height: 120, background: 'var(--paper-2)', borderRadius: 8, flexShrink: 0 }} />}
      <div style={{ minWidth: 200, flex: 1 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
          <QrCode size={14} style={{ color: 'var(--mute)' }} />
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Door QR</p>
        </div>
        <p style={{ fontSize: 12, color: 'var(--mute)', margin: '0 0 10px' }}>
          Display this at the entrance / host stand. Walk-in guests scan it to join the waitlist and watch their wait.
        </p>
        <button style={btn} onClick={copy}>
          {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy link</>}
        </button>
      </div>
    </div>
  );
}

function AddWalkIn({ onAdd, pending }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [size, setSize] = useState(2);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    try {
      await onAdd({ guestName: name.trim(), guestPhone: phone.trim() || undefined, partySize: size });
      setName(''); setPhone(''); setSize(2); setOpen(false);
    } catch (e) {
      setErr(e?.response?.data?.error || 'Could not add');
    }
  }

  if (!open) return <button style={{ ...btn, height: 36 }} onClick={() => setOpen(true)}><UserPlus size={14} /> Add walk-in</button>;

  return (
    <div style={{ ...card, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input style={{ ...inputStyle, width: 160 }} placeholder="Guest name" value={name} onChange={(e) => setName(e.target.value)} />
      <input style={{ ...inputStyle, width: 150 }} placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 12, color: 'var(--mute)' }}>Party</span>
        <input type="number" min="1" max="50" style={{ ...inputStyle, width: 64 }} value={size} onChange={(e) => setSize(Math.max(1, parseInt(e.target.value) || 1))} />
      </div>
      <button style={{ ...btn, background: 'var(--ink)', color: 'var(--accent-on)', border: 0 }} disabled={!name.trim() || pending} onClick={submit}>
        {pending ? 'Adding…' : 'Add'}
      </button>
      <button style={btn} onClick={() => { setOpen(false); setErr(''); }}><X size={13} /></button>
      {err && <span style={{ fontSize: 12, color: 'var(--bad)' }}>{err}</span>}
    </div>
  );
}

function QueueRow({ entry, availableTables, onSeat, onCancel, onNoShow, busy }) {
  // Default the seat picker to the table the engine suggested, if it's free.
  const suggested = availableTables.find((t) => t.id === entry.assignedTableId);
  const [tableId, setTableId] = useState(suggested?.id || availableTables[0]?.id || '');
  useEffect(() => {
    if (!availableTables.some((t) => t.id === tableId)) {
      setTableId(suggested?.id || availableTables[0]?.id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableTables.length]);

  const prefs = prefsSummary(entry.prefs);
  const eta = entry.estimatedWaitMinutes;

  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%', background: 'var(--paper-2)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
      }}>{entry.position ?? '·'}</div>

      <div style={{ minWidth: 150, flex: 1 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>{entry.guestName}</p>
        <p style={{ fontSize: 11.5, color: 'var(--mute)', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Users size={11} /> {entry.partySize}{prefs ? ` · ${prefs}` : ''}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: eta == null ? 'var(--mute)' : 'var(--ink)', minWidth: 90 }}>
        <Clock size={13} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{eta == null ? 'calculating…' : eta <= 1 ? '<1 min' : `~${eta} min`}</span>
      </div>

      <div className="flex items-center gap-2">
        <select value={tableId} onChange={(e) => setTableId(e.target.value)} style={{ ...inputStyle, width: 120 }} disabled={!availableTables.length}>
          {availableTables.length === 0 && <option value="">No free table</option>}
          {availableTables.map((t) => (
            <option key={t.id} value={t.id}>Table {t.number} · {t.seats} seats</option>
          ))}
        </select>
        <button
          style={{ ...btn, background: 'var(--ok)', color: '#fff', border: 0, opacity: tableId && !busy ? 1 : 0.5 }}
          disabled={!tableId || busy}
          onClick={() => onSeat(entry.id, tableId)}
        >
          Seat
        </button>
        <button style={btn} disabled={busy} onClick={() => onNoShow(entry.id)}>No-show</button>
        <button style={{ ...btn, color: 'var(--bad)' }} disabled={busy} onClick={() => onCancel(entry.id)}>Cancel</button>
      </div>
    </div>
  );
}

export default function Waitlist() {
  const { data: queue = [] } = useWaitlistQueue();
  const { data: restaurant } = useRestaurant();
  const { data: tables = [] } = useTables();
  const addWalkIn = useAddWalkIn();
  const seatParty = useSeatParty();
  const cancelParty = useCancelParty();
  const noShowParty = useNoShowParty();

  const availableTables = tables.filter((t) => t.status === 'available').sort((a, b) => a.number - b.number);
  const waiting = queue.filter((e) => e.status === 'waiting');
  const busy = seatParty.isPending || cancelParty.isPending || noShowParty.isPending;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px', width: '100%' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div className="flex items-center gap-2">
          <Hourglass size={18} style={{ color: 'var(--ink)' }} />
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Waitlist</h1>
          <span style={{ fontSize: 12, color: 'var(--mute)' }}>{waiting.length} waiting</span>
        </div>
        <AddWalkIn onAdd={(b) => addWalkIn.mutateAsync(b)} pending={addWalkIn.isPending} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <DoorQrCard restaurant={restaurant} />
      </div>

      {waiting.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--mute)', padding: 32 }}>
          <Hourglass size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
          <p style={{ fontSize: 13, margin: 0 }}>No one waiting right now.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {waiting.map((entry) => (
            <QueueRow
              key={entry.id}
              entry={entry}
              availableTables={availableTables}
              busy={busy}
              onSeat={(id, tableId) => seatParty.mutate({ id, tableId })}
              onCancel={(id) => cancelParty.mutate(id)}
              onNoShow={(id) => noShowParty.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
