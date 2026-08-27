import { useState, useRef } from 'react';
import { Download, Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { useInventoryTransactions, useImportLedger } from '../hooks/useInventory';
import { useIngredients } from '../hooks/useIngredients';
import { useCurrency } from '../context/CurrencyContext';
import Modal from '../components/Modal';
import SelectField from '../components/SelectField';
import { escCsv, startOfMonth, fmtDateTime } from '../utils/dateUtils';
import { useTimezone } from '../context/TimezoneContext';

const TYPE_CFG = {
  PURCHASE:   { label: 'Purchase',   color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  SALE:       { label: 'Sale',       color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  RETURN:     { label: 'Return',     color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  WASTE:      { label: 'Waste',      color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  ADJUSTMENT: { label: 'Adjustment', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
};

const LEDGER_COLS = [
  { label: 'Date / Time',      get: (r) => new Date(r.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) },
  { label: 'Ingredient',       get: (r) => r.ingredient_name },
  { label: 'Type',             get: (r) => r.txn_type },
  { label: 'Qty Delta',        get: (r) => parseFloat(r.quantity_delta).toFixed(3) },
  { label: 'Unit',             get: (r) => r.ingredient_unit },
  { label: 'Unit Cost',        get: (r) => parseFloat(r.unit_cost || 0).toFixed(4) },
  { label: 'Total Value',      get: (r) => (Math.abs(parseFloat(r.quantity_delta)) * parseFloat(r.unit_cost || 0)).toFixed(4) },
  { label: 'Ref',              get: (r) => r.ref_id || '' },
];

const IMPORT_TEMPLATE = `ingredient_name,type,quantity_delta,unit_cost,ref_id
Chicken,PURCHASE,5.000,280.00,INV-001
Butter,ADJUSTMENT,-0.500,,
Milk,WASTE,-1.000,,`;

// ── CSV utilities ─────────────────────────────────────────────────────────────

function downloadCsv(filename, cols, rows) {
  const lines = [
    cols.map((c) => escCsv(c.label)).join(','),
    ...rows.map((r) => cols.map((c) => escCsv(c.get(r))).join(',')),
  ].join('\r\n');
  const a = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([lines], { type: 'text/csv;charset=utf-8;' })),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function splitCsvRow(line) {
  const vals = [];
  let inQ = false, cur = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { vals.push(cur); cur = ''; }
    else { cur += c; }
  }
  vals.push(cur);
  return vals;
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = splitCsvRow(lines[0]).map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const vals = splitCsvRow(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim().replace(/^"|"$/g, ''); });
    return obj;
  });
}

function refLabel(row) {
  if (!row.ref_id) return '—';
  if (row.txn_type === 'SALE' || row.txn_type === 'RETURN')
    return `#${row.ref_id.slice(-6).toUpperCase()}`;
  return row.ref_id;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InventoryLedger() {
  const { todayLocal } = useTimezone();
  const [from,         setFrom]         = useState(() => startOfMonth(todayLocal()));
  const [to,           setTo]           = useState(() => todayLocal());
  const [ingredientId, setIngredientId] = useState('');
  const [txnType,      setTxnType]      = useState('');

  const { data: rows = [], isLoading } = useInventoryTransactions({
    from, to,
    ingredientId: ingredientId || undefined,
    type:         txnType      || undefined,
    limit:        500,
  });
  const { data: ingredients = [] } = useIngredients();
  const { format } = useCurrency();

  const importMutation = useImportLedger();
  const fileInputRef   = useRef(null);

  // import state: null | { phase:'preview', rows:[] } | { phase:'result', created:N, errors:[] }
  const [importState, setImportState] = useState(null);

  const summary = rows.reduce((acc, r) => {
    const t = r.txn_type;
    if (!acc[t]) acc[t] = { count: 0, cost: 0 };
    acc[t].count++;
    acc[t].cost += Math.abs(parseFloat(r.unit_cost || 0) * parseFloat(r.quantity_delta || 0));
    return acc;
  }, {});

  // ── Export ──────────────────────────────────────────────────────────────────

  function handleExport() {
    const filename = `ledger_${from}_${to}.csv`;
    downloadCsv(filename, LEDGER_COLS, rows);
  }

  function handleDownloadTemplate() {
    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob([IMPORT_TEMPLATE], { type: 'text/csv;charset=utf-8;' })),
      download: 'ledger_import_template.csv',
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      setImportState({ phase: 'preview', rows: parsed });
    };
    reader.readAsText(file);
  }

  async function handleConfirmImport() {
    const result = await importMutation.mutateAsync(importState.rows);
    setImportState({ phase: 'result', created: result.created, errors: result.errors });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header + filters */}
      <div className="flex items-start gap-3 flex-wrap">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Inventory Ledger</h1>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
            All ingredient stock movements · {rows.length} entries
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="input" style={{ height: 32, width: 130, fontSize: 12 }} />
          <span style={{ fontSize: 12, color: 'var(--mute)' }}>–</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="input" style={{ height: 32, width: 130, fontSize: 12 }} />
          <SelectField
            value={ingredientId}
            onChange={(v) => setIngredientId(v)}
            style={{ height: 32, fontSize: 12, fontWeight: 500, padding: '0 10px', width: 'auto', minWidth: 150 }}
            options={[
              { value: '', label: 'All ingredients' },
              ...ingredients.map((i) => ({ value: i.id, label: i.name })),
            ]}
          />
          <SelectField
            value={txnType}
            onChange={(v) => setTxnType(v)}
            style={{ height: 32, fontSize: 12, fontWeight: 500, padding: '0 10px', width: 'auto', minWidth: 120 }}
            options={[
              { value: '', label: 'All types' },
              ...Object.entries(TYPE_CFG).map(([k, v]) => ({ value: k, label: v.label })),
            ]}
          />

          {/* Export */}
          <button
            onClick={handleExport}
            disabled={rows.length === 0}
            className="btn-secondary disabled:opacity-40"
            style={{ height: 32, fontSize: 12, gap: 5 }}
          >
            <Download size={13} /> Export CSV
          </button>

          {/* Import */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary"
            style={{ height: 32, fontSize: 12, gap: 5 }}
          >
            <Upload size={13} /> Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* Summary chips */}
      {Object.keys(summary).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.keys(TYPE_CFG).filter(t => summary[t]).map(t => {
            const cfg = TYPE_CFG[t];
            return (
              <div key={t} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${cfg.border}`, background: cfg.bg }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                <span style={{ fontSize: 12, marginLeft: 8, color: 'var(--mute)' }}>
                  {summary[t].count} txn{summary[t].count !== 1 ? 's' : ''} · {format(summary[t].cost)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center rounded-[8px]"
          style={{ fontSize: 13, color: 'var(--mute)', border: '1px dashed var(--line-2)' }}>
          No transactions found for this period
        </div>
      ) : (
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580 }}>
              <thead>
                <tr style={{ background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
                  {['Date / Time', 'Ingredient', 'Type', 'Δ Qty', 'Unit Cost', 'Ref'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const cfg = TYPE_CFG[row.txn_type] ?? { label: row.txn_type, color: 'var(--mute)', bg: 'var(--paper-2)', border: 'var(--line)' };
                  const delta = parseFloat(row.quantity_delta);
                  const deltaColor = delta > 0 ? 'var(--ok)' : 'var(--bad)';
                  return (
                    <tr key={row.id}
                      style={{ borderBottom: '1px solid var(--line)', transition: 'background .1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--mute)', whiteSpace: 'nowrap' }}>
                        {fmtDateTime(row.created_at)}
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                        {row.ingredient_name}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, border: `1px solid ${cfg.border}`, background: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="mono num" style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, color: deltaColor }}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(3)} {row.ingredient_unit}
                      </td>
                      <td className="mono num" style={{ padding: '9px 14px', fontSize: 12, color: 'var(--mute)' }}>
                        {format(row.unit_cost)}
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--mute)', fontFamily: 'monospace' }}>
                        {refLabel(row)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import preview modal */}
      {importState?.phase === 'preview' && (
        <Modal title="Import Ledger" onClose={() => setImportState(null)}>
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-[6px] px-3 py-2.5"
              style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)' }}>
              <FileText size={14} style={{ color: 'var(--mute)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                  {importState.rows.length} row{importState.rows.length !== 1 ? 's' : ''} detected
                </p>
                <p style={{ fontSize: 11.5, color: 'var(--mute)' }}>
                  Valid types: PURCHASE, ADJUSTMENT, WASTE, RETURN.
                  Use positive delta to add stock, negative to remove.
                </p>
              </div>
            </div>

            {/* Preview table — first 5 rows */}
            {importState.rows.length > 0 && (
              <div style={{ border: '1px solid var(--line-2)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <thead>
                      <tr style={{ background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
                        {Object.keys(importState.rows[0]).map((h) => (
                          <th key={h} style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importState.rows.slice(0, 5).map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                          {Object.values(row).map((v, j) => (
                            <td key={j} style={{ padding: '5px 10px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{v || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importState.rows.length > 5 && (
                  <p style={{ padding: '6px 10px', fontSize: 11, color: 'var(--mute)', borderTop: '1px solid var(--line)' }}>
                    …and {importState.rows.length - 5} more row{importState.rows.length - 5 !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleDownloadTemplate}
              style={{ fontSize: 12, color: 'var(--mute)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Download size={12} /> Download template CSV
            </button>

            {importMutation.isError && (
              <p style={{ fontSize: 12, color: 'var(--bad)' }}>Import failed — check the data and try again.</p>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => setImportState(null)} className="btn-secondary flex-1 justify-center">
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importMutation.isPending || importState.rows.length === 0}
                className="btn-primary flex-1 justify-center disabled:opacity-50"
              >
                {importMutation.isPending ? 'Importing…' : `Import ${importState.rows.length} rows`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Import result modal */}
      {importState?.phase === 'result' && (
        <Modal title="Import Complete" onClose={() => setImportState(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-[6px] px-4 py-3"
              style={{ background: importState.created > 0 ? 'rgba(41,163,97,.06)' : 'var(--paper-2)', border: `1px solid ${importState.created > 0 ? 'rgba(41,163,97,.2)' : 'var(--line-2)'}` }}>
              <CheckCircle size={18} style={{ color: importState.created > 0 ? 'var(--ok)' : 'var(--mute)', flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                  {importState.created} transaction{importState.created !== 1 ? 's' : ''} imported successfully
                </p>
                {importState.errors.length > 0 && (
                  <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
                    {importState.errors.length} row{importState.errors.length !== 1 ? 's' : ''} skipped due to errors
                  </p>
                )}
              </div>
            </div>

            {importState.errors.length > 0 && (
              <div style={{ border: '1px solid rgba(179,55,43,.2)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', background: 'rgba(179,55,43,.04)', borderBottom: '1px solid rgba(179,55,43,.15)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={13} style={{ color: 'var(--bad)' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--bad)' }}>Skipped rows</span>
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {importState.errors.map((e, i) => (
                    <div key={i} style={{ padding: '6px 12px', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
                      <span style={{ color: 'var(--mute)', marginRight: 6 }}>Row {e.row}:</span>
                      <span style={{ color: 'var(--ink)' }}>{e.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => setImportState(null)} className="btn-primary w-full justify-center">
              Done
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
