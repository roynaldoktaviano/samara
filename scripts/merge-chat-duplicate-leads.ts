/**
 * One-off: merge chat leads that are the same person messaging us on several channels/brands.
 * Messenger PSIDs are per Page, so before src/lib/lead-name-match.ts each Page (and each
 * channel) made its own lead ("Yunita Dwi Saputri" ×3, three different sales owners).
 * Groups chat-created leads (source WHATSAPP_/INSTAGRAM_/MESSENGER_) by exact name, using the
 * same name rules as the live matcher. A group is merged only when no two of its leads have a
 * thread on the same channel + brand (that would be two different people sharing a name).
 * Keeps the oldest lead and its owner; moves threads/contacts/inquiries onto it, hands every
 * moved chat to that owner, and soft-deletes the rest (deletedAt).
 *
 *   npx tsx scripts/merge-chat-duplicate-leads.ts <tenant-slug>          # dry run
 *   npx tsx scripts/merge-chat-duplicate-leads.ts <tenant-slug> --apply
 */
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'
import { resolveTenantDbUrl } from '@/lib/tenant-db-url'
import { matchableName } from '@/lib/lead-name-match'

const slug = process.argv[2]
const apply = process.argv.includes('--apply')

;(async () => {
  if (!slug) throw new Error('usage: merge-chat-duplicate-leads.ts <tenant-slug> [--apply]')
  const tenant = await centralDb.tenant.findFirst({ where: { slug }, select: { id: true } })
  if (!tenant) throw new Error(`tenant ${slug} not found`)
  const db = getTenantDb(await resolveTenantDbUrl(tenant.id))

  const leads = await db.lead.findMany({
    where: { deletedAt: null, OR: ['WHATSAPP_', 'INSTAGRAM_', 'MESSENGER_'].map(p => ({ source: { startsWith: p } })) },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, name: true, ownerId: true, createdAt: true, owner: { select: { name: true } },
      instagramConversations: { select: { platform: true, brand: true } },
      whatsappConversations: { select: { brand: true } },
    },
  })

  const groups = new Map<string, typeof leads>()
  for (const l of leads) {
    const key = matchableName(l.name)?.toLowerCase()
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), l])
  }

  let merged = 0
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const accounts = group.flatMap(l => [
      ...new Set([...l.instagramConversations.map(c => `${c.platform}_${c.brand}`), ...l.whatsappConversations.map(c => `WHATSAPP_${c.brand}`)]),
    ])
    if (new Set(accounts).size !== accounts.length) {
      console.log(`SKIP "${group[0].name}" — two leads share a channel+brand, likely different people`)
      continue
    }
    const [keep, ...dups] = group
    console.log(`"${keep.name}": keep ${keep.id} (${keep.owner?.name ?? 'no owner'}), merge ${dups.map(d => `${d.id} (${d.owner?.name ?? '-'})`).join(', ')}`)
    if (!apply) continue

    const dupIds = dups.map(d => d.id)
    await db.$transaction([
      db.instagramConversation.updateMany({
        where: { leadId: { in: dupIds } },
        data: { leadId: keep.id, ...(keep.ownerId && { assignedToId: keep.ownerId }) },
      }),
      db.whatsappConversation.updateMany({
        where: { leadId: { in: dupIds } },
        data: { leadId: keep.id, ...(keep.ownerId && { assignedToId: keep.ownerId }) },
      }),
      db.leadContact.updateMany({ where: { leadId: { in: dupIds } }, data: { leadId: keep.id, isFirstContact: false } }),
      db.inquiry.updateMany({ where: { leadId: { in: dupIds } }, data: { leadId: keep.id } }),
      db.pageView.updateMany({ where: { leadId: { in: dupIds } }, data: { leadId: keep.id } }),
      db.freshsalesContact.updateMany({ where: { leadId: { in: dupIds } }, data: { leadId: keep.id } }),
      db.lead.updateMany({ where: { id: { in: dupIds } }, data: { deletedAt: new Date() } }),
    ])
    merged += dups.length
  }
  console.log(apply ? `\nMerged ${merged} duplicate lead(s).` : '\nDry run — pass --apply to merge.')
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
