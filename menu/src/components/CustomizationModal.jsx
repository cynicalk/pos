import { X } from 'lucide-react';

export function CustomizationModal({ item, selections, custNotes, setCustNotes, custReady, computeExtraPrice, toggleOption, onConfirm, onClose, fmt }) {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(10,10,10,.5)' }}
        onClick={onClose}
      />
      <div className="relative flex flex-col" style={{
        maxHeight: '92vh',
        background: 'var(--paper)',
        borderRadius: '16px 16px 0 0',
      }}>
        <div className="flex items-start justify-between" style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--line)',
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
              {item.name}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--mute)', margin: '3px 0 0' }}>
              {fmt(item.price)}
              {computeExtraPrice(item, selections) > 0 && (
                <span style={{ color: 'var(--ink)' }}>
                  {' '}+ {fmt(computeExtraPrice(item, selections))} extras
                </span>
              )}
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

        <div className="flex-1 overflow-y-auto" style={{ padding: '16px 16px 4px' }}>
          {(item.customization_groups || []).map((group, gi) => (
            <div key={gi} style={{ marginBottom: 22 }}>
              <div className="flex items-baseline gap-2 mb-3">
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                  {group.name}
                </p>
                <span style={{ fontSize: 11, color: group.required ? 'var(--bad)' : 'var(--mute)' }}>
                  {group.required ? 'Required' : 'Optional'} · {group.type === 'single' ? 'pick one' : 'pick any'}
                </span>
              </div>
              <div className="space-y-2">
                {(group.options || []).map((opt) => {
                  const isSingle = group.type === 'single';
                  const picked   = (selections[gi] || []).includes(opt.label);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => toggleOption(gi, opt.label, isSingle)}
                      className="flex w-full items-center justify-between"
                      style={{
                        padding: '11px 14px',
                        borderRadius: 10,
                        border: picked ? '2px solid var(--ink)' : '1px solid var(--line-2)',
                        background: picked ? 'var(--paper-2)' : 'transparent',
                        cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'border-color .1s, background .1s',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span style={{
                          width: 18, height: 18, flexShrink: 0,
                          borderRadius: isSingle ? '50%' : 4,
                          border: picked
                            ? (isSingle ? '5px solid var(--ink)' : 'none')
                            : '1.5px solid var(--line-2)',
                          background: picked && !isSingle ? 'var(--ink)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all .1s',
                        }}>
                          {picked && !isSingle && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4l3 3 5-6" stroke="var(--paper)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                        <span style={{ fontSize: 14, color: 'var(--ink)', fontWeight: picked ? 500 : 400 }}>
                          {opt.label}
                        </span>
                      </div>
                      {parseFloat(opt.priceAdd || 0) > 0 && (
                        <span style={{ fontSize: 13, color: 'var(--mute)', flexShrink: 0 }}>
                          +{fmt(opt.priceAdd)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--mute)', marginBottom: 6 }}>
              Special instructions (optional)
            </p>
            <textarea
              value={custNotes}
              onChange={(e) => setCustNotes(e.target.value)}
              placeholder="e.g. No onions, extra sauce…"
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box',
                borderRadius: 8, border: '1px solid var(--line-2)',
                background: 'var(--paper-2)', color: 'var(--ink)',
                fontSize: 13, padding: '10px 12px',
                fontFamily: 'inherit', resize: 'none', outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
          <button
            onClick={onConfirm}
            disabled={!custReady}
            style={{
              width: '100%', borderRadius: 10, padding: '14px 0',
              background: 'var(--ink)', color: 'var(--accent-on)',
              border: 0, fontSize: 14, fontWeight: 700,
              cursor: custReady ? 'pointer' : 'default', fontFamily: 'inherit',
              opacity: custReady ? 1 : 0.45,
              transition: 'opacity .15s',
            }}
          >
            {custReady
              ? `Add to order · ${fmt(parseFloat(item.price) + computeExtraPrice(item, selections))}`
              : 'Select required options to continue'
            }
          </button>
        </div>
      </div>
    </div>
  );
}
