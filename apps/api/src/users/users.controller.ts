import {
  Controller, Get, Delete, Patch, Put, Body, Req, Res, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import archiver from 'archiver';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

class ConsentDto {
  @IsBoolean()
  aiConsent!: boolean;
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMe(user.sub);
  }

  @Patch()
  @ApiOperation({ summary: 'Update display name' })
  updateMe(
    @Body() body: { name: string },
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.usersService.updateMe(user.sub, body.name, req.ip);
  }

  @Patch('password')
  @ApiOperation({ summary: 'Change password' })
  changePassword(
    @Body() body: { currentPassword: string; newPassword: string },
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.usersService.changePassword(user.sub, body.currentPassword, body.newPassword, req.ip);
  }

  @Get('notification-preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  getNotificationPreferences(@CurrentUser() user: JwtPayload) {
    return this.usersService.getNotificationPreferences(user.sub);
  }

  @Put('notification-preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  updateNotificationPreferences(
    @Body() body: { preferences: Array<{ eventType: string; enabled: boolean }> },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.updateNotificationPreferences(user.sub, body.preferences);
  }

  @Get('export')
  @ApiOperation({ summary: 'DSGVO Art. 20 — export all personal data as JSON' })
  async exportData(
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const data = await this.usersService.exportMyData(user.sub);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="ptaas-my-data.json"');
    res.json(data);
  }

  @Get('export-zip')
  @ApiOperation({ summary: 'DSGVO Art. 20 — full ZIP archive of all personal data (M52)' })
  async exportDataZip(
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const data = await this.usersService.exportMyDataFull(user.sub);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="ptaas-data-export-${Date.now()}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const [filename, content] of Object.entries(data)) {
      archive.append(JSON.stringify(content, null, 2), { name: `${filename}.json` });
    }

    archive.append(
      `PTaaS Personal Data Export\nExported: ${new Date().toISOString()}\nFiles: ${Object.keys(data).join(', ')}\n`,
      { name: 'README.txt' },
    );

    await archive.finalize();
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'DSGVO Art. 17 — right to erasure (anonymizes account)' })
  async deleteAccount(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    await this.usersService.deleteMyAccount(user.sub, req.ip);
  }

  @Patch('consent')
  @ApiOperation({ summary: 'DSGVO Art. 7 — update AI analysis consent' })
  updateConsent(
    @Body() dto: ConsentDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.usersService.updateAiConsent(user.sub, dto.aiConsent, req.ip);
  }
}
