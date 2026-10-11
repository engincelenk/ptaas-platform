'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Clock, CalendarClock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';

const PRESETS = [
  { label: 'Daily 2 AM', cron: '0 2 * * *' },
  { label: 'Weekly Mon', cron: '0 2 * * 1' },
  { label: 'Monthly 1st', cron: '0 2 1 * *' },
];

interface ScheduleCardProps {
  targetId: string;
  scheduleEnabled: boolean;
  scheduleCron: string | null;
  lastScheduledAt: string | null;
  onUpdated: () => void;
}

export function ScheduleCard({
  targetId,
  scheduleEnabled,
  scheduleCron,
  lastScheduledAt,
  onUpdated,
}: ScheduleCardProps) {
  const [cron, setCron] = useState(scheduleCron ?? '0 2 * * *');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/targets/${targetId}/schedule`, { cron });
      toast.success('Schedule saved');
      onUpdated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await apiClient.delete(`/targets/${targetId}/schedule`);
      toast.success('Schedule removed');
      onUpdated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          Automatic Scanning
          {scheduleEnabled && (
            <Badge variant="secondary" className="ml-auto text-xs">Active</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Cron Expression (UTC)</Label>
          <Input
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            className="font-mono text-sm"
            placeholder="0 2 * * *"
          />
          <div className="flex gap-1 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p.cron}
                type="button"
                onClick={() => setCron(p.cron)}
                className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {lastScheduledAt && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last run: {new Date(lastScheduledAt).toLocaleString()}
          </p>
        )}

        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving} className="flex-1">
            {saving ? 'Saving…' : scheduleEnabled ? 'Update Schedule' : 'Enable Schedule'}
          </Button>
          {scheduleEnabled && (
            <Button size="sm" variant="outline" onClick={clear} disabled={saving}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
