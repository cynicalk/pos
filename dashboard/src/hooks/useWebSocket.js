import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// Falls back to the vite proxy target in development
const WS_URL = import.meta.env.VITE_WS_URL ?? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

export function useWebSocket({ onEvent } = {}) {
  const qc = useQueryClient();
  const wsRef = useRef(null);
  const timerRef = useRef(null);
  // Stable ref so changing the callback never triggers a reconnect
  const onEventRef = useRef(onEvent);
  useEffect(() => { onEventRef.current = onEvent; });

  useEffect(() => {
    // Only connect when the user is authenticated (cookie is HttpOnly so we
    // use the stored user profile as a proxy for "logged in").
    if (!localStorage.getItem('pos_user')) return;

    let mounted = true;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        // Cookie is sent automatically by the browser on the WS upgrade
        // request — no explicit AUTH message needed.
      };

      ws.onmessage = ({ data }) => {
        try {
          const { event, data: payload } = JSON.parse(data);
          switch (event) {
            case 'NEW_ORDER':
              qc.invalidateQueries({ queryKey: ['kitchen'] });
              qc.invalidateQueries({ queryKey: ['orders'] });
              qc.invalidateQueries({ queryKey: ['tables'] });
              qc.invalidateQueries({ queryKey: ['order-history'] });
              break;
            case 'ORDER_UPDATED':
            case 'ORDER_STATUS_CHANGED':
            case 'ORDER_PREPARING':
            case 'ORDER_READY':
              qc.invalidateQueries({ queryKey: ['kitchen'] });
              qc.invalidateQueries({ queryKey: ['orders'] });
              qc.invalidateQueries({ queryKey: ['order-history'] });
              break;
            case 'PAYMENT_COMPLETED':
              qc.invalidateQueries({ queryKey: ['orders'] });
              qc.invalidateQueries({ queryKey: ['tables'] });
              qc.invalidateQueries({ queryKey: ['reports'] });
              qc.invalidateQueries({ queryKey: ['order-history'] });
              qc.invalidateQueries({ queryKey: ['loyalty-customers'] });
              // A freed table changes every waiting party's ETA.
              qc.invalidateQueries({ queryKey: ['waitlist'] });
              break;
            case 'TABLE_UPDATED':
              qc.invalidateQueries({ queryKey: ['tables'] });
              qc.invalidateQueries({ queryKey: ['reservations'] });
              qc.invalidateQueries({ queryKey: ['waitlist'] });
              break;
            case 'WAITLIST_UPDATED':
            case 'WAITLIST_NOTIFY':
              qc.invalidateQueries({ queryKey: ['waitlist'] });
              break;
            case 'RESERVATION_REMINDER':
              qc.invalidateQueries({ queryKey: ['reservations'] });
              qc.invalidateQueries({ queryKey: ['tables'] });
              break;
            case 'STAFF_ASSIGNED':
              qc.invalidateQueries({ queryKey: ['orders'] });
              qc.invalidateQueries({ queryKey: ['tables'] });
              break;
            case 'SETTINGS_UPDATED':
              qc.invalidateQueries({ queryKey: ['settings'] });
              break;
            case 'ITEM_VOIDED':
            case 'ITEM_WASTED':
              qc.invalidateQueries({ queryKey: ['kitchen'] });
              qc.invalidateQueries({ queryKey: ['orders'] });
              qc.invalidateQueries({ queryKey: ['wastage-reviews'] });
              break;
            case 'USER_PRESENCE':
              qc.invalidateQueries({ queryKey: ['users'] });
              qc.invalidateQueries({ queryKey: ['me'] });
              break;
          }
          onEventRef.current?.(event, payload ?? {});
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mounted) return;
        timerRef.current = setTimeout(() => {
          if (localStorage.getItem('pos_user')) connect();
        }, 5000);
      };

      ws.onerror = () => {
        // Suppress console error — onclose fires next and handles reconnect
        ws.onclose = null;
        ws.close();
        if (mounted) {
          timerRef.current = setTimeout(() => {
            if (localStorage.getItem('pos_user')) connect();
          }, 5000);
        }
      };
    }

    connect();

    return () => {
      mounted = false;
      clearTimeout(timerRef.current);
      const ws = wsRef.current;
      if (!ws) return;
      // StrictMode double-invoke: if the socket hasn't opened yet, set a
      // no-op onclose so the reconnect timer never fires for the phantom mount.
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    };
  }, [qc]);
}