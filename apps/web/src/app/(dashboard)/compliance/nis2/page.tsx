'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApiQuery } from '@/hooks/use-api-query';
import { Shield, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

const NIS2_ARTICLES: Record<string, string> = {
  'NIS2-Art21-a': 'Art. 21.2.a — Risk Analysis',
  'NIS2-Art21-b': 'Art. 21.2.b — Incident Handling',
  'NIS2-Art21-c': 'Art. 21.2.c — Business Continuity',
  'NIS2-Art21-d': 'Art. 21.2.d — Supply Chain Security',
  'NIS2-Art21-e': 'Art. 21.2.e — Secure Acquisition',
  'NIS2-Art21-f': 'Art. 21.2.f — Vulnerability Handling',
  'NIS2-Art21-g': 'Art. 21.2.g — Risk Management Assessment',
  'NIS2-Art21-h': 'Art. 21.2.h — Cyber Hygiene & Training',
  'NIS2-Art21-i': 'Art. 21.2.i — Cryptography',
  'NIS2-Art21-j': 'Art. 21.2.j — HR Security & Access Control',
  'NIS2-Art21-k': 'Art. 21.2.k — Multi-Factor Authentication',
  'NIS2-Art23':   'Art. 23 — Incident Reporting (24h/72h)',
};

interface ControlResult {
  controlId: string;
  controlName: string;
  controlDescription: string;
  openFindings: number;
  criticalFindings: number;
  status: 'COMPLIANT' | 'WARNING' | 'CRITICAL';
}

interface Nis2Report {
  framework: string;
  controls: ControlResult[];
  summary: { total: number; compliant: number; warning: number; critical: number };
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'COMPLIANT') return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === 'WARNING') return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'COMPLIANT') return 'default';
  if (status === 'WARNING') return 'secondary';
  return 'destructive';
}

export default function Nis2Page() {
  const [projectId, setProjectId] = useState<string>('');

  const { data: projects } = useApiQuery<{ id: string; name: string }[]>('/projects');

  const { data: report, isLoading } = useApiQuery<Nis2Report>(
    projectId ? `/projects/${projectId}/compliance/frameworks/nis2` : null,
  );

  const score = report
    ? Math.round((report.summary.compliant / report.summary.total) * 100)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-500" />
            NIS2 Compliance
          </h1>
          <p className="text-muted-foreground text-sm">EU Directive 2022/2555 — Network and Information Security</p>
        </div>

        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select project..." />
          </SelectTrigger>
          <SelectContent>
            {projects?.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!projectId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Select a project to view NIS2 compliance status
          </CardContent>
        </Card>
      )}

      {projectId && isLoading && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Loading...</CardContent></Card>
      )}

      {report && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Score</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-bold">{score}%</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-green-600">Compliant</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-bold text-green-600">{report.summary.compliant}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-yellow-600">Warning</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-bold text-yellow-600">{report.summary.warning}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-red-600">Critical</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-bold text-red-600">{report.summary.critical}</div></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>NIS2 Article Mapping</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {report.controls.map((ctrl) => (
                  <div key={ctrl.controlId} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <StatusIcon status={ctrl.status} />
                      <div>
                        <div className="font-medium text-sm">{NIS2_ARTICLES[ctrl.controlId] ?? ctrl.controlId}</div>
                        <div className="text-xs text-muted-foreground">{ctrl.controlDescription}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {ctrl.openFindings > 0 && (
                        <span className="text-xs text-muted-foreground">{ctrl.openFindings} open findings</span>
                      )}
                      <Badge variant={statusBadgeVariant(ctrl.status)}>{ctrl.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
