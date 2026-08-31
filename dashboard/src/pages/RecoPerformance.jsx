import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, AlertCircle, Info, Star } from 'lucide-react';
import { useRecoPerformance } from '../hooks/useInsights';
import { useUpdateMenuItem } from '../hooks/useMenu';
import { queryClient } from '../lib/queryClient';

/**
 * Recommendation Performance — Phase 0 of the recsys work.
 *
 * The group recommender is not modelled until there are weeks of clean logs, so
 * this page measures the recommender we already ship instead of predicting one:
 *   - the funnel it drives (saw picks → added → added a pick → ordered), and
 *   - whether the picks landing in carts are our profitable dishes, joined to
 *     the same menu-engineering matrix the Menu Insights page uses.
 *
 * Every rate here abstains below a floor — a percentage over a handful of
 * sessions is noise — and says so, showing the raw counts forming underneath.
 */

const WINDOWS = [7, 30, 90];

const CLASS_SPEC = {
  stars:      { label: 'Star',       color: 'var(--ok)' },
  puzzles:    { label: 'Puzzle',     color: 'var(--info)' },
  plowhorses: { label: 'Plough-horse', color: 'var(--warn)' },
  dogs:       { label: 'Dog',        color: 'var(--bad)' },
};

const VERDICT = {
  healthy:     { label: 'Steering to margin', color: 'var(--ok)',   note: 'Most reco-driven adds are high-margin dishes.' },
  mixed:       { label: 'Mixed',              color: 'var(--warn)', note: 'The picks that convert are a mix of thick and thin margins.' },
  margin_leak: { label: 'Leaking margin',     color: 'var(--bad)',  note: 'Picks that land in carts skew to low-margin dishes.' },
};

function Tile({ label, value, sub }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '13px 16px', background: 'var(--paper)', flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 11.5, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--mute-2)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Chip({ spec }) {
  if (!spec) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--mute-2)' }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--mute-2)' }} /> Uncosted
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--mute)' }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: spec.color }} /> {spec.label}
    </span>
  );
}

export default function RecoPerformance() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useRecoPerformance(days);
  const updateItem = useUpdateMenuItem();

  const toggleFeatured = (menuItemId, next) => {
    updateItem.mutate(
      { id: menuItemId, featured: next },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['insights', 'reco-performance'] }) },
    );
  };

  const funnel = data?.funnel;
  const margin = data?.margin;
  const promote = data?.promote || [];
  const noActivity = funnel && funnel.window.sessions === 0;
  const maxStage = funnel ? Math.max(1, ...funnel.stages.map((s) => s.count)) : 1;

  return (
    <div style={{ padding: '24px 22px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Sparkles size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>Recommendations</h1>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {WINDOWS.map((d) => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '4px 11px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
              border: '1px solid ' + (days === d ? 'var(--ink)' : 'var(--line)'),
              background: days === d ? 'var(--ink)' : 'transparent',
              color: days === d ? 'var(--paper)' : 'var(--mute)',
            }}>{d}d</button>
          ))}
        </div>
      </div>

      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--mute)', lineHeight: 1.55 }}>
        How the guest ordering app's picks convert, and whether the dishes guests accept are your
        profitable ones. Measured from what the app records — no model, no guesswork.
      </p>

      {isLoading || !funnel ? (
        <p style={{ marginTop: 18, fontSize: 13, color: 'var(--mute)' }}>Loading…</p>
      ) : noActivity ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 18, padding: '14px 16px',
                      background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10, alignItems: 'flex-start' }}>
          <Info size={15} strokeWidth={2} style={{ color: 'var(--mute)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)' }}>
            No recommendation activity in the last {days} days. As guests use the ordering app — seeing
            picks, adding dishes, placing orders — the funnel and the margin read build here. Nothing is
            shown until it is real.
          </p>
        </div>
      ) : (
        <>
          {/* ── Funnel ─────────────────────────────────────────────── */}
          <h2 style={{ margin: '24px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>The funnel</h2>
          {!funnel.enoughData && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, padding: '11px 14px',
                          background: 'var(--warn-soft)', borderRadius: 9, alignItems: 'flex-start' }}>
              <AlertCircle size={14} strokeWidth={2} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
                Still learning — {funnel.learning.have} of {funnel.learning.minSessions} sessions needed before
                the rates mean anything. The counts below are real; the percentages wait until there's enough
                to trust.
              </p>
            </div>
          )}

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {funnel.stages.map((s) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 170, fontSize: 13, color: 'var(--ink)' }}>{s.label}</div>
                <div style={{ flex: 1, background: 'var(--line)', borderRadius: 6, height: 26, position: 'relative', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max(4, (s.count / maxStage) * 100)}%`, height: '100%',
                    background: 'var(--ink)', borderRadius: 6, transition: 'width .3s',
                  }} />
                  <span style={{ position: 'absolute', left: 10, top: 0, lineHeight: '26px', fontSize: 12.5,
                                 color: s.count / maxStage > 0.12 ? 'var(--paper)' : 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                    {s.count}
                  </span>
                </div>
                <div style={{ width: 78, textAlign: 'right', fontSize: 12, color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>
                  {s.ofPrev == null ? '' : `${s.ofPrev}% of prev`}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <Tile
              label="AI acceptance"
              value={funnel.acceptanceRate == null ? '—' : `${funnel.acceptanceRate}%`}
              sub={funnel.acceptanceRate == null ? 'learning' : `${funnel.dishAddsReco} of ${funnel.dishAdds} adds from a pick`}
            />
            <Tile
              label="Conversion"
              value={funnel.conversionRate == null ? '—' : `${funnel.conversionRate}%`}
              sub={funnel.conversionRate == null ? 'learning' : 'of sessions shown picks, ordered'}
            />
            <Tile
              label="Rejections"
              value={funnel.rejections.total}
              sub={`${funnel.rejections.refine} refined · ${funnel.rejections.capped} capped`}
            />
          </div>

          {/* ── Margin loop ────────────────────────────────────────── */}
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '30px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            Do the picks earn?
            {margin.verdict && (
              <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
                             color: VERDICT[margin.verdict].color, border: `1px solid ${VERDICT[margin.verdict].color}` }}>
                {VERDICT[margin.verdict].label}
              </span>
            )}
          </h2>
          <p style={{ margin: '7px 0 0', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
            Reco-driven adds placed in the menu-engineering quadrant each dish already sits in — split at
            your own medians (see <Link to="/menu-insights" style={{ color: 'var(--ink)' }}>Menu Insights</Link>).
            {margin.verdict ? ` ${VERDICT[margin.verdict].note}` : ''}
          </p>

          {!margin.enoughData ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '11px 14px',
                          background: 'var(--warn-soft)', borderRadius: 9, alignItems: 'flex-start' }}>
              <AlertCircle size={14} strokeWidth={2} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
                {margin.learning.have} of {margin.learning.minRecoAdds} reco-driven adds needed before the
                margin split is worth a verdict. The dishes accepted so far are listed below.
              </p>
            </div>
          ) : (
            <div style={{ marginTop: 14, display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', border: '1px solid var(--line)' }}>
              {['stars', 'puzzles', 'plowhorses', 'dogs'].map((k) => {
                const share = margin.classifiedAdds > 0 ? (margin.byClass[k] / margin.classifiedAdds) * 100 : 0;
                if (share === 0) return null;
                return <div key={k} title={`${CLASS_SPEC[k].label}: ${margin.byClass[k]}`} style={{ width: `${share}%`, background: CLASS_SPEC[k].color }} />;
              })}
            </div>
          )}
          {margin.enoughData && (
            <p style={{ margin: '7px 0 0', fontSize: 12, color: 'var(--mute)' }}>
              {margin.highMarginShare}% of {margin.classifiedAdds} classified reco-adds are high-margin (Stars + Puzzles).
              {margin.uncostedAdds > 0 && ` ${margin.uncostedAdds} more went to uncosted dishes, excluded from the split.`}
            </p>
          )}

          {margin.dishes.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {margin.hasImpressions && (
                <div style={{ display: 'flex', gap: 10, padding: '0 0 5px', fontSize: 11,
                              color: 'var(--mute-2)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  <span style={{ flex: 1 }}>Dish</span>
                  <span style={{ width: 110 }}>Class</span>
                  <span style={{ width: 48, textAlign: 'right' }}>Margin</span>
                  <span style={{ width: 62, textAlign: 'right' }}>Shown</span>
                  <span style={{ width: 58, textAlign: 'right' }}>Conv.</span>
                  <span style={{ width: 74, textAlign: 'right' }}>Added</span>
                </div>
              )}
              {margin.dishes.slice(0, 12).map((d) => (
                <div key={d.menuItemId} style={{
                  display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0',
                  borderBottom: '1px solid var(--line)', fontSize: 13,
                }}>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.dishName}
                  </span>
                  <span style={{ width: 110 }}><Chip spec={d.class ? CLASS_SPEC[d.class] : null} /></span>
                  <span style={{ width: 48, textAlign: 'right', color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>
                    {d.profitMargin == null ? '—' : `${d.profitMargin.toFixed(0)}%`}
                  </span>
                  {margin.hasImpressions && (
                    <>
                      <span style={{ width: 62, textAlign: 'right', color: 'var(--mute-2)', fontVariantNumeric: 'tabular-nums' }}>
                        {d.impressions > 0 ? `${d.impressions}×` : '—'}
                      </span>
                      <span style={{ width: 58, textAlign: 'right', color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>
                        {d.conversion == null ? '—' : `${d.conversion}%`}
                      </span>
                    </>
                  )}
                  <span style={{ width: 74, textAlign: 'right', color: 'var(--ink)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {d.recoAdds}× added
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── The lever: feature high-margin dishes ──────────────── */}
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '30px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            <Star size={15} strokeWidth={2} /> Promote for margin
          </h2>
          <p style={{ margin: '7px 0 0', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
            Puzzles — high margin, low volume — are the dishes worth pushing. Feature one and the guest
            recommender boosts it; the impression and add columns above then show whether it moved. A
            nudge in the ranking, never a diet or allergy override.
          </p>

          {promote.length === 0 ? (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--mute-2)' }}>
              No high-margin puzzles to promote in this window — either everything sells or nothing is costed yet.
            </p>
          ) : (
            <div style={{ marginTop: 12 }}>
              {promote.slice(0, 8).map((p) => (
                <div key={p.menuItemId} style={{
                  display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0',
                  borderBottom: '1px solid var(--line)', fontSize: 13,
                }}>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.dishName}
                  </span>
                  <span style={{ width: 70, textAlign: 'right', color: 'var(--ok)', fontVariantNumeric: 'tabular-nums' }}>
                    {p.profitMargin == null ? '—' : `${p.profitMargin.toFixed(0)}% marg`}
                  </span>
                  <span style={{ width: 92, textAlign: 'right', color: 'var(--mute-2)', fontVariantNumeric: 'tabular-nums' }}>
                    {p.impressions}× shown · {p.recoAdds}
                  </span>
                  <button
                    onClick={() => toggleFeatured(p.menuItemId, !p.featured)}
                    disabled={updateItem.isPending}
                    style={{
                      width: 104, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      border: '1px solid ' + (p.featured ? 'var(--amber, #d97706)' : 'var(--line)'),
                      background: p.featured ? 'var(--warn-soft)' : 'transparent',
                      color: p.featured ? 'var(--warn)' : 'var(--mute)',
                    }}
                  >
                    <Star size={12} strokeWidth={2.4} fill={p.featured ? 'currentColor' : 'none'} />
                    {p.featured ? 'Featured' : 'Feature'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
