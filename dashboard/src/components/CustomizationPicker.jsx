import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function CustomizationPicker({ item, format, onConfirm, onCancel }) {
  const groups = item.customization_groups || [];

  const [selections, setSelections] = useState(() => {
    const init = {};
    for (const g of groups) {
      if (g.required && g.options.length > 0) {
        init[g.name] = g.type === 'multi' ? [g.options[0].label] : g.options[0].label;
      }
    }
    return init;
  });

  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  function toggleOption(group, optLabel) {
    setSelections((prev) => {
      if (group.type === 'single') {
        return { ...prev, [group.name]: optLabel };
      }
      const current = prev[group.name] || [];
      return {
        ...prev,
        [group.name]: current.includes(optLabel)
          ? current.filter((l) => l !== optLabel)
          : [...current, optLabel],
      };
    });
  }

  function isSelected(group, optLabel) {
    const sel = selections[group.name];
    if (!sel) return false;
    return group.type === 'multi' ? sel.includes(optLabel) : sel === optLabel;
  }

  const priceAdd = groups.reduce((total, g) => {
    const sel = selections[g.name];
    if (!sel) return total;
    const labels = Array.isArray(sel) ? sel : [sel];
    return total + g.options
      .filter((o) => labels.includes(o.label))
      .reduce((s, o) => s + (o.priceAdd || 0), 0);
  }, 0);

  function handleConfirm() {
    for (const g of groups) {
      if (g.required) {
        const sel = selections[g.name];
        if (!sel || (Array.isArray(sel) && sel.length === 0)) {
          setError(`"${g.name}" is required`);
          return;
        }
      }
    }
    onConfirm({ customizations: selections, notes: note, priceAdd });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      style={{ background: 'rgba(10,10,10,.4)' }}
    >
      <div
        className="w-full max-w-sm rounded-t-[8px] sm:rounded-[8px]"
        style={{ background: 'var(--paper)', border: '1px solid var(--line-2)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{item.name}</p>
            <p className="mono num" style={{ fontSize: 11.5, color: 'var(--mute)' }}>{format(item.price + priceAdd)}</p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-md p-1 transition-colors"
            style={{ color: 'var(--mute)', background: 'transparent', border: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Groups */}
        <div className="max-h-[60vh] overflow-y-auto px-4 py-4 space-y-5">
          {groups.map((group) => (
            <div key={group.name}>
              <div className="mb-2 flex items-baseline gap-1.5">
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{group.name}</p>
                <span style={{ fontSize: 11, color: 'var(--mute)' }}>
                  {group.type === 'multi' ? '(pick any)' : '(pick one)'}
                  {group.required && <span style={{ marginLeft: 4, color: 'var(--bad)' }}>*</span>}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {group.options.map((opt) => {
                  const sel = isSelected(group, opt.label);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => toggleOption(group, opt.label)}
                      className="rounded-full transition-colors"
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        padding: '5px 12px',
                        border: sel ? '1.5px solid var(--ink)' : '1px solid var(--line-2)',
                        background: sel ? 'var(--ink)' : 'transparent',
                        color: sel ? 'var(--accent-on)' : 'var(--ink)',
                      }}
                    >
                      {opt.label}
                      {opt.priceAdd > 0 && (
                        <span className="mono num" style={{ marginLeft: 4, fontSize: 11, opacity: 0.7 }}>
                          +{format(opt.priceAdd)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Notes */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
              Notes <span style={{ fontWeight: 400, color: 'var(--mute)' }}>(optional)</span>
            </p>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any special requests…"
              className="input w-full"
            />
          </div>
        </div>

        {error && (
          <p className="px-4 pb-1" style={{ fontSize: 11.5, color: 'var(--bad)' }}>{error}</p>
        )}

        {/* Footer */}
        <div className="px-4 py-3 flex gap-2" style={{ borderTop: '1px solid var(--line)' }}>
          <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleConfirm} className="btn-primary flex-1">
            Add to order{priceAdd > 0 ? ` (+${format(priceAdd)})` : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
