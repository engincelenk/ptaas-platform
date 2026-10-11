import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const VALID_TYPES = new Set(['URL', 'IP', 'CIDR', 'DOMAIN']);

@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string, orgId: string) {
    await this._assertProject(projectId, orgId);
    const entries = await this.prisma.scopeEntry.findMany({
      where: { projectId, organizationId: orgId },
      include: { addedBy: { select: { id: true, name: true, email: true } } },
      orderBy: [{ inScope: 'desc' }, { createdAt: 'asc' }],
    });
    return {
      inScope:    entries.filter((e) => e.inScope),
      outOfScope: entries.filter((e) => !e.inScope),
      total:      entries.length,
    };
  }

  async add(
    projectId: string,
    orgId: string,
    userId: string,
    dto: { type: string; value: string; inScope?: boolean; note?: string },
  ) {
    if (!VALID_TYPES.has(dto.type?.toUpperCase())) {
      throw new BadRequestException(`type must be one of: ${[...VALID_TYPES].join(', ')}`);
    }
    if (!dto.value?.trim()) throw new BadRequestException('value is required');

    await this._assertProject(projectId, orgId);

    return this.prisma.scopeEntry.create({
      data: {
        projectId,
        organizationId: orgId,
        addedById: userId,
        type: dto.type.toUpperCase(),
        value: dto.value.trim(),
        inScope: dto.inScope ?? true,
        note: dto.note?.trim() ?? null,
      },
      include: { addedBy: { select: { id: true, name: true, email: true } } },
    });
  }

  async update(
    entryId: string,
    orgId: string,
    dto: { type?: string; value?: string; inScope?: boolean; note?: string },
  ) {
    const entry = await this.prisma.scopeEntry.findFirst({ where: { id: entryId, organizationId: orgId } });
    if (!entry) throw new NotFoundException('Scope entry not found');

    if (dto.type && !VALID_TYPES.has(dto.type.toUpperCase())) {
      throw new BadRequestException(`type must be one of: ${[...VALID_TYPES].join(', ')}`);
    }

    return this.prisma.scopeEntry.update({
      where: { id: entryId },
      data: {
        ...(dto.type && { type: dto.type.toUpperCase() }),
        ...(dto.value !== undefined && { value: dto.value.trim() }),
        ...(dto.inScope !== undefined && { inScope: dto.inScope }),
        ...(dto.note !== undefined && { note: dto.note?.trim() ?? null }),
      },
      include: { addedBy: { select: { id: true, name: true, email: true } } },
    });
  }

  async remove(entryId: string, orgId: string) {
    const entry = await this.prisma.scopeEntry.findFirst({ where: { id: entryId, organizationId: orgId } });
    if (!entry) throw new NotFoundException('Scope entry not found');
    await this.prisma.scopeEntry.delete({ where: { id: entryId } });
  }

  async exportMarkdown(projectId: string, orgId: string): Promise<string> {
    const project = await this._assertProject(projectId, orgId);
    const { inScope, outOfScope } = await this.list(projectId, orgId);

    const row = (e: { type: string; value: string; note: string | null }) =>
      `| ${e.type} | \`${e.value}\` | ${e.note ?? ''} |`;

    const lines = [
      `# Scope — ${project.name}`,
      '',
      '## In-Scope',
      '| Type | Value | Note |',
      '|------|-------|------|',
      ...(inScope.length ? inScope.map(row) : ['| — | No in-scope entries | |']),
      '',
      '## Out-of-Scope',
      '| Type | Value | Note |',
      '|------|-------|------|',
      ...(outOfScope.length ? outOfScope.map(row) : ['| — | No out-of-scope entries | |']),
    ];

    return lines.join('\n');
  }

  private async _assertProject(projectId: string, orgId: string) {
    const p = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }
}
