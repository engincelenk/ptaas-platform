'use client';

import { useEffect, useState } from 'react';
import { parseRoleFromToken } from '@/lib/arena-logic';

/** Reads the role of the current user from the existing access token (client only). */
export function useArenaRole(): string | null {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    setRole(parseRoleFromToken(localStorage.getItem('ptaas_access_token')));
  }, []);
  return role;
}
