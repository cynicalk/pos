import { Plus, Minus, SlidersHorizontal } from 'lucide-react';

/**
 * Shared menu item row used in NewOrderModal and AddItemsModal.
 * NewOrderModal passes cursor="default"; AddItemsModal uses browser default (no cursor style).
 */
export default function MenuRow({ item, qty, hasGroups, onAdd, onRemove, format, cursor }) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 transition-colors"
      style={{ borderBottom: '1px solid var(--line)', ...(cursor ? { cursor } : {}) }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-medium" style={{ fontSize: 13, color: 'var(--ink)' }}>
            {item.name}
          </p>
          {hasGroups && <SlidersHorizontal size={11} style={{ flexShrink: 0, color: 'var(--mute)' }} />}
        </div>
        <p className="mono num" style={{ fontSize: 11.5, color: 'var(--mute)' }}>{format(item.price)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {qty > 0 && (
          <button onClick={onRemove}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors"
            style={{ border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)' }}>
            <Minus size={13} />
          </button>
        )}
        {qty > 0 && (
          <span className="mono num font-semibold" style={{ width: 20, textAlign: 'center', fontSize: 13, color: 'var(--ink)' }}>
            {qty}
          </span>
        )}
        <button onClick={onAdd}
          className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors"
          style={{ background: qty > 0 ? 'var(--ink)' : 'transparent', border: '1px solid var(--line-2)', color: qty > 0 ? 'var(--accent-on)' : 'var(--mute)' }}>
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}
