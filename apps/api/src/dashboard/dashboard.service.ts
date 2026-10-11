import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getPendingRetests(orgId: string) {
    const findings = await this.prisma.finding.findMany({
      where: {
        organizationId: orgId,
        retestStatus: { in: ['PENDING', 'PASSED', 'FAILED'] },
      },
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        retestStatus: true,
        retestRequestedAt: true,
        retestCompletedAt: true,
        scan: {
          select: {
            projectId: true,
            project: { select: { name: true } },
          },
        },
      },
      orderBy: { retestRequestedAt: 'desc' },
      take: 50,
    });

    return {
      pending: findings.filter((f) => f.retestStatus === 'PENDING'),
      passed:  findings.filter((f) => f.retestStatus === 'PASSED'),
      failed:  findings.filter((f) => f.retestStatus === 'FAILED'),
      total:   findings.length,
    };
  }

  async getAnalytics(orgId: string) {
    const [velocity, slaCompliance, activityFeed, projectHealth] = await Promise.all([
      this.getRemediationVelocity(orgId),
      this.getSlaComplianceRate(orgId),
      this.getActivityFeed(orgId),
      this.getProjectHealth(orgId),
    ]);
    return { velocity, slaCompliance, activityFeed, projectHealth };
  }

  private async getRemediationVelocity(orgId: string) {
    // Average days from createdAt to FIXED/VERIFIED per severity (last 90 days)
    const rows = await this.prisma.$queryRaw<
      Array<{ severity: string; avg_days: number; count: bigint }>
    >`
      SELECT
        severity,
        ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)::numeric, 1) AS avg_days,
        COUNT(*) AS count
      FROM findings
      WHERE organization_id = ${orgId}
        AND status IN ('FIXED', 'VERIFIED')
        AND updated_at > NOW() - INTERVAL '90 days'
      GROUP BY severity
      ORDER BY
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH'     THEN 2
          WHEN 'MEDIUM'   THEN 3
          WHEN 'LOW'      THEN 4
          ELSE 5
        END
    `;

    return rows.map((r) => ({
      severity: r.severity,
      avgDays: Number(r.avg_days),
      count: Number(r.count),
    }));
  }

  private async getSlaComplianceRate(orgId: string) {
    // SLA thresholds (days): CRITICAL=7, HIGH=30, MEDIUM=90, LOW=180
    const SLA: Record<string, number> = { CRITICAL: 7, HIGH: 30, MEDIUM: 90, LOW: 180 };

    const rows = await this.prisma.$queryRaw<
      Array<{ severity: string; within_sla: bigint; total: bigint }>
    >`
      SELECT
        severity,
        COUNT(*) FILTER (
          WHERE
            (severity = 'CRITICAL' AND EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400 <= 7)
            OR (severity = 'HIGH'     AND EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400 <= 30)
            OR (severity = 'MEDIUM'   AND EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400 <= 90)
            OR (severity = 'LOW'      AND EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400 <= 180)
        ) AS within_sla,
        COUNT(*) AS total
      FROM findings
      WHERE organization_id = ${orgId}
        AND status IN ('FIXED', 'VERIFIED')
        AND updated_at > NOW() - INTERVAL '180 days'
        AND severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')
      GROUP BY severity
    `;

    let totalWithin = 0, totalAll = 0;
    const bySeverity = rows.map((r) => {
      const within = Number(r.within_sla);
      const total  = Number(r.total);
      totalWithin += within;
      totalAll    += total;
      return {
        severity: r.severity,
        withinSla: within,
        total,
        rate: total > 0 ? Math.round((within / total) * 100) : null,
        slaDays: SLA[r.severity] ?? null,
      };
    });

    return {
      overallRate: totalAll > 0 ? Math.round((totalWithin / totalAll) * 100) : null,
      bySeverity,
    };
  }

  private async getActivityFeed(orgId: string) {
    const [findings, scans, audits] = await Promise.all([
      this.prisma.finding.findMany({
        where: { organizationId: orgId },
        select: {
          id: true, title: true, severity: true, status: true, createdAt: true, updatedAt: true,
          scan: { select: { projectId: true, project: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.scan.findMany({
        where: { organizationId: orgId },
        select: {
          id: true, status: true, startedAt: true, completedAt: true, createdAt: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      this.prisma.auditLog.findMany({
        where: { organizationId: orgId, action: { in: ['retest.requested', 'retest.completed', 'finding.status_changed'] } },
        select: { id: true, action: true, metadata: true, createdAt: true, resourceId: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    type FeedItem = {
      id: string;
      type: 'finding' | 'scan' | 'audit';
      action: string;
      title: string;
      severity?: string;
      projectName?: string;
      projectId?: string;
      timestamp: Date;
    };

    const items: FeedItem[] = [
      ...findings.map((f) => ({
        id: f.id,
        type: 'finding' as const,
        action: 'finding.created',
        title: f.title,
        severity: f.severity,
        projectName: f.scan?.project?.name,
        projectId: f.scan?.projectId ?? undefined,
        timestamp: f.createdAt,
      })),
      ...scans.map((s) => ({
        id: s.id,
        type: 'scan' as const,
        action: s.status === 'COMPLETED' ? 'scan.completed' : 'scan.started',
        title: `Scan on ${s.project.name}`,
        projectName: s.project.name,
        projectId: s.project.id,
        timestamp: s.completedAt ?? s.startedAt ?? s.createdAt,
      })),
      ...audits.map((a) => ({
        id: a.id,
        type: 'audit' as const,
        action: a.action,
        title: String((a.metadata as Record<string, unknown>)?.title ?? a.action),
        timestamp: a.createdAt,
      })),
    ];

    return items
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 15);
  }

  private async getProjectHealth(orgId: string) {
    const projects = await this.prisma.project.findMany({
      where: { organizationId: orgId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        findings: {
          select: { severity: true, status: true, createdAt: true },
        },
        scans: {
          select: { status: true, completedAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      take: 10,
    });

    const W: Record<string, number> = { CRITICAL: 10, HIGH: 6, MEDIUM: 3, LOW: 1, INFO: 0 };

    return projects.map((p) => {
      const open = p.findings.filter((f) => ['OPEN', 'IN_PROGRESS'].includes(f.status));
      const fixed = p.findings.filter((f) => ['FIXED', 'VERIFIED'].includes(f.status));
      const riskScore = open.length === 0
        ? 0
        : Math.min(Math.round(open.reduce((s, f) => s + (W[f.severity] ?? 0), 0) / Math.max(open.length, 1) * 10), 100);
      const fixRate = p.findings.length > 0
        ? Math.round((fixed.length / p.findings.length) * 100)
        : null;
      const lastScan = p.scans[0]?.completedAt ?? null;

      return {
        id: p.id,
        name: p.name,
        riskScore,
        openCount: open.length,
        criticalCount: open.filter((f) => f.severity === 'CRITICAL').length,
        fixRate,
        lastScan,
      };
    }).sort((a, b) => b.riskScore - a.riskScore);
  }

  async getCveIntelligence(orgId: string) {
    const [summary, kevFindings, epssHighRisk, cvssRows, topCveRows] = await Promise.all([
      // Summary KPIs
      this.prisma.finding.aggregate({
        where: { organizationId: orgId, status: { notIn: ['FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK'] } },
        _count: { id: true },
        _avg:  { cvssScore: true, epssScore: true },
      }).then(async (agg) => {
        const kevCount = await this.prisma.finding.count({
          where: { organizationId: orgId, kevListed: true, status: { notIn: ['FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK'] } },
        });
        const epssHighCount = await this.prisma.finding.count({
          where: { organizationId: orgId, epssScore: { gte: 0.5 }, status: { notIn: ['FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK'] } },
        });
        return {
          totalWithCve: await this.prisma.finding.count({
            where: { organizationId: orgId, cveIds: { isEmpty: false }, status: { notIn: ['FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK'] } },
          }),
          kevListedCount: kevCount,
          epssHighRiskCount: epssHighCount,
          avgCvss: agg._avg.cvssScore ? Math.round(agg._avg.cvssScore * 10) / 10 : null,
          avgEpss: agg._avg.epssScore ? Math.round(agg._avg.epssScore * 1000) / 1000 : null,
        };
      }),

      // KEV-listed findings (high priority)
      this.prisma.finding.findMany({
        where: { organizationId: orgId, kevListed: true, status: { notIn: ['FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK'] } },
        select: {
          id: true, title: true, severity: true, cvssScore: true, epssScore: true,
          cveIds: true, status: true,
          scan: { select: { projectId: true, project: { select: { name: true } } } },
        },
        orderBy: { cvssScore: 'desc' },
        take: 20,
      }),

      // High EPSS (exploitation probability > 50%)
      this.prisma.finding.findMany({
        where: { organizationId: orgId, epssScore: { gte: 0.5 }, status: { notIn: ['FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK'] } },
        select: {
          id: true, title: true, severity: true, cvssScore: true, epssScore: true,
          epssPercentile: true, cveIds: true, status: true,
          scan: { select: { projectId: true, project: { select: { name: true } } } },
        },
        orderBy: { epssScore: 'desc' },
        take: 20,
      }),

      // CVSS score distribution
      this.prisma.$queryRaw<Array<{ bucket: string; cnt: bigint }>>`
        SELECT
          CASE
            WHEN cvss_score IS NULL       THEN 'unknown'
            WHEN cvss_score < 4.0         THEN 'low'
            WHEN cvss_score < 7.0         THEN 'medium'
            WHEN cvss_score < 9.0         THEN 'high'
            ELSE                               'critical'
          END AS bucket,
          COUNT(*) AS cnt
        FROM findings
        WHERE organization_id = ${orgId}
          AND status NOT IN ('FIXED','FALSE_POSITIVE','ACCEPTED_RISK')
        GROUP BY bucket
      `,

      // Top CVEs (unnest cve_ids array, aggregate by CVE)
      this.prisma.$queryRaw<Array<{
        cve_id: string; max_cvss: number | null; max_epss: number | null;
        finding_count: bigint; severities: string[];
      }>>`
        SELECT
          cve_id,
          MAX(cvss_score)                        AS max_cvss,
          MAX(epss_score)                        AS max_epss,
          COUNT(DISTINCT f.id)                   AS finding_count,
          ARRAY_AGG(DISTINCT f.severity)         AS severities
        FROM findings f
        CROSS JOIN LATERAL UNNEST(f.cve_ids) AS cve_id
        WHERE f.organization_id = ${orgId}
          AND f.status NOT IN ('FIXED','FALSE_POSITIVE','ACCEPTED_RISK')
          AND array_length(f.cve_ids, 1) > 0
        GROUP BY cve_id
        ORDER BY max_cvss DESC NULLS LAST, max_epss DESC NULLS LAST
        LIMIT 25
      `,
    ]);

    return {
      summary,
      topCves: topCveRows.map((r) => ({
        cveId: r.cve_id,
        maxCvss: r.max_cvss ? Math.round(Number(r.max_cvss) * 10) / 10 : null,
        maxEpss: r.max_epss ? Math.round(Number(r.max_epss) * 1000) / 1000 : null,
        findingCount: Number(r.finding_count),
        severities: r.severities,
      })),
      kevFindings: kevFindings.map((f) => ({
        id: f.id, title: f.title, severity: f.severity,
        cvssScore: f.cvssScore, epssScore: f.epssScore, cveIds: f.cveIds,
        projectId: f.scan?.projectId ?? null, projectName: f.scan?.project?.name ?? null,
      })),
      epssHighRisk: epssHighRisk.map((f) => ({
        id: f.id, title: f.title, severity: f.severity,
        cvssScore: f.cvssScore, epssScore: f.epssScore,
        epssPercentile: f.epssPercentile, cveIds: f.cveIds,
        projectId: f.scan?.projectId ?? null, projectName: f.scan?.project?.name ?? null,
      })),
      cvssDistribution: Object.fromEntries(
        cvssRows.map((r) => [r.bucket, Number(r.cnt)]),
      ),
    };
  }

  async getExecutiveDashboard(orgId: string) {
    const [
      kpis,
      trendRows,
      projectRisks,
      owaspCounts,
      slaBreaches,
    ] = await Promise.all([
      this.getKpis(orgId),
      this.getTrend(orgId),
      this.getTopProjects(orgId),
      this.getOwaspDistribution(orgId),
      this.getSlaBreaches(orgId),
    ]);

    return { kpis, trend: trendRows, topProjects: projectRisks, owaspDistribution: owaspCounts, slaBreaches };
  }

  private async getKpis(orgId: string) {
    const [open, critical, high, verified, riskAvg] = await Promise.all([
      this.prisma.finding.count({
        where: { organizationId: orgId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
      this.prisma.finding.count({
        where: { organizationId: orgId, status: { in: ['OPEN', 'IN_PROGRESS'] }, severity: 'CRITICAL' },
      }),
      this.prisma.finding.count({
        where: { organizationId: orgId, status: { in: ['OPEN', 'IN_PROGRESS'] }, severity: 'HIGH' },
      }),
      this.prisma.finding.count({
        where: { organizationId: orgId, status: 'VERIFIED' },
      }),
      this.prisma.finding.aggregate({
        where: { organizationId: orgId, status: { in: ['OPEN', 'IN_PROGRESS'] }, aiRiskScore: { not: null } },
        _avg: { aiRiskScore: true },
      }),
    ]);

    return {
      openFindings: open,
      criticalCount: critical,
      highCount: high,
      verifiedCount: verified,
      avgRiskScore: riskAvg._avg.aiRiskScore ? Math.round(riskAvg._avg.aiRiskScore) : null,
    };
  }

  private async getTrend(orgId: string) {
    // 12-week new vs resolved trend
    const rows = await this.prisma.$queryRaw<
      Array<{ week: string; new_findings: bigint; resolved_findings: bigint }>
    >`
      WITH weeks AS (
        SELECT generate_series(
          date_trunc('week', NOW() - INTERVAL '11 weeks'),
          date_trunc('week', NOW()),
          INTERVAL '1 week'
        ) AS week_start
      )
      SELECT
        TO_CHAR(w.week_start, 'YYYY-MM-DD') AS week,
        COUNT(f.id) FILTER (
          WHERE f.created_at >= w.week_start
            AND f.created_at < w.week_start + INTERVAL '1 week'
        ) AS new_findings,
        COUNT(f.id) FILTER (
          WHERE f.status IN ('VERIFIED', 'CLOSED', 'FALSE_POSITIVE')
            AND f.updated_at >= w.week_start
            AND f.updated_at < w.week_start + INTERVAL '1 week'
        ) AS resolved_findings
      FROM weeks w
      LEFT JOIN findings f ON f.organization_id = ${orgId}
      GROUP BY w.week_start
      ORDER BY w.week_start
    `;

    return rows.map((r) => ({
      week: r.week,
      newFindings: Number(r.new_findings),
      resolvedFindings: Number(r.resolved_findings),
    }));
  }

  private async getTopProjects(orgId: string) {
    const projects = await this.prisma.project.findMany({
      where: { organizationId: orgId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        findings: {
          where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
          select: { severity: true, aiRiskScore: true },
        },
      },
    });

    const SEVERITY_WEIGHT: Record<string, number> = {
      CRITICAL: 10, HIGH: 7, MEDIUM: 4, LOW: 1.5, INFO: 0.5,
    };

    return projects
      .map((p) => {
        const openCount = p.findings.length;
        const criticalCount = p.findings.filter((f) => f.severity === 'CRITICAL').length;
        const riskScore = openCount === 0
          ? 0
          : Math.min(
              Math.round(
                p.findings.reduce((sum, f) => sum + (SEVERITY_WEIGHT[f.severity] ?? 0), 0) /
                  Math.max(openCount, 1) * 10,
              ),
              100,
            );
        return { id: p.id, name: p.name, openCount, criticalCount, riskScore };
      })
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 8);
  }

  private async getOwaspDistribution(orgId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{ owasp: string; count: bigint }>
    >`
      SELECT owasp, COUNT(*) AS count
      FROM findings
      WHERE organization_id = ${orgId}
        AND owasp IS NOT NULL
        AND status IN ('OPEN', 'IN_PROGRESS')
      GROUP BY owasp
      ORDER BY count DESC
      LIMIT 10
    `;

    return rows.map((r) => ({ owasp: r.owasp, count: Number(r.count) }));
  }

  private async getSlaBreaches(orgId: string) {
    const now = new Date();
    const criticalDeadline = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);   // 7 days
    const highDeadline = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);      // 30 days

    const [criticalBreaches, highBreaches] = await Promise.all([
      this.prisma.finding.findMany({
        where: {
          organizationId: orgId,
          severity: 'CRITICAL',
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          createdAt: { lt: criticalDeadline },
        },
        select: {
          id: true, title: true, severity: true, createdAt: true,
          scan: { select: { projectId: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
      }),
      this.prisma.finding.findMany({
        where: {
          organizationId: orgId,
          severity: 'HIGH',
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          createdAt: { lt: highDeadline },
        },
        select: {
          id: true, title: true, severity: true, createdAt: true,
          scan: { select: { projectId: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
      }),
    ]);

    const toItem = (f: typeof criticalBreaches[0]) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      createdAt: f.createdAt,
      projectId: f.scan?.projectId ?? null,
      daysOpen: Math.floor((now.getTime() - f.createdAt.getTime()) / 86400000),
    });

    return {
      criticalBreachCount: criticalBreaches.length,
      highBreachCount: highBreaches.length,
      items: [...criticalBreaches.map(toItem), ...highBreaches.map(toItem)]
        .sort((a, b) => b.daysOpen - a.daysOpen)
        .slice(0, 10),
    };
  }

  async getSecurityPosture(orgId: string) {
    const projects = await this.prisma.project.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        findings: {
          where: { status: { notIn: ['FALSE_POSITIVE', 'ACCEPTED_RISK'] } },
          select: { severity: true, status: true, cvssScore: true },
        },
      },
    });

    const projectStats = projects.map((p) => {
      const findings = p.findings;
      const open = findings.filter((f) => f.status === 'OPEN' || f.status === 'IN_PROGRESS');
      const resolved = findings.filter((f) => f.status === 'FIXED');
      const bySeverity = {
        CRITICAL: findings.filter((f) => f.severity === 'CRITICAL').length,
        HIGH:     findings.filter((f) => f.severity === 'HIGH').length,
        MEDIUM:   findings.filter((f) => f.severity === 'MEDIUM').length,
        LOW:      findings.filter((f) => f.severity === 'LOW').length,
        INFO:     findings.filter((f) => f.severity === 'INFO').length,
      };
      const avgCvss = findings
        .map((f) => f.cvssScore)
        .filter((s): s is number => s !== null && s !== undefined);
      const riskScore = avgCvss.length
        ? Math.round(avgCvss.reduce((a, b) => a + b, 0) / avgCvss.length * 10)
        : bySeverity.CRITICAL * 10 + bySeverity.HIGH * 4 + bySeverity.MEDIUM * 2;
      const remediationRate = findings.length > 0
        ? Math.round((resolved.length / findings.length) * 100)
        : 100;

      return {
        projectId: p.id,
        projectName: p.name,
        totalFindings: findings.length,
        openFindings: open.length,
        resolvedFindings: resolved.length,
        remediationRate,
        bySeverity,
        riskScore: Math.min(riskScore, 100),
      };
    });

    // Org-wide aggregates
    const allFindings = projects.flatMap((p) => p.findings);
    const orgOpen = allFindings.filter((f) => f.status === 'OPEN' || f.status === 'IN_PROGRESS').length;
    const orgResolved = allFindings.filter((f) => f.status === 'FIXED').length;
    const orgRemRate = allFindings.length > 0
      ? Math.round((orgResolved / allFindings.length) * 100)
      : 100;
    const orgBySeverity = {
      CRITICAL: allFindings.filter((f) => f.severity === 'CRITICAL').length,
      HIGH:     allFindings.filter((f) => f.severity === 'HIGH').length,
      MEDIUM:   allFindings.filter((f) => f.severity === 'MEDIUM').length,
      LOW:      allFindings.filter((f) => f.severity === 'LOW').length,
      INFO:     allFindings.filter((f) => f.severity === 'INFO').length,
    };

    return {
      summary: {
        totalProjects: projects.length,
        totalFindings: allFindings.length,
        openFindings: orgOpen,
        resolvedFindings: orgResolved,
        remediationRate: orgRemRate,
        bySeverity: orgBySeverity,
      },
      projects: projectStats.sort((a, b) => b.riskScore - a.riskScore),
    };
  }
}
