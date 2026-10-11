'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, ExternalLink, Copy, CheckCheck, AlertTriangle,
  Save, Trash2, Info,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface SamlConfig {
  id: string;
  organizationId: string;
  enabled: boolean;
  idpEntryPoint: string;
  spEntityId: string;
  attrEmail: string;
  attrFirstName: string;
  attrLastName: string;
  certConfigured: boolean;
}

function authHeader() {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('ptaas_access_token') ?? '') : '';
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export default function SsoSettingsPage() {
  const [config, setConfig] = useState<SamlConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [idpEntryPoint, setIdpEntryPoint] = useState('');
  const [idpCert, setIdpCert] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [attrEmail, setAttrEmail] = useState('email');
  const [attrFirstName, setAttrFirstName] = useState('firstName');
  const [attrLastName, setAttrLastName] = useState('lastName');
  const [copiedMeta, setCopiedMeta] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/org/saml/config`, { headers: authHeader() });
      if (res.status === 404) {
        setConfig(null);
      } else if (res.ok) {
        const data: SamlConfig = await res.json();
        setConfig(data);
        setIdpEntryPoint(data.idpEntryPoint);
        setEnabled(data.enabled);
        setAttrEmail(data.attrEmail);
        setAttrFirstName(data.attrFirstName);
        setAttrLastName(data.attrLastName);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!idpEntryPoint || !idpCert) {
      setError('IdP Entry Point URL and Certificate are required.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_URL}/org/saml/config`, {
        method: 'PUT',
        headers: authHeader(),
        body: JSON.stringify({ idpEntryPoint, idpCert, enabled, attrEmail, attrFirstName, attrLastName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `HTTP ${res.status}`);
      }
      setSuccess('SAML configuration saved.');
      setIdpCert(''); // clear cert field after save for security
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('Remove SAML configuration? This will disable SSO for your organization.')) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/org/saml/config`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setConfig(null);
      setIdpEntryPoint('');
      setIdpCert('');
      setEnabled(false);
      setSuccess('SAML configuration removed.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  const metadataUrl = config
    ? `${API_URL.replace('/api', '')}/api/auth/saml/${config.organizationId}/metadata`
    : null;

  async function copyMetadataUrl() {
    if (!metadataUrl) return;
    await navigator.clipboard.writeText(metadataUrl);
    setCopiedMeta(true);
    setTimeout(() => setCopiedMeta(false), 2000);
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">SAML 2.0 Single Sign-On</h2>
          <p className="text-sm text-gray-500">Configure your IdP (Okta, Azure AD, Google Workspace, etc.)</p>
        </div>
        {config && (
          <span className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${config.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {config.enabled ? 'Enabled' : 'Disabled'}
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCheck className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* SP Metadata */}
      {config && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 space-y-3">
          <p className="text-sm font-medium text-indigo-800">Step 1 — Give your IdP the SP Metadata</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-3 py-2 text-xs border border-indigo-200 text-gray-700">
              {metadataUrl}
            </code>
            <button
              onClick={copyMetadataUrl}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 transition"
            >
              {copiedMeta ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copiedMeta ? 'Copied!' : 'Copy'}
            </button>
            <a
              href={metadataUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 transition"
            >
              <ExternalLink className="w-3 h-3" />
              Open
            </a>
          </div>
          <p className="text-xs text-indigo-600">
            ACS URL: <code>{metadataUrl?.replace('/metadata', '/callback')}</code>
          </p>
        </div>
      )}

      {/* Config Form */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-medium text-gray-700">
          {config ? 'Step 2 — Update IdP settings' : 'Configure your Identity Provider'}
        </p>

        {/* Enable toggle */}
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
          <span className="text-sm font-medium text-gray-700">Enable SAML SSO</span>
          <button
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </label>

        {/* IdP Entry Point */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            IdP SSO URL (Entry Point)
          </label>
          <input
            type="url"
            value={idpEntryPoint}
            onChange={(e) => setIdpEntryPoint(e.target.value)}
            placeholder="https://your-idp.example.com/sso/saml"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* IdP Certificate */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            IdP X.509 Certificate
            {config?.certConfigured && !idpCert && (
              <span className="ml-2 text-xs font-normal text-green-600">✓ Certificate configured — leave blank to keep existing</span>
            )}
          </label>
          <textarea
            value={idpCert}
            onChange={(e) => setIdpCert(e.target.value)}
            rows={5}
            placeholder="-----BEGIN CERTIFICATE-----&#10;MIIEIjANBgkqhkiG...&#10;-----END CERTIFICATE-----"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-400">Paste the PEM-encoded X.509 certificate from your IdP.</p>
        </div>

        {/* Attribute Mapping */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <Info className="h-4 w-4 text-gray-400" />
            SAML Attribute Mapping
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Email attribute', value: attrEmail, set: setAttrEmail },
              { label: 'First name attribute', value: attrFirstName, set: setAttrFirstName },
              { label: 'Last name attribute', value: attrLastName, set: setAttrLastName },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label className="mb-1 block text-xs text-gray-500">{label}</label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-gray-400">
            These are the SAML attribute names your IdP sends. Defaults work for Okta, Google Workspace, and most Azure AD configurations.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {saving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? 'Saving…' : config ? 'Update Configuration' : 'Save Configuration'}
          </button>

          {config && (
            <button
              onClick={remove}
              disabled={deleting}
              className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-xs text-gray-500 space-y-1">
        <p className="font-medium text-gray-700 mb-2">How SAML SSO works</p>
        <p>1. User clicks "Sign in with SSO" on the login page and enters your org slug.</p>
        <p>2. PTaaS redirects to your IdP Entry Point URL.</p>
        <p>3. After IdP authentication, the IdP POSTs a signed SAML Assertion to the ACS URL.</p>
        <p>4. PTaaS validates the signature using your IdP certificate and issues a JWT.</p>
        <p>5. New users are automatically provisioned (Just-in-Time) with the MEMBER role.</p>
      </div>
    </div>
  );
}
