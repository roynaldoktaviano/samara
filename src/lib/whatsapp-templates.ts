import type { WhatsappBrand } from '@/lib/whatsapp-brands'

// WhatsApp Cloud API only allows an ERP to message a customer first (outside the
// 24-hour customer-service window that opens once the customer messages in) using a
// pre-approved Message Template (HSM) — see https://graph.facebook.com "message_templates".
// Meta has no simple "list my approved templates" call without extra WABA permissions
// we haven't wired up, so this is a hand-maintained registry: after you create and get
// a template approved in Meta Business Manager (WhatsApp Manager > Message Templates),
// add it here with the exact name/language Meta shows you.
//
// `bodyText` is the approved copy with {{1}}, {{2}}, ... placeholders — kept here purely
// so the ERP can render a preview/thread bubble locally without calling Meta for it.
// `paramLabels` gives one human label per placeholder, in order, for the compose form.
export interface WhatsappTemplateDef {
  name: string
  label: string
  language: string
  bodyText: string
  paramLabels?: string[]
}

// `hello_world` ships pre-approved on every WhatsApp Business Account by default, so
// this works out of the box for testing — swap in your own approved templates per brand
// once you've created them (they don't have to be shared across brands).
const HELLO_WORLD: WhatsappTemplateDef = {
  name: 'hello_world',
  label: 'Hello World (sample)',
  language: 'en_US',
  bodyText: 'Hello World\n\nWelcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test the Cloud API.\n\nWe hope you enjoy the experience!',
}

export const WHATSAPP_TEMPLATES: Record<WhatsappBrand, WhatsappTemplateDef[]> = {
  SAMARA: [HELLO_WORLD],
  MISCHIEF: [HELLO_WORLD],
  OTIUM: [HELLO_WORLD],
}

export function findWhatsappTemplate(brand: WhatsappBrand, name: string): WhatsappTemplateDef | undefined {
  return WHATSAPP_TEMPLATES[brand].find(t => t.name === name)
}

// Fills {{1}}, {{2}}, ... in a template's body with the given params, for local preview/display.
export function renderWhatsappTemplateBody(def: WhatsappTemplateDef, params: string[]): string {
  return def.bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? `{{${n}}}`)
}
