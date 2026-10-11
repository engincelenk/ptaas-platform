'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, FileJson, FileCode2, CheckCircle2, AlertCircle, X, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface Target {
  id: string;
  value: string;
  type: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  findingIds: string[];
}

interface Props {
  projectId: string;
  targets: Target[];
  onClose: () => void;
  onImported: () => void;
}

const FORMAT_INFO: Record<string, { label: string; icon: React.ReactNode; accept: string; endpoint: string; hint: string }> = {
  burp: {
    label: 'Burp Suite XML',
    icon: <FileCode2 className="h-4 w-4" />,
    accept: '.xml,application/xml,text/xml',
    endpoint: 'burp',
    hint: 'File → Save copy → XML format from Burp Suite Professional',
  },
  zap: {
    label: 'OWASP ZAP JSON',
    icon: <FileJson className="h-4 w-4" />,
    accept: '.json,application/json',
    endpoint: 'zap',
    hint: 'Report → JSON from OWASP ZAP (Active Scan Results)',
  },
  json: {
    label: 'Generic JSON',
    icon: <FileJson className="h-4 w-4" />,
    accept: '.json,application/json',
    endpoint: 'json',
    hint: 'JSON array of findings or PTaaS export format',
  },
};

export function ImportFindingsDialog({ projectId, targets, onClose, onImported }: Props) {
  const [format, setFormat] = useState('burp');
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [deduplication, setDeduplication] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fmt = FORMAT_INFO[format];

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error('File too large (max 10 MB)'); return; }
    setFile(f);
    setResult(null);
  };

  const doImport = async () => {
    if (!file || !targetId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('ptaas_access_token') ?? '';
      const fd = new FormData();
      fd.append('file', file);
      fd.append('targetId', targetId);
      fd.append('deduplication', String(deduplication));

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/projects/${projectId}/findings/import/${fmt.endpoint}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Import failed' }));
        throw new Error(err.message ?? 'Import failed');
      }

      const data: ImportResult = await res.json();
      setResult(data);
      if (data.imported > 0) {
        toast.success(`Imported ${data.imported} finding${data.imported !== 1 ? 's' : ''}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import Findings
          </DialogTitle>
        </DialogHeader>

        {result ? (
          /* Result screen */
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border p-4">
                <div className="text-2xl font-bold text-green-600">{result.imported}</div>
                <div className="text-xs text-muted-foreground mt-1">Imported</div>
              </div>
              <div className="rounded-xl border p-4">
                <div className="text-2xl font-bold text-yellow-600">{result.skipped}</div>
                <div className="text-xs text-muted-foreground mt-1">Skipped (dupes)</div>
              </div>
              <div className="rounded-xl border p-4">
                <div className="text-2xl font-bold text-red-600">{result.errors.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Errors</div>
              </div>
            </div>

            {result.imported > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <p className="text-sm text-green-800 dark:text-green-300">
                  {result.imported} finding{result.imported !== 1 ? 's' : ''} imported — AI analysis will run in the background.
                </p>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1 max-h-36 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive">{e}</p>
                ))}
              </div>
            )}

            <DialogFooter>
              {result.imported > 0 && (
                <Button onClick={() => { onImported(); onClose(); }}>
                  View Findings
                </Button>
              )}
              <Button variant="outline" onClick={() => { setResult(null); setFile(null); }}>
                Import More
              </Button>
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          /* Import form */
          <div className="space-y-4 py-2">
            {/* Format */}
            <div className="space-y-1.5">
              <Label>Format</Label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(FORMAT_INFO).map(([key, info]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setFormat(key); setFile(null); }}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs transition-colors ${
                      format === key
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-muted-foreground'
                    }`}
                  >
                    {info.icon}
                    <span className="font-medium text-center leading-tight">{info.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{fmt.hint}</span>
              </div>
            </div>

            {/* Target */}
            <div className="space-y-1.5">
              <Label>Target <span className="text-destructive">*</span></Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger><SelectValue placeholder="Select target…" /></SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="font-mono text-xs">{t.value}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{t.type}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* File drop */}
            <div className="space-y-1.5">
              <Label>File</Label>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0] ?? null); }}
                className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'
                }`}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm font-medium">Drop file here or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">Max 10 MB · {fmt.accept}</p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={fmt.accept}
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Deduplication */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Skip duplicates</p>
                <p className="text-xs text-muted-foreground">Don&apos;t import findings with a title that already exists on this target</p>
              </div>
              <Switch checked={deduplication} onCheckedChange={setDeduplication} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
              <Button onClick={doImport} disabled={loading || !file || !targetId} className="gap-2">
                {loading ? (
                  <><span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Importing…</>
                ) : (
                  <><Upload className="h-4 w-4" />Import</>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
