'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface UseApiQueryReturn<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Minimal GET data loader on top of apiClient (no extra dependency).
 * Pass `null` as path to skip fetching (e.g. while a required id is missing).
 */
export function useApiQuery<T>(path: string | null): UseApiQueryReturn<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(path !== null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (path === null) {
      setData(undefined);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    apiClient
      .get<T>(path)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, isLoading, error };
}
