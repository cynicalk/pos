import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, ShoppingCart, Utensils, ClipboardList } from 'lucide-react';

import { useTableData } from '../hooks/useTableData';
import { useCart } from '../hooks/useCart';
import { useBill } from '../hooks/useBill';
import { useStaffPin } from '../hooks/useStaffPin';

import { ItemDetailSheet } from '../components/ItemDetailSheet';
import { CustomizationModal } from '../components/CustomizationModal';
import { CartSheet } from '../components/CartSheet';
import { MenuTab } from '../components/MenuTab';
import { OrdersTab } from '../components/OrdersTab';
import { StaffPinBar } from '../components/StaffPinBar';

export default function OrderMenu() {
  const { tableId }    = useParams();
  const [searchParams] = useSearchParams();
  const pinFromUrl     = !!searchParams.get('staff');

  const [tab,        setTab]        = useState('menu');
  const [toast,      setToast]      = useState('');
  const [detailItem, setDetailItem] = useState(null);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const {
    loading, loadError, tableInfo, items, activeOrders, hadOrders,
    fetchOrders, cancelling, cancelOrder, fmt, taxMultiplier,
  } = useTableData(tableId, showToast);

  const {
    cart, showCart, setShowCart, submitting,
    cartCount, cartTotal,
    custModal, setCustModal, selections, custNotes, setCustNotes, custReady,
    openNoteKeys, inlineNoteItemId, setInlineNoteItemId,
    addSimple, removeSimple, changeLineQty,
    updateLineNote, toggleNoteOpen, updateSimpleItemNote,
    openCustomization, toggleOption, confirmCustomization,
    computeExtraPrice, itemCartQty, placeOrder,
  } = useCart(tableId, { fetchOrders, showToast });

  const { billDone, billRequesting, requestBill } = useBill(tableId, showToast);

  const {
    staffPin, setStaffPin,
    staffName, setStaffName,
    pinVerifying, staffAssigning, staffAssigned,
    assignStaffToTable, verifyAndAssign,
  } = useStaffPin(tableId, tableInfo, pinFromUrl, searchParams.get('staff') || '', showToast);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--paper-2)' }}>
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>Loading menu…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center p-8" style={{ background: 'var(--paper-2)' }}>
        <div className="text-center">
          <AlertCircle size={40} style={{ color: 'var(--bad)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, color: 'var(--mute)' }}>{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--paper-2)' }}>
      <ItemDetailSheet
        item={detailItem}
        fmt={fmt}
        onClose={() => setDetailItem(null)}
        onAdd={() => {
          if ((detailItem.customization_groups || []).length > 0) {
            openCustomization(detailItem);
          } else {
            addSimple(detailItem);
            setInlineNoteItemId(detailItem.id);
          }
          setDetailItem(null);
        }}
      />
      <CustomizationModal
        item={custModal}
        selections={selections}
        custNotes={custNotes}
        setCustNotes={setCustNotes}
        custReady={custReady}
        computeExtraPrice={computeExtraPrice}
        toggleOption={toggleOption}
        onConfirm={confirmCustomization}
        onClose={() => setCustModal(null)}
        fmt={fmt}
      />
      <CartSheet
        show={showCart}
        onClose={() => setShowCart(false)}
        cart={cart}
        cartTotal={cartTotal}
        cartCount={cartCount}
        submitting={submitting}
        openNoteKeys={openNoteKeys}
        toggleNoteOpen={toggleNoteOpen}
        updateLineNote={updateLineNote}
        changeLineQty={changeLineQty}
        onPlaceOrder={() => placeOrder(staffPin, () => { setTab('orders'); })}
        fmt={fmt}
      />

      {toast && (
        <div className="fixed top-4 left-4 right-4 z-50 flex items-center gap-2.5" style={{
          background: 'var(--ink)', color: 'var(--accent-on)',
          padding: '12px 16px', borderRadius: 10,
          fontSize: 13, fontWeight: 500,
          boxShadow: '0 8px 24px -8px rgba(10,10,10,.5)',
        }}>
          <CheckCircle size={15} style={{ flexShrink: 0, color: 'var(--ok)' }} />
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'var(--ink)', padding: '20px 16px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{
            fontSize: 10, fontWeight: 600, color: 'rgba(250,250,248,.5)',
            textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 3px',
          }}>
            {tableInfo?.restaurant_name}
          </p>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-on)', margin: 0, lineHeight: 1.2 }}>
            Table {tableInfo?.table_number}
          </h1>
        </div>
        <svg width="28" height="28" viewBox="0 0 200 200" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
          <path d="M 154.194 25.409 A 92.2 92.2 0 1 0 154.194 174.591"
                fill="none" stroke="rgba(250,250,248,0.7)" strokeWidth="15.6" strokeLinecap="round"/>
          <circle cx="100" cy="100" r="10.8" fill="#b06a3b"/>
        </svg>
      </div>

      <StaffPinBar
        tableInfo={tableInfo}
        pinFromUrl={pinFromUrl}
        staffPin={staffPin}
        setStaffPin={setStaffPin}
        staffName={staffName}
        setStaffName={setStaffName}
        pinVerifying={pinVerifying}
        staffAssigning={staffAssigning}
        staffAssigned={staffAssigned}
        assignStaffToTable={assignStaffToTable}
        verifyAndAssign={verifyAndAssign}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {tab === 'menu' ? (
          <MenuTab
            items={items}
            cart={cart}
            fmt={fmt}
            addSimple={addSimple}
            removeSimple={removeSimple}
            openCustomization={openCustomization}
            itemCartQty={itemCartQty}
            inlineNoteItemId={inlineNoteItemId}
            setInlineNoteItemId={setInlineNoteItemId}
            updateSimpleItemNote={updateSimpleItemNote}
            setDetailItem={setDetailItem}
          />
        ) : (
          <OrdersTab
            activeOrders={activeOrders}
            hadOrders={hadOrders}
            tableId={tableId}
            fmt={fmt}
            taxMultiplier={taxMultiplier}
            cancelling={cancelling}
            cancelOrder={cancelOrder}
            billDone={billDone}
            billRequesting={billRequesting}
            requestBill={requestBill}
            showToast={showToast}
          />
        )}
      </div>

      {/* Cart FAB */}
      {cartCount > 0 && tab === 'menu' && (
        <div style={{ position: 'fixed', bottom: 70, left: 16, right: 16, zIndex: 40 }}>
          <button
            onClick={() => setShowCart(true)}
            className="flex w-full items-center gap-3"
            style={{
              background: 'var(--ink)', color: 'var(--accent-on)',
              border: 0, borderRadius: 14, padding: '14px 18px',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 8px 28px -8px rgba(10,10,10,.5)',
            }}
          >
            <span style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'rgba(250,250,248,.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}>
              {cartCount}
            </span>
            <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 600 }}>View cart</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{fmt(cartTotal)}</span>
            <ShoppingCart size={17} />
          </button>
        </div>
      )}

      {/* Bottom tab bar */}
      <div className="flex" style={{ borderTop: '1px solid var(--line)', background: 'var(--paper)' }}>
        {[
          { id: 'menu',   label: 'Menu',      Icon: Utensils,      badge: 0 },
          { id: 'orders', label: 'My Orders', Icon: ClipboardList, badge: activeOrders.length },
        ].map(({ id, label, Icon, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="relative flex flex-1 flex-col items-center"
            style={{
              gap: 3, padding: '10px 0',
              fontSize: 11.5, fontWeight: 600,
              color: tab === id ? 'var(--ink)' : 'var(--mute-2)',
              background: 'transparent', border: 0,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'color .1s',
            }}
          >
            <div style={{ position: 'relative' }}>
              <Icon size={20} />
              {badge > 0 && (
                <span style={{
                  position: 'absolute', top: -6, right: -8,
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'var(--ink)', color: 'var(--accent-on)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700,
                }}>
                  {badge}
                </span>
              )}
            </div>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
