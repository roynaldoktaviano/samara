import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

const ALLOWED = ['FINANCE', 'ADMIN', 'SUPER_ADMIN']

// GET — every active agent with their clawback rate and current balance. Balance is the
// signed sum of AgentClawbackEntry rows (append-only ledger, same convention as
// POPaymentRequest/POReimbursement) rather than a stored field, so it can never drift.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const [agents, sums] = await Promise.all([
    db.agent.findMany({
      where: { isActive: true },
      select: { id: true, name: true, clawbackRatePerNight: true },
      orderBy: { name: 'asc' },
    }),
    db.agentClawbackEntry.groupBy({ by: ['agentId'], _sum: { amount: true } }),
  ])

  const balanceByAgent = new Map(sums.map(s => [s.agentId, s._sum.amount ?? 0]))
  return NextResponse.json(agents.map(a => ({ ...a, clawbackBalance: balanceByAgent.get(a.id) ?? 0 })))
}
