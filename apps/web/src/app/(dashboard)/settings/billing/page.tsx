'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApiQuery } from '@/hooks/use-api-query';
import { Scan, Bug, Users } from 'lucide-react';

interface Usage {
  orgId: string;
  period: { start: string; end: string };
  usage: { scanCount: number; findingCount: number; userCount: number };
}

interface Snapshot {
  id: string;
  periodStart: string;
  scanCount: number;
  findingCount: number;
  userCount: number;
}

export default function BillingPage() {
  const { data: current } = useApiQuery<Usage>('/billing/usage');

  const { data: history } = useApiQuery<Snapshot[]>('/billing/usage/history?months=6');

  const chartData = history?.map((s) => ({
    month: new Date(s.periodStart).toLocaleDateString('en', { month: 'short', year: '2-digit' }),
    scans: s.scanCount,
    findings: s.findingCount,
  })).reverse() ?? [];

  const maxValue = Math.max(1, ...chartData.map((d) => Math.max(d.scans, d.findings)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing & Usage</h1>
        <p className="text-muted-foreground text-sm">Current month usage statistics</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scans this month</CardTitle>
            <Scan className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{current?.usage.scanCount ?? '—'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Findings this month</CardTitle>
            <Bug className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{current?.usage.findingCount ?? '—'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{current?.usage.userCount ?? '—'}</div>
          </CardContent>
        </Card>
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Usage History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4 h-60" role="img" aria-label="Usage history: scans and findings per month">
              {chartData.map((d) => (
                <div key={d.month} className="flex-1 flex flex-col items-center gap-2 h-full">
                  <div className="flex-1 w-full flex items-end justify-center gap-1">
                    <div
                      className="w-1/3 rounded-t bg-primary"
                      style={{ height: `${(d.scans / maxValue) * 100}%` }}
                      title={`Scans: ${d.scans}`}
                    />
                    <div
                      className="w-1/3 rounded-t bg-muted-foreground"
                      style={{ height: `${(d.findings / maxValue) * 100}%` }}
                      title={`Findings: ${d.findings}`}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{d.month}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" />Scans</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted-foreground" />Findings</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
