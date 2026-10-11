'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Building2, Check } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiClient } from '@/lib/api-client';

interface OrgEntry {
  role: string;
  organization: { id: string; name: string; slug: string };
}

export function OrgSwitcher({ currentOrgId }: { currentOrgId?: string }) {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgEntry[]>([]);
  const [current, setCurrent] = useState<OrgEntry | null>(null);

  useEffect(() => {
    apiClient.get<OrgEntry[]>('/auth/me/organizations').then((data) => {
      setOrgs(data);
      setCurrent(data.find((o) => o.organization.id === currentOrgId) ?? data[0] ?? null);
    }).catch(() => {});
  }, [currentOrgId]);

  const switchOrg = async (orgId: string) => {
    try {
      const { accessToken } = await apiClient.post<{ accessToken: string }>(
        `/auth/switch-org/${orgId}`,
      );
      localStorage.setItem('ptaas_access_token', accessToken);
      router.refresh();
      router.push('/dashboard');
    } catch {
      /* ignore */
    }
  };

  if (orgs.length <= 1 || !current) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 text-sm font-medium hover:opacity-80 transition-opacity outline-none">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        {current.organization.name}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {orgs.map((o) => (
          <DropdownMenuItem
            key={o.organization.id}
            onClick={() => switchOrg(o.organization.id)}
            className="flex items-center justify-between"
          >
            <span>{o.organization.name}</span>
            {o.organization.id === current.organization.id && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/settings/members" className="text-xs text-muted-foreground">
            Manage members →
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
