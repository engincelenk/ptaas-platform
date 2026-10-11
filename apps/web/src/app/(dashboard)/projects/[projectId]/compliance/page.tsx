'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import {
  ShieldCheck, ShieldAlert, Download, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, AlertTriangle, ClipboardList,
} from 'lucide-react';

type Framework = 'pci-dss' | 'iso27001' | 'soc2' | 'gdpr';

interface FrameworkSummaryItem {
  total: number;
  affected: number;
  compliant: number;
  score: number;
}

type Summary = Record<Framework, FrameworkSummaryItem>;

interface FindingRef { id: string; title: string; severity: string; status: string }
interface ControlDetail {
  control: { id: string; name: string; description: string };
  findings: FindingRef[];
  findingCount: number;
  openCount: number;
  compliant: boolean;
}
interface FrameworkDetail {
  framework: Framework;
  total: number; affected: number; compliant: number; score: number;
  controls: ControlDetail[];
  unmappedCount: number;
}

const FW_META: Record<Framework, { label: string; color: string; bg: string; icon: string }> = {
  'pci-dss':  { label: 'PCI-DSS v4.0',        color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',   icon: '💳' },
  'iso27001': { label: 'ISO/IEC 27001:2022',   color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', icon: '🔐' },
  'soc2':     { label: 'SOC 2 TSC',            color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', icon: '🏛️' },
  'gdpr':     { label: 'GDPR',                 color: 'text-green-700',  bg: 'bg-green-50 border-green-200',  icon: '🇪🇺' },
};

const SEV_BG: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700', HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700', LOW: 'bg-blue-100 text-blue-700', INFO: 'bg-gray-100 text-gray-600',
};

function ScoreRing({ score }: { score: number }) {
  const r = 20, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
  return (
    <svg width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 26 26)" />
      <text x="26" y="31" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>{score}%</text>
    </svg>
  );
}

function ControlRow({ ctrl, projectId }: { ctrl: ControlDetail; projectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border transition-colors ${ctrl.compliant ? 'border-green-100 bg-green-50/30' : ctrl.openCount > 0 ? 'border-red-100 bg-red-50/20' : 'border-gray-100'}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {ctrl.compliant
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
          : ctrl.openCount > 0
            ? <XCircle className="h-4 w-4 shrink-0 text-red-500" />
            : <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-gray-500">{ctrl.control.id}</span>
            <span className="text-sm font-medium text-gray-800">{ctrl.control.name}</span>
          </div>
          {ctrl.openCount > 0 && (
            <p className="text-xs text-red-500">{ctrl.openCount} open finding{ctrl.openCount !== 1 ? 's' : ''}</p>
          )}
        </div>
        {ctrl.findings.length > 0 && (open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />)}
      </button>
      {open && ctrl.findings.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-2 space-y-1.5">
          <p className="text-xs text-gray-400 mb-1">{ctrl.control.description}</p>
          {ctrl.findings.map((f) => (
            <Link
              key={f.id}
              href={`/projects/${projectId}/findings/${f.id}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 transition-colors"
            >
              <span className={`rounded-full px-1.5 py-px text-[10px] font-bold shrink-0 ${SEV_BG[f.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                {f.severity[0]}
              </span>
              <span className="truncate text-xs text-gray-700">{f.title}</span>
              <span className={`ml-auto shrink-0 text-[10px] ${f.status === 'OPEN' || f.status === 'IN_PROGRESS' ? 'text-red-500' : 'text-gray-400'}`}>
                {f.status.replace('_', ' ')}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const FRAMEWORKS: Framework[] = ['pci-dss', 'iso27001', 'soc2', 'gdpr'];

export default function CompliancePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [activefw, setActiveFw] = useState<Framework>('pci-dss');
  const [detail, setDetail] = useState<FrameworkDetail | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    apiClient.get<Summary>(`/projects/${projectId}/compliance/frameworks/summary`)
      .then(setSummary)
      .finally(() => setLoadingSummary(false));
  }, [projectId]);

  const loadDetail = useCallback(async (fw: Framework) => {
    setLoadingDetail(true);
    setDetail(null);
    try {
      const d = await apiClient.get<FrameworkDetail>(`/projects/${projectId}/compliance/frameworks/${fw}`);
      setDetail(d);
    } finally {
      setLoadingDetail(false);
    }
  }, [projectId]);

  useEffect(() => { loadDetail(activefw); }, [activefw, loadDetail]);

  function downloadPdf(fw: Framework) {
    const token = typeof window !== 'undefined' ? (localStorage.getItem('ptaas_access_token') ?? '') : '';
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    window.open(`${base}/api/v1/projects/${projectId}/compliance/frameworks/${fw}/export.pdf?token=${encodeURIComponent(token)}`, '_blank');
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance Mapping</h1>
          <p className="text-sm text-gray-500">Findings mapped to PCI-DSS · ISO 27001 · SOC 2 · GDPR</p>
        </div>
      </div>

      {/* Summary cards */}
      {loadingSummary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
          {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-xl bg-gray-100" />)}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {FRAMEWORKS.map((fw) => {
            const s = summary[fw];
            const meta = FW_META[fw];
            return (
              <button
                key={fw}
                onClick={() => setActiveFw(fw)}
                className={`rounded-xl border p-4 text-left transition-all ${meta.bg} ${activefw === fw ? 'ring-2 ring-indigo-400 ring-offset-1' : 'hover:shadow-sm'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg">{meta.icon}</span>
                  <ScoreRing score={s.score} />
                </div>
                <p className={`text-xs font-bold ${meta.color}`}>{meta.label}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{s.compliant}/{s.total} controls pass</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Framework detail */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Tab header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="flex gap-1">
            {FRAMEWORKS.map((fw) => (
              <button
                key={fw}
                onClick={() => setActiveFw(fw)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${activefw === fw ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                {FW_META[fw].icon} {FW_META[fw].label.split(' ')[0]}
              </button>
            ))}
          </div>
          <button
            onClick={() => downloadPdf(activefw)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
        </div>

        {/* Detail body */}
        <div className="p-5">
          {loadingDetail ? (
            <div className="space-y-2 animate-pulse">
              {[1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-lg bg-gray-100" />)}
            </div>
          ) : detail ? (
            <div className="space-y-2">
              {detail.unmappedCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-yellow-100 bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {detail.unmappedCount} finding{detail.unmappedCount !== 1 ? 's' : ''} could not be mapped to {FW_META[activefw].label} controls (no OWASP/CWE data).
                </div>
              )}
              {detail.controls.map((ctrl) => (
                <ControlRow key={ctrl.control.id} ctrl={ctrl} projectId={projectId} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
