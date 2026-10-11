'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { Clock, Plus, Trash2, Play, Pause, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Target { id: string; value: string; type: string; }
interface Schedule {
  id: string;
  targetId: string;
  scanType: string;
  cronExpr: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  target: { id: string; value: string; type: string };
  createdBy: { id: string; name: string };
}

const SCAN_TYPES = ['QUICK', 'FULL', 'AUTHENTICATED'] as const;

const PRESETS = [
  { label: 'Every hour',    cron: '0 * * * *'   },
  { label: 'Daily 02:00',   cron: '0 2 * * *'   },
  { label: 'Every Monday',  cron: '0 2 * * 1'   },
  { label: 'Monthly 1st',   cron: '0 3 1 * *'   },
];

function humanCron(expr: string): string {
  const presetMatch = PRESETS.find((p) => p.cron === expr);
  if (presetMatch) return presetMatch.label;
  const [min, hour, dom, , dow] = expr.split(' ');
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  if (dom === '*' && dow !== '*') return `Every ${days[parseInt(dow)] ?? 'day'} at ${hour.padStart(2,'0')}:${min.padStart(2,'0')}`;
  if (dom !== '*') return `Monthly on day ${dom} at ${hour.padStart(2,'0')}:${min.padStart(2,'0')}`;
  if (min === '0' && hour !== '*') return `Daily at ${hour.padStart(2,'0')}:00`;
  return expr;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  const abs  = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hrs  = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const past = diff < 0;
  if (mins < 2)   return past ? 'just now' : 'in a moment';
  if (mins < 60)  return past ? `${mins}m ago` : `in ${mins}m`;
  if (hrs < 24)   return past ? `${hrs}h ago` : `in ${hrs}h`;
  return past ? `${days}d ago` : `in ${days}d`;
}

export default function SchedulesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [targets, setTargets]     = useState<Target[]>([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [saving, setSaving]       = useState(false);

  const [form, setForm] = useState({
    targetId: '', scanType: 'QUICK' as string,
    cronExpr: '0 2 * * 1', customCron: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [scheds, tgts] = await Promise.all([
      apiClient.get<Schedule[]>(`/projects/${projectId}/scan-schedules`),
      apiClient.get<Target[]>(`/projects/${projectId}/targets`),
    ]).finally(() => setLoading(false));
    setSchedules(scheds);
    setTargets(tgts);
    if (tgts.length > 0 && !form.targetId) setForm((f) => ({ ...f, targetId: tgts[0].id }));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    setSaving(true);
    try {
      await apiClient.post(`/projects/${projectId}/scan-schedules`, {
        targetId: form.targetId,
        scanType: form.scanType,
        cronExpr: form.cronExpr,
      });
      toast.success('Schedule created');
      setCreating(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to create schedule');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(s: Schedule) {
    await apiClient.patch(`/projects/${projectId}/scan-schedules/${s.id}`, { isActive: !s.isActive });
    toast.success(s.isActive ? 'Schedule paused' : 'Schedule resumed');
    await load();
  }

  async function remove(s: Schedule) {
    if (!confirm(`Delete schedule for ${s.target.value}?`)) return;
    await apiClient.delete(`/projects/${projectId}/scan-schedules/${s.id}`);
    toast.success('Schedule deleted');
    await load();
  }

  const verifiedTargets = targets.filter((t) => (t as any).verificationStatus === 'VERIFIED');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-indigo-500" />
          <h1 className="text-2xl font-bold text-gray-900">Scan Schedules</h1>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> New Schedule
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-indigo-700">New Recurring Schedule</h2>

          {verifiedTargets.length === 0 ? (
            <p className="text-sm text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2">
              No verified targets available. Verify at least one target before scheduling scans.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-600">Target</label>
                  <select
                    value={form.targetId}
                    onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  >
                    {verifiedTargets.map((t) => <option key={t.id} value={t.id}>{t.value}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-600">Scan Type</label>
                  <select
                    value={form.scanType}
                    onChange={(e) => setForm((f) => ({ ...f, scanType: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  >
                    {SCAN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Schedule</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.cron}
                      onClick={() => setForm((f) => ({ ...f, cronExpr: p.cron, customCron: false }))}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        form.cronExpr === p.cron && !form.customCron
                          ? 'border-indigo-500 bg-indigo-600 text-white'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setForm((f) => ({ ...f, customCron: true }))}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      form.customCron
                        ? 'border-indigo-500 bg-indigo-600 text-white'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Custom…
                  </button>
                </div>

                {form.customCron && (
                  <div>
                    <input
                      value={form.cronExpr}
                      onChange={(e) => setForm((f) => ({ ...f, cronExpr: e.target.value }))}
                      placeholder="min hour dom mon dow  (e.g. 0 3 * * 1-5)"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-gray-400">5-field cron: minute hour day-of-month month day-of-week</p>
                  </div>
                )}

                {form.cronExpr && (
                  <p className="mt-1.5 text-xs text-indigo-600 font-medium">
                    → {humanCron(form.cronExpr)}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={create}
                  disabled={!form.targetId || !form.cronExpr || saving}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Creating…' : 'Create Schedule'}
                </button>
                <button
                  onClick={() => setCreating(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Schedule list */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-gray-100" />)}
        </div>
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
            <Clock className="h-7 w-7 text-gray-400" />
          </div>
          <div>
            <p className="font-medium text-gray-700">No schedules yet</p>
            <p className="mt-1 text-sm text-gray-400">
              Automate recurring scans — daily, weekly, or monthly — without manual intervention.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-4 rounded-xl border bg-white px-4 py-3 shadow-sm transition-colors ${
                s.isActive ? 'border-gray-100' : 'border-gray-100 opacity-60'
              }`}
            >
              {/* Status dot */}
              <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 text-sm truncate">{s.target.value}</span>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                    {s.scanType}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-400">
                  <span className="font-mono">{s.cronExpr}</span>
                  <span>·</span>
                  <span>{humanCron(s.cronExpr)}</span>
                </div>
              </div>

              {/* Next / Last run */}
              <div className="shrink-0 text-right hidden sm:block">
                <p className="text-xs text-gray-400">Next run</p>
                <p className="text-sm font-medium text-gray-700">{relativeTime(s.nextRunAt)}</p>
                {s.lastRunAt && (
                  <p className="text-xs text-gray-400">Last: {relativeTime(s.lastRunAt)}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => toggle(s)}
                  title={s.isActive ? 'Pause' : 'Resume'}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  {s.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => remove(s)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Schedules are evaluated every minute. Targets must be verified before they can be scheduled.
      </p>
    </div>
  );
}
