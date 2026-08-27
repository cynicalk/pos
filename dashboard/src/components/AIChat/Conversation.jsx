import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowRight, AlertTriangle } from 'lucide-react';
import { useAIChat } from '../../context/AIContext';
import { useAuth } from '../../hooks/useAuth';
import { useCurrency } from '../../context/CurrencyContext';
import { ASSISTANT, greeting, PROMPT_GROUPS, CARD_META } from './assistant';

// Minimal markdown: **bold** and bullet/numbered lines. The model is prompted
// to answer in short lists, so this covers what it actually produces.
function Inline({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p,
  );
}

function MessageBody({ content }) {
  return content.split('\n').map((line, i) => {
    const bullet = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
    if (bullet) {
      return (
        <div key={i} className="flex gap-2 pl-1">
          <span style={{ color: 'var(--mute-2)', flexShrink: 0 }}>•</span>
          <span><Inline text={bullet[1]} /></span>
        </div>
      );
    }
    if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
    return <div key={i}><Inline text={line} /></div>;
  });
}

// Structured result card — rendered from the tool's raw rows (exact SQL data),
// with the model's narration in a separate bubble.
function DataCard({ kind, payload, send, streaming, lastQuestion }) {
  const { format } = useCurrency();
  const { setPanelOpen } = useAIChat();
  const navigate = useNavigate();
  const meta = CARD_META[kind];
  if (!meta) return null;

  // Carry the card's context into the target page (e.g. its date window) and
  // get the floating panel out of the way
  const openTarget = () => {
    let to = meta.link.to;
    if (kind === 'waste' && payload.days) {
      const fmt = (d) => d.toISOString().slice(0, 10);
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - payload.days);
      to = `${to}?from=${fmt(fromDate)}&to=${fmt(new Date())}`;
    }
    setPanelOpen(false);
    navigate(to);
  };

  // Don't offer the question this card just answered as a follow-up
  const follows = meta.follows.filter(
    (f) => f.full.toLowerCase() !== (lastQuestion || '').toLowerCase(),
  );

  const rowView = (r) => {
    if (kind === 'waste')   return { value: format(r.cost), color: 'var(--bad)' };
    if (kind === 'stock')   return { value: `${r.stock} ${r.unit} left`, color: 'var(--bad)' };
    if (kind === 'sales')   return { value: `${r.qty} sold · ${format(r.revenue)}`, color: 'var(--ink-2)' };
    if (kind === 'recipes') return { value: `${r.pct}%`, color: r.pct >= 35 ? 'var(--bad)' : 'var(--ink-2)' };
    return { value: '', color: 'var(--ink-2)' };
  };

  return (
    <div className="flex justify-start">
      <div className="p-3" style={{ maxWidth: '92%', minWidth: 250, background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: '12px 12px 12px 4px', animation: 'ai-rise .25s ease both' }}>
        <div className="overflow-hidden" style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10 }}>
          {kind === 'waste' && payload.totalCost != null && (
            <>
              <div className="flex items-end justify-between px-3.5 pb-2.5 pt-3">
                <div>
                  <p className="m-0" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--label)' }}>
                    {payload.title || meta.metric} · {payload.days}d
                  </p>
                  <p className="m-0 mt-1 mono" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.02em', color: 'var(--ink)' }}>
                    {format(payload.totalCost)}
                  </p>
                </div>
                {payload.deltaPct != null && (
                  <span className="rounded-full px-2 py-0.5" style={{ fontSize: 11, fontWeight: 500, ...(payload.deltaPct >= 0 ? { color: 'var(--bad)', background: 'var(--bad-soft)' } : { color: 'var(--ok)', background: 'var(--ok-soft)' }) }}>
                    {payload.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(payload.deltaPct)}% vs prev {payload.days}d
                  </span>
                )}
              </div>
              <div style={{ height: 1, background: 'var(--line)' }} />
            </>
          )}
          {payload.rows.map((r, i) => {
            const { value, color } = rowView(r);
            return (
              <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-2" style={{ borderBottom: i < payload.rows.length - 1 ? '1px solid var(--line)' : 0, fontSize: 12.5 }}>
                <span style={{ color: 'var(--ink-2)' }}>{r.label}</span>
                <span className="mono" style={{ fontSize: 12, color, whiteSpace: 'nowrap' }}>{value}</span>
              </div>
            );
          })}
          {payload.count > payload.rows.length && (
            <div className="px-3.5 py-2" style={{ borderTop: '1px solid var(--line)', fontSize: 11.5, color: 'var(--mute)' }}>
              + {payload.count - payload.rows.length} more in {CARD_META[kind].link.label.replace('Open in ', '')}
            </div>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <button
            onClick={openTarget}
            className="mr-1 inline-flex cursor-pointer items-center gap-1"
            style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--copper)', background: 'none', border: 0, padding: 0 }}
          >
            {meta.link.label} <ArrowRight size={12} />
          </button>
          {follows.map((f) => (
            <button
              key={f.short}
              onClick={() => send(f.full)}
              disabled={streaming}
              className="cursor-pointer transition-colors disabled:opacity-50"
              style={{ fontSize: 11.5, color: 'var(--mute)', background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 999, padding: '5px 10px' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--mute)'; }}
            >
              {f.short}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Conversation({ showPrompts = true, layout = 'panel' }) {
  const { messages, streaming, pendingConfirm, confirming, send, respondConfirm } = useAIChat();
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pendingConfirm, streaming]);

  const submit = () => {
    if (!draft.trim() || streaming) return;
    send(draft);
    setDraft('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col gap-5 pt-1">
            <div>
              <p className="m-0" style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-.015em', color: 'var(--ink)' }}>
                {greeting(user?.name?.split(' ')[0])}
              </p>
              <p className="m-0 mt-1.5" style={{ fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.5 }}>
                I'm reading tonight's waste, stock and sales as they happen. What do you want to know?
              </p>
            </div>

            {showPrompts && (
              <div className={layout === 'page' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : 'flex flex-col gap-3.5'}>
                {PROMPT_GROUPS.map((g) => (
                  <div key={g.label} className="flex flex-col gap-2">
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--label)' }}>
                      {g.label}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {g.prompts.map((p) => (
                        <button
                          key={p.short}
                          onClick={() => send(p.full)}
                          className="cursor-pointer transition-colors"
                          style={{ fontSize: 12, color: 'var(--ink-2)', background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 999, padding: '6px 11px' }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.background = 'var(--paper-3)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.background = 'var(--paper-2)'; }}
                        >
                          {p.short}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((m, i) => {
            if (m.role === 'data') {
              const lastQuestion = messages.slice(0, i).filter((x) => x.role === 'user').pop()?.content;
              return <DataCard key={i} kind={m.kind} payload={m.payload} send={send} streaming={streaming} lastQuestion={lastQuestion} />;
            }
            if (m.role === 'error') {
              return (
                <div key={i} className="flex items-start gap-2 rounded-[10px] px-3 py-2" style={{ background: 'var(--bad-soft)', fontSize: 12.5, color: 'var(--bad)', lineHeight: 1.45, animation: 'ai-rise .25s ease both' }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  {m.content}
                </div>
              );
            }
            const isUser = m.role === 'user';
            return (
              <div key={i} className={isUser ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className="px-3 py-2"
                  style={{
                    maxWidth: '86%',
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    animation: 'ai-rise .25s ease both',
                    ...(isUser
                      ? { background: 'var(--ink)', color: 'var(--accent-on)', borderRadius: '12px 12px 4px 12px' }
                      : { background: 'var(--paper-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '12px 12px 12px 4px' }),
                  }}
                >
                  <MessageBody content={m.content} />
                </div>
              </div>
            );
          })}

          {streaming && !messages[messages.length - 1]?.streaming && (
            <div className="flex justify-start">
              <span className="flex items-center gap-2 px-3 py-2" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: '11px 11px 11px 4px', fontSize: 12.5, color: 'var(--mute)' }}>
                {ASSISTANT.name} is thinking
                <span className="flex gap-[3px]">
                  <span className="ai-dot" />
                  <span className="ai-dot" style={{ animationDelay: '.15s' }} />
                  <span className="ai-dot" style={{ animationDelay: '.3s' }} />
                </span>
              </span>
            </div>
          )}

          {pendingConfirm && (
            <div className="p-3" style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderLeft: '3px solid var(--warn)', borderRadius: '4px 10px 10px 4px', animation: 'ai-rise .25s ease both' }}>
              <p className="m-0" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--warn)' }}>
                Confirm before I act
              </p>
              <p className="m-0 mt-1.5" style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45 }}>{pendingConfirm.summary}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => respondConfirm(true)} disabled={confirming} className="btn-primary btn-sm">
                  {confirming ? 'Working…' : 'Confirm'}
                </button>
                <button onClick={() => respondConfirm(false)} disabled={confirming} className="btn-secondary btn-sm">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--line)' }}>
        <textarea
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          placeholder={`Message ${ASSISTANT.name}…`}
          className="input flex-1 resize-none"
          style={{ minHeight: 38, maxHeight: 96, lineHeight: 1.4, borderRadius: 9, padding: '9px 12px' }}
        />
        <button
          onClick={submit}
          disabled={!draft.trim() || streaming}
          title="Send"
          className="grid flex-shrink-0 cursor-pointer place-items-center disabled:opacity-50"
          style={{ width: 38, height: 38, borderRadius: 9, border: 0, background: 'var(--ink)', color: 'var(--accent-on)' }}
        >
          <ArrowUp size={16} />
        </button>
      </div>
    </div>
  );
}
