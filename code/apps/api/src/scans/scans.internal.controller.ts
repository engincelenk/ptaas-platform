import { Controller, Param, Patch, Post, Body, UseGuards } from '@nestjs/common';
import { InternalKeyGuard } from '../auth/guards/internal-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateScanStatusDto, CreateFindingFromScannerDto } from './dto/scanner-callback.dto';
import { ScanStatus } from '@prisma/client';

@Controller('internal/scans')
@UseGuards(InternalKeyGuard)
export class ScansInternalController {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.scan.update({ where: { id: scanId }, data });
  }

  @Post(':scanId/findings')
  async createFinding(
    @Param('scanId') scanId: string,
    @Body() dto: CreateFindingFromScannerDto,
  ) {
    const scan = await this.prisma.scan.findUniqueOrThrow({
      where: { id: scanId },
      select: { tenantId: true },
    });

    return this.prisma.finding.create({
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
        rawOutput: dto.raw_output,
        checkVersion: dto.check_version,
        targetTechStack: dto.target_tech_stack ?? [],
      },
    });
  }
}
