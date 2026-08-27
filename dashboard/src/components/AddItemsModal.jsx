import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ChevronDown, Star, CheckCircle } from 'lucide-react';
import { useMenuItems, usePopularMenuItems } from '../hooks/useMenu';
import { useAddItems } from '../hooks/useOrders';
import { useCurrency } from '../context/CurrencyContext';
import CustomizationPicker from './CustomizationPicker';
import MenuRow from './MenuRow';

export default function AddItemsModal({ order, orderTitle, onClose }) {
  const { data: menuItems = [] } = useMenuItems();
  const { data: popular  = [] } = usePopularMenuItems();
  const addItems                 = useAddItems();
  const { format }               = useCurrency();

  const [cart,           setCart]       = useState({});
  const [pickerItem,     setPickerItem] = useState(null);
  const [error,          setError]      = useState('');
  const [done,           setDone]       = useState(false);
  const [openCategories, setOpenCats]   = useState(new Set());
  const [mobileTab,      setMobileTab]  = useState('menu');

  const grouped = useMemo(() =>
    menuItems.filter((m) => m.available).reduce((acc, item) => {
      const cat = item.category || 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {}),
    [menuItems],
  );

  const cartItems = useMemo(
    () => menuItems.filter((m) => (cart[m.id]?.quantity ?? 0) > 0),
    [menuItems, cart],
  );

  const total = useMemo(
    () => cartItems.reduce((s, m) => {
      const entry = cart[m.id];
      return s + (m.price + (entry?.priceAdd || 0)) * entry.quantity;
    }, 0),
    [cartItems, cart],
  );

  function handleAdd(item) {
    const groups = item.customization_groups || [];
    if (groups.length > 0 && !cart[item.id]) { setPickerItem(item); return; }
    setCart((prev) => {
      const cur = prev[item.id] || { quantity: 0, customizations: {}, notes: '', priceAdd: 0 };
      return { ...prev, [item.id]: { ...cur, quantity: cur.quantity + 1 } };
    });
  }

  function handleRemove(id) {
    setCart((prev) => {
      const qty = (prev[id]?.quantity ?? 1) - 1;
      if (qty <= 0) { const { [id]: _, ...rest } = prev; return rest; }
      return { ...prev, [id]: { ...prev[id], quantity: qty } };
    });
  }

  function handlePickerConfirm({ customizations, notes, priceAdd }) {
    setCart((prev) => {
      const cur = prev[pickerItem.id] || { quantity: 0 };
      return { ...prev, [pickerItem.id]: { quantity: cur.quantity + 1, customizations, notes, priceAdd } };
    });
    setPickerItem(null);
  }

  async function handleSubmit() {
    setError('');
    if (cartItems.length === 0) { setError('Add at least one item.'); return; }
    const items = cartItems.map((m) => {
      const entry = cart[m.id];
      return { menuItemId: m.id, quantity: entry.quantity, notes: entry.notes || undefined, customizations: entry.customizations || undefined };
    });
    try {
      await addItems.mutateAsync({ orderId: order.id, items });
      setDone(true);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to add items');
    }
  }

  const cartCount = cartItems.reduce((s, m) => s + (cart[m.id]?.quantity ?? 0), 0);

  return createPortal(
    <>
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      style={{ background: 'rgba(10,10,10,.32)' }}
    >
      <div
        className="flex w-full flex-col h-[100dvh] rounded-none sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-[8px]"
        style={{ background: 'var(--paper)' }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 h-12"
          style={{ borderBottom: '1px solid var(--line)' }}>
          <div>
            <span className="font-semibold" style={{ fontSize: 13, color: 'var(--ink)' }}>Add Items</span>
            <span className="ml-2" style={{ fontSize: 12, color: 'var(--mute)' }}>{orderTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-[6px] overflow-hidden sm:hidden" style={{ border: '1px solid var(--line-2)' }}>
              <button onClick={() => setMobileTab('menu')}
                style={{ fontSize: 11.5, padding: '4px 10px', background: mobileTab === 'menu' ? 'var(--ink)' : 'transparent', color: mobileTab === 'menu' ? 'var(--accent-on)' : 'var(--mute)', border: 0 }}>
                Menu
              </button>
              <button onClick={() => setMobileTab('cart')}
                style={{ fontSize: 11.5, padding: '4px 10px', background: mobileTab === 'cart' ? 'var(--ink)' : 'transparent', color: mobileTab === 'cart' ? 'var(--accent-on)' : 'var(--mute)', border: 0 }}>
                Cart {cartCount > 0 && `(${cartCount})`}
              </button>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 transition-colors"
              style={{ color: 'var(--mute)', background: 'transparent', border: 0, cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {done ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <CheckCircle size={36} style={{ color: 'var(--ok)' }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Items sent to kitchen</p>
            <p style={{ fontSize: 13, color: 'var(--mute)' }}>Order status reset to Received</p>
            <button onClick={onClose} className="btn-primary mt-2" style={{ padding: '0 32px' }}>Done</button>
          </div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {/* Menu */}
              <div className={`flex-1 overflow-y-auto px-5 py-4 ${mobileTab === 'cart' ? 'hidden sm:block' : ''}`}>
                {Object.keys(grouped).length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--mute)' }}>No menu items available</p>
                ) : (
                  <>
                    {popular.length > 0 && (
                      <div className="mb-5">
                        <div className="flex items-center gap-1.5 mb-3">
                          <Star size={12} style={{ color: 'var(--warn)', fill: 'var(--warn)' }} />
                          <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)' }}>
                            Best Sellers
                          </p>
                        </div>
                        {popular.map((item) => (
                          <MenuRow key={item.id} item={item} qty={cart[item.id]?.quantity ?? 0}
                            hasGroups={(item.customization_groups?.length ?? 0) > 0}
                            onAdd={() => handleAdd(item)} onRemove={() => handleRemove(item.id)} format={format} />
                        ))}
                      </div>
                    )}
                    {Object.entries(grouped).map(([category, items]) => {
                      const isOpen = openCategories.has(category);
                      return (
                        <div key={category} className="mb-2">
                          <button
                            onClick={() => setOpenCats((prev) => { const next = new Set(prev); isOpen ? next.delete(category) : next.add(category); return next; })}
                            className="flex w-full items-center justify-between py-2"
                            style={{ background: 'transparent', border: 0 }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)' }}>
                              {category} <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>({items.length})</span>
                            </p>
                            <ChevronDown size={14} style={{ color: 'var(--mute)', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                          </button>
                          {isOpen && items.map((item) => (
                            <MenuRow key={item.id} item={item} qty={cart[item.id]?.quantity ?? 0}
                              hasGroups={(item.customization_groups?.length ?? 0) > 0}
                              onAdd={() => handleAdd(item)} onRemove={() => handleRemove(item.id)} format={format} />
                          ))}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {/* Cart */}
              <div
                className={`overflow-y-auto px-4 py-4 w-full sm:w-64 sm:shrink-0 ${mobileTab === 'menu' ? 'hidden sm:block' : ''}`}
                style={{ borderLeft: '1px solid var(--line)', background: 'var(--paper)' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)' }}>
                    New items ({cartItems.length})
                  </p>
                </div>
                {cartItems.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--mute)' }}>No items yet</p>
                ) : (
                  <ul className="space-y-3">
                    {cartItems.map((item) => {
                      const entry = cart[item.id];
                      const custLabels = Object.entries(entry.customizations || {}).flatMap(([, v]) => Array.isArray(v) ? v : [v]);
                      return (
                        <li key={item.id}>
                          <div className="flex items-start justify-between gap-2" style={{ fontSize: 13 }}>
                            <span style={{ color: 'var(--ink)' }}>
                              <span className="font-medium">{entry.quantity}×</span> {item.name}
                            </span>
                            <span className="mono num shrink-0" style={{ color: 'var(--mute)', fontSize: 12 }}>
                              {format((item.price + (entry.priceAdd || 0)) * entry.quantity)}
                            </span>
                          </div>
                          {custLabels.length > 0 && (
                            <p className="mt-0.5 mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{custLabels.join(', ')}</p>
                          )}
                          {entry.notes && (
                            <p className="mt-0.5 italic" style={{ fontSize: 11, color: 'var(--mute)' }}>{entry.notes}</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {cartItems.length > 0 && (
                  <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                    <div className="flex items-center justify-between font-semibold" style={{ fontSize: 13, color: 'var(--ink)' }}>
                      <span>New items total</span>
                      <span className="mono num">{format(total)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-5 py-4" style={{ borderTop: '1px solid var(--line)' }}>
              {error && (
                <p className="rounded-[6px] px-3 py-2 mb-3" style={{ fontSize: 12, color: 'var(--bad)', background: 'rgba(179,55,43,.06)' }}>
                  {error}
                </p>
              )}
              <div className="flex items-center justify-between gap-3">
                <button onClick={onClose} className="btn-secondary">Cancel</button>
                <button onClick={handleSubmit} disabled={addItems.isPending || cartItems.length === 0} className="btn-primary">
                  <ChevronRight size={14} />
                  {addItems.isPending ? 'Sending…' : `Send to Kitchen${cartCount > 0 ? ` (${cartCount})` : ''}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>

    {pickerItem && (
      <CustomizationPicker
        item={pickerItem}
        format={format}
        onConfirm={handlePickerConfirm}
        onCancel={() => setPickerItem(null)}
      />
    )}
    </>,
    document.body
  );
}
