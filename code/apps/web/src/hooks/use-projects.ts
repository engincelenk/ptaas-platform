'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface Project {
  id: string;
  name: string;
  description?: string;
  targets: string[];
  createdAt: string;
  _count?: { scans: number; findings: number };
}

export interface CreateProjectDto {
  name: string;
  description?: string;
  targets: string[];
}

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await api.get('/projects');
      return data;
    },
  });
}

export function useProject(id: string) {
  return useQuery<Project>({
    queryKey: ['projects', id],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateProjectDto) => {
      const { data } = await api.post('/projects', dto);
      return data as Project;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/projects/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}
