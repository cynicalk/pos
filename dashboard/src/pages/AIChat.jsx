import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, RotateCcw, Minimize2 } from 'lucide-react';
import { useAIChat } from '../context/AIContext';
import { useAIStatus } from '../hooks/useAI';
import { ASSISTANT } from '../components/AIChat/assistant';
import Conversation from '../components/AIChat/Conversation';

export default function AIChat() {
  const { reset, setPanelOpen } = useAIChat();
  const { data: status, isLoading } = useAIStatus();
  const location = useLocation();
  const navigate = useNavigate();

  const minimize = () => {
    setPanelOpen(true);
    navigate(location.state?.from || '/overview');
  };

  return (
    <div className="mx-auto flex h-full w-full min-h-0 max-w-[760px] flex-col">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center" style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--ink)', color: 'var(--accent-on)' }}>
            <Sparkles size={17} />
          </span>
          <div>
            <h2 className="m-0" style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.015em', color: 'var(--ink)' }}>{ASSISTANT.name}</h2>
            <p className="m-0 mt-0.5 flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--mute)' }}>
              <span className="pulse-dot" style={{ width: 6, height: 6 }} /> Reading live waste, stock, recipe & sales data
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={reset} className="btn-secondary btn-sm" title="Start a new conversation">
            <RotateCcw size={13} />
            New chat
          </button>
          <button onClick={minimize} className="btn-secondary btn-sm" title="Collapse to floating panel">
            <Minimize2 size={13} />
            Minimize
          </button>
        </div>
      </div>

      {!isLoading && status?.enabled === false ? (
        <div className="rounded-[8px] p-4" style={{ background: 'var(--warn-soft)', fontSize: 13, color: 'var(--ink-2)' }}>
          The AI assistant is not enabled for this restaurant. Contact your platform operator to turn it on.
        </div>
      ) : !isLoading && status?.ok === false ? (
        <div className="rounded-[8px] p-4" style={{ background: 'var(--warn-soft)', fontSize: 13, color: 'var(--ink-2)' }}>
          {ASSISTANT.name} is offline right now. Everything else in the dashboard keeps working — try again in a bit.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden rounded-[14px]" style={{ background: 'var(--paper)', border: '1px solid var(--line-2)' }}>
          <Conversation layout="page" />
        </div>
      )}
    </div>
  );
}
