import { Controller, Param, Patch, Post, Body, UseGuards } from '@nestjs/common';
import { InternalKeyGuard } from '../auth/guards/internal-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ScansGateway } from './scans.gateway';
import { UpdateScanStatusDto, CreateFindingFromScannerDto } from './dto/scanner-callback.dto';
import { Prisma, ScanStatus } from '@prisma/client';

@Controller('internal/scans')
@UseGuards(InternalKeyGuard)
export class ScansInternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ScansGateway,
  ) {}

  @Patch(':scanId/status')
  async updateStatus(
    @Param('scanId') scanId: string,
    @Body() dto: UpdateScanStatusDto,
  ) {
    const data: { status: ScanStatus; completedAt?: Date; error?: string } = {
      status: dto.status,
    };
    if (dto.status === ScanStatus.COMPLETED || dto.status === ScanStatus.FAILED) {
      data.completedAt = new Date();
    }
    if (dto.error) {
      data.error = dto.error;
    }

    const scan = await this.prisma.scan.update({
      where: { id: scanId },
      data,
    });

    // WebSocket-Event an alle Clients des Tenants
    this.gateway.emitToTenant(scan.tenantId, 'scan:status_updated', {
      scanId,
      projectId: scan.projectId,
      status: scan.status,
      completedAt: scan.completedAt,
    });

    return scan;
  }

  @Post(':scanId/findings')
  async createFinding(
    @Param('scanId') scanId: string,
    @Body() dto: CreateFindingFromScannerDto,
  ) {
    const scan = await this.prisma.scan.findUniqueOrThrow({
      where: { id: scanId },
      select: { tenantId: true, projectId: true },
    });

    const finding = await this.prisma.finding.create({
      data: {
        scanId,
        projectId: dto.projectId,
        tenantId: scan.tenantId,
        title: dto.title,
        description: dto.description,
        severity: dto.severity,
        cvssScore: dto.cvss_score,
        cvssVector: dto.cvss_vector,
        cweId: dto.cwe_id,
        owaspCategory: dto.owasp_category,
        affectedUrl: dto.affected_url,
        affectedComponent: dto.affected_component,
        proofOfConcept: dto.proof_of_concept,
        remediation: dto.remediation,
        rawOutput: dto.raw_output as Prisma.InputJsonValue | undefined,
        checkVersion: dto.check_version,
        targetTechStack: dto.target_tech_stack ?? [],
      },
    });

    // WebSocket-Event: neues Finding für diesen Scan
    this.gateway.emitToTenant(scan.tenantId, 'scan:finding_created', {
      scanId,
      projectId: scan.projectId,
      finding: {
        id: finding.id,
        title: finding.title,
        severity: finding.severity,
      },
    });

    return finding;
  }
}
