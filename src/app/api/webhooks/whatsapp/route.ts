import { createWhatsappWebhookHandlers } from '@/lib/whatsapp-webhook'

// Shared WhatsApp Cloud API webhook (all brands, routed by phone_number_id) — see
// src/lib/whatsapp-webhook.ts.
export const { GET, POST } = createWhatsappWebhookHandlers()
