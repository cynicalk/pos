import { useState, useEffect } from 'react';

const BILL_COOLDOWN_MS = 5 * 60 * 1000;

export function useBill(tableId, showToast) {
  const billKey = `bill_requested_at_${tableId}`;
  const [billTs, setBillTs] = useState(() => parseInt(localStorage.getItem(billKey) || '0', 10));
  const [billRequesting, setBillRequesting] = useState(false);

  const billDone = billTs > 0 && (BILL_COOLDOWN_MS - (Date.now() - billTs)) > 0;

  useEffect(() => {
    if (!billDone) return;
    const remaining = BILL_COOLDOWN_MS - (Date.now() - billTs);
    const t = setTimeout(() => { localStorage.removeItem(billKey); setBillTs(0); }, remaining > 0 ? remaining : 0);
    return () => clearTimeout(t);
  }, [billTs]); // eslint-disable-line react-hooks/exhaustive-deps

  async function requestBill() {
    setBillRequesting(true);
    try {
      const res = await fetch('/api/public/request-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId }),
      });
      if (!res.ok) throw new Error();
      const ts = Date.now();
      localStorage.setItem(billKey, String(ts));
      setBillTs(ts);
      showToast('Staff has been notified. Your bill is on the way!');
    } catch {
      showToast('Could not send request. Please ask staff directly.');
    } finally {
      setBillRequesting(false);
    }
  }

  function resetBill() {
    localStorage.removeItem(billKey);
    setBillTs(0);
  }

  return { billDone, billRequesting, requestBill, resetBill };
}
