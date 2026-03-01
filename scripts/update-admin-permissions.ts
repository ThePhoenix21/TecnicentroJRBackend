import { PrismaClient, Role } from '@prisma/client';
import { ALL_PERMISSIONS } from '../src/auth/permissions';

async function main() {
  const prisma = new PrismaClient();

  try {
    const admins = await prisma.user.findMany({
      where: { role: Role.ADMIN },
      select: { id: true, permissions: true },
    });

    let updated = 0;

    for (const admin of admins) {
      const current = Array.isArray(admin.permissions) ? admin.permissions : [];
      const next = Array.from(new Set([...current, ...ALL_PERMISSIONS]));

      if (next.length !== current.length) {
        await prisma.user.update({
          where: { id: admin.id },
          data: { permissions: { set: next } },
          select: { id: true },
        });
        updated += 1;
      }
    }

    // eslint-disable-next-line no-console
    console.log(`Admins revisados: ${admins.length}. Admins actualizados: ${updated}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
