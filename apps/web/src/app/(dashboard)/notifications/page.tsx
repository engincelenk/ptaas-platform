'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bell, CheckCheck, ExternalLink, Settings } from 'lucide-react';
import { useNotifications } from '@/hooks/use-notifications';

const TYPE_ICON: Record<string, string> = {
  'scan.completed':           '✅',
  'finding.critical':         '🚨',
  'retest.passed':            '✔️',
  'retest.failed':            '❌',
  'invitation':               '📩',
  'finding.kev':              '⚠️',
  'SLA_BREACH':               '⏰',
  'RISK_ACCEPTANCE_EXPIRING': '🛡️',
  'SCHEDULE_SCAN_FAILED':     '🕐',
  'ENGAGEMENT_SIGNED':        '📄',
  'EVIDENCE_UPLOADED':        '📎',
  'FINDING_TAGGED':           '🏷️',
};

const TYPE_LABEL: Record<string, string> = {
  'scan.completed':           'Scan Completed',
  'finding.critical':         'Critical Finding',
  'retest.passed':            'Retest Passed',
  'retest.failed':            'Retest Failed',
  'invitation':               'Invitation',
  'finding.kev':              'KEV Alert',
  'SLA_BREACH':               'SLA Breach',
  'RISK_ACCEPTANCE_EXPIRING': 'Risk Acceptance Expiring',
  'SCHEDULE_SCAN_FAILED':     'Scheduled Scan Failed',
  'ENGAGEMENT_SIGNED':        'Engagement Signed',
  'EVIDENCE_UPLOADED':        'Evidence Uploaded',
  'FINDING_TAGGED':           'Finding Tagged',
};

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationsPage() {
  const { notifications, unread, loading, markRead, markAllRead } = useNotifications(50);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const shown = showUnreadOnly ? notifications.filter((n) => !n.readAt) : notifications;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-sm text-gray-500">
              {unread > 0 ? `${unread} unread` : 'All caught up'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUnreadOnly((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showUnreadOnly ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {showUnreadOnly ? 'Show all' : `Unread (${unread})`}
          </button>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
          <Link
            href="/settings/notifications"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" /> Preferences
          </Link>
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden shadow-sm">
        {loading && (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        )}

        {!loading && shown.length === 0 && (
          <div className="py-20 text-center">
            <Bell className="mx-auto mb-3 h-10 w-10 text-gray-200" />
            <p className="text-sm font-medium text-gray-400">
              {showUnreadOnly ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="mt-1 text-xs text-gray-300">
              You'll be notified about scans, findings, and SLA breaches here.
            </p>
          </div>
        )}

        {!loading && shown.map((n) => (
          <div
            key={n.id}
            className={`flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors ${
              !n.readAt ? 'bg-blue-50/30' : ''
            }`}
          >
            {/* Unread dot */}
            <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center">
              {!n.readAt ? (
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
              )}
            </div>

            {/* Icon */}
            <span className="mt-0.5 shrink-0 text-xl" role="img" aria-hidden>
              {TYPE_ICON[n.type] ?? '🔔'}
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-semibold ${!n.readAt ? 'text-gray-900' : 'text-gray-700'}`}>
                  {n.title}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  {TYPE_LABEL[n.type] ?? n.type}
                </span>
              </div>
              {n.body && (
                <p className="mt-1 text-sm text-gray-500">{n.body}</p>
              )}
              <div className="mt-1.5 flex items-center gap-3">
                <span className="text-xs text-gray-400" title={formatDate(n.createdAt)}>
                  {timeAgo(n.createdAt)}
                </span>
                {n.link && (
                  <Link
                    href={n.link}
                    onClick={() => !n.readAt && void markRead(n.id)}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>

            {/* Mark read action */}
            {!n.readAt && (
              <button
                onClick={() => void markRead(n.id)}
                className="shrink-0 rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 transition-colors"
              >
                Mark read
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
