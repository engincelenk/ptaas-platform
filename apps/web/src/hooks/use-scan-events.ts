'use client';

import { useEffect, useRef, useState } from 'react';

export type ScanEventType = 'progress' | 'status' | 'terminal' | 'error';

export interface ScanEvent {
  type: ScanEventType;
  status: string;
  progress: number;
  currentActivity: string | null;
  findingsCount: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CriticalFindingEvent {
  findingId: string;
  title: string;
  severity: string;
}

interface UseScanEventsOptions {
  projectId: string;
  scanId: string;
  token: string | null;
  enabled?: boolean;
  onCriticalFinding?: (finding: CriticalFindingEvent) => void;
}

export function useScanEvents({
  projectId,
  scanId,
  token,
  enabled = true,
  onCriticalFinding,
}: UseScanEventsOptions) {
  const [event, setEvent] = useState<ScanEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !token || !scanId) return;

    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/scans/${scanId}/events`;

    // SSE requires token in query param since EventSource doesn't support headers
    const es = new EventSource(`${url}?token=${encodeURIComponent(token)}`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e: MessageEvent) => {
      try {
        const data: ScanEvent = JSON.parse(e.data as string);
        setEvent(data);

        // Terminal state — close the connection
        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(data.status)) {
          es.close();
          setConnected(false);
        }
      } catch {
        // ignore parse errors
      }
    };

    es.addEventListener('finding.critical.discovered', (e: Event) => {
      try {
        const data: CriticalFindingEvent = JSON.parse((e as MessageEvent).data as string);
        onCriticalFinding?.(data);
      } catch {
        // ignore
      }
    });

    es.onerror = () => {
      setConnected(false);
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [enabled, token, projectId, scanId, onCriticalFinding]);

  return { event, connected };
}
