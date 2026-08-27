import { useState, useEffect, useCallback } from 'react';
import { formatMoney } from '@shared/format-money';

export function useTableData(tableId, showToast) {
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState('');
  const [tableInfo,    setTableInfo]    = useState(null);
  const [items,        setItems]        = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [hadOrders,    setHadOrders]    = useState(false);
  const [cancelling,   setCancelling]   = useState(null);

  useEffect(() => {
    if (activeOrders.length > 0) setHadOrders(true);
  }, [activeOrders]);

  const taxMultiplier = tableInfo
    ? 1 + ((tableInfo.tax_rate || 0) + (tableInfo.service_charge || 0)) / 100
    : 1;

  const fmt = (v) => {
    if (!tableInfo?.currency) return String(v);
    return formatMoney(v, tableInfo.currency);
  };

  const fetchOrders = useCallback(async (tid) => {
    try {
      const res = await fetch(`/api/public/orders/table/${tid}`);
      if (res.ok) setActiveOrders(await res.json());
    } catch { /* silent */ }
  }, []);

  const fetchTableInfo = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/table/${tableId}`);
      if (res.ok) setTableInfo(await res.json());
    } catch { /* silent */ }
  }, [tableId]);

  useEffect(() => {
    async function load() {
      try {
        const tr = await fetch(`/api/public/table/${tableId}`);
        if (!tr.ok) throw new Error('Table not found. Please ask staff for help.');
        const table = await tr.json();
        setTableInfo(table);
        const [mr] = await Promise.all([
          fetch(`/api/public/menu/${table.restaurant_id}`),
          fetchOrders(tableId),
        ]);
        if (!mr.ok) throw new Error('Failed to load menu.');
        setItems(await mr.json());
      } catch (e) {
        setLoadError(e.message || 'Could not load menu. Please ask staff for help.');
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(() => { fetchOrders(tableId); fetchTableInfo(); }, 5000);

    function onVisible() {
      if (document.visibilityState === 'visible') fetchOrders(tableId);
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [tableId, fetchOrders, fetchTableInfo]);

  async function cancelOrder(orderId) {
    setCancelling(orderId);
    try {
      const res = await fetch(`/api/public/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Could not cancel order.');
      }
      await fetchOrders(tableId);
      showToast('Order cancelled.');
    } catch (e) {
      showToast(e.message);
    } finally {
      setCancelling(null);
    }
  }

  return {
    loading, loadError,
    tableInfo, items, activeOrders, hadOrders,
    fetchOrders, fetchTableInfo,
    cancelling, cancelOrder,
    fmt, taxMultiplier,
  };
}
