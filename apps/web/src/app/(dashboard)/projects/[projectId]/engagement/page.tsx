'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import {
  FileText, Download, CheckCircle2, Clock, Edit3, Save, X,
  ShieldCheck, AlertTriangle, Play, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';

type EngType = 'WEB_APP' | 'API' | 'MOBILE' | 'NETWORK' | 'CLOUD' | 'RED_TEAM';
type EngStatus = 'DRAFT' | 'ACTIVE' | 'REVIEW' | 'COMPLETED' | 'CANCELLED';

interface Engagement {
  id: string;
  title: string;
  type: EngType;
  status: EngStatus;
  startDate: string | null;
  endDate: string | null;
  testingHours: number | null;
  roeText: string | null;
  scopeNotes: string | null;
  signedOffAt: string | null;
  signedOffBy: { name: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_META: Record<EngStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  DRAFT:     { label: 'Draft',      color: 'text-gray-600',  bg: 'bg-gray-100',   icon: <Edit3 className="h-4 w-4" /> },
  ACTIVE:    { label: 'Active',     color: 'text-blue-700',  bg: 'bg-blue-100',   icon: <Play className="h-4 w-4" /> },
  REVIEW:    { label: 'In Review',  color: 'text-yellow-700',bg: 'bg-yellow-100', icon: <Clock className="h-4 w-4" /> },
  COMPLETED: { label: 'Completed',  color: 'text-green-700', bg: 'bg-green-100',  icon: <CheckCircle2 className="h-4 w-4" /> },
  CANCELLED: { label: 'Cancelled',  color: 'text-red-600',   bg: 'bg-red-100',    icon: <X className="h-4 w-4" /> },
};

const STATUS_FLOW: EngStatus[] = ['DRAFT', 'ACTIVE', 'REVIEW', 'COMPLETED'];

const TYPE_LABELS: Record<EngType, string> = {
  WEB_APP: 'Web Application', API: 'API / REST', MOBILE: 'Mobile App',
  NETWORK: 'Network / Infrastructure', CLOUD: 'Cloud Environment', RED_TEAM: 'Red Team',
};

const TRANSITIONS: Record<EngStatus, EngStatus[]> = {
  DRAFT:     ['ACTIVE', 'CANCELLED'],
  ACTIVE:    ['REVIEW', 'CANCELLED'],
  REVIEW:    ['COMPLETED', 'ACTIVE'],
  COMPLETED: [],
  CANCELLED: ['DRAFT'],
};

function StatusPill({ status }: { status: EngStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${m.bg} ${m.color}`}>
      {m.icon}{m.label}
    </span>
  );
}

function StatusTimeline({ status }: { status: EngStatus }) {
  const cancelled = status === 'CANCELLED';
  return (
    <div className="flex items-center gap-0">
      {STATUS_FLOW.map((s, i) => {
        const idx = STATUS_FLOW.indexOf(status);
        const done  = STATUS_FLOW.indexOf(s) < idx || status === 'COMPLETED';
        const active = s === status && !cancelled;
        return (
          <div key={s} className="flex items-center">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
              done    ? 'border-green-500 bg-green-500 text-white' :
              active  ? 'border-indigo-500 bg-indigo-500 text-white' :
                        'border-gray-200 bg-white text-gray-400'
            }`}>
              {done ? '✓' : i + 1}
            </div>
            <p className={`ml-1 text-[10px] hidden sm:block ${active ? 'font-semibold text-indigo-700' : done ? 'text-green-600' : 'text-gray-400'}`}>
              {STATUS_META[s].label}
            </p>
            {i < STATUS_FLOW.length - 1 && (
              <div className={`mx-2 h-0.5 w-8 sm:w-16 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
      {cancelled && (
        <span className="ml-4 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">Cancelled</span>
      )}
    </div>
  );
}

export default function EngagementPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [eng, setEng]   = useState<Engagement | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [isAdmin] = useState(() => {
    try {
      const t = localStorage.getItem('ptaas_access_token');
      if (!t) return false;
      return JSON.parse(atob(t.split('.')[1])).role === 'ADMIN';
    } catch { return false; }
  });

  const [form, setForm] = useState({
    title: '', type: 'WEB_APP' as EngType, startDate: '', endDate: '',
    testingHours: '', roeText: '', scopeNotes: '',
  });

  const load = useCallback(async () => {
    const e = await apiClient.get<Engagement | null>(`/projects/${projectId}/engagement`).catch(() => null);
    setEng(e);
    if (e) {
      setForm({
        title: e.title, type: e.type,
        startDate: e.startDate ? e.startDate.split('T')[0] : '',
        endDate:   e.endDate   ? e.endDate.split('T')[0]   : '',
        testingHours: e.testingHours?.toString() ?? '',
        roeText: e.roeText ?? '', scopeNotes: e.scopeNotes ?? '',
      });
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      if (creating) {
        await apiClient.post(`/projects/${projectId}/engagement`, {
          ...form,
          testingHours: form.testingHours ? parseInt(form.testingHours) : undefined,
          startDate: form.startDate || undefined,
          endDate:   form.endDate   || undefined,
        });
      } else {
        await apiClient.patch(`/projects/${projectId}/engagement`, {
          ...form,
          testingHours: form.testingHours ? parseInt(form.testingHours) : undefined,
          startDate: form.startDate || undefined,
          endDate:   form.endDate   || undefined,
        });
      }
      toast.success(creating ? 'Engagement created' : 'Engagement updated');
      setEditing(false);
      setCreating(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function transition(status: EngStatus) {
    try {
      await apiClient.patch(`/projects/${projectId}/engagement`, { status });
      toast.success(`Status updated to ${STATUS_META[status].label}`);
      await load();
    } catch {
      toast.error('Failed to update status');
    }
  }

  async function signOff() {
    if (!confirm('Sign off this engagement? This marks it as Completed.')) return;
    try {
      await apiClient.post(`/projects/${projectId}/engagement/sign-off`, {});
      toast.success('Engagement signed off');
      await load();
    } catch {
      toast.error('Sign-off failed');
    }
  }

  function downloadLetter() {
    const token = localStorage.getItem('ptaas_access_token') ?? '';
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    window.open(`${base}/api/v1/projects/${projectId}/engagement/letter?token=${encodeURIComponent(token)}`, '_blank');
  }

  if (eng === undefined) {
    return <div className="animate-pulse space-y-4"><div className="h-8 w-48 rounded bg-gray-100" /><div className="h-64 rounded-xl bg-gray-100" /></div>;
  }

  // No engagement yet
  if (!eng && !creating) {
    return (
      <div className="flex flex-col items-center gap-5 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
          <FileText className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">No Engagement Defined</h2>
          <p className="mt-1 text-sm text-gray-500">Create an engagement to track the scope, timeline, and rules of engagement for this project.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          Create Engagement
        </button>
      </div>
    );
  }

  // Edit / Create form
  if (editing || creating) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{creating ? 'Create Engagement' : 'Edit Engagement'}</h1>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Engagement Title *</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              placeholder="e.g. Q3 2026 Web Application Pentest" />
          </div>

          {/* Type */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Engagement Type *</label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as EngType }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
              {(Object.entries(TYPE_LABELS) as [EngType, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {/* Dates + Hours */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">End Date</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Testing Hours</label>
              <input type="number" min="1" value={form.testingHours} onChange={(e) => setForm((f) => ({ ...f, testingHours: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                placeholder="e.g. 40" />
            </div>
          </div>

          {/* RoE */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Rules of Engagement</label>
            <textarea value={form.roeText} onChange={(e) => setForm((f) => ({ ...f, roeText: e.target.value }))}
              rows={5} placeholder="Describe the rules, restrictions, and authorization details for this engagement…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none resize-none" />
          </div>

          {/* Scope Notes */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Scope Notes</label>
            <textarea value={form.scopeNotes} onChange={(e) => setForm((f) => ({ ...f, scopeNotes: e.target.value }))}
              rows={3} placeholder="Additional scope details, excluded areas, known limitations…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none resize-none" />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={save} disabled={!form.title.trim() || saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            <Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save Engagement'}
          </button>
          <button onClick={() => { setEditing(false); setCreating(false); }}
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!eng) return null;

  // View mode
  const meta = STATUS_META[eng.status];
  const transitions = TRANSITIONS[eng.status];
  const daysLeft = eng.endDate ? Math.ceil((new Date(eng.endDate).getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <StatusPill status={eng.status} />
            <span className="text-xs text-gray-400">{TYPE_LABELS[eng.type]}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{eng.title}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadLetter}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4" /> Letter
          </button>
          <button onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <Edit3 className="h-4 w-4" /> Edit
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
        <StatusTimeline status={eng.status} />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Start', value: eng.startDate ? new Date(eng.startDate).toLocaleDateString('en-GB') : '—' },
          { label: 'End',   value: eng.endDate   ? new Date(eng.endDate).toLocaleDateString('en-GB')   : '—' },
          { label: 'Testing Hours', value: eng.testingHours ? `${eng.testingHours}h` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="mt-0.5 text-lg font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      {/* Deadline warning */}
      {daysLeft !== null && daysLeft <= 3 && daysLeft >= 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {daysLeft === 0 ? 'Engagement ends today!' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`}
        </div>
      )}

      {/* RoE */}
      {eng.roeText && (
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-500" /> Rules of Engagement
          </h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-600 font-sans leading-relaxed">{eng.roeText}</pre>
        </div>
      )}

      {/* Scope Notes */}
      {eng.scopeNotes && (
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Scope Notes</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-600 font-sans leading-relaxed">{eng.scopeNotes}</pre>
        </div>
      )}

      {/* Sign-off status */}
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" /> Sign-off
        </h2>
        {eng.signedOffBy ? (
          <p className="text-sm text-green-700">
            ✓ Signed off by <strong>{eng.signedOffBy.name}</strong> ({eng.signedOffBy.email})
            {eng.signedOffAt && ` on ${new Date(eng.signedOffAt).toLocaleDateString('en-GB')}`}
          </p>
        ) : (
          <p className="text-sm text-gray-400">Not yet signed off.</p>
        )}
      </div>

      {/* Action buttons */}
      {(transitions.length > 0 || (isAdmin && ['REVIEW', 'ACTIVE'].includes(eng.status))) && (
        <div className="flex flex-wrap gap-3">
          {transitions.map((s) => (
            <button key={s} onClick={() => transition(s)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                s === 'CANCELLED' ? 'border border-red-200 text-red-500 hover:bg-red-50' :
                s === 'COMPLETED' ? 'bg-green-600 text-white hover:bg-green-700' :
                'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}>
              {STATUS_META[s].icon}
              Move to {STATUS_META[s].label}
            </button>
          ))}
          {isAdmin && ['REVIEW', 'ACTIVE'].includes(eng.status) && !eng.signedOffBy && (
            <button onClick={signOff}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors">
              <CheckCircle2 className="h-4 w-4" /> Sign Off
            </button>
          )}
        </div>
      )}
    </div>
  );
}
