import type { PrismaClient } from '@prisma/client'

// Who hears about a loan request the moment it's filed: Finance/HR by login role, plus
// whoever holds the General Manager / Creative Director job title on their Employee
// profile — there's no dedicated GM/CD login Role in this app (same gap as Payroll's
// "Head of Finance"), and the user confirmed these should be resolved from the
// Employee's job title (EmployeeRole.title), not the account's Role, since that's where
// "General Manager" (Marc) and "Creative Director" (Fresa) are actually recorded.
const GM_CD_TITLES = ['General Manager', 'Creative Director']

export async function resolveLoanStakeholderUserIds(db: PrismaClient, excludeUserId: string): Promise<string[]> {
  const [roleUsers, titledEmployees] = await Promise.all([
    db.user.findMany({ where: { role: { in: ['HR', 'FINANCE', 'FINANCE_DIRECTOR'] as never[] }, id: { not: excludeUserId } }, select: { id: true } }),
    db.employee.findMany({
      where: { isActive: true, userId: { not: null }, role: { title: { in: GM_CD_TITLES, mode: 'insensitive' } } },
      select: { userId: true },
    }),
  ])
  const ids = new Set(roleUsers.map(u => u.id))
  for (const e of titledEmployees) if (e.userId && e.userId !== excludeUserId) ids.add(e.userId)
  return [...ids]
}
