import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async withTenantContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    await this.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn();
  }
}
