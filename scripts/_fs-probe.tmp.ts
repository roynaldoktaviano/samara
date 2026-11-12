import 'dotenv/config'
const D = process.env.FRESHSALES_DOMAIN!, K = process.env.FRESHSALES_API_KEY!
const get = async (p: string) => { const r = await fetch(`https://${D}${p}`, { headers: { Authorization: `Token token=${K}` } }); const t = await r.text(); return { s: r.status, rem: r.headers.get('x-ratelimit-remaining'), t } }
async function main() {
  console.log('domain set', !!D, !!K)
  const c = '113003672219'
  const r = await get(`/api/contacts/${c}/conversations?per_page=25&page=1`)
  const j = JSON.parse(r.t); console.log(r.s, r.rem, Object.keys(j), JSON.stringify(j.conversations?.slice(0,5)), JSON.stringify(j.meta))
  for (const k of Object.keys(j)) if (!['email_conversations','conversations','meta'].includes(k)) console.log(k, JSON.stringify(j[k]).slice(0,800))
  const r2 = await get(`/api/sales_activities/113000491947`)
  console.log('SA', r2.s, r2.t.slice(0,1500))
}
main()
