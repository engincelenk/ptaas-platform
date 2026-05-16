'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type FindingStatus = 'OPEN' | 'CONFIRMED' | 'FIXED' | 'WONT_FIX' | 'FALSE_POSITIVE';

export interface Finding {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: FindingStatus;
  cweId?: string;
  cvssScore?: number;
  affectedUrl?: string;
  createdAt: string;
  scan: { id: string; type: string };
  project: { id: string; name: string };
}

export function useFindings(projectId?: string, scanId?: string) {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  if (scanId) params.set('scanId', scanId);

  return useQuery<Finding[]>({
    queryKey: ['findings', { projectId, scanId }],
    queryFn: async () => {
      const { data } = await api.get(`/findings?${params.toString()}`);
      return data;
    },
  });
}

export function useUpdateFinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FindingStatus }) => {
      const { data } = await api.patch(`/findings/${id}`, { status });
      return data as Finding;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['findings'] }),
  });
}
