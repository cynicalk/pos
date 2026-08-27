import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

// Drop-in replacement for <select>. options: [{value, label}]
// Matches .input style by default. Pass style overrides for filter-bar contexts.
// Auto-shows a search box when there are >= 8 options.
export default function SelectField({
  value,
  onChange,
  options = [],
  style = {},
  searchable,        // override auto-detect (force true/false)
}) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const searchRef    = useRef(null);

  const showSearch = searchable !== undefined ? searchable : options.length >= 8;
  const active     = options.find((o) => String(o.value) === String(value ?? ''));
  const filtered   = showSearch && query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (!containerRef.current?.contains(e.target)) { setOpen(false); setQuery(''); }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search input when panel opens
  useEffect(() => {
    if (open && showSearch) searchRef.current?.focus();
  }, [open, showSearch]);

  const containerWidth = 'width' in style ? style.width : '100%';

  const triggerStyle = {
    width: '100%',
    padding: '6px 10px',
    fontSize: '12.5px',
    fontFamily: 'inherit',
    fontWeight: 400,
    border: '1px solid var(--line-2)',
    borderRadius: 6,
    background: 'var(--paper)',
    color: active ? 'var(--ink)' : 'var(--mute)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    textAlign: 'left',
    outline: 'none',
    transition: 'border-color .08s',
    boxSizing: 'border-box',
    whiteSpace: 'nowrap',
    ...style,
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: containerWidth }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={triggerStyle}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {active?.label ?? <span style={{ color: 'var(--mute)' }}>—</span>}
        </span>
        <ChevronDown
          size={12}
          style={{
            flexShrink: 0, color: 'var(--mute)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform .15s',
          }}
        />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          minWidth: '100%', zIndex: 50,
          background: 'var(--paper)',
          border: '1px solid var(--line-2)',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,.12)',
          overflow: 'hidden',
        }}>
          {showSearch && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--line)' }}>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="input"
                style={{ height: 28, fontSize: 12 }}
              />
            </div>
          )}
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
            {filtered.length === 0 ? (
              <p style={{ margin: 0, padding: '8px 14px', fontSize: 12.5, color: 'var(--mute)', fontStyle: 'italic' }}>
                No match
              </p>
            ) : filtered.map((opt) => {
              const isActive = String(opt.value) === String(value ?? '');
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); setQuery(''); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 14px', fontSize: 13,
                    border: 0, cursor: 'pointer',
                    background: isActive ? 'var(--hover)' : 'none',
                    color: 'var(--ink)',
                    fontWeight: isActive ? 600 : 400,
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'var(--hover)' : 'none'; }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
