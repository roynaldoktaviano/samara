import { getTenantSecret } from '@/lib/tenant-secrets'

// Adapter point for the Instagram Messaging API (via a connected Facebook Page/
// Meta app) once that's wired up. Same shape as src/lib/whatsapp.ts — the Chat
// UI works end-to-end without this; replies just stay PENDING/FAILED until a
// provider is configured for this tenant (Super Admin → tenant secrets).
export interface SendInstagramResult {
  ok: boolean
  providerMessageId?: string
  error?: string
}

export async function sendInstagramMessage(tenantId: string, igUsername: string, body: string): Promise<SendInstagramResult> {
  const [apiUrl, apiToken] = await Promise.all([
    getTenantSecret(tenantId, 'instagramApiUrl'),
    getTenantSecret(tenantId, 'instagramApiToken'),
  ])
  if (!apiUrl || !apiToken) {
    return { ok: false, error: 'Instagram API is not configured for this tenant yet' }
  }

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({ recipient: { username: igUsername }, message: { text: body } }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `Provider returned ${res.status}` }
    return { ok: true, providerMessageId: data?.message_id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to reach Instagram API' }
  }
}
