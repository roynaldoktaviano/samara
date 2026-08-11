import { centralDb } from '@/lib/central-db'
import type { Prisma } from '@prisma/central-client'

type WebhookFailureReason = 'unknown_tenant' | 'unauthorized' | 'insufficient_contact_data' | 'exception'

// Fire-and-forget by design — a logging failure must never break the webhook
// response itself. Callers should not await this on the response's critical path.
// `rawPayload` is expected pre-sanitized (string-only values, e.g. via toJsonSafe)
// so it's always safe to store as JSON.
export function logWebhookFailure(params: {
  source: string
  tenantSlug: string | null
  reason: WebhookFailureReason
  detail?: string
  rawPayload?: Record<string, string>
}) {
  const rawPayload: Prisma.InputJsonValue | undefined =
    params.rawPayload && Object.keys(params.rawPayload).length > 0 ? params.rawPayload : undefined

  return centralDb.webhookFailureLog.create({
    data: {
      source:     params.source,
      tenantSlug: params.tenantSlug,
      reason:     params.reason,
      detail:     params.detail ?? null,
      rawPayload,
    },
  }).catch(err => console.error('[webhook-log] failed to persist failure log', err))
}
