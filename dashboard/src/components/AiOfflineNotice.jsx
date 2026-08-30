import { CloudOff } from 'lucide-react';
import { useAIStatus } from '../hooks/useAI';

/**
 * A quiet, honest notice that the local AI is unreachable.
 *
 * Most AI features here degrade gracefully to a deterministic fallback — a
 * template reply, a rule-based waste note — which is the right behaviour, but it
 * happens silently, so the operator can't tell whether they're reading the model
 * or the fallback. This says which, wherever an AI-assisted section lives, so a
 * cold or offline model is visible rather than invisible.
 *
 * Renders nothing when the model is reachable, or when AI is disabled for the
 * restaurant (that's a different message the feature itself already shows).
 *
 * @param feature  short label for what falls back, e.g. "reply drafts".
 */
export default function AiOfflineNotice({ feature = 'AI features' }) {
  const { data: status } = useAIStatus();
  // Only for the "enabled but unreachable" case. `enabled === false` is handled
  // by each feature's own copy; a still-loading/undefined status shows nothing.
  if (!status || status.enabled === false || status.ok !== false) return null;

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '9px 13px', borderRadius: 8, margin: '0 0 14px',
        background: 'var(--paper-2)', border: '1px solid var(--line)',
        fontSize: 12.5, lineHeight: 1.5, color: 'var(--mute)',
      }}
    >
      <CloudOff size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2, color: 'var(--warn)' }} />
      <span>
        <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>The local AI is offline.</strong>{' '}
        {feature} fall back to rule-based results until it's reachable — nothing is broken, but the
        output here isn't model-generated right now.
      </span>
    </div>
  );
}
