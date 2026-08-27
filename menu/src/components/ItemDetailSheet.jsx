import { X, SlidersHorizontal } from 'lucide-react';

export function ItemDetailSheet({ item, fmt, onClose, onAdd }) {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(10,10,10,.5)' }}
        onClick={onClose}
      />
      <div className="relative flex flex-col" style={{
        maxHeight: '80vh',
        background: 'var(--paper)',
        borderRadius: '16px 16px 0 0',
      }}>
        <div className="flex items-start justify-between" style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--line)',
        }}>
          <div className="flex-1 min-w-0 pr-3">
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', margin: 0, lineHeight: 1.25 }}>
              {item.name}
            </h2>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: '6px 0 0' }}>
              {fmt(item.price)}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 0, color: 'var(--mute)', cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: '16px 20px 20px' }}>
          {item.description ? (
            <p style={{ fontSize: 14, color: 'var(--mute)', lineHeight: 1.65, margin: 0 }}>
              {item.description}
            </p>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--mute-2)', fontStyle: 'italic', margin: 0 }}>
              No description available.
            </p>
          )}
          {(item.customization_groups || []).length > 0 && (
            <p className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--mute)', marginTop: 14 }}>
              <SlidersHorizontal size={11} /> Customizable — options available when you add
            </p>
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
          <button
            onClick={onAdd}
            style={{
              width: '100%', borderRadius: 10, padding: '14px 0',
              background: 'var(--ink)', color: 'var(--accent-on)',
              border: 0, fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Add to order · {fmt(item.price)}
          </button>
        </div>
      </div>
    </div>
  );
}
