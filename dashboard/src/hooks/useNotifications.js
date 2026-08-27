import { useState, useCallback, useEffect, useRef } from 'react';
import api from '../api/client';

const MAX = 100;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function localKey() {
  try {
    const user = JSON.parse(localStorage.getItem('pos_user') || 'null');
    return `pos_notifications_${user?.id ?? 'anon'}`;
  } catch {
    return 'pos_notifications_anon';
  }
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(localKey());
    if (!raw) return [];
    return JSON.parse(raw).filter((n) => Date.now() - n.ts < TTL_MS);
  } catch {
    return [];
  }
}

function saveLocal(notifications) {
  try {
    localStorage.setItem(localKey(), JSON.stringify(notifications));
  } catch { /* storage full */ }
}

// Merge server rows into local notifications, deduplicating by server id
function mergeServer(local, serverRows) {
  const serverIds = new Set(serverRows.map((r) => r.id));
  const filtered = local.filter((n) => !n.serverId || !serverIds.has(n.serverId));
  const fromServer = serverRows.map((r) => ({
    id: r.id,
    serverId: r.id,
    event: r.event,
    token: r.data?.tableNumber ? `Table ${r.data.tableNumber}` : null,
    ts: new Date(r.created_at).getTime(),
    read: r.read,
  }));
  return [...fromServer, ...filtered]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX);
}

export function useNotifications() {
  const [notifications, setNotifications] = useState(loadLocal);
  const fetchedRef = useRef(false);

  // Load persisted notifications from server on mount
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    if (!localStorage.getItem('pos_user')) return;
    api.get('/notifications').then(({ data }) => {
      setNotifications((prev) => mergeServer(prev, data));
    }).catch(() => { /* offline — use local */ });
  }, []);

  // Persist locally whenever notifications change
  useEffect(() => {
    saveLocal(notifications);
  }, [notifications]);

  const add = useCallback((event, token, channel, meta) => {
    setNotifications((prev) => {
      const isDuplicate = prev.some(
        (n) => n.event === event && n.token === token && Date.now() - n.ts < 2000,
      );
      if (isDuplicate) return prev;
      return [
        { id: Date.now() + Math.random(), event, token: token ?? null, channel: channel ?? null, meta: meta ?? null, ts: Date.now(), read: false },
        ...prev,
      ].slice(0, MAX);
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    api.patch('/notifications/read-all').catch(() => {});
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    api.delete('/notifications').catch(() => {});
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, add, markAllRead, clearAll };
}
