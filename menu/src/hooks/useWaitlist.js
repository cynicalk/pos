import { useState, useEffect, useCallback, useRef } from 'react';

// Drives the walk-in waitlist flow: load restaurant info from the door-QR token,
// join the queue, then poll this party's live status by its own token. The entry
// token is persisted per restaurant so a refresh keeps the guest on their status
// screen instead of dropping them back to the form.
export function useWaitlist(restaurantToken) {
  const storageKey = `wl_token_${restaurantToken}`;

  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState('');
  const [restaurant, setRestaurant] = useState(null);
  const [entry, setEntry]           = useState(null);
  const [joining, setJoining]       = useState(false);
  const [leaving, setLeaving]       = useState(false);
  const [error, setError]           = useState('');

  const pollRef = useRef(null);

  const clearToken = useCallback(() => {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [storageKey]);

  const fetchStatus = useCallback(async (token) => {
    try {
      const res = await fetch(`/api/public/waitlist/${token}`);
      if (res.status === 404) { clearToken(); setEntry(null); return; }
      if (!res.ok) return;
      const data = await res.json();
      // A resolved entry (cancelled / no-show) frees the guest to rejoin.
      if (data.status === 'cancelled' || data.status === 'no_show') {
        clearToken();
        setEntry(null);
      } else {
        setEntry(data);
      }
    } catch { /* keep last known state on transient errors */ }
  }, [clearToken]);

  // Initial load: restaurant info + resume an existing entry if present.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/public/restaurant/${restaurantToken}`);
        if (!res.ok) throw new Error('This venue is not available. Please ask a staff member.');
        if (!active) return;
        setRestaurant(await res.json());
        const saved = localStorage.getItem(storageKey);
        if (saved) await fetchStatus(saved);
      } catch (e) {
        if (active) setLoadError(e.message || 'Could not load. Please ask a staff member.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [restaurantToken, storageKey, fetchStatus]);

  // Poll while the guest has an active (waiting/seated) entry.
  useEffect(() => {
    if (!entry?.token) return;
    if (entry.status !== 'waiting' && entry.status !== 'seated') return;
    pollRef.current = setInterval(() => fetchStatus(entry.token), 5000);
    return () => clearInterval(pollRef.current);
  }, [entry?.token, entry?.status, fetchStatus]);

  const join = useCallback(async (form) => {
    setError('');
    setJoining(true);
    try {
      const res = await fetch('/api/public/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantToken, ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not join the waitlist.');
      try { localStorage.setItem(storageKey, data.token); } catch { /* ignore */ }
      setEntry(data);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setJoining(false);
    }
  }, [restaurantToken, storageKey]);

  const cancel = useCallback(async () => {
    if (!entry?.token) return;
    setLeaving(true);
    try {
      await fetch(`/api/public/waitlist/${entry.token}/cancel`, { method: 'POST' });
    } catch { /* best effort */ }
    clearToken();
    setEntry(null);
    setLeaving(false);
  }, [entry?.token, clearToken]);

  return { loading, loadError, restaurant, entry, joining, leaving, error, join, cancel };
}
