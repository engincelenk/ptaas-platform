/**
 * E2E seed script — creates a minimal test user + org for Playwright tests.
 * Run: npx ts-node --project tsconfig.base.json scripts/seed-e2e.ts
 *
 * Environment:
 *   DATABASE_URL            — Prisma connection string
 *   E2E_ADMIN_EMAIL         — Test user email (default: admin@ptaas.local)
 *   E2E_ADMIN_PASSWORD      — Test user password (default: Test1234!secure)
 */

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? 'admin@ptaas.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Test1234!secure';
const ORG_NAME = 'E2E Test Org';

async function main() {
  console.log(`Seeding E2E test data for ${EMAIL}…`);

  // Upsert org
  const org = await prisma.organization.upsert({
    where: { slug: 'e2e-test-org' },
    create: { name: ORG_NAME, slug: 'e2e-test-org' },
    update: { name: ORG_NAME },
  });

  // Upsert user
  const hash = await argon2.hash(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    create: {
      email: EMAIL,
      name: 'E2E Admin',
      passwordHash: hash,
      emailVerified: true,
      mfaEnabled: false,
    },
    update: { passwordHash: hash },
  });

  // Ensure membership
  await prisma.organizationMember.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    create: {
      userId: user.id,
      organizationId: org.id,
      role: 'ADMIN',
      acceptedAt: new Date(),
    },
    update: { role: 'ADMIN', acceptedAt: new Date() },
  });

  // Seed a demo project
  const project = await prisma.project.upsert({
    where: { id: 'e2e-demo-project' },
    create: {
      id: 'e2e-demo-project',
      name: 'E2E Demo Project',
      description: 'Seeded for E2E tests',
      organizationId: org.id,
      createdById: user.id,
    },
    update: {},
  }).catch(() => null);

  if (project) {
    // Seed a demo target
    await prisma.target.upsert({
      where: { id: 'e2e-demo-target' },
      create: {
        id: 'e2e-demo-target',
        value: 'https://demo.ptaas.local',
        type: 'URL',
        status: 'ACTIVE',
        organizationId: org.id,
        projectId: project.id,
      },
      update: {},
    }).catch(() => {});
  }

  console.log(`✅ E2E seed complete — org: ${org.id}, user: ${user.id}`);
}

main()
  .catch((err) => { console.error('Seed failed:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
