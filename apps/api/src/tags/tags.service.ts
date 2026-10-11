import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  listOrgTags(orgId: string) {
    return this.prisma.findingTag.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
    });
  }

  async createTag(orgId: string, name: string, color: string) {
    if (!name?.trim()) throw new BadRequestException('name is required');
    if (color && !HEX_RE.test(color)) throw new BadRequestException('color must be a valid hex color (e.g. #6366f1)');

    const existing = await this.prisma.findingTag.findFirst({ where: { organizationId: orgId, name: name.trim() } });
    if (existing) throw new ConflictException(`Tag "${name}" already exists`);

    return this.prisma.findingTag.create({
      data: { organizationId: orgId, name: name.trim(), color: color ?? '#6366f1' },
    });
  }

  async updateTag(tagId: string, orgId: string, name?: string, color?: string) {
    const tag = await this.prisma.findingTag.findFirst({ where: { id: tagId, organizationId: orgId } });
    if (!tag) throw new NotFoundException('Tag not found');
    if (color && !HEX_RE.test(color)) throw new BadRequestException('color must be a valid hex color');

    return this.prisma.findingTag.update({
      where: { id: tagId },
      data: {
        ...(name  && { name: name.trim() }),
        ...(color && { color }),
      },
    });
  }

  async deleteTag(tagId: string, orgId: string) {
    const tag = await this.prisma.findingTag.findFirst({ where: { id: tagId, organizationId: orgId } });
    if (!tag) throw new NotFoundException('Tag not found');
    await this.prisma.findingTag.delete({ where: { id: tagId } });
  }

  async assignTag(findingId: string, tagId: string, orgId: string) {
    await this._assertFinding(findingId, orgId);
    const tag = await this.prisma.findingTag.findFirst({ where: { id: tagId, organizationId: orgId } });
    if (!tag) throw new NotFoundException('Tag not found');

    await this.prisma.findingTagAssignment.upsert({
      where: { findingId_tagId: { findingId, tagId } },
      create: { findingId, tagId },
      update: {},
    });
    return { findingId, tagId };
  }

  async removeTag(findingId: string, tagId: string, orgId: string) {
    await this._assertFinding(findingId, orgId);
    await this.prisma.findingTagAssignment.deleteMany({ where: { findingId, tagId } });
  }

  getTagsForFinding(findingId: string, orgId: string) {
    return this.prisma.findingTagAssignment.findMany({
      where: { findingId, finding: { organizationId: orgId } },
      include: { tag: true },
    });
  }

  private async _assertFinding(findingId: string, orgId: string) {
    const f = await this.prisma.finding.findFirst({ where: { id: findingId, organizationId: orgId } });
    if (!f) throw new NotFoundException('Finding not found');
    return f;
  }
}
