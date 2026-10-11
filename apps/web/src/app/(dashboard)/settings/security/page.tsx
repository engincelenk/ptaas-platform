'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { Shield, ShieldCheck, ShieldOff, RefreshCw, AlertTriangle } from 'lucide-react';

interface MfaStatus {
  mfaEnabled: boolean;
  backupCodesRemaining: number;
}

interface SetupData {
  qrCodeDataUrl: string;
  otpauthUrl: string;
  backupCodes: string[];
}

type Panel = 'overview' | 'setup-qr' | 'setup-backup' | 'setup-verify' | 'disable' | 'regenerate' | 'new-codes';

export default function SecuritySettingsPage() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<Panel>('overview');

  // Setup flow state
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [codesConfirmed, setCodesConfirmed] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);

  const loadStatus = async () => {
    try {
      const s = await apiClient.get<MfaStatus>('/auth/mfa/status');
      setStatus(s);
    } catch {
      toast.error('Failed to load MFA status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const startSetup = async () => {
    setActionLoading(true);
    setError('');
    try {
      const data = await apiClient.get<SetupData>('/auth/mfa/setup');
      setSetupData(data);
      setCodesConfirmed(false);
      setPanel('setup-qr');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start MFA setup');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError('');
    try {
      await apiClient.post('/auth/mfa/setup/confirm', { totpCode });
      toast.success('Two-factor authentication enabled');
      setPanel('overview');
      setTotpCode('');
      setSetupData(null);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setTotpCode('');
    } finally {
      setActionLoading(false);
    }
  };

  const disableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError('');
    try {
      await apiClient.post('/auth/mfa/disable', { totpCode });
      toast.success('Two-factor authentication disabled');
      setPanel('overview');
      setTotpCode('');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed — check your TOTP code');
      setTotpCode('');
    } finally {
      setActionLoading(false);
    }
  };

  const regenerateCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError('');
    try {
      const result = await apiClient.post<{ backupCodes: string[] }>('/auth/mfa/backup-codes/regenerate', { totpCode });
      setNewBackupCodes(result.backupCodes);
      setPanel('new-codes');
      setTotpCode('');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed — check your TOTP code');
      setTotpCode('');
    } finally {
      setActionLoading(false);
    }
  };

  const resetToOverview = () => {
    setPanel('overview');
    setTotpCode('');
    setError('');
    setSetupData(null);
    setNewBackupCodes([]);
    setCodesConfirmed(false);
  };

  if (loading) return <div className="p-6 text-muted-foreground text-sm">Loading…</div>;

  // ── New backup codes display ───────────────────────────────────────────────
  if (panel === 'new-codes') {
    return (
      <div className="max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">New Backup Codes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your old codes have been invalidated. Save these new codes securely — they won't be shown again.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted p-4">
          {newBackupCodes.map((code) => (
            <code key={code} className="font-mono text-sm text-center py-1.5">{code}</code>
          ))}
        </div>
        <button onClick={resetToOverview} className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity">
          Done
        </button>
      </div>
    );
  }

  // ── Setup flow: QR ─────────────────────────────────────────────────────────
  if (panel === 'setup-qr' && setupData) {
    return (
      <div className="max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Set up two-factor authentication</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
          </p>
        </div>
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setupData.qrCodeDataUrl} alt="MFA QR Code" width={200} height={200} className="rounded-xl border" />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Can't scan? Enter manually</summary>
          <code className="mt-2 block break-all rounded-lg bg-muted px-3 py-2 text-xs">{setupData.otpauthUrl}</code>
        </details>
        <div className="flex gap-3">
          <button onClick={resetToOverview} className="flex-1 rounded-lg border py-2.5 text-sm hover:bg-muted transition-colors">Cancel</button>
          <button onClick={() => setPanel('setup-backup')} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity">
            I've scanned it →
          </button>
        </div>
      </div>
    );
  }

  // ── Setup flow: Backup codes ───────────────────────────────────────────────
  if (panel === 'setup-backup' && setupData) {
    return (
      <div className="max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Save your backup codes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Store these 8 codes securely. Each can be used once if you lose access to your authenticator.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted p-4">
          {setupData.backupCodes.map((code) => (
            <code key={code} className="font-mono text-sm text-center py-1.5">{code}</code>
          ))}
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={codesConfirmed} onChange={(e) => setCodesConfirmed(e.target.checked)} />
          <span className="text-sm text-muted-foreground">
            I have saved these codes. I understand they won't be shown again.
          </span>
        </label>
        <div className="flex gap-3">
          <button onClick={() => setPanel('setup-qr')} className="flex-1 rounded-lg border py-2.5 text-sm hover:bg-muted transition-colors">← Back</button>
          <button onClick={() => setPanel('setup-verify')} disabled={!codesConfirmed} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
            I've saved my codes →
          </button>
        </div>
      </div>
    );
  }

  // ── Setup flow: Verify ────────────────────────────────────────────────────
  if (panel === 'setup-verify') {
    return (
      <div className="max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Confirm your authenticator</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter the 6-digit code from your app to verify setup is working correctly.
          </p>
        </div>
        <form onSubmit={confirmSetup} className="space-y-4">
          <input
            type="text" inputMode="numeric" autoComplete="one-time-code"
            maxLength={6} value={totpCode} autoFocus
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full rounded-xl border px-3 py-3 text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setPanel('setup-backup')} className="flex-1 rounded-lg border py-2.5 text-sm hover:bg-muted transition-colors">← Back</button>
            <button type="submit" disabled={actionLoading || totpCode.length !== 6} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
              {actionLoading ? 'Enabling…' : 'Enable 2FA'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── Disable MFA ────────────────────────────────────────────────────────────
  if (panel === 'disable') {
    return (
      <div className="max-w-lg space-y-6">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-destructive mb-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-semibold text-sm">Security warning</span>
          </div>
          <p className="text-sm text-muted-foreground">Disabling 2FA reduces your account security. Anyone with your password can sign in.</p>
        </div>
        <form onSubmit={disableMfa} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Current authenticator code</label>
            <input
              type="text" inputMode="numeric" autoComplete="one-time-code"
              maxLength={6} value={totpCode} autoFocus
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full rounded-xl border px-3 py-3 text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={resetToOverview} className="flex-1 rounded-lg border py-2.5 text-sm hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={actionLoading || totpCode.length !== 6} className="flex-1 rounded-lg bg-destructive text-destructive-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
              {actionLoading ? 'Disabling…' : 'Disable 2FA'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── Regenerate backup codes ────────────────────────────────────────────────
  if (panel === 'regenerate') {
    return (
      <div className="max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Regenerate backup codes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This will invalidate all existing backup codes. Enter your TOTP code to confirm.
          </p>
        </div>
        <form onSubmit={regenerateCodes} className="space-y-4">
          <input
            type="text" inputMode="numeric" autoComplete="one-time-code"
            maxLength={6} value={totpCode} autoFocus
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full rounded-xl border px-3 py-3 text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={resetToOverview} className="flex-1 rounded-lg border py-2.5 text-sm hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={actionLoading || totpCode.length !== 6} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
              {actionLoading ? 'Generating…' : 'Generate new codes'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── Overview ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage two-factor authentication and account security settings.</p>
      </div>

      {/* 2FA Status Card */}
      <div className={`rounded-xl border p-5 space-y-4 ${status?.mfaEnabled ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {status?.mfaEnabled
              ? <ShieldCheck className="h-6 w-6 text-green-600 shrink-0" />
              : <ShieldOff className="h-6 w-6 text-orange-500 shrink-0" />
            }
            <div>
              <p className={`font-semibold ${status?.mfaEnabled ? 'text-green-800' : 'text-orange-800'}`}>
                {status?.mfaEnabled ? 'Two-factor authentication is enabled' : 'Two-factor authentication is disabled'}
              </p>
              <p className={`text-sm mt-0.5 ${status?.mfaEnabled ? 'text-green-700' : 'text-orange-700'}`}>
                {status?.mfaEnabled
                  ? `${status.backupCodesRemaining} backup code${status.backupCodesRemaining !== 1 ? 's' : ''} remaining`
                  : 'Your account is protected by password only. Enable 2FA for better security.'
                }
              </p>
            </div>
          </div>
          {!status?.mfaEnabled && (
            <button
              onClick={startSetup}
              disabled={actionLoading}
              className="shrink-0 rounded-lg bg-orange-600 text-white px-4 py-2 text-sm font-medium hover:bg-orange-700 transition-colors disabled:opacity-50"
            >
              {actionLoading ? 'Loading…' : 'Enable 2FA'}
            </button>
          )}
        </div>

        {status?.mfaEnabled && (
          <div className="flex gap-2 pt-1 border-t border-green-200">
            <button
              onClick={() => setPanel('regenerate')}
              className="flex items-center gap-1.5 rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-50 transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Regenerate backup codes
            </button>
            <button
              onClick={() => setPanel('disable')}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors"
            >
              <ShieldOff className="h-3 w-3" /> Disable 2FA
            </button>
          </div>
        )}
      </div>

      {/* Info section */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Shield className="h-4 w-4" /> How TOTP 2FA works
        </div>
        <ul className="text-sm text-muted-foreground space-y-1.5 list-none">
          <li>• After entering your password, you'll be prompted for a 6-digit code from your authenticator app.</li>
          <li>• Codes rotate every 30 seconds using RFC 6238 TOTP standard.</li>
          <li>• Backup codes can be used if you lose your device — each code works once.</li>
          <li>• Compatible with: Google Authenticator, Authy, 1Password, Bitwarden, and any TOTP app.</li>
        </ul>
      </div>
    </div>
  );
}
