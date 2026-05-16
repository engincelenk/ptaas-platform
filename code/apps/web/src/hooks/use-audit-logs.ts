'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface AuditLog {
  id: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  createdAt: string;
  user?: { email: string; role: string } | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

export function useAuditLogs(opts: { limit?: number; offset?: number; resource?: string } = {}) {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  if (opts.resource) params.set('resource', opts.resource);

  return useQuery<AuditLogsResponse>({
    queryKey: ['audit-logs', opts],
    queryFn: async () => {
      const { data } = await api.get(`/audit-logs?${params.toString()}`);
      return data;
    },
  });
}
