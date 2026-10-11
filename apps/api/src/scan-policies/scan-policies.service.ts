import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScanPolicyDto, UpdateScanPolicyDto } from './scan-policies.dto';

@Injectable()
export class ScanPoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  list(orgId: string) {
    return this.prisma.scanPolicy.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string, orgId: string) {
    // Atomic: org scope in the query itself, no post-fetch check needed
    const policy = await this.prisma.scanPolicy.findFirst({ where: { id, organizationId: orgId } });
    if (!policy) throw new NotFoundException('Policy not found');
    return policy;
  }

  create(orgId: string, dto: CreateScanPolicyDto) {
    return this.prisma.scanPolicy.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        description: dto.description,
        nucleiTags: dto.nucleiTags ?? [],
        nucleiSeverities: dto.nucleiSeverities ?? [],
        excludedTemplates: dto.excludedTemplates ?? [],
        maxDurationSeconds: dto.maxDurationSeconds ?? 3600,
        rateLimit: dto.rateLimit ?? 150,
      },
    });
  }

  async update(id: string, orgId: string, dto: UpdateScanPolicyDto) {
    await this.get(id, orgId); // throws if not owned
    return this.prisma.scanPolicy.update({
      where: { id, organizationId: orgId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.nucleiTags !== undefined && { nucleiTags: dto.nucleiTags }),
        ...(dto.nucleiSeverities !== undefined && { nucleiSeverities: dto.nucleiSeverities }),
        ...(dto.excludedTemplates !== undefined && { excludedTemplates: dto.excludedTemplates }),
        ...(dto.maxDurationSeconds !== undefined && { maxDurationSeconds: dto.maxDurationSeconds }),
        ...(dto.rateLimit !== undefined && { rateLimit: dto.rateLimit }),
      },
    });
  }

  async remove(id: string, orgId: string) {
    await this.get(id, orgId); // throws if not owned
    await this.prisma.scanPolicy.delete({ where: { id, organizationId: orgId } });
  }

  /** Resolve policy flags to nuclei CLI args (internal — no org check, called by scanner) */
  async resolveNucleiArgs(policyId: string | null | undefined): Promise<string[]> {
    if (!policyId) return [];
    const policy = await this.prisma.scanPolicy.findUnique({ where: { id: policyId } });
    if (!policy) return [];

    const args: string[] = [];
    if (policy.nucleiTags.length > 0) args.push('-tags', policy.nucleiTags.join(','));
    if (policy.nucleiSeverities.length > 0) args.push('-severity', policy.nucleiSeverities.join(','));
    if (policy.excludedTemplates.length > 0) args.push('-exclude-templates', policy.excludedTemplates.join(','));
    args.push('-rate-limit', String(policy.rateLimit));
    args.push('-timeout', String(Math.ceil(policy.maxDurationSeconds / 60)));
    return args;
  }
}
