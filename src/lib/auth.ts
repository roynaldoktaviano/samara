import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { logActivity } from '@/lib/activity'

// In-memory rate limiter for authorize(): max 10 attempts per email per 2 minutes
const authRateMap = new Map<string, { count: number; resetAt: number }>()
function checkAuthRateLimit(email: string): boolean {
  const now = Date.now()
  const key = email.toLowerCase()
  const entry = authRateMap.get(key)
  if (!entry || entry.resetAt < now) {
    authRateMap.set(key, { count: 1, resetAt: now + 120_000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',     type: 'email' },
        password: { label: 'Password',  type: 'password' },
        tenantId: { label: 'Tenant ID', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        if (!checkAuthRateLimit(credentials.email)) {
          console.warn('[auth] rate limit hit for:', credentials.email)
          return null
        }

        // ── 1. Check super admin in central DB ──────────────────────────────
        const centralUser = await centralDb.centralUser.findUnique({
          where: { email: credentials.email },
        }).catch(() => null)

        if (centralUser?.isSuperAdmin && centralUser.password) {
          if (!centralUser.isActive) { console.error('[auth] super admin account deactivated:', credentials.email); return null }
          const valid = await bcrypt.compare(credentials.password, centralUser.password)
          if (!valid) return null
          return {
            id: centralUser.id,
            email: centralUser.email,
            name: centralUser.name ?? 'Super Admin',
            role: 'SUPER_ADMIN',
            isSuperAdmin: true,
          }
        }

        // ── 2. Look up tenant — use tenantId if provided (multi-tenant picker), else findFirst ──
        const tenantWhere = credentials.tenantId
          ? { tenantId: credentials.tenantId, user: { email: credentials.email } }
          : { user: { email: credentials.email } }

        const userTenant = await centralDb.userTenant.findFirst({
          where: tenantWhere,
          include: { tenant: { select: { id: true, slug: true, databaseUrl: true, logoUrl: true, features: true, isActive: true } }, user: true },
        }).catch((e) => { console.error('[auth] userTenant lookup error:', e.message ?? e); return null })

        console.log('[auth] email:', credentials.email, '| userTenant found:', !!userTenant, '| tenant slug:', userTenant?.tenant?.slug)

        if (userTenant) {
          if (!userTenant.tenant.isActive) { console.error('[auth] tenant deactivated:', userTenant.tenant.slug); return null }
          if (!userTenant.user.isActive) { console.error('[auth] central user deactivated:', credentials.email); return null }
          // Verify against tenant DB
          const tenantDb = getTenantDb(userTenant.tenant.databaseUrl)
          const tenantUser = await tenantDb.user.findUnique({
            where: { email: credentials.email },
          }).catch((e) => { console.error('[auth] tenant DB lookup error:', e.message ?? e); return null })
          if (!tenantUser) { console.error('[auth] user not found in tenant DB for:', credentials.email); return null }
          const valid = await bcrypt.compare(credentials.password, tenantUser.password)
          if (!valid) { console.error('[auth] wrong password for:', credentials.email); return null }
          return {
            id: tenantUser.id,
            email: tenantUser.email,
            name: tenantUser.name ?? null,
            role: tenantUser.role,
            tenantId: userTenant.tenant.id,
            tenantSlug: userTenant.tenant.slug,
            tenantDbUrl: userTenant.tenant.databaseUrl,
            tenantLogoUrl: userTenant.tenant.logoUrl ?? undefined,
            tenantFeatures: (userTenant.tenant.features ?? {}) as Record<string, boolean>,
          }
        }

        // ── 3. Fallback: samara neondb (existing users not yet in central) ──
        console.log('[auth] FALLBACK to samara for:', credentials.email)
        const user = await db.user.findUnique({
          where: { email: credentials.email },
        }).catch(() => null)
        if (!user) return null
        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) return null

        // Resolve Samara tenant from central DB to get proper tenantId + databaseUrl
        const samaraTenant = await centralDb.tenant.findUnique({
          where: { slug: 'samara' },
          select: { id: true, slug: true, databaseUrl: true, logoUrl: true, features: true, isActive: true },
        }).catch(() => null)

        if (samaraTenant && !samaraTenant.isActive) { console.error('[auth] samara tenant deactivated'); return null }

        // Lazy migration: register user into central DB so future logins use tenantId
        if (samaraTenant) {
          void (async () => {
            try {
              const cu = await centralDb.centralUser.upsert({
                where: { email: credentials.email },
                update: { name: user.name ?? undefined },
                create: { email: credentials.email, name: user.name ?? undefined, isSuperAdmin: false },
              })
              await centralDb.userTenant.upsert({
                where: { userId_tenantId: { userId: cu.id, tenantId: samaraTenant.id } },
                update: {},
                create: { userId: cu.id, tenantId: samaraTenant.id },
              })
            } catch (e) {
              console.error('[auth] lazy migration failed for', credentials.email, (e as Error).message)
            }
          })()
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: samaraTenant?.id,
          tenantSlug: 'samara',
          tenantDbUrl: samaraTenant?.databaseUrl ?? process.env.DATABASE_URL,
          tenantLogoUrl: samaraTenant?.logoUrl ?? undefined,
          tenantFeatures: (samaraTenant?.features ?? {}) as Record<string, boolean>,
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.type === 'credentials' && user?.id) {
        const u = user as { id: string; name?: string | null; email?: string | null; role?: string; isSuperAdmin?: boolean }
        if (!u.isSuperAdmin) {
          logActivity({
            userId:   u.id,
            userName: u.name || u.email || 'Unknown',
            userRole: u.role || 'UNKNOWN',
            action:   'LOGIN',
            detail:   'Login successful',
          }).catch(() => {})
        }
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        const u = user as {
          id: string; role: string; isSuperAdmin?: boolean
          tenantId?: string; tenantSlug?: string; tenantDbUrl?: string; tenantLogoUrl?: string
          tenantFeatures?: Record<string, boolean>
        }
        token.id = u.id
        token.role = u.role
        token.isSuperAdmin = u.isSuperAdmin ?? false
        token.tenantId = u.tenantId
        token.tenantSlug = u.tenantSlug
        token.tenantDbUrl = u.tenantDbUrl
        token.tenantLogoUrl = u.tenantLogoUrl
        token.tenantFeatures = u.tenantFeatures
        return token
      }
      // Refresh name/email on subsequent requests
      if (token.isSuperAdmin) return token
      try {
        if (token.tenantDbUrl) {
          const tenantDb = getTenantDb(token.tenantDbUrl as string)
          const dbUser = await tenantDb.user.findUnique({
            where: { id: token.id as string },
            select: { name: true, email: true, role: true },
          }).catch(() => null)
          if (dbUser) { token.name = dbUser.name; token.email = dbUser.email; token.role = dbUser.role }
        } else {
          const dbUser = await db.user.findUnique({
            where: { id: token.id as string },
            select: { name: true, email: true, role: true },
          }).catch(() => null)
          if (dbUser) { token.name = dbUser.name; token.email = dbUser.email; token.role = dbUser.role }
        }
      } catch (e) {
        // Tenant DB unavailable — return existing token so user stays logged in
        console.error('[auth] JWT refresh failed, keeping existing token:', (e as Error).message)
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id          = token.id
        session.user.role        = token.role
        session.user.isSuperAdmin = token.isSuperAdmin ?? false
        session.user.tenantId    = token.tenantId
        session.user.tenantSlug  = token.tenantSlug
        session.user.tenantDbUrl = token.tenantDbUrl
        session.user.tenantLogoUrl = token.tenantLogoUrl
        session.user.tenantFeatures = token.tenantFeatures
      }
      return session
    },
  },
  pages: { signIn: '/login' },
  session: {
    strategy: 'jwt',
    maxAge:    8 * 60 * 60,
    updateAge: 60 * 60,
  },
}
