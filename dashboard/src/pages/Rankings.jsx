import { useState } from 'react';
import { Radar, TrendingUp, TrendingDown, Minus, Plus, Trash2, Info } from 'lucide-react';
import {
  useRankings, useRecordRank, useDeleteRank, useRecordCompetitor, useDeleteCompetitor,
} from '../hooks/useReputation';

/**
 * Rankings — search visibility and the rating benchmark.
 *
 * Everything on this page was typed in by a person. CookLyt does not read
 * Swiggy, Zomato or Google, and the four Market Intel shells are shelled
 * precisely because doing so needs infrastructure that does not exist here.
 *
 * That shapes the design: the page says where each number came from, refuses to
 * draw a trend line through two readings taken months apart, and never
 * describes a gap between readings as a change.
 */

const TABS = [
  { key: 'search',     label: 'Search position' },
  { key: 'benchmark',  label: 'Rating benchmark' },
];

const PLATFORM_LABELS = {
  swiggy: 'Swiggy', zomato: 'Zomato', google: 'Google', other: 'Other',
};

const btn = (primary = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 11px', borderRadius: 7, cursor: 'pointer',
  fontSize: 12.5, fontWeight: 500,
  border: `1px solid ${primary ? 'var(--ink)' : 'var(--line-2)'}`,
  background: primary ? 'var(--ink)' : 'transparent',
  color: primary ? 'var(--paper)' : 'var(--ink)',
});

const input = {
  padding: '6px 9px', borderRadius: 7, border: '1px solid var(--line-2)',
  background: 'var(--paper)', color: 'var(--ink)', fontSize: 13,
};

const th = {
  padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600,
  color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em',
};

const td = { padding: '7px 10px', fontSize: 12.5 };

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—');

/** How a movement is shown — including the case where it is not a movement. */
function Change({ query }) {
  if (query.change === null) {
    if (query.stale) {
      return (
        <span style={{ fontSize: 12, color: 'var(--mute)' }}>
          not compared — {query.gapDays} days apart
        </span>
      );
    }
    return <span style={{ fontSize: 12, color: 'var(--mute)' }}>first reading</span>;
  }
  if (query.change === 0) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--mute)' }}>
        <Minus size={13} strokeWidth={2.2} /> unchanged
      </span>
    );
  }
  const up = query.change > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  // Two readings taken the same day give gapDays === 0, which rendered as
  // "over 0d" — a window of no time at all. Caught on live output. Same-day
  // readings are worth showing (a lunch and a dinner position genuinely
  // differ), so the wording changes rather than the reading being hidden.
  const window = query.gapDays === 0 ? 'same day' : `over ${query.gapDays}d`;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5,
      color: up ? 'var(--ok)' : 'var(--bad)', fontWeight: 500,
    }}>
      <Icon size={13} strokeWidth={2.2} />
      {up ? 'up' : 'down'} {Math.abs(query.change)}
      <span style={{ color: 'var(--mute)', fontWeight: 400 }}>{window}</span>
    </span>
  );
}

function ManualNotice({ children }) {
  return (
    <div style={{
      display: 'flex', gap: 8, padding: '11px 14px', borderRadius: 9,
      background: 'var(--hover)', marginBottom: 16,
    }}>
      <Info size={15} strokeWidth={2} style={{ color: 'var(--mute)', flexShrink: 0, marginTop: 1 }} />
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
        {children}
      </p>
    </div>
  );
}

function SearchTab({ data }) {
  const recordRank = useRecordRank();
  const deleteRank = useDeleteRank();
  const [form, setForm] = useState({ platform: 'swiggy', query: '', position: '', totalResults: '' });
  const [error, setError] = useState(null);

  const submit = () => {
    setError(null);
    recordRank.mutate(form, {
      onSuccess: () => setForm({ platform: 'swiggy', query: '', position: '', totalResults: '' }),
      onError: (e) => setError(e?.response?.data?.error || 'Could not save that reading'),
    });
  };

  return (
    <>
      <ManualNotice>
        Search the platform for a term your guests would use, find where you appear, and record
        the position here. Nothing is read automatically — these figures are only as current as
        the last time someone looked. Readings more than {data.maxComparableGapDays} days apart
        are shown side by side but not called a change, because too much moves in between.
      </ManualNotice>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <select
          style={{ ...input, width: 120 }}
          value={form.platform}
          onChange={(e) => setForm({ ...form, platform: e.target.value })}
        >
          {data.platforms.map((p) => (
            <option key={p} value={p}>{PLATFORM_LABELS[p] || p}</option>
          ))}
        </select>
        <input
          style={{ ...input, flex: 1, minWidth: 160 }}
          placeholder="Search term, e.g. biryani near me"
          value={form.query}
          onChange={(e) => setForm({ ...form, query: e.target.value })}
        />
        <input
          style={{ ...input, width: 110 }}
          type="number" min="1"
          placeholder="Position"
          value={form.position}
          onChange={(e) => setForm({ ...form, position: e.target.value })}
        />
        <input
          style={{ ...input, width: 130 }}
          type="number" min="1"
          placeholder="Of how many"
          value={form.totalResults}
          onChange={(e) => setForm({ ...form, totalResults: e.target.value })}
        />
        <button
          style={btn(true)}
          disabled={!form.query.trim() || !form.position || recordRank.isPending}
          onClick={submit}
        >
          <Plus size={13} strokeWidth={2.2} /> Record
        </button>
      </div>
      <p style={{ margin: '0 0 18px', fontSize: 12, color: 'var(--mute)' }}>
        "Of how many" is optional — leave it blank if the platform does not show a result count.
      </p>

      {error && (
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--bad)' }}>{error}</p>
      )}

      {data.trackedQueries.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>
          Nothing tracked yet. Record a position above and it will appear here.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
            <th style={th}>Search term</th>
            <th style={th}>Platform</th>
            <th style={th}>Position</th>
            <th style={th}>Since last</th>
            <th style={th}>Readings</th>
            <th style={th}>Last read</th>
          </tr></thead>
          <tbody>
            {data.trackedQueries.map((q) => (
              <tr key={`${q.platform}-${q.query}`} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={td}>{q.query}</td>
                <td style={{ ...td, color: 'var(--mute)' }}>{PLATFORM_LABELS[q.platform] || q.platform}</td>
                <td style={{ ...td, fontWeight: 600 }}>
                  {q.latestPosition}
                  {q.latestTotal && (
                    <span style={{ color: 'var(--mute)', fontWeight: 400 }}> of {q.latestTotal}</span>
                  )}
                </td>
                <td style={td}><Change query={q} /></td>
                <td style={{ ...td, color: 'var(--mute)' }}>{q.readings}</td>
                <td style={{ ...td, color: 'var(--mute)' }}>{fmtDate(q.latestRecordedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data.trackedQueries.length > 0 && (
        <>
          <h3 style={{ margin: '24px 0 8px', fontSize: 14, fontWeight: 600 }}>Every reading</h3>
          {/* Readings are removable because they are typed by hand and hands
              mistype. A wrong position left in place drags every comparison
              after it, and the alternative — recording a "correction" that
              contradicts it — leaves two readings where one event happened. */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {data.trackedQueries.flatMap((q) =>
                q.history.map((h) => (
                  <tr key={h.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ ...td, color: 'var(--mute)' }}>{fmtDate(h.recordedAt)}</td>
                    <td style={td}>{q.query}</td>
                    <td style={{ ...td, color: 'var(--mute)' }}>{PLATFORM_LABELS[q.platform] || q.platform}</td>
                    <td style={td}>position {h.position}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button
                        style={{ ...btn(), padding: '4px 7px' }}
                        onClick={() => deleteRank.mutate(h.id)}
                        disabled={deleteRank.isPending}
                        aria-label={`Remove the ${fmtDate(h.recordedAt)} reading for ${q.query}`}
                      >
                        <Trash2 size={12} strokeWidth={2.2} />
                      </button>
                    </td>
                  </tr>
                )))}
            </tbody>
          </table>
        </>
      )}
      {deleteRank.isError && (
        <p style={{ fontSize: 12.5, color: 'var(--bad)' }}>Could not remove that reading.</p>
      )}
    </>
  );
}

function BenchmarkTab({ data }) {
  const record = useRecordCompetitor();
  const remove = useDeleteCompetitor();
  const [form, setForm] = useState({ competitorName: '', platform: 'swiggy', rating: '' });
  const [error, setError] = useState(null);
  const { benchmark } = data;

  const submit = () => {
    setError(null);
    record.mutate(form, {
      onSuccess: () => setForm({ competitorName: '', platform: 'swiggy', rating: '' }),
      onError: (e) => setError(e?.response?.data?.error || 'Could not save that rating'),
    });
  };

  return (
    <>
      {/* The comparison is softer than it looks, and saying so is the whole
          point of the notice. Our rating is first-party feedback from guests at
          a table; theirs is a public platform average from a different
          population with different reasons to post. */}
      <ManualNotice>
        Your rating comes from feedback guests left through CookLyt at the table. Competitor
        ratings are read off a public platform and typed in. They are not the same measurement,
        so treat the gap as a rough bearing rather than a scoreboard.
      </ManualNotice>

      <div style={{
        display: 'flex', gap: 22, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 18,
      }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--ink)' }}>
            {benchmark.ownRating ?? '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--mute)' }}>
            your rating
            {benchmark.ownReviewCount > 0
              ? ` · ${benchmark.ownReviewCount} review${benchmark.ownReviewCount === 1 ? '' : 's'}`
              : ' · no reviews yet'}
          </div>
        </div>
        {benchmark.ahead !== null && benchmark.tracked > 0 && (
          <div>
            <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--ink)' }}>
              {benchmark.ahead}<span style={{ fontSize: 15, color: 'var(--mute)' }}>/{benchmark.tracked}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>tracked rivals you are above</div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <input
          style={{ ...input, flex: 1, minWidth: 160 }}
          placeholder="Competitor name"
          value={form.competitorName}
          onChange={(e) => setForm({ ...form, competitorName: e.target.value })}
        />
        <select
          style={{ ...input, width: 120 }}
          value={form.platform}
          onChange={(e) => setForm({ ...form, platform: e.target.value })}
        >
          {data.platforms.map((p) => (
            <option key={p} value={p}>{PLATFORM_LABELS[p] || p}</option>
          ))}
        </select>
        <input
          style={{ ...input, width: 110 }}
          type="number" min="0" max="5" step="0.1"
          placeholder="Rating"
          value={form.rating}
          onChange={(e) => setForm({ ...form, rating: e.target.value })}
        />
        <button
          style={btn(true)}
          disabled={!form.competitorName.trim() || form.rating === '' || record.isPending}
          onClick={submit}
        >
          <Plus size={13} strokeWidth={2.2} /> Record
        </button>
      </div>

      {error && <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--bad)' }}>{error}</p>}

      {benchmark.competitors.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>
          No competitor ratings recorded yet.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
            <th style={th}>Competitor</th>
            <th style={th}>Platform</th>
            <th style={th}>Their rating</th>
            <th style={th}>Gap</th>
            <th style={th}>Recorded</th>
            <th style={th} />
          </tr></thead>
          <tbody>
            {benchmark.competitors.map((c) => (
              <tr key={`${c.competitorName}-${c.platform}`} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={td}>{c.competitorName}</td>
                <td style={{ ...td, color: 'var(--mute)' }}>{PLATFORM_LABELS[c.platform] || c.platform}</td>
                <td style={{ ...td, fontWeight: 600 }}>{c.rating.toFixed(1)}</td>
                <td style={td}>
                  {c.delta === null ? (
                    <span style={{ color: 'var(--mute)', fontSize: 12 }}>no rating of ours to compare</span>
                  ) : (
                    <span style={{ color: c.delta > 0 ? 'var(--ok)' : c.delta < 0 ? 'var(--bad)' : 'var(--mute)' }}>
                      {c.delta > 0 ? '+' : ''}{c.delta.toFixed(1)}
                    </span>
                  )}
                </td>
                <td style={{ ...td, color: 'var(--mute)' }}>{fmtDate(c.recordedAt)}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button
                    style={{ ...btn(), padding: '4px 7px' }}
                    onClick={() => remove.mutate(c.id)}
                    disabled={remove.isPending}
                    aria-label={`Remove ${c.competitorName}`}
                  >
                    <Trash2 size={12} strokeWidth={2.2} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export default function Rankings() {
  const [tab, setTab] = useState('search');
  const { data, isLoading } = useRankings();

  return (
    <div style={{ padding: '24px 22px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Radar size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>Rankings</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, margin: '16px 0 14px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
            border: '1px solid ' + (tab === t.key ? 'var(--ink)' : 'var(--line)'),
            background: tab === t.key ? 'var(--ink)' : 'transparent',
            color: tab === t.key ? 'var(--paper)' : 'var(--mute)',
            fontWeight: tab === t.key ? 600 : 500,
          }}>{t.label}</button>
        ))}
      </div>

      {isLoading && <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>}
      {data && tab === 'search' && <SearchTab data={data} />}
      {data && tab === 'benchmark' && <BenchmarkTab data={data} />}
    </div>
  );
}
