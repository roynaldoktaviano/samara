// Client-safe metadata for per-tenant secrets — no crypto/DB imports, so this
// can be imported from 'use client' pages. Actual read/write logic (which needs
// Node's crypto module and the central DB) lives in src/lib/tenant-secrets.ts.

export type TenantSecretKey =
  | 'freshsalesApiKey'
  | 'freshsalesDomain'
  | 'resendApiKey'
  | 'resendWebhookSecret'
  | 'cf7WebhookSecret'
  | 'pageviewWebhookSecret'
  | 'pageviewAllowedDomains'
  | 'tripSheetGoogleSheetId'
  | 'googleAdsConversionsSheetId'
  | 'whatsappSamaraPhoneNumberId'
  | 'whatsappSamaraApiToken'
  | 'whatsappMischiefPhoneNumberId'
  | 'whatsappMischiefApiToken'
  | 'whatsappOtiumPhoneNumberId'
  | 'whatsappOtiumApiToken'
  | 'whatsappSamaraWabaId'
  | 'whatsappMischiefWabaId'
  | 'whatsappOtiumWabaId'
  | 'whatsappWebhookSecret'
  | 'whatsappAppSecret'
  | 'whatsappMischiefWebhookSecret'
  | 'whatsappMischiefAppSecret'
  | 'whatsappOtiumWebhookSecret'
  | 'whatsappOtiumAppSecret'
  | 'emailInboxWebhookSecret'
  | 'emailInboxFromAddress'
  | 'emailInboxReplyToAddress'
  | 'metaLeadsWebhookSecret'
  | 'metaLeadsPageToken'
  | 'metaLeadsAppSecret'
  | 'metaDmVerifyToken'
  | 'metaDmAppSecret'
  | 'metaDmMischiefVerifyToken'
  | 'metaDmMischiefAppSecret'
  | 'metaDmOtiumVerifyToken'
  | 'metaDmOtiumAppSecret'
  | 'metaDmSamaraPageId'
  | 'metaDmSamaraIgAccountId'
  | 'metaDmSamaraPageToken'
  | 'metaDmMischiefPageId'
  | 'metaDmMischiefIgAccountId'
  | 'metaDmMischiefPageToken'
  | 'metaDmOtiumPageId'
  | 'metaDmOtiumIgAccountId'
  | 'metaDmOtiumPageToken'

export interface TenantSecrets {
  freshsalesApiKey?: string
  freshsalesDomain?: string
  resendApiKey?: string
  resendWebhookSecret?: string
  cf7WebhookSecret?: string
  pageviewWebhookSecret?: string
  pageviewAllowedDomains?: string
  tripSheetGoogleSheetId?: string
  googleAdsConversionsSheetId?: string
  whatsappSamaraPhoneNumberId?: string
  whatsappSamaraApiToken?: string
  whatsappMischiefPhoneNumberId?: string
  whatsappMischiefApiToken?: string
  whatsappOtiumPhoneNumberId?: string
  whatsappOtiumApiToken?: string
  whatsappSamaraWabaId?: string
  whatsappMischiefWabaId?: string
  whatsappOtiumWabaId?: string
  whatsappWebhookSecret?: string
  whatsappAppSecret?: string
  whatsappMischiefWebhookSecret?: string
  whatsappMischiefAppSecret?: string
  whatsappOtiumWebhookSecret?: string
  whatsappOtiumAppSecret?: string
  emailInboxWebhookSecret?: string
  emailInboxFromAddress?: string
  emailInboxReplyToAddress?: string
  metaLeadsWebhookSecret?: string
  metaLeadsPageToken?: string
  metaLeadsAppSecret?: string
  metaDmVerifyToken?: string
  metaDmAppSecret?: string
  metaDmMischiefVerifyToken?: string
  metaDmMischiefAppSecret?: string
  metaDmOtiumVerifyToken?: string
  metaDmOtiumAppSecret?: string
  metaDmSamaraPageId?: string
  metaDmSamaraIgAccountId?: string
  metaDmSamaraPageToken?: string
  metaDmMischiefPageId?: string
  metaDmMischiefIgAccountId?: string
  metaDmMischiefPageToken?: string
  metaDmOtiumPageId?: string
  metaDmOtiumIgAccountId?: string
  metaDmOtiumPageToken?: string
}

export const TENANT_SECRET_DEFINITIONS: {
  key: TenantSecretKey
  label: string
  description: string
  envFallback: string
}[] = [
  { key: 'freshsalesApiKey', label: 'Freshsales API Key', description: 'Used to import CRM contacts as Leads/Guests', envFallback: 'FRESHSALES_API_KEY' },
  { key: 'freshsalesDomain', label: 'Freshsales Domain', description: 'e.g. yourcompany.myfreshworks.com/crm/sales', envFallback: 'FRESHSALES_DOMAIN' },
  { key: 'resendApiKey', label: 'Resend API Key', description: 'Sends marketing campaigns and newsletters', envFallback: 'RESEND_API_KEY' },
  { key: 'resendWebhookSecret', label: 'Resend Webhook Signing Secret', description: 'Verifies open/click/bounce events from Resend', envFallback: 'RESEND_WEBHOOK_SECRET' },
  { key: 'cf7WebhookSecret', label: 'Website Form Webhook Secret', description: 'Shared secret the WordPress server sends with each form submission (X-Webhook-Secret header) — keep it server-side only, never in browser JS', envFallback: 'CF7_WEBHOOK_SECRET' },
  { key: 'pageviewWebhookSecret', label: 'Website Pageview Tracker Secret', description: 'Secret the WordPress server sends (X-Webhook-Secret header) when forwarding page views — keep it server-side only, never in page source. Must differ from the Website Form Webhook Secret. Empty = every pageview rejected', envFallback: 'PAGEVIEW_WEBHOOK_SECRET' },
  { key: 'pageviewAllowedDomains', label: 'Website Pageview Allowed Domains', description: 'Comma-separated website domains the page-view tracker may report from, e.g. samaraliveaboard.com, otiumyacht.com — subdomains included. Pageviews from any other site are rejected. Empty = any domain accepted', envFallback: 'PAGEVIEW_ALLOWED_DOMAINS' },
  { key: 'tripSheetGoogleSheetId', label: 'Trip Sheet Google Sheet ID', description: "This tenant's own spreadsheet for trip sheet sync", envFallback: 'TRIP_SHEET_GOOGLE_SHEET_ID' },
  { key: 'googleAdsConversionsSheetId', label: 'Google Ads Conversions Sheet ID', description: 'Spreadsheet auto-synced with confirmed-deposit bookings, set as a Google Sheets source on a Google Ads conversion action', envFallback: 'GOOGLE_ADS_CONVERSIONS_SHEET_ID' },
  { key: 'whatsappSamaraPhoneNumberId', label: 'WhatsApp Phone Number ID — Samara', description: "Meta phone number ID for the Samara brand's WhatsApp Business number", envFallback: 'WHATSAPP_SAMARA_PHONE_NUMBER_ID' },
  { key: 'whatsappSamaraApiToken', label: 'WhatsApp API Token — Samara', description: 'System User (permanent) or temporary access token for the Samara number', envFallback: 'WHATSAPP_SAMARA_API_TOKEN' },
  { key: 'whatsappMischiefPhoneNumberId', label: 'WhatsApp Phone Number ID — Mischief', description: "Meta phone number ID for the Mischief brand's WhatsApp Business number", envFallback: 'WHATSAPP_MISCHIEF_PHONE_NUMBER_ID' },
  { key: 'whatsappMischiefApiToken', label: 'WhatsApp API Token — Mischief', description: 'System User (permanent) or temporary access token for the Mischief number', envFallback: 'WHATSAPP_MISCHIEF_API_TOKEN' },
  { key: 'whatsappOtiumPhoneNumberId', label: 'WhatsApp Phone Number ID — Otium', description: "Meta phone number ID for the Otium brand's WhatsApp Business number", envFallback: 'WHATSAPP_OTIUM_PHONE_NUMBER_ID' },
  { key: 'whatsappOtiumApiToken', label: 'WhatsApp API Token — Otium', description: 'System User (permanent) or temporary access token for the Otium number', envFallback: 'WHATSAPP_OTIUM_API_TOKEN' },
  { key: 'whatsappSamaraWabaId', label: 'WhatsApp Business Account ID — Samara', description: 'WABA ID that owns the Samara number — lets Chat > WhatsApp Templates sync approved templates from Meta (token needs whatsapp_business_management)', envFallback: 'WHATSAPP_SAMARA_WABA_ID' },
  { key: 'whatsappMischiefWabaId', label: 'WhatsApp Business Account ID — Mischief', description: 'WABA ID that owns the Mischief number — lets Chat > WhatsApp Templates sync approved templates from Meta (token needs whatsapp_business_management)', envFallback: 'WHATSAPP_MISCHIEF_WABA_ID' },
  { key: 'whatsappOtiumWabaId', label: 'WhatsApp Business Account ID — Otium', description: 'WABA ID that owns the Otium number — lets Chat > WhatsApp Templates sync approved templates from Meta (token needs whatsapp_business_management)', envFallback: 'WHATSAPP_OTIUM_WABA_ID' },
  { key: 'whatsappWebhookSecret', label: 'WhatsApp Webhook Verify Token', description: 'Value you choose and also enter in the Meta webhook subscription setup — shared across all 3 numbers if they sit under the same Meta App', envFallback: 'WHATSAPP_WEBHOOK_SECRET' },
  { key: 'whatsappAppSecret', label: 'WhatsApp Meta App Secret', description: 'Verifies inbound Cloud API webhook signatures (X-Hub-Signature-256) — shared across all 3 numbers if they sit under the same Meta App', envFallback: 'WHATSAPP_APP_SECRET' },
  { key: 'whatsappMischiefWebhookSecret', label: 'WhatsApp Webhook Verify Token — Mischief', description: 'Only if the Mischief number is in its own Meta App — verify token for /api/webhooks/whatsapp/mischief (empty = uses the shared verify token)', envFallback: 'WHATSAPP_MISCHIEF_WEBHOOK_SECRET' },
  { key: 'whatsappMischiefAppSecret', label: 'WhatsApp Meta App Secret — Mischief', description: 'Only if the Mischief number is in its own Meta App — verifies signatures on /api/webhooks/whatsapp/mischief (empty = uses the shared app secret)', envFallback: 'WHATSAPP_MISCHIEF_APP_SECRET' },
  { key: 'whatsappOtiumWebhookSecret', label: 'WhatsApp Webhook Verify Token — Otium', description: 'Only if the Otium number is in its own Meta App — verify token for /api/webhooks/whatsapp/otium (empty = uses the shared verify token)', envFallback: 'WHATSAPP_OTIUM_WEBHOOK_SECRET' },
  { key: 'whatsappOtiumAppSecret', label: 'WhatsApp Meta App Secret — Otium', description: 'Only if the Otium number is in its own Meta App — verifies signatures on /api/webhooks/whatsapp/otium (empty = uses the shared app secret)', envFallback: 'WHATSAPP_OTIUM_APP_SECRET' },
  { key: 'emailInboxWebhookSecret', label: 'Email Inbox Webhook Secret', description: 'Signing secret (whsec_…) of the Resend webhook subscribed to email.received — verifies inbound emails', envFallback: 'EMAIL_INBOX_WEBHOOK_SECRET' },
  { key: 'emailInboxFromAddress', label: 'Email Inbox From Address', description: 'Sender address for replies (uses the existing Resend API Key to send)', envFallback: 'EMAIL_INBOX_FROM_ADDRESS' },
  { key: 'emailInboxReplyToAddress', label: 'Email Inbox Reply-To Address', description: 'Address on a Resend receiving domain (e.g. inbox@reply.example.com) — set as Reply-To so guest replies land back in Chat › Email', envFallback: 'EMAIL_INBOX_REPLY_TO_ADDRESS' },
  { key: 'metaLeadsWebhookSecret', label: 'Meta Lead Ads Webhook Secret', description: 'Verify token for the Meta leadgen webhook subscription, and the ?secret= for flat payloads (Zapier/Make)', envFallback: 'META_LEADS_WEBHOOK_SECRET' },
  { key: 'metaLeadsPageToken', label: 'Meta Lead Ads Page Access Token', description: 'Page token with leads_retrieval — used to fetch the lead details Meta only references by leadgen_id', envFallback: 'META_LEADS_PAGE_TOKEN' },
  { key: 'metaLeadsAppSecret', label: 'Meta Lead Ads App Secret', description: 'Verifies leadgen webhook signatures (X-Hub-Signature-256) — same as the WhatsApp App Secret if both live in one Meta App', envFallback: 'META_LEADS_APP_SECRET' },
  { key: 'metaDmVerifyToken', label: 'Meta DM Webhook Verify Token', description: 'Shared / Samara Meta App — value you choose and also enter as the Verify Token for /api/webhooks/meta-messaging (Messenger + Instagram) in the Meta App', envFallback: 'META_DM_VERIFY_TOKEN' },
  { key: 'metaDmAppSecret', label: 'Meta DM App Secret', description: 'Shared / Samara Meta App — App Secret of the Meta App delivering Messenger/Instagram DMs — verifies webhook signatures (X-Hub-Signature-256)', envFallback: 'META_DM_APP_SECRET' },
  { key: 'metaDmSamaraPageId', label: 'Facebook Page ID — Samara', description: "Samara's Facebook Page id — routes Messenger DMs to this brand, and is the Page replies (Messenger and Instagram) are sent from", envFallback: 'META_DM_SAMARA_PAGE_ID' },
  { key: 'metaDmSamaraIgAccountId', label: 'Instagram Account ID — Samara', description: "Samara's Instagram professional account id (the one linked to the Page above) — routes Instagram DMs to this brand", envFallback: 'META_DM_SAMARA_IG_ACCOUNT_ID' },
  { key: 'metaDmSamaraPageToken', label: 'Page Access Token — Samara', description: 'Long-lived Page token with pages_messaging + instagram_manage_messages — used to send replies and fetch sender names', envFallback: 'META_DM_SAMARA_PAGE_TOKEN' },
  { key: 'metaDmMischiefPageId', label: 'Facebook Page ID — Mischief', description: "Mischief's Facebook Page id — routes Messenger DMs to this brand, and is the Page replies (Messenger and Instagram) are sent from", envFallback: 'META_DM_MISCHIEF_PAGE_ID' },
  { key: 'metaDmMischiefIgAccountId', label: 'Instagram Account ID — Mischief', description: "Mischief's Instagram professional account id (the one linked to the Page above) — routes Instagram DMs to this brand", envFallback: 'META_DM_MISCHIEF_IG_ACCOUNT_ID' },
  { key: 'metaDmMischiefPageToken', label: 'Page Access Token — Mischief', description: 'Long-lived Page token with pages_messaging + instagram_manage_messages — used to send replies and fetch sender names', envFallback: 'META_DM_MISCHIEF_PAGE_TOKEN' },
  { key: 'metaDmMischiefVerifyToken', label: 'Meta DM Webhook Verify Token — Mischief', description: 'Only if Mischief\'s Page/Instagram sits in its own Meta App — the Verify Token entered in that app (empty = uses the shared one)', envFallback: 'META_DM_MISCHIEF_VERIFY_TOKEN' },
  { key: 'metaDmMischiefAppSecret', label: 'Meta DM App Secret — Mischief', description: 'Only if Mischief\'s Page/Instagram sits in its own Meta App — that app\'s App Secret, to verify its webhook signatures (empty = uses the shared one)', envFallback: 'META_DM_MISCHIEF_APP_SECRET' },
  { key: 'metaDmOtiumPageId', label: 'Facebook Page ID — Otium', description: "Otium's Facebook Page id — routes Messenger DMs to this brand, and is the Page replies (Messenger and Instagram) are sent from", envFallback: 'META_DM_OTIUM_PAGE_ID' },
  { key: 'metaDmOtiumIgAccountId', label: 'Instagram Account ID — Otium', description: "Otium's Instagram professional account id (the one linked to the Page above) — routes Instagram DMs to this brand", envFallback: 'META_DM_OTIUM_IG_ACCOUNT_ID' },
  { key: 'metaDmOtiumPageToken', label: 'Page Access Token — Otium', description: 'Long-lived Page token with pages_messaging + instagram_manage_messages — used to send replies and fetch sender names', envFallback: 'META_DM_OTIUM_PAGE_TOKEN' },
  { key: 'metaDmOtiumVerifyToken', label: 'Meta DM Webhook Verify Token — Otium', description: 'Only if Otium\'s Page/Instagram sits in its own Meta App — the Verify Token entered in that app (empty = uses the shared one)', envFallback: 'META_DM_OTIUM_VERIFY_TOKEN' },
  { key: 'metaDmOtiumAppSecret', label: 'Meta DM App Secret — Otium', description: 'Only if Otium\'s Page/Instagram sits in its own Meta App — that app\'s App Secret, to verify its webhook signatures (empty = uses the shared one)', envFallback: 'META_DM_OTIUM_APP_SECRET' },
]

export const VALID_TENANT_SECRET_KEYS = new Set<string>(TENANT_SECRET_DEFINITIONS.map(s => s.key))
export const TENANT_SECRET_ENV_FALLBACK: Record<TenantSecretKey, string> = Object.fromEntries(
  TENANT_SECRET_DEFINITIONS.map(s => [s.key, s.envFallback]),
) as Record<TenantSecretKey, string>

// How Super Admin → Secrets groups the list, so each brand's WhatsApp credentials sit
// together. Order here = display order; within a group, definitions keep their list order
// except WhatsApp, which follows WHATSAPP_FIELD_ORDER. The shared WhatsApp verify token /
// app secret belong to the shared endpoint, which is the Samara number's Meta App.
export const TENANT_SECRET_GROUPS: { id: string; label: string; match: (key: TenantSecretKey) => boolean }[] = [
  { id: 'wa-samara', label: 'WhatsApp — Samara', match: k => k.startsWith('whatsappSamara') || k === 'whatsappWebhookSecret' || k === 'whatsappAppSecret' },
  { id: 'wa-mischief', label: 'WhatsApp — Mischief', match: k => k.startsWith('whatsappMischief') },
  { id: 'wa-otium', label: 'WhatsApp — Otium', match: k => k.startsWith('whatsappOtium') },
  { id: 'email', label: 'Email (Resend)', match: k => k.startsWith('resend') || k.startsWith('emailInbox') },
  { id: 'meta-dm', label: 'Facebook & Instagram DM', match: k => k.startsWith('metaDm') },
  { id: 'meta-leads', label: 'Meta Lead Ads', match: k => k.startsWith('metaLeads') },
  { id: 'freshsales', label: 'Freshsales', match: k => k.startsWith('freshsales') },
  { id: 'other', label: 'Other', match: () => true },
]

const WHATSAPP_FIELD_ORDER = ['PhoneNumberId', 'ApiToken', 'WabaId', 'WebhookSecret', 'AppSecret']
const whatsappFieldRank = (key: string) => {
  const i = WHATSAPP_FIELD_ORDER.findIndex(f => key.endsWith(f))
  return i === -1 ? WHATSAPP_FIELD_ORDER.length : i
}

/** TENANT_SECRET_DEFINITIONS bucketed by TENANT_SECRET_GROUPS (each key lands in its first matching group). */
export function groupedTenantSecretDefinitions() {
  const buckets = TENANT_SECRET_GROUPS.map(g => ({ id: g.id, label: g.label, items: [] as typeof TENANT_SECRET_DEFINITIONS }))
  for (const def of TENANT_SECRET_DEFINITIONS) {
    const idx = TENANT_SECRET_GROUPS.findIndex(g => g.match(def.key))
    buckets[idx].items.push(def)
  }
  for (const b of buckets) {
    if (b.id.startsWith('wa-')) b.items.sort((a, z) => whatsappFieldRank(a.key) - whatsappFieldRank(z.key))
  }
  return buckets.filter(b => b.items.length > 0)
}
