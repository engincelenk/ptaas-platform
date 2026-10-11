'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/settings/profile', label: '👤 Profile' },
  { href: '/settings/members', label: '👥 Members' },
  { href: '/settings/api-keys', label: '🔑 API Keys' },
  { href: '/settings/scan-policies', label: '🛡️ Scan Policies' },
  { href: '/settings/webhooks', label: '⚡ Webhooks' },
  { href: '/settings/integrations', label: '🔗 Integrations' },
  { href: '/settings/tags', label: '🏷️ Finding Tags' },
  { href: '/settings/sla', label: '⏱️ SLA Policy' },
  { href: '/settings/notifications', label: '🔔 Notifications' },
  { href: '/settings/audit', label: '📋 Audit Log' },
  { href: '/settings/email-templates', label: '✉️ Email Templates' },
  { href: '/settings/sso', label: '🔐 SSO / SAML' },
  { href: '/settings/security', label: '🔒 Security' },
  { href: '/settings/sessions', label: '🖥️ Sessions' },
  { href: '/settings/branding', label: '🎨 Branding' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col md:flex-row gap-6 md:gap-8">
      {/* Mobile: horizontal scrollable tab strip */}
      <nav className="md:hidden flex gap-1 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-full border transition-colors shrink-0 ${
              pathname === item.href
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Desktop: sidebar */}
      <nav className="hidden md:block w-44 shrink-0 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Settings</p>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block text-sm px-3 py-2 rounded-md transition-colors ${
              pathname === item.href
                ? 'bg-accent text-accent-foreground font-medium'
                : 'hover:bg-muted'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
