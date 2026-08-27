import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, X, Maximize2, RotateCcw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAIStatus } from '../../hooks/useAI';
import { useAIChat } from '../../context/AIContext';
import { ASSISTANT } from './assistant';
import Conversation from './Conversation';

export default function ChatBubble() {
  const { panelOpen: open, setPanelOpen: setOpen, reset, messages } = useAIChat();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dismissedId, setDismissedId] = useState(() => sessionStorage.getItem('yz_nudge'));

  const allowed = user?.role === 'admin' || user?.role === 'staff';
  const { data: status } = useAIStatus(allowed);

  // Hidden only for roles without API access, on the full-page chat itself, or
  // when the operator disabled the assistant for this restaurant (feature off,
  // not a fault state). When the model is merely offline the bubble stays
  // visible and the panel explains — silently disappearing reads as a bug.
  if (!allowed || location.pathname === '/ai-chat' || status?.enabled === false) return null;
  const offline = status?.ok === false;

  // Optional proactive nudge from /ai/status ({ id, text }) — dismissable per session
  const nudge = status?.nudge;
  const showNudge = !open && !!nudge && dismissedId !== nudge.id;
  const dismissNudge = () => {
    sessionStorage.setItem('yz_nudge', nudge.id);
    setDismissedId(nudge.id);
  };

  const headerBtn = {
    onMouseEnter: (e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; },
    onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; },
    className: 'rounded-md p-1.5 cursor-pointer transition-colors',
    style: { color: 'var(--mute)', background: 'transparent', border: 0 },
  };

  return createPortal(
    <>
      {open && (
        <div
          className="fixed z-[55] flex flex-col overflow-hidden inset-x-0 bottom-0 h-[78vh] rounded-t-[14px] sm:inset-x-auto sm:right-5 sm:bottom-[84px] sm:h-[580px] sm:max-h-[calc(100vh-120px)] sm:w-[384px] sm:rounded-[14px]"
          style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', boxShadow: '0 24px 64px -16px rgba(10,10,10,.28)' }}
        >
          <div className="flex items-center justify-between px-3.5 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <span className="flex items-center gap-2.5">
              <span className="grid place-items-center" style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--ink)', color: 'var(--accent-on)' }}>
                <Sparkles size={15} />
              </span>
              <span className="flex flex-col" style={{ lineHeight: 1.15 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{ASSISTANT.name}</span>
                <span className="flex items-center gap-1.5" style={{ fontSize: 10.5, color: 'var(--mute)' }}>
                  {offline
                    ? <><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mute-2)', display: 'inline-block' }} /> Offline</>
                    : <><span className="pulse-dot" style={{ width: 6, height: 6 }} /> {ASSISTANT.status}</>}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={reset} title="New chat" {...headerBtn}>
                  <RotateCcw size={13} />
                </button>
              )}
              <button onClick={() => { setOpen(false); navigate('/ai-chat', { state: { from: location.pathname } }); }} title="Open full page" {...headerBtn}>
                <Maximize2 size={14} />
              </button>
              <button onClick={() => setOpen(false)} title="Close" {...headerBtn}>
                <X size={15} />
              </button>
            </span>
          </div>
          {offline ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <p className="m-0 text-center" style={{ fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6, maxWidth: 240 }}>
                {ASSISTANT.name} is offline right now. The rest of the dashboard keeps working — try again in a bit.
              </p>
            </div>
          ) : (
            <Conversation />
          )}
        </div>
      )}

      {/* Proactive nudge — sits just above the launcher */}
      {showNudge && (
        <div
          className="fixed bottom-[84px] right-5 z-[55] max-w-[230px] p-3"
          style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: '12px 12px 4px 12px', boxShadow: '0 14px 36px -12px rgba(10,10,10,.30)', animation: 'ai-rise .4s ease both' }}
        >
          <p className="m-0" style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.45 }}>{nudge.text}</p>
          <button
            onClick={() => { setOpen(true); dismissNudge(); }}
            className="mt-2 cursor-pointer"
            style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--copper)', background: 'none', border: 0, padding: 0 }}
          >
            Show me →
          </button>
          <button
            onClick={dismissNudge}
            className="absolute right-1.5 top-1.5 grid h-[18px] w-[18px] cursor-pointer place-items-center rounded-[5px]"
            style={{ color: 'var(--mute-2)', background: 'none', border: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--mute-2)'; }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Launcher */}
      <button
        onClick={() => setOpen(!open)}
        title={ASSISTANT.name}
        className="fixed bottom-5 right-5 z-[55] grid place-items-center rounded-full cursor-pointer transition-transform hover:scale-105"
        style={{
          width: 52,
          height: 52,
          background: 'var(--ink)',
          color: 'var(--accent-on)',
          border: 0,
          boxShadow: '0 10px 28px -8px rgba(10,10,10,.45)',
        }}
      >
        {open ? <X size={20} /> : <Sparkles size={20} />}
        {showNudge && (
          <span
            className="absolute -right-1 -top-1 grid place-items-center"
            style={{ minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: 'var(--copper)', color: '#fff', fontSize: 10, fontWeight: 600, border: '2px solid var(--accent-on)' }}
          >
            1
          </span>
        )}
      </button>
    </>,
    document.body,
  );
}
