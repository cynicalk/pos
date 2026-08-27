import { useState, useEffect, useRef, useMemo } from 'react';
import { ClipboardCheck, Plus, Upload, CheckCircle2, Trash2, Lock, AlertTriangle } from 'lucide-react';
import {
  useStockCounts, useStockCount, useCreateStockCount, useSaveStockCountLines,
  useFinalizeStockCount, useImportStockCount, useDeleteStockCount,
} from '../hooks/useStocktake';
import { useTimezone } from '../context/TimezoneContext';

const TH = { padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.07em' };
const TD = { padding: '8px 14px', fontSize: 13, color: 'var(--ink)' };

function fmtNum(n) {
  if (n == null || n === '') return '—';
  return parseFloat(n).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

// Minimal CSV parse for the import: header row + `ingredient_name,counted_qty`.
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const ni = headers.indexOf('ingredient_name');
  const qi = headers.indexOf('counted_qty');
  if (ni === -1 || qi === -1) throw new Error('CSV needs ingredient_name and counted_qty columns');
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    return { ingredient_name: (cells[ni] || '').trim(), counted_qty: (cells[qi] || '').trim() };
  });
}

export default function Stocktake() {
  const { iana } = useTimezone();
  const fmtDate = (d) => d ? new Intl.DateTimeFormat(undefined, { timeZone: iana, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)) : '';

  const { data: counts = [] } = useStockCounts();
  const [selectedId, setSelectedId] = useState(null);
  const { data: count } = useStockCount(selectedId);

  const create   = useCreateStockCount();
  const saveLines = useSaveStockCountLines();
  const finalize = useFinalizeStockCount();
  const importMut = useImportStockCount();
  const del      = useDeleteStockCount();

  const [newLabel, setNewLabel] = useState('');
  const [edits, setEdits] = useState({});       // ingredient_id -> string
  const [reconcile, setReconcile] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const fileRef = useRef(null);

  // Default to the most recent count
  useEffect(() => {
    if (!selectedId && counts.length) setSelectedId(counts[0].id);
  }, [counts, selectedId]);

  // Seed local edits when the active count loads
  useEffect(() => {
    if (!count) return;
    setEdits(Object.fromEntries(count.lines.map((l) => [l.ingredient_id, l.counted_qty ?? ''])));
    setReconcile(false);
    setImportMsg(null);
  }, [count?.id, count?.lines]);

  const isOpen = count?.status === 'open';

  const dirtyLines = useMemo(() => {
    if (!count) return [];
    return count.lines
      .filter((l) => String(edits[l.ingredient_id] ?? '') !== String(l.counted_qty ?? ''))
      .map((l) => ({ ingredientId: l.ingredient_id, countedQty: edits[l.ingredient_id] === '' ? null : edits[l.ingredient_id] }));
  }, [count, edits]);

  async function handleCreate() {
    if (!newLabel.trim()) return;
    const c = await create.mutateAsync({ label: newLabel.trim() });
    setNewLabel('');
    setSelectedId(c.id);
  }

  async function handleSave() {
    if (!dirtyLines.length) return;
    await saveLines.mutateAsync({ id: selectedId, lines: dirtyLines });
  }

  async function handleFinalize() {
    if (dirtyLines.length) await saveLines.mutateAsync({ id: selectedId, lines: dirtyLines });
    await finalize.mutateAsync({ id: selectedId, reconcile });
  }

  async function handleFile(f) {
    if (!f) return;
    setImportMsg(null);
    try {
      const text = await f.text();
      const rows = parseCsv(text);
      if (!rows.length) { setImportMsg({ error: 'No data rows found' }); return; }
      const res = await importMut.mutateAsync({ id: selectedId, rows });
      setImportMsg({ updated: res.updated, errors: res.errors || [] });
    } catch (e) {
      setImportMsg({ error: e.response?.data?.error || e.message });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Stocktake</h1>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>Physical counts — the measured “actual” for food-cost variance</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select value={selectedId || ''} onChange={(e) => setSelectedId(e.target.value || null)} className="input" style={{ height: 32, fontSize: 12, minWidth: 180 }}>
            <option value="">Select a count…</option>
            {counts.map((c) => (
              <option key={c.id} value={c.id}>{c.label} · {c.status}{c.status === 'finalized' ? ` · ${fmtDate(c.counted_at)}` : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {/* New count */}
      <div className="flex items-center gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="New count label, e.g. Week 26 close"
          className="input"
          style={{ height: 34, fontSize: 13, maxWidth: 320 }}
        />
        <button onClick={handleCreate} disabled={!newLabel.trim() || create.isPending} className="btn-primary btn-sm disabled:opacity-50" style={{ gap: 5 }}>
          <Plus size={13} /> New Count
        </button>
      </div>

      {!count ? (
        <div className="py-16 text-center rounded-[8px]" style={{ fontSize: 13, color: 'var(--mute)', border: '1px dashed var(--line-2)' }}>
          Create a count to begin, or pick an existing one above.
        </div>
      ) : (
        <>
          {/* Active count header */}
          <div className="flex items-center gap-3 flex-wrap rounded-[8px] px-4 py-3" style={{ border: '1px solid var(--line-2)', background: 'var(--paper-2)' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{count.label}</p>
              <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 1 }}>
                {count.status === 'finalized' ? `Finalized ${fmtDate(count.counted_at)}` : `Started ${fmtDate(count.created_at)}`}
              </p>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
              background: isOpen ? 'rgba(217,119,6,.1)' : 'rgba(31,138,91,.1)',
              color: isOpen ? '#d97706' : 'var(--ok)',
            }}>
              {isOpen ? 'Open' : 'Finalized'}
            </span>

            {isOpen && (
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files[0])} />
                <button onClick={() => fileRef.current?.click()} className="btn btn-sm" disabled={importMut.isPending} style={{ gap: 5 }}>
                  <Upload size={12} /> Import CSV
                </button>
                <button onClick={handleSave} disabled={!dirtyLines.length || saveLines.isPending} className="btn-secondary btn-sm disabled:opacity-50">
                  {saveLines.isPending ? 'Saving…' : `Save${dirtyLines.length ? ` (${dirtyLines.length})` : ''}`}
                </button>
                <label className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: 'var(--mute)' }}>
                  <input type="checkbox" checked={reconcile} onChange={(e) => setReconcile(e.target.checked)} />
                  Reconcile stock
                </label>
                <button onClick={handleFinalize} disabled={finalize.isPending} className="btn-primary btn-sm disabled:opacity-50" style={{ gap: 5 }}>
                  <CheckCircle2 size={13} /> {finalize.isPending ? 'Finalizing…' : 'Finalize'}
                </button>
                <button
                  onClick={() => { if (window.confirm('Delete this open count?')) { del.mutate(selectedId); setSelectedId(null); } }}
                  className="btn btn-sm" style={{ color: 'var(--bad)' }} title="Delete count"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
            {!isOpen && (
              <span className="ml-auto flex items-center gap-1.5" style={{ fontSize: 11.5, color: 'var(--mute)' }}>
                <Lock size={12} /> Read-only — use it as an opening or closing count in the Variance report
              </span>
            )}
          </div>

          {importMsg && (
            <div className="flex items-center gap-2 rounded-[6px] px-3 py-2" style={{
              background: importMsg.error ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${importMsg.error ? '#fecaca' : '#bbf7d0'}`,
              fontSize: 12, color: importMsg.error ? '#991b1b' : '#166534',
            }}>
              {importMsg.error
                ? <><AlertTriangle size={13} /> {importMsg.error}</>
                : <><CheckCircle2 size={13} /> Imported {importMsg.updated} counts{importMsg.errors.length ? ` · ${importMsg.errors.length} row(s) skipped` : ''}</>}
            </div>
          )}

          {/* Lines */}
          <div style={{ border: '1px solid var(--line-2)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                <thead>
                  <tr style={{ background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
                    <th style={TH}>Ingredient</th>
                    <th style={TH}>Unit</th>
                    <th style={{ ...TH, textAlign: 'right' }}>System</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Counted</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {count.lines.map((l) => {
                    const counted = isOpen ? edits[l.ingredient_id] : l.counted_qty;
                    const diff = counted !== '' && counted != null && l.system_qty != null
                      ? parseFloat(counted) - parseFloat(l.system_qty) : null;
                    return (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ ...TD, fontWeight: 500 }}>{l.ingredient_name}</td>
                        <td style={{ ...TD, color: 'var(--mute)', fontSize: 12 }}>{l.unit}</td>
                        <td className="mono num" style={{ ...TD, textAlign: 'right', color: 'var(--mute)' }}>{fmtNum(l.system_qty)}</td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          {isOpen ? (
                            <input
                              type="number" min="0" step="any"
                              value={edits[l.ingredient_id] ?? ''}
                              onChange={(e) => setEdits((p) => ({ ...p, [l.ingredient_id]: e.target.value }))}
                              className="input mono num"
                              style={{ height: 28, width: 96, fontSize: 12, textAlign: 'right' }}
                            />
                          ) : (
                            <span className="mono num">{fmtNum(l.counted_qty)}</span>
                          )}
                        </td>
                        <td className="mono num" style={{ ...TD, textAlign: 'right', color: diff == null ? 'var(--mute-2)' : diff < 0 ? 'var(--bad)' : diff > 0 ? 'var(--ok)' : 'var(--mute)' }}>
                          {diff == null ? '—' : `${diff > 0 ? '+' : ''}${fmtNum(diff)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
