import { useState, useMemo, useRef, useCallback } from 'react';
import { useSettings } from '../hooks/useSettings';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Check, TrendingUp, TrendingDown, Plus, X,
  CreditCard, Smartphone, Tag, MoreHorizontal, Banknote, Info,
} from 'lucide-react';
import { useCurrency } from '../context/CurrencyContext';
import { useAuth } from '../hooks/useAuth';
import { useShiftSummary, useShiftHistory, useRecordShiftCount } from '../hooks/useShift';
import { formatDate } from '../utils/dateUtils';

function InfoTip({ text }) {
  const [bubble, setBubble] = useState(null);
  const ref = useRef(null);

  const show = useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const top = r.top - 8; // above the icon
    // Clamp horizontally so bubble (max 220px) stays in viewport
    const bubbleW = 220;
    const left = Math.min(Math.max(cx - bubbleW / 2, 8), window.innerWidth - bubbleW - 8);
    setBubble({ left, top });
  }, []);

  const hide = useCallback(() => setBubble(null), []);

  return (
    <span
      ref={ref}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle', cursor: 'help' }}
    >
      <Info size={12} style={{ color: 'var(--mute-2)', flexShrink: 0 }} />
      {bubble && createPortal(
        <span style={{
          position: 'fixed',
          left: bubble.left,
          top: bubble.top,
          transform: 'translateY(-100%)',
          width: 220,
          padding: '7px 10px',
          background: 'var(--ink)', color: 'var(--accent-on)',
          fontSize: 11.5, lineHeight: 1.45, borderRadius: 6,
          pointerEvents: 'none',
          zIndex: 9999,
          whiteSpace: 'normal', textAlign: 'left',
          fontWeight: 400, letterSpacing: 0, textTransform: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,.18)',
        }}>
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}

const DENOMS = {
  INR: [500, 200, 100, 50, 20, 10, 5, 2, 1],
  USD: [100, 50, 20, 10, 5, 2, 1, 0.25, 0.10, 0.05, 0.01],
  EUR: [200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01],
  GBP: [50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01],
  AUD: [100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10, 0.05],
  CAD: [100, 50, 20, 10, 5, 2, 1, 0.25, 0.10, 0.05],
  SGD: [1000, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10, 0.05],
  MYR: [100, 50, 20, 10, 5, 1, 0.50, 0.20, 0.10, 0.05],
  NPR: [1000, 500, 100, 50, 25, 20, 10, 5, 2, 1],
  LKR: [5000, 2000, 1000, 500, 100, 50, 20, 10, 5, 2, 1],
  AED: [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.50, 0.25],
  BDT: [1000, 500, 100, 50, 20, 10, 5, 2, 1],
};

const TABS = [
  { id: 'cash',   label: 'Cash',         Icon: Banknote },
  { id: 'card',   label: 'Credit Card',  Icon: CreditCard },
  { id: 'debit',  label: 'Debit Card',   Icon: CreditCard },
  { id: 'upi',    label: 'UPI / Online', Icon: Smartphone },
  { id: 'coupon', label: 'Coupons',      Icon: Tag },
  { id: 'others', label: 'Others',       Icon: MoreHorizontal },
];

function newRow() {
  return { _key: Math.random(), ref: '', amount: '' };
}

function greedyFill(total, denoms) {
  const result = {};
  let remaining = Math.round(total * 100);
  for (const d of denoms) {
    const dCents = Math.round(d * 100);
    if (dCents <= 0) continue;
    const count = Math.floor(remaining / dCents);
    if (count > 0) {
      result[d] = String(count);
      remaining -= count * dCents;
    }
  }
  return result;
}

function StatTile({ label, value, tone, info }) {
  const color = tone === 'bad' ? 'var(--bad)' : tone === 'ok' ? 'var(--ok)' : 'var(--ink)';
  return (
    <div style={{
      flex: 1, padding: '18px 20px',
      borderRight: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--mute)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {label} {info && <InfoTip text={info} />}
      </span>
      <span className="mono num" style={{ fontSize: 22, fontWeight: 400, color, letterSpacing: '-0.02em', marginTop: 6, lineHeight: 1.1 }}>
        {value}
      </span>
    </div>
  );
}

function PerTabStrip({ expected, counted, fmt }) {
  const v    = counted - expected;
  const tone = Math.abs(v) < 0.01 ? 'ok' : v > 0 ? 'warn' : 'bad';
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : 'var(--bad)';
  const verdictText = Math.abs(v) < 0.01
    ? 'Counted matches expected exactly.'
    : v > 0 ? 'Counted exceeds expected — investigate the source.'
            : 'Counted is less than expected — note the discrepancy.';
  const cells = [
    { label: 'Expected (POS)', val: fmt(expected), color: 'var(--ink)', info: 'Recorded by the POS terminal for this instrument during this shift.' },
    { label: 'Counted',        val: fmt(counted),  color: 'var(--ink)', info: 'Total physically counted or entered for this instrument.' },
    { label: 'Variance',       val: Math.abs(v) < 0.01 ? 'Balanced' : `${v > 0 ? '+' : '−'}${fmt(Math.abs(v))}`, color, info: verdictText },
  ];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
      borderTop: '1px solid var(--line)',
      marginTop: 16,
    }}>
      {cells.map(({ label, val, color: c, info }, i) => (
        <div key={i} style={{
          padding: '14px 18px 14px 0',
          paddingLeft: i === 0 ? 0 : 18,
          borderRight: i < 2 ? '1px solid var(--line)' : 'none',
        }}>
          <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--mute)', marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {label} <InfoTip text={info} align={i === 2 ? 'end' : 'center'} />
          </p>
          <p className="mono num" style={{ fontSize: 18, fontWeight: 400, color: c, letterSpacing: '-0.02em' }}>
            {val}
          </p>
        </div>
      ))}
    </div>
  );
}

function CashPanel({ denoms, counts, setCounts, fmt, symbol }) {
  const bump = (d) => setCounts((p) => ({ ...p, [d]: (parseInt(p[d] || '0') || 0) + 1 }));
  const colA = denoms.slice(0, Math.ceil(denoms.length / 2));
  const colB = denoms.slice(Math.ceil(denoms.length / 2));

  return (
    <div className="space-y-5">
      {/* Quick-tap chips */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--mute)', marginBottom: 10 }}>
          Quick tap
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {denoms.map((d) => {
            const c = parseInt(counts[d] || '0') || 0;
            return (
              <button
                key={d}
                type="button"
                onClick={() => bump(d)}
                style={{
                  position: 'relative',
                  padding: '12px 6px',
                  borderRadius: 8,
                  border: `1px solid ${c > 0 ? 'var(--ink)' : 'var(--line-2)'}`,
                  background: c > 0 ? 'var(--ink)' : 'var(--paper)',
                  color: c > 0 ? 'var(--accent-on)' : 'var(--ink)',
                  fontFamily: 'inherit',
                  fontSize: 13, fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all .12s',
                  textAlign: 'center',
                }}
              >
                {c > 0 && (
                  <span style={{
                    position: 'absolute', top: 5, right: 7,
                    fontSize: 9, opacity: c > 0 ? 0.65 : 0,
                    fontFamily: 'var(--font-mono, monospace)',
                  }}>
                    ×{c}
                  </span>
                )}
                {symbol}{d % 1 === 0 ? d.toLocaleString() : d.toFixed(2)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Denom count rows — 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 36px' }}>
        {[colA, colB].map((col, ci) => (
          <div key={ci}>
            <div style={{
              display: 'grid', gridTemplateColumns: '80px 1fr 90px',
              gap: 10, padding: '5px 4px 8px',
              borderBottom: '1px solid var(--line)',
              marginBottom: 2,
            }}>
              {['Denom.', 'Count', 'Subtotal'].map((h, i) => (
                <span key={h} style={{
                  fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '.12em', color: 'var(--mute)',
                  textAlign: i === 2 ? 'right' : 'left',
                }}>
                  {h}
                </span>
              ))}
            </div>
            {col.map((d) => {
              const cnt = parseInt(counts[d] || '0') || 0;
              const sub = d * cnt;
              return (
                <div key={d} style={{
                  display: 'grid', gridTemplateColumns: '80px 1fr 90px',
                  gap: 10, alignItems: 'center',
                  padding: '5px 4px',
                  borderBottom: '1px dotted var(--line)',
                }}>
                  <span className="mono num" style={{ fontSize: 13, color: cnt > 0 ? 'var(--ink)' : 'var(--mute)' }}>
                    {symbol}{d % 1 === 0 ? d.toLocaleString() : d.toFixed(2)}
                  </span>
                  <input
                    type="number" min="0"
                    value={counts[d] || ''}
                    onChange={(e) => setCounts((p) => ({ ...p, [d]: e.target.value }))}
                    placeholder="0"
                    className="input"
                    style={{ textAlign: 'center', height: 30, fontSize: 13 }}
                  />
                  <span className="mono num" style={{ fontSize: 12, textAlign: 'right', color: cnt > 0 ? 'var(--ink)' : 'var(--mute-2)' }}>
                    {cnt > 0 ? fmt(sub) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MethodPanel({ rows, setRows, addLabel, placeholder }) {
  const update = (i, k, v) => setRows(rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const remove = (i) => setRows(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--mute)', fontStyle: 'italic', padding: '10px 0' }}>
          No entries recorded yet.
        </p>
      ) : (
        rows.map((r, i) => (
          <div key={r._key} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 32px', gap: 8, alignItems: 'center' }}>
            <input
              value={r.ref}
              onChange={(e) => update(i, 'ref', e.target.value)}
              placeholder={placeholder}
              className="input"
              style={{ textAlign: 'left', height: 34, fontSize: 13 }}
            />
            <input
              type="number" min="0" step="0.01"
              value={r.amount}
              onChange={(e) => update(i, 'amount', e.target.value)}
              placeholder="0.00"
              className="input"
              style={{ height: 34, fontSize: 13 }}
            />
            <button
              type="button" onClick={() => remove(i)}
              style={{
                width: 32, height: 32, borderRadius: 6, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'none', border: '1px solid var(--line-2)', cursor: 'pointer', color: 'var(--mute)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--bad)'; e.currentTarget.style.borderColor = 'var(--bad)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--mute)'; e.currentTarget.style.borderColor = 'var(--line-2)'; }}
            >
              <X size={13} />
            </button>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={() => setRows([...rows, newRow()])}
        className="flex items-center gap-2 w-full justify-center"
        style={{
          marginTop: 8, padding: '11px 0',
          borderRadius: 8, border: '1px dashed var(--line-2)',
          background: 'transparent', color: 'var(--mute)',
          fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          letterSpacing: '.04em',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.borderColor = 'var(--ink)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--mute)'; e.currentTarget.style.borderColor = 'var(--line-2)'; }}
      >
        <Plus size={13} /> {addLabel}
      </button>
    </div>
  );
}

export default function ShiftCount() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { code, currency, format } = useCurrency();
  const { data: settings } = useSettings();
  const { data: summary, isLoading: summaryLoading } = useShiftSummary();
  const { data: history = [] } = useShiftHistory();
  const record = useRecordShiftCount();

  const denoms = useMemo(() => {
    if (settings?.cash_denominations) {
      const parsed = settings.cash_denominations.split(',').map((s) => parseFloat(s.trim())).filter((n) => n > 0 && !isNaN(n));
      if (parsed.length > 0) return parsed;
    }
    return DENOMS[code] || null;
  }, [settings, code]);
  const [tab,          setTab]          = useState('cash');
  const [cashCounts,   setCashCounts]   = useState({});
  const [manualTotal,  setManualTotal]  = useState('');
  const [card,         setCard]         = useState([]);
  const [debit,        setDebit]        = useState([]);
  const [upi,          setUpi]          = useState([]);
  const [coupon,       setCoupon]       = useState([]);
  const [others,       setOthers]       = useState([]);
  const [notes,        setNotes]        = useState('');
  const [saved,        setSaved]        = useState(false);

  const fmt = (v) => format(v);
  const sym = currency.symbol;
  const expectedCash = summary ? parseFloat(summary.expectedCash || 0) : 0;

  const sumRows = (rows) => rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  const countedByTab = useMemo(() => {
    const cash = denoms
      ? denoms.reduce((s, d) => s + d * (parseInt(cashCounts[d] || '0') || 0), 0)
      : parseFloat(manualTotal || '0') || 0;
    return {
      cash,
      card:   sumRows(card),
      debit:  sumRows(debit),
      upi:    sumRows(upi),
      coupon: sumRows(coupon),
      others: sumRows(others),
    };
  }, [cashCounts, manualTotal, card, debit, upi, coupon, others, denoms]);

  const expectedByTab = { cash: expectedCash, card: 0, debit: 0, upi: 0, coupon: 0, others: 0 };

  const totalExpected = expectedCash;
  const totalCounted  = Object.values(countedByTab).reduce((a, b) => a + b, 0);
  const variance      = totalCounted - totalExpected;
  const remaining     = Math.max(0, totalExpected - totalCounted);
  const returnAmt     = Math.max(0, variance);

  const rowsByTab = { cash: null, card, debit, upi, coupon, others };
  const setByTab  = { card: setCard, debit: setDebit, upi: setUpi, coupon: setCoupon, others: setOthers };
  const placeholders = {
    card:   'VISA ****4421 or terminal slip',
    debit:  'RuPay ****7782 or terminal slip',
    upi:    'UPI ID / Txn ref',
    coupon: 'Coupon code (e.g. FESTIVE100)',
    others: 'Description (e.g. Cheque #2241)',
  };
  const addLabels = {
    card:   'Add card settlement',
    debit:  'Add debit settlement',
    upi:    'Add online / UPI payment',
    coupon: 'Add coupon',
    others: 'Add other tender',
  };

  const tabBadge = (id) => {
    if (id === 'cash') return Object.values(cashCounts).filter((x) => parseInt(x) > 0).length;
    return (rowsByTab[id] || []).length;
  };

  async function handleSubmit() {
    setSaved(false);
    const cashTotal = countedByTab.cash;
    const denomPayload = denoms
      ? denoms.filter((d) => parseInt(cashCounts[d] || '0') > 0)
               .map((d) => ({ value: d, count: parseInt(cashCounts[d]), subtotal: d * parseInt(cashCounts[d]) }))
      : null;
    await record.mutateAsync({ actualCash: cashTotal, notes, denominations: denomPayload });
    setCashCounts({});
    setManualTotal('');
    setCard([]); setDebit([]); setUpi([]); setCoupon([]); setOthers([]);
    setNotes('');
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (summaryLoading) {
    return <div className="py-12 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</div>;
  }

  const globalVarianceTone = Math.abs(variance) < 0.01 ? 'ok' : variance < 0 ? 'bad' : 'warn';
  const globalVarianceColor = globalVarianceTone === 'ok' ? 'var(--ok)' : globalVarianceTone === 'bad' ? 'var(--bad)' : 'var(--warn)';

  return (
    <div className="space-y-5" style={{ maxWidth: 900 }}>

      {/* ── 4-stat strip ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden',
        background: 'var(--paper)',
      }}>
        <StatTile label="Expected" value={fmt(totalExpected)} info="Total POS-recorded receipts across all payment instruments for this shift." />
        <StatTile label="Tendered" value={fmt(totalCounted)} info="Total physically counted or recorded this session, across all instruments." />
        <StatTile label="Remaining" value={fmt(remaining)} tone={remaining > 0 ? 'bad' : undefined} info={remaining > 0 ? 'Amount still to be counted before the shift can be reconciled.' : 'Nothing left to count — the shift is fully reconciled.'} />
        <div style={{ flex: 1, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--mute)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            Return <InfoTip text={returnAmt > 0 ? 'Amount over-tendered by customers — owed back as change.' : 'Nothing owed to customers.'} align="end" />
          </span>
          <span className="mono num" style={{ fontSize: 22, fontWeight: 400, color: returnAmt > 0 ? 'var(--ok)' : 'var(--ink)', letterSpacing: '-0.02em', marginTop: 6, lineHeight: 1.1 }}>
            {fmt(returnAmt)}
          </span>
        </div>
      </div>

      {/* ── Tab card ─────────────────────────────────────────────── */}
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--paper)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderBottom: '1px solid var(--line)',
        }}>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--mute)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            Tender · By Instrument <InfoTip text="Each tab is one payment instrument. Counts entered here roll up into the top-line totals." align="start" />
          </span>
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                if (denoms) {
                  setCashCounts(greedyFill(expectedCash, denoms));
                } else {
                  setManualTotal(String(expectedCash));
                }
                setTab('cash');
              }}
              style={{ fontSize: 12, color: 'var(--mute)', background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mute)')}
            >
              Auto-fill from POS
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', overflowX: 'auto' }}>
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            const badge  = tabBadge(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                style={{
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '11px 18px',
                  background: 'transparent', border: 0,
                  borderBottom: `2px solid ${active ? 'var(--ink)' : 'transparent'}`,
                  marginBottom: -1,
                  color: active ? 'var(--ink)' : 'var(--mute)',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'color .1s',
                }}
              >
                <Icon size={13} />
                {label}
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 3, minWidth: 18, textAlign: 'center',
                  background: active && badge > 0 ? 'var(--ink)' : badge > 0 ? 'var(--paper-2)' : 'transparent',
                  color: active && badge > 0 ? 'var(--accent-on)' : badge > 0 ? 'var(--mute)' : 'var(--mute-2)',
                  fontFamily: 'var(--font-mono, monospace)',
                }}>
                  {badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Per-tab strip */}
        <div style={{ padding: '0 20px 2px' }}>
          <PerTabStrip
            expected={expectedByTab[tab]}
            counted={countedByTab[tab]}
            fmt={fmt}
          />
        </div>

        {/* Tab body */}
        <div style={{ padding: '20px 20px 24px' }}>
          {tab === 'cash' ? (
            denoms ? (
              <CashPanel
                denoms={denoms}
                counts={cashCounts}
                setCounts={setCashCounts}
                fmt={fmt}
                symbol={sym}
              />
            ) : (
              <div>
                <label className="mb-1 block" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--mute)' }}>
                  Total counted ({sym})
                </label>
                <input
                  type="number" min="0" step="0.01"
                  value={manualTotal}
                  onChange={(e) => setManualTotal(e.target.value)}
                  className="input w-48" placeholder="0.00"
                />
              </div>
            )
          ) : (
            <MethodPanel
              rows={rowsByTab[tab]}
              setRows={setByTab[tab]}
              addLabel={addLabels[tab]}
              placeholder={placeholders[tab]}
            />
          )}

          {/* Cash total footer */}
          {tab === 'cash' && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)',
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--mute)' }}>
                Total counted (cash)
              </span>
              <span className="mono num" style={{ fontSize: 20, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                {fmt(countedByTab.cash)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Global variance strip ─────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        border: '1px solid var(--line-2)', borderRadius: 8,
        background: 'var(--paper)', overflow: 'hidden',
      }}>
        {[
          { label: 'Expected',  val: fmt(totalExpected),  color: 'var(--ink)', info: 'POS total across every payment instrument tendered this shift.' },
          { label: 'Counted',   val: fmt(totalCounted),   color: 'var(--ink)', info: 'Total counted or recorded across all instruments during this session.' },
          {
            label: 'Variance',
            val: Math.abs(variance) < 0.01
              ? 'Balanced'
              : `${variance > 0 ? '+' : '−'}${fmt(Math.abs(variance))}${variance < 0 ? ' short' : ' over'}`,
            color: globalVarianceColor,
            info: Math.abs(variance) < 0.01
              ? 'The drawer balances. Safe to close.'
              : variance < 0
                ? 'Counted is less than expected — note the discrepancy before closing.'
                : 'Counted exceeds expected — investigate the source before closing.',
          },
        ].map(({ label, val, color, info }, i) => (
          <div key={i} style={{
            padding: '20px 24px',
            borderRight: i < 2 ? '1px solid var(--line-2)' : 'none',
          }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--mute)', marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {label} <InfoTip text={info} align={i === 2 ? 'end' : 'center'} />
            </p>
            <p className="mono num" style={{ fontSize: 20, fontWeight: 400, color, letterSpacing: '-0.02em' }}>
              {val}
            </p>
          </div>
        ))}
      </div>

      {/* ── Notes ────────────────────────────────────────────────── */}
      <div>
        <label className="mb-1 block" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--mute)' }}>
          Notes <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Short ₹50 — checked with supervisor. Two coupons redeemed against table 12."
          rows={2}
          className="input"
          style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55 }}
        />
      </div>

      {/* ── Bottom action bar ─────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 8, paddingTop: 4,
      }}>
        {saved && (
          <span className="flex items-center gap-1" style={{ fontSize: 12, color: 'var(--ok)', marginRight: 8 }}>
            <Check size={13} /> Saved
          </span>
        )}
        {record.isError && (
          <span style={{ fontSize: 12, color: 'var(--bad)', marginRight: 8 }}>Failed to save. Try again.</span>
        )}
        <button
          type="button"
          onClick={() => { setCashCounts({}); setManualTotal(''); setCard([]); setDebit([]); setUpi([]); setCoupon([]); setOthers([]); setNotes(''); }}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={record.isPending || countedByTab.cash === 0}
          className="btn-primary disabled:opacity-50"
        >
          {record.isPending ? 'Saving…' : 'Record Count'}
        </button>
      </div>

      {/* ── History ───────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div style={{ paddingTop: 24, borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--mute)' }}>
              Recent Counts
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate('/shift/history')}
                style={{ fontSize: 12, color: 'var(--mute)', background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mute)')}
              >
                View all history →
              </button>
            )}
          </div>
          <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden' }}>
            {history.slice(0, 5).map((h, idx) => {
              const v     = parseFloat(h.variance);
              const over  = v >  0.005;
              const short = v < -0.005;
              return (
                <div
                  key={h.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                    padding: '12px 16px', fontSize: 13,
                    borderBottom: idx < Math.min(history.length, 5) - 1 ? '1px solid var(--line)' : 'none',
                  }}
                >
                  <div className="min-w-0">
                    <p style={{ fontWeight: 500, color: 'var(--ink)' }}>{formatDate(h.counted_at)}</p>
                    <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 2 }}>
                      by {h.counted_by_email || 'unknown'}
                      {h.notes && <> · <span style={{ fontStyle: 'italic' }}>{h.notes}</span></>}
                    </p>
                  </div>
                  <div style={{ marginLeft: 16, flexShrink: 0, textAlign: 'right' }}>
                    <p className="mono num" style={{ fontSize: 11.5, color: 'var(--mute)' }}>
                      Expected {format(parseFloat(h.expected_cash))}
                    </p>
                    <p className="mono num" style={{ fontWeight: 600, color: over ? 'var(--warn)' : short ? 'var(--bad)' : 'var(--ok)' }}>
                      {over ? `+${format(Math.abs(v))}` : short ? `−${format(Math.abs(v))}` : 'Balanced'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
