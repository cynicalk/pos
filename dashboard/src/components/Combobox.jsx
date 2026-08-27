import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export default function Combobox({ value, onChange, options, placeholder, required, id }) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState(value || '');
  const containerRef = useRef(null);
  const inputRef     = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const filtered = options.filter((o) =>
    !query || o.toLowerCase().includes(query.toLowerCase()),
  );

  function select(opt) {
    setQuery(opt);
    onChange(opt);
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleChange(e) {
    const v = e.target.value;
    setQuery(v);
    onChange(v);
    setOpen(true);
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
    if (e.key === 'Enter' && open && filtered.length === 1) {
      e.preventDefault();
      select(filtered[0]);
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          id={id}
          className="input"
          style={{ paddingRight: 30 }}
          value={query}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => { setOpen((v) => !v); if (!open) inputRef.current?.focus(); }}
          style={{
            position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 0, padding: 3, cursor: 'pointer',
            color: 'var(--mute)', borderRadius: 4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.background = 'var(--hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--mute)'; e.currentTarget.style.background = 'none'; }}
        >
          <ChevronDown
            size={13}
            style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </button>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
          background: 'var(--paper)',
          border: '1px solid var(--line-2)',
          borderRadius: 7,
          boxShadow: '0 4px 20px rgba(0,0,0,.10)',
          maxHeight: 220,
          overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12.5, color: 'var(--mute)', fontStyle: 'italic' }}>
              {query ? `"${query}" will be used as a custom unit` : 'Start typing…'}
            </div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); select(opt); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', border: 0,
                  padding: '8px 12px', fontSize: 12.5, cursor: 'pointer',
                  background: opt === value ? 'var(--hover)' : 'none',
                  color: 'var(--ink)',
                  fontWeight: opt === value ? 600 : 400,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = opt === value ? 'var(--hover)' : 'none')}
              >
                {opt}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
