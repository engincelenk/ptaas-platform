import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ActivityCategory = 'scan' | 'finding' | 'evidence' | 'scope' | 'engagement' | 'risk' | 'retest' | 'other';

export interface ActivityEvent {
  id: string;
  category: ActivityCategory;
  type: string;
  title: string;
  detail: string | null;
  actor: string | null;
  actorInitials: string | null;
  link: string | null;
  timestamp: Date;
}

function initials(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2);
}

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async getFeed(
    projectId: string,
    orgId: string,
    limit = 60,
    before?: string,
  ): Promise<ActivityEvent[]> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
    if (!project) throw new NotFoundException('Project not found');

    const beforeDate = before ? new Date(before) : new Date();
    const events: ActivityEvent[] = [];

    // ── Scans ──────────────────────────────────────────────────
    const scans = await this.prisma.scan.findMany({
      where:   { projectId, organizationId: orgId, createdAt: { lt: beforeDate } },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      include: { target: { select: { value: true } }, createdBy: { select: { name: true } } },
    });
    for (const s of scans) {
      const statusLabel: Record<string, string> = {
        PENDING: 'queued', RUNNING: 'started', COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled',
      };
      events.push({
        id:           `scan-${s.id}`,
        category:     'scan',
        type:         `scan.${(s.status ?? 'RUNNING').toLowerCase()}`,
        title:        `Scan ${statusLabel[s.status ?? 'RUNNING'] ?? s.status?.toLowerCase() ?? 'updated'} — ${s.type}`,
        detail:       s.target.value,
        actor:        s.createdBy.name,
        actorInitials: initials(s.createdBy.name),
        link:         `/projects/${projectId}/scans`,
        timestamp:    s.createdAt,
      });
    }

    // ── Finding Activities (status changes, retests, comments) ──
    const findingIds = await this.prisma.finding.findMany({
      where:  { projectId, organizationId: orgId },
      select: { id: true, title: true },
    });
    const fidMap = new Map(findingIds.map((f) => [f.id, f.title]));

    const findingActivities = await this.prisma.findingActivity.findMany({
      where:   { findingId: { in: [...fidMap.keys()] }, createdAt: { lt: beforeDate } },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      include: { user: { select: { name: true } } },
    });

    const activityMeta: Record<string, { title: string; category: ActivityCategory }> = {
      status_change:      { title: 'Finding status changed',   category: 'finding'  },
      retest_requested:   { title: 'Retest requested',         category: 'retest'   },
      retest_completed:   { title: 'Retest completed',         category: 'retest'   },
      comment:            { title: 'Comment added',            category: 'finding'  },
      assignee_change:    { title: 'Assignee changed',         category: 'finding'  },
      evidence_uploaded:  { title: 'Evidence uploaded',        category: 'evidence' },
    };

    for (const a of findingActivities) {
      const meta   = activityMeta[a.type] ?? { title: a.type.replace(/_/g, ' '), category: 'other' as ActivityCategory };
      const payload = a.payload as Record<string, any>;
      let detail = fidMap.get(a.findingId) ?? null;
      if (a.type === 'status_change' && payload?.from && payload?.to) {
        detail = `${fidMap.get(a.findingId)} — ${payload.from} → ${payload.to}`;
      }
      events.push({
        id:           `fa-${a.id}`,
        category:     meta.category,
        type:         a.type,
        title:        meta.title,
        detail,
        actor:        a.user?.name ?? null,
        actorInitials: initials(a.user?.name),
        link:         `/projects/${projectId}/findings/${a.findingId}`,
        timestamp:    a.createdAt,
      });
    }

    // ── Evidence ───────────────────────────────────────────────
    const evidences = await this.prisma.evidence.findMany({
      where:   { finding: { projectId, organizationId: orgId }, createdAt: { lt: beforeDate } },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      include: {
        uploadedBy: { select: { name: true } },
        finding:    { select: { id: true, title: true } },
      },
    });
    for (const e of evidences) {
      events.push({
        id:           `ev-${e.id}`,
        category:     'evidence',
        type:         'evidence.uploaded',
        title:        'Evidence uploaded',
        detail:       `${e.originalName} → ${e.finding.title}`,
        actor:        e.uploadedBy?.name ?? null,
        actorInitials: initials(e.uploadedBy?.name),
        link:         `/projects/${projectId}/findings/${e.finding.id}`,
        timestamp:    e.createdAt,
      });
    }

    // ── Scope entries ──────────────────────────────────────────
    const scopeEntries = await this.prisma.scopeEntry.findMany({
      where:   { projectId, organizationId: orgId, createdAt: { lt: beforeDate } },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      include: { addedBy: { select: { name: true } } },
    });
    for (const s of scopeEntries) {
      events.push({
        id:           `scope-${s.id}`,
        category:     'scope',
        type:         'scope.entry_added',
        title:        `Scope entry added — ${s.type}`,
        detail:       s.value,
        actor:        s.addedBy?.name ?? null,
        actorInitials: initials(s.addedBy?.name),
        link:         `/projects/${projectId}/scope`,
        timestamp:    s.createdAt,
      });
    }

    // ── Risk Acceptances ───────────────────────────────────────
    const riskAcceptances = await this.prisma.riskAcceptance.findMany({
      where:   { finding: { projectId, organizationId: orgId }, createdAt: { lt: beforeDate } },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      include: {
        approvedBy: { select: { name: true } },
        finding:    { select: { id: true, title: true } },
      },
    });
    for (const r of riskAcceptances) {
      events.push({
        id:           `ra-${r.id}`,
        category:     'risk',
        type:         r.revokedAt ? 'risk.revoked' : 'risk.accepted',
        title:        r.revokedAt ? 'Risk acceptance revoked' : `Risk ${r.decision.toLowerCase().replace('_', ' ')}`,
        detail:       r.finding.title,
        actor:        r.approvedBy?.name ?? null,
        actorInitials: initials(r.approvedBy?.name),
        link:         `/projects/${projectId}/findings/${r.finding.id}`,
        timestamp:    r.revokedAt ?? r.createdAt,
      });
    }

    // ── Engagement ─────────────────────────────────────────────
    const engagement = await this.prisma.engagement.findUnique({
      where:   { projectId },
      include: { signedOffBy: { select: { name: true } } },
    });
    if (engagement && engagement.createdAt < beforeDate) {
      events.push({
        id:           `eng-created-${engagement.id}`,
        category:     'engagement',
        type:         'engagement.created',
        title:        'Engagement created',
        detail:       engagement.title,
        actor:        null,
        actorInitials: null,
        link:         `/projects/${projectId}/engagement`,
        timestamp:    engagement.createdAt,
      });
    }
    if (engagement?.signedOffAt && engagement.signedOffAt < beforeDate) {
      events.push({
        id:           `eng-signed-${engagement.id}`,
        category:     'engagement',
        type:         'engagement.signed',
        title:        'Engagement signed off',
        detail:       engagement.title,
        actor:        engagement.signedOffBy?.name ?? null,
        actorInitials: initials(engagement.signedOffBy?.name),
        link:         `/projects/${projectId}/engagement`,
        timestamp:    engagement.signedOffAt,
      });
    }

    // ── Sort and paginate ──────────────────────────────────────
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return events.slice(0, limit);
  }
}
