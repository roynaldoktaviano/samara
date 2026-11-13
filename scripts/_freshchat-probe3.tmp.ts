import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const base = process.env.FRESHCHAT_API_URL!.replace(/\/+$/, '').replace(/\/v2$/, '')
const tok = process.env.FRESHCHAT_API_TOKEN!
let calls = 0
const get = async (p: string) => { calls++; const r = await fetch(`${base}/v2${p}`, { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' } }); const t = await r.text(); let j: any = null; try { j = JSON.parse(t) } catch {}; return { s: r.status, j, h: Object.fromEntries([...r.headers].filter(([k]) => /rate|limit|retry/i.test(k))) } }
const red = (o: any) => JSON.stringify(o, (k, v) => (typeof v === 'string' && v.length > 100 ? v.slice(0, 100) + '…' : v))
async function main() {
  const ag = await get('/agents?items_per_page=100')
  console.log('agents', ag.s, red((ag.j?.agents ?? []).map((a: any) => ({ id: a.id, n: `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim(), e: a.email }))), red(ag.h))
  const ids = await db.$queryRawUnsafe<any[]>(`SELECT DISTINCT ON (g) g, cid FROM (SELECT "actionData"->>'group_name' g, "actionData"->>'conversation_id' cid FROM "FreshsalesTimelineEvent" WHERE "actionType"='CONVERSATION_CREATED' ORDER BY "occurredAt" DESC) x`)
  const partKinds: Record<string, number> = {}
  for (const { g, cid } of ids) {
    const c = await get(`/conversations/${cid}`)
    if (c.s !== 200) { console.log(g, 'conv', c.s); continue }
    const m = await get(`/conversations/${c.j.conversation_id}/messages?items_per_page=50`)
    const msgs = m.j?.messages ?? []
    for (const x of msgs) for (const p of x.message_parts ?? []) for (const k of Object.keys(p)) partKinds[k] = (partKinds[k] ?? 0) + 1
    const media = msgs.flatMap((x: any) => (x.message_parts ?? []).filter((p: any) => !p.text))
    console.log(`\n[${g}] channel=${c.j.channel_id} msgs=${msgs.length} actors=${[...new Set(msgs.map((x: any) => x.actor_type))]} types=${[...new Set(msgs.map((x: any) => x.message_type))]}`, media.length ? red(media.slice(0, 2)) : '')
    const u = await get(`/users/${c.j.user_id}`)
    console.log('  user keys', u.s, u.j ? Object.keys(u.j).join(',') : '', red({ fn: u.j?.first_name, ph: u.j?.phone ? 'yes' : 'no', props: (u.j?.properties ?? []).map((p: any) => p.name) }))
  }
  console.log('\nparts', partKinds, 'calls', calls)
}
main().finally(() => db.$disconnect())
