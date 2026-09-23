import { getTenantSecret } from '@/lib/tenant-secrets'
import { WHATSAPP_BRAND_SECRET_KEYS, WHATSAPP_GRAPH_VERSION, type WhatsappBrand } from '@/lib/whatsapp-brands'

// Sends via WhatsApp Cloud API (Meta). Each brand (Samara/Mischief/Otium) is a
// genuinely separate Meta phone number — its phone number ID and access token are
// configured per-brand in Super Admin > tenant secrets (see whatsapp-brands.ts).
export interface SendWhatsappResult {
  ok: boolean
  providerMessageId?: string
  error?: string
}

function cloudApiMediaType(mimeType?: string): 'image' | 'video' | 'audio' | 'document' {
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('video/')) return 'video'
  if (mimeType?.startsWith('audio/')) return 'audio'
  return 'document'
}

async function resolveBrandCredentials(tenantId: string, brand: WhatsappBrand): Promise<{ phoneNumberId: string; apiToken: string } | null> {
  const keys = WHATSAPP_BRAND_SECRET_KEYS[brand]
  const [phoneNumberId, apiToken] = await Promise.all([
    getTenantSecret(tenantId, keys.phoneNumberId),
    getTenantSecret(tenantId, keys.apiToken),
  ])
  if (!phoneNumberId || !apiToken) return null
  return { phoneNumberId, apiToken }
}

async function postToCloudApi(phoneNumberId: string, apiToken: string, payload: Record<string, unknown>): Promise<SendWhatsappResult> {
  try {
    const res = await fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `Provider returned ${res.status}` }
    return { ok: true, providerMessageId: data?.messages?.[0]?.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to reach WhatsApp API' }
  }
}

// Sends a pre-approved Message Template (HSM) — the only way to message someone first
// outside the 24-hour customer-service window (see src/lib/whatsapp-templates.ts for the
// registry of what's approved). `bodyParams` fill the template's {{1}}, {{2}}, ... in order.
export async function sendWhatsappTemplateMessage(
  tenantId: string, brand: WhatsappBrand, to: string, templateName: string, languageCode: string, bodyParams?: string[],
): Promise<SendWhatsappResult> {
  const creds = await resolveBrandCredentials(tenantId, brand)
  if (!creds) return { ok: false, error: `WhatsApp API is not configured for ${brand} yet` }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(bodyParams?.length ? { components: [{ type: 'body', parameters: bodyParams.map(text => ({ type: 'text', text })) }] } : {}),
    },
  }
  return postToCloudApi(creds.phoneNumberId, creds.apiToken, payload)
}

export async function sendWhatsappMessage(
  tenantId: string, brand: WhatsappBrand, to: string, body: string, mediaUrl?: string, mediaType?: string, contextMessageId?: string,
): Promise<SendWhatsappResult> {
  const creds = await resolveBrandCredentials(tenantId, brand)
  if (!creds) {
    return { ok: false, error: `WhatsApp API is not configured for ${brand} yet` }
  }
  const { phoneNumberId, apiToken } = creds

  // `context.message_id` (the WAMID being replied to) is what makes WhatsApp render this as
  // a quoted "swipe to reply" on the recipient's phone — a sibling of `type`/`text`/etc.,
  // not nested inside the type-specific object, so it's spread onto either payload shape.
  const context = contextMessageId ? { context: { message_id: contextMessageId } } : {}

  // Cloud API accepts an external https:// link directly for media (no need to
  // upload to Meta first) — our mediaUrl is already a public Vercel Blob URL.
  const payload = mediaUrl
    ? {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: cloudApiMediaType(mediaType),
        [cloudApiMediaType(mediaType)]: { link: mediaUrl, ...(body && { caption: body }) },
        ...context,
      }
    : {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body },
        ...context,
      }

  return postToCloudApi(phoneNumberId, apiToken, payload)
}
