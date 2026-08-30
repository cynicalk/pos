import { useState, useMemo } from 'react';
import { Trash2, Info, Save, AlertTriangle, TrendingDown } from 'lucide-react';
import { usePrepPlan, usePrepReconciliation, usePrepForecast, useSavePrepPlan, useSavePrepActual } from '../hooks/usePrep';
import { useCurrency } from '../context/CurrencyContext';
import { CARD, LABEL, th, td, tdNum } from '../lib/ui';

/**
 * Waste Prediction — Phase 1: log the prep, see how it landed.
 *
 * The number the waste picture always lacked is how much of each dish was
 * prepped. This screen captures it at two points — a pre-service plan (nudged
 * from the forecast) and a post-service actual — then reconciles the prep
 * against what sold, so over-prep is measured instead of guessed. The forward
 * prediction that scores against this history is Phase 2; until enough days
 * accumulate, this says so rather than inventing a forecast of waste.
 */

const iso = (d) => d.toISOString().slice(0, 10);

const STATUS = {
  over:       { label: 'Over',       color: 'var(--warn)', bg: 'var(--warn-soft)' },
  short:      { label: 'Short',      color: 'var(--bad)',  bg: 'var(--bad-soft)' },
  on_target:  { label: 'On target',  color: 'var(--ok)',   bg: 'var(--ok-soft)' },
  not_logged: { label: 'Not logged', color: 'var(--mute)', bg: 'var(--paper-3)' },
};

// Forward-forecast statuses (Phase 2).
const FSTATUS = {
  chronic:      { label: 'Chronic',   color: 'var(--bad)',  bg: 'var(--bad-soft)' },
  occasional:   { label: 'Sometimes', color: 'var(--warn)', bg: 'var(--warn-soft)' },
  lean:         { label: 'Lean',      color: 'var(--ok)',   bg: 'var(--ok-soft)' },
  insufficient: { label: 'Learning',  color: 'var(--mute)', bg: 'var(--paper-3)' },
};

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pillStyle = (s) => ({ padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.color, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' });

function Pill({ status }) {
  return <span style={pillStyle(STATUS[status] || STATUS.not_logged)}>{(STATUS[status] || STATUS.not_logged).label}</span>;
}

function FPill({ status }) {
  const s = FSTATUS[status] || FSTATUS.insufficient;
  return <span style={pillStyle(s)}>{s.label}</span>;
}

const qtyInput = {
  width: 58, padding: '4px 7px', borderRadius: 6, border: '1px solid var(--line-2)',
  background: 'var(--paper)', color: 'var(--ink)', fontSize: 12.5, textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};
const btn = (primary) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8,
  cursor: 'pointer', fontSize: 12.5, fontWeight: 500,
  border: `1px solid ${primary ? 'var(--ink)' : 'var(--line-2)'}`,
  background: primary ? 'var(--ink)' : 'transparent', color: primary ? 'var(--paper)' : 'var(--ink)',
});

export default function WastePrediction() {
  const { format } = useCurrency();
  const [date, setDate] = useState(iso(new Date()));
  const [edits, setEdits] = useState({}); // { menuItemId: { planned, actual } }

  const { data: plan, isLoading } = usePrepPlan(date);
  const isPast = date < iso(new Date());
  const { data: recon } = usePrepReconciliation(isPast ? date : null);
  // The forward over-prep forecast is for a service that hasn't happened yet.
  const { data: forecast } = usePrepForecast(isPast ? null : date);
  const savePlan = useSavePrepPlan();
  const saveActual = useSavePrepActual();

  // Dishes the forecast can actually speak to, heaviest surplus first.
  const flagged = useMemo(
    () => (forecast?.dishes || []).filter((d) => d.status !== 'insufficient' && d.predictedSurplus > 0),
    [forecast],
  );

  // Reconciliation figures per dish (sold/unsold/status), when the day is past.
  const reconByItem = useMemo(
    () => new Map((recon?.dishes || []).map((d) => [d.menuItemId, d])),
    [recon],
  );

  const rows = plan?.rows || [];
  const val = (id, field, fallback) => {
    const e = edits[id];
    if (e && e[field] !== undefined) return e[field];
    return fallback ?? '';
  };
  const setVal = (id, field, v) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: v } }));

  const changedEntries = (field) => rows
    .filter((r) => edits[r.menuItemId]?.[field] !== undefined)
    .map((r) => ({
      menuItemId: r.menuItemId,
      [field === 'planned' ? 'plannedQty' : 'actualQty']: edits[r.menuItemId][field] === '' ? null : Number(edits[r.menuItemId][field]),
      forecastQty: r.forecastQty,
    }));

  const acceptForecast = () => {
    const next = { ...edits };
    for (const r of rows) if (r.forecastQty != null) next[r.menuItemId] = { ...next[r.menuItemId], planned: r.forecastQty };
    setEdits(next);
  };

  const doSave = async (field) => {
    const entries = changedEntries(field);
    if (!entries.length) return;
    const mut = field === 'planned' ? savePlan : saveActual;
    await mut.mutateAsync({ date, entries });
    // Clear the saved field's edits so inputs re-seed from the server.
    setEdits((prev) => {
      const next = {};
      for (const [id, e] of Object.entries(prev)) {
        const { [field]: _saved, ...rest } = e;
        if (Object.keys(rest).length) next[id] = rest;
      }
      return next;
    });
  };

  return (
    <div style={{ padding: '26px 24px 48px', maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div>
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999, background: 'var(--paper-3)', color: 'var(--mute)', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em' }}>
            <Trash2 size={12} strokeWidth={2.2} /> prep · sold · surplus
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>Waste Prediction</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)', maxWidth: 780 }}>
          Log how much of each dish you prep — planned before service, actual after — and see it against
          what sold. Over-prep becomes a measured number, not a guess.
        </p>
      </div>

      {/* ── Forward forecast: likely over-prep for this service (Phase 2) ── */}
      {!isPast && forecast && (
        forecast.summary.predicted > 0 ? (
          <div style={{ ...CARD, borderTop: '2px solid var(--warn)' }}>
            <div className="flex items-center gap-2 flex-wrap" style={{ justifyContent: 'space-between' }}>
              <div style={{ ...LABEL, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <TrendingDown size={13} strokeWidth={2.2} /> Likely over-prep · {WEEKDAY[forecast.targetDow]}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--mute)' }}>
                learned from {Math.max(...(forecast.dishes || []).map((d) => d.samples || 0))} days of prep history
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginTop: 14 }}>
              {[
                ['Likely unsold', `${forecast.summary.totalSurplusPortions}`, 'portions across the menu'],
                ['At risk', forecast.summary.totalSurplusValue != null ? format(forecast.summary.totalSurplusValue) : '—',
                  forecast.summary.valueCoveragePct != null ? `${forecast.summary.valueCoveragePct}% of dishes costed` : 'no dish costs yet'],
                ['Chronic over-preppers', `${forecast.summary.chronic}`, 'over most days, by a real margin'],
                ['Still learning', `${forecast.summary.insufficient}`, 'too little history to forecast'],
              ].map(([label, value, sub]) => (
                <div key={label}>
                  <div style={LABEL}>{label}</div>
                  <div className="mono num" style={{ marginTop: 6, fontSize: 21, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
                  <div style={{ marginTop: 5, fontSize: 11, color: 'var(--mute)', lineHeight: 1.5 }}>{sub}</div>
                </div>
              ))}
            </div>

            {flagged.length > 0 && (
              <div style={{ overflowX: 'auto', marginTop: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th style={th}>Dish</th>
                      <th style={{ ...th, textAlign: 'right' }}>Forecast sell</th>
                      <th style={{ ...th, textAlign: 'right' }}>You usually prep</th>
                      <th style={{ ...th, textAlign: 'right' }}>Likely surplus</th>
                      <th style={{ ...th, textAlign: 'right' }}>At risk</th>
                      <th style={th}>Pattern</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flagged.slice(0, 12).map((d) => (
                      <tr key={d.menuItemId} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ ...td, fontWeight: 500 }}>
                          {d.chronic && <AlertTriangle size={12} strokeWidth={2.2} style={{ color: 'var(--bad)', marginRight: 5, verticalAlign: -1 }} />}
                          {d.name}
                        </td>
                        <td style={{ ...tdNum, color: 'var(--mute)' }} className="mono num">{d.forecastQty ?? '—'}</td>
                        <td style={tdNum} className="mono num">{d.typicalPrepped ?? '—'}</td>
                        <td style={{ ...tdNum, fontWeight: 600, color: 'var(--warn)' }} className="mono num">
                          {d.predictedSurplus}
                          {d.surplusLo != null && d.surplusHi != null && d.surplusHi > d.surplusLo && (
                            <span style={{ color: 'var(--mute)', fontWeight: 400, fontSize: 11 }}> ({d.surplusLo}–{d.surplusHi})</span>
                          )}
                        </td>
                        <td style={tdNum} className="mono num">{d.valuedSurplus != null ? format(d.valuedSurplus) : '—'}</td>
                        <td style={td}><FPill status={d.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p style={{ display: 'flex', gap: 7, alignItems: 'flex-start', margin: '14px 0 0', fontSize: 11.5, lineHeight: 1.6, color: 'var(--mute)' }}>
              <Info size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>This is the surplus you'd likely leave if you prep as usual — not a prep instruction.
                Trimming toward the forecast is the operator's call: only you know what carries to the next
                service and what can't run out. "At risk" values the surplus at recipe cost.</span>
            </p>
          </div>
        ) : (
          <div style={{ padding: '13px 16px', borderLeft: '2px solid var(--info)', background: 'var(--paper-2)', borderRadius: '0 8px 8px 0' }}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--mute)' }}>
              <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>Measured first, predicted later.</strong>{' '}
              Not enough prep history yet to forecast over-prep for this service. Keep logging prep vs sold;
              once a few weeks accumulate, the likely surplus per dish appears here — no invented forecast until then.
            </p>
          </div>
        )
      )}

      {/* ── Date + actions ──────────────────────────────────────────────── */}
      <div style={{ ...CARD, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...LABEL, marginBottom: 5 }}>Service date</div>
          <input type="date" value={date} max={iso(new Date(Date.now() + 6 * 864e5))}
            onChange={(e) => { setDate(e.target.value); setEdits({}); }}
            style={{ padding: '6px 9px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 13 }} />
        </div>
        <div style={{ flex: 1 }} />
        <button style={btn(false)} onClick={acceptForecast} disabled={!rows.some((r) => r.forecastQty != null)}>
          Plan to forecast
        </button>
        <button style={btn(false)} onClick={() => doSave('planned')} disabled={savePlan.isPending || !changedEntries('planned').length}>
          <Save size={13} strokeWidth={2} /> Save plan
        </button>
        <button style={btn(true)} onClick={() => doSave('actual')} disabled={saveActual.isPending || !changedEntries('actual').length}>
          <Save size={13} strokeWidth={2} /> Save actual
        </button>
      </div>

      {/* ── Reconciliation headline (past days) ─────────────────────────── */}
      {recon && recon.coverage.logged > 0 && (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          {[
            ['Over-prepped', recon.totals.overPrepped, 'dishes made past demand'],
            ['Unsold portions', recon.totals.unsold, `of ${recon.totals.prepped} prepped`],
            ['Short', recon.totals.shortPrepped, 'dishes that sold out early'],
            ['Logged binned', format(recon.totals.loggedWasteCost), 'confirmed as over-prep waste'],
          ].map(([label, value, sub]) => (
            <div key={label} style={CARD}>
              <div style={LABEL}>{label}</div>
              <div className="mono num" style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
              <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── The sheet ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 24, color: 'var(--mute)' }}>Loading…</div>
      ) : (
        <div style={CARD}>
          <div style={{ ...LABEL, marginBottom: 4 }}>{isPast ? 'Prep vs sold' : 'Prep plan'}</div>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6, maxWidth: 820 }}>
            Plan is pre-filled from the forecast where there is one. Enter the actual after service; the
            reconciliation prefers it over the plan. A dish with no forecast still takes a manual number.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={th}>Dish</th>
                  <th style={{ ...th, textAlign: 'right' }}>Forecast</th>
                  <th style={{ ...th, textAlign: 'right' }}>Plan</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actual</th>
                  {isPast && <th style={{ ...th, textAlign: 'right' }}>Sold</th>}
                  {isPast && <th style={{ ...th, textAlign: 'right' }}>Unsold</th>}
                  {isPast && <th style={th}>Status</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rec = reconByItem.get(r.menuItemId);
                  return (
                    <tr key={r.menuItemId} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ ...td, fontWeight: 500 }}>{r.name}</td>
                      <td style={{ ...tdNum, color: 'var(--mute)' }} className="mono num">{r.forecastQty ?? '—'}</td>
                      <td style={tdNum}>
                        <input type="number" min="0" style={qtyInput}
                          value={val(r.menuItemId, 'planned', r.plannedQty ?? '')}
                          onChange={(e) => setVal(r.menuItemId, 'planned', e.target.value)} />
                      </td>
                      <td style={tdNum}>
                        <input type="number" min="0" style={qtyInput}
                          value={val(r.menuItemId, 'actual', r.actualQty ?? '')}
                          onChange={(e) => setVal(r.menuItemId, 'actual', e.target.value)} />
                      </td>
                      {isPast && <td style={{ ...tdNum, color: 'var(--mute)' }} className="mono num">{rec ? rec.sold : '—'}</td>}
                      {isPast && <td style={{ ...tdNum, fontWeight: 600, color: rec && rec.unsold > 0 ? 'var(--warn)' : 'var(--ink)' }} className="mono num">{rec && rec.unsold != null ? rec.unsold : '—'}</td>}
                      {isPast && <td style={td}>{rec ? <Pill status={rec.status} /> : <Pill status="not_logged" />}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{ display: 'flex', gap: 7, alignItems: 'flex-start', margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--mute)' }}>
        <Info size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 3 }} />
        <span>Unsold is prepped minus sold — food that didn't sell, which you read as binned or carried.
          The "logged binned" figure is separate: it comes only from waste you recorded as over-prep.</span>
      </p>
    </div>
  );
}
