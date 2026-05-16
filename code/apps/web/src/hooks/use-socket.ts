'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@clerk/nextjs';
import { useQueryClient } from '@tanstack/react-query';

const DEV_MODE = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001';
const DEV_TENANT_ID = 'dev-tenant-001';

interface ScanStatusEvent {
  scanId: string;
  projectId: string;
  status: string;
  completedAt?: string;
}

interface ScanFindingEvent {
  scanId: string;
  projectId: string;
  finding: { id: string; title: string; severity: string };
}

export function useSocket() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Nur verbinden wenn User angemeldet (oder Dev-Modus)
    if (!DEV_MODE && !userId) return;

    const socket = io(WS_URL, {
      auth: { tenantId: DEV_MODE ? DEV_TENANT_ID : undefined },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    // ── Scan-Status aktualisiert ───────────────────────────────────────────
    socket.on('scan:status_updated', (data: ScanStatusEvent) => {
      // Scans-Liste für dieses Projekt neu laden
      queryClient.invalidateQueries({
        queryKey: ['projects', data.projectId, 'scans'],
      });
      // Dashboard Stats neu laden
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
    });

    // ── Neues Finding vom Scanner ──────────────────────────────────────────
    socket.on('scan:finding_created', (data: ScanFindingEvent) => {
      // Findings-Liste invalidieren
      queryClient.invalidateQueries({
        queryKey: ['findings', { projectId: data.projectId }],
      });
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      // Dashboard Stats und Projekt-Counts
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    });

    // ── Scan in Queue ──────────────────────────────────────────────────────
    socket.on('scan:queued', (data: { scanId: string; projectId: string }) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', data.projectId, 'scans'],
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, queryClient]);

  return socketRef.current;
}
