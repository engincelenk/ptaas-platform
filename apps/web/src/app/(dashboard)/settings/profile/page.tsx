'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { User, Lock, Bell, Shield, CheckCircle2, XCircle, Eye, EyeOff, Copy, CheckCheck, AlertTriangle } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';

type MfaStep = 'idle' | 'setup' | 'confirm' | 'backup';

interface MfaSetupData {
  qrCode: string;
  secret: string;
  backupCodes: string[];
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  mfaEnabled: boolean;
  emailVerified: boolean;
  createdAt: string;
}

interface NotifPref {
  eventType: string;
  enabled: boolean;
}

const EVENT_LABELS: Record<string, { label: string; description: string }> = {
  'scan.complete': { label: 'Scan completed', description: 'When a scan finishes successfully' },
  'scan.failed': { label: 'Scan failed', description: 'When a scan encounters an error' },
  'finding.critical': { label: 'Critical finding', description: 'When a new critical severity finding is created' },
  'finding.overdue': { label: 'Finding overdue', description: 'When a finding passes its due date' },
  'target.down': { label: 'Target down', description: 'When a monitored target becomes unreachable' },
  'threat.brief.generated': { label: 'Threat brief ready', description: 'When weekly threat intelligence is generated' },
  'member.invited': { label: 'New member invitation', description: 'When someone is invited to your organization' },
};

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<NotifPref[]>([]);
  const [loading, setLoading] = useState(true);

  // Profile form state
  const [name, setName] = useState('');
  const [nameLoading, setNameLoading] = useState(false);

  // Password form state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // Notification prefs
  const [prefsLoading, setPrefsLoading] = useState(false);

  // MFA state
  const [mfaStep, setMfaStep] = useState<MfaStep>('idle');
  const [mfaData, setMfaData] = useState<MfaSetupData | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [backupCopied, setBackupCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get<UserProfile>('/me'),
      apiClient.get<NotifPref[]>('/me/notification-preferences'),
    ]).then(([p, n]) => {
      setProfile(p);
      setName(p.name);
      setNotifPrefs(n);
    }).catch(() => toast.error('Failed to load profile')).finally(() => setLoading(false));
  }, []);

  const saveName = async () => {
    if (!name.trim()) return;
    setNameLoading(true);
    try {
      const updated = await apiClient.patch<UserProfile>('/me', { name });
      setProfile((prev) => prev ? { ...prev, name: updated.name } : prev);
      toast.success('Name updated');
    } catch { toast.error('Failed to update name'); }
    finally { setNameLoading(false); }
  };

  const changePassword = async () => {
    if (newPw.length < 12) { toast.error('Password must be at least 12 characters'); return; }
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    setPwLoading(true);
    try {
      await apiClient.patch('/me/password', { currentPassword: currentPw, newPassword: newPw });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      toast.success('Password changed successfully');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password');
    } finally { setPwLoading(false); }
  };

  const startMfaSetup = async () => {
    setMfaLoading(true);
    try {
      const data = await apiClient.get<MfaSetupData>('/auth/mfa/setup');
      setMfaData(data);
      setMfaStep('setup');
    } catch { toast.error('Failed to start MFA setup'); }
    finally { setMfaLoading(false); }
  };

  const confirmMfa = async () => {
    if (totpCode.length !== 6) return;
    setMfaLoading(true);
    try {
      await apiClient.post('/auth/mfa/setup/confirm', { totpCode });
      setMfaStep('backup');
      setProfile((prev) => prev ? { ...prev, mfaEnabled: true } : prev);
      toast.success('Two-factor authentication enabled!');
    } catch { toast.error('Invalid code — try again'); setTotpCode(''); }
    finally { setMfaLoading(false); }
  };

  const copySecret = () => {
    if (mfaData?.secret) {
      navigator.clipboard.writeText(mfaData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const copyBackupCodes = () => {
    if (mfaData?.backupCodes) {
      navigator.clipboard.writeText(mfaData.backupCodes.join('\n'));
      setBackupCopied(true);
      setTimeout(() => setBackupCopied(false), 2000);
    }
  };

  const togglePref = async (eventType: string, enabled: boolean) => {
    const updated = notifPrefs.map((p) => p.eventType === eventType ? { ...p, enabled } : p);
    setNotifPrefs(updated);
    setPrefsLoading(true);
    try {
      await apiClient.put('/me/notification-preferences', { preferences: updated });
    } catch { toast.error('Failed to save preferences'); }
    finally { setPrefsLoading(false); }
  };

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
      </div>
    );
  }

  if (!profile) return null;

  const pwStrength = newPw.length === 0 ? null : newPw.length < 12 ? 'weak' : newPw.length < 16 ? 'fair' : 'strong';
  const pwStrengthColors = { weak: 'text-red-600', fair: 'text-yellow-600', strong: 'text-green-600' };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile & Account</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your personal information and preferences.</p>
      </div>

      {/* Avatar + Overview */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold shrink-0">
              {initials(profile.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-lg truncate">{profile.name}</p>
              <p className="text-sm text-muted-foreground truncate">{profile.email}</p>
              <div className="flex items-center gap-2 mt-1.5">
                {profile.emailVerified
                  ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />Email verified</span>
                  : <span className="inline-flex items-center gap-1 text-xs text-orange-600"><XCircle className="h-3.5 w-3.5" />Email not verified</span>}
                {profile.mfaEnabled && (
                  <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">MFA enabled</Badge>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground shrink-0">
              Member since {new Date(profile.createdAt).toLocaleDateString()}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Display Name */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            Display Name
          </CardTitle>
          <CardDescription>This name is shown to teammates and in reports.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveName()} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={profile.email} disabled className="opacity-60" />
            <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
          </div>
          <Button onClick={saveName} disabled={nameLoading || !name.trim() || name === profile.name} size="sm">
            {nameLoading ? 'Saving…' : 'Save Name'}
          </Button>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Change Password
          </CardTitle>
          <CardDescription>Minimum 12 characters. Use a mix of letters, numbers and symbols.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Current Password</Label>
            <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            {pwStrength && (
              <p className={`text-xs font-medium ${pwStrengthColors[pwStrength]}`}>
                Strength: {pwStrength.charAt(0).toUpperCase() + pwStrength.slice(1)}
                {pwStrength === 'weak' && ' — too short'}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Confirm New Password</Label>
            <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
            {confirmPw && newPw !== confirmPw && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
          </div>
          <Button
            onClick={changePassword}
            disabled={pwLoading || !currentPw || !newPw || newPw !== confirmPw || newPw.length < 12}
            size="sm"
          >
            {pwLoading ? 'Changing…' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>

      {/* MFA */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>Protect your account with a TOTP authenticator app (Google Authenticator, Authy, 1Password…)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Status row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">TOTP Authenticator</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {profile.mfaEnabled ? 'Active — your account requires a 6-digit code on every login.' : 'Not enabled.'}
              </p>
            </div>
            {profile.mfaEnabled
              ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 gap-1"><CheckCircle2 className="h-3 w-3" />Enabled</Badge>
              : <Badge variant="secondary">Disabled</Badge>}
          </div>

          {/* Step: idle — not enabled */}
          {!profile.mfaEnabled && mfaStep === 'idle' && (
            <Button size="sm" onClick={startMfaSetup} disabled={mfaLoading} className="gap-2">
              {mfaLoading
                ? <><span className="h-3.5 w-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Starting…</>
                : <><Shield className="h-3.5 w-3.5" />Enable Two-Factor Authentication</>}
            </Button>
          )}

          {/* Step: setup — show QR code */}
          {mfaStep === 'setup' && mfaData && (
            <div className="space-y-4 rounded-xl border p-4 bg-muted/30">
              <p className="text-sm font-medium">Step 1 — Scan this QR code</p>
              <div className="flex gap-4 items-start">
                {/* QR Code — backend returns data URI */}
                <div className="rounded-xl border bg-white p-2 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mfaData.qrCode} alt="TOTP QR code" width={140} height={140} />
                </div>
                <div className="space-y-3 flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    Can&apos;t scan? Enter this key manually in your authenticator app:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-background border rounded px-2 py-1.5 truncate">
                      {showSecret ? mfaData.secret : '•'.repeat(32)}
                    </code>
                    <button onClick={() => setShowSecret((v) => !v)} className="text-muted-foreground hover:text-foreground">
                      {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={copySecret} className="text-muted-foreground hover:text-foreground">
                      {copiedSecret ? <CheckCheck className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Step 2 — Enter the 6-digit code</p>
                <div className="flex gap-2">
                  <Input
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-36 font-mono text-center text-lg tracking-[0.3em]"
                    maxLength={6}
                    onKeyDown={(e) => e.key === 'Enter' && confirmMfa()}
                  />
                  <Button onClick={confirmMfa} disabled={mfaLoading || totpCode.length !== 6} size="sm">
                    {mfaLoading ? 'Verifying…' : 'Verify & Enable'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setMfaStep('idle'); setMfaData(null); setTotpCode(''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step: backup codes */}
          {mfaStep === 'backup' && mfaData && (
            <div className="space-y-4 rounded-xl border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/20 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">Save your backup codes</p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
                    Each code can only be used once. Store them somewhere safe — they are the only way to access your account if you lose your authenticator.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {mfaData.backupCodes.map((code) => (
                  <code key={code} className="text-xs font-mono bg-background border rounded px-2.5 py-1.5 text-center">
                    {code}
                  </code>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyBackupCodes} className="gap-1.5">
                  {backupCopied ? <><CheckCheck className="h-3.5 w-3.5 text-green-500" />Copied!</> : <><Copy className="h-3.5 w-3.5" />Copy all codes</>}
                </Button>
                <Button size="sm" onClick={() => setMfaStep('idle')}>
                  Done — I&apos;ve saved my codes
                </Button>
              </div>
            </div>
          )}

          {/* MFA already enabled */}
          {profile.mfaEnabled && mfaStep === 'idle' && (
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 px-4 py-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              <p className="text-xs text-green-700 dark:text-green-300">
                Your account is protected with two-factor authentication. To disable or rotate TOTP, contact your administrator.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            Notification Preferences
            {prefsLoading && <span className="text-xs text-muted-foreground font-normal ml-auto">Saving…</span>}
          </CardTitle>
          <CardDescription>Choose which events trigger in-app and email notifications.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {notifPrefs.map((pref) => {
              const meta = EVENT_LABELS[pref.eventType];
              if (!meta) return null;
              return (
                <div key={pref.eventType} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">{meta.description}</p>
                  </div>
                  <Switch
                    checked={pref.enabled}
                    onCheckedChange={(enabled) => togglePref(pref.eventType, enabled)}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
