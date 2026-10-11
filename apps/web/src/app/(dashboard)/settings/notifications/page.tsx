'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Bell, Save } from 'lucide-react';
import { toast } from 'sonner';

interface NotifPref {
  type: string;
  label: string;
  description: string;
  enabled: boolean;
  defaultEnabled: boolean;
}

const GROUP_LABELS: Record<string, { title: string; icon: string }> = {
  'scan.completed':           { title: 'Scans',           icon: '🔍' },
  'finding.critical':         { title: 'Findings',        icon: '🚨' },
  'finding.kev':              { title: 'Findings',        icon: '🚨' },
  'retest.passed':            { title: 'Retests',         icon: '✅' },
  'retest.failed':            { title: 'Retests',         icon: '✅' },
  'SLA_BREACH':               { title: 'SLA',             icon: '⏱️' },
  'RISK_ACCEPTANCE_EXPIRING': { title: 'Risk Acceptance', icon: '🛡️' },
  'SCHEDULE_SCAN_FAILED':     { title: 'Schedules',       icon: '🕐' },
  'ENGAGEMENT_SIGNED':        { title: 'Engagement',      icon: '📄' },
  'EVIDENCE_UPLOADED':        { title: 'Evidence',        icon: '📎' },
  'FINDING_TAGGED':           { title: 'Tags',            icon: '🏷️' },
  'invitation':               { title: 'Team',            icon: '👥' },
};

function groupPrefs(prefs: NotifPref[]): Map<string, NotifPref[]> {
  const map = new Map<string, NotifPref[]>();
  for (const p of prefs) {
    const group = GROUP_LABELS[p.type]?.title ?? 'Other';
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(p);
  }
  return map;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
        checked ? 'bg-indigo-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function NotificationSettingsPage() {
  const [prefs, setPrefs]   = useState<NotifPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await apiClient.get<NotifPref[]>('/notifications/preferences').finally(() => setLoading(false));
    setPrefs(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggle(type: string) {
    setPrefs((prev) => prev.map((p) => p.type === type ? { ...p, enabled: !p.enabled } : p));
  }

  function toggleGroup(title: string, enabled: boolean) {
    const types = new Set(prefs.filter((p) => (GROUP_LABELS[p.type]?.title ?? 'Other') === title).map((p) => p.type));
    setPrefs((prev) => prev.map((p) => types.has(p.type) ? { ...p, enabled } : p));
  }

  async function save() {
    setSaving(true);
    try {
      await apiClient.put('/notifications/preferences', {
        prefs: prefs.map(({ type, enabled }) => ({ type, enabled })),
      });
      toast.success('Notification preferences saved');
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    setPrefs((prev) => prev.map((p) => ({ ...p, enabled: p.defaultEnabled })));
    toast.info('Defaults restored — click Save to apply');
  }

  const groups = groupPrefs(prefs);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="h-6 w-6 text-indigo-500" /> Notification Preferences
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Choose which events trigger in-app notifications. Changes apply immediately after saving.
          </p>
        </div>
        <button
          onClick={resetDefaults}
          className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
        >
          Reset defaults
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-gray-100" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([groupTitle, groupPrefs]) => {
            const groupIcon = GROUP_LABELS[groupPrefs[0]?.type]?.icon ?? '🔔';
            const allEnabled  = groupPrefs.every((p) => p.enabled);
            const someEnabled = groupPrefs.some((p) => p.enabled);

            return (
              <div key={groupTitle} className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                {/* Group header */}
                <div className="flex items-center justify-between border-b border-gray-50 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{groupIcon}</span>
                    <span className="text-sm font-semibold text-gray-700">{groupTitle}</span>
                  </div>
                  <button
                    onClick={() => toggleGroup(groupTitle, !allEnabled)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                  >
                    {allEnabled ? 'Disable all' : someEnabled ? 'Enable all' : 'Enable all'}
                  </button>
                </div>

                {/* Pref rows */}
                <div className="divide-y divide-gray-50">
                  {groupPrefs.map((p) => (
                    <div key={p.type} className="flex items-center justify-between px-5 py-3.5">
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="text-sm font-medium text-gray-900">{p.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{p.description}</p>
                      </div>
                      <Toggle checked={p.enabled} onChange={() => toggle(p.type)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving || loading}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}
