import {
  Controller, Post, Get, Delete, Param, UseGuards,
  UseInterceptors, UploadedFile, Body, Res, HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { EvidenceService } from './evidence.service';

import { join } from 'path';

const UPLOAD_DIR = process.env.EVIDENCE_UPLOAD_DIR ?? join(process.cwd(), 'uploads', 'evidence');

const storage = diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

@Controller()
@UseGuards(JwtAuthGuard)
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post('findings/:findingId/evidence')
  @UseInterceptors(FileInterceptor('file', { storage, limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(
    @Param('findingId') findingId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('caption') caption: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.evidenceService.upload(findingId, user.orgId, user.sub, file, caption);
  }

  @Get('findings/:findingId/evidence')
  list(@Param('findingId') findingId: string, @CurrentUser() user: JwtPayload) {
    return this.evidenceService.list(findingId, user.orgId);
  }

  @Get('evidence/:evidenceId/download')
  async download(
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { filePath, mimeType, originalName } = await this.evidenceService.download(evidenceId, user.orgId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
    res.sendFile(filePath, { root: '/' });
  }

  @Delete('evidence/:evidenceId')
  @HttpCode(204)
  delete(@Param('evidenceId') evidenceId: string, @CurrentUser() user: JwtPayload) {
    const isAdmin = user.role === 'ADMIN';
    return this.evidenceService.delete(evidenceId, user.orgId, user.sub, isAdmin);
  }
}
