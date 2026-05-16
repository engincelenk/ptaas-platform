'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';
import { configureApiAuth } from '@/lib/api';

export function useApiAuth() {
  const { getToken } = useAuth();

  useEffect(() => {
    configureApiAuth(() => getToken());
  }, [getToken]);
}
