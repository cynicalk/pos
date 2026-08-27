import { useRef } from 'react';
import { Plus, Minus, SlidersHorizontal } from 'lucide-react';

export function MenuTab({ items, cart, fmt, addSimple, removeSimple, openCustomization, itemCartQty, inlineNoteItemId, setInlineNoteItemId, updateSimpleItemNote, setDetailItem }) {
  const catRefs  = useRef({});
  const categories = [...new Set(items.map((i) => i.category).filter(Boolean))];

  return (
    <>
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto" style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--paper)',
        }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => catRefs.current[cat]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={{
                flexShrink: 0, borderRadius: 20,
                border: '1px solid var(--line-2)',
                padding: '4px 12px',
                fontSize: 12, fontWeight: 600, color: 'var(--mute)',
                background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 100 }}>
        {categories.map((cat) => (
          <div key={cat}>
            <div
              ref={(el) => { catRefs.current[cat] = el; }}
              style={{
                position: 'sticky', top: 0, zIndex: 10,
                background: 'var(--paper-2)',
                padding: '6px 16px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--mute)' }}>
                {cat}
              </span>
            </div>

            {items.filter((i) => i.category === cat).map((item) => {
              const hasCustom = (item.customization_groups || []).length > 0;
              const qty       = itemCartQty(item.id);
              const simpleQty = cart.find((l) => l.itemId === item.id && Object.keys(l.selections).length === 0)?.quantity || 0;
              const inlineOpen = inlineNoteItemId === item.id;
              const simpleNote = cart.find(
                (l) => l.itemId === item.id && Object.keys(l.selections).length === 0,
              )?.notes || '';

              return (
                <div
                  key={item.id}
                  style={{ background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}
                >
                  <div className="flex items-start gap-4" style={{ padding: '14px 16px' }}>
                    <button
                      className="flex-1 min-w-0 text-left"
                      onClick={() => setDetailItem(item)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, margin: 0 }}>
                        {item.name}
                      </p>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginTop: 3 }}>
                        {fmt(item.price)}
                      </p>
                      {hasCustom && (
                        <p className="flex items-center gap-1" style={{ fontSize: 11, color: 'var(--mute)', marginTop: 3 }}>
                          <SlidersHorizontal size={10} /> Customizable
                        </p>
                      )}
                      {!hasCustom && !inlineOpen && simpleNote && (
                        <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 3, fontStyle: 'italic' }}>
                          {simpleNote}
                        </p>
                      )}
                    </button>

                    {hasCustom ? (
                      <div className="flex items-center gap-2 shrink-0 pt-0.5">
                        {qty > 0 && (
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', minWidth: 18, textAlign: 'center' }}>
                            {qty}
                          </span>
                        )}
                        <button
                          onClick={() => openCustomization(item)}
                          style={{
                            width: 36, height: 36, borderRadius: '50%',
                            border: '2px solid var(--ink)', background: 'transparent',
                            color: 'var(--ink)', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                          }}
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    ) : simpleQty > 0 ? (
                      <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
                        <button
                          onClick={() => removeSimple(item.id)}
                          style={{
                            width: 32, height: 32, borderRadius: '50%',
                            border: '2px solid var(--ink)', background: 'transparent',
                            color: 'var(--ink)', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', cursor: 'pointer',
                          }}
                        >
                          <Minus size={14} />
                        </button>
                        <span style={{ width: 20, textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                          {simpleQty}
                        </span>
                        <button
                          onClick={() => { addSimple(item); setInlineNoteItemId(item.id); }}
                          style={{
                            width: 32, height: 32, borderRadius: '50%',
                            border: 0, background: 'var(--ink)', color: 'var(--accent-on)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { addSimple(item); setInlineNoteItemId(item.id); }}
                        style={{
                          width: 36, height: 36, borderRadius: '50%',
                          border: '2px solid var(--ink)', background: 'transparent',
                          color: 'var(--ink)', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        <Plus size={18} />
                      </button>
                    )}
                  </div>

                  {!hasCustom && inlineOpen && (
                    <div style={{ padding: '0 16px 14px' }}>
                      <textarea
                        autoFocus
                        value={simpleNote}
                        onChange={(e) => updateSimpleItemNote(item.id, e.target.value)}
                        placeholder="e.g. No onions, extra sauce…"
                        rows={2}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          borderRadius: 8, border: '1px solid var(--line-2)',
                          background: 'var(--paper-2)', color: 'var(--ink)',
                          fontSize: 13, padding: '9px 12px',
                          fontFamily: 'inherit', resize: 'none', outline: 'none',
                        }}
                      />
                      <div className="flex justify-end" style={{ marginTop: 6 }}>
                        <button
                          onClick={() => setInlineNoteItemId(null)}
                          style={{
                            fontSize: 12, fontWeight: 600, color: 'var(--ink)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontFamily: 'inherit', padding: '4px 8px',
                          }}
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {items.length === 0 && (
          <div className="py-20 text-center" style={{ fontSize: 13, color: 'var(--mute)' }}>
            Menu is empty. Please ask staff for assistance.
          </div>
        )}
      </div>
    </>
  );
}
