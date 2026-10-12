import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@ptaas/db';

/**
 * Defense-in-depth: these models carry tenant data and must always be
 * scoped to an organizationId on writes. We log a warning (not throw) so
 * internal queue workers that legitimately write without org context
 * (e.g. scanner results, AI jobs) are not broken.
 */
const TENANT_MODELS = new Set([
  'finding', 'target', 'scan', 'project',
  'integration', 'apikey', 'scanpolicy', 'webhook',
  'asmscan', 'notification',
  'aitarget', 'arenarun', 'arenaattempt', 'arenarecommendation',
]);

const WRITE_ACTIONS = new Set([
  'create', 'createMany', 'update', 'delete', 'upsert', 'updateMany', 'deleteMany',
]);

type QueryArgs = { where?: Record<string, unknown>; data?: Record<string, unknown> } | undefined;

/**
 * Warns when a write on a tenant model carries no organizationId.
 * Never throws and never blocks the query.
 */
export function warnOnUnscopedTenantWrite(
  log: Pick<Logger, 'warn'>,
  model: string | undefined,
  operation: string,
  args: unknown,
): void {
  if (!model || !TENANT_MODELS.has(model.toLowerCase()) || !WRITE_ACTIONS.has(operation)) return;

  const { where, data } = (args ?? {}) as NonNullable<QueryArgs>;
  const hasOrgInWhere = where?.organizationId !== undefined;
  const hasOrgInData =
    data?.organizationId !== undefined || data?.organization !== undefined || Array.isArray(data);

  if (!hasOrgInWhere && !hasOrgInData) {
    log.warn(
      `[TenantGuard] ${operation} on ${model} without organizationId — ` +
      `stack: ${new Error().stack?.split('\n')[4]?.trim()}`,
    );
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaService.name);

  constructor() {
    super();
    return this._withTenantGuard();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Prisma 6 removed `$use`; query extensions replace it. `$extends` returns a
   * new client object, so the lifecycle hooks are re-attached to it and that
   * object is what Nest receives from the constructor.
   */
  private _withTenantGuard(): this {
    const log = this.log;
    const extended = this.$extends({
      query: {
        $allModels: {
          $allOperations({ model, operation, args, query }) {
            warnOnUnscopedTenantWrite(log, model, operation, args);
            return query(args);
          },
        },
      },
    });

    return Object.assign(extended, {
      log,
      onModuleInit: () => this.onModuleInit(),
      onModuleDestroy: () => this.onModuleDestroy(),
    }) as unknown as this;
  }
}
