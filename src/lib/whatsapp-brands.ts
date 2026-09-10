import type { TenantSecretKey } from '@/lib/tenant-secrets-definitions'

// Samara Yachting's 3 WhatsApp Business numbers — each is a genuinely separate Meta
// phone number/System User token, configured in Super Admin > tenant secrets (see
// TENANT_SECRET_DEFINITIONS). Fixed set, not admin-configurable, same as the yacht
// names this mirrors (Samara I/II, Mischief, Otium).
export const WHATSAPP_BRANDS = ['SAMARA', 'MISCHIEF', 'OTIUM'] as const
export type WhatsappBrand = typeof WHATSAPP_BRANDS[number]

export const WHATSAPP_BRAND_LABELS: Record<WhatsappBrand, string> = {
  SAMARA: 'Samara',
  MISCHIEF: 'Mischief',
  OTIUM: 'Otium',
}

export const WHATSAPP_GRAPH_VERSION = 'v21.0'

export const WHATSAPP_BRAND_SECRET_KEYS: Record<WhatsappBrand, { phoneNumberId: TenantSecretKey; apiToken: TenantSecretKey }> = {
  SAMARA:   { phoneNumberId: 'whatsappSamaraPhoneNumberId',   apiToken: 'whatsappSamaraApiToken' },
  MISCHIEF: { phoneNumberId: 'whatsappMischiefPhoneNumberId', apiToken: 'whatsappMischiefApiToken' },
  OTIUM:    { phoneNumberId: 'whatsappOtiumPhoneNumberId',    apiToken: 'whatsappOtiumApiToken' },
}
