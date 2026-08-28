import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileCode, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../api/client';
import { useCurrency } from '../context/CurrencyContext';

/**
 * Accounting Export — the POS Accounting Bridge.
 *
 * Turns a period's takings into balanced double-entry vouchers and hands them
 * over as a Tally-importable XML or a plain journal CSV. Producing the FILE needs
 * no credentials — that is the whole point of the bridge, and the distinction
 * from the separate (blocked) Tally auto-sync, which does need them.
 *
 * The page leads with the one guarantee that matters: every voucher balances,
 * and the total debits equal the total credits. If the balancing plug ever
 * disagrees with the POS's own discount figures, that gap is shown here, not
 * swallowed — an export you cannot trust is worse than none.
 */

const CARD = {
  border: '1px solid var(--line)', borderRadius: 12,
  background: 'var(--paper)', padding: '18px 20px', minWidth: 0,
};
const LABEL = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '.12em', color: 'var(--label)',
};
const th = {
  padding: '8px 11px', textAlign: 'left', fontSize: 10, fontWeight: 600,
  color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em',
  whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)',
};
const td = { padding: '9px 11px', fontSize: 12.5, color: 'var(--ink)' };
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const input = {
  padding: '6px 9px', borderRadius: 7, border: '1px solid var(--line-2)',
  background: 'var(--paper)', color: 'var(--ink)', fontSize: 13,
};
const btn = (primary = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
  fontSize: 13, fontWeight: 500,
  border: `1px solid ${primary ? 'var(--ink)' : 'var(--line-2)'}`,
  background: primary ? 'var(--ink)' : 'transparent',
  color: primary ? 'var(--paper)' : 'var(--ink)',
});

const iso = (d) => d.toISOString().slice(0, 10);

export default function AccountingExport() {
  const { format } = useCurrency();
  const [to, setTo] = useState(iso(new Date()));
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86400000)));
  const [downloading, setDownloading] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['accounting', 'preview', from, to],
    queryFn: async () => (await api.get(`/accounting/preview?from=${from}&to=${to}`)).data,
    enabled: !!localStorage.getItem('pos_user') && from <= to,
    staleTime: 60_000,
  });

  const download = async (fmt) => {
    setDownloading(fmt);
    try {
      const res = await api.get(`/accounting/export?from=${from}&to=${to}&format=${fmt}`, {
        responseType: 'blob',
      });
      const disp = res.headers['content-disposition'] || '';
      const match = disp.match(/filename="?([^"]+)"?/);
      const name = match ? match[1] : `accounting-${fmt}.${fmt === 'tally' ? 'xml' : 'csv'}`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  const balanced = data?.totals?.balanced;
  const hasData = data && data.totals.days > 0;

  return (
    <div style={{ padding: '26px 24px 48px', maxWidth: 1000, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div>
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px',
            borderRadius: 999, background: 'var(--paper-3)', color: 'var(--mute)',
            fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em',
          }}>
            <FileSpreadsheet size={12} strokeWidth={2.2} /> No credentials needed
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>
          Accounting Export
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)', maxWidth: 760 }}>
          A period's takings as balanced journal vouchers — import straight into Tally, or take the
          journal CSV into any other ledger. This produces the file; nothing leaves for a third party,
          so no accounting credentials are involved.
        </p>
      </div>

      {/* ── Range ───────────────────────────────────────────────────────── */}
      <div style={{ ...CARD, display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...LABEL, marginBottom: 5 }}>From</div>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={input} />
        </div>
        <div>
          <div style={{ ...LABEL, marginBottom: 5 }}>To</div>
          <input type="date" value={to} min={from} max={iso(new Date())} onChange={(e) => setTo(e.target.value)} style={input} />
        </div>
        <div style={{ flex: 1 }} />
        <button style={btn(false)} disabled={!hasData || downloading} onClick={() => download('journal')}>
          <FileSpreadsheet size={14} strokeWidth={2} /> {downloading === 'journal' ? 'Preparing…' : 'Journal CSV'}
        </button>
        <button style={btn(true)} disabled={!hasData || downloading} onClick={() => download('tally')}>
          <FileCode size={14} strokeWidth={2} /> {downloading === 'tally' ? 'Preparing…' : 'Tally XML'}
        </button>
      </div>

      {isLoading && <div style={{ padding: 24, color: 'var(--mute)' }}>Loading…</div>}
      {isError && <div style={{ ...CARD, color: 'var(--bad)' }}>Could not load the period. Check the dates and try again.</div>}

      {data && !hasData && (
        <div style={{ ...CARD, color: 'var(--mute)' }}>
          No completed sales in this period, so there is nothing to export. Pick a range with trading days.
        </div>
      )}

      {hasData && (
        <>
          {/* ── The guarantee ─────────────────────────────────────────── */}
          <div style={{
            ...CARD,
            background: balanced ? 'var(--ok-soft)' : 'var(--bad-soft)',
            border: `1px solid ${balanced ? 'var(--ok)' : 'var(--bad)'}`,
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            {balanced
              ? <CheckCircle2 size={18} strokeWidth={2} style={{ color: 'var(--ok)', flexShrink: 0, marginTop: 1 }} />
              : <AlertTriangle size={18} strokeWidth={2} style={{ color: 'var(--bad)', flexShrink: 0, marginTop: 1 }} />}
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                {balanced ? 'Every voucher balances' : 'A voucher does not balance — do not import'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--mute)', marginTop: 3 }}>
                {data.totals.days} daily voucher{data.totals.days === 1 ? '' : 's'} · total debits {format(data.totals.debit)} = total credits {format(data.totals.credit)}
              </div>
            </div>
          </div>

          {/* ── Honest cross-check ────────────────────────────────────── */}
          {data.discountCrossCheck !== 0 && (
            <div style={{ padding: '12px 16px', borderLeft: '2px solid var(--warn)', background: 'var(--paper-2)', borderRadius: '0 8px 8px 0' }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.6 }}>
                The balancing discount differs from your recorded discount total by{' '}
                <strong style={{ color: 'var(--ink-2)' }}>{format(Math.abs(data.discountCrossCheck))}</strong>{' '}
                over the period. The vouchers still balance; this only flags that billed-minus-collected
                and your logged discounts don't fully agree — worth a look before you post.
              </p>
            </div>
          )}

          {/* ── Vouchers ──────────────────────────────────────────────── */}
          <div style={CARD}>
            <div style={{ ...LABEL, marginBottom: 8 }}>Daily vouchers</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={th}>Ledgers</th>
                    <th style={{ ...th, textAlign: 'right' }}>Debit</th>
                    <th style={{ ...th, textAlign: 'right' }}>Credit</th>
                    <th style={{ ...th, textAlign: 'right' }}>Balanced</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vouchers.map((v) => (
                    <tr key={v.date} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ ...td, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{v.date}</td>
                      <td style={{ ...td, color: 'var(--mute)', fontSize: 11.5 }}>
                        {v.lines.map((l) => l.ledger).join(' · ')}
                      </td>
                      <td style={tdNum} className="mono num">{format(v.debit)}</td>
                      <td style={tdNum} className="mono num">{format(v.credit)}</td>
                      <td style={{ ...tdNum }}>
                        {v.balanced
                          ? <CheckCircle2 size={14} strokeWidth={2} style={{ color: 'var(--ok)' }} />
                          : <AlertTriangle size={14} strokeWidth={2} style={{ color: 'var(--bad)' }} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p style={{ display: 'flex', gap: 7, alignItems: 'flex-start', margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--mute)' }}>
            <Info size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 3 }} />
            <span>{data.scopeNote} Ledger names (Sales, Output Tax, Cash…) are plain labels — rename them to match your chart of accounts before importing.</span>
          </p>
        </>
      )}
    </div>
  );
}
