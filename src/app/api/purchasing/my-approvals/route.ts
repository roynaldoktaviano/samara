import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

// PurchaseRequests currently waiting on the logged-in user's approval, resolved via
// their Employee.userId link — not role-gated, since a PR's manager can hold any Role.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const employee = await db.employee.findUnique({ where: { userId: session.user.id }, select: { id: true } })
  if (!employee) return NextResponse.json([])

  const requests = await db.purchaseRequest.findMany({
    where: { approverEmployeeId: employee.id, status: 'PENDING_APPROVAL' },
    orderBy: [{ isUrgent: 'desc' }, { createdAt: 'asc' }],
    include: {
      items: { select: { id: true, quantity: true, estimatedCost: true } },
      deliveryLocation: { select: { id: true, name: true } },
      requestedByEmployee: { select: { id: true, fullName: true, employeeNumber: true, department: true } },
    },
  })

  return NextResponse.json(
    requests.map(r => ({
      ...r,
      itemCount: r.items.length,
      totalBudget: r.items.reduce((s, i) => s + i.quantity * i.estimatedCost, 0),
      items: undefined,
    })),
  )
}
