'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface UseNotificationsReturn {
  notifications: Notification[];
  unread: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useNotifications(limit = 20): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const esRef = useRef<EventSource | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await apiClient.get<{ items: Notification[]; unread: number }>(
        `/notifications?limit=${limit}`,
      );
      setNotifications(data.items);
      setUnread(data.unread);
    } catch {
      // network error — keep stale state
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    reload();
  }, [reload]);

  // SSE real-time push
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('ptaas_access_token');
    if (!token) return;

    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    const es = new EventSource(
      `${apiBase}/api/v1/notifications/stream?token=${encodeURIComponent(token)}`,
    );

    es.onmessage = (e) => {
      try {
        const event: Notification = JSON.parse(e.data as string);
        setNotifications((prev) => [{ ...event, readAt: null }, ...prev.slice(0, limit - 1)]);
        setUnread((c) => c + 1);
      } catch {
        // ignore
      }
    };

    esRef.current = es;
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [limit]);

  const markRead = useCallback(async (id: string) => {
    await apiClient.patch(`/notifications/${id}/read`, {});
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    setUnread((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await apiClient.post('/notifications/read-all', {});
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })));
    setUnread(0);
  }, []);

  return { notifications, unread, loading, markRead, markAllRead, reload };
}
