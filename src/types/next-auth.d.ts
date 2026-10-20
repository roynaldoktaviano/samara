import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      isSuperAdmin?: boolean
      tenantId?: string
      tenantSlug?: string
      tenantLogoUrl?: string
      tenantFeatures?: Record<string, boolean>
    } & DefaultSession['user']
  }

  interface User {
    role: string
    isSuperAdmin?: boolean
    tenantId?: string
    tenantSlug?: string
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
    tenantLogoUrl?: string
    tenantFeatures?: Record<string, boolean>
    // BOT accounts only: ms timestamp of the password login — middleware expires a BOT
    // session a fixed time after it, regardless of the 30-day sliding cookie.
    loginAt?: number
  }
}
