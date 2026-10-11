import {
  Controller, Post, Body, Param, UseGuards, UseInterceptors,
  UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { FindingsImportService } from './findings-import.service';

@ApiTags('findings-import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SECURITY_ENGINEER')
@Controller('projects/:projectId/findings/import')
export class FindingsImportController {
  constructor(private readonly importSvc: FindingsImportService) {}

  @Post('burp')
  @ApiOperation({ summary: 'Import findings from a Burp Suite XML export' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importBurp(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { targetId: string; deduplication?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('file is required');
    const xml = file.buffer.toString('utf-8');
    if (!xml.includes('<issue') && !xml.includes('<Issue')) {
      throw new BadRequestException('File does not appear to be a Burp Suite XML export');
    }
    const parsed = this.importSvc.parseBurpXml(xml);
    if (parsed.length === 0) throw new BadRequestException('No issues found in the Burp XML export');

    return this.importSvc.importFindings(
      parsed, projectId, body.targetId,
      user.orgId, user.sub,
      body.deduplication !== 'false',
    );
  }

  @Post('zap')
  @ApiOperation({ summary: 'Import findings from an OWASP ZAP JSON report' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importZap(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { targetId: string; deduplication?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('file is required');
    let json: unknown;
    try { json = JSON.parse(file.buffer.toString('utf-8')); }
    catch { throw new BadRequestException('File is not valid JSON'); }

    const parsed = this.importSvc.parseZapJson(json);
    if (parsed.length === 0) throw new BadRequestException('No alerts found in the ZAP report');

    return this.importSvc.importFindings(
      parsed, projectId, body.targetId,
      user.orgId, user.sub,
      body.deduplication !== 'false',
    );
  }

  @Post('json')
  @ApiOperation({ summary: 'Import findings from a generic JSON array or PTaaS export' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importJson(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { targetId: string; deduplication?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('file is required');
    let json: unknown;
    try { json = JSON.parse(file.buffer.toString('utf-8')); }
    catch { throw new BadRequestException('File is not valid JSON'); }

    const parsed = this.importSvc.parseGenericJson(json);
    if (parsed.length === 0) throw new BadRequestException('No findings found in the JSON file');

    return this.importSvc.importFindings(
      parsed, projectId, body.targetId,
      user.orgId, user.sub,
      body.deduplication !== 'false',
    );
  }
}
