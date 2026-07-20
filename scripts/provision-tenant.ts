/**
 * Onboard a new tenant: push the tenant schema to an already-provisioned
 * Postgres database, seed its first admin user, and register the tenant
 * in the central DB.
 *
 * This does NOT create the Postgres database itself — provision one first
 * (e.g. a new Neon project/branch) and pass its connection strings in.
 *
 * Run:
 *   npx tsx scripts/provision-tenant.ts \
 *     --name "New Yacht Co" --slug "newyacht" \
 *     --databaseUrl "postgres://...?sslmode=require" \
 *     --directUrl "postgres://..." \
 *     --adminEmail "admin@newyacht.com" --adminName "Admin"
 *
 * Optional: --adminPassword "..." (auto-generated and printed once if omitted).
 */

import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import { spawnSync } from 'child_process'
import * as crypto from 'crypto'
import bcrypt from 'bcryptjs'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

function parseArgs() {
  const args: Record<string, string> = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (key.startsWith('--')) {
      args[key.slice(2)] = argv[i + 1]
      i++
    }
  }
  return args
}

function generatePassword(): string {
  return crypto.randomBytes(12).toString('base64url')
}

async function main() {
  const args = parseArgs()
  const { name, slug, databaseUrl, directUrl, adminEmail, adminName } = args
  const missing = ['name', 'slug', 'databaseUrl', 'adminEmail', 'adminName'].filter(k => !args[k])
  if (missing.length > 0) {
    console.error(`Missing required flags: ${missing.map(k => `--${k}`).join(', ')}`)
    process.exit(1)
  }
  if (!/^[a-z0-9-]{2,50}$/.test(slug)) {
    console.error('Slug must be 2–50 lowercase letters, numbers, or hyphens.')
    process.exit(1)
  }

  const centralDb = new CentralClient({
    datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } },
  })

  try {
    // ── 1. Slug not already taken ──────────────────────────────────────────
    const existing = await centralDb.tenant.findUnique({ where: { slug } })
    if (existing) {
      console.error(`Tenant slug "${slug}" is already registered (id=${existing.id}).`)
      process.exit(1)
    }

    // ── 2. Push the tenant schema to the new database ────────────────────
    console.log(`\n→ Pushing schema to new tenant database...`)
    const pushResult = spawnSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: directUrl || databaseUrl,
      },
      stdio: 'inherit',
    })
    if (pushResult.status !== 0) {
      console.error('\nSchema push failed. Aborting — nothing was registered.')
      process.exit(1)
    }
    console.log('✓ Schema pushed.')

    // ── 3. Create the first admin User in the new tenant DB ──────────────
    const tenantDb = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const adminPassword = args.adminPassword || generatePassword()
    const hashedPassword = await bcrypt.hash(adminPassword, 12)

    await tenantDb.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        password: hashedPassword,
        role: 'ADMIN',
      },
    })
    console.log(`✓ Admin user created in tenant DB: ${adminEmail}`)
    await tenantDb.$disconnect()

    // ── 4. Register the tenant in the central DB ──────────────────────────
    const requestOrderToken = crypto.randomBytes(24).toString('hex')
    const tenant = await centralDb.tenant.create({
      data: { name, slug, databaseUrl, directUrl: directUrl || null, requestOrderToken },
    })
    console.log(`✓ Tenant registered in central DB: ${tenant.id}`)

    // ── 5. Link the admin as a CentralUser + UserTenant membership ────────
    const centralUser = await centralDb.centralUser.upsert({
      where: { email: adminEmail },
      update: {},
      create: { email: adminEmail, name: adminName, isSuperAdmin: false },
    })
    await centralDb.userTenant.create({
      data: { userId: centralUser.id, tenantId: tenant.id },
    })
    console.log(`✓ Central user linked to tenant.`)

    // ── 6. Summary ──────────────────────────────────────────────────────
    console.log('\n──────────────────────────────────────────────')
    console.log('Tenant provisioned successfully.')
    console.log(`  Tenant ID:     ${tenant.id}`)
    console.log(`  Slug:          ${tenant.slug}`)
    console.log(`  Admin login:   ${adminEmail}`)
    if (!args.adminPassword) {
      console.log(`  Admin password: ${adminPassword}  (generated — save this now, it will not be shown again)`)
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://<your-app-domain>'
    console.log(`  Request Order link: ${appUrl}/request-order?token=${requestOrderToken}`)
    console.log('    (share this with staff who submit requests without an ERP login;')
    console.log('     it can be regenerated later from the super-admin Integrations panel)')
    console.log('\nReminders:')
    console.log('  - If this tenant needs Trip Sheet sync, share their Google Sheet with')
    console.log(`    GOOGLE_SERVICE_ACCOUNT_EMAIL (${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '(not set)'}) as an editor,`)
    console.log('    then set their tripSheetGoogleSheetId via the super-admin Integrations panel.')
    console.log('  - Set any other per-tenant integration credentials (Freshsales, Resend, CF7 webhook secret)')
    console.log('    via the same panel — until set, they fall back to the shared default credentials.')
    console.log('──────────────────────────────────────────────\n')

    await centralDb.$disconnect()
  } catch (err) {
    console.error('Provisioning failed:', err)
    await centralDb.$disconnect()
    process.exit(1)
  }
}

main().catch(e => {
  console.error('Provisioning failed:', e)
  process.exit(1)
})
