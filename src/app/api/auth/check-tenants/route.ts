import { NextRequest, NextResponse } from 'next/server'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

// Simple in-memory rate limiter: max 10 attempts per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10
const WINDOW_MS = 60_000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

// POST { email, password } → returns list of tenants where password matches
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Please wait a minute.' }, { status: 429 })
  }

  const { email, password } = await req.json()
  if (!email || !password) return NextResponse.json({ tenants: [] })

  // Super admin check
  const centralUser = await centralDb.centralUser.findUnique({
    where: { email },
    select: { isSuperAdmin: true, password: true },
  }).catch(() => null)
  if (centralUser?.isSuperAdmin && centralUser.password) {
    const valid = await bcrypt.compare(password, centralUser.password)
    if (valid) return NextResponse.json({ tenants: [{ tenantId: null, tenantName: 'Super Admin', tenantSlug: 'super-admin', logoUrl: null }] })
    return NextResponse.json({ tenants: [] })
  }

  // Find all tenants this email belongs to in central DB
  const userTenants = await centralDb.userTenant.findMany({
    where: { user: { email } },
    include: { tenant: { select: { id: true, name: true, slug: true, logoUrl: true, databaseUrl: true } } },
  }).catch(() => [])

  // Verify password in each tenant's DB in parallel
  const results = await Promise.all(
    userTenants.map(async (ut) => {
      try {
        const tenantDb = getTenantDb(ut.tenant.databaseUrl)
        const user = await tenantDb.user.findUnique({ where: { email } })
        if (!user) return null
        const valid = await bcrypt.compare(password, user.password)
        if (!valid) return null
        return { tenantId: ut.tenant.id, tenantName: ut.tenant.name, tenantSlug: ut.tenant.slug, logoUrl: ut.tenant.logoUrl }
      } catch (e) { console.error('[check-tenants] error:', e); return null }
    })
  )

  const matched = results.filter(Boolean) as { tenantId: string; tenantName: string; tenantSlug: string; logoUrl: string | null }[]

  // Check Samara fallback DB for legacy users not yet registered in central
  const alreadyHasSamara = userTenants.some(ut => ut.tenant.slug === 'samara')
  if (!alreadyHasSamara) {
    try {
      const fallbackUser = await db.user.findUnique({ where: { email } })
      if (fallbackUser && await bcrypt.compare(password, fallbackUser.password)) {
        // Find Samara tenant in central DB
        const samaraTenant = await centralDb.tenant.findFirst({ where: { slug: 'samara' } }).catch(() => null)

        if (samaraTenant) {
          // Lazy migration: register this user into central DB so future logins use tenantId
          const cu = await centralDb.centralUser.upsert({
            where: { email },
            update: { name: fallbackUser.name ?? undefined },
            create: { email, name: fallbackUser.name ?? undefined, isSuperAdmin: false },
          }).catch(() => null)
          if (cu) {
            await centralDb.userTenant.upsert({
              where: { userId_tenantId: { userId: cu.id, tenantId: samaraTenant.id } },
              update: {},
              create: { userId: cu.id, tenantId: samaraTenant.id },
            }).catch(() => {})
          }
          matched.push({ tenantId: samaraTenant.id, tenantName: samaraTenant.name, tenantSlug: 'samara', logoUrl: samaraTenant.logoUrl })
        } else {
          // Samara tenant not in central DB yet — use empty string, auth.ts will use fallback
          matched.push({ tenantId: '', tenantName: 'Samara Liveaboard', tenantSlug: 'samara', logoUrl: null })
        }
      }
    } catch { /* ignore */ }
  }

  return NextResponse.json({ tenants: matched })
}
