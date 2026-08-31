import { useState } from 'react';
import { AlertTriangle, Sparkles, Copy, Check, Info, RefreshCw } from 'lucide-react';
import {
  useReviewInsights, useReviewQueue, useDraftReply, useSaveReply,
  useMarkReplySent, useClassifyReviews, useReviewAnalysis,
} from '../hooks/useReputation';

// Split a narrated analysis into sentence beats so each reads on its own line.
const sentenceBeats = (text) =>
  String(text || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

// The narrated sentiment read + what-to-do, over the same window as the panel.
// The maths is the summary below; this only phrases it (or falls back to an
// honest template server-side). Recurring patterns are also raised as tracked
// actions in the action centre — this card says so.
function AnalysisCard({ days }) {
  const { data, isLoading, isError } = useReviewAnalysis(days);
  if (isError) return null;

  const shell = {
    position: 'relative', overflow: 'hidden', margin: '0 0 16px',
    border: '1px solid var(--line)', borderRadius: 12,
    background: 'linear-gradient(135deg, var(--paper-2) 0%, var(--paper) 60%)',
    padding: '15px 18px',
  };
  const Header = ({ badge }) => (
    <div className="flex items-center gap-2" style={{ marginBottom: 10, position: 'relative' }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 7, background: 'var(--accent-soft, rgba(194,104,58,.14))' }}>
        <Sparkles size={13} style={{ color: 'var(--accent, #C2683A)' }} />
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--label)' }}>
        AI review analysis
      </span>
      {badge}
    </div>
  );

  if (isLoading || !data) {
    return (
      <div style={shell}>
        <Header badge={<span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--mute-2)' }}>reading the reviews…</span>} />
        <div className="ai-pulse" style={{ height: 11, borderRadius: 6, background: 'var(--paper-3)', marginBottom: 7, width: '94%' }} />
        <div className="ai-pulse" style={{ height: 11, borderRadius: 6, background: 'var(--paper-3)', width: '72%' }} />
        <style>{`@keyframes aiPulse{0%,100%{opacity:.55}50%{opacity:1}}.ai-pulse{animation:aiPulse 1.4s ease-in-out infinite}`}</style>
      </div>
    );
  }

  const beats = sentenceBeats(data.narrative);
  return (
    <div style={shell}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'linear-gradient(180deg, var(--accent, #C2683A), transparent)' }} />
      <Header badge={
        <span className="flex items-center gap-1" style={{
          marginLeft: 'auto', fontSize: 10, fontWeight: 600, letterSpacing: '.04em', padding: '3px 8px', borderRadius: 999,
          background: data.aiUsed ? 'var(--accent-soft, rgba(194,104,58,.12))' : 'var(--paper-3)',
          color: data.aiUsed ? 'var(--accent, #C2683A)' : 'var(--mute-2)',
        }}>
          {data.aiUsed ? <><Sparkles size={10} /> AI NARRATED</> : 'OFFLINE · SIGNALS'}
        </span>
      } />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {beats.map((b, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span style={{ flexShrink: 0, marginTop: 7, width: 5, height: 5, borderRadius: 999, background: i === 0 ? 'var(--accent, #C2683A)' : 'var(--line-2)' }} />
            <span style={{ fontSize: i === 0 ? 14 : 13.5, lineHeight: 1.5, fontWeight: i === 0 ? 600 : 400, color: i === 0 ? 'var(--ink)' : 'var(--ink-2, var(--ink))' }}>{b}</span>
          </div>
        ))}
      </div>
      {data.signals?.patterns?.length > 0 && (
        <p style={{ margin: '11px 0 0', paddingTop: 9, borderTop: '1px solid var(--line)', fontSize: 11.5, color: 'var(--mute)', position: 'relative' }}>
          Recurring patterns are raised as tracked actions in the action centre.
        </p>
      )}
    </div>
  );
}

/**
 * Review insights and the reply queue (MERGE_PLAN.md Phase 6).
 *
 * Two things this deliberately does not do:
 *
 *  - It does not send anything. POS reviews are private, so there is no public
 *    thread to post under, and the only route to the guest is the phone number
 *    they left. Every draft is copied out by hand, and "Mark as sent" records
 *    the OPERATOR saying they sent it — the system has no way to confirm that
 *    and does not claim to.
 *
 *  - It does not rank a single bad review as a pattern. One complaint is a
 *    complaint; the action queue is for things going wrong repeatedly.
 */

const WINDOWS = [
  { days: 30,  label: '30 days' },
  { days: 90,  label: '90 days' },
  { days: 365, label: '1 year' },
];

const btn = (primary = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
  fontSize: 12, fontWeight: 500,
  border: `1px solid ${primary ? 'var(--ink)' : 'var(--line-2)'}`,
  background: primary ? 'var(--ink)' : 'transparent',
  color: primary ? 'var(--paper)' : 'var(--ink)',
});

function Bar({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
      <span style={{ width: 62, fontSize: 12, color: 'var(--mute)' }}>{label}</span>
      <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--hover)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color }} />
      </div>
      <span style={{ width: 34, fontSize: 12, textAlign: 'right', color: 'var(--ink-2)' }}>{count}</span>
    </div>
  );
}

function ReplyBox({ review }) {
  const draft = useDraftReply();
  const save = useSaveReply();
  const markSent = useMarkReplySent();
  const [text, setText] = useState(review.reply?.draft || '');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const generate = () => {
    setError(null);
    draft.mutate(review.id, {
      onSuccess: (d) => setText(d.draft),
      onError: (e) => setError(e?.response?.data?.error || 'Could not draft a reply'),
    });
  };

  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  };

  if (!review.contactable) {
    return (
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--mute)', lineHeight: 1.5 }}>
        This guest left no phone number, so there is no way to reply to them. The feedback still
        counts towards the themes above.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={btn()} onClick={generate} disabled={draft.isPending}>
          <Sparkles size={12} strokeWidth={2.2} />
          {draft.isPending ? 'Drafting…' : review.reply ? 'Redraft' : 'Draft a reply'}
        </button>
        {text && (
          <>
            <button style={btn()} onClick={copy}>
              {copied ? <Check size={12} strokeWidth={2.4} /> : <Copy size={12} strokeWidth={2.2} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>
              {review.customer_phone}
            </span>
          </>
        )}
        {review.reply?.markedSentAt && (
          <span style={{
            padding: '1px 8px', borderRadius: 999, background: 'var(--ok-soft)',
            color: 'var(--ok)', fontSize: 10, fontWeight: 600,
          }}>
            marked sent
          </span>
        )}
      </div>

      {error && <p style={{ margin: '7px 0 0', fontSize: 12, color: 'var(--bad)' }}>{error}</p>}

      {text && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            style={{
              width: '100%', marginTop: 8, padding: '8px 10px', borderRadius: 7,
              border: '1px solid var(--line-2)', background: 'var(--paper)',
              color: 'var(--ink)', fontSize: 12.5, lineHeight: 1.55, resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 7, marginTop: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              style={btn()}
              disabled={!text.trim() || save.isPending}
              onClick={() => save.mutate({ reviewId: review.id, draft: text })}
            >
              Save edit
            </button>
            <button
              style={btn(true)}
              disabled={markSent.isPending}
              onClick={() => markSent.mutate(review.id)}
            >
              Mark as sent
            </button>
            {/* Said plainly, next to the button that could be misread as sending. */}
            <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>
              CookLyt cannot send this — copy it and send it yourself.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default function ReviewInsights() {
  const [days, setDays] = useState(90);
  const { data: insights, isLoading } = useReviewInsights(days);
  const { data: reviews = [] } = useReviewQueue(days);
  const classify = useClassifyReviews();

  const negatives = reviews
    .filter((r) => r.overall_rating <= 3)
    .slice(0, 30);

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, margin: '0 0 16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {WINDOWS.map((w) => (
          <button key={w.days} onClick={() => setDays(w.days)} style={{
            padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
            border: '1px solid ' + (days === w.days ? 'var(--ink)' : 'var(--line)'),
            background: days === w.days ? 'var(--ink)' : 'transparent',
            color: days === w.days ? 'var(--paper)' : 'var(--mute)',
            fontWeight: days === w.days ? 600 : 500,
          }}>{w.label}</button>
        ))}
        <button
          style={{ ...btn(), marginLeft: 'auto' }}
          onClick={() => classify.mutate()}
          disabled={classify.isPending}
        >
          <RefreshCw size={12} strokeWidth={2.2} />
          {classify.isPending ? 'Sorting…' : 'Re-sort themes'}
        </button>
      </div>

      <AnalysisCard days={days} />

      {isLoading && <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>}

      {insights && insights.summary.total === 0 && (
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>
          No reviews in the last {days} days.
        </p>
      )}

      {insights && insights.summary.total > 0 && (
        <>
          <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap', marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{insights.summary.avgRating}</div>
              <div style={{ fontSize: 12, color: 'var(--mute)' }}>
                across {insights.summary.total} review{insights.summary.total === 1 ? '' : 's'}
              </div>
            </div>
            <div style={{ minWidth: 220 }}>
              <Bar label="positive" count={insights.summary.positive} total={insights.summary.total} color="var(--ok)" />
              <Bar label="neutral"  count={insights.summary.neutral}  total={insights.summary.total} color="var(--mute)" />
              <Bar label="negative" count={insights.summary.negative} total={insights.summary.total} color="var(--bad)" />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{insights.contactable}</div>
              <div style={{ fontSize: 12, color: 'var(--mute)' }}>left a phone number</div>
            </div>
          </div>

          {insights.summary.unclassified > 0 && (
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--mute)' }}>
              {insights.summary.unclassified} review
              {insights.summary.unclassified === 1 ? ' has' : 's have'} not been sorted into a
              theme yet — they still count in the split above.
            </p>
          )}

          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>What to fix first</h3>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
            Ranked by how often something goes wrong, not by the single worst score. A theme with
            one bad review is not on this list — that is a complaint, not a pattern.
          </p>

          {insights.actionQueue.length === 0 ? (
            <div style={{
              display: 'flex', gap: 8, padding: '11px 14px', borderRadius: 9,
              background: 'var(--hover)', marginBottom: 22,
            }}>
              <Info size={15} strokeWidth={2} style={{ color: 'var(--mute)', flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                Nothing has gone wrong more than once in this window.
              </p>
            </div>
          ) : (
            <div style={{ marginBottom: 24 }}>
              {insights.actionQueue.map((a) => (
                <div key={a.theme} style={{
                  border: '1px solid var(--line)', borderRadius: 10,
                  padding: '13px 15px', marginBottom: 9,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <AlertTriangle size={14} strokeWidth={2.2} style={{ color: 'var(--bad)' }} />
                    <strong style={{ fontSize: 13.5 }}>{a.label}</strong>
                    <span style={{ fontSize: 12, color: 'var(--mute)' }}>
                      {a.negativeCount} of {a.totalCount} reviews negative ({a.negativeSharePct}%)
                      · avg {a.avgRating}
                    </span>
                  </div>
                  <p style={{ margin: '7px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                    {a.suggestedAction}
                  </p>
                  {a.worstExample && (
                    <p style={{
                      margin: '8px 0 0', padding: '7px 11px', borderRadius: 7,
                      background: 'var(--hover)', fontSize: 12.5, color: 'var(--mute)',
                      lineHeight: 1.5, fontStyle: 'italic',
                    }}>
                      “{a.worstExample}”
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Reply to guests</h3>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.55 }}>
            Reviews of 3 stars or below. These are private, not public posts — a reply reaches the
            guest only if you send it to the number they left.
          </p>

          {negatives.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--mute)' }}>Nothing below 4 stars in this window.</p>
          ) : negatives.map((r) => (
            <div key={r.id} style={{
              border: '1px solid var(--line)', borderRadius: 10,
              padding: '13px 15px', marginBottom: 9,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13.5 }}>{r.overall_rating}/5</strong>
                {r.themeLabel && (
                  <span style={{
                    padding: '1px 8px', borderRadius: 999, background: 'var(--hover)',
                    color: 'var(--mute)', fontSize: 10, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '.05em',
                  }}>{r.themeLabel}</span>
                )}
                <span style={{ fontSize: 12, color: 'var(--mute)' }}>
                  {r.customer_name || 'Guest'}
                  {r.table_number ? ` · table ${r.table_number}` : ''}
                  {' · '}
                  {new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </span>
              </div>
              {r.comment && (
                <p style={{ margin: '7px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                  {r.comment}
                </p>
              )}
              <ReplyBox review={r} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
