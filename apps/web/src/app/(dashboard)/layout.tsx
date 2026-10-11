'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { OrgSwitcher } from '@/components/org-switcher';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { WelcomeModal } from '@/components/onboarding/welcome-modal';
import { GlobalSearch, SearchTrigger } from '@/components/search/global-search';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { apiClient } from '@/lib/api-client';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/analytics', label: 'Analytics' },
  { href: '/dashboard/posture', label: 'Posture' },
  { href: '/dashboard/retests', label: 'Retests' },
  { href: '/dashboard/scan-queue', label: 'Scan-Queue' },
  { href: '/projects', label: 'Projects' },
  { href: '/assets', label: 'Assets' },
  { href: '/sla', label: 'SLA' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/threat-brief', label: 'Threat Intel' },
  { href: '/compliance', label: 'Compliance' },
  { href: '/settings/members', label: 'Settings' },
];

const WELCOME_SHOWN_KEY = 'ptaas_welcome_shown';

function parseJwt(token: string): Record<string, any> | null {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [orgId, setOrgId] = useState<string | undefined>();
  const [showWelcome, setShowWelcome] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('ptaas_access_token');
    if (!token) { router.replace('/login'); return; }
    const payload = parseJwt(token);
    if (payload?.orgId) setOrgId(payload.orgId);

    // Show welcome modal only once, only if org has no projects
    if (!localStorage.getItem(WELCOME_SHOWN_KEY)) {
      apiClient
        .get<{ isComplete: boolean; hasProject: boolean }>('/onboarding/status')
        .then((s) => {
          if (!s.hasProject) setShowWelcome(true);
          localStorage.setItem(WELCOME_SHOWN_KEY, '1');
        })
        .catch(() => {});
    }
  }, [router]);

  function handleLogout() {
    localStorage.removeItem('ptaas_access_token');
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex items-center justify-between h-14">
          {/* Logo + desktop nav */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-primary flex items-center justify-center shrink-0">
                <span className="text-primary-foreground font-bold text-xs">P</span>
              </div>
              <span className="font-semibold text-sm">PTaaS</span>
            </div>
            <div className="hidden lg:block">
              <OrgSwitcher currentOrgId={orgId} />
            </div>
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    pathname === href || pathname.startsWith(href + '/')
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block w-36 lg:w-48">
              <SearchTrigger />
            </div>
            <ThemeToggle />
            <NotificationBell />
            <button
              onClick={handleLogout}
              className="hidden sm:block text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign out
            </button>
            {/* Hamburger */}
            <button
              className="md:hidden p-1.5 rounded-md hover:bg-accent transition-colors"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border bg-card px-4 pb-4 space-y-1">
            <div className="pt-3 pb-2">
              <OrgSwitcher currentOrgId={orgId} />
            </div>
            <div className="pb-2">
              <SearchTrigger />
            </div>
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                  pathname === href || pathname.startsWith(href + '/')
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                {label}
              </Link>
            ))}
            <Link
              href="/notifications"
              onClick={() => setMobileOpen(false)}
              className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                pathname === '/notifications'
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
            >
              🔔 Notifications
            </Link>
            <button
              onClick={() => { setMobileOpen(false); handleLogout(); }}
              className="block w-full text-left px-3 py-2 rounded-md text-sm text-destructive hover:bg-accent/50 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">{children}</main>

      {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}
      <GlobalSearch />
    </div>
  );
}
