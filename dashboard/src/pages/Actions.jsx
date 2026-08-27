import { useState } from 'react';
import {
  Megaphone, AlertTriangle, Lightbulb, RefreshCw, Check, X, CircleCheck,
  TrendingDown, TrendingUp, Minus,
} from 'lucide-react';
import { useActions, useEvaluateActions, useSetActionStatus } from '../hooks/useActions';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Action Center — the operator's queue of what the rules engine found.
 *
 * Ordering comes from the server's opportunity ranking: findings with a
 * defensible rupee figure first, then by priority. The rule that keeps this
 * honest is that an action with no measurable impact shows **no amount at all**
 * rather than a zero or an estimate — see modules/rules/opportunity.js.
 */

const PRIORITY_STYLE = {
  critical: { color: 'var(--bad)',  bg: 'var(--bad-soft)',  label: 'Critical' },
  high:     { color: 'var(--bad)',  bg: 'var(--bad-soft)',  label: 'High' },
  medium:   { color: 'var(--warn)', bg: 'var(--warn-soft)', label: 'Medium' },
  low:      { color: 'var(--mute)', bg: 'var(--hover)',     label: 'Low' },
};

const VERDICT_STYLE = {
  improved:     { Icon: TrendingUp,   color: 'var(--ok)',   label: 'Improved' },
  worsened:     { Icon: TrendingDown, color: 'var(--bad)',  label: 'Worsened' },
  inconclusive: { Icon: Minus,        color: 'var(--mute)', label: 'No clear change' },
};

const TABS = [
  { key: 'open',         label: 'Open' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'acted_on',     label: 'Acted on' },
  { key: 'dismissed',    label: 'Dismissed' },
];

function Outcome({ action }) {
  if (!action.verdict) return null;
  const style = VERDICT_STYLE[action.verdict];
  if (!style) return null;
  const { Icon, color, label } = style;
  const delta = action.delta_pct == null ? null : Number(action.delta_pct);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12.5, color }}>
      <Icon size={14} strokeWidth={2} />
      <span style={{ fontWeight: 500 }}>{label}</span>
      {delta != null && (
        <span style={{ color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>
          ({delta > 0 ? '+' : ''}{delta.toFixed(1)}% on {action.metric_name?.replace(/_/g, ' ')})
        </span>
      )}
    </div>
  );
}

function ActionCard({ action, onStatus, busy }) {
  const { format } = useCurrency();
  const priority = PRIORITY_STYLE[action.priority] || PRIORITY_STYLE.medium;
  const isAlert = action.action_type === 'alert';
  const Icon = isAlert ? AlertTriangle : Lightbulb;
  const amount = action.opportunity?.amount;

  return (
    <div style={{
      border: '1px solid var(--line)', borderRadius: 10, padding: '16px 18px',
      background: 'var(--paper)', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Icon size={17} strokeWidth={2} style={{ color: priority.color, flexShrink: 0, marginTop: 2 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>
              {action.title}
            </span>
            <span style={{
              padding: '2px 8px', borderRadius: 999, background: priority.bg, color: priority.color,
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em',
            }}>
              {priority.label}
            </span>
          </div>

          {action.description && (
            <p style={{ margin: '7px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--mute)' }}>
              {action.description}
            </p>
          )}

          {/* An amount appears only where the server could defend one. No
              placeholder, no "—": an absent figure means unquantified, and
              inventing one would make the ranking untrustworthy. */}
          {amount != null && (
            <div style={{ marginTop: 9, fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{format(amount)}</span>
              <span style={{ color: 'var(--mute)' }}> — {action.opportunity.basis}</span>
            </div>
          )}

          <Outcome action={action} />

          {action.status === 'open' || action.status === 'acknowledged' ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 13, flexWrap: 'wrap' }}>
              {action.status === 'open' && (
                <button
                  onClick={() => onStatus(action.id, 'acknowledged')}
                  disabled={busy}
                  style={btnStyle()}
                >
                  <Check size={13} strokeWidth={2.2} /> Acknowledge
                </button>
              )}
              <button
                onClick={() => onStatus(action.id, 'acted_on')}
                disabled={busy}
                style={btnStyle(true)}
              >
                <CircleCheck size={13} strokeWidth={2.2} /> I acted on this
              </button>
              <button
                onClick={() => onStatus(action.id, 'dismissed')}
                disabled={busy}
                style={btnStyle()}
              >
                <X size={13} strokeWidth={2.2} /> Dismiss
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function btnStyle(primary = false) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '6px 11px', borderRadius: 7, cursor: 'pointer',
    fontSize: 12.5, fontWeight: 500,
    border: `1px solid ${primary ? 'var(--ink)' : 'var(--line-2)'}`,
    background: primary ? 'var(--ink)' : 'transparent',
    color: primary ? 'var(--paper)' : 'var(--ink)',
  };
}

export default function Actions() {
  const [tab, setTab] = useState('open');
  const { data: actions = [], isLoading } = useActions(tab);
  const evaluate = useEvaluateActions();
  const setStatus = useSetActionStatus();

  const busy = setStatus.isPending || evaluate.isPending;

  return (
    <div style={{ padding: '24px 22px', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Megaphone size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>
          Action Center
        </h1>
        <button
          onClick={() => evaluate.mutate()}
          disabled={busy}
          style={{ ...btnStyle(), marginLeft: 'auto' }}
        >
          <RefreshCw size={13} strokeWidth={2.2} />
          {evaluate.isPending ? 'Checking…' : 'Check now'}
        </button>
      </div>

      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--mute)', lineHeight: 1.55 }}>
        Findings from your own data, checked every fifteen minutes. Highest rupee impact first —
        anything without a figure could not be quantified honestly, so none is shown.
      </p>

      <div style={{ display: 'flex', gap: 4, margin: '18px 0 14px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
              border: '1px solid ' + (tab === t.key ? 'var(--ink)' : 'var(--line)'),
              background: tab === t.key ? 'var(--ink)' : 'transparent',
              color: tab === t.key ? 'var(--paper)' : 'var(--mute)',
              fontWeight: tab === t.key ? 600 : 500,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>
      ) : actions.length === 0 ? (
        <div style={{
          padding: '28px 20px', textAlign: 'center', border: '1px dashed var(--line-2)',
          borderRadius: 10, color: 'var(--mute)',
        }}>
          <p style={{ margin: 0, fontSize: 13.5 }}>
            {tab === 'open'
              ? 'Nothing needs your attention right now.'
              : `No ${TABS.find((t) => t.key === tab)?.label.toLowerCase()} items.`}
          </p>
          {tab === 'open' && (
            <p style={{ margin: '6px 0 0', fontSize: 12.5 }}>
              The rules that can run on your data today cover cancellations, guest ratings and
              tables seated without ordering.
            </p>
          )}
        </div>
      ) : (
        actions.map((a) => (
          <ActionCard
            key={a.id}
            action={a}
            busy={busy}
            onStatus={(id, status) => setStatus.mutate({ id, status })}
          />
        ))
      )}
    </div>
  );
}
