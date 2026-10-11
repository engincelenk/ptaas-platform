'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { trackVisit } from '@/components/search/global-search';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ChevronLeft, Brain, Wrench, AlertTriangle, CheckCircle2, RotateCcw, Link2, MessageSquare, Activity, Loader2, Send, User, Calendar, ClipboardCheck, XCircle, Clock } from 'lucide-react';
import { EvidenceSection } from '@/components/findings/evidence-section';
import { RiskAcceptancePanel } from '@/components/findings/risk-acceptance-panel';
import { FindingTagsInline } from '@/components/findings/finding-tags';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Finding {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  templateId: string | null;
  templateName: string | null;
  matchedAt: string | null;
  httpRequest: string | null;
  httpResponse: string | null;
  cvssScore: number | null;
  cvssVector: string | null;
  cveIds: string[];
  cweIds: string[];
  owasp: string | null;
  aiExplanation: string | null;
  aiRemediation: string | null;
  aiFpScore: number | null;
  aiRiskScore: number | null;
  aiBusinessImpact: string | null;
  aiAnalyzedAt: string | null;
  // CVE Enrichment (M17)
  epssScore: number | null;
  epssPercentile: number | null;
  kevListed: boolean;
  priorityScore: number | null;
  nvdDescription: string | null;
  enrichedAt: string | null;
  // Retest (M18)
  retestStatus: string | null;
  retestRequestedAt: string | null;
  retestCompletedAt: string | null;
  retestScanId: string | null;
  dueDate: string | null;
  scan: { id: string; type: string; startedAt: string | null };
  target: { id: string; value: string; type: string };
  assignedTo: { id: string; name: string; email: string } | null;
}

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

interface ActivityEntry {
  id: string;
  type: string;
  payload: Record<string, any>;
  createdAt: string;
  user: { id: string; name: string } | null;
}

interface OrgMember {
  userId: string;
  user: { id: string; name: string; email: string };
}

const SEVERITY_COLORS = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  MEDIUM: 'default',
  LOW: 'secondary',
  INFO: 'outline',
} as const;

const STATUSES = [
  'OPEN', 'IN_PROGRESS', 'FIXED', 'VERIFIED', 'CLOSED', 'FALSE_POSITIVE', 'ACCEPTED_RISK',
];

interface RelatedFinding {
  id: string;
  title: string;
  severity: string;
  status: string;
  target: { value: string };
}

function parseJwtRole(): string | null {
  try {
    const t = localStorage.getItem('ptaas_access_token');
    if (!t) return null;
    return JSON.parse(atob(t.split('.')[1])).role ?? null;
  } catch { return null; }
}

export default function FindingDetailPage() {
  const { projectId, findingId } = useParams<{ projectId: string; findingId: string }>();
  const router = useRouter();
  const [finding, setFinding] = useState<Finding | null>(null);
  const [isAdmin] = useState(() => typeof window !== 'undefined' ? parseJwtRole() === 'ADMIN' : false);
  const [related, setRelated] = useState<RelatedFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [rescanning, setRescanning] = useState(false);

  // Remediation
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [remediationSaving, setRemediationSaving] = useState(false);
  const [assignedToId, setAssignedToId] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // Persona toggle — persisted to localStorage
  const [personaTab, setPersonaTab] = useState<string>(() =>
    typeof window !== 'undefined'
      ? (localStorage.getItem('ptaas.finding.persona') ?? 'developer')
      : 'developer',
  );

  // Retest
  const [retestNote, setRetestNote] = useState('');
  const [retestLoading, setRetestLoading] = useState(false);

  // AI Narrative
  interface AiNarrative { description: string; impact: string; recommendation: string }
  const [narrative, setNarrative] = useState<AiNarrative | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeApplied, setNarrativeApplied] = useState(false);

  const generateNarrative = async () => {
    setNarrativeLoading(true);
    setNarrative(null);
    setNarrativeApplied(false);
    try {
      const result = await apiClient.post<AiNarrative>(
        `/projects/${projectId}/findings/${findingId}/ai-narrative`,
        {},
      );
      setNarrative(result);
    } catch {
      toast.error('Failed to generate narrative');
    } finally {
      setNarrativeLoading(false);
    }
  };

  const applyNarrative = async () => {
    if (!narrative) return;
    try {
      await apiClient.patch(`/projects/${projectId}/findings/${findingId}`, {
        description: narrative.description + '\n\n**Impact**\n' + narrative.impact,
        recommendation: narrative.recommendation,
      });
      toast.success('Narrative applied to finding');
      setNarrativeApplied(true);
      await loadFinding();
    } catch {
      toast.error('Failed to apply narrative');
    }
  };

  const loadFinding = useCallback(async () => {
    const [data, relatedData] = await Promise.all([
      apiClient.get<Finding>(`/projects/${projectId}/findings/${findingId}`),
      apiClient.get<RelatedFinding[]>(`/projects/${projectId}/findings/${findingId}/related`),
    ]);
    setFinding(data);
    setRelated(relatedData);
    trackVisit({ href: `/projects/${projectId}/findings/${findingId}`, label: data.title, sub: `${data.severity} finding`, type: 'finding' });
  }, [projectId, findingId]);

  useEffect(() => {
    loadFinding().finally(() => setLoading(false));
  }, [loadFinding]);

  // Load remediation data when finding is available
  useEffect(() => {
    if (!finding) return;
    setAssignedToId(finding.assignedTo?.id ?? '');
    setDueDate(finding.dueDate ? finding.dueDate.slice(0, 10) : '');
    Promise.all([
      apiClient.get<Comment[]>(`/projects/${projectId}/findings/${findingId}/comments`),
      apiClient.get<ActivityEntry[]>(`/projects/${projectId}/findings/${findingId}/activity`),
      apiClient.get<OrgMember[]>(`/organizations/members`),
    ]).then(([c, a, m]) => { setComments(c); setActivity(a); setOrgMembers(m); }).catch(() => {});
  }, [finding, projectId, findingId]);

  async function handleSaveRemediation() {
    setRemediationSaving(true);
    try {
      await apiClient.patch(`/projects/${projectId}/findings/${findingId}/remediation`, {
        assignedToId: assignedToId || null,
        dueDate: dueDate || null,
      });
      await loadFinding();
      toast.success('Remediation details saved');
    } catch { toast.error('Failed to save'); }
    finally { setRemediationSaving(false); }
  }

  async function handleAddComment() {
    if (!newComment.trim()) return;
    setCommentLoading(true);
    try {
      const c = await apiClient.post<Comment>(`/projects/${projectId}/findings/${findingId}/comments`, { body: newComment.trim() });
      setComments((prev) => [...prev, c]);
      setNewComment('');
      // Refresh activity
      apiClient.get<ActivityEntry[]>(`/projects/${projectId}/findings/${findingId}/activity`).then(setActivity).catch(() => {});
    } catch { toast.error('Failed to add comment'); }
    finally { setCommentLoading(false); }
  }

  const handleRequestRetest = async () => {
    setRetestLoading(true);
    try {
      const result = await apiClient.post<{ scanId: string }>(
        `/findings/${findingId}/retest`,
        {},
      );
      toast.success('Retest scan queued — you will be notified when complete');
      await loadFinding();
      if (retestNote.trim()) {
        await apiClient.post(`/projects/${projectId}/findings/${findingId}/comments`, {
          body: `**Retest requested**\n\n${retestNote.trim()}`,
        });
        setRetestNote('');
        apiClient.get<Comment[]>(`/projects/${projectId}/findings/${findingId}/comments`).then(setComments).catch(() => {});
      }
      if (result?.scanId) router.push(`/projects/${projectId}/scans/${result.scanId}`);
    } catch {
      toast.error('Failed to request retest');
    } finally {
      setRetestLoading(false);
      setRescanning(false);
    }
  };

  const handleMarkRetestResult = async (pass: boolean) => {
    const newStatus = pass ? 'VERIFIED' : 'OPEN';
    setUpdatingStatus(true);
    try {
      await apiClient.patch(`/projects/${projectId}/findings/${findingId}`, { status: newStatus });
      await loadFinding();
      toast.success(pass ? 'Marked as Verified (fix confirmed)' : 'Marked as Open (fix not confirmed)');
    } catch { toast.error('Failed to update'); }
    finally { setUpdatingStatus(false); }
  };

  const handleStatusChange = async (newStatus: string) => {
    setUpdatingStatus(true);
    try {
      await apiClient.patch(`/projects/${projectId}/findings/${findingId}`, { status: newStatus });
      await loadFinding();
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!finding) return null;

  const hasAiAnalysis = !!finding.aiAnalyzedAt;

  return (
    <div className="max-w-4xl space-y-6 p-6">
      {/* Breadcrumb + header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/projects/${projectId}/findings`}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            All Findings
          </Link>
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold leading-tight">{finding.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={SEVERITY_COLORS[finding.severity as keyof typeof SEVERITY_COLORS] ?? 'outline'}>
                {finding.severity}
                {finding.cvssScore && ` · CVSS ${finding.cvssScore}`}
              </Badge>
              {finding.owasp && (
                <Badge variant="outline" className="text-xs">{finding.owasp}</Badge>
              )}
              {finding.cveIds.map((cve) => (
                <Badge key={cve} variant="outline" className="text-xs font-mono">{cve}</Badge>
              ))}
              {/* CVE Enrichment badges */}
              {finding.kevListed && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold bg-red-600 text-white animate-pulse">
                  ⚠ CISA KEV
                </span>
              )}
              {finding.epssScore != null && (
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                  finding.epssScore >= 0.5 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                  : finding.epssScore >= 0.1 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400'
                }`}>
                  EPSS {(finding.epssScore * 100).toFixed(1)}%
                </span>
              )}
              {finding.priorityScore != null && (
                <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${
                  finding.priorityScore >= 75 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                  : finding.priorityScore >= 50 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                }`}>
                  Priority {finding.priorityScore}
                </span>
              )}
            </div>
            {/* KEV warning banner */}
            {finding.kevListed && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-800 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  <strong>CISA Known Exploited Vulnerability</strong> — This CVE is actively exploited in the wild.
                  CISA mandates federal agencies remediate within defined deadlines. Treat as P0.
                </span>
              </div>
            )}
          </div>

          {/* Triage controls */}
          <div className="flex items-center gap-2">
            {['FIXED', 'OPEN', 'IN_PROGRESS', 'VERIFIED'].includes(finding.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRequestRetest}
                disabled={rescanning || finding.retestStatus === 'PENDING'}
              >
                {rescanning ? (
                  <span className="mr-2 h-4 w-4 animate-spin">⟳</span>
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                {finding.retestStatus === 'PENDING' ? 'Retest Running…' : 'Request Retest'}
              </Button>
            )}
            {/* Retest status badge */}
            {finding.retestStatus && finding.retestStatus !== 'PENDING' && (
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                finding.retestStatus === 'PASSED'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                Retest {finding.retestStatus}
              </span>
            )}
            <Select
              value={finding.status}
              onValueChange={handleStatusChange}
              disabled={updatingStatus}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* AI Business Impact banner */}
      {finding.aiBusinessImpact && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <Brain className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
          <p className="text-muted-foreground">{finding.aiBusinessImpact}</p>
        </div>
      )}

      {/* FP warning */}
      {finding.aiFpScore != null && finding.aiFpScore >= 50 && (
        <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            AI estimates {Math.round(finding.aiFpScore)}% probability this is a false positive.
            Verify manually before acting.
          </span>
        </div>
      )}

      {/* Developer / Engineer persona tabs */}
      <Tabs
        value={personaTab}
        onValueChange={(v) => {
          setPersonaTab(v);
          localStorage.setItem('ptaas.finding.persona', v);
        }}
      >
        <TabsList>
          <TabsTrigger value="developer">
            <Wrench className="mr-1.5 h-4 w-4" />
            Developer View
          </TabsTrigger>
          <TabsTrigger value="engineer">
            <Brain className="mr-1.5 h-4 w-4" />
            Security Engineer
          </TabsTrigger>
          <TabsTrigger value="remediation">
            <MessageSquare className="mr-1.5 h-4 w-4" />
            Remediation
          </TabsTrigger>
          <TabsTrigger value="retest">
            <ClipboardCheck className="mr-1.5 h-4 w-4" />
            Retest
            {finding.retestStatus === 'PENDING' && (
              <span className="ml-1.5 h-2 w-2 rounded-full bg-yellow-400 inline-block" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Developer View: plain language ── */}
        <TabsContent value="developer" className="space-y-4 pt-4">
          {!hasAiAnalysis ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              <Brain className="mx-auto mb-2 h-6 w-6 opacity-40" />
              AI analysis in progress — check back in a moment.
            </div>
          ) : (
            <>
              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  What is this?
                </h2>
                <p className="text-sm leading-relaxed">{finding.aiExplanation}</p>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  How to fix it
                </h2>
                <div className="rounded-md border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {finding.aiRemediation}
                </div>
              </section>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">AI Risk Score</p>
                  <p className="mt-1 text-2xl font-bold">
                    {finding.aiRiskScore != null ? Math.round(finding.aiRiskScore) : '—'}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">False Positive Probability</p>
                  <p className="mt-1 text-2xl font-bold">
                    {finding.aiFpScore != null ? `${Math.round(finding.aiFpScore)}%` : '—'}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Target</p>
                  <p className="mt-1 font-mono text-sm truncate">{finding.target.value}</p>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Engineer View: technical detail ── */}
        <TabsContent value="engineer" className="space-y-4 pt-4">
          {/* CVSS Scorecard */}
          {finding.cvssScore != null && (
            <div className="rounded-lg border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                CVSS Scorecard
              </p>
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center justify-center rounded-lg bg-muted/50 w-24 h-20">
                  <span className={`text-3xl font-bold ${
                    finding.cvssScore >= 9 ? 'text-red-600' :
                    finding.cvssScore >= 7 ? 'text-orange-500' :
                    finding.cvssScore >= 4 ? 'text-yellow-500' : 'text-green-600'
                  }`}>{finding.cvssScore}</span>
                  <span className="text-xs text-muted-foreground">/ 10.0</span>
                </div>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        finding.cvssScore >= 9 ? 'bg-red-500' :
                        finding.cvssScore >= 7 ? 'bg-orange-500' :
                        finding.cvssScore >= 4 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${(finding.cvssScore / 10) * 100}%` }}
                    />
                  </div>
                  {finding.cvssVector && (
                    <code className="mt-2 block text-xs text-muted-foreground break-all">
                      {finding.cvssVector}
                    </code>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* CVE Enrichment panel */}
          {finding.cveIds.length > 0 && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  CVE Enrichment
                </p>
                {finding.enrichedAt ? (
                  <span className="text-xs text-muted-foreground">
                    Enriched {new Date(finding.enrichedAt).toLocaleDateString()}
                  </span>
                ) : (
                  <Button
                    size="sm" variant="outline"
                    onClick={async () => {
                      try {
                        await apiClient.post(`/findings/${finding.id}/enrich`, {});
                        toast.success('Enrichment queued — refresh in a moment');
                      } catch { toast.error('Failed to queue enrichment'); }
                    }}
                  >
                    Enrich CVEs
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md bg-muted/40 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">EPSS Score</p>
                  <p className="text-lg font-bold">
                    {finding.epssScore != null
                      ? `${(finding.epssScore * 100).toFixed(2)}%`
                      : '—'}
                  </p>
                  {finding.epssPercentile != null && (
                    <p className="text-xs text-muted-foreground">
                      top {((1 - finding.epssPercentile) * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
                <div className="rounded-md bg-muted/40 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">CISA KEV</p>
                  <p className={`text-lg font-bold ${finding.kevListed ? 'text-red-600' : 'text-green-600'}`}>
                    {finding.kevListed ? 'Listed' : 'Not listed'}
                  </p>
                </div>
                <div className="rounded-md bg-muted/40 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Priority Score</p>
                  <p className={`text-lg font-bold ${
                    (finding.priorityScore ?? 0) >= 75 ? 'text-red-600'
                    : (finding.priorityScore ?? 0) >= 50 ? 'text-amber-600'
                    : 'text-blue-600'
                  }`}>
                    {finding.priorityScore != null ? finding.priorityScore : '—'}
                  </p>
                </div>
              </div>
              {finding.nvdDescription && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {finding.nvdDescription}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Template</p>
              <code className="text-xs">{finding.templateId ?? '—'}</code>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Matched At</p>
              <code className="text-xs break-all">{finding.matchedAt ?? '—'}</code>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">CWE IDs</p>
              <code className="text-xs">{finding.cweIds.join(', ') || '—'}</code>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">OWASP</p>
              <code className="text-xs">{finding.owasp ?? '—'}</code>
            </div>
          </div>

          {finding.httpRequest && (
            <section>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                HTTP Request (truncated)
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
                {finding.httpRequest}
              </pre>
            </section>
          )}

          {finding.httpResponse && (
            <section>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                HTTP Response (truncated)
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
                {finding.httpResponse}
              </pre>
            </section>
          )}

          {/* AI Narrative Generator */}
          <div className="rounded-xl border bg-gradient-to-br from-violet-50 to-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-violet-600" />
                <h3 className="text-sm font-semibold text-violet-900">AI Report Narrative</h3>
              </div>
              <button
                onClick={generateNarrative}
                disabled={narrativeLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {narrativeLoading ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
                ) : (
                  <>✨ Generate with AI</>
                )}
              </button>
            </div>

            {!narrative && !narrativeLoading && (
              <p className="text-xs text-muted-foreground">
                Generate a professional, client-ready vulnerability narrative using Claude Haiku.
                The result appears as a preview — you can review and apply it to the finding.
              </p>
            )}

            {narrative && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Description</p>
                  <p className="text-sm leading-relaxed text-gray-700 bg-white rounded-lg border p-3">{narrative.description}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Impact</p>
                  <p className="text-sm leading-relaxed text-gray-700 bg-white rounded-lg border p-3">{narrative.impact}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Recommendation</p>
                  <p className="text-sm leading-relaxed text-gray-700 bg-white rounded-lg border p-3 whitespace-pre-wrap">{narrative.recommendation}</p>
                </div>
                <div className="flex gap-2 pt-1">
                  {!narrativeApplied ? (
                    <>
                      <button
                        onClick={applyNarrative}
                        className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700 transition-colors"
                      >
                        Apply to Finding
                      </button>
                      <button
                        onClick={generateNarrative}
                        className="rounded-lg border px-4 py-2 text-xs font-medium hover:bg-muted transition-colors"
                      >
                        Regenerate
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Applied to finding
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            Scan: {finding.scan.type} · Started{' '}
            {finding.scan.startedAt
              ? new Date(finding.scan.startedAt).toLocaleString()
              : 'unknown'}
            {finding.aiAnalyzedAt && (
              <> · AI analyzed {new Date(finding.aiAnalyzedAt).toLocaleString()}</>
            )}
          </div>
        </TabsContent>
        {/* ── Remediation Tab ── */}
        <TabsContent value="remediation" className="space-y-6 pt-4">
          {/* Assignee + Due Date */}
          <div className="grid sm:grid-cols-2 gap-4 rounded-xl border p-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />Assignee
              </label>
              <select
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
                className="w-full text-sm rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Unassigned</option>
                {orgMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.user.name} ({m.user.email})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-sm rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button size="sm" onClick={handleSaveRemediation} disabled={remediationSaving} className="gap-1.5">
                {remediationSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                Save
              </Button>
            </div>
          </div>

          {/* Comments */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              Comments ({comments.length})
            </h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {comments.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No comments yet</p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg border bg-muted/30 px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{c.user.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(c.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
            </div>
            {/* New comment */}
            <div className="flex gap-2">
              <textarea
                ref={commentRef}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment(); }}
                placeholder="Add a comment… (Ctrl+Enter to submit)"
                rows={2}
                className="flex-1 text-sm rounded-lg border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <Button onClick={handleAddComment} disabled={commentLoading || !newComment.trim()} size="sm" className="gap-1 self-end">
                {commentLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Activity feed */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Activity
            </h3>
            <div className="space-y-1.5">
              {activity.length === 0 && <p className="text-xs text-muted-foreground">No activity yet</p>}
              {activity.map((a) => {
                const label = {
                  status_change:      `Status changed from ${a.payload?.from} → ${a.payload?.to}`,
                  assignee_change:    `Assignee updated`,
                  due_date_set:       `Due date set to ${a.payload?.dueDate ?? 'cleared'}`,
                  comment:            `Left a comment`,
                  retest_requested:   `Retest requested`,
                  retest_completed:   `Retest completed`,
                }[a.type] ?? a.type;
                return (
                  <div key={a.id} className="flex items-start gap-3 text-xs text-muted-foreground">
                    <span className="w-28 shrink-0 text-[11px]">{new Date(a.createdAt).toLocaleString()}</span>
                    <span className="font-medium text-foreground/70">{a.user?.name ?? 'System'}</span>
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── Retest Tab ── */}
        <TabsContent value="retest" className="space-y-6 pt-4">
          {/* Status banner */}
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${
            finding.status === 'VERIFIED'
              ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
              : finding.status === 'IN_PROGRESS' && finding.retestRequestedAt
              ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800'
              : 'bg-muted/30 border-border'
          }`}>
            {finding.status === 'VERIFIED' ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">Fix Verified</p>
                  <p className="text-xs text-green-700/70 dark:text-green-400/70">
                    {finding.retestCompletedAt
                      ? `Verified on ${new Date(finding.retestCompletedAt).toLocaleDateString()}`
                      : 'This finding has been marked as fixed and verified.'}
                  </p>
                </div>
              </>
            ) : finding.status === 'IN_PROGRESS' && finding.retestRequestedAt ? (
              <>
                <Clock className="h-5 w-5 text-yellow-500 shrink-0 animate-pulse" />
                <div>
                  <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">Retest In Progress</p>
                  <p className="text-xs text-yellow-700/70 dark:text-yellow-400/70">
                    Requested {new Date(finding.retestRequestedAt).toLocaleDateString()}
                    {finding.retestScanId && (
                      <Link href={`/projects/${projectId}/scans/${finding.retestScanId}`} className="ml-2 underline">
                        View scan →
                      </Link>
                    )}
                  </p>
                </div>
              </>
            ) : (
              <>
                <RotateCcw className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">No retest yet</p>
                  <p className="text-xs text-muted-foreground">Request a retest once the fix has been deployed.</p>
                </div>
              </>
            )}
          </div>

          {/* Request retest form */}
          {finding.status !== 'VERIFIED' && (
            <div className="rounded-xl border p-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                Request Retest
              </h3>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Note for the pentester <span className="font-normal">(optional)</span>
                </label>
                <Textarea
                  placeholder="Describe what was fixed, which commit/PR, where the fix was deployed…"
                  value={retestNote}
                  onChange={(e) => setRetestNote(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={handleRequestRetest}
                  disabled={retestLoading || finding.status === 'VERIFIED'}
                  className="gap-2"
                >
                  {retestLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Queuing…</>
                    : <><RotateCcw className="h-4 w-4" />Request Retest</>
                  }
                </Button>
                {finding.status === 'IN_PROGRESS' && (
                  <span className="text-xs text-muted-foreground self-center">
                    A RETEST scan will be queued for {finding.target.value}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Manual verdict (for pentesters / admins) */}
          {(finding.status === 'IN_PROGRESS' || finding.status === 'FIXED') && (
            <div className="rounded-xl border p-4 space-y-3">
              <h3 className="text-sm font-semibold">Retest Verdict</h3>
              <p className="text-xs text-muted-foreground">
                After completing the retest, record the result:
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50 dark:hover:bg-green-950/20"
                  onClick={() => handleMarkRetestResult(true)}
                  disabled={updatingStatus}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Pass — Fix Confirmed
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-red-700 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20"
                  onClick={() => handleMarkRetestResult(false)}
                  disabled={updatingStatus}
                >
                  <XCircle className="h-4 w-4" />
                  Fail — Still Vulnerable
                </Button>
              </div>
            </div>
          )}

          {/* Activity relevant to retests */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Retest History
            </h3>
            {activity.filter((a) => a.type.startsWith('retest') || a.type === 'status_change').length === 0 ? (
              <p className="text-xs text-muted-foreground">No retest activity yet.</p>
            ) : (
              <div className="space-y-1.5">
                {activity
                  .filter((a) => a.type.startsWith('retest') || a.type === 'status_change')
                  .map((a) => {
                    const label = {
                      retest_requested: 'Retest requested',
                      retest_completed: `Retest completed — ${a.payload?.result ?? 'result unknown'}`,
                      status_change: `Status: ${a.payload?.from} → ${a.payload?.to}`,
                    }[a.type] ?? a.type;
                    return (
                      <div key={a.id} className="flex items-start gap-3 text-xs">
                        <span className="text-[11px] text-muted-foreground w-32 shrink-0">
                          {new Date(a.createdAt).toLocaleString()}
                        </span>
                        <span className="font-medium text-foreground/70 shrink-0">{a.user?.name ?? 'System'}</span>
                        <span className="text-muted-foreground">{label}</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Risk decision */}
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Tags</h2>
        <FindingTagsInline findingId={findingId as string} />
      </div>
      <RiskAcceptancePanel findingId={findingId as string} isAdmin={isAdmin} />

      {/* Evidence attachments */}
      <EvidenceSection findingId={findingId as string} projectId={projectId as string} />

      {/* Related findings */}
      {related.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Link2 className="h-4 w-4" />
            Related Findings
          </h2>
          <div className="space-y-1.5">
            {related.map((r) => (
              <Link
                key={r.id}
                href={`/projects/${projectId}/findings/${r.id}`}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant={SEVERITY_COLORS[r.severity as keyof typeof SEVERITY_COLORS] ?? 'outline'}
                    className="shrink-0"
                  >
                    {r.severity}
                  </Badge>
                  <span className="truncate">{r.title}</span>
                </div>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{r.target.value}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
