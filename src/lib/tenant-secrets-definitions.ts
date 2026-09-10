// Client-safe metadata for per-tenant secrets — no crypto/DB imports, so this
// can be imported from 'use client' pages. Actual read/write logic (which needs
// Node's crypto module and the central DB) lives in src/lib/tenant-secrets.ts.

export type TenantSecretKey =
  | 'freshsalesApiKey'
  | 'freshsalesDomain'
  | 'resendApiKey'
  | 'resendWebhookSecret'
  | 'cf7WebhookSecret'
  | 'tripSheetGoogleSheetId'
  | 'googleAdsConversionsSheetId'
  | 'whatsappSamaraPhoneNumberId'
  | 'whatsappSamaraApiToken'
  | 'whatsappMischiefPhoneNumberId'
  | 'whatsappMischiefApiToken'
  | 'whatsappOtiumPhoneNumberId'
  | 'whatsappOtiumApiToken'
  | 'whatsappWebhookSecret'
  | 'whatsappAppSecret'
  | 'instagramApiUrl'
  | 'instagramApiToken'
  | 'instagramWebhookSecret'
  | 'emailInboxWebhookSecret'
  | 'emailInboxFromAddress'

export interface TenantSecrets {
  freshsalesApiKey?: string
  freshsalesDomain?: string
  resendApiKey?: string
  resendWebhookSecret?: string
  cf7WebhookSecret?: string
  tripSheetGoogleSheetId?: string
  googleAdsConversionsSheetId?: string
  whatsappSamaraPhoneNumberId?: string
  whatsappSamaraApiToken?: string
  whatsappMischiefPhoneNumberId?: string
  whatsappMischiefApiToken?: string
  whatsappOtiumPhoneNumberId?: string
  whatsappOtiumApiToken?: string
  whatsappWebhookSecret?: string
  whatsappAppSecret?: string
  instagramApiUrl?: string
  instagramApiToken?: string
  instagramWebhookSecret?: string
  emailInboxWebhookSecret?: string
  emailInboxFromAddress?: string
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
  { key: 'cf7WebhookSecret', label: 'Website Form Webhook Secret', description: 'Shared secret the WordPress contact form sends', envFallback: 'CF7_WEBHOOK_SECRET' },
  { key: 'tripSheetGoogleSheetId', label: 'Trip Sheet Google Sheet ID', description: "This tenant's own spreadsheet for trip sheet sync", envFallback: 'TRIP_SHEET_GOOGLE_SHEET_ID' },
  { key: 'googleAdsConversionsSheetId', label: 'Google Ads Conversions Sheet ID', description: 'Spreadsheet auto-synced with confirmed-deposit bookings, set as a Google Sheets source on a Google Ads conversion action', envFallback: 'GOOGLE_ADS_CONVERSIONS_SHEET_ID' },
  { key: 'whatsappSamaraPhoneNumberId', label: 'WhatsApp Phone Number ID — Samara', description: "Meta phone number ID for the Samara brand's WhatsApp Business number", envFallback: 'WHATSAPP_SAMARA_PHONE_NUMBER_ID' },
  { key: 'whatsappSamaraApiToken', label: 'WhatsApp API Token — Samara', description: 'System User (permanent) or temporary access token for the Samara number', envFallback: 'WHATSAPP_SAMARA_API_TOKEN' },
  { key: 'whatsappMischiefPhoneNumberId', label: 'WhatsApp Phone Number ID — Mischief', description: "Meta phone number ID for the Mischief brand's WhatsApp Business number", envFallback: 'WHATSAPP_MISCHIEF_PHONE_NUMBER_ID' },
  { key: 'whatsappMischiefApiToken', label: 'WhatsApp API Token — Mischief', description: 'System User (permanent) or temporary access token for the Mischief number', envFallback: 'WHATSAPP_MISCHIEF_API_TOKEN' },
  { key: 'whatsappOtiumPhoneNumberId', label: 'WhatsApp Phone Number ID — Otium', description: "Meta phone number ID for the Otium brand's WhatsApp Business number", envFallback: 'WHATSAPP_OTIUM_PHONE_NUMBER_ID' },
  { key: 'whatsappOtiumApiToken', label: 'WhatsApp API Token — Otium', description: 'System User (permanent) or temporary access token for the Otium number', envFallback: 'WHATSAPP_OTIUM_API_TOKEN' },
  { key: 'whatsappWebhookSecret', label: 'WhatsApp Webhook Verify Token', description: 'Value you choose and also enter in the Meta webhook subscription setup — shared across all 3 numbers if they sit under the same Meta App', envFallback: 'WHATSAPP_WEBHOOK_SECRET' },
  { key: 'whatsappAppSecret', label: 'WhatsApp Meta App Secret', description: 'Verifies inbound Cloud API webhook signatures (X-Hub-Signature-256) — shared across all 3 numbers if they sit under the same Meta App', envFallback: 'WHATSAPP_APP_SECRET' },
  { key: 'instagramApiUrl', label: 'Instagram Send API URL', description: 'Graph API endpoint for sending Instagram DMs once connected', envFallback: 'INSTAGRAM_API_URL' },
  { key: 'instagramApiToken', label: 'Instagram Access Token', description: 'Access token for the connected Instagram/Facebook Page', envFallback: 'INSTAGRAM_API_TOKEN' },
  { key: 'instagramWebhookSecret', label: 'Instagram Webhook Verify Token', description: 'Value you choose and also enter in the Meta webhook subscription setup', envFallback: 'INSTAGRAM_WEBHOOK_SECRET' },
  { key: 'emailInboxWebhookSecret', label: 'Email Inbox Webhook Secret', description: 'Shared secret your inbound-email provider sends when POSTing new emails', envFallback: 'EMAIL_INBOX_WEBHOOK_SECRET' },
  { key: 'emailInboxFromAddress', label: 'Email Inbox From Address', description: 'Sender address for replies (uses the existing Resend API Key to send)', envFallback: 'EMAIL_INBOX_FROM_ADDRESS' },
]

export const VALID_TENANT_SECRET_KEYS = new Set<string>(TENANT_SECRET_DEFINITIONS.map(s => s.key))
export const TENANT_SECRET_ENV_FALLBACK: Record<TenantSecretKey, string> = Object.fromEntries(
  TENANT_SECRET_DEFINITIONS.map(s => [s.key, s.envFallback]),
) as Record<TenantSecretKey, string>
