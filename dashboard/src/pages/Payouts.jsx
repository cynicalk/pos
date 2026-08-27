import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Wallet, Upload, AlertTriangle, Info, Check } from 'lucide-react';
import api from '../api/client';
import { queryClient } from '../lib/queryClient';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Payouts — settlement reconciliation (MERGE_PLAN.md Phase 8, Tier 2).
 *
 * Ships empty. The parser and the checks are built and tested against a
 * fixture; nothing on this screen is populated until a real settlement export
 * is uploaded, and the empty state says exactly that rather than rendering a
 * dashboard of zeros.
 *
 * Upload is two steps on purpose. The preview shows what was read, what was
 * rejected and why, and what the checks found — and only then does the operator
 * commit. A file that imports silently and then reveals a fifth of its rows
 * were unreadable is a file they have already acted on.
 */

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

const SEVERITY_TONE = {
  critical: { color: 'var(--bad)',  bg: 'var(--bad-soft)' },
  high:     { color: 'var(--bad)',  bg: 'var(--bad-soft)' },
  medium:   { color: 'var(--warn)', bg: 'var(--warn-soft)' },
  low:      { color: 'var(--mute)', bg: 'var(--hover)' },
};

function Notice({ children, tone = 'neutral' }) {
  const bg = tone === 'warn' ? 'var(--warn-soft)' : 'var(--hover)';
  const color = tone === 'warn' ? 'var(--warn)' : 'var(--mute)';
  const Icon = tone === 'warn' ? AlertTriangle : Info;
  return (
    <div style={{
      display: 'flex', gap: 8, padding: '11px 14px', borderRadius: 9,
      background: bg, marginBottom: 16,
    }}>
      <Icon size={15} strokeWidth={2} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function Findings({ findings, format }) {
  if (!findings?.length) {
    return (
      <Notice>
        Nothing to flag: this settlement adds up, and no check found money missing.
      </Notice>
    );
  }
  return (
    <div style={{ marginBottom: 16 }}>
      {findings.map((f, i) => {
        const tone = SEVERITY_TONE[f.severity] || SEVERITY_TONE.low;
        return (
          <div key={`${f.kind}-${i}`} style={{
            border: '1px solid var(--line)', borderRadius: 10,
            padding: '12px 15px', marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <AlertTriangle size={14} strokeWidth={2.2} style={{ color: tone.color }} />
              <strong style={{ fontSize: 13.5 }}>{f.title}</strong>
              <span style={{
                padding: '1px 8px', borderRadius: 999, background: tone.bg, color: tone.color,
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em',
              }}>{f.severity}</span>
              {/* Shown only when there IS a figure. A finding we could not
                  price shows nothing, never ₹0. */}
              {f.amount !== null && f.amount !== undefined && (
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600 }}>
                  {format(f.amount)}
                </span>
              )}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              {f.detail}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ContractsTab() {
  const { data } = useQuery({
    queryKey: ['payouts', 'contracts'],
    queryFn: async () => (await api.get('/payouts/contracts')).data,
    enabled: !!localStorage.getItem('pos_user'),
  });
  const [draft, setDraft] = useState({});
  const [error, setError] = useState(null);

  const save = useMutation({
    mutationFn: async ({ platform, pct }) => (await api.put(
      `/payouts/contracts/${platform}`, { commissionRatePct: pct },
    )).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payouts'] }),
    onError: (e) => setError(e?.response?.data?.error || 'Could not save that rate'),
  });

  if (!data) return <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>;

  return (
    <>
      <Notice>{data.note}</Notice>
      {error && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--bad)' }}>{error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
          <th style={th}>Platform</th>
          <th style={th}>Contracted commission</th>
          <th style={th} />
        </tr></thead>
        <tbody>
          {data.platforms.map((p) => (
            <tr key={p.platform} style={{ borderBottom: '1px solid var(--line)' }}>
              <td style={td}>{p.label}</td>
              <td style={td}>
                <input
                  style={{ ...input, width: 100 }}
                  type="number" min="0.1" max="99" step="0.1"
                  placeholder={p.commissionRatePct ?? 'not set'}
                  value={draft[p.platform] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [p.platform]: e.target.value })}
                />
                <span style={{ marginLeft: 6, fontSize: 12.5, color: 'var(--mute)' }}>%</span>
                {p.commissionRatePct === null && (
                  <span style={{ marginLeft: 10, fontSize: 11.5, color: 'var(--warn)' }}>
                    commission check is skipped without this
                  </span>
                )}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <button
                  style={btn(true)}
                  disabled={!draft[p.platform] || save.isPending}
                  onClick={() => {
                    setError(null);
                    save.mutate({ platform: p.platform, pct: draft[p.platform] });
                  }}
                >Save</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function UploadTab({ format }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [imported, setImported] = useState(null);
  const [error, setError] = useState(null);

  const send = (path) => async () => {
    const body = new FormData();
    body.append('file', file);
    const { data } = await api.post(`/payouts/${path}`, body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  };

  const doPreview = useMutation({
    mutationFn: send('preview'),
    onSuccess: (d) => { setPreview(d); setImported(null); },
    onError: (e) => setError(e?.response?.data?.error || 'Could not read that file'),
  });

  const doImport = useMutation({
    mutationFn: send('import'),
    onSuccess: (d) => {
      setImported(d);
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
    },
    onError: (e) => setError(e?.response?.data?.error || 'Could not import that file'),
  });

  return (
    <>
      <Notice>
        Upload the settlement export your platform emails you. CookLyt reads it, checks
        whether it adds up, and — if you have entered your contracted commission rate —
        whether commission was charged correctly. Nothing is saved until you confirm.
      </Notice>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setPreview(null); setImported(null); setError(null);
          }}
          style={{ fontSize: 12.5 }}
        />
        <button
          style={btn(true)}
          disabled={!file || doPreview.isPending}
          onClick={() => { setError(null); doPreview.mutate(); }}
        >
          <Upload size={13} strokeWidth={2.2} />
          {doPreview.isPending ? 'Reading…' : 'Check file'}
        </button>
      </div>

      {error && <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--bad)' }}>{error}</p>}

      {imported && (
        <div style={{
          padding: '12px 15px', borderRadius: 9, background: 'var(--ok-soft)', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            <Check size={15} strokeWidth={2.4} style={{ color: 'var(--ok)' }} />
            <strong style={{ fontSize: 13.5 }}>Imported</strong>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            {imported.ordersImported} order{imported.ordersImported === 1 ? '' : 's'} added
            {imported.ordersAlreadyPresent > 0 && (
              <>; {imported.ordersAlreadyPresent} were already on file from an earlier upload
                and were not counted again</>
            )}
            {imported.rowsRejected > 0 && <>; {imported.rowsRejected} row(s) could not be read</>}.
          </p>
        </div>
      )}

      {preview && (
        <>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>
            {preview.parsed.platformLabel} · {preview.parsed.periodStart || 'no period'}
            {preview.parsed.periodEnd ? ` → ${preview.parsed.periodEnd}` : ''}
          </h3>

          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 21, fontWeight: 600 }}>{preview.parsed.rowsRead}</div>
              <div style={{ fontSize: 12, color: 'var(--mute)' }}>
                of {preview.parsed.rowCount} rows read
              </div>
            </div>
            <div>
              <div style={{ fontSize: 21, fontWeight: 600 }}>
                {format(preview.parsed.totals.grossSales)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--mute)' }}>gross</div>
            </div>
            <div>
              <div style={{ fontSize: 21, fontWeight: 600 }}>
                {format(preview.parsed.totals.netPayout)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--mute)' }}>paid out</div>
            </div>
            <div>
              <div style={{
                fontSize: 21, fontWeight: 600,
                color: preview.report.totalRecoverable > 0 ? 'var(--bad)' : 'var(--ink)',
              }}>
                {format(preview.report.totalRecoverable)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--mute)' }}>
                established as recoverable
              </div>
            </div>
          </div>

          <Findings findings={preview.report.findings} format={format} />

          {/* Every rejected row, named. The operator can open the file at that
              line and see for themselves. */}
          {preview.parsed.rejected.length > 0 && (
            <>
              <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>
                Rows that could not be read
              </h4>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--mute)' }}>
                These are excluded from every figure above. Nothing was guessed to fill them in.
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18 }}>
                <tbody>
                  {preview.parsed.rejected.map((r) => (
                    <tr key={`${r.line}`} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ ...td, width: 70, color: 'var(--mute)' }}>line {r.line}</td>
                      <td style={td}>{r.orderId || '—'}</td>
                      <td style={{ ...td, color: 'var(--mute)' }}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <button
            style={btn(true)}
            disabled={doImport.isPending || preview.parsed.rowsRead === 0}
            onClick={() => { setError(null); doImport.mutate(); }}
          >
            {doImport.isPending ? 'Importing…' : `Import ${preview.parsed.rowsRead} order(s)`}
          </button>
        </>
      )}
    </>
  );
}

function HistoryTab({ format }) {
  const { data } = useQuery({
    queryKey: ['payouts', 'list'],
    queryFn: async () => (await api.get('/payouts')).data,
    enabled: !!localStorage.getItem('pos_user'),
  });

  if (!data) return <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</p>;

  // The empty state is a real state, said plainly — not a grid of zeros.
  if (data.empty) {
    return (
      <Notice>
        No settlement has been uploaded yet, so there is nothing to reconcile. CookLyt cannot
        fetch settlements from{' '}
        {data.supportedPlatforms.map((p) => p.label).join(' or ')} — there is no integration
        and none is planned. Upload the export they email you and the checks run against it.
      </Notice>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr style={{ borderBottom: '1px solid var(--line-2)' }}>
        <th style={th}>Period</th>
        <th style={th}>Platform</th>
        <th style={th}>Gross</th>
        <th style={th}>Paid out</th>
        <th style={th}>Recoverable</th>
        <th style={th}>Rows</th>
      </tr></thead>
      <tbody>
        {data.settlements.map((s) => (
          <tr key={s.id} style={{ borderBottom: '1px solid var(--line)' }}>
            <td style={td}>{s.periodStart || '—'}{s.periodEnd ? ` → ${s.periodEnd}` : ''}</td>
            <td style={{ ...td, color: 'var(--mute)' }}>{s.platform}</td>
            <td style={td}>{format(s.grossSales)}</td>
            <td style={td}>{format(s.netPayout)}</td>
            <td style={{ ...td, color: s.recoverable > 0 ? 'var(--bad)' : 'var(--mute)' }}>
              {s.recoverable > 0 ? format(s.recoverable) : '—'}
            </td>
            <td style={{ ...td, color: 'var(--mute)' }}>
              {s.rowsRead}
              {/* Carried permanently, not just at import: every total in this
                  row describes only the rows we understood. */}
              {s.rowsRejected > 0 && (
                <span style={{ color: 'var(--warn)' }}> · {s.rowsRejected} unread</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const TABS = [
  { key: 'history',   label: 'Settlements' },
  { key: 'upload',    label: 'Upload' },
  { key: 'contracts', label: 'Commission rates' },
];

export default function Payouts() {
  const [tab, setTab] = useState('history');
  const { format } = useCurrency();

  return (
    <div style={{ padding: '24px 22px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Wallet size={19} strokeWidth={2} />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>Payouts</h1>
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

      {tab === 'history' && <HistoryTab format={format} />}
      {tab === 'upload' && <UploadTab format={format} />}
      {tab === 'contracts' && <ContractsTab />}
    </div>
  );
}
