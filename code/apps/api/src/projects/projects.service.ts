import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.project.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { scans: true, findings: true } },
      },
    });
  }

  async findOne(id: string, tenantId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, tenantId },
      include: {
        _count: { select: { scans: true, findings: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async create(dto: CreateProjectDto, tenantId: string) {
    return this.prisma.project.create({
      data: { ...dto, tenantId },
    });
  }

  async update(id: string, dto: Partial<CreateProjectDto>, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.project.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.project.delete({ where: { id } });
  }
}
