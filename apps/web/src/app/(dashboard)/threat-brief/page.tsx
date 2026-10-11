'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Loader2, RefreshCw, Shield, AlertTriangle, TrendingUp, CheckCircle2, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Highlight {
  type: 'critical_finding' | 'kev_alert' | 'epss_spike' | 'recommendation';
  title: string;
  detail: string;
  severity?: string;
  cveId?: string;
}

interface ThreatBrief {
  id: string;
  weekStart: string;
  summary: string;
  highlights: Highlight[];
  emailSentAt: string | null;
  generatedAt: string;
}

const HIGHLIGHT_CONFIG = {
  critical_finding: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-200 dark:border-red-800', label: 'Critical Finding' },
  kev_alert:        { icon: Shield,        color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/20', border: 'border-orange-200 dark:border-orange-800', label: 'KEV Alert' },
  epss_spike:       { icon: TrendingUp,    color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-950/20', border: 'border-yellow-200 dark:border-yellow-800', label: 'EPSS Spike' },
  recommendation:   { icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-50 dark:bg-green-950/20',  border: 'border-green-200 dark:border-green-800',  label: 'Recommendation' },
};

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH:     'bg-orange-500',
  MEDIUM:   'bg-yellow-500',
  LOW:      'bg-blue-500',
};

function HighlightCard({ h }: { h: Highlight }) {
  const cfg = HIGHLIGHT_CONFIG[h.type] ?? HIGHLIGHT_CONFIG.recommendation;
  const Icon = cfg.icon;
  return (
    <div className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${cfg.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
            {h.severity && (
              <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${SEVERITY_COLOR[h.severity] ?? 'bg-gray-500'}`}>
                {h.severity}
              </span>
            )}
            {h.cveId && (
              <code className="text-[10px] bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded font-mono">{h.cveId}</code>
            )}
          </div>
          <p className="text-sm font-semibold mt-1">{h.title}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{h.detail}</p>
        </div>
      </div>
    </div>
  );
}

function BriefCard({ brief, isLatest }: { brief: ThreatBrief; isLatest: boolean }) {
  const week = new Date(brief.weekStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const highlights = Array.isArray(brief.highlights) ? brief.highlights : [];

  return (
    <div className={`rounded-2xl border bg-card overflow-hidden ${isLatest ? 'ring-2 ring-primary/20' : 'opacity-75'}`}>
      <div className={`px-6 py-4 ${isLatest ? 'bg-primary/5' : 'bg-muted/30'} border-b flex items-center justify-between`}>
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Week of {week}</span>
            {isLatest && <span className="text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-bold">LATEST</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generated {new Date(brief.generatedAt).toLocaleString()}
            {brief.emailSentAt && ' · Email sent'}
          </p>
        </div>
        {brief.emailSentAt && <span title="Email delivered"><Bell className="h-4 w-4 text-muted-foreground" /></span>}
      </div>

      <div className="p-6 space-y-5">
        <div className="rounded-xl bg-muted/40 p-4">
          <p className="text-sm leading-relaxed">{brief.summary}</p>
        </div>

        {highlights.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Highlights</h3>
            <div className="space-y-3">
              {highlights.map((h, i) => <HighlightCard key={i} h={h} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ThreatBriefPage() {
  const [briefs, setBriefs] = useState<ThreatBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiClient.get<ThreatBrief[]>('/threat-briefs');
      setBriefs(data);
    } catch {
      setError('Failed to load threat briefs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await apiClient.post('/threat-briefs/generate', {});
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Threat Intelligence Feed
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Weekly AI-generated security brief based on your open findings · delivered every Monday
          </p>
        </div>
        <Button onClick={handleGenerate} disabled={generating} variant="outline" className="gap-2">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Generate now
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && briefs.length === 0 && (
        <div className="rounded-2xl border border-dashed p-12 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="font-medium">No threat briefs yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-6">
            Generate your first brief now or wait for the weekly automated delivery.
          </p>
          <Button onClick={handleGenerate} disabled={generating} className="gap-2">
            {generating && <Loader2 className="h-4 w-4 animate-spin" />}
            Generate first brief
          </Button>
        </div>
      )}

      {!loading && briefs.length > 0 && (
        <div className="space-y-6">
          {briefs.map((b, i) => <BriefCard key={b.id} brief={b} isLatest={i === 0} />)}
        </div>
      )}
    </div>
  );
}
