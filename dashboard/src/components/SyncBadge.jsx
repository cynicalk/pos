import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { getPendingCount, getErrorCount, retryErrors } from '../store/syncQueue';

export default function SyncBadge() {
  const [pending, setPending] = useState(0);
  const [errors,  setErrors]  = useState(0);

  const refresh = useCallback(async () => {
    const [p, e] = await Promise.all([getPendingCount(), getErrorCount()]);
    setPending(p);
    setErrors(e);
  }, []);

  useEffect(() => {
    let alive = true;
    async function check() {
      const [p, e] = await Promise.all([getPendingCount(), getErrorCount()]);
      if (alive) { setPending(p); setErrors(e); }
    }
    check();
    const id = setInterval(check, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const handleRetry = async () => {
    await retryErrors();
    await refresh();
  };

  if (pending === 0 && errors === 0) return null;

  return (
    <span className="inline-flex items-center gap-2">
      {pending > 0 && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{ fontSize: 11.5, fontWeight: 500, background: 'rgba(179,120,31,.1)', color: 'var(--warn)' }}
        >
          <RefreshCw size={11} className="animate-spin" />
          {pending} pending sync
        </span>
      )}
      {errors > 0 && (
        <button
          onClick={handleRetry}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 cursor-pointer"
          style={{ fontSize: 11.5, fontWeight: 500, background: 'rgba(220,38,38,.1)', color: 'var(--bad)', border: 'none' }}
        >
          <AlertCircle size={11} />
          {errors} failed — retry
        </button>
      )}
    </span>
  );
}
