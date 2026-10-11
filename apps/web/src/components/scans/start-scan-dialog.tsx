'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api-client';
import { Loader2, ShieldAlert, Sparkles } from 'lucide-react';

const TEMPLATE_CATEGORIES = [
  { id: 'cves', label: 'CVEs', description: 'Known CVE vulnerabilities' },
  { id: 'misconfigurations', label: 'Misconfigurations', description: 'Server/app misconfigs' },
  { id: 'exposures', label: 'Exposures', description: 'Sensitive data / file exposures' },
  { id: 'technologies', label: 'Technology Detection', description: 'Stack fingerprinting' },
  { id: 'vulnerabilities', label: 'Generic Vulns', description: 'XSS, SSRF, SQLi etc.' },
];

type ScanType = 'QUICK' | 'FULL' | 'WEB_CRAWL' | 'API_SCAN';

const SCAN_TYPE_META: Record<ScanType, { label: string; description: string }> = {
  QUICK: { label: 'Quick Scan', description: '~5 min · 100 req/s · Nuclei common templates' },
  FULL: { label: 'Full Scan', description: '~30–60 min · 30 req/s · All Nuclei templates' },
  WEB_CRAWL: { label: 'Web Crawl (ZAP)', description: 'Spider + Active Scan · JS-rendered pages · 1–2 h' },
  API_SCAN: { label: 'API Scan (ZAP)', description: 'OpenAPI import + endpoint fuzzing · 30–60 min' },
};

interface StartScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  targetId: string;
  targetValue: string;
}

export function StartScanDialog({
  open,
  onOpenChange,
  projectId,
  targetId,
  targetValue,
}: StartScanDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);
  const [scanType, setScanType] = useState<ScanType>('QUICK');
  const [categories, setCategories] = useState<string[]>(['cves', 'misconfigurations', 'exposures']);
  const [credentialType, setCredentialType] = useState('');
  const [credentialValue, setCredentialValue] = useState('');
  const [crawlDepth, setCrawlDepth] = useState(5);
  const [openApiSpec, setOpenApiSpec] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [policies, setPolicies] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    try {
      const token = localStorage.getItem('ptaas_access_token') ?? '';
      const payload = JSON.parse(atob(token.split('.')[1]));
      const orgId = payload.orgId;
      if (orgId) {
        apiClient.get<Array<{ id: string; name: string }>>(
          `/organizations/${orgId}/scan-policies`,
        ).then(setPolicies).catch(() => {});
      }
    } catch { /* ignore */ }
  }, []);

  const isNuclei = scanType === 'QUICK' || scanType === 'FULL';
  const isZap = scanType === 'WEB_CRAWL' || scanType === 'API_SCAN';

  const aiSuggestScope = async () => {
    setAiLoading(true);
    setAiReasoning(null);
    try {
      const result = await apiClient.post<{ categories: string[]; reasoning: string }>(
        `/projects/${projectId}/scans/ai-scope-suggest`,
        {},
      );
      setCategories(result.categories);
      setAiReasoning(result.reasoning);
      toast.success('KI-Empfehlung angewendet');
    } catch {
      toast.error('KI-Empfehlung fehlgeschlagen');
    } finally {
      setAiLoading(false);
    }
  };

  const toggleCategory = (id: string) => {
    setCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const handleSubmit = async () => {
    if (isNuclei && categories.length === 0) {
      toast.error('Select at least one template category');
      return;
    }
    if (scanType === 'API_SCAN' && !openApiSpec.trim()) {
      toast.error('API Scan requires an OpenAPI spec URL or inline YAML/JSON');
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = { targetId, type: scanType };

      if (policyId) body.policyId = policyId;

      if (isNuclei) {
        body.templateCategories = categories;
      }
      if (scanType === 'WEB_CRAWL') {
        body.crawlDepth = crawlDepth;
      }
      if (scanType === 'API_SCAN') {
        body.openApiSpec = openApiSpec.trim();
      }
      if (credentialType && credentialValue) {
        body.credentialType = credentialType;
        body.credentialValue = credentialValue;
      }

      const scan = await apiClient.post<{ id: string }>(
        `/projects/${projectId}/scans`,
        body,
      );

      toast.success('Scan queued — it will start shortly');
      onOpenChange(false);
      router.push(`/projects/${projectId}/scans/${scan.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start scan';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-orange-500" />
            Start Scan — {targetValue}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Scan type — profile cards */}
          <div className="space-y-2">
            <Label>Scan-Profil</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'QUICK',    label: 'SCHNELL',   icon: '⚡', desc: '~5 min', sub: '100 req/s · Häufige Schwachstellen' },
                { value: 'FULL',     label: 'STANDARD',  icon: '🔍', desc: '~30–60 min', sub: '30 req/s · Alle Nuclei-Templates' },
                { value: 'WEB_CRAWL',label: 'KOMPLETT',  icon: '🕷', desc: '~1–2 h', sub: 'Spider + Active Scan (ZAP)' },
              ] as const).map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setScanType(p.value as ScanType)}
                  aria-pressed={scanType === p.value}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    scanType === p.value
                      ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-1'
                      : 'border-border hover:border-primary/50 hover:bg-muted/40'
                  }`}
                >
                  <div className="text-xl mb-1">{p.icon}</div>
                  <p className="text-xs font-bold">{p.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{p.sub}</p>
                </button>
              ))}
            </div>
            {/* API Scan available as additional option */}
            <button
              type="button"
              onClick={() => setScanType('API_SCAN')}
              aria-pressed={scanType === 'API_SCAN'}
              className={`w-full rounded-xl border p-3 text-left transition-all text-sm ${
                scanType === 'API_SCAN'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-1'
                  : 'border-border hover:border-primary/50 hover:bg-muted/40'
              }`}
            >
              <span className="font-medium">🔌 API Scan (ZAP)</span>
              <span className="ml-2 text-xs text-muted-foreground">OpenAPI-Import + Endpoint-Fuzzing · 30–60 min</span>
            </button>
          </div>

          {/* Legacy select hidden — kept for compatibility when no profile matches */}
          <div className="hidden">
            <Select value={scanType} onValueChange={(v) => setScanType(v as ScanType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(SCAN_TYPE_META) as [ScanType, { label: string; description: string }][]).map(
                  ([value, meta]) => (
                    <SelectItem key={value} value={value}>
                      <div>
                        <div className="font-medium">{meta.label}</div>
                        <div className="text-xs text-muted-foreground">{meta.description}</div>
                      </div>
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>{/* end hidden */}

          {/* Scan policy (optional) */}
          {isNuclei && policies.length > 0 && (
            <div className="space-y-1.5">
              <Label>Scan Policy (optional)</Label>
              <Select value={policyId} onValueChange={setPolicyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Default — all templates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Default — all templates</SelectItem>
                  {policies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Nuclei: Template categories */}
          {isNuclei && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Template Categories</Label>
                <button
                  type="button"
                  onClick={aiSuggestScope}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-1.5 rounded-md bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  KI-Empfehlung
                </button>
              </div>
              {aiReasoning && (
                <p className="rounded-md bg-purple-50 px-3 py-2 text-xs text-purple-700 border border-purple-200">
                  ✨ {aiReasoning}
                </p>
              )}
              <div className="space-y-2 rounded-md border p-3">
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <div key={cat.id} className="flex items-start gap-2">
                    <Checkbox
                      id={cat.id}
                      checked={categories.includes(cat.id)}
                      onCheckedChange={() => toggleCategory(cat.id)}
                      className="mt-0.5"
                    />
                    <label htmlFor={cat.id} className="cursor-pointer space-y-0.5">
                      <div className="text-sm font-medium leading-none">{cat.label}</div>
                      <div className="text-xs text-muted-foreground">{cat.description}</div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ZAP WEB_CRAWL: crawl depth */}
          {scanType === 'WEB_CRAWL' && (
            <div className="space-y-1.5">
              <Label>Crawl Depth</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={crawlDepth}
                onChange={(e) => setCrawlDepth(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Max link depth for the ZAP Spider (1–20, default 5).
              </p>
            </div>
          )}

          {/* ZAP API_SCAN: OpenAPI spec */}
          {scanType === 'API_SCAN' && (
            <div className="space-y-1.5">
              <Label>OpenAPI Specification</Label>
              <Input
                placeholder="https://api.example.com/openapi.json"
                value={openApiSpec}
                onChange={(e) => setOpenApiSpec(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                URL to an OpenAPI/Swagger spec, or paste inline YAML/JSON below.
              </p>
              {!openApiSpec.startsWith('http') && openApiSpec.trim() && (
                <Textarea
                  className="font-mono text-xs"
                  rows={6}
                  placeholder="openapi: 3.0.0&#10;info:&#10;  title: My API&#10;  version: 1.0.0&#10;..."
                  value={openApiSpec}
                  onChange={(e) => setOpenApiSpec(e.target.value)}
                />
              )}
            </div>
          )}

          {/* Optional credentials */}
          <div className="space-y-2">
            <Label>Authentication (optional)</Label>
            <Select value={credentialType} onValueChange={setCredentialType}>
              <SelectTrigger>
                <SelectValue placeholder="None — unauthenticated scan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                <SelectItem value="bearer">Bearer Token</SelectItem>
                <SelectItem value="basic">Basic Auth (user:pass)</SelectItem>
                <SelectItem value="cookie">Cookie</SelectItem>
              </SelectContent>
            </Select>
            {credentialType && (
              <>
                <Input
                  type="password"
                  placeholder={
                    credentialType === 'bearer' ? 'Token value' :
                    credentialType === 'basic' ? 'username:password' :
                    'Cookie header value'
                  }
                  value={credentialValue}
                  onChange={(e) => setCredentialValue(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Credentials are encrypted with AES-256-GCM and never stored in plaintext.
                </p>
              </>
            )}
          </div>

          {isZap && (
            <p className="text-xs text-amber-600 dark:text-amber-400 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-2">
              ZAP scans run for 1–2 hours. The scan will continue in the background — you can close this page.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start Scan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
