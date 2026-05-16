'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import {
  LayoutDashboard,
  FolderOpen,
  ShieldAlert,
  FileText,
  Settings,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projekte', icon: FolderOpen },
  { href: '/findings', label: 'Findings', icon: ShieldAlert },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/scans', label: 'Scans', icon: Activity },
  { href: '/settings', label: 'Einstellungen', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-sm font-bold tracking-tight text-foreground">
          <span className="text-primary">PT</span>aaS
        </span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              pathname === href || pathname.startsWith(href + '/')
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <UserButton afterSignOutUrl="/sign-in" />
          <span className="text-xs text-muted-foreground">Account</span>
        </div>
      </div>
    </aside>
  );
}
