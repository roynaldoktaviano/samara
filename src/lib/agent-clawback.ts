import type { PrismaClient } from '@prisma/client'

/**
 * Resolves which $/night clawback rate applies for a booking on this agent — the most
 * specific AgentClawbackRate override wins (yacht+tripType > yacht-only > tripType-only),
 * falling back to Agent.clawbackRatePerNight if no override matches at all. See
 * prisma/schema.prisma's AgentClawbackRate for the scoring rationale.
 */
export async function resolveClawbackRatePerNight(
  db: PrismaClient, agentId: string, yachtId: string | null, tripType: string | null,
): Promise<number> {
  const [agent, rates] = await Promise.all([
    db.agent.findUnique({ where: { id: agentId }, select: { clawbackRatePerNight: true } }),
    db.agentClawbackRate.findMany({ where: { agentId, OR: [{ yachtId: null }, { yachtId }] } }),
  ])
  if (!agent) return 0

  let best: { score: number; rate: number } | null = null
  for (const r of rates) {
    if (r.yachtId !== null && r.yachtId !== yachtId) continue
    if (r.tripType !== null && r.tripType !== tripType) continue
    const score = (r.yachtId !== null ? 2 : 0) + (r.tripType !== null ? 1 : 0)
    if (!best || score > best.score) best = { score, rate: r.ratePerNight }
  }
  return best ? best.rate : agent.clawbackRatePerNight
}
