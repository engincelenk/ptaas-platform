import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScansGateway } from './scans.gateway';
import { CreateScanDto } from './dto/create-scan.dto';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { ScanStatus } from '@prisma/client';

const PRIVATE_IP_REGEX =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|localhost)/i;

@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ScansGateway,
    @InjectQueue('scans') private readonly scanQueue: Queue,
  ) {}

  async findAll(projectId: string, tenantId: string) {
    await this.verifyProjectAccess(projectId, tenantId);
    return this.prisma.scan.findMany({
      where: { projectId, tenantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { findings: true } } },
    });
  }

  async findOne(id: string, projectId: string, tenantId: string) {
    const scan = await this.prisma.scan.findFirst({
      where: { id, projectId, tenantId },
      include: { _count: { select: { findings: true } } },
    });
    if (!scan) throw new NotFoundException('Scan not found');
    return scan;
  }

  async create(projectId: string, dto: CreateScanDto, tenantId: string) {
    const project = await this.verifyProjectAccess(projectId, tenantId);

    const scan = await this.prisma.scan.create({
      data: {
        projectId,
        tenantId,
        type: dto.type,
        status: ScanStatus.QUEUED,
      },
    });

    await this.scanQueue.add(
      'execute-scan',
      {
        scanId: scan.id,
        projectId,
        tenantId,
        type: dto.type,
        targets: project.targets,
        config: dto.config,
      },
      { attempts: 2, removeOnComplete: 100, removeOnFail: 50 },
    );

    this.gateway.emitToTenant(tenantId, 'scan:queued', {
      scanId: scan.id,
      projectId,
    });
    return scan;
  }

  async cancel(id: string, projectId: string, tenantId: string) {
    const scan = await this.findOne(id, projectId, tenantId);
    if (
      scan.status !== ScanStatus.QUEUED &&
      scan.status !== ScanStatus.RUNNING
    ) {
      throw new ForbiddenException(
        'Scan cannot be cancelled in its current state',
      );
    }
    return this.prisma.scan.update({
      where: { id },
      data: { status: ScanStatus.CANCELLED },
    });
  }

  private async verifyProjectAccess(projectId: string, tenantId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
