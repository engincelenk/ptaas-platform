import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  OWASP_TOP10, resolveOwaspCategory, type OwaspCategory,
} from './compliance.maps';
import {
  Framework, ALL_CONTROLS, CONTROL_MAP, MAPPINGS,
  getControlIdsForFinding,
} from './compliance.constants';

export type CategoryStatus = 'COMPLIANT' | 'WARNING' | 'CRITICAL' | 'UNCHECKED';

export interface CategoryResult {
  category: OwaspCategory;
  status: CategoryStatus;
  openCount: number;
  criticalCount: number;
  findingIds: string[];
}

export interface ComplianceReport {
  projectId: string;
  score: number;         // 0–100 (% of categories that are COMPLIANT or UNCHECKED)
  categories: CategoryResult[];
  generatedAt: Date;
}

@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  async getProjectCompliance(projectId: string, orgId: string): Promise<ComplianceReport> {
    // Fetch all open findings for the project
    const findings = await this.prisma.finding.findMany({
      where: {
        projectId,
        organizationId: orgId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
      select: {
        id: true,
        severity: true,
        owasp: true,
        cweIds: true,
        templateName: true,
      },
    });

    // Resolve OWASP category for each finding (and persist if missing)
    const toUpdate: Array<{ id: string; owasp: string }> = [];
    const enriched = findings.map((f) => {
      const owasp = resolveOwaspCategory(f) ?? f.owasp;
      if (owasp && !f.owasp) toUpdate.push({ id: f.id, owasp });
      return { ...f, owasp };
    });

    // Persist resolved OWASP categories in background (non-blocking)
    if (toUpdate.length > 0) {
      Promise.all(
        toUpdate.map((u) =>
          this.prisma.finding.update({ where: { id: u.id }, data: { owasp: u.owasp } }),
        ),
      ).catch(() => {});
    }

    // Group by OWASP category
    const byCategory = new Map<string, typeof enriched>();
    for (const f of enriched) {
      if (!f.owasp) continue;
      const key = f.owasp.slice(0, 3); // normalise "A01:2021-..." → "A01"
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(f);
    }

    const categories: CategoryResult[] = OWASP_TOP10.map((cat) => {
      const catFindings = byCategory.get(cat.id) ?? [];
      const criticalCount = catFindings.filter((f) => f.severity === 'CRITICAL').length;
      const highCount = catFindings.filter((f) => f.severity === 'HIGH').length;

      let status: CategoryStatus;
      if (catFindings.length === 0) {
        status = 'UNCHECKED';
      } else if (criticalCount > 0) {
        status = 'CRITICAL';
      } else if (highCount > 0) {
        status = 'WARNING';
      } else {
        status = 'COMPLIANT';
      }

      return {
        category: cat,
        status,
        openCount: catFindings.length,
        criticalCount,
        findingIds: catFindings.map((f) => f.id),
      };
    });

    const passing = categories.filter(
      (c) => c.status === 'COMPLIANT' || c.status === 'UNCHECKED',
    ).length;
    const score = Math.round((passing / OWASP_TOP10.length) * 100);

    return { projectId, score, categories, generatedAt: new Date() };
  }

  async getFrameworkSummary(projectId: string, orgId: string) {
    const findings = await this._getFindings(projectId, orgId);
    const frameworks: Framework[] = ['pci-dss', 'iso27001', 'soc2', 'gdpr', 'nis2'];

    return Object.fromEntries(
      frameworks.map((fw) => {
        const { controls } = this._mapToFramework(findings, fw);
        const affected  = controls.filter((c) => c.findingCount > 0).length;
        const compliant = controls.filter((c) => c.compliant).length;
        const total     = controls.length;
        return [fw, { total, affected, compliant, score: total > 0 ? Math.round((compliant / total) * 100) : 100 }];
      }),
    );
  }

  async getFrameworkDetail(projectId: string, orgId: string, framework: Framework) {
    const findings = await this._getFindings(projectId, orgId);
    const { controls, unmapped } = this._mapToFramework(findings, framework);
    const affected  = controls.filter((c) => c.findingCount > 0).length;
    const compliant = controls.filter((c) => c.compliant).length;
    const total     = controls.length;
    return {
      framework, total, affected, compliant,
      score: total > 0 ? Math.round((compliant / total) * 100) : 100,
      controls,
      unmappedCount: unmapped,
    };
  }

  private async _getFindings(projectId: string, orgId: string) {
    return this.prisma.finding.findMany({
      where: { projectId, organizationId: orgId, status: { notIn: ['FALSE_POSITIVE', 'CLOSED'] } },
      select: { id: true, title: true, severity: true, status: true, owasp: true, cweIds: true },
    });
  }

  private _mapToFramework(findings: any[], framework: Framework) {
    const fwControls = ALL_CONTROLS.filter((c) => c.framework === framework);
    const controlFindings = new Map<string, any[]>(fwControls.map((c) => [c.id, []]));
    let unmapped = 0;
    const openStatuses = new Set(['OPEN', 'IN_PROGRESS']);

    for (const f of findings) {
      const controlIds = getControlIdsForFinding(f.owasp, f.cweIds);
      const fwIds = [...controlIds].filter((id) => CONTROL_MAP.get(id)?.framework === framework);
      if (fwIds.length === 0) unmapped++;
      else fwIds.forEach((id) => controlFindings.get(id)?.push(f));
    }

    const controls = fwControls.map((ctrl) => {
      const ctrlFindings = controlFindings.get(ctrl.id) ?? [];
      return {
        control: { id: ctrl.id, name: ctrl.name, description: ctrl.description },
        findings: ctrlFindings.map((f) => ({ id: f.id, title: f.title, severity: f.severity, status: f.status })),
        findingCount: ctrlFindings.length,
        openCount:    ctrlFindings.filter((f) => openStatuses.has(f.status)).length,
        compliant:    ctrlFindings.every((f) => !openStatuses.has(f.status)),
      };
    });

    return { controls, unmapped };
  }

  /** M54 — ISO 27001 continuous tracking: org-wide control status aggregated across all projects */
  async getIso27001Continuous(orgId: string) {
    const findings = await this.prisma.finding.findMany({
      where: { organizationId: orgId, status: { notIn: ['FALSE_POSITIVE', 'CLOSED'] } },
      select: { id: true, title: true, severity: true, status: true, owasp: true, cweIds: true, projectId: true, createdAt: true, updatedAt: true },
    });

    const { controls } = this._mapToFramework(findings, 'iso27001');
    const total     = controls.length;
    const compliant = controls.filter((c) => c.compliant).length;
    const critical  = controls.filter((c) => c.openCount > 0 && c.findings.some((f: any) => f.severity === 'CRITICAL')).length;
    const score     = total > 0 ? Math.round((compliant / total) * 100) : 100;

    // Last 30 days trend: findings opened per day
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const recent = findings.filter((f) => new Date(f.createdAt) >= thirtyDaysAgo);

    return {
      framework: 'iso27001',
      generatedAt: new Date(),
      score,
      summary: { total, compliant, critical, warning: total - compliant - critical },
      controls: controls.map((c) => ({
        ...c,
        status: c.compliant ? 'COMPLIANT' : c.openCount > 0 && c.findings.some((f: any) => f.severity === 'CRITICAL') ? 'CRITICAL' : 'WARNING',
      })),
      trend: { last30DaysNewFindings: recent.length },
    };
  }

  /** Backfill OWASP categories for all findings in an org that are missing it */
  async backfillOwasp(orgId: string): Promise<number> {
    const findings = await this.prisma.finding.findMany({
      where: { organizationId: orgId, owasp: null },
      select: { id: true, cweIds: true, templateName: true, owasp: true },
    });

    let updated = 0;
    for (const f of findings) {
      const owasp = resolveOwaspCategory(f);
      if (owasp) {
        await this.prisma.finding.update({ where: { id: f.id }, data: { owasp } });
        updated++;
      }
    }
    return updated;
  }
}
