import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      isSuperAdmin?: boolean
      tenantId?: string
      tenantSlug?: string
      tenantDbUrl?: string
      tenantLogoUrl?: string
      tenantFeatures?: Record<string, boolean>
    } & DefaultSession['user']
  }

  interface User {
    role: string
    isSuperAdmin?: boolean
    tenantId?: string
    tenantSlug?: string
    tenantDbUrl?: string
    tenantLogoUrl?: string
    tenantFeatures?: Record<string, boolean>
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    isSuperAdmin?: boolean
    tenantId?: string
    tenantSlug?: string
    tenantDbUrl?: string
    tenantLogoUrl?: string
    tenantFeatures?: Record<string, boolean>
  }
}
