'use client';

import { useState } from 'react';
import { Mail, ExternalLink, Monitor, Smartphone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/api-client';

interface Template {
  id: string;
  label: string;
  description: string;
  trigger: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'invitation',
    label: 'Team Invitation',
    description: 'Sent when a user is invited to join an organization.',
    trigger: 'Member invited',
  },
  {
    id: 'finding_assigned',
    label: 'Finding Assigned',
    description: 'Sent when a finding is assigned to a team member.',
    trigger: 'Bulk assign / manual assign',
  },
  {
    id: 'scan_complete',
    label: 'Scan Complete (with findings)',
    description: 'Sent when a scan finishes and findings were detected.',
    trigger: 'Scan COMPLETED',
  },
  {
    id: 'scan_complete_clean',
    label: 'Scan Complete (clean)',
    description: 'Sent when a scan finishes with no findings.',
    trigger: 'Scan COMPLETED (0 findings)',
  },
  {
    id: 'sla_breach',
    label: 'SLA Breach Alert',
    description: 'Sent to admins when findings exceed their SLA remediation window.',
    trigger: 'Overdue scheduler (daily)',
  },
  {
    id: 'password_reset',
    label: 'Password Reset',
    description: 'Sent when a user requests a password reset.',
    trigger: 'POST /auth/request-reset',
  },
  {
    id: 'digest',
    label: 'Daily Digest',
    description: 'Summary of unread notifications sent once per day.',
    trigger: 'Digest scheduler (daily 08:00)',
  },
  {
    id: 'threat_brief',
    label: 'Weekly Threat Brief',
    description: 'AI-generated security intelligence sent weekly.',
    trigger: 'Threat brief scheduler (weekly)',
  },
];

const TRIGGER_COLOR: Record<string, string> = {
  'Member invited': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Bulk assign / manual assign': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'Scan COMPLETED': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  'Scan COMPLETED (0 findings)': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  'Overdue scheduler (daily)': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  'POST /auth/request-reset': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  'Digest scheduler (daily 08:00)': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  'Threat brief scheduler (weekly)': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
};

export default function EmailTemplatesPage() {
  const [selected, setSelected] = useState<Template | null>(null);
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');

  const token = typeof window !== 'undefined' ? localStorage.getItem('ptaas_access_token') ?? '' : '';
  const previewSrc = selected
    ? `${apiUrl('/admin/mail/preview')}?template=${selected.id}&token=${encodeURIComponent(token)}`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Mail className="h-5 w-5 text-muted-foreground" />
          Email Templates
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Preview all transactional email templates. Templates use a shared base layout with responsive design.
        </p>
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        {/* Template list */}
        <div className="space-y-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t)}
              className={`w-full text-left rounded-xl border p-3.5 transition-colors ${
                selected?.id === t.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t.description}</p>
              <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-medium ${TRIGGER_COLOR[t.trigger] ?? 'bg-muted text-muted-foreground'}`}>
                {t.trigger}
              </span>
            </button>
          ))}
        </div>

        {/* Preview pane */}
        <Card className="min-h-[600px] flex flex-col">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">
                {selected ? selected.label : 'Select a template'}
              </CardTitle>
              {selected && (
                <CardDescription className="mt-0.5">Live preview with sample data</CardDescription>
              )}
            </div>
            {selected && (
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border overflow-hidden">
                  <button
                    onClick={() => setViewport('desktop')}
                    className={`px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors ${
                      viewport === 'desktop' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                    }`}
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    Desktop
                  </button>
                  <button
                    onClick={() => setViewport('mobile')}
                    className={`px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors ${
                      viewport === 'mobile' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    Mobile
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs h-7"
                  onClick={() => previewSrc && window.open(previewSrc, '_blank')}
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 p-4">
            {!selected ? (
              <div className="h-full flex items-center justify-center border-2 border-dashed border-border rounded-xl">
                <div className="text-center">
                  <Mail className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Select a template to preview</p>
                </div>
              </div>
            ) : (
              <div
                className={`mx-auto transition-all duration-300 bg-slate-100 rounded-xl overflow-hidden ${
                  viewport === 'mobile' ? 'max-w-[390px]' : 'max-w-full'
                }`}
                style={{ height: '600px' }}
              >
                <iframe
                  src={previewSrc ?? ''}
                  title={`Preview: ${selected.label}`}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
