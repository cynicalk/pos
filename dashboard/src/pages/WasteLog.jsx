import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { Plus, ChevronDown, ChevronRight, Utensils, FlaskConical, ClipboardCheck, Sparkles, RefreshCw, Lightbulb, MapPin } from 'lucide-react';
import { useWasteLogs, useLogWaste, useLogWasteByMenuItem, useWastageReviews, useResolveWastageReview, useWasteInsights, useGenerateWasteInsight } from '../hooks/useWaste';
import { useUpdateSetting } from '../hooks/useSettings';
import { useGeolocation } from '../hooks/useGeolocation';
import { useIngredients } from '../hooks/useIngredients';
import { useMenuItems } from '../hooks/useMenu';
import { useRecipes } from '../hooks/useRecipes';
import { useAuth } from '../hooks/useAuth';
import Modal from '../components/Modal';
import SelectField from '../components/SelectField';
import { useCurrency } from '../context/CurrencyContext';

const REASONS = ['SPOILAGE', 'SPILL', 'OVERPREP', 'DAMAGED', 'OTHER'];
const REASON_LABELS = {
  SPOILAGE:   'Spoilage',
  SPILL:      'Spill',
  OVERPREP:   'Over-prep',
  DAMAGED:    'Damaged',
  OTHER:      'Other',
  VOID_WASTE: 'Order wastage',
};

const EMPTY_ING_FORM  = { ingredientId: '', quantity: '', reason: 'SPOILAGE', notes: '' };
const EMPTY_ITEM_FORM = { menuItemId: '', portions: '1', reason: 'OVERPREP', notes: '' };

function today() { return new Date().toISOString().slice(0, 10); }
function fmtDate(ts) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// ── Grouped log display ──────────────────────────────────────────────────────

function BatchGroup({ logs, format }) {
  const [open, setOpen] = useState(true);
  const batchCost = logs.reduce((s, l) => s + parseFloat(l.total_cost || 0), 0);
  const first = logs[0];

  return (
    <>
      {/* Group header — one <td> per column so everything aligns under the headers */}
      <tr
        style={{
          background: 'rgba(180,83,9,.06)',
          borderBottom: '1px solid rgba(180,83,9,.18)',
          borderLeft: '3px solid rgba(180,83,9,.45)',
          cursor: 'pointer',
        }}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Ingredient / Item */}
        <td style={{ padding: '8px 16px' }}>
          <div className="flex items-center gap-2">
            {open
              ? <ChevronDown size={13} style={{ color: 'var(--mute)', flexShrink: 0 }} />
              : <ChevronRight size={13} style={{ color: 'var(--mute)', flexShrink: 0 }} />}
            <Utensils size={13} style={{ color: 'var(--mute)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
              {first.menu_item_name}
            </span>
            <span style={{ fontSize: 11.5, color: '#a16207' }}>
              · {logs.length} ingredient{logs.length !== 1 ? 's' : ''}
            </span>
          </div>
        </td>

        {/* Qty — empty at group level */}
        <td style={{ padding: '8px 16px' }} />

        {/* Reason */}
        <td style={{ padding: '8px 16px' }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
            background: 'rgba(180,83,9,.1)', border: '1px solid rgba(180,83,9,.25)', color: '#92400e',
          }}>
            {REASON_LABELS[first.reason] || first.reason}
          </span>
        </td>

        {/* Unit cost — empty at group level */}
        <td style={{ padding: '8px 16px' }} />

        {/* Total cost */}
        <td className="mono num" style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#b91c1c' }}>
          {format(batchCost)}
        </td>

        {/* Logged at */}
        <td style={{ padding: '8px 16px', fontSize: 12, color: '#a16207' }}>
          {fmtDate(first.logged_at)}
        </td>
      </tr>

      {/* Ingredient rows */}
      {open && logs.map((log) => (
        <tr
          key={log.id}
          style={{ borderBottom: '1px solid var(--line)', transition: 'background .1s' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <td style={{ padding: '8px 16px 8px 40px' }}>
            <div className="flex items-center gap-2">
              <FlaskConical size={11} style={{ color: 'var(--mute-2)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>{log.ingredient_name}</span>
              {log.notes && <span style={{ fontSize: 11, color: 'var(--mute)' }}>— {log.notes}</span>}
            </div>
          </td>
          <td className="mono num" style={{ padding: '8px 16px', fontSize: 13, color: 'var(--ink)' }}>
            {parseFloat(log.quantity).toFixed(3)} {log.unit}
          </td>
          <td style={{ padding: '8px 16px', fontSize: 12, color: 'var(--mute-2)' }}>—</td>
          <td className="mono num" style={{ padding: '8px 16px', fontSize: 12, color: 'var(--mute)' }}>
            {format(log.cost_at_time)}
          </td>
          <td className="mono num" style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
            {format(log.total_cost)}
          </td>
          <td style={{ padding: '8px 16px', fontSize: 12, color: 'var(--mute-2)' }}>—</td>
        </tr>
      ))}
    </>
  );
}

function SingleRow({ log, format }) {
  return (
    <tr
      style={{ borderBottom: '1px solid var(--line)', transition: 'background .1s' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <td style={{ padding: '10px 16px' }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{log.ingredient_name}</p>
        {log.notes && <p style={{ fontSize: 11, color: 'var(--mute)', marginTop: 1 }}>{log.notes}</p>}
      </td>
      <td className="mono num" style={{ padding: '10px 16px', fontSize: 13, color: 'var(--ink)' }}>
        {parseFloat(log.quantity)} {log.unit}
      </td>
      <td style={{ padding: '10px 16px' }}>
        <span style={{
          fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
          background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)',
        }}>
          {REASON_LABELS[log.reason] || log.reason}
        </span>
      </td>
      <td className="mono num" style={{ padding: '10px 16px', fontSize: 12, color: 'var(--mute)' }}>
        {format(log.cost_at_time)}
      </td>
      <td className="mono num" style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
        {format(log.total_cost)}
      </td>
      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--mute)' }}>
        {fmtDate(log.logged_at)}
      </td>
    </tr>
  );
}

// ── ReviewModal ──────────────────────────────────────────────────────────────
// Per-ingredient decision: each ingredient gets a Waste / Return / Split toggle.
// Waste   → all goes to waste log (cost charged, stock stays out)
// Return  → all goes back to inventory (stock restored via RETURN transaction)
// Split   → custom quantities for each outcome

function IngredientDecision({ ing, idx, onChange, format }) {
  const def   = parseFloat(ing.default_qty);
  const mode  = ing.mode ?? 'waste';

  function setMode(m) {
    if (m === 'waste')  onChange(idx, { mode: 'waste',  wasted_qty: def,  returned_qty: 0 });
    if (m === 'return') onChange(idx, { mode: 'return', wasted_qty: 0,    returned_qty: def });
    if (m === 'split')  onChange(idx, {
      mode: 'split',
      wasted_qty:   parseFloat((def / 2).toFixed(6)),
      returned_qty: parseFloat((def / 2).toFixed(6)),
    });
  }

  function onSplitWasted(val) {
    const w = Math.max(0, Math.min(parseFloat(val) || 0, def));
    onChange(idx, { mode: 'split', wasted_qty: w, returned_qty: parseFloat((def - w).toFixed(6)) });
  }
  function onSplitReturned(val) {
    const r = Math.max(0, Math.min(parseFloat(val) || 0, def));
    onChange(idx, { mode: 'split', wasted_qty: parseFloat((def - r).toFixed(6)), returned_qty: r });
  }

  const wasteCost = parseFloat(ing.wasted_qty ?? (mode === 'waste' ? def : 0)) * (ing.unit_cost || 0);

  const modeBtn = (m, label, color) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      style={{
        flex: 1, fontSize: 11.5, fontWeight: 600, padding: '5px 0', border: 0,
        cursor: 'pointer', fontFamily: 'inherit', transition: 'background .1s',
        background: mode === m ? (m === 'waste' ? 'rgba(179,55,43,.12)' : m === 'return' ? 'rgba(22,163,74,.12)' : 'var(--paper-2)') : 'transparent',
        color: mode === m ? (m === 'waste' ? 'var(--bad)' : m === 'return' ? 'var(--ok)' : 'var(--ink)') : 'var(--mute)',
        borderBottom: mode === m ? `2px solid ${m === 'waste' ? 'var(--bad)' : m === 'return' ? 'var(--ok)' : 'var(--ink)'}` : '2px solid transparent',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden', background: 'var(--paper)' }}>
      {/* Ingredient header */}
      <div className="flex items-center justify-between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{ing.ingredient_name}</span>
          <span className="mono num ml-2" style={{ fontSize: 11.5, color: 'var(--mute)' }}>
            {def.toFixed(3)} {ing.unit}
          </span>
        </div>
        <span className="mono num" style={{ fontSize: 12, color: mode === 'return' ? 'var(--ok)' : 'var(--bad)', fontWeight: 600 }}>
          {mode === 'return' ? `+${format(def * (ing.unit_cost || 0))}` : `−${format(wasteCost)}`}
        </span>
      </div>

      {/* Mode toggle */}
      <div className="flex" style={{ borderBottom: mode === 'split' ? '1px solid var(--line)' : 'none' }}>
        {modeBtn('waste',  '🗑 Waste',     'var(--bad)')}
        {modeBtn('return', '↩ Return',    'var(--ok)')}
        {modeBtn('split',  '⟺ Split',   'var(--ink)')}
      </div>

      {/* Split controls */}
      {mode === 'split' && (
        <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--bad)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              🗑 Wasted ({ing.unit})
            </label>
            <input
              type="number" step="0.001" min="0" max={def}
              value={ing.wasted_qty ?? def / 2}
              onChange={(e) => onSplitWasted(e.target.value)}
              className="input" style={{ fontSize: 12 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--ok)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              ↩ Returned ({ing.unit})
            </label>
            <input
              type="number" step="0.001" min="0" max={def}
              value={ing.returned_qty ?? def / 2}
              onChange={(e) => onSplitReturned(e.target.value)}
              className="input" style={{ fontSize: 12 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewModal({ review, onClose, format }) {
  const resolve = useResolveWastageReview();
  const [error, setError] = useState('');

  const [ings, setIngs] = useState(() =>
    (review.ingredients || []).map((ing) => ({
      ...ing,
      mode:         'waste',
      wasted_qty:   parseFloat(ing.default_qty ?? 0),
      returned_qty: 0,
    })),
  );

  function updateIng(idx, patch) {
    setIngs((prev) => prev.map((ing, i) => i === idx ? { ...ing, ...patch } : ing));
  }

  async function handleSubmit(e) {
    if (e?.preventDefault) e.preventDefault();
    setError('');
    try {
      await resolve.mutateAsync({ id: review.id, ingredients: ings });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resolve review');
    }
  }

  const hasIngredients    = ings.length > 0;
  const totalWastedCost   = ings.reduce((s, i) => s + parseFloat(i.wasted_qty   ?? 0) * (i.unit_cost || 0), 0);
  const totalReturnedCost = ings.reduce((s, i) => s + parseFloat(i.returned_qty ?? 0) * (i.unit_cost || 0), 0);

  return (
    <Modal title={`Wastage Review — ${review.menu_item_name}`} onClose={onClose}>
      <div className="space-y-4">

        {/* Summary strip */}
        <div className="rounded-[7px] p-3 space-y-1.5" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between" style={{ fontSize: 12.5 }}>
            <span style={{ color: 'var(--mute)' }}>Cancelled item</span>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
              {review.menu_item_name}
              <span style={{ fontWeight: 400, color: 'var(--mute)', marginLeft: 5 }}>×{review.quantity}</span>
            </span>
          </div>
          {review.cancel_reason && (
            <div className="flex items-start justify-between gap-4" style={{ fontSize: 12.5 }}>
              <span style={{ color: 'var(--mute)', flexShrink: 0 }}>Reason</span>
              <span style={{ color: 'var(--ink)', textAlign: 'right', fontStyle: 'italic' }}>{review.cancel_reason}</span>
            </div>
          )}
        </div>

        {!hasIngredients ? (
          <>
            <div className="rounded-[7px] p-4 space-y-1" style={{ background: 'rgba(180,83,9,.05)', border: '1px solid rgba(180,83,9,.2)' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#92400e', margin: 0 }}>
                No recipe linked to this item
              </p>
              <p style={{ fontSize: 12, color: '#a16207', margin: 0, lineHeight: 1.5 }}>
                <strong>{review.menu_item_name}</strong> has no recipe, so ingredient-level waste tracking isn't available.
                The cost of this item has already been deducted from inventory at order time.
                Mark it as reviewed to close this entry.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={handleSubmit} disabled={resolve.isPending} className="btn-primary flex-1 justify-center">
                <ClipboardCheck size={13} /> {resolve.isPending ? 'Saving…' : 'Mark as Reviewed'}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">

            <p style={{ fontSize: 11, color: 'var(--mute)', margin: 0 }}>
              For each ingredient decide what happened:
              <span style={{ color: 'var(--bad)', fontWeight: 600 }}> Waste</span> logs the cost,
              <span style={{ color: 'var(--ok)', fontWeight: 600 }}> Return</span> puts it back in stock,
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}> Split</span> lets you enter exact quantities.
            </p>

            {/* Per-ingredient decisions */}
            <div className="space-y-2">
              {ings.map((ing, idx) => (
                <IngredientDecision
                  key={ing.ingredient_id}
                  ing={ing}
                  idx={idx}
                  onChange={updateIng}
                  format={format}
                />
              ))}
            </div>

            {/* Totals */}
            {(totalWastedCost > 0 || totalReturnedCost > 0) && (
              <div
                className="flex items-center justify-between rounded-[7px] px-3 py-2"
                style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', fontSize: 12.5 }}
              >
                <span style={{ color: 'var(--bad)', fontWeight: 600 }}>
                  🗑 Waste cost: <span className="mono num">{format(totalWastedCost)}</span>
                </span>
                <span style={{ color: 'var(--ok)', fontWeight: 600 }}>
                  ↩ Return value: <span className="mono num">{format(totalReturnedCost)}</span>
                </span>
              </div>
            )}

            {error && (
              <p style={{ fontSize: 12, color: 'var(--bad)', background: 'rgba(179,55,43,.06)', padding: '8px 12px', borderRadius: 6 }}>
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button type="submit" disabled={resolve.isPending} className="btn-primary flex-1 justify-center">
                <ClipboardCheck size={13} /> {resolve.isPending ? 'Saving…' : 'Confirm & Log'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

// ── PendingReviews ────────────────────────────────────────────────────────────
// Card list of unresolved wastage items waiting for admin review.

function PendingReviews({ format, isAdmin }) {
  const { data: reviews = [], isLoading } = useWastageReviews('pending');
  const [active, setActive] = useState(null);

  if (isLoading) return null;
  if (reviews.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
          Pending Wastage Reviews
        </h2>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
          background: 'rgba(180,83,9,.12)', color: '#b45309', border: '1px solid rgba(180,83,9,.25)',
        }}>
          {reviews.length}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {reviews.map((review) => {
          const totalCost = (review.ingredients || []).reduce(
            (s, i) => s + parseFloat(i.wasted_qty ?? i.default_qty ?? 0) * (i.unit_cost || 0), 0,
          );
          const ingCount = (review.ingredients || []).length;
          const ago = (() => {
            const m = Math.floor((Date.now() - new Date(review.created_at).getTime()) / 60_000);
            if (m < 1) return 'just now';
            if (m < 60) return `${m}m ago`;
            return `${Math.floor(m / 60)}h ago`;
          })();

          return (
            <div
              key={review.id}
              style={{
                background: 'var(--paper)', border: '1px solid rgba(180,83,9,.25)',
                borderRadius: 10, padding: '14px 16px',
                boxShadow: '0 1px 4px rgba(180,83,9,.08)',
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                    {review.menu_item_name}
                  </p>
                  <p style={{ fontSize: 11.5, color: 'var(--mute)', margin: '2px 0 0' }}>
                    ×{review.quantity} · {ingCount} ingredient{ingCount !== 1 ? 's' : ''} · {ago}
                  </p>
                </div>
                <span className="mono num" style={{ fontSize: 13, fontWeight: 600, color: 'var(--bad)', flexShrink: 0 }}>
                  {format(totalCost)}
                </span>
              </div>

              {review.cancel_reason && (
                <p style={{
                  fontSize: 11.5, color: 'var(--mute)', margin: '0 0 10px',
                  background: 'var(--paper-2)', padding: '5px 8px', borderRadius: 5,
                  borderLeft: '2px solid rgba(180,83,9,.3)',
                }}>
                  "{review.cancel_reason}"
                </p>
              )}

              {isAdmin ? (
                <button
                  onClick={() => setActive(review)}
                  className="btn-primary btn-sm w-full justify-center"
                  style={{ marginTop: 4 }}
                >
                  <ClipboardCheck size={12} /> Review & Decide
                </button>
              ) : (
                <div
                  className="w-full flex items-center justify-center gap-1.5"
                  style={{ marginTop: 4, padding: '5px 0', fontSize: 11.5, color: 'var(--mute)', background: 'var(--paper-2)', borderRadius: 6, border: '1px solid var(--line)' }}
                >
                  Awaiting admin review
                </div>
              )}
            </div>
          );
        })}
      </div>

      {active && (
        <ReviewModal review={active} onClose={() => setActive(null)} format={format} />
      )}
    </div>
  );
}

// ── AI Insights ───────────────────────────────────────────────────────────────

function Stat({ label, value }) {
  return (
    <div style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper-2)' }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</p>
      <p className="mono num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginTop: 2 }}>{value}</p>
    </div>
  );
}

const linkBtn = {
  background: 'none', border: 'none', padding: 0, font: 'inherit',
  color: '#2563eb', textDecoration: 'underline', cursor: 'pointer',
};

// Pill that flags model-written content, to distinguish it from the computed stats.
function AiBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
      color: '#4f73a8', background: 'rgba(79,115,168,.12)', border: '1px solid rgba(79,115,168,.30)',
      borderRadius: 999, padding: '1px 7px',
    }}>
      <Sparkles size={10} /> AI-generated
    </span>
  );
}

function WasteInsights({ format }) {
  const { data: insight, isLoading } = useWasteInsights();
  const generate = useGenerateWasteInsight();
  const geo = useGeolocation();
  const updateSetting = useUpdateSetting();

  const cs = insight?.correlation_scores;
  const worst = cs?.worst_weekday;            // null unless statistically distinguishable
  const w = cs?.weather;
  const noWeatherSignal = w && !w.rainfall?.significant && !w.temperature?.significant;
  const needsLocation = insight && !insight.weather_available;

  const [locBusy, setLocBusy] = useState(false);
  const [locMsg, setLocMsg] = useState(null);
  const autoTried = useRef(false);

  // Capture coordinates the moment we have permission, then re-run with weather.
  const enableLocation = useCallback(async () => {
    setLocBusy(true);
    setLocMsg(null);
    try {
      const { latitude, longitude } = await geo.request();
      await updateSetting.mutateAsync({ key: 'latitude', value: String(latitude) });
      await updateSetting.mutateAsync({ key: 'longitude', value: String(longitude) });
      setLocMsg('Location saved — refreshing insights with weather…');
      generate.mutate();
    } catch {
      /* geo.permission now reflects denied/unsupported; the UI reacts to it */
    } finally {
      setLocBusy(false);
    }
  }, [geo, updateSetting, generate]);

  // If the browser already holds the permission but we never stored coordinates,
  // grab them once automatically — no extra click needed.
  useEffect(() => {
    if (autoTried.current) return;
    if (needsLocation && geo.permission === 'granted') {
      autoTried.current = true;
      enableLocation();
    }
  }, [needsLocation, geo.permission, enableLocation]);

  // Shown at the top of the panel so a missing location is the first thing seen.
  const locationPrompt = needsLocation && (
    <div className="rounded-[8px] p-3" style={{ border: '1px solid var(--line-2)', background: 'var(--paper-2)' }}>
      <div className="flex items-start gap-2">
        <MapPin size={15} style={{ color: '#2563eb', flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Add your location for weather insights</p>
          <p style={{ fontSize: 11.5, color: 'var(--mute)', margin: '2px 0 0' }}>
            Rainfall and temperature are strong drivers of perishable waste. Enabling location lets us correlate them with your daily waste.
          </p>

          {geo.permission === 'denied' ? (
            <p style={{ fontSize: 11.5, color: 'var(--bad)', margin: '8px 0 0', lineHeight: 1.5 }}>
              Location is blocked for this site. Allow it from your browser (address-bar lock icon → Location → Allow), then{' '}
              <button type="button" onClick={enableLocation} disabled={locBusy} style={linkBtn}>try again</button>
              {' '}— or enter coordinates manually in <strong>Settings → Location</strong>.
            </p>
          ) : geo.permission === 'unsupported' ? (
            <p style={{ fontSize: 11.5, color: 'var(--mute)', margin: '8px 0 0' }}>
              This device can't share location automatically — enter coordinates in <strong>Settings → Location</strong>.
            </p>
          ) : (
            <button type="button" onClick={enableLocation} disabled={locBusy} className="btn btn-sm disabled:opacity-50" style={{ gap: 5, marginTop: 8 }}>
              <MapPin size={12} className={locBusy ? 'animate-pulse' : ''} />
              {locBusy ? 'Enabling…' : 'Enable location'}
            </button>
          )}

          {locMsg && <p style={{ fontSize: 11.5, color: 'var(--mute)', margin: '6px 0 0' }}>{locMsg}</p>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <p style={{ fontSize: 12.5, color: 'var(--mute)' }}>
          {insight
            ? `Analysis for ${String(insight.period_start).slice(0, 10)} – ${String(insight.period_end).slice(0, 10)} · ${insight.generated_by === 'manual' ? 'manual run' : 'weekly'}`
            : 'Weekly AI analysis of your waste patterns — root causes, worst days, and (with location set) weather correlation.'}
        </p>
        <button onClick={() => generate.mutate()} disabled={generate.isPending} className="ml-auto btn btn-sm disabled:opacity-50" style={{ gap: 5 }}>
          <RefreshCw size={12} className={generate.isPending ? 'animate-spin' : ''} />
          {generate.isPending ? 'Analysing…' : insight ? 'Refresh analysis' : 'Generate analysis'}
        </button>
      </div>

      {locationPrompt}

      {isLoading ? (
        <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</div>
      ) : !insight ? (
        <div className="py-16 text-center rounded-[8px]" style={{ fontSize: 13, color: 'var(--mute)', border: '1px dashed var(--line-2)' }}>
          No analysis yet — click <strong>Generate analysis</strong> to run it.
        </div>
      ) : (
        <>
          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
              <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', margin: 0 }}>AI Summary</h3>
              <AiBadge />
            </div>
            <div className="rounded-[8px] p-3" style={{ background: 'rgba(79,115,168,.06)', border: '1px solid rgba(79,115,168,.22)' }}>
              <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.55, margin: 0 }}>{insight.analysis}</p>
            </div>
            <p style={{ fontSize: 10.5, color: 'var(--mute)', marginTop: 6, fontStyle: 'italic' }}>
              AI-generated from your waste data — may be imperfect. Verify before acting on it.
            </p>
          </div>

          {insight.recommendations?.length > 0 && (
            <div>
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', margin: 0 }}>Recommendations</h3>
                <AiBadge />
              </div>
              <div className="space-y-2">
                {insight.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-[6px] p-2.5" style={{ border: '1px solid var(--line)' }}>
                    <Lightbulb size={13} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <p style={{ fontSize: 12.5, color: 'var(--ink)', margin: 0 }}>
                        {r.ingredient ? <strong>{r.ingredient}: </strong> : null}{r.action}
                      </p>
                      {r.quantified_impact != null && (
                        <p style={{ fontSize: 11, color: 'var(--mute)', marginTop: 1 }}>~{format(r.quantified_impact)} at stake</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', marginBottom: 8 }}>Computed from your data</h3>
            <div className="flex flex-wrap gap-3">
              <Stat label="Waste (28d)" value={format(cs?.total_cost ?? 0)} />
              {worst && <Stat label="Worst weekday" value={`${worst.weekday} · ${format(worst.avg_cost)}/day ±${format(worst.sd)}`} />}
              {w?.rainfall?.significant && <Stat label="Rain ↔ waste" value={`ρ ${w.rainfall.r} · p ${w.rainfall.p}`} />}
              {w?.temperature?.significant && <Stat label="Temp ↔ waste" value={`ρ ${w.temperature.r} · p ${w.temperature.p}`} />}
            </div>
          </div>
          {noWeatherSignal && (
            <p style={{ fontSize: 11.5, color: 'var(--mute)' }}>No statistically significant weather correlation in this period.</p>
          )}

          {cs?.top_items?.length > 0 && (
            <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                <thead>
                  <tr style={{ background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
                    {['Top wasted item', 'Qty', 'Events', 'Cost'].map((h) => (
                      <th key={h} style={{ padding: '7px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cs.top_items.slice(0, 6).map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '7px 14px', fontSize: 13, color: 'var(--ink)' }}>{t.ingredient}</td>
                      <td className="mono num" style={{ padding: '7px 14px', fontSize: 12, color: 'var(--mute)' }}>{t.quantity} {t.unit}</td>
                      <td className="mono num" style={{ padding: '7px 14px', fontSize: 12, color: 'var(--mute)' }}>{t.events}</td>
                      <td className="mono num" style={{ padding: '7px 14px', fontSize: 13, color: 'var(--ink)' }}>{format(t.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function WasteLog() {
  const { isAdmin } = useAuth();
  // Deep links (e.g. Yumzy's "Open in Waste Log") can preset the date range
  const [searchParams] = useSearchParams();
  const [from, setFrom] = useState(() => searchParams.get('from') || today());
  const [to,   setTo]   = useState(() => searchParams.get('to') || today());
  const [modal, setModal] = useState(false);
  // The view is driven by the URL so AI Insights has its own address
  // (/waste-log/waste-insights) and is linkable/bookmarkable.
  const location = useLocation();
  const navigate = useNavigate();
  const view = location.pathname.endsWith('/waste-insights') ? 'insights' : 'log';
  const [tab,   setTab]   = useState('item'); // modal tabs: 'item' | 'ingredient'
  const [ingForm,  setIngForm]  = useState(EMPTY_ING_FORM);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM);

  const { data: logs        = [], isLoading } = useWasteLogs(from, to);
  const { data: ingredients = [] }            = useIngredients();
  const { data: menuItems   = [] }            = useMenuItems();
  const { data: recipes     = [] }            = useRecipes();
  const { format }                            = useCurrency();
  const logWaste          = useLogWaste();
  const logWasteByItem    = useLogWasteByMenuItem();

  const totalCost = logs.reduce((s, l) => s + parseFloat(l.total_cost || 0), 0);

  // Only menu items that have a recipe linked
  const menuItemsWithRecipe = useMemo(
    () => menuItems.filter((m) => m.recipe_id),
    [menuItems],
  );

  // Preview: ingredients for selected menu item × portions
  const selectedRecipe = useMemo(() => {
    if (!itemForm.menuItemId) return null;
    const item = menuItems.find((m) => m.id === itemForm.menuItemId);
    if (!item?.recipe_id) return null;
    return recipes.find((r) => r.id === item.recipe_id) || null;
  }, [itemForm.menuItemId, menuItems, recipes]);

  const previewIngredients = useMemo(() => {
    if (!selectedRecipe) return [];
    const portions  = parseFloat(itemForm.portions) || 1;
    const yieldQty  = parseFloat(selectedRecipe.yield_quantity) || 1;
    return selectedRecipe.ingredients.map((ing) => ({
      ...ing,
      calculatedQty: parseFloat((parseFloat(ing.quantity) * portions / yieldQty).toFixed(4)),
    }));
  }, [selectedRecipe, itemForm.portions]);

  // Group logs: batch entries together, singles standalone
  const grouped = useMemo(() => {
    const seen    = new Set();
    const result  = [];
    for (const log of logs) {
      if (!log.batch_id) {
        result.push({ type: 'single', log });
      } else if (!seen.has(log.batch_id)) {
        seen.add(log.batch_id);
        result.push({ type: 'batch', batchId: log.batch_id, logs: logs.filter((l) => l.batch_id === log.batch_id) });
      }
    }
    return result;
  }, [logs]);

  function openModal() {
    setIngForm(EMPTY_ING_FORM);
    setItemForm(EMPTY_ITEM_FORM);
    setModal(true);
  }

  async function handleIngredientSubmit(e) {
    e.preventDefault();
    await logWaste.mutateAsync({
      ingredientId: ingForm.ingredientId,
      quantity:     parseFloat(ingForm.quantity),
      reason:       ingForm.reason,
      notes:        ingForm.notes || undefined,
    });
    setIngForm(EMPTY_ING_FORM);
    setModal(false);
  }

  async function handleItemSubmit(e) {
    e.preventDefault();
    await logWasteByItem.mutateAsync({
      menuItemId: itemForm.menuItemId,
      portions:   parseFloat(itemForm.portions),
      reason:     itemForm.reason,
      notes:      itemForm.notes || undefined,
    });
    setItemForm(EMPTY_ITEM_FORM);
    setModal(false);
  }

  const isSaving = logWaste.isPending || logWasteByItem.isPending;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Waste Log</h1>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
            {logs.length} entries · total cost <strong style={{ color: 'var(--ink)' }}>{format(totalCost)}</strong>
          </p>
        </div>
        {view === 'log' && (
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="input" style={{ height: 32, width: 130, fontSize: 12 }} />
              <span style={{ fontSize: 12, color: 'var(--mute)' }}>–</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="input" style={{ height: 32, width: 130, fontSize: 12 }} />
            </div>
            <button onClick={openModal} className="btn-primary">
              <Plus size={13} /> Log waste
            </button>
          </div>
        )}
      </div>

      {/* Page tabs — navigate so each view has its own URL */}
      <div className="flex gap-0" style={{ borderBottom: '1px solid var(--line)' }}>
        {[['log', 'Log', '/waste-log'], ['insights', 'AI Insights', '/waste-log/waste-insights']].map(([k, label, path]) => (
          <button
            key={k}
            onClick={() => navigate(path)}
            className="flex items-center gap-1.5"
            style={{
              height: 34, padding: '0 16px', background: 'transparent', border: 0,
              borderBottom: view === k ? '2px solid var(--ink)' : '2px solid transparent',
              marginBottom: -1, fontSize: 13, fontWeight: view === k ? 600 : 400,
              color: view === k ? 'var(--ink)' : 'var(--mute)', cursor: 'pointer',
            }}
          >
            {k === 'insights' && <Sparkles size={13} />}{label}
          </button>
        ))}
      </div>

      {view === 'insights' && <WasteInsights format={format} />}

      {/* Pending wastage reviews — visible to all staff, resolvable by admin only */}
      {view === 'log' && <PendingReviews format={format} isAdmin={isAdmin} />}

      {/* Table */}
      {view === 'log' && (isLoading ? (
        <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</div>
      ) : grouped.length === 0 ? (
        <div className="py-16 text-center rounded-[8px]" style={{ fontSize: 13, color: 'var(--mute)', border: '1px dashed var(--line-2)' }}>
          No waste recorded for this period
        </div>
      ) : (
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ background: 'var(--paper-2)', borderBottom: '2px solid var(--line)' }}>
                  {['Ingredient / Item', 'Qty', 'Reason', 'Unit cost', 'Total cost', 'Logged at'].map((h) => (
                    <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map((entry) =>
                  entry.type === 'batch'
                    ? <BatchGroup key={entry.batchId} logs={entry.logs} format={format} />
                    : <SingleRow  key={entry.log.id}  log={entry.log}   format={format} />
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Log Waste Modal */}
      {modal && (
        <Modal title="Log Waste" onClose={() => setModal(false)}>
          {/* Tabs */}
          <div className="flex rounded-[6px] overflow-hidden mb-5" style={{ border: '1px solid var(--line-2)' }}>
            {[
              { key: 'item',       label: 'By Menu Item',  Icon: Utensils    },
              { key: 'ingredient', label: 'By Ingredient', Icon: FlaskConical },
            ].map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className="flex flex-1 items-center justify-center gap-2"
                style={{
                  height: 36, fontSize: 13, fontWeight: 500, border: 0, cursor: 'pointer',
                  background: tab === key ? 'var(--ink)' : 'var(--paper)',
                  color:      tab === key ? '#fff'       : 'var(--mute)',
                  transition: 'background .1s, color .1s',
                }}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          {/* By Menu Item tab */}
          {tab === 'item' && (
            <form onSubmit={handleItemSubmit} className="space-y-4">
              {menuItemsWithRecipe.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: 13, color: 'var(--mute)', border: '1px dashed var(--line-2)', borderRadius: 7 }}>
                  No menu items have a recipe linked.<br />
                  <span style={{ fontSize: 12 }}>Link recipes to menu items in the Menu page first.</span>
                </div>
              ) : (
                <>
                  <div>
                    <label className="label">Menu Item</label>
                    <SelectField
                      value={itemForm.menuItemId}
                      onChange={(v) => setItemForm((f) => ({ ...f, menuItemId: v }))}
                      options={[
                        { value: '', label: 'Select menu item…' },
                        ...menuItemsWithRecipe.map((m) => ({ value: m.id, label: m.name })),
                      ]}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Portions wasted</label>
                      <input
                        type="number" step="0.5" min="0.5"
                        value={itemForm.portions}
                        onChange={(e) => setItemForm((f) => ({ ...f, portions: e.target.value }))}
                        className="input" placeholder="1" required
                      />
                    </div>
                    <div>
                      <label className="label">Reason</label>
                      <SelectField
                        value={itemForm.reason}
                        onChange={(v) => setItemForm((f) => ({ ...f, reason: v }))}
                        options={REASONS.map((r) => ({ value: r, label: REASON_LABELS[r] }))}
                      />
                    </div>
                  </div>

                  {/* Ingredient preview */}
                  {previewIngredients.length > 0 && (
                    <div style={{ border: '1px solid var(--line-2)', borderRadius: 7, overflow: 'hidden' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', padding: '8px 12px', background: 'var(--paper-2)', margin: 0, borderBottom: '1px solid var(--line)' }}>
                        Ingredients that will be logged
                      </p>
                      <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                        {previewIngredients.map((ing, i) => (
                          <div key={i} className="flex items-center justify-between" style={{ padding: '7px 12px', borderBottom: '1px solid var(--line)', fontSize: 12.5 }}>
                            <span style={{ color: 'var(--ink)' }}>{ing.ingredient_name || ing.name || `Ingredient ${i + 1}`}</span>
                            <span className="mono num" style={{ color: 'var(--mute)' }}>
                              {ing.calculatedQty} {ing.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="label">Notes (optional)</label>
                    <textarea
                      value={itemForm.notes}
                      onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))}
                      className="input" rows={2} style={{ resize: 'vertical' }}
                      placeholder="e.g. Burnt during service"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                    <button type="submit" disabled={isSaving || !itemForm.menuItemId || previewIngredients.length === 0} className="btn-primary flex-1 justify-center disabled:opacity-50">
                      {isSaving ? 'Saving…' : 'Log waste'}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}

          {/* By Ingredient tab */}
          {tab === 'ingredient' && (
            <form onSubmit={handleIngredientSubmit} className="space-y-4">
              <div>
                <label className="label">Ingredient</label>
                <SelectField
                  value={ingForm.ingredientId}
                  onChange={(v) => setIngForm((f) => ({ ...f, ingredientId: v }))}
                  options={[
                    { value: '', label: 'Select ingredient…' },
                    ...ingredients.filter((i) => i.is_active).map((i) => ({
                      value: i.id,
                      label: `${i.name} (stock: ${parseFloat(i.stock_on_hand).toFixed(2)} ${i.unit})`,
                    })),
                  ]}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Quantity</label>
                  <input
                    type="number" step="0.001" min="0.001"
                    value={ingForm.quantity}
                    onChange={(e) => setIngForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="input" placeholder="0" required
                  />
                </div>
                <div>
                  <label className="label">Reason</label>
                  <SelectField
                    value={ingForm.reason}
                    onChange={(v) => setIngForm((f) => ({ ...f, reason: v }))}
                    options={REASONS.map((r) => ({ value: r, label: REASON_LABELS[r] }))}
                  />
                </div>
              </div>

              <div>
                <label className="label">Notes (optional)</label>
                <textarea
                  value={ingForm.notes}
                  onChange={(e) => setIngForm((f) => ({ ...f, notes: e.target.value }))}
                  className="input" rows={2} style={{ resize: 'vertical' }}
                  placeholder="e.g. Milk expired overnight"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={isSaving} className="btn-primary flex-1 justify-center">
                  {isSaving ? 'Saving…' : 'Log waste'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      <style>{`.label { display:block; margin-bottom:4px; font-size:11.5px; font-weight:500; color:var(--mute); }`}</style>
    </div>
  );
}
