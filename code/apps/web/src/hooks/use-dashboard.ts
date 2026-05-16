'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface DashboardStats {
  critical: number;
  high: number;
  medium: number;
  low: number;
  openFindings: number;
  totalProjects: number;
  activeScans: number;
  resolvedFindings: number;
}

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const { data } = await api.get('/findings/stats');
      return data;
    },
  });
}
