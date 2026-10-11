'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiQuery } from '@/hooks/use-api-query';
import { Webhook, Plug, BookOpen, ExternalLink } from 'lucide-react';

interface IntegrationEntry {
  id: string;
  name: string;
  category: string;
  status: 'available' | 'coming_soon';
  description: string;
}

interface WebhookTemplate {
  id: string;
  name: string;
  description: string;
  eventType: string;
  samplePayload: unknown;
}

const CATEGORY_LABELS: Record<string, string> = {
  ticketing: 'Ticketing', messaging: 'Messaging', scm: 'SCM / Version Control',
  alerting: 'Alerting', siem: 'SIEM', ide: 'IDE', generic: 'Generic',
};

export default function MarketplacePage() {
  const [selectedTemplate, setSelectedTemplate] = useState<WebhookTemplate | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const { data: integrations } = useApiQuery<{ integrations: IntegrationEntry[]; categories: string[] }>(
    '/marketplace/integrations',
  );

  const { data: webhooks } = useApiQuery<{ templates: WebhookTemplate[] }>('/marketplace/webhook-templates');

  const filtered = integrations?.integrations.filter(
    (i) => categoryFilter === 'all' || i.category === categoryFilter,
  ) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API Marketplace</h1>
        <p className="text-muted-foreground text-sm">Integrations, webhook templates, and API resources</p>
      </div>

      <Tabs defaultValue="integrations">
        <TabsList>
          <TabsTrigger value="integrations"><Plug className="h-4 w-4 mr-2" />Integrations</TabsTrigger>
          <TabsTrigger value="webhooks"><Webhook className="h-4 w-4 mr-2" />Webhook Templates</TabsTrigger>
          <TabsTrigger value="api-docs"><BookOpen className="h-4 w-4 mr-2" />API Docs</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Badge
              variant={categoryFilter === 'all' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setCategoryFilter('all')}
            >
              All
            </Badge>
            {integrations?.categories.map((cat) => (
              <Badge
                key={cat}
                variant={categoryFilter === cat ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setCategoryFilter(cat)}
              >
                {CATEGORY_LABELS[cat] ?? cat}
              </Badge>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {filtered.map((integration) => (
              <Card key={integration.id} className="relative">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{integration.name}</CardTitle>
                    <Badge variant={integration.status === 'available' ? 'default' : 'secondary'}>
                      {integration.status === 'available' ? 'Available' : 'Coming Soon'}
                    </Badge>
                  </div>
                  <CardDescription>{integration.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[integration.category] ?? integration.category}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {webhooks?.templates.map((tpl) => (
              <Card
                key={tpl.id}
                className={`cursor-pointer transition-colors ${selectedTemplate?.id === tpl.id ? 'border-primary' : ''}`}
                onClick={() => setSelectedTemplate(tpl.id === selectedTemplate?.id ? null : tpl)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{tpl.name}</CardTitle>
                  <CardDescription>{tpl.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline" className="text-xs font-mono">{tpl.eventType}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedTemplate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Sample Payload — {selectedTemplate.eventType}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-64">
                  {JSON.stringify(selectedTemplate.samplePayload, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="api-docs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>PTaaS REST API</CardTitle>
              <CardDescription>OpenAPI 3.0 — fully documented with request/response schemas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <a href="/api-docs" target="_blank" rel="noopener" className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <ExternalLink className="h-4 w-4" />
                  Swagger UI
                </a>
                <a href="/api-docs-json" target="_blank" rel="noopener" className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <ExternalLink className="h-4 w-4" />
                  OpenAPI JSON
                </a>
              </div>

              <div className="border rounded-lg divide-y text-sm">
                <div className="flex justify-between px-4 py-3">
                  <span className="font-medium">Base URL</span>
                  <code className="text-muted-foreground">/api/v1</code>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <span className="font-medium">Authentication</span>
                  <code className="text-muted-foreground">Bearer JWT / API Key</code>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <span className="font-medium">VS Code Extension</span>
                  <code className="text-muted-foreground">/api/v1/vscode/*</code>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
