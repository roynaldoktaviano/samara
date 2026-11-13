import 'dotenv/config'
const base = process.env.FRESHCHAT_API_URL!.replace(/\/+$/, '').replace(/\/v2$/, '')
const tok = process.env.FRESHCHAT_API_TOKEN!
const get = async (p: string) => { const r = await fetch(`${base}/v2${p}`, { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' } }); const t = await r.text(); let j: any = null; try { j = JSON.parse(t) } catch {}; return { s: r.status, j, t } }
const redact = (o: any) => JSON.stringify(o, (k, v) => (typeof v === 'string' && v.length > 160 ? v.slice(0, 160) + '…' : v))
async function main() {
  for (const p of ['/conversations/6d26f7b2-05b4-4a31-9c52-d4e1983b3093/messages', '/conversations/6d26f7b2-05b4-4a31-9c52-d4e1983b3093/messages?items_per_page=50&page=1', '/conversations/1186502183690398/messages']) {
    const m = await get(p)
    console.log('\n', p.replace(/\?.*/, '?…'), m.s, m.j && !m.j.messages ? redact(m.j) : '')
    if (m.j?.messages) {
      console.log('keys', Object.keys(m.j), 'count', m.j.messages.length, 'link', redact(m.j.link ?? null))
      for (const x of m.j.messages.slice(0, 4)) console.log(redact(x).slice(0, 900))
      break
    }
  }
}
main()
