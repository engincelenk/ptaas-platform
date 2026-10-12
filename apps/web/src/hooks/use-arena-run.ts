'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  arenaLiveReducer,
  initialLiveState,
  latestAttemptTimestamp,
  parseArenaEvent,
  type ArenaLiveState,
} from '@/lib/arena-logic';
import type { ArenaAttemptView } from '@/lib/arena-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const POLL_INTERVAL_MS = 3000;
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

export type ArenaConnection = 'idle' | 'connecting' | 'live' | 'polling';

interface UseArenaRunOptions {
  runId: string;
  /** Stream only while the run is active. */
  streamEnabled: boolean;
  /** Called whenever the server reports a status change or the run finished. */
  onStatusChange?: () => void;
}

/**
 * Live state of an arena run: SSE (ticket-based) with automatic reconnect and a
 * polling fallback on `GET /runs/:id/attempts?after=`.
 */
export function useArenaRun({ runId, streamEnabled, onStatusChange }: UseArenaRunOptions): {
  live: ArenaLiveState;
  connection: ArenaConnection;
  loadingInitial: boolean;
  initialError: string | null;
} {
  const [live, dispatch] = useReducer(arenaLiveReducer, initialLiveState);
  const [connection, setConnection] = useState<ArenaConnection>('idle');
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);

  const liveRef = useRef(live);
  liveRef.current = live;
  const statusCbRef = useRef(onStatusChange);
  statusCbRef.current = onStatusChange;

  // Initial transcript load (also for finished runs).
  useEffect(() => {
    let cancelled = false;
    dispatch({ kind: 'reset' });
    setLoadingInitial(true);
    setInitialError(null);
    apiClient
      .get<ArenaAttemptView[]>(`/arena/runs/${encodeURIComponent(runId)}/attempts`)
      .then((attempts) => {
        if (!cancelled) dispatch({ kind: 'attempts', attempts });
      })
      .catch((e: unknown) => {
        if (!cancelled) setInitialError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
      })
      .finally(() => {
        if (!cancelled) setLoadingInitial(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const poll = useCallback(async () => {
    const after = latestAttemptTimestamp(liveRef.current.attempts);
    const qs = after ? `?after=${encodeURIComponent(after)}` : '';
    try {
      const attempts = await apiClient.get<ArenaAttemptView[]>(
        `/arena/runs/${encodeURIComponent(runId)}/attempts${qs}`,
      );
      if (attempts.length > 0) dispatch({ kind: 'attempts', attempts });
    } catch {
      // Keep trying on the next tick.
    }
  }, [runId]);

  useEffect(() => {
    if (!streamEnabled) {
      setConnection('idle');
      return;
    }
    let disposed = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;

    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };

    const startPolling = () => {
      if (pollTimer) return;
      void poll();
      pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(failures, 4));
      failures += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (disposed) return;
      setConnection('connecting');
      try {
        const { ticket } = await apiClient.post<{ ticket: string; expiresAt: string }>(
          `/arena/runs/${encodeURIComponent(runId)}/stream-ticket`,
        );
        if (disposed) return;
        const url = `${API_BASE}/api/v1/arena/runs/${encodeURIComponent(runId)}/stream?ticket=${encodeURIComponent(ticket)}`;
        es = new EventSource(url);
        es.onopen = () => {
          failures = 0;
          stopPolling();
          setConnection('live');
          // Close any gap that occurred while disconnected.
          void poll();
        };
        es.onmessage = (msg: MessageEvent) => {
          const ev = parseArenaEvent(String(msg.data));
          if (!ev) return;
          dispatch({ kind: 'event', event: ev });
          if (ev.type === 'run.status' || ev.type === 'done') statusCbRef.current?.();
          if (ev.type === 'done') {
            disposed = true;
            es?.close();
            stopPolling();
            setConnection('idle');
          }
        };
        es.onerror = () => {
          es?.close();
          es = null;
          if (disposed) return;
          setConnection('polling');
          startPolling();
          scheduleReconnect();
        };
      } catch {
        if (disposed) return;
        setConnection('polling');
        startPolling();
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      disposed = true;
      es?.close();
      stopPolling();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [runId, streamEnabled, poll]);

  return { live, connection, loadingInitial, initialError };
}
