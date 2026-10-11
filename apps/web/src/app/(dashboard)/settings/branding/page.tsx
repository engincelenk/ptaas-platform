'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Palette, Save } from 'lucide-react';
import { toast } from 'sonner';

interface BrandingData {
  logoUrl: string | null;
  brandPrimaryColor: string | null;
  brandCompanyName: string | null;
  brandFooterText: string | null;
}

function parseOrgId(): string | null {
  try {
    const token = localStorage.getItem('ptaas_access_token') ?? '';
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.orgId ?? null;
  } catch { return null; }
}

export default function BrandingPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [form, setForm] = useState({ logoUrl: '', brandPrimaryColor: '#6366f1', brandCompanyName: '', brandFooterText: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (oid: string) => {
    try {
      const org = await apiClient.get<BrandingData & { id: string }>(`/organizations/${oid}`);
      setForm({
        logoUrl: org.logoUrl ?? '',
        brandPrimaryColor: org.brandPrimaryColor ?? '#6366f1',
        brandCompanyName: org.brandCompanyName ?? '',
        brandFooterText: org.brandFooterText ?? '',
      });
    } catch { /* first load may fail */ }
  }, []);

  useEffect(() => {
    const oid = parseOrgId();
    setOrgId(oid);
    if (oid) load(oid);
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      await apiClient.patch(`/organizations/${orgId}/branding`, {
        logoUrl: form.logoUrl || null,
        brandPrimaryColor: form.brandPrimaryColor || null,
        brandCompanyName: form.brandCompanyName || null,
        brandFooterText: form.brandFooterText || null,
      });
      toast.success('Branding saved — new PDFs will use these settings');
    } catch {
      toast.error('Failed to save branding');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Palette className="h-6 w-6 text-indigo-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">White-Label Branding</h1>
          <p className="text-sm text-gray-500 mt-0.5">Customize PDF reports with your organization's branding</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm space-y-5">
          <h2 className="text-sm font-semibold text-gray-700">PDF Report Branding</h2>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Company Name</label>
              <input
                value={form.brandCompanyName}
                onChange={(e) => setForm((f) => ({ ...f, brandCompanyName: e.target.value }))}
                placeholder="Acme Security GmbH"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <p className="mt-1 text-xs text-gray-400">Replaces "PTaaS" in report headers and footers</p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Brand Color</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={form.brandPrimaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, brandPrimaryColor: e.target.value }))}
                  className="h-9 w-12 rounded border border-gray-200 cursor-pointer"
                />
                <input
                  value={form.brandPrimaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, brandPrimaryColor: e.target.value }))}
                  placeholder="#6366f1"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">Used for report cover and section headers</p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Logo URL</label>
              <input
                value={form.logoUrl}
                onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                placeholder="https://your-domain.com/logo.png"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <p className="mt-1 text-xs text-gray-400">PNG or SVG, shown in report header (recommended: 200×60px)</p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Footer Text</label>
              <input
                value={form.brandFooterText}
                onChange={(e) => setForm((f) => ({ ...f, brandFooterText: e.target.value }))}
                placeholder="Confidential — Acme Security GmbH"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <p className="mt-1 text-xs text-gray-400">Appears at the bottom of every page</p>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl overflow-hidden border border-gray-200">
            <div
              className="h-16 flex items-center px-6"
              style={{ backgroundColor: form.brandPrimaryColor || '#6366f1' }}
            >
              <span className="text-white font-bold text-lg">
                {form.brandCompanyName || 'Your Company'} — Security Report
              </span>
            </div>
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
              <p className="text-xs text-gray-400">{form.brandFooterText || 'Confidential — PTaaS Security Platform'}</p>
            </div>
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save Branding'}
          </button>
        </div>
      </form>
    </div>
  );
}
