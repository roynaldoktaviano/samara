// Temporary: connect the app behind Samara's WhatsApp token ("WA Samara") to the Samara WABA,
// so Meta lets that app send from / receive for +62 812-2701-3029. Freshworks stays connected.
// Run: npx tsx scripts/_wa-subscribe.tmp.ts   — delete after use.
import { centralDb } from '@/lib/central-db'
import { getTenantSecret } from '@/lib/tenant-secrets'

const G = 'https://graph.facebook.com/v21.0'
const WABA = '637084068721135'

async function main() {
  const t = await centralDb.tenant.findFirst({ where: { slug: 'samara' }, select: { id: true } })
  const tok = await getTenantSecret(t!.id, 'whatsappSamaraApiToken')
  const r = await fetch(`${G}/${WABA}/subscribed_apps`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` } })
  console.log('subscribe:', r.status, JSON.stringify(await r.json()))
  console.log('connected apps now:', JSON.stringify(await (await fetch(`${G}/${WABA}/subscribed_apps?access_token=${tok}`)).json()))
}
main().catch(e => console.error(e)).finally(() => process.exit(0))
