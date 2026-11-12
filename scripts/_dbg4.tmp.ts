import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
;(async () => {
  const t = await centralDb.tenant.findFirst({ where: { slug: 'samara' }, select: { id: true } })
  const db: any = await (getTenantDb as any)(t!.id)
  const msgs = await db.metaDmMessage.findMany({ where: { direction: 'OUTBOUND', conversation: { brand: 'SAMARA' } }, orderBy: { createdAt: 'desc' }, take: 6, include: { conversation: { select: { platform: true, customerName: true, participantId: true, lastInboundAt: true } } } })
  for (const m of msgs) console.log(JSON.stringify({ at: m.createdAt, status: m.status, err: m.error ?? m.errorMessage, conv: m.conversation }))
  process.exit(0)
})()
