import 'dotenv/config'
const base = process.env.FRESHCHAT_API_URL!.replace(/\/+$/, '').replace(/\/v2$/, '')
const tok = process.env.FRESHCHAT_API_TOKEN!
const get = async (p: string) => {
  const r = await fetch(`${base}/v2${p}`, { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' } })
  const t = await r.text()
  let j: any = null; try { j = JSON.parse(t) } catch {}
  return { s: r.status, j, t: t.slice(0, 300), rl: r.headers.get('x-ratelimit-remaining') }
}
const redact = (o: any) => JSON.stringify(o, (k, v) => (typeof v === 'string' && v.length > 120 ? v.slice(0, 120) + '…' : v))
async function main() {
  const conv = '1186502183690398'
  const c = await get(`/conversations/${conv}`)
  console.log('conversation', c.s, 'rate-left', c.rl, c.j ? redact(c.j).slice(0, 900) : c.t)
  const m = await get(`/conversations/${conv}/messages?items_per_page=5&page=1`)
  console.log('messages', m.s, m.j ? Object.keys(m.j) : m.t)
  for (const x of (m.j?.messages ?? []).slice(0, 3)) console.log(redact(x).slice(0, 700))
  console.log('pagination', redact(m.j?.pagination ?? m.j?.link ?? null))
  const ch = await get(`/channels?items_per_page=50`)
  console.log('channels', ch.s, ch.j ? redact((ch.j.channels ?? []).map((x: any) => ({ id: x.id, name: x.name, enabled: x.enabled, source: x.source ?? x.channel_type }))) : ch.t)
}
main()
