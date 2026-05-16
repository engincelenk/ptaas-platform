'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export type ScanStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type ScanType = 'FULL' | 'WEB_ONLY' | 'SSL_ONLY' | 'PORTS_ONLY';

export interface Scan {
  id: string;
  projectId: string;
  type: ScanType;
  status: ScanStatus;
  createdAt: string;
  completedAt?: string;
  _count?: { findings: number };
}

export function useScans(projectId: string) {
  return useQuery<Scan[]>({
    queryKey: ['projects', projectId, 'scans'],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/scans`);
      return data;
    },
    enabled: !!projectId,
  });
}

export function useCreateScan(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: { type: ScanType }) => {
      const { data } = await api.post(`/projects/${projectId}/scans`, dto);
      return data as Scan;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'scans'] }),
  });
}

export function useCancelScan(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (scanId: string) => {
      await api.patch(`/projects/${projectId}/scans/${scanId}/cancel`);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'scans'] }),
  });
}
