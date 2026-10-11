'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X } from 'lucide-react';

interface OnboardingStatus {
  hasOrg: boolean;
  hasProject: boolean;
  hasTarget: boolean;
  hasScan: boolean;
  hasFinding: boolean;
  completedSteps: number;
  totalSteps: number;
  isComplete: boolean;
}

const CHECKLIST = [
  { key: 'hasOrg',     label: 'Organization created',           href: null },
  { key: 'hasProject', label: 'Create your first project',      href: '/projects/new' },
  { key: 'hasTarget',  label: 'Add a target to scan',           href: null },
  { key: 'hasScan',    label: 'Run your first scan',            href: null },
  { key: 'hasFinding', label: 'Review your first findings',     href: null },
] as const;

const DISMISSED_KEY = 'ptaas_checklist_dismissed';

export function GettingStartedChecklist() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISSED_KEY)) {
      setDismissed(true);
      return;
    }
    apiClient
      .get<OnboardingStatus>('/onboarding/status')
      .then((s) => {
        setStatus(s);
        if (s.isComplete) setDismissed(true);
      })
      .catch(() => setDismissed(true));
  }, []);

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  }

  if (dismissed || !status || status.isComplete) return null;

  const pct = Math.round((status.completedSteps / status.totalSteps) * 100);

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-muted/30">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Getting started</span>
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">{status.completedSteps}/{status.totalSteps}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCollapsed((c) => !c)} className="rounded p-1 hover:bg-muted">
            {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
          </button>
          <button onClick={handleDismiss} className="rounded p-1 hover:bg-muted" title="Dismiss">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Steps */}
      {!collapsed && (
        <div className="divide-y">
          {CHECKLIST.map(({ key, label, href }) => {
            const done = status[key as keyof OnboardingStatus] as boolean;
            return (
              <div key={key} className={`flex items-center gap-3 px-5 py-3 ${done ? 'opacity-50' : ''}`}>
                {done
                  ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                }
                {href && !done ? (
                  <a href={href} className="text-sm hover:underline text-primary">{label}</a>
                ) : (
                  <span className="text-sm">{label}</span>
                )}
                {done && <span className="ml-auto text-xs text-green-600 font-medium">Done</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
