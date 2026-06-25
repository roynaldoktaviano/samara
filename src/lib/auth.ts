import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { logActivity } from '@/lib/activity'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        // ── 1. Check super admin in central DB ──────────────────────────────
        const centralUser = await centralDb.centralUser.findUnique({
          where: { email: credentials.email },
        }).catch(() => null)

        if (centralUser?.isSuperAdmin && centralUser.password) {
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

        // ── 2. Look up which tenant this email belongs to ───────────────────
        const userTenant = await centralDb.userTenant.findFirst({
          where: { user: { email: credentials.email } },
          include: { tenant: true, user: true },
        }).catch((e) => { console.error('[auth] userTenant lookup error:', e); return null })

        console.log('[auth] email:', credentials.email, '| userTenant found:', !!userTenant, '| tenant slug:', userTenant?.tenant?.slug)

        if (userTenant) {
          // Verify against tenant DB
          const tenantDb = getTenantDb(userTenant.tenant.databaseUrl)
          const tenantUser = await tenantDb.user.findUnique({
            where: { email: credentials.email },
          }).catch(() => null)
          if (!tenantUser) return null
          const valid = await bcrypt.compare(credentials.password, tenantUser.password)
          if (!valid) return null
          return {
            id: tenantUser.id,
            email: tenantUser.email,
            name: tenantUser.name ?? null,
            role: tenantUser.role,
            tenantId: userTenant.tenant.id,
            tenantSlug: userTenant.tenant.slug,
            tenantDbUrl: userTenant.tenant.databaseUrl,
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
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantSlug: 'samara',
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
          tenantId?: string; tenantSlug?: string; tenantDbUrl?: string
        }
        token.id = u.id
        token.role = u.role
        token.isSuperAdmin = u.isSuperAdmin ?? false
        token.tenantId = u.tenantId
        token.tenantSlug = u.tenantSlug
        token.tenantDbUrl = u.tenantDbUrl
        return token
      }
      // Refresh name/email on subsequent requests
      if (token.isSuperAdmin) return token
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
