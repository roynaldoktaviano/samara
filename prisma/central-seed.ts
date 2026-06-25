import { PrismaClient } from '@prisma/central-client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function main() {
  // Super admin
  const hashed = await bcrypt.hash('superadmin123', 12)
  const superAdmin = await db.centralUser.upsert({
    where: { email: 'superadmin@samarayachting.com' },
    update: { password: hashed, isSuperAdmin: true, name: 'Super Admin', isActive: true },
    create: { email: 'superadmin@samarayachting.com', password: hashed, name: 'Super Admin', isSuperAdmin: true },
  })
  console.log('✅ Super admin:', superAdmin.email)

  // Tenant: Samara
  const samara = await db.tenant.upsert({
    where: { slug: 'samara' },
    update: { name: 'Samara Yachting', isActive: true },
    create: {
      name: 'Samara Yachting',
      slug: 'samara',
      databaseUrl: 'postgresql://neondb_owner:npg_ftKp2Abn9gEO@ep-raspy-bird-aor9pld0-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=5&pool_timeout=30',
      directUrl: 'postgresql://neondb_owner:npg_ftKp2Abn9gEO@ep-raspy-bird-aor9pld0.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
    },
  })
  console.log('✅ Tenant samara:', samara.id)

  // Tenant: Siloina
  const siloina = await db.tenant.upsert({
    where: { slug: 'siloina' },
    update: { name: 'Siloina', isActive: true },
    create: {
      name: 'Siloina',
      slug: 'siloina',
      databaseUrl: 'postgresql://neondb_owner:npg_ftKp2Abn9gEO@ep-raspy-bird-aor9pld0-pooler.c-2.ap-southeast-1.aws.neon.tech/siloina?sslmode=require&channel_binding=require',
      directUrl: 'postgresql://neondb_owner:npg_ftKp2Abn9gEO@ep-raspy-bird-aor9pld0.c-2.ap-southeast-1.aws.neon.tech/siloina?sslmode=require',
    },
  })
  console.log('✅ Tenant siloina:', siloina.id)

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
