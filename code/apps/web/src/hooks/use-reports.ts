'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface Report {
  id: string;
  projectId: string;
  scanId?: string;
  format: 'PDF' | 'JSON';
  createdAt: string;
}

export function useReports(projectId: string) {
  return useQuery<Report[]>({
    queryKey: ['projects', projectId, 'reports'],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/reports`);
      return data;
    },
    enabled: !!projectId,
  });
}

export function downloadReport(projectId: string, format: 'pdf' | 'json', scanId?: string) {
  const base = process.env.NEXT_PUBLIC_API_URL + '/api/v1';
  const params = new URLSearchParams();
  if (scanId) params.set('scanId', scanId);

  // Direkt per <a> aufrufen — Browser kümmert sich um den Download
  const url = `${base}/projects/${projectId}/reports/download/${format}${params.size > 0 ? '?' + params.toString() : ''}`;

  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
