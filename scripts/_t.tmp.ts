import { centralDb } from '@/lib/central-db'
import { getTenantSecret } from '@/lib/tenant-secrets'
const G = 'https://graph.facebook.com/v21.0'
async function main() {
  const t = await centralDb.tenant.findFirst({ where: { slug: 'samara' }, select: { id: true, updatedAt: true } })
  console.log('tenant updatedAt', t!.updatedAt.toISOString())
  const sec = await getTenantSecret(t!.id, 'whatsappAppSecret')
  for (const app of ['1473457058097965', '2501831306976166']) {
    const r = await (await fetch(`${G}/${app}?fields=name&access_token=${app}|${sec}`)).json()
    console.log('appSecret vs', app, r.name ? `MATCH (${r.name})` : `no (${r.error?.message?.slice(0, 80)})`)
  }
  const tok = await getTenantSecret(t!.id, 'whatsappSamaraApiToken')
  console.log('phone via new token:', JSON.stringify(await (await fetch(`${G}/554341421098858?fields=id,display_phone_number&access_token=${tok}`)).json()))
  console.log('waba via new token:', JSON.stringify(await (await fetch(`${G}/637084068721135?fields=id,name&access_token=${tok}`)).json()))
}
main().finally(() => process.exit(0))
