import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import PDFDocument from 'pdfkit';
import { Writable } from 'stream';

export const ENGAGEMENT_TYPES = ['WEB_APP', 'API', 'MOBILE', 'NETWORK', 'CLOUD', 'RED_TEAM'] as const;
export const ENGAGEMENT_STATUSES = ['DRAFT', 'ACTIVE', 'REVIEW', 'COMPLETED', 'CANCELLED'] as const;

const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT:     ['ACTIVE', 'CANCELLED'],
  ACTIVE:    ['REVIEW', 'CANCELLED'],
  REVIEW:    ['COMPLETED', 'ACTIVE'],
  COMPLETED: [],
  CANCELLED: ['DRAFT'],
};

export interface UpsertEngagementDto {
  title?: string;
  type?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  testingHours?: number;
  roeText?: string;
  scopeNotes?: string;
}

@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  async get(projectId: string, orgId: string) {
    await this._assertProject(projectId, orgId);
    return this.prisma.engagement.findUnique({
      where: { projectId },
      include: { signedOffBy: { select: { id: true, name: true, email: true } } },
    });
  }

  async create(projectId: string, orgId: string, dto: UpsertEngagementDto & { title: string; type: string }) {
    await this._assertProject(projectId, orgId);
    if (!ENGAGEMENT_TYPES.includes(dto.type as any)) {
      throw new BadRequestException(`type must be one of: ${ENGAGEMENT_TYPES.join(', ')}`);
    }
    const existing = await this.prisma.engagement.findUnique({ where: { projectId } });
    if (existing) throw new BadRequestException('An engagement already exists for this project. Use PATCH to update it.');

    return this.prisma.engagement.create({
      data: {
        projectId,
        organizationId: orgId,
        title: dto.title.trim(),
        type: dto.type,
        status: 'DRAFT',
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        testingHours: dto.testingHours ?? null,
        roeText: dto.roeText?.trim() ?? null,
        scopeNotes: dto.scopeNotes?.trim() ?? null,
      },
      include: { signedOffBy: { select: { id: true, name: true, email: true } } },
    });
  }

  async update(projectId: string, orgId: string, dto: UpsertEngagementDto) {
    const eng = await this._assertEngagement(projectId, orgId);

    if (dto.type && !ENGAGEMENT_TYPES.includes(dto.type as any)) {
      throw new BadRequestException(`type must be one of: ${ENGAGEMENT_TYPES.join(', ')}`);
    }
    if (dto.status && dto.status !== eng.status) {
      const allowed = STATUS_TRANSITIONS[eng.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(`Cannot transition from ${eng.status} to ${dto.status}`);
      }
    }

    return this.prisma.engagement.update({
      where: { projectId },
      data: {
        ...(dto.title      && { title: dto.title.trim() }),
        ...(dto.type       && { type: dto.type }),
        ...(dto.status     && { status: dto.status }),
        ...(dto.startDate  !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.endDate    !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
        ...(dto.testingHours !== undefined && { testingHours: dto.testingHours }),
        ...(dto.roeText    !== undefined && { roeText: dto.roeText?.trim() ?? null }),
        ...(dto.scopeNotes !== undefined && { scopeNotes: dto.scopeNotes?.trim() ?? null }),
      },
      include: { signedOffBy: { select: { id: true, name: true, email: true } } },
    });
  }

  async signOff(projectId: string, orgId: string, userId: string, isAdmin: boolean) {
    if (!isAdmin) throw new ForbiddenException('Only admins can sign off engagements');
    const eng = await this._assertEngagement(projectId, orgId);
    if (!['REVIEW', 'ACTIVE'].includes(eng.status)) {
      throw new BadRequestException('Engagement must be in REVIEW or ACTIVE status to sign off');
    }
    return this.prisma.engagement.update({
      where: { projectId },
      data: { status: 'COMPLETED', signedOffById: userId, signedOffAt: new Date() },
      include: { signedOffBy: { select: { id: true, name: true, email: true } } },
    });
  }

  async generateLetter(projectId: string, orgId: string, out: Writable) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      include: {
        organization: { select: { name: true } },
        targets: { take: 1, select: { value: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');

    const eng = await this.prisma.engagement.findUnique({
      where: { projectId },
      include: { signedOffBy: { select: { name: true, email: true } } },
    });

    const doc = new PDFDocument({ margin: 60, size: 'A4' });
    doc.pipe(out);

    const dateStr = (d: Date | null) => d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : 'TBD';

    // Letterhead
    doc.fontSize(22).fillColor('#1e293b').text('ENGAGEMENT LETTER', { align: 'center' });
    doc.fontSize(10).fillColor('#64748b').text('Penetration Testing as a Service', { align: 'center' });
    doc.moveDown(1.5);

    // Meta block
    const meta = [
      ['Organization', project.organization.name],
      ['Project', project.name],
      ['Engagement Title', eng?.title ?? project.name],
      ['Engagement Type', (eng?.type ?? 'N/A').replace('_', ' ')],
      ['Status', eng?.status ?? 'N/A'],
      ['Target', project.targets[0]?.value ?? 'N/A'],
      ['Start Date', dateStr(eng?.startDate ?? null)],
      ['End Date', dateStr(eng?.endDate ?? null)],
      ['Testing Hours', eng?.testingHours ? `${eng.testingHours}h` : 'N/A'],
      ['Document Date', dateStr(new Date())],
    ];

    doc.rect(60, doc.y, 475, meta.length * 18 + 20).fillAndStroke('#f8fafc', '#e2e8f0');
    let ty = doc.y - meta.length * 18 - 20 + 10;
    for (const [k, v] of meta) {
      doc.fontSize(9).fillColor('#64748b').text(k + ':', 75, ty, { width: 140 });
      doc.fillColor('#1e293b').text(v, 220, ty);
      ty += 18;
    }
    doc.moveDown(meta.length + 1);

    // Rules of Engagement
    if (eng?.roeText) {
      doc.fontSize(12).fillColor('#1e293b').text('Rules of Engagement', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor('#334155').text(eng.roeText, { paragraphGap: 4, lineGap: 2 });
      doc.moveDown(1);
    }

    // Scope Notes
    if (eng?.scopeNotes) {
      doc.fontSize(12).fillColor('#1e293b').text('Scope Notes', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor('#334155').text(eng.scopeNotes, { paragraphGap: 4, lineGap: 2 });
      doc.moveDown(1);
    }

    // Legal disclaimer
    doc.fontSize(12).fillColor('#1e293b').text('Authorization & Disclaimer', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor('#475569').text(
      'The organization named above authorizes the security assessment described in this document. ' +
      'Testing shall be conducted only within the agreed scope and time window. ' +
      'Any findings are confidential and for internal remediation purposes only. ' +
      'The testing team will immediately halt testing and notify the organization if a critical system outage occurs.',
      { paragraphGap: 4, lineGap: 2 },
    );
    doc.moveDown(1.5);

    // Signature block
    if (eng?.signedOffBy) {
      doc.fontSize(10).fillColor('#16a34a').text(`✓ Signed off by ${eng.signedOffBy.name} (${eng.signedOffBy.email})`);
      doc.fontSize(9).fillColor('#64748b').text(`on ${dateStr(eng.signedOffAt ?? null)}`);
    } else {
      doc.fontSize(10).fillColor('#94a3b8').text('Awaiting sign-off');
      doc.moveDown(2);
      doc.fontSize(9).fillColor('#1e293b').text('Authorized Signature: ___________________________   Date: ___________');
    }

    doc.end();
  }

  private async _assertProject(projectId: string, orgId: string) {
    const p = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }

  private async _assertEngagement(projectId: string, orgId: string) {
    await this._assertProject(projectId, orgId);
    const eng = await this.prisma.engagement.findUnique({ where: { projectId } });
    if (!eng) throw new NotFoundException('No engagement found for this project');
    return eng;
  }
}
