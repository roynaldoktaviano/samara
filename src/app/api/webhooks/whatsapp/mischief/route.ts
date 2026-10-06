import { createWhatsappWebhookHandlers } from '@/lib/whatsapp-webhook'

// Mischief's own WhatsApp webhook — for the Mischief number's Meta App:
//   Callback URL:   https://<app-domain>/api/webhooks/whatsapp/mischief?tenant=<slug>
//   Verify token:   "WhatsApp Webhook Verify Token — Mischief" in Super Admin (falls back to the shared one)
// Subscribe to the `messages` webhook field. See src/lib/whatsapp-webhook.ts.
export const { GET, POST } = createWhatsappWebhookHandlers('MISCHIEF')
