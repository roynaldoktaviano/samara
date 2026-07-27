import { getTenantSecret } from '@/lib/tenant-secrets'

// Sends via WhatsApp Cloud API (Meta). `whatsappApiUrl` (Super Admin → tenant
// secrets) must be the full Graph API messages endpoint for this tenant's phone
// number, e.g. https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/messages —
// `whatsappApiToken` is the System User / access token, sent as a Bearer token.
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
  tenantId: string, to: string, body: string, mediaUrl?: string, mediaType?: string,
): Promise<SendWhatsappResult> {
  const [apiUrl, apiToken] = await Promise.all([
    getTenantSecret(tenantId, 'whatsappApiUrl'),
    getTenantSecret(tenantId, 'whatsappApiToken'),
  ])
  if (!apiUrl || !apiToken) {
    return { ok: false, error: 'WhatsApp API is not configured for this tenant yet' }
  }

  // Cloud API accepts an external https:// link directly for media (no need to
  // upload to Meta first) — our mediaUrl is already a public Vercel Blob URL.
  const payload = mediaUrl
    ? {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: cloudApiMediaType(mediaType),
        [cloudApiMediaType(mediaType)]: { link: mediaUrl, ...(body && { caption: body }) },
      }
    : {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body },
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
