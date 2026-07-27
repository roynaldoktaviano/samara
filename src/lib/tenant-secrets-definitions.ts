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
  | 'whatsappApiUrl'
  | 'whatsappApiToken'
  | 'whatsappWebhookSecret'
  | 'whatsappAppSecret'

export interface TenantSecrets {
  freshsalesApiKey?: string
  freshsalesDomain?: string
  resendApiKey?: string
  resendWebhookSecret?: string
  cf7WebhookSecret?: string
  tripSheetGoogleSheetId?: string
  whatsappApiUrl?: string
  whatsappApiToken?: string
  whatsappWebhookSecret?: string
  whatsappAppSecret?: string
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
  { key: 'whatsappApiUrl', label: 'WhatsApp Cloud API Send URL', description: 'Full Graph API messages endpoint, e.g. https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/messages', envFallback: 'WHATSAPP_API_URL' },
  { key: 'whatsappApiToken', label: 'WhatsApp Cloud API Access Token', description: 'System User (permanent) or temporary access token from Meta', envFallback: 'WHATSAPP_API_TOKEN' },
  { key: 'whatsappWebhookSecret', label: 'WhatsApp Webhook Verify Token', description: 'Value you choose and also enter in the Meta webhook subscription setup', envFallback: 'WHATSAPP_WEBHOOK_SECRET' },
  { key: 'whatsappAppSecret', label: 'WhatsApp Meta App Secret', description: 'Verifies inbound Cloud API webhook signatures (X-Hub-Signature-256)', envFallback: 'WHATSAPP_APP_SECRET' },
]

export const VALID_TENANT_SECRET_KEYS = new Set<string>(TENANT_SECRET_DEFINITIONS.map(s => s.key))
export const TENANT_SECRET_ENV_FALLBACK: Record<TenantSecretKey, string> = Object.fromEntries(
  TENANT_SECRET_DEFINITIONS.map(s => [s.key, s.envFallback]),
) as Record<TenantSecretKey, string>
