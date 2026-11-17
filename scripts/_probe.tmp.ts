// Read-only probe: send to an invalid recipient so nobody gets a message; we only want Meta's full error.
import { centralDb } from '@/lib/central-db'
import { getTenantSecret } from '@/lib/tenant-secrets'
const G = 'https://graph.facebook.com/v21.0'
async function main() {
  const t = await centralDb.tenant.findFirst({ where: { slug: 'samara' }, select: { id: true } })
  const tok = await getTenantSecret(t!.id, 'whatsappSamaraApiToken')
  const r = await fetch(`${G}/554341421098858/messages`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: '1', type: 'text', text: { body: 'probe' } }) })
  console.log('send probe:', r.status, JSON.stringify(await r.json()))
  const j = async (u: string) => JSON.stringify(await (await fetch(u)).json())
  console.log('app:', await j(`${G}/1473457058097965?fields=name,category,namespace&access_token=${tok}`))
  console.log('phone:', await j(`${G}/554341421098858?fields=name_status,code_verification_status,account_mode,is_official_business_account,messaging_limit_tier,throughput&access_token=${tok}`))
  console.log('waba:', await j(`${G}/637084068721135?fields=account_review_status,business_verification_status,ownership_type,primary_business_location,on_behalf_of_business_info&access_token=${tok}`))
}
main().finally(() => process.exit(0))
