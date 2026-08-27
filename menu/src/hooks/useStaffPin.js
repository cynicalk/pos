import { useState, useEffect } from 'react';

export function useStaffPin(tableId, tableInfo, pinFromUrl, initialPin, showToast) {
  const [staffPin, setStaffPin] = useState(initialPin || '');
  const [staffName, setStaffName] = useState('');
  const [staffAssigning, setStaffAssigning] = useState(false);
  const [staffAssigned, setStaffAssigned] = useState(false);

  async function assignStaffToTable() {
    if (!staffPin || !staffName || staffAssigning) return;
    setStaffAssigning(true);
    try {
      const res = await fetch(`/api/public/table/${tableId}/staff`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffPin }),
      });
      if (!res.ok) throw new Error();
      setStaffAssigned(true);
      setTimeout(() => setStaffAssigned(false), 3000);
    } catch {
      showToast('Could not assign staff. Please try again.');
    } finally {
      setStaffAssigning(false);
    }
  }

  // Verifies PIN and assigns staff in one request; gets name from response.
  async function verifyAndAssign() {
    if (staffAssigning || staffPin.length !== 4) return;
    setStaffAssigning(true);
    try {
      const res = await fetch(`/api/public/table/${tableId}/staff`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffPin }),
      });
      if (!res.ok) { setStaffName(''); return; }
      const { name } = await res.json();
      setStaffName(name || '');
      setStaffAssigned(true);
    } catch {
      showToast('Could not assign staff. Please try again.');
    } finally {
      setStaffAssigning(false);
    }
  }

  // Sync staffName from server whenever the table's assignment changes
  useEffect(() => {
    const name = tableInfo?.assigned_staff_name;
    if (name && name !== staffName) setStaffName(name);
  }, [tableInfo?.assigned_staff_name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-assign URL-provided PIN once tableInfo is available; get name from response
  useEffect(() => {
    if (!tableInfo?.restaurant_id || !staffPin || !pinFromUrl) return;
    setStaffAssigning(true);
    fetch(`/api/public/table/${tableId}/staff`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffPin }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.name) setStaffName(data.name); })
      .catch(() => {})
      .finally(() => setStaffAssigning(false));
  }, [tableInfo?.restaurant_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    staffPin, setStaffPin,
    staffName, setStaffName,
    pinVerifying: false,
    staffAssigning, staffAssigned,
    verifyPin: () => {},
    assignStaffToTable, verifyAndAssign,
  };
}
