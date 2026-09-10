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

export async function sendWhatsappMessage(
  tenantId: string, brand: WhatsappBrand, to: string, body: string, mediaUrl?: string, mediaType?: string, contextMessageId?: string,
): Promise<SendWhatsappResult> {
  const keys = WHATSAPP_BRAND_SECRET_KEYS[brand]
  const [phoneNumberId, apiToken] = await Promise.all([
    getTenantSecret(tenantId, keys.phoneNumberId),
    getTenantSecret(tenantId, keys.apiToken),
  ])
  if (!phoneNumberId || !apiToken) {
    return { ok: false, error: `WhatsApp API is not configured for ${brand} yet` }
  }
  const apiUrl = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${phoneNumberId}/messages`

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

  try {
    const res = await fetch(apiUrl, {
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
