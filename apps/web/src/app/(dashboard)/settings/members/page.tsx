'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Mail, Shield, ChevronDown, RotateCcw, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiClient } from '@/lib/api-client';

type Role = 'OWNER' | 'ADMIN' | 'SECURITY_ENGINEER' | 'DEVELOPER' | 'VIEWER';

interface Member {
  role: Role;
  joinedAt?: string | null;
  acceptedAt?: string | null;
  user: { id: string; name: string; email: string };
}

interface Invitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  createdAt: string;
  invitedBy: { name: string };
}

const ROLE_COLORS: Record<Role, string> = {
  OWNER: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  ADMIN: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  SECURITY_ENGINEER: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  DEVELOPER: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  VIEWER: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400',
};

const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  SECURITY_ENGINEER: 'Security Engineer',
  DEVELOPER: 'Developer',
  VIEWER: 'Viewer',
};

const CHANGEABLE_ROLES: Role[] = ['ADMIN', 'SECURITY_ENGINEER', 'DEVELOPER', 'VIEWER'];

function parseJwtPayload(): { orgId?: string; sub?: string; role?: Role } {
  try {
    const token = localStorage.getItem('ptaas_access_token') ?? '';
    return JSON.parse(atob(token.split('.')[1]));
  } catch { return {}; }
}

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function avatarColor(name: string): string {
  const colors = ['bg-violet-500', 'bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500'];
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const jwt = parseJwtPayload();
  const orgId = jwt.orgId;
  const currentUserId = jwt.sub;
  const currentUserRole = jwt.role;
  const isAdmin = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';

  const load = async () => {
    if (!orgId) return;
    try {
      const [m, i] = await Promise.all([
        apiClient.get<Member[]>(`/organizations/${orgId}/members`),
        apiClient.get<Invitation[]>(`/organizations/${orgId}/invitations`).catch(() => []),
      ]);
      setMembers(m);
      setInvitations(i as Invitation[]);
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const changeRole = async (userId: string, newRole: Role) => {
    if (!orgId) return;
    try {
      await apiClient.patch(`/organizations/${orgId}/members/${userId}/role`, { role: newRole });
      setMembers((prev) => prev.map((m) => m.user.id === userId ? { ...m, role: newRole } : m));
      toast.success('Role updated');
    } catch {
      toast.error('Failed to update role');
    }
  };

  const removeMember = async (userId: string, name: string) => {
    if (!orgId || !confirm(`Remove ${name} from the organization?`)) return;
    setRemovingId(userId);
    try {
      await apiClient.delete(`/organizations/${orgId}/members/${userId}`);
      setMembers((prev) => prev.filter((m) => m.user.id !== userId));
      toast.success(`${name} removed`);
    } catch {
      toast.error('Failed to remove member');
    } finally {
      setRemovingId(null);
    }
  };

  const revokeInvitation = async (id: string) => {
    if (!orgId || !confirm('Revoke this invitation?')) return;
    try {
      await apiClient.delete(`/organizations/${orgId}/invitations/${id}`);
      setInvitations((prev) => prev.filter((i) => i.id !== id));
      toast.success('Invitation revoked');
    } catch {
      toast.error('Failed to revoke invitation');
    }
  };

  const resendInvitation = async (inv: Invitation) => {
    if (!orgId) return;
    setResendingId(inv.id);
    try {
      await apiClient.delete(`/organizations/${orgId}/invitations/${inv.id}`);
      await apiClient.post(`/organizations/${orgId}/invitations`, { email: inv.email, role: inv.role });
      toast.success(`Invitation resent to ${inv.email}`);
      load();
    } catch {
      toast.error('Failed to resend invitation');
    } finally {
      setResendingId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Team Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {members.length} member{members.length !== 1 ? 's' : ''} · {invitations.length} pending invitation{invitations.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Active Members */}
      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Active Members
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {members.map((m) => {
              const isSelf = m.user.id === currentUserId;
              const isOwner = m.role === 'OWNER';
              const canManage = isAdmin && !isSelf && !isOwner;

              return (
                <div key={m.user.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Avatar */}
                  <div className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-semibold ${avatarColor(m.user.name)}`}>
                    {initials(m.user.name)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{m.user.name}</p>
                      {isSelf && <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">You</span>}
                      {isOwner && <Crown className="h-3.5 w-3.5 text-purple-500" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{m.user.email}</p>
                  </div>

                  {/* Role */}
                  {canManage ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity ${ROLE_COLORS[m.role]}`}>
                          {ROLE_LABELS[m.role]}
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {CHANGEABLE_ROLES.map((r) => (
                          <DropdownMenuItem
                            key={r}
                            onClick={() => changeRole(m.user.id, r)}
                            className={m.role === r ? 'font-medium' : ''}
                          >
                            {ROLE_LABELS[r]}
                            {m.role === r && <span className="ml-auto text-xs text-muted-foreground">current</span>}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${ROLE_COLORS[m.role]}`}>
                      {ROLE_LABELS[m.role]}
                    </span>
                  )}

                  {/* Remove */}
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={removingId === m.user.id}
                      onClick={() => removeMember(m.user.id, m.user.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Pending Invitations
              <Badge variant="secondary" className="ml-1">{invitations.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {invitations.map((inv) => {
                const expired = new Date(inv.expiresAt) < new Date();
                return (
                  <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-shrink-0 h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited by {inv.invitedBy?.name ?? 'Unknown'} ·{' '}
                        {expired
                          ? <span className="text-destructive">Expired</span>
                          : <>expires {new Date(inv.expiresAt).toLocaleDateString()}</>}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {ROLE_LABELS[inv.role] ?? inv.role}
                    </Badge>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          disabled={resendingId === inv.id}
                          onClick={() => resendInvitation(inv)}
                          title="Resend invitation"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => revokeInvitation(inv.id)}
                          title="Revoke invitation"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {inviteOpen && orgId && (
        <InviteDialog
          orgId={orgId}
          onClose={() => setInviteOpen(false)}
          onSent={() => { setInviteOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function InviteDialog({
  orgId, onClose, onSent,
}: { orgId: string; onClose: () => void; onSent: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('VIEWER');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.includes('@')) { toast.error('Invalid email'); return; }
    setLoading(true);
    try {
      await apiClient.post(`/organizations/${orgId}/invitations`, { email, role });
      toast.success(`Invitation sent to ${email}`);
      onSent();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Email Address</Label>
            <Input
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="VIEWER">
                  <div>
                    <p className="font-medium">Viewer</p>
                    <p className="text-xs text-muted-foreground">Read-only access to findings & reports</p>
                  </div>
                </SelectItem>
                <SelectItem value="DEVELOPER">
                  <div>
                    <p className="font-medium">Developer</p>
                    <p className="text-xs text-muted-foreground">Triage & remediate findings</p>
                  </div>
                </SelectItem>
                <SelectItem value="SECURITY_ENGINEER">
                  <div>
                    <p className="font-medium">Security Engineer</p>
                    <p className="text-xs text-muted-foreground">Run scans, manage targets</p>
                  </div>
                </SelectItem>
                <SelectItem value="ADMIN">
                  <div>
                    <p className="font-medium">Admin</p>
                    <p className="text-xs text-muted-foreground">Full access, manage members</p>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">What happens next</p>
            <p>An email with an invite link is sent. It expires in 7 days.</p>
            <p>The invitee must create an account or log in to accept.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading || !email}>
            {loading ? 'Sending…' : 'Send Invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
