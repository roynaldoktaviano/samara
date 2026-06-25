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
    } & DefaultSession['user']
  }

  interface User {
    role: string
    isSuperAdmin?: boolean
    tenantId?: string
    tenantSlug?: string
    tenantDbUrl?: string
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
  }
}
