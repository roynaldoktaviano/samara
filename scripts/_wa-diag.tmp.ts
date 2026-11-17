// Temporary read-only diagnostic for Samara WA send — delete after use.
import { db } from '@/lib/db'
import { centralDb } from '@/lib/central-db'
import { getTenantSecret } from '@/lib/tenant-secrets'

const G = 'https://graph.facebook.com/v21.0'
const mask = (s: string | null) => (s ? `${s.slice(0, 6)}…(${s.length})` : null)

async function main() {
  const out = await db.$queryRawUnsafe<any[]>(`
    SELECT m."createdAt", m.direction::text d, m.status::text s, left(m."errorMessage", 200) err, left(m."providerMessageId", 20) pid
    FROM "WhatsappMessage" m JOIN "WhatsappConversation" c ON c.id = m."conversationId"
    WHERE c.brand = 'SAMARA' AND (m."providerMessageId" IS NULL OR m."providerMessageId" NOT LIKE 'freshchat:%')
    ORDER BY m."createdAt" DESC LIMIT 12`)
  console.table(out)

  const t = await centralDb.tenant.findFirst({ where: { slug: 'samara' }, select: { id: true } })
  if (!t) throw new Error('no tenant')
  const s = async (k: any) => getTenantSecret(t.id, k)
  const phone = await s('whatsappSamaraPhoneNumberId')
  const waba = await s('whatsappSamaraWabaId')
  const token = await s('whatsappSamaraApiToken')
  const verify = await s('whatsappWebhookSecret')
  const appSecret = await s('whatsappAppSecret')
  console.log({ phone, waba, token: mask(token), verifyMatchesNew: verify === 'samara-wa-362576657bb976f3f4a5768f56a6fbf2', appSecretLen: appSecret?.length ?? null })
  if (!token) return

  const j = async (u: string) => { const r = await fetch(u); return r.json() }
  const dbg = await j(`${G}/debug_token?input_token=${token}&access_token=${token}`)
  const d = dbg.data ?? dbg
  console.log('token:', { app_id: d.app_id, application: d.application, type: d.type, valid: d.is_valid, expires: d.expires_at, scopes: d.scopes, granular: d.granular_scopes, error: d.error ?? dbg.error })
  if (d.app_id) console.log('app:', await j(`${G}/${d.app_id}?fields=name,business&access_token=${token}`))
  console.log('phone:', await j(`${G}/${phone}?fields=display_phone_number,verified_name,quality_rating,status,platform_type&access_token=${token}`))
  console.log('waba:', await j(`${G}/${waba}?fields=name,owner_business_info&access_token=${token}`))
  console.log('subscribed_apps:', JSON.stringify(await j(`${G}/${waba}/subscribed_apps?access_token=${token}`)))
}
main().catch(e => console.error(e)).finally(() => process.exit(0))
