import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CHECKLIST, ITEM_MAP } from './checklist.constants';

export interface UpdateItemDto {
  checked: boolean;
  note?: string;
}

@Injectable()
export class ChecklistService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertProject(projectId: string, orgId: string) {
    const p = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: orgId }, select: { id: true } });
    if (!p) throw new NotFoundException('Project not found');
  }

  // Returns all categories + items merged with DB state for this project
  async getChecklist(projectId: string, orgId: string) {
    await this.assertProject(projectId, orgId);

    const saved = await this.prisma.checklistItem.findMany({
      where: { projectId, organizationId: orgId },
      select: { itemKey: true, checked: true, note: true, checkedAt: true, checkedBy: { select: { name: true } } },
    });

    const savedMap = new Map(saved.map((s) => [s.itemKey, s]));

    const total = CHECKLIST.reduce((n, c) => n + c.items.length, 0);
    const checkedCount = saved.filter((s) => s.checked).length;

    return {
      progress: { total, checked: checkedCount, pct: total > 0 ? Math.round((checkedCount / total) * 100) : 0 },
      categories: CHECKLIST.map((cat) => ({
        id: cat.id,
        label: cat.label,
        icon: cat.icon,
        items: cat.items.map((item) => {
          const state = savedMap.get(item.key);
          return {
            key: item.key,
            label: item.label,
            ref: item.ref,
            checked: state?.checked ?? false,
            note: state?.note ?? null,
            checkedAt: state?.checkedAt ?? null,
            checkedBy: state?.checkedBy?.name ?? null,
          };
        }),
      })),
    };
  }

  async updateItem(projectId: string, orgId: string, itemKey: string, userId: string, dto: UpdateItemDto) {
    await this.assertProject(projectId, orgId);

    if (!ITEM_MAP.has(itemKey)) throw new NotFoundException(`Unknown checklist item: ${itemKey}`);

    const item = await this.prisma.checklistItem.upsert({
      where: { projectId_itemKey: { projectId, itemKey } },
      create: {
        projectId,
        organizationId: orgId,
        itemKey,
        category: ITEM_MAP.get(itemKey)!.categoryId,
        checked: dto.checked,
        note: dto.note ?? null,
        checkedById: dto.checked ? userId : null,
        checkedAt: dto.checked ? new Date() : null,
      },
      update: {
        checked: dto.checked,
        note: dto.note !== undefined ? dto.note : undefined,
        checkedById: dto.checked ? userId : null,
        checkedAt: dto.checked ? new Date() : null,
      },
      select: { itemKey: true, checked: true, note: true, checkedAt: true },
    });

    return item;
  }

  async resetChecklist(projectId: string, orgId: string) {
    await this.assertProject(projectId, orgId);
    await this.prisma.checklistItem.deleteMany({ where: { projectId, organizationId: orgId } });
    return { reset: true };
  }

  // Summary for PDF export
  async getChecklistSummary(projectId: string, orgId: string) {
    const data = await this.getChecklist(projectId, orgId);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      select: { name: true, organization: { select: { name: true } } },
    });
    return { project, ...data };
  }
}
