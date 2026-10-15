'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  FileText, ChevronUp, ChevronDown, GripVertical,
  CheckSquare, Square, Download, Eye,
} from 'lucide-react';
import { apiUrl } from '@/lib/api-client';

interface Finding {
  id: string;
  title: string;
  severity: string;
  status: string;
  owasp: string | null;
  cvssScore: number | null;
}

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const SEV: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH:     'bg-orange-100 text-orange-700',
  MEDIUM:   'bg-yellow-100 text-yellow-700',
  LOW:      'bg-blue-100 text-blue-700',
  INFO:     'bg-gray-100 text-gray-500',
};

interface Section {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

const DEFAULT_SECTIONS: Section[] = [
  { key: 'cover',             label: 'Cover Page',           description: 'Title, organization name, date, classification banner', enabled: true },
  { key: 'executive_summary', label: 'Executive Summary',    description: 'Custom narrative + finding counts by severity',          enabled: true },
  { key: 'methodology',       label: 'Testing Methodology',  description: 'Reconnaissance, scanning, exploitation, reporting',      enabled: true },
  { key: 'risk_matrix',       label: 'Risk Matrix',          description: 'CVSS severity distribution bar chart',                   enabled: true },
  { key: 'findings',          label: 'Findings',             description: 'All selected findings with description and remediation', enabled: true },
  { key: 'remediation',       label: 'Remediation Roadmap',  description: 'Priority-grouped remediation timeline',                  enabled: true },
];

const CLASSIFICATIONS = ['CONFIDENTIAL', 'INTERNAL', 'PUBLIC', 'RESTRICTED'];
type Step = 1 | 2 | 3;

export default function ReportBuilderPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Step state
  const [step, setStep] = useState<Step>(1);

  // Step 1 — Finding selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sevFilter, setSevFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  // Step 2 — Sections
  const [sections, setSections] = useState<Section[]>(DEFAULT_SECTIONS);

  // Step 3 — Report meta + executive summary
  const [reportTitle, setReportTitle] = useState('Penetration Test Report');
  const [classification, setClassification] = useState('CONFIDENTIAL');
  const [executiveSummary, setExecutiveSummary] = useState('');

  useEffect(() => {
    apiClient.get<Finding[]>(`/projects/${projectId}/findings`).then((data) => {
      const open = data.filter((f) => !['FIXED', 'FALSE_POSITIVE', 'CLOSED'].includes(f.status));
      setFindings(open);
      setSelectedIds(new Set(open.map((f) => f.id)));
    }).finally(() => setLoading(false));
  }, [projectId]);

  const visibleFindings = findings.filter((f) => {
    if (sevFilter !== 'ALL' && f.severity !== sevFilter) return false;
    if (search && !f.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleFinding = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAll = () => setSelectedIds(new Set(visibleFindings.map((f) => f.id)));
  const deselectAll = () => setSelectedIds((prev) => {
    const next = new Set(prev);
    visibleFindings.forEach((f) => next.delete(f.id));
    return next;
  });

  const moveSection = (idx: number, dir: -1 | 1) => {
    setSections((prev) => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const toggleSection = (key: string) =>
    setSections((prev) => prev.map((s) => s.key === key ? { ...s, enabled: !s.enabled } : s));

  const generate = useCallback(async () => {
    const enabledSections = sections.filter((s) => s.enabled).map((s) => s.key);
    if (enabledSections.length === 0) { toast.error('Select at least one section'); return; }
    if (selectedIds.size === 0) { toast.error('Select at least one finding'); return; }

    setGenerating(true);
    try {
      const token = typeof window !== 'undefined'
        ? (document.cookie.match(/(?:^|;\s*)accessToken=([^;]*)/) ?? [])[1] ?? ''
        : '';

      const res = await fetch(apiUrl(`/projects/${projectId}/reports/custom.pdf`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: reportTitle,
          classification,
          executiveSummary,
          findingIds: [...selectedIds],
          sections: enabledSections,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ptaas-report-${projectId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch (err) {
      toast.error('Failed to generate report');
    } finally {
      setGenerating(false);
    }
  }, [sections, selectedIds, projectId, reportTitle, classification, executiveSummary]);

  if (loading) return (
    <div className="space-y-4 p-6">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );

  const stepLabels: Record<Step, string> = {
    1: 'Select Findings',
    2: 'Configure Sections',
    3: 'Report Details & Generate',
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-indigo-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Report Builder</h1>
          <p className="text-sm text-gray-400">Build a custom pentest report with selected findings and sections.</p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <button
              onClick={() => setStep(s)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                step === s ? 'bg-indigo-600 text-white' : step > s ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {s}
            </button>
            <span className={`text-sm ${step === s ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
              {stepLabels[s]}
            </span>
            {s < 3 && <div className="mx-2 h-px w-8 bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Finding Selection ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search findings…"
              className="flex-1 min-w-48 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
            <div className="flex gap-1">
              {['ALL', ...SEVERITY_ORDER].map((s) => (
                <button
                  key={s}
                  onClick={() => setSevFilter(s)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    sevFilter === s
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                <CheckSquare className="h-3 w-3" /> All
              </button>
              <button onClick={deselectAll} className="text-xs text-gray-400 hover:underline flex items-center gap-1">
                <Square className="h-3 w-3" /> None
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-400">{selectedIds.size} of {findings.length} findings selected</p>

          <div className="max-h-[50vh] overflow-y-auto space-y-1 rounded-xl border border-gray-100 bg-white p-2">
            {visibleFindings.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-400">No findings match the filter.</p>
            )}
            {visibleFindings.map((f) => {
              const checked = selectedIds.has(f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => toggleFinding(f.id)}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    checked ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <span className={`shrink-0 text-${checked ? 'indigo' : 'gray'}-400`}>
                    {checked ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4" />}
                  </span>
                  <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${SEV[f.severity] ?? 'bg-gray-100 text-gray-500'}`}>
                    {f.severity}
                  </span>
                  <span className="flex-1 truncate font-medium text-gray-800">{f.title}</span>
                  {f.cvssScore && (
                    <span className="shrink-0 font-mono text-xs text-gray-400">{f.cvssScore.toFixed(1)}</span>
                  )}
                  {f.owasp && <Badge variant="outline" className="shrink-0 text-xs">{f.owasp}</Badge>}
                </button>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep(2)} disabled={selectedIds.size === 0}>
              Next: Configure Sections →
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Section Configuration ── */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Toggle sections on/off and use the arrows to reorder them in the final PDF.
          </p>

          <div className="space-y-2">
            {sections.map((sec, idx) => (
              <div
                key={sec.key}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                  sec.enabled ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 bg-white opacity-60'
                }`}
              >
                <GripVertical className="h-4 w-4 shrink-0 text-gray-300" />
                <button
                  onClick={() => toggleSection(sec.key)}
                  className="shrink-0"
                >
                  {sec.enabled
                    ? <CheckSquare className="h-5 w-5 text-indigo-600" />
                    : <Square className="h-5 w-5 text-gray-400" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{sec.label}</p>
                  <p className="text-xs text-gray-400">{sec.description}</p>
                </div>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveSection(idx, -1)}
                    disabled={idx === 0}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => moveSection(idx, 1)}
                    disabled={idx === sections.length - 1}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
            <Button onClick={() => setStep(3)} disabled={sections.filter((s) => s.enabled).length === 0}>
              Next: Report Details →
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Meta + Generate ── */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Report Title</label>
              <input
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Classification</label>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              >
                {CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Executive Summary <span className="font-normal text-gray-400">(optional — leave blank for auto-generated)</span>
            </label>
            <textarea
              value={executiveSummary}
              onChange={(e) => setExecutiveSummary(e.target.value)}
              rows={6}
              placeholder="Describe the scope, objectives, key findings, and overall security posture…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none resize-y"
            />
          </div>

          {/* Summary card */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm space-y-2">
            <p className="font-semibold text-gray-700 flex items-center gap-2"><Eye className="h-4 w-4" /> Report Preview</p>
            <div className="grid grid-cols-3 gap-3 text-xs text-gray-500">
              <div><span className="font-medium text-gray-700">Findings:</span> {selectedIds.size}</div>
              <div><span className="font-medium text-gray-700">Sections:</span> {sections.filter((s) => s.enabled).length}</div>
              <div><span className="font-medium text-gray-700">Classification:</span> {classification}</div>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {sections.filter((s) => s.enabled).map((s, i) => (
                <span key={s.key} className="flex items-center gap-1 text-xs text-gray-400">
                  {i > 0 && <span>→</span>}
                  <span className="rounded bg-white border border-gray-200 px-2 py-0.5">{s.label}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
            <Button
              onClick={generate}
              disabled={generating}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700"
            >
              <Download className="h-4 w-4" />
              {generating ? 'Generating PDF…' : 'Generate & Download PDF'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
