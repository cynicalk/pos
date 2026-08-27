import { useState, useMemo } from 'react';
import ReviewInsights from '../components/ReviewInsights';
import { Star, UtensilsCrossed } from 'lucide-react';
import SelectField from '../components/SelectField';
import { useReviews } from '../hooks/useReviews';
import { useTimezone } from '../context/TimezoneContext';
import { shiftDate, startOfMonth, startOfWeek } from '../utils/dateUtils';

// ── Date helpers (same pattern as OrderHistory) ──────────────────────────────

const PRESETS = [
  { id: 'today',     label: 'Today'      },
  { id: 'yesterday', label: 'Yesterday'  },
  { id: 'week',      label: 'This week'  },
  { id: 'month',     label: 'This month' },
  { id: 'custom',    label: 'Custom'     },
];

// ── Star display ─────────────────────────────────────────────────────────────

function Stars({ value, size = 13 }) {
  if (value == null) return <span style={{ fontSize: 11, color: 'var(--mute)' }}>—</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          fill={n <= value ? '#f59e0b' : 'none'}
          stroke={n <= value ? '#f59e0b' : 'var(--line-2)'}
        />
      ))}
    </span>
  );
}

// ── Rating bar (distribution) ─────────────────────────────────────────────────

function RatingBar({ label, count, total }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
      <span style={{ width: 14, textAlign: 'right', color: 'var(--mute)', flexShrink: 0 }}>{label}</span>
      <Star size={10} fill="#f59e0b" stroke="#f59e0b" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--line)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: '#f59e0b', transition: 'width .3s' }} />
      </div>
      <span className="mono" style={{ width: 20, textAlign: 'right', color: 'var(--mute)', flexShrink: 0 }}>{count}</span>
    </div>
  );
}

// ── Review card ───────────────────────────────────────────────────────────────

function ReviewCard({ review, formatTime }) {
  const rating = review.overall_rating;
  const color  = rating >= 4 ? 'var(--ok)' : rating === 3 ? 'var(--warn)' : 'var(--bad)';

  return (
    <div
      className="space-y-2 rounded-[8px] p-4"
      style={{ border: '1px solid var(--line)', background: 'var(--paper)' }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center rounded-md"
            style={{ width: 28, height: 28, background: `${color}18`, flexShrink: 0 }}
          >
            <UtensilsCrossed size={13} style={{ color }} />
          </span>
          <div>
            {/* Graduated attribution: loyalty name → phone → anonymous */}
            {review.customer_name ? (
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                {review.customer_name}
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--mute)', marginLeft: 6 }}>
                  {review.customer_phone}
                </span>
              </p>
            ) : review.customer_phone ? (
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                {review.customer_phone}
              </p>
            ) : (
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--mute)', margin: 0 }}>
                Anonymous
                <span className="mono" style={{ fontSize: 11, marginLeft: 6, color: 'var(--mute-2)' }}>
                  #{review.id.slice(-6).toUpperCase()}
                </span>
              </p>
            )}
            <p style={{ fontSize: 11, color: 'var(--mute)', margin: 0 }}>
              {review.table_number != null ? `Table ${review.table_number} · ` : ''}{formatTime(new Date(review.created_at))}
            </p>
          </div>
        </div>

        {/* Overall stars + badge */}
        <div className="flex items-center gap-2">
          <Stars value={review.overall_rating} size={14} />
          <span
            className="mono"
            style={{ fontSize: 12, fontWeight: 700, color, background: `${color}18`, padding: '1px 7px', borderRadius: 99 }}
          >
            {review.overall_rating}/5
          </span>
        </div>
      </div>

      {/* Sub-ratings */}
      {(review.food_rating != null || review.service_rating != null) && (
        <div className="flex items-center gap-4 flex-wrap" style={{ paddingLeft: 40 }}>
          {review.food_rating != null && (
            <span className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: 'var(--mute)' }}>
              Food <Stars value={review.food_rating} size={11} />
            </span>
          )}
          {review.service_rating != null && (
            <span className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: 'var(--mute)' }}>
              Service <Stars value={review.service_rating} size={11} />
            </span>
          )}
        </div>
      )}

      {/* Comment */}
      {review.comment && (
        <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0, paddingLeft: 40, lineHeight: 1.55, fontStyle: 'italic' }}>
          "{review.comment}"
        </p>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Reviews() {
  const { todayLocal, formatTime } = useTimezone();
  const today = todayLocal();

  const [preset,      setPreset]      = useState('week');
  const [customFrom,  setCustomFrom]  = useState(today);
  const [customTo,    setCustomTo]    = useState(today);
  const [minRating,   setMinRating]   = useState('');

  const { from, to } = useMemo(() => {
    if (preset === 'yesterday') { const y = shiftDate(today, -1); return { from: y, to: y }; }
    if (preset === 'week')   return { from: startOfWeek(today),  to: today };
    if (preset === 'month')  return { from: startOfMonth(today), to: today };
    if (preset === 'custom') return { from: customFrom, to: customTo };
    return { from: today, to: today };
  }, [preset, today, customFrom, customTo]);

  const { data: reviews = [], isLoading, isError } = useReviews({ from, to, rating: minRating || undefined });

  const stats = useMemo(() => {
    if (!reviews.length) return null;
    const n = reviews.length;
    const avg = (key) => {
      const vals = reviews.map((r) => r[key]).filter((v) => v != null);
      return vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : null;
    };
    const dist = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: reviews.filter((r) => r.overall_rating === star).length,
    }));
    return { n, avgOverall: avg('overall_rating'), avgFood: avg('food_rating'), avgService: avg('service_rating'), dist };
  }, [reviews]);

  // Two views over the same reviews: the browse log that was already here, and
  // the Phase 6 insights that group them into themes and draft replies. Tabs
  // rather than a second page, because splitting "the reviews" across two nav
  // entries is how an operator ends up reading one and never the other.
  const [view, setView] = useState('feedback');

  return (
    <div className="space-y-5">

      {/* Header + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Reviews</h1>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>Customer feedback from the table QR</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <div className="flex" style={{ border: '1px solid var(--line-2)', borderRadius: 6, marginRight: 4 }}>
            {[{ id: 'feedback', label: 'Feedback' }, { id: 'insights', label: 'Insights' }].map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className="whitespace-nowrap transition-colors"
                style={{
                  fontSize: 12, fontWeight: 500, padding: '5px 12px', border: 0, cursor: 'pointer',
                  background: view === v.id ? 'var(--ink)' : 'transparent',
                  color:      view === v.id ? 'var(--accent-on)' : 'var(--mute)',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Date presets — the log's own filters; Insights carries its own window.
              The whole container is gated, not just its children: leaving it
              rendered on the Insights tab left a bordered 1px sliver on screen
              that read as a stray dot. */}
          {view === 'feedback' && (
          <div className="flex overflow-x-auto" style={{ border: '1px solid var(--line-2)', borderRadius: 6 }}>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className="whitespace-nowrap transition-colors"
                style={{
                  fontSize: 12, fontWeight: 500, padding: '5px 12px', border: 0, cursor: 'pointer',
                  background: preset === p.id ? 'var(--ink)' : 'transparent',
                  color:      preset === p.id ? 'var(--accent-on)' : 'var(--mute)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          )}

          {/* Min rating filter */}
          {view === 'feedback' && <SelectField
            value={minRating}
            onChange={(v) => setMinRating(v)}
            style={{ height: 32, fontSize: 12, fontWeight: 500, padding: '0 10px', width: 'auto' }}
            options={[
              { value: '',  label: 'All ratings' },
              { value: '5', label: '5 stars only' },
              { value: '4', label: '4+ stars' },
              { value: '3', label: '3+ stars' },
              { value: '2', label: '2+ stars' },
            ]}
          />}
        </div>
      </div>

      {view === 'insights' && <ReviewInsights />}

      {/* Custom date range */}
      {view === 'feedback' && preset === 'custom' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-2">
            <label style={{ width: 32, flexShrink: 0, fontSize: 13, color: 'var(--mute)' }}>From</label>
            <input type="date" className="input" style={{ fontSize: 13 }} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <label style={{ width: 32, flexShrink: 0, fontSize: 13, color: 'var(--mute)' }}>To</label>
            <input type="date" className="input" style={{ fontSize: 13 }} value={customTo}   onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        </div>
      )}

      {/* Stats */}
      {view === 'feedback' && stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total reviews',   value: stats.n },
            { label: 'Overall rating',  value: stats.avgOverall  ? `★ ${stats.avgOverall}`  : '—' },
            { label: 'Food rating',     value: stats.avgFood     ? `★ ${stats.avgFood}`     : '—' },
            { label: 'Service rating',  value: stats.avgService  ? `★ ${stats.avgService}`  : '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '14px 16px', background: 'var(--paper)' }}>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600, color: 'var(--mute)', margin: 0 }}>
                {label}
              </p>
              <p className="mono num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginTop: 4, marginBottom: 0 }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Rating distribution */}
      {view === 'feedback' && stats && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 8, background: 'var(--paper)', padding: '16px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--mute)', marginBottom: 10 }}>
            Rating breakdown
          </p>
          <div className="space-y-2" style={{ maxWidth: 320 }}>
            {stats.dist.map(({ star, count }) => (
              <RatingBar key={star} label={star} count={count} total={stats.n} />
            ))}
          </div>
        </div>
      )}

      {/* Reviews list */}
      {view === 'feedback' && isLoading && (
        <p className="py-10 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>
      )}
      {view === 'feedback' && isError && (
        <p className="py-10 text-center" style={{ fontSize: 13, color: 'var(--bad)' }}>Failed to load reviews.</p>
      )}
      {view === 'feedback' && !isLoading && !isError && reviews.length === 0 && (
        <p className="py-10 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>No reviews found for this period.</p>
      )}
      {view === 'feedback' && !isLoading && reviews.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} formatTime={formatTime} />
          ))}
        </div>
      )}
    </div>
  );
}
