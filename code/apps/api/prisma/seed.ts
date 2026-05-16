import { PrismaClient, Plan, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Dev-Tenant (feste ID damit AUTH_BYPASS=true funktioniert)
  const tenant = await prisma.tenant.upsert({
    where: { id: 'dev-tenant-001' },
    update: {},
    create: {
      id: 'dev-tenant-001',
      name: 'Dev Organization',
      plan: Plan.PRO,
    },
  });

  // Dev-User
  await prisma.user.upsert({
    where: { clerkId: 'dev-user-001' },
    update: {},
    create: {
      id: 'dev-user-001',
      tenantId: tenant.id,
      email: 'dev@ptaas.local',
      clerkId: 'dev-user-001',
      role: UserRole.ADMIN,
    },
  });

  console.log('Seed abgeschlossen: Dev-Tenant und Dev-User angelegt.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
