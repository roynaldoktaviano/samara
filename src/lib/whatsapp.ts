import { getTenantSecret } from '@/lib/tenant-secrets'

// Adapter point for whichever WhatsApp API provider gets wired up (Cloud API,
// Twilio, Fonnte, Wablas, Qontak, ...). The Chat module works end-to-end without
// this configured — replies still save to WhatsappMessage — they just stay in
// PENDING/FAILED until a provider is set for this tenant (see Super Admin →
// tenant secrets: WhatsApp API URL / WhatsApp API Token).
export interface SendWhatsappResult {
  ok: boolean
  providerMessageId?: string
  error?: string
}

export async function sendWhatsappMessage(tenantId: string, to: string, body: string, mediaUrl?: string): Promise<SendWhatsappResult> {
  const [apiUrl, apiToken] = await Promise.all([
    getTenantSecret(tenantId, 'whatsappApiUrl'),
    getTenantSecret(tenantId, 'whatsappApiToken'),
  ])
  if (!apiUrl || !apiToken) {
    return { ok: false, error: 'WhatsApp API is not configured for this tenant yet' }
  }

  try {
    // Example shape — adjust the request/response mapping (including how media
    // is passed) to match the provider actually wired up here.
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({ to, message: body, ...(mediaUrl && { mediaUrl }) }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error ?? `Provider returned ${res.status}` }
    return { ok: true, providerMessageId: data?.id ?? data?.messageId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to reach WhatsApp API' }
  }
}
