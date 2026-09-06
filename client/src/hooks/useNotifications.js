import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useSocket } from './useSocket.js';

/**
 * The notification centre.
 *
 * Loaded once and then kept current by the socket, so a reminder firing while
 * the tab is open appears without polling. The list is also refetched on
 * reconnect, because anything that arrived while the connection was down was
 * pushed to nobody.
 */
export function useNotifications({ enabled = true, onIncoming } = {}) {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await api.notifications();
      setNotifications(res.notifications);
      setUnread(res.unread);
    } catch {
      // A failed poll is not worth interrupting the user over.
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const { connected } = useSocket({
    enabled,
    handlers: {
      'notification:new': (notification) => {
        setNotifications((current) => [notification, ...current].slice(0, 50));
        setUnread((n) => n + 1);
        onIncoming?.(notification);
      },
    },
  });

  useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  return {
    notifications,
    unread,
    reload: load,
    async markRead(id) {
      const res = await api.markNotificationRead(id);
      setNotifications(res.notifications);
      setUnread(res.unread);
    },
    async markAllRead() {
      const res = await api.markAllNotificationsRead();
      setNotifications(res.notifications);
      setUnread(res.unread);
    },
    async clear() {
      await api.clearNotifications();
      setNotifications([]);
      setUnread(0);
    },
  };
}
