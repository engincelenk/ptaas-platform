'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Bell, X, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/hooks/use-notifications';

const TYPE_ICON: Record<string, string> = {
  'scan.completed':   '✅',
  'finding.critical': '🚨',
  'retest.passed':    '✔️',
  'retest.failed':    '❌',
  'invitation':       '📩',
  'finding.kev':      '⚠️',
  'sla.breach':       '⏰',
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { notifications, unread, loading, markRead, markAllRead } = useNotifications(20);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ESC closes flyout and returns focus to trigger
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const ariaLabel = unread > 0 ? `Benachrichtigungen (${unread} ungelesen)` : 'Benachrichtigungen';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted transition-colors"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Benachrichtigungen"
          className="absolute right-0 top-11 z-50 w-80 rounded-xl border bg-background shadow-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">
              Notifications
              {unread > 0 && (
                <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-600">
                  {unread}
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 gap-1 text-xs px-2">
                  <CheckCheck className="h-3 w-3" />
                  All read
                </Button>
              )}
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-muted">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {loading && (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="py-10 text-center">
                <Bell className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            )}
            {!loading && notifications.map((n) => (
              <div
                key={n.id}
                className={`flex gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${
                  !n.readAt ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''
                }`}
              >
                <span className="text-base shrink-0 mt-0.5" role="img" aria-hidden>
                  {TYPE_ICON[n.type] ?? '🔔'}
                </span>
                <div className="flex-1 min-w-0">
                  {n.link ? (
                    <Link
                      href={n.link}
                      onClick={() => { void markRead(n.id); setOpen(false); }}
                      className="block text-xs font-medium leading-snug hover:underline"
                    >
                      {n.title}
                    </Link>
                  ) : (
                    <p className="text-xs font-medium leading-snug">{n.title}</p>
                  )}
                  {n.body && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{n.body}</p>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.readAt && (
                  <button
                    onClick={() => void markRead(n.id)}
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500 hover:bg-blue-700 transition-colors"
                    title="Mark as read"
                    aria-label="Mark as read"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t px-4 py-2 text-center">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                View all notifications →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
