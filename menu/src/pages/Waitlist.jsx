import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Clock, Users, CheckCircle2, Plus, Minus } from 'lucide-react';
import { useWaitlist } from '../hooks/useWaitlist';

const PURPOSES = ['Chill', 'Work', 'Hangout', 'Celebration'];
const GROUPS   = ['Solo', 'Couple', 'Family', 'Friends'];
const TASTES   = ['Spicy', 'Sweet', 'Savoury', 'Light'];

/* Shared bits ---------------------------------------------------------------- */

function Chip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12.5, fontWeight: 600, transition: 'all .12s',
        border: active ? '1px solid var(--ink)' : '1px solid var(--line-2)',
        background: active ? 'var(--ink)' : 'var(--paper)',
        color: active ? 'var(--accent-on)' : 'var(--ink-2)',
      }}
    >
      {label}
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 7 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: 'var(--mute-2)' }}> · {hint}</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', border: '1px solid var(--line-2)', borderRadius: 9, padding: '11px 13px',
  fontSize: 15, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', fontFamily: 'inherit',
};

/* Header --------------------------------------------------------------------- */

function Header({ name }) {
  return (
    <div style={{ background: 'var(--ink)', padding: '22px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(250,250,248,.5)', textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 3px' }}>
          Waitlist
        </p>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-on)', margin: 0, lineHeight: 1.2 }}>{name}</h1>
      </div>
      <svg width="28" height="28" viewBox="0 0 200 200" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M 154.194 25.409 A 92.2 92.2 0 1 0 154.194 174.591" fill="none" stroke="rgba(250,250,248,0.7)" strokeWidth="15.6" strokeLinecap="round" />
        <circle cx="100" cy="100" r="10.8" fill="#b06a3b" />
      </svg>
    </div>
  );
}

/* Onboarding form ------------------------------------------------------------ */

function Onboarding({ restaurant, onJoin, joining, error }) {
  const [guestName, setGuestName]     = useState('');
  const [guestPhone, setGuestPhone]   = useState('');
  const [partySize, setPartySize]     = useState(2);
  const [extraChair, setExtraChair]   = useState(false);
  const [whatsapp, setWhatsapp]       = useState(false);
  const [purpose, setPurpose]         = useState('');
  const [group, setGroup]             = useState('');
  const [tastes, setTastes]           = useState([]);

  const toggleTaste = (t) => setTastes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  function submit() {
    onJoin({
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim() || undefined,
      partySize,
      allowExtraChair: extraChair,
      whatsappOptIn: whatsapp && !!guestPhone.trim(),
      prefs: { purpose: purpose || null, group: group || null, tastes },
    });
  }

  const canSubmit = guestName.trim().length > 0 && partySize >= 1 && !joining;

  return (
    <div style={{ padding: 18, maxWidth: 480, margin: '0 auto', width: '100%' }}>
      <p style={{ fontSize: 13, color: 'var(--mute)', margin: '4px 0 20px' }}>
        Pop your details in and we’ll estimate your wait for a table.
      </p>

      <Field label="Your name">
        <input style={inputStyle} value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. Priya" maxLength={80} />
      </Field>

      <Field label="Phone" hint="optional">
        <input style={inputStyle} value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="e.g. +1 555 123 4567" inputMode="tel" maxLength={20} />
        {guestPhone.trim() && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, fontSize: 12.5, color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
            Notify me on WhatsApp when my table’s ready
          </label>
        )}
      </Field>

      <Field label="How many people?">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="button" onClick={() => setPartySize((n) => Math.max(1, n - 1))} aria-label="Fewer"
            style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--paper)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Minus size={16} />
          </button>
          <span style={{ fontSize: 22, fontWeight: 700, minWidth: 32, textAlign: 'center' }}>{partySize}</span>
          <button type="button" onClick={() => setPartySize((n) => Math.min(50, n + 1))} aria-label="More"
            style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--paper)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={16} />
          </button>
        </div>
        {restaurant?.allow_extra_chair && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12.5, color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={extraChair} onChange={(e) => setExtraChair(e.target.checked)} />
            We can squeeze in — seat us at a table one smaller if it’s sooner
          </label>
        )}
      </Field>

      <Field label="What brings you in?" hint="helps us recommend">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PURPOSES.map((p) => <Chip key={p} label={p} active={purpose === p} onClick={() => setPurpose(purpose === p ? '' : p)} />)}
        </div>
      </Field>

      <Field label="Who’s with you?">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {GROUPS.map((g) => <Chip key={g} label={g} active={group === g} onClick={() => setGroup(group === g ? '' : g)} />)}
        </div>
      </Field>

      <Field label="Taste" hint="pick any">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TASTES.map((t) => <Chip key={t} label={t} active={tastes.includes(t)} onClick={() => toggleTaste(t)} />)}
        </div>
      </Field>

      {error && (
        <p style={{ fontSize: 12.5, color: 'var(--bad)', margin: '0 0 12px' }}>{error}</p>
      )}

      <button
        onClick={submit}
        disabled={!canSubmit}
        style={{
          width: '100%', padding: '14px', borderRadius: 12, border: 0, cursor: canSubmit ? 'pointer' : 'default',
          background: 'var(--ink)', color: 'var(--accent-on)', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
          opacity: canSubmit ? 1 : 0.5, transition: 'opacity .15s',
        }}
      >
        {joining ? 'Joining…' : 'Join the waitlist'}
      </button>
    </div>
  );
}

/* Status screen -------------------------------------------------------------- */

function Calculating() {
  return (
    <div style={{ textAlign: 'center' }}>
      <style>{`@keyframes wl-gallop { 0%{transform:translateX(-120px)} 100%{transform:translateX(120px)} }`}</style>
      <div style={{ overflow: 'hidden', height: 48, position: 'relative', marginBottom: 10 }}>
        <div style={{ fontSize: 34, display: 'inline-block', animation: 'wl-gallop 1.6s ease-in-out infinite alternate' }}>🐎</div>
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Working out your wait…</p>
      <p style={{ fontSize: 12.5, color: 'var(--mute)', marginTop: 5 }}>
        We’ll have an estimate the moment the tables ahead get going.
      </p>
    </div>
  );
}

function QueuePosition({ position }) {
  if (position == null) return null;
  const ahead = position - 1;
  // The dot row is a delight for short queues only. Past this many parties ahead
  // it would clutter a phone screen, so we drop the dots and let the big number
  // carry it — keeping just the guest's own pulsing marker for the brand beat.
  const DOT_LIMIT = 8;
  const showDots = ahead <= DOT_LIMIT;
  const next = position === 1;

  return (
    <div style={{ marginBottom: 26 }}>
      <style>{`
        @keyframes wl-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(176,106,59,.45); }
          70%  { box-shadow: 0 0 0 9px rgba(176,106,59,0); }
          100% { box-shadow: 0 0 0 0 rgba(176,106,59,0); }
        }
        @keyframes wl-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
      `}</style>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 12,
      }}>
        {showDots && Array.from({ length: ahead }).map((_, i) => (
          <span key={i} style={{
            width: 9, height: 9, borderRadius: '50%', background: 'var(--line-2)',
            animation: `wl-fade-in .3s ease ${i * 0.05}s both`,
          }} />
        ))}
        <span style={{
          width: 15, height: 15, borderRadius: '50%', background: '#b06a3b', flexShrink: 0,
          animation: 'wl-pulse 2s ease-out infinite',
        }} />
      </div>

      <p style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, color: 'var(--ink)', margin: 0 }}>
        {next ? 'You’re next' : <>#{position} <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--mute)' }}>in line</span></>}
      </p>
      <p style={{ fontSize: 12.5, color: 'var(--mute)', margin: '6px 0 0' }}>
        {ahead === 0 ? 'You’re at the front of the queue' : `${ahead} ${ahead === 1 ? 'party' : 'parties'} ahead of you`}
      </p>
    </div>
  );
}

function formatElapsed(min) {
  if (min == null || min < 1) return 'just now';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function Waiting({ entry, onCancel, leaving }) {
  const mins = entry.estimatedWaitMinutes;
  const showCalc = mins == null;

  // Live wall clock — ticks the elapsed counter up and lets the current time
  // creep toward the fixed target time, without ever faking a countdown to 0.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Re-base the absolute target ONLY when the estimate itself changes (i.e. on a
  // poll that returns a new number). Between polls it stays put while "now" moves
  // toward it — so the screen feels live but never promises a time it can't keep.
  const [targetAt, setTargetAt] = useState(null);
  useEffect(() => {
    if (mins == null || mins <= 1) { setTargetAt(null); return; }
    setTargetAt(Date.now() + mins * 60000);
  }, [mins]);

  const joinedMs = entry.joinedAt ? new Date(entry.joinedAt).getTime() : null;
  const elapsedMin = joinedMs ? Math.max(0, Math.floor((now - joinedMs) / 60000)) : null;
  const targetLabel = targetAt
    ? new Date(targetAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div style={{ padding: '32px 18px', maxWidth: 480, margin: '0 auto', width: '100%', textAlign: 'center' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999,
        background: 'var(--paper)', border: '1px solid var(--line-2)', fontSize: 12, fontWeight: 600, color: 'var(--mute)', marginBottom: 24,
      }}>
        <Users size={13} /> Party of {entry.partySize}
      </div>

      <QueuePosition position={entry.position} />

      {showCalc ? (
        <Calculating />
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--mute)', margin: '0 0 6px' }}>Estimated wait</p>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
            <Clock size={26} style={{ color: 'var(--ink)' }} />
            <span style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, color: 'var(--ink)' }}>{mins <= 1 ? '<1' : `~${mins}`}</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--mute)' }}>min</span>
          </div>
          {targetLabel && (
            <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)', marginTop: 8 }}>
              seated around {targetLabel}
            </p>
          )}
          <p style={{ fontSize: 12.5, color: 'var(--mute)', marginTop: 14 }}>
            We’ll keep this updated automatically. Hang tight nearby — we’ll call you when it’s ready.
          </p>
        </>
      )}

      {elapsedMin != null && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 18, padding: '5px 11px',
          borderRadius: 999, background: 'var(--paper)', border: '1px solid var(--line-2)',
          fontSize: 12, fontWeight: 600, color: 'var(--mute)',
        }}>
          <Clock size={12} /> waiting {formatElapsed(elapsedMin)}
        </div>
      )}

      <button
        onClick={onCancel}
        disabled={leaving}
        style={{
          marginTop: 36, padding: '11px 20px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
          border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--bad)', fontSize: 13, fontWeight: 600,
          opacity: leaving ? 0.6 : 1,
        }}
      >
        {leaving ? 'Leaving…' : 'Leave the waitlist'}
      </button>
    </div>
  );
}

function Ready({ entry }) {
  return (
    <div style={{ padding: '48px 18px', maxWidth: 480, margin: '0 auto', width: '100%', textAlign: 'center' }}>
      <CheckCircle2 size={56} style={{ color: 'var(--ok)', margin: '0 auto 18px' }} />
      <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>Your table’s ready!</h2>
      <p style={{ fontSize: 14, color: 'var(--mute)', margin: 0 }}>
        {entry.guestName ? `${entry.guestName}, please ` : 'Please '}head over and see the host to be seated.
      </p>
    </div>
  );
}

/* Page ----------------------------------------------------------------------- */

export default function Waitlist() {
  const { restaurantToken } = useParams();
  const { loading, loadError, restaurant, entry, joining, leaving, error, join, cancel } = useWaitlist(restaurantToken);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--paper-2)' }}>
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center p-8" style={{ background: 'var(--paper-2)' }}>
        <div className="text-center">
          <AlertCircle size={40} style={{ color: 'var(--bad)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, color: 'var(--mute)' }}>{loadError}</p>
        </div>
      </div>
    );
  }

  const seated = entry && entry.status === 'seated';

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--paper-2)' }}>
      <Header name={restaurant?.restaurant_name} />
      <div className="flex-1 overflow-y-auto">
        {!entry && <Onboarding restaurant={restaurant} onJoin={join} joining={joining} error={error} />}
        {entry && !seated && <Waiting entry={entry} onCancel={cancel} leaving={leaving} />}
        {seated && <Ready entry={entry} />}
      </div>
    </div>
  );
}
