'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Activity, RefreshCw } from 'lucide-react';

type ActivityCategory = 'scan' | 'finding' | 'evidence' | 'scope' | 'engagement' | 'risk' | 'retest' | 'other';

interface ActivityEvent {
  id: string;
  category: ActivityCategory;
  type: string;
  title: string;
  detail: string | null;
  actor: string | null;
  actorInitials: string | null;
  link: string | null;
  timestamp: string;
}

const CATEGORY_META: Record<ActivityCategory, { icon: string; color: string; bg: string }> = {
  scan:       { icon: '🔍', color: 'text-blue-700',   bg: 'bg-blue-100'   },
  finding:    { icon: '🚨', color: 'text-red-700',    bg: 'bg-red-100'    },
  evidence:   { icon: '📎', color: 'text-gray-700',   bg: 'bg-gray-100'   },
  scope:      { icon: '🎯', color: 'text-indigo-700', bg: 'bg-indigo-100' },
  engagement: { icon: '📄', color: 'text-violet-700', bg: 'bg-violet-100' },
  risk:       { icon: '🛡️', color: 'text-orange-700', bg: 'bg-orange-100' },
  retest:     { icon: '✅', color: 'text-green-700',  bg: 'bg-green-100'  },
  other:      { icon: '🔔', color: 'text-gray-600',   bg: 'bg-gray-100'   },
};

const CATEGORIES: { key: ActivityCategory | 'all'; label: string }[] = [
  { key: 'all',       label: 'All'        },
  { key: 'scan',      label: 'Scans'      },
  { key: 'finding',   label: 'Findings'   },
  { key: 'retest',    label: 'Retests'    },
  { key: 'evidence',  label: 'Evidence'   },
  { key: 'scope',     label: 'Scope'      },
  { key: 'engagement',label: 'Engagement' },
  { key: 'risk',      label: 'Risk'       },
];

function dayLabel(iso: string): string {
  const d   = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.setHours(0,0,0,0) - d.setHours(0,0,0,0)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return `${diff} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function timeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function groupByDay(events: ActivityEvent[]): Map<string, ActivityEvent[]> {
  const map = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const label = dayLabel(e.timestamp);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(e);
  }
  return map;
}

function ActorBubble({ initials }: { initials: string }) {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-200 text-[9px] font-bold text-indigo-800">
      {initials}
    </span>
  );
}

export default function ActivityPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [events, setEvents]     = useState<ActivityEvent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]     = useState<ActivityCategory | 'all'>('all');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    const data = await apiClient.get<ActivityEvent[]>(`/projects/${projectId}/activity?limit=100`)
      .catch(() => [] as ActivityEvent[])
      .finally(() => { setLoading(false); setRefreshing(false); });
    setEvents(data);
  }, [projectId]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(true), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  const filtered = filter === 'all' ? events : events.filter((e) => e.category === filter);
  const grouped  = groupByDay(filtered);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-indigo-500" />
          <h1 className="text-2xl font-bold text-gray-900">Activity Feed</h1>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === key
                ? 'border-indigo-500 bg-indigo-600 text-white'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {key !== 'all' && <span className="mr-1">{CATEGORY_META[key as ActivityCategory].icon}</span>}
            {label}
            {key === 'all' && events.length > 0 && (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                {events.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="animate-pulse space-y-6">
          {[...Array(3)].map((_, gi) => (
            <div key={gi} className="space-y-3">
              <div className="h-4 w-24 rounded bg-gray-100" />
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-gray-100 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-48 rounded bg-gray-100" />
                    <div className="h-3 w-32 rounded bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
            <Activity className="h-7 w-7 text-gray-400" />
          </div>
          <div>
            <p className="font-medium text-gray-700">
              {filter === 'all' ? 'No activity yet' : `No ${filter} activity`}
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Events will appear here as the project progresses.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {[...grouped.entries()].map(([day, dayEvents]) => (
            <div key={day}>
              {/* Day header */}
              <div className="mb-4 flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{day}</span>
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-300">{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Events */}
              <div className="relative space-y-0">
                {/* Vertical line */}
                <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-100" />

                {dayEvents.map((e, i) => {
                  const meta = CATEGORY_META[e.category];
                  const isLast = i === dayEvents.length - 1;

                  return (
                    <div key={e.id} className={`relative flex gap-4 ${isLast ? '' : 'pb-5'}`}>
                      {/* Icon bubble */}
                      <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.bg} text-sm shadow-sm ring-2 ring-white`}>
                        {meta.icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-1">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${meta.color}`}>{e.title}</p>
                            {e.detail && (
                              <p className="mt-0.5 text-xs text-gray-500 truncate max-w-md">{e.detail}</p>
                            )}
                            <div className="mt-1 flex items-center gap-2 flex-wrap">
                              {e.actor && (
                                <span className="flex items-center gap-1 text-xs text-gray-400">
                                  {e.actorInitials && <ActorBubble initials={e.actorInitials} />}
                                  {e.actor}
                                </span>
                              )}
                              <span className="text-xs text-gray-300">{timeStr(e.timestamp)}</span>
                              {e.link && (
                                <Link
                                  href={e.link}
                                  className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline transition-colors"
                                >
                                  View →
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
