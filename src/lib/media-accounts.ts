import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { roleMatches } from '@/lib/role-utils'

// Press / media portal accounts — owned by Marketing, same roles as the rest of the Media Kit.
const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function requireMediaAccountAccess() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return null
  return session
}

export const MEDIA_ACCOUNT_SELECT = {
  id: true, name: true, email: true, organization: true, note: true,
  portalActive: true, portalPasswordSetAt: true, lastLoginAt: true, createdAt: true,
  portalPasswordHash: true,
  visibleCategories: { select: { categoryId: true } },
} as const

type MediaAccountRow = {
  portalPasswordHash: string | null
  visibleCategories: { categoryId: string }[]
} & Record<string, unknown>

/** Never send the hash to the client — just whether one is set. */
export function serializeMediaAccount({ portalPasswordHash, visibleCategories, ...rest }: MediaAccountRow) {
  return { ...rest, hasPassword: !!portalPasswordHash, visibleCategoryIds: visibleCategories.map(v => v.categoryId) }
}
