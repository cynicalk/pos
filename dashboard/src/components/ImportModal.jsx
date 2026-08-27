import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Download, CheckCircle2, AlertCircle, X, FileText, Loader2 } from 'lucide-react';
import api from '../api/client';

const CONFIGS = {
  menu: {
    label:    'Menu Items',
    endpoint: '/menu/import',
    headers:  ['name', 'price', 'category', 'description', 'sku', 'available'],
    example:  ['Margherita Pizza', '12.99', 'mains', 'Classic Italian pizza', 'PIZ001', 'true'],
    notes:    'category: starters · mains · desserts · drinks · sides · other  |  available: true or false',
  },
  ingredients: {
    label:    'Ingredients',
    endpoint: '/ingredients/import',
    headers:  ['name', 'unit', 'latest_unit_cost', 'reorder_level', 'reorder_qty'],
    example:  ['Flour', 'kg', '0.80', '10', '50'],
    notes:    '',
  },
  recipes: {
    label:    'Recipes',
    endpoint: '/recipes/import',
    headers:  ['recipe_name', 'yield_quantity', 'yield_unit', 'prep_time_min', 'notes', 'ingredient_name', 'quantity', 'unit'],
    example:  ['Margherita Pizza', '1', 'piece', '15', 'Make fresh daily', 'Flour', '0.300', 'kg'],
    notes:    'One row per ingredient — repeat recipe_name for each. Ingredients must already exist in the system.',
  },
};

export default function ImportModal({ type, onClose, onSuccess }) {
  const cfg = CONFIGS[type];
  const [file,     setFile]     = useState(null);
  const [rowCount, setRowCount] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const inputRef = useRef(null);

  function downloadTemplate() {
    const csv  = [cfg.headers.join(','), cfg.example.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${type}-template.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleFile(f) {
    if (!f) return;
    setFile(f);
    setResult(null);
    setRowCount(null);
    if (/\.csv$/i.test(f.name)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const lines = e.target.result.split('\n').filter((l) => l.trim());
        setRowCount(Math.max(0, lines.length - 1));
      };
      reader.readAsText(f);
    }
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(cfg.endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      if (data.imported > 0) onSuccess?.();
    } catch (e) {
      setResult({
        imported: 0,
        errors: [{ row: '—', reason: e.response?.data?.error || 'Upload failed. Check the file and try again.' }],
      });
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(10,10,10,.45)' }}
    >
      <div style={{
        background: 'var(--paper)', border: '1px solid var(--line-2)',
        borderRadius: 10, width: '100%', maxWidth: 500, maxHeight: '90vh', overflow: 'auto',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
            Import {cfg.label}
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--mute)', display: 'flex', borderRadius: 5, padding: 3 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--mute)'; }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Template info */}
          <div style={{ background: 'var(--paper-2)', border: '1px solid var(--line-2)', borderRadius: 7, padding: '12px 14px' }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Required columns
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--ink)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {cfg.headers.join(', ')}
            </p>
            {cfg.notes && (
              <p style={{ margin: '0 0 10px', fontSize: 11.5, color: 'var(--mute)' }}>{cfg.notes}</p>
            )}
            <button onClick={downloadTemplate} className="btn btn-sm">
              <Download size={12} /> Download template CSV
            </button>
          </div>

          {/* File picker */}
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
            <button
              onClick={() => inputRef.current.click()}
              style={{
                width: '100%', minHeight: 80,
                border: `2px dashed ${file ? 'var(--ok)' : 'var(--line-2)'}`,
                borderRadius: 7, background: 'var(--paper)', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'border-color 120ms',
              }}
              onMouseEnter={(e) => { if (!file) e.currentTarget.style.borderColor = 'var(--mute)'; }}
              onMouseLeave={(e) => { if (!file) e.currentTarget.style.borderColor = 'var(--line-2)'; }}
            >
              {file ? (
                <>
                  <FileText size={20} style={{ color: 'var(--ok)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{file.name}</span>
                  {rowCount !== null
                    ? <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>{rowCount} data row{rowCount !== 1 ? 's' : ''} detected</span>
                    : <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>Click to change file</span>
                  }
                </>
              ) : (
                <>
                  <Upload size={20} style={{ color: 'var(--mute)' }} />
                  <span style={{ fontSize: 13, color: 'var(--mute)' }}>Click to select a CSV or Excel file</span>
                  <span style={{ fontSize: 11, color: 'var(--mute-2)' }}>.csv · .xlsx · .xls</span>
                </>
              )}
            </button>
          </div>

          {/* Result */}
          {result && (
            <div style={{ border: '1px solid var(--line-2)', borderRadius: 7, overflow: 'hidden' }}>
              <div style={{
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
                background: result.imported > 0 ? 'rgba(31,138,91,.06)' : 'var(--paper-2)',
              }}>
                <CheckCircle2 size={15} style={{ color: 'var(--ok)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                  {result.imported} {cfg.label.toLowerCase()} imported successfully
                </span>
                {result.errors.length > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--bad)', fontWeight: 500 }}>
                    {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {result.errors.length > 0 && (
                <div style={{ maxHeight: 180, overflowY: 'auto', padding: '6px 14px 10px', background: 'var(--paper)' }}>
                  {result.errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2" style={{ padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                      <AlertCircle size={12} style={{ color: 'var(--bad)', flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>
                        <strong style={{ color: 'var(--ink)' }}>Row {err.row}:</strong> {err.reason}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && (
              <button
                onClick={handleImport}
                disabled={!file || loading}
                className="btn-primary flex-1 justify-center disabled:opacity-50"
              >
                {loading
                  ? <><Loader2 size={13} className="animate-spin" /> Importing…</>
                  : <><Upload size={13} /> Import</>}
              </button>
            )}
            {result && result.errors.length > 0 && (
              <button
                onClick={() => { setResult(null); setFile(null); setRowCount(null); }}
                className="btn flex-1 justify-center"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
