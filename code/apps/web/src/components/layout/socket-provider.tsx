'use client';

import { useSocket } from '@/hooks/use-socket';

/**
 * Mountet die WebSocket-Verbindung einmalig im Dashboard-Layout.
 * Alle Cache-Invalidierungen laufen über den Hook — keine Props nötig.
 */
export function SocketProvider() {
  useSocket();
  return null;
}
