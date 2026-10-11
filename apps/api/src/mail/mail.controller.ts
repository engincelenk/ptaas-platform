import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MailService } from './mail.service';

const TEMPLATE_IDS = [
  'invitation',
  'finding_assigned',
  'scan_complete',
  'scan_complete_clean',
  'sla_breach',
  'password_reset',
  'digest',
  'threat_brief',
];

@ApiTags('mail')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/mail')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get('templates')
  @ApiOperation({ summary: 'List available email templates' })
  listTemplates() {
    return { templates: TEMPLATE_IDS };
  }

  @Get('preview')
  @ApiOperation({ summary: 'Preview an email template as HTML' })
  @ApiQuery({ name: 'template', enum: TEMPLATE_IDS })
  preview(@Query('template') template: string, @Res() res: Response) {
    const html = this.mail.previewTemplate(template);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(html);
  }
}
