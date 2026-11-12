import { PrismaClient } from '@prisma/client'
import { FreshsalesClient } from '../src/lib/freshsales-archive'
new PrismaClient()
async function main() {
  const fs = new FreshsalesClient(process.env.FRESHSALES_DOMAIN!, process.env.FRESHSALES_API_KEY!)
  for (const rule of [
    { attribute: 'updated_at', operator: 'is_after', value: '2026-11-11T00:00:00+08:00' },
    { attribute: 'deal.updated_at', operator: 'is_after', value: '2026-11-11T00:00:00+08:00' },
  ]) {
    try {
      const d = await fs.post(`/api/filtered_search/deal?page=1&per_page=5&sort=updated_at&sort_type=desc`, { filter_rule: [rule] })
      console.log(rule.attribute, JSON.stringify(d?.meta), JSON.stringify(d?.deals?.map((x: any) => [x.id, x.name, x.updated_at ?? x.stage_updated_time])))
    } catch (e: any) { console.log(rule.attribute, 'ERR', e.message.slice(0, 200)) }
  }
}
main()
