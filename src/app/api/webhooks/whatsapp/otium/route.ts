import { createWhatsappWebhookHandlers } from '@/lib/whatsapp-webhook'

// Otium's own WhatsApp webhook — for the Otium number's Meta App:
//   Callback URL:   https://<app-domain>/api/webhooks/whatsapp/otium?tenant=<slug>
//   Verify token:   "WhatsApp Webhook Verify Token — Otium" in Super Admin (falls back to the shared one)
// Subscribe to the `messages` webhook field. See src/lib/whatsapp-webhook.ts.
export const { GET, POST } = createWhatsappWebhookHandlers('OTIUM')
