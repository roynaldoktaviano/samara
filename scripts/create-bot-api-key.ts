/**
 * Issue a read-only API key for an existing BOT user (see src/lib/bot-api-key.ts).
 * The key carries exactly the BOT role's access: GET /api/bot/* only.
 *
 * Run: npx tsx scripts/create-bot-api-key.ts <bot-user-email> [tenant-slug]
 *   tenant-slug defaults to "samara".
 *
 * Revoke: change that BOT user's password (or role), deactivate it, or rotate
 * BOT_API_KEY_SECRET (revokes every key). Must run with the SAME BOT_API_KEY_SECRET /
 * NEXTAUTH_SECRET as the server, or the key won't verify there.
 */

import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

async function main() {
  const [email, slug = 'samara'] = process.argv.slice(2)
  if (!email) {
    console.error('Usage: npx tsx scripts/create-bot-api-key.ts <bot-user-email> [tenant-slug]')
    process.exit(1)
  }
  // Imported after dotenv so the signing secret is read from the loaded env.
  const { createBotApiKey } = await import('../src/lib/bot-api-key-sign')

  const centralDb = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenant = await centralDb.tenant.findUnique({ where: { slug }, select: { id: true, databaseUrl: true, isActive: true } })
  if (!tenant || !tenant.isActive) throw new Error(`Tenant "${slug}" not found or inactive`)

  const tenantDb = new PrismaClient({ datasources: { db: { url: tenant.databaseUrl } } })
  const user = await tenantDb.user.findUnique({ where: { email }, select: { id: true, role: true, password: true } })
  if (!user) throw new Error(`No user ${email} in tenant "${slug}"`)
  if (user.role !== 'BOT') throw new Error(`${email} has role ${user.role} — API keys can only be issued for BOT users`)

  console.log(createBotApiKey(tenant.id, user.id, user.password))
  await Promise.all([centralDb.$disconnect(), tenantDb.$disconnect()])
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })
