import { useState, useEffect } from 'react';

export function useCart(tableId, { fetchOrders, showToast }) {
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [custModal, setCustModal] = useState(null);
  const [selections, setSelections] = useState({});
  const [custNotes, setCustNotes] = useState('');

  const [openNoteKeys, setOpenNoteKeys] = useState(new Set());
  const [inlineNoteItemId, setInlineNoteItemId] = useState(null);

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const cartTotal = cart.reduce((s, l) => s + (parseFloat(l.item.price) + l.extraPrice) * l.quantity, 0);

  function itemCartQty(itemId) {
    return cart.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.quantity, 0);
  }

  function computeExtraPrice(item, sels) {
    let extra = 0;
    (item.customization_groups || []).forEach((group, gi) => {
      (sels[gi] || []).forEach((lbl) => {
        const opt = (group.options || []).find((o) => o.label === lbl);
        if (opt) extra += parseFloat(opt.priceAdd || 0);
      });
    });
    return extra;
  }

  function addSimple(item) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.itemId === item.id && Object.keys(l.selections).length === 0);
      if (idx >= 0) return prev.map((l, i) => i === idx ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { _key: Math.random(), itemId: item.id, item, quantity: 1, selections: {}, notes: '', extraPrice: 0 }];
    });
  }

  function removeSimple(itemId) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.itemId === itemId && Object.keys(l.selections).length === 0);
      if (idx < 0) return prev;
      const line = prev[idx];
      if (line.quantity <= 1) return prev.filter((_, i) => i !== idx);
      return prev.map((l, i) => i === idx ? { ...l, quantity: l.quantity - 1 } : l);
    });
  }

  function changeLineQty(key, delta) {
    setCart((prev) => {
      const line = prev.find((l) => l._key === key);
      if (!line) return prev;
      if (delta < 0 && line.quantity <= 1) return prev.filter((l) => l._key !== key);
      return prev.map((l) => l._key === key ? { ...l, quantity: l.quantity + delta } : l);
    });
  }

  function updateLineNote(key, val) {
    setCart((prev) => prev.map((l) => l._key === key ? { ...l, notes: val } : l));
  }

  function toggleNoteOpen(key) {
    setOpenNoteKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function updateSimpleItemNote(itemId, text) {
    setCart((prev) =>
      prev.map((l) =>
        l.itemId === itemId && Object.keys(l.selections).length === 0
          ? { ...l, notes: text }
          : l,
      ),
    );
  }

  // Auto-close inline note when the item is removed from cart
  useEffect(() => {
    if (!inlineNoteItemId) return;
    const stillInCart = cart.some(
      (l) => l.itemId === inlineNoteItemId && Object.keys(l.selections).length === 0,
    );
    if (!stillInCart) setInlineNoteItemId(null);
  }, [cart, inlineNoteItemId]);

  function openCustomization(item) {
    const defaults = {};
    (item.customization_groups || []).forEach((group, gi) => {
      const defs = (group.options || []).filter((o) => o.isDefault).map((o) => o.label);
      if (defs.length) defaults[gi] = defs;
    });
    setSelections(defaults);
    setCustNotes('');
    setCustModal(item);
  }

  function toggleOption(gi, label, isSingle) {
    setSelections((prev) => {
      const cur = prev[gi] || [];
      if (isSingle) return { ...prev, [gi]: [label] };
      const has = cur.includes(label);
      return { ...prev, [gi]: has ? cur.filter((l) => l !== label) : [...cur, label] };
    });
  }

  const custReady = custModal
    ? (custModal.customization_groups || []).every((g, i) => !g.required || (selections[i]?.length > 0))
    : true;

  function confirmCustomization() {
    if (!custReady) return;
    const item = custModal;
    const extraPrice = computeExtraPrice(item, selections);
    const selJson = JSON.stringify(selections);
    setCart((prev) => {
      const existing = prev.find((l) => l.itemId === item.id && JSON.stringify(l.selections) === selJson);
      if (existing) return prev.map((l) => l === existing ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { _key: Math.random(), itemId: item.id, item, quantity: 1, selections: { ...selections }, notes: custNotes, extraPrice }];
    });
    setCustModal(null);
  }

  async function placeOrder(staffPin, onSuccess) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId,
          staffPin: staffPin || undefined,
          items: cart.map((line) => ({
            menuItemId: line.itemId,
            quantity:   line.quantity,
            notes:      line.notes || null,
            customizations: line.selections,
          })),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to place order.');
      }
      setCart([]);
      setShowCart(false);
      await fetchOrders(tableId);
      showToast('Order placed! Kitchen has been notified.');
      onSuccess?.();
    } catch (e) {
      showToast(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return {
    cart, showCart, setShowCart, submitting,
    cartCount, cartTotal,
    custModal, setCustModal, selections, custNotes, setCustNotes, custReady,
    openNoteKeys, inlineNoteItemId, setInlineNoteItemId,
    addSimple, removeSimple, changeLineQty,
    updateLineNote, toggleNoteOpen, updateSimpleItemNote,
    openCustomization, toggleOption, confirmCustomization,
    computeExtraPrice, itemCartQty,
    placeOrder,
  };
}
