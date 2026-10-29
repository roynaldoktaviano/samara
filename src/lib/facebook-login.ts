import { META_DM_BRAND_SECRET_KEYS } from '@/lib/meta-dm'
import { igLoginRedirectUri } from '@/lib/instagram-login'
import { getTenantSecret, setTenantSecrets } from '@/lib/tenant-secrets'
import type { TenantSecretKey } from '@/lib/tenant-secrets-definitions'
import { WHATSAPP_BRAND_LABELS, WHATSAPP_GRAPH_VERSION, type WhatsappBrand } from '@/lib/whatsapp-brands'

// Facebook Login for Business — the Page admin logs in with Facebook from Super Admin and
// picks the brand's Page; the callback (shared with Instagram Login, /api/meta/instagram/callback)
// stores that Page's id, a non-expiring Page token and its linked Instagram account id: exactly
// what the Page-based Messenger + Instagram DM setup in src/lib/meta-dm.ts reads.
//
// Meta App → Facebook Login for Business → Settings → Valid OAuth Redirect URIs:
//   <NEXT_PUBLIC_APP_URL>/api/meta/instagram/callback
// Configurations → the config with pages_show_list, pages_messaging, pages_manage_metadata,
// instagram_basic, instagram_manage_messages → its id is "Facebook Login for Business Configuration ID".

const GRAPH = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}`
const PAGE_FIELDS = ['messages', 'message_echoes', 'message_reactions', 'messaging_postbacks', 'message_deliveries', 'message_reads']

const PAGE_NAME_KEYS: Record<WhatsappBrand, TenantSecretKey> = {
  SAMARA: 'metaDmSamaraPageName', MISCHIEF: 'metaDmMischiefPageName', OTIUM: 'metaDmOtiumPageName',
}

async function appConfig(tenantId: string) {
  const [appId, appSecret, configId] = await Promise.all([
    getTenantSecret(tenantId, 'metaDmAppId'), getTenantSecret(tenantId, 'metaDmAppSecret'), getTenantSecret(tenantId, 'metaDmLoginConfigId'),
  ])
  return appId && appSecret && configId ? { appId, appSecret, configId } : null
}

export async function facebookLoginConfigured(tenantId: string) {
  return !!(await appConfig(tenantId))
}

/** Which of the three secrets Connect via Facebook needs are still empty (labels, for Super Admin). */
export async function facebookLoginMissing(tenantId: string) {
  const need: [TenantSecretKey, string][] = [['metaDmAppId', 'Meta App ID'], ['metaDmAppSecret', 'Meta DM App Secret'], ['metaDmLoginConfigId', 'Facebook Login for Business Configuration ID']]
  const values = await Promise.all(need.map(([k]) => getTenantSecret(tenantId, k)))
  return need.filter((_, i) => !values[i]).map(([, label]) => label)
}

/** Facebook's login dialog for this tenant's Login for Business config, or null when not set up. */
export async function facebookLoginAuthorizeUrl(tenantId: string, state: string) {
  const app = await appConfig(tenantId)
  if (!app) return null
  const params = new URLSearchParams({
    client_id: app.appId,
    config_id: app.configId,
    redirect_uri: igLoginRedirectUri(),
    response_type: 'code',
    override_default_response_type: 'true',
    state,
  })
  return `https://www.facebook.com/${WHATSAPP_GRAPH_VERSION}/dialog/oauth?${params}`
}

async function fbJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({})) as T & { error?: { message?: string } }
  if (!res.ok || data.error) throw new Error(data.error?.message || `Facebook returned ${res.status}`)
  return data
}

type PageRow = { id: string; name: string; access_token?: string; instagram_business_account?: { id: string; username?: string } }

/**
 * Login code → user token (long-lived when Facebook allows) → the Pages granted → the brand's
 * Page: the one already configured for it, else the only one granted. Its Page token, derived
 * from a long-lived user token, does not expire.
 */
export async function connectFacebookLogin(tenantId: string, brand: WhatsappBrand, code: string) {
  const app = await appConfig(tenantId)
  if (!app) throw new Error('Meta App ID / App Secret / Login Configuration ID is not set (Super Admin → Secrets → Facebook & Instagram DM)')

  const short = await fbJson<{ access_token: string }>(await fetch(`${GRAPH}/oauth/access_token?${new URLSearchParams({
    client_id: app.appId, client_secret: app.appSecret, redirect_uri: igLoginRedirectUri(), code,
  })}`))
  // Business-integration configs may hand out a token that can't be exchanged — keep it then.
  let userToken = short.access_token
  try {
    const long = await fbJson<{ access_token: string }>(await fetch(`${GRAPH}/oauth/access_token?${new URLSearchParams({
      grant_type: 'fb_exchange_token', client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: short.access_token,
    })}`))
    userToken = long.access_token
  } catch { /* keep the short-lived one */ }

  const pages = await fbJson<{ data: PageRow[] }>(await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100`,
    { headers: { Authorization: `Bearer ${userToken}` } },
  ))
  const granted = pages.data.filter(p => p.access_token)
  if (!granted.length) throw new Error('No Facebook Page was shared — log in again and select the brand\'s Page')

  const keys = META_DM_BRAND_SECRET_KEYS[brand]
  const [currentPageId, currentIgId] = await Promise.all([getTenantSecret(tenantId, keys.pageId), getTenantSecret(tenantId, keys.igAccountId)])
  const page = granted.find(p => p.id === currentPageId)
    ?? granted.find(p => !!currentIgId && p.instagram_business_account?.id === currentIgId)
    ?? (granted.length === 1 ? granted[0] : null)
  if (!page) {
    throw new Error(`Several Pages were shared (${granted.map(p => p.name).join(', ')}) — log in again and select only ${WHATSAPP_BRAND_LABELS[brand]}'s Page`)
  }

  await setTenantSecrets(tenantId, {
    [keys.pageId]: page.id,
    [keys.pageToken]: page.access_token!,
    [PAGE_NAME_KEYS[brand]]: page.name,
    ...(page.instagram_business_account && { [keys.igAccountId]: page.instagram_business_account.id }),
  })

  let subscribeError: string | null = null
  try {
    const sub = await fbJson<{ success?: boolean }>(await fetch(
      `${GRAPH}/${page.id}/subscribed_apps?${new URLSearchParams({ subscribed_fields: PAGE_FIELDS.join(',') })}`,
      { method: 'POST', headers: { Authorization: `Bearer ${page.access_token}` } },
    ))
    if (!sub.success) subscribeError = 'Facebook did not confirm the Page webhook subscription'
  } catch (e) {
    subscribeError = e instanceof Error ? e.message : 'Page webhook subscription failed'
  }
  return {
    pageName: page.name,
    igUsername: page.instagram_business_account?.username ?? null,
    hasInstagram: !!page.instagram_business_account,
    subscribeError,
  }
}

export async function facebookLoginStatus(tenantId: string, brand: WhatsappBrand) {
  const keys = META_DM_BRAND_SECRET_KEYS[brand]
  const [pageId, pageToken, pageName] = await Promise.all([
    getTenantSecret(tenantId, keys.pageId), getTenantSecret(tenantId, keys.pageToken), getTenantSecret(tenantId, PAGE_NAME_KEYS[brand]),
  ])
  return { pageConnected: !!pageId && !!pageToken, pageName: pageName ?? (pageId ? `Page ${pageId}` : null) }
}
