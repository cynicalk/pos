import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Minus, ChevronRight, ChevronDown, Utensils, ShoppingBag, Truck, Star } from 'lucide-react';
import { useMenuItems, usePopularMenuItems } from '../hooks/useMenu';
import { useTables } from '../hooks/useTables';
import { useCreateOrder, useAddItems } from '../hooks/useOrders';
import { useCurrency } from '../context/CurrencyContext';
import CustomizationPicker from './CustomizationPicker';
import MenuRow from './MenuRow';

const CHANNELS = [
  { id: 'dining',   label: 'Dine In',  Icon: Utensils    },
  { id: 'takeaway', label: 'Takeaway', Icon: ShoppingBag },
  { id: 'delivery', label: 'Delivery', Icon: Truck       },
];

const TABLE_DOT = {
  available: 'var(--ok)',
  occupied:  'var(--bad)',
  reserved:  'var(--warn)',
  cleaning:  'var(--info)',
};

export default function NewOrderModal({ onClose, initialTableId = null, addItems = false, orderId = null }) {
  const { data: menuItems = [] }  = useMenuItems();
  const { data: popular  = [] }  = usePopularMenuItems();
  const { data: tables   = [] }  = useTables();
  const createOrder               = useCreateOrder();
  const addItemsMutation          = useAddItems();
  const { format }                = useCurrency();

  const [channel,        setChannel]     = useState('dining');
  const [tableId,        setTableId]     = useState(initialTableId);
  const [customerRef,    setCRef]        = useState('');
  const [cart,           setCart]        = useState({});
  const [pickerItem,     setPickerItem]  = useState(null);
  const [error,          setError]       = useState('');
  const [openCategories, setOpenCats]    = useState(new Set());
  const [mobileTab,      setMobileTab]   = useState('menu');

  useEffect(() => { setTableId(channel === 'dining' ? initialTableId : null); setCRef(''); setError(''); }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const eligibleTables = useMemo(
    () => [...tables].filter((t) => t.status === 'available' || t.status === 'occupied').sort((a, b) => a.number - b.number),
    [tables],
  );

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
    () => cartItems.reduce((sum, m) => {
      const entry = cart[m.id];
      return sum + (m.price + (entry?.priceAdd || 0)) * entry.quantity;
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

  function handleRemove(itemId) {
    setCart((prev) => {
      const qty = (prev[itemId]?.quantity ?? 1) - 1;
      if (qty <= 0) { const { [itemId]: _, ...rest } = prev; return rest; }
      return { ...prev, [itemId]: { ...prev[itemId], quantity: qty } };
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
    if (channel === 'dining' && !tableId) { setError('Please select a table.'); return; }
    if (cartItems.length === 0) { setError('Add at least one item.'); return; }
    const items = cartItems.map((m) => {
      const entry = cart[m.id];
      return { menuItemId: m.id, quantity: entry.quantity, notes: entry.notes || undefined, customizations: entry.customizations || undefined };
    });
    try {
      if (addItems && orderId) {
        await addItemsMutation.mutateAsync({ orderId, items });
      } else {
        await createOrder.mutateAsync({ tableId: channel === 'dining' ? tableId : null, items, channel, customerRef: customerRef.trim() || null });
      }
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to place order');
    }
  }

  const cartCount = cartItems.reduce((s, m) => s + (cart[m.id]?.quantity ?? 0), 0);
  const tax = total * 0.1;

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
        {/* Topbar */}
        <div
          className="flex shrink-0 items-center gap-3 px-5 h-12"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <span className="font-semibold" style={{ fontSize: 13, color: 'var(--ink)' }}>{addItems ? 'Add items' : 'New order'}</span>
          <span style={{ color: 'var(--mute)', fontSize: 12 }}>·</span>
          <span style={{ color: 'var(--mute)', fontSize: 12 }}>
            {channel === 'dining'
              ? tableId ? `Table ${tables.find((t) => t.id === tableId)?.number}` : 'Dine in'
              : channel === 'takeaway' ? 'Takeaway' : 'Delivery'}
          </span>
          {/* Mobile tabs */}
          <div className="flex items-center gap-2 sm:hidden ml-auto">
            <div className="flex rounded-[6px] overflow-hidden" style={{ border: '1px solid var(--line-2)' }}>
              <button onClick={() => setMobileTab('menu')}
                style={{ fontSize: 11.5, padding: '4px 10px', background: mobileTab === 'menu' ? 'var(--ink)' : 'transparent', color: mobileTab === 'menu' ? 'var(--accent-on)' : 'var(--mute)', border: 0 }}>
                Menu
              </button>
              <button onClick={() => setMobileTab('cart')}
                style={{ fontSize: 11.5, padding: '4px 10px', background: mobileTab === 'cart' ? 'var(--ink)' : 'transparent', color: mobileTab === 'cart' ? 'var(--accent-on)' : 'var(--mute)', border: 0, position: 'relative' }}>
                Cart {cartCount > 0 && <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700 }}>({cartCount})</span>}
              </button>
            </div>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-2">
            {error && <span style={{ fontSize: 12, color: 'var(--bad)' }}>{error}</span>}
            <button onClick={onClose} className="btn btn-sm btn-ghost"><X size={13} /> Cancel</button>
            <button onClick={handleSubmit} disabled={(addItems && orderId ? addItemsMutation.isPending : createOrder.isPending) || cartCount === 0} className="btn-primary btn-sm">
              <ChevronRight size={13} />
              {(addItems && orderId ? addItemsMutation.isPending : createOrder.isPending) ? (addItems ? 'Adding…' : 'Placing…') : `${addItems ? 'Add items' : 'Place order'}${cartCount > 0 ? ` (${cartCount})` : ''}`}
            </button>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 transition-colors sm:hidden"
            style={{ color: 'var(--mute)', background: 'transparent', border: 0, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--ink)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--mute)'; }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left: menu picker */}
          <div
            className={`flex flex-col min-h-0 flex-1 ${mobileTab === 'cart' ? 'hidden sm:flex' : ''}`}
            style={{ borderRight: '1px solid var(--line)' }}
          >
            {/* Channel + table/ref selector */}
            <div className="shrink-0 px-5 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Channel toggle */}
                <div className="flex rounded-[6px] overflow-hidden" style={{ border: '1px solid var(--line-2)' }}>
                  {CHANNELS.map(({ id, label, Icon }) => (
                    <button key={id} onClick={() => setChannel(id)}
                      style={{
                        height: 30, padding: '0 10px', fontSize: 12, fontWeight: 500,
                        background: channel === id ? 'var(--ink)' : 'transparent',
                        color: channel === id ? 'var(--accent-on)' : 'var(--ink-2)',
                        border: 0, display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                      <Icon size={13} />{label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table selector */}
              {channel === 'dining' && (
                <div className="mt-3">
                  <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)', marginBottom: 6 }}>
                    Select table
                  </p>
                  {eligibleTables.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--mute)' }}>No available or occupied tables</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {eligibleTables.map((t) => {
                        const on = tableId === t.id;
                        return (
                          <button key={t.id} onClick={() => setTableId(t.id)}
                            className="btn btn-sm"
                            style={{
                              height: 30, paddingLeft: 10, paddingRight: 10,
                              background: on ? 'var(--ink)' : 'var(--paper)',
                              color: on ? 'var(--accent-on)' : 'var(--ink)',
                              borderColor: on ? 'var(--ink)' : 'var(--line-2)',
                            }}>
                            <span className="mono num font-bold" style={{ fontSize: 12 }}>T{String(t.number).padStart(2, '0')}</span>
                            <span style={{ opacity: .6, fontSize: 11 }}>{t.seats}p</span>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: TABLE_DOT[t.status] ?? 'var(--mute-2)', display: 'inline-block' }} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Customer ref */}
              {channel !== 'dining' && (
                <div className="mt-3 max-w-sm">
                  <label style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)', marginBottom: 6 }}>
                    Customer / reference <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input value={customerRef} onChange={(e) => setCRef(e.target.value)}
                    placeholder={channel === 'delivery' ? 'e.g. Rahul – 9th floor' : 'e.g. Token #12'}
                    className="input" style={{ height: 30 }} />
                </div>
              )}
            </div>

            {/* Menu items */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {Object.keys(grouped).length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--mute)' }}>No menu items available</p>
              ) : (
                <>
                  {/* Best Sellers */}
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
                          onAdd={() => handleAdd(item)} onRemove={() => handleRemove(item.id)} format={format} cursor="default" />
                      ))}
                    </div>
                  )}

                  {/* Categories */}
                  {Object.entries(grouped).map(([category, items]) => {
                    const isOpen = openCategories.has(category);
                    return (
                      <div key={category} className="mb-2">
                        <button
                          onClick={() => setOpenCats((prev) => { const next = new Set(prev); isOpen ? next.delete(category) : next.add(category); return next; })}
                          className="flex w-full items-center justify-between py-2 transition-colors"
                          style={{ background: 'transparent', border: 0 }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)' }}>
                            {category}
                            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>({items.length})</span>
                          </p>
                          <ChevronDown size={14} style={{ color: 'var(--mute)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                        </button>
                        {isOpen && items.map((item) => (
                          <MenuRow key={item.id} item={item} qty={cart[item.id]?.quantity ?? 0}
                            hasGroups={(item.customization_groups?.length ?? 0) > 0}
                            onAdd={() => handleAdd(item)} onRemove={() => handleRemove(item.id)} format={format} cursor="default" />
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* Right: cart */}
          <div
            className={`flex flex-col w-full sm:w-72 sm:shrink-0 ${mobileTab === 'menu' ? 'hidden sm:flex' : ''}`}
            style={{ background: 'var(--paper)' }}
          >
            <div className="px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--mute)', marginBottom: 4 }}>
                Order
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.01em' }}>
                {cartCount} item{cartCount !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {cartItems.length === 0 ? (
                <div className="px-5 py-10 text-center" style={{ fontSize: 12.5, color: 'var(--mute)' }}>
                  Tap menu items to add.
                </div>
              ) : (
                cartItems.map((item) => {
                  const entry = cart[item.id];
                  const custLabels = Object.entries(entry.customizations || {}).flatMap(([, v]) => Array.isArray(v) ? v : [v]);
                  return (
                    <div
                      key={item.id}
                      className="grid items-center gap-2 px-4 py-2"
                      style={{ gridTemplateColumns: '1fr auto auto auto', borderBottom: '1px solid var(--line)' }}
                    >
                      <span className="min-w-0">
                        <div style={{ fontSize: 13, color: 'var(--ink)' }}>{item.name}</div>
                        <div className="mono num" style={{ fontSize: 11.5, color: 'var(--mute)' }}>{format(item.price)}</div>
                        {custLabels.length > 0 && (
                          <div className="mono" style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>↳ {custLabels.join(' · ')}</div>
                        )}
                        {entry.notes && (
                          <div className="italic" style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>{entry.notes}</div>
                        )}
                      </span>
                      <button onClick={() => handleRemove(item.id)} className="btn btn-sm" style={{ width: 22, height: 22, padding: 0, justifyContent: 'center' }}>
                        <Minus size={11} />
                      </button>
                      <span className="mono num font-semibold" style={{ minWidth: 18, textAlign: 'center', fontSize: 13, color: 'var(--ink)' }}>
                        {entry.quantity}
                      </span>
                      <button onClick={() => handleAdd(item)} className="btn btn-sm" style={{ width: 22, height: 22, padding: 0, justifyContent: 'center' }}>
                        <Plus size={11} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Totals */}
            <div className="shrink-0 px-5 py-4" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="flex justify-between mb-1.5" style={{ fontSize: 12.5, color: 'var(--mute)' }}>
                <span>Subtotal</span>
                <span className="mono num">{format(total)}</span>
              </div>
              <div className="flex justify-between mb-2" style={{ fontSize: 12.5, color: 'var(--mute)' }}>
                <span>Service & tax 10%</span>
                <span className="mono num">{format(tax)}</span>
              </div>
              <div className="h-r mb-3" />
              <div className="flex justify-between mb-3" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                <span>Total</span>
                <span className="mono num">{format(total + tax)}</span>
              </div>
              {error && (
                <p className="rounded-[6px] px-3 py-2 mb-3" style={{ fontSize: 12, color: 'var(--bad)', background: 'rgba(179,55,43,.06)' }}>{error}</p>
              )}
              <button
                onClick={handleSubmit}
                disabled={(addItems && orderId ? addItemsMutation.isPending : createOrder.isPending) || cartCount === 0}
                className="btn-primary w-full justify-center"
                style={{ height: 36 }}
              >
                <ChevronRight size={14} />
                {(addItems && orderId ? addItemsMutation.isPending : createOrder.isPending) ? (addItems ? 'Adding…' : 'Placing…') : `${addItems ? 'Add items' : 'Place order'}${cartCount > 0 ? ` (${cartCount})` : ''}`}
              </button>
            </div>
          </div>
        </div>
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
