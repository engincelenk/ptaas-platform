import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import {
  AbortRunDto,
  ApproveRunDto,
  AttemptsQueryDto,
  AttestTargetDto,
  CatalogQueryDto,
  CreateAiTargetDto,
  CreateRunDto,
  KillSwitchDto,
  ListRunsQueryDto,
  UpdateAiTargetDto,
  VerifyAiTargetDto,
} from '../dto/arena.dto';
import { AiTargetsService } from './ai-targets.service';
import { ArenaRoeService } from './arena-roe.service';
import { ArenaRunsService } from './arena-runs.service';
import type { ArenaActor, RequestMeta } from './arena-views';

const actorOf = (u: JwtPayload): ArenaActor => ({ userId: u.sub, organizationId: u.orgId, role: u.role, email: u.email });
const metaOf = (req: Request): RequestMeta => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

/** Operators: ADMIN + SECURITY_ENGINEER (ARENA_OPERATOR_ROLES). Reading is open to every org member. */
@ApiTags('arena')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('arena')
export class ArenaController {
  constructor(
    private readonly targets: AiTargetsService,
    private readonly runs: ArenaRunsService,
    private readonly roe: ArenaRoeService,
  ) {}

  // ── Overview / catalog / RoE ─────────────────────────

  @Get('overview')
  @ApiOperation({ summary: 'KPIs for the Arena start page' })
  overview(@CurrentUser() user: JwtPayload) {
    return this.runs.overview(user.orgId);
  }

  @Get('catalog')
  @ApiOperation({ summary: 'Attack goal catalog (without seed attacks and success criteria)' })
  catalog(@Query() query: CatalogQueryDto) {
    return this.runs.catalog(query.kind);
  }

  @Get('roe/current')
  @ApiOperation({ summary: 'Current rules of engagement' })
  currentRoe() {
    return this.roe.getCurrent();
  }

  // ── Targets ──────────────────────────────────────────

  @Get('targets')
  @ApiOperation({ summary: 'List AI targets' })
  listTargets(@CurrentUser() user: JwtPayload) {
    return this.targets.list(user.orgId);
  }

  @Post('targets')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Register an AI endpoint' })
  createTarget(@Body() dto: CreateAiTargetDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.targets.create(dto, actorOf(user), metaOf(req));
  }

  @Get('targets/:id')
  @ApiOperation({ summary: 'Get an AI target' })
  getTarget(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.targets.get(id, user.orgId);
  }

  @Patch('targets/:id')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Update an AI target (secrets are write-only)' })
  updateTarget(
    @Param('id') id: string,
    @Body() dto: UpdateAiTargetDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.targets.update(id, dto, actorOf(user), metaOf(req));
  }

  @Delete('targets/:id')
  @HttpCode(204)
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Delete an AI target (not while a run is running)' })
  async deleteTarget(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() req: Request): Promise<void> {
    await this.targets.remove(id, actorOf(user), metaOf(req));
  }

  @Post('targets/:id/attest')
  @HttpCode(200)
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Customer attestations (RAG documents placed / agent staging / sandboxed tools)' })
  attest(
    @Param('id') id: string,
    @Body() dto: AttestTargetDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.targets.attest(id, dto, actorOf(user), metaOf(req));
  }

  @Get('targets/:id/verification')
  @ApiOperation({ summary: 'Verification status, token and instructions' })
  verification(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.targets.getVerification(id, user.orgId);
  }

  @Post('targets/:id/verify')
  @HttpCode(200)
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Verify endpoint ownership (DNS TXT, HTTP file or meta tag)' })
  verify(
    @Param('id') id: string,
    @Body() dto: VerifyAiTargetDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.targets.verify(id, dto.method, actorOf(user), metaOf(req));
  }

  // ── Runs ─────────────────────────────────────────────

  @Get('runs')
  @ApiOperation({ summary: 'List runs' })
  listRuns(@Query() query: ListRunsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.runs.list(user.orgId, query.aiTargetId);
  }

  @Post('runs')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Create a run (DRAFT)' })
  createRun(@Body() dto: CreateRunDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.runs.create(dto, actorOf(user), metaOf(req));
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Run detail with score, recommendations and goals' })
  getRun(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.runs.getDetail(id, user.orgId, user.role);
  }

  @Get('runs/:id/attempts')
  @ApiOperation({ summary: 'Attack/response transcript (redacted)' })
  attempts(@Param('id') id: string, @Query() query: AttemptsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.runs.attempts(id, user.orgId, query);
  }

  @Post('runs/:id/submit')
  @HttpCode(200)
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Submit for approval (DRAFT → AWAITING_APPROVAL)' })
  submit(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.runs.submit(id, actorOf(user), metaOf(req));
  }

  @Post('runs/:id/approve')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Approve a run (admin only; consent + rules of engagement)' })
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveRunDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.runs.approve(id, dto, actorOf(user), metaOf(req));
  }

  @Post('runs/:id/start')
  @HttpCode(200)
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Start an approved run (preflight; 409 with reason on failure)' })
  async start(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    await this.runs.start(id, user.orgId, user.sub, metaOf(req));
    return this.runs.getView(id, user.orgId, user.role);
  }

  @Post('runs/:id/abort')
  @HttpCode(200)
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'Emergency stop for a run' })
  abort(
    @Param('id') id: string,
    @Body() dto: AbortRunDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.runs.abort(id, actorOf(user), dto.reason, metaOf(req));
  }

  @Post('runs/:id/retest')
  @Roles('ADMIN', 'SECURITY_ENGINEER')
  @ApiOperation({ summary: 'New DRAFT run with the same settings (retest)' })
  retest(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.runs.retest(id, actorOf(user), metaOf(req));
  }

  // ── Admin ────────────────────────────────────────────

  @Post('kill-org')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Kill switch for the own organization (stops/blocks all its runs)' })
  killOrg(@Body() dto: KillSwitchDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.runs.setOrgKill(dto.on, actorOf(user), metaOf(req));
  }

  @Post('admin/kill')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Platform-wide kill switch (only operators listed in ARENA_PLATFORM_ADMINS; 403 otherwise)' })
  kill(@Body() dto: KillSwitchDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.runs.setGlobalKill(dto.on, actorOf(user), metaOf(req));
  }
}
