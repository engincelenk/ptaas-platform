import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/html',
  'application/json',
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(
    findingId: string,
    orgId: string,
    userId: string,
    file: Express.Multer.File,
    caption?: string,
  ) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      fs.unlinkSync(file.path);
      throw new BadRequestException(`File type ${file.mimetype} not allowed`);
    }
    if (file.size > MAX_BYTES) {
      fs.unlinkSync(file.path);
      throw new BadRequestException('File exceeds 10 MB limit');
    }

    await this._assertFindingAccess(findingId, orgId);

    const evidence = await this.prisma.evidence.create({
      data: {
        findingId,
        organizationId: orgId,
        uploadedById: userId,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath: file.path,
        caption: caption ?? null,
      },
    });

    return this._toDto(evidence);
  }

  async list(findingId: string, orgId: string) {
    await this._assertFindingAccess(findingId, orgId);

    const rows = await this.prisma.evidence.findMany({
      where: { findingId, organizationId: orgId },
      include: { uploadedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(this._toDto);
  }

  async download(evidenceId: string, orgId: string): Promise<{ filePath: string; mimeType: string; originalName: string }> {
    const ev = await this.prisma.evidence.findUnique({ where: { id: evidenceId } });
    if (!ev || ev.organizationId !== orgId) throw new NotFoundException('Evidence not found');
    if (!fs.existsSync(ev.storagePath)) throw new NotFoundException('File not found on disk');

    return { filePath: ev.storagePath, mimeType: ev.mimeType, originalName: ev.originalName };
  }

  async delete(evidenceId: string, orgId: string, userId: string, isAdmin: boolean) {
    const ev = await this.prisma.evidence.findUnique({ where: { id: evidenceId } });
    if (!ev || ev.organizationId !== orgId) throw new NotFoundException('Evidence not found');
    if (!isAdmin && ev.uploadedById !== userId) {
      throw new ForbiddenException('Only admins or the uploader can delete evidence');
    }

    await this.prisma.evidence.delete({ where: { id: evidenceId } });
    try { fs.unlinkSync(ev.storagePath); } catch { /* file already gone */ }
  }

  private async _assertFindingAccess(findingId: string, orgId: string) {
    const finding = await this.prisma.finding.findFirst({
      where: { id: findingId, organizationId: orgId },
    });
    if (!finding) throw new NotFoundException('Finding not found');
  }

  private _toDto(ev: any) {
    return {
      id: ev.id,
      findingId: ev.findingId,
      filename: ev.filename,
      originalName: ev.originalName,
      mimeType: ev.mimeType,
      size: ev.size,
      caption: ev.caption,
      createdAt: ev.createdAt,
      uploadedBy: ev.uploadedBy ?? null,
    };
  }
}
