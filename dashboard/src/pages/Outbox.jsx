import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, Info, Clock, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import api from '../api/client';
import { CARD, LABEL, th, td as tdBase } from '../lib/ui';

/**
 * Message Outbox — the persisted queue every guest-facing message goes through.
 *
 * Four features (waitlist alerts, winback, smart alerts, staff nudges) used to
 * "send" by writing to a log line that vanished instantly. Now they enqueue
 * here, and this screen tells the truth about each message: queued (waiting for
 * a channel), skipped (correctly not sent — no opt-in), sent, or failed. While
 * no channel is connected, the honest headline is how many are waiting, not a
 * count of things delivered.
 */

// Rows here wrap to two lines (reason under a pill), so cells top-align.
const td = { ...tdBase, verticalAlign: 'top' };

const STATUS = {
  queued:  { label: 'Queued',  color: 'var(--info)', bg: 'var(--info-soft)', Icon: Clock },
  sent:    { label: 'Sent',    color: 'var(--ok)',   bg: 'var(--ok-soft)',   Icon: CheckCircle2 },
  failed:  { label: 'Failed',  color: 'var(--bad)',  bg: 'var(--bad-soft)',  Icon: XCircle },
  skipped: { label: 'Skipped', color: 'var(--mute)', bg: 'var(--paper-3)',   Icon: MinusCircle },
};

const KIND_LABEL = {
  waitlist_queued: 'Waitlist — joined',
  waitlist_eta: 'Waitlist — ETA update',
  waitlist_ready: 'Waitlist — table ready',
  winback: 'Winback offer',
  alert: 'Smart alert',
  staff_task: 'Staff task',
};

function Pill({ status }) {
  const s = STATUS[status] || STATUS.queued;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 999, background: s.bg, color: s.color, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>
      <s.Icon size={11} strokeWidth={2.2} /> {s.label}
    </span>
  );
}

const shortTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const FILTERS = ['all', 'queued', 'sent', 'skipped', 'failed'];

export default function Outbox() {
  const [filter, setFilter] = useState('all');
  const { data, isLoading } = useQuery({
    queryKey: ['messaging', 'outbox', filter],
    queryFn: async () => {
      const q = filter === 'all' ? '' : `?status=${filter}`;
      return (await api.get(`/messaging/outbox${q}`)).data;
    },
    enabled: !!localStorage.getItem('pos_user'),
    staleTime: 30_000,
  });

  if (isLoading || !data) return <div style={{ padding: 32, color: 'var(--mute)' }}>Loading…</div>;

  const { summary, messages, channelConnected } = data;

  return (
    <div style={{ padding: '26px 24px 48px', maxWidth: 1040, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>
          Message Outbox
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)', maxWidth: 760 }}>
          Every guest-facing message routes through here. Nothing is sent until a channel is connected —
          so what you see is honest: waiting, skipped, or (once wired) delivered.
        </p>
      </div>

      {/* ── Channel state ───────────────────────────────────────────────── */}
      <div style={{ padding: '13px 16px', borderLeft: `2px solid ${channelConnected ? 'var(--ok)' : 'var(--warn)'}`, background: 'var(--paper-2)', borderRadius: '0 8px 8px 0' }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--mute)' }}>
          <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>
            {channelConnected ? 'Channel connected.' : 'No send channel connected yet.'}
          </strong>{' '}
          {channelConnected
            ? 'Queued messages are being delivered.'
            : 'Messages are queued and will send automatically once the WhatsApp Business API is wired. '
              + 'Guests who never opted in are marked skipped, not sent.'}
        </p>
      </div>

      {/* ── Summary ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        {[
          ['Pending channel', summary.pendingChannel, 'queued, waiting to send'],
          ['Sent', summary.sent, 'delivered once wired'],
          ['Skipped', summary.skipped, 'no opt-in — correctly not sent'],
          ['Failed', summary.failed, 'delivery errors to retry'],
        ].map(([label, value, sub]) => (
          <div key={label} style={CARD}>
            <div style={LABEL}>{label}</div>
            <div className="mono num" style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filter ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: `1px solid ${filter === f ? 'var(--ink)' : 'var(--line-2)'}`,
              background: filter === f ? 'var(--ink)' : 'transparent',
              color: filter === f ? 'var(--paper)' : 'var(--ink)', textTransform: 'capitalize',
            }}>
            {f}
          </button>
        ))}
      </div>

      {/* ── Messages ────────────────────────────────────────────────────── */}
      {messages.length === 0 ? (
        <div style={{ ...CARD, color: 'var(--mute)' }}>
          Nothing here yet{filter !== 'all' ? ` with status "${filter}"` : ''}. Messages appear as
          waitlist updates and other guest-facing events fire.
        </div>
      ) : (
        <div style={CARD}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={th}>Status</th>
                  <th style={th}>Type</th>
                  <th style={th}>To</th>
                  <th style={th}>Message</th>
                  <th style={th}>When</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={td}>
                      <Pill status={m.status} />
                      {m.status_reason && (
                        <div style={{ fontSize: 10.5, color: 'var(--mute)', marginTop: 4 }}>{m.status_reason}</div>
                      )}
                    </td>
                    <td style={{ ...td, color: 'var(--mute)', whiteSpace: 'nowrap' }}>{KIND_LABEL[m.kind] || m.kind}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{m.recipient_name || '—'}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{m.recipient}</div>
                    </td>
                    <td style={{ ...td, color: 'var(--ink-2)', maxWidth: 340 }}>{m.body}</td>
                    <td style={{ ...td, color: 'var(--mute)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{shortTime(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{ display: 'flex', gap: 7, alignItems: 'flex-start', margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--mute)' }}>
        <Info size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 3 }} />
        <span>
          This is the delivery groundwork for Smart Alerts, Staff Task nudges and Winback campaigns —
          waitlist and winback already route here. Connecting the WhatsApp Business API is all that stands
          between "queued" and "sent"; nothing about these features changes when it lands.
        </span>
      </p>
    </div>
  );
}
