import { useEffect, useRef } from 'react';
import { useOnline } from './useOnline';
import { flushQueue } from '../store/syncQueue';
import { queryClient } from '../lib/queryClient';

// Module-level lock: prevents multiple useSync instances from flushing simultaneously.
let isFlushing = false;

// Watches connectivity. When we come back online after being offline,
// flush the mutation queue then invalidate affected queries.
export function useSync() {
  const online = useOnline();
  const wasOffline = useRef(!online);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }

    if (wasOffline.current) {
      wasOffline.current = false;
      if (isFlushing) return;
      isFlushing = true;
      flushQueue().then(({ synced, errors }) => {
        if (errors > 0) {
          console.warn(`[sync] ${errors} mutation(s) failed to sync — check the sync badge to retry`);
        }
        if (synced > 0 || errors > 0) {
          queryClient.invalidateQueries({ queryKey: ['kitchen'] });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['tables'] });
          queryClient.invalidateQueries({ queryKey: ['menu'] });
        }
      }).finally(() => {
        isFlushing = false;
      });
    }
  }, [online]);
}