import type { PrismaClient } from '@prisma/client'
import type { WhatsappBrand } from '@/lib/whatsapp-brands'

// WhatsApp Cloud API only allows an ERP to message a customer first (outside the
// 24-hour customer-service window that opens once the customer messages in) using a
// pre-approved Message Template (HSM). Meta has no simple "list my approved templates"
// call without extra WABA permissions we haven't wired up, so admins register each
// approved template themselves at Chat > WhatsApp Templates (WhatsappTemplate table,
// see /api/whatsapp/templates) with the exact name/language Meta shows.
//
// `bodyText` is the approved copy with {{1}}, {{2}}, ... placeholders — kept purely
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
// it's always offered (after the admin-registered ones) for testing a number end-to-end.
export const HELLO_WORLD_TEMPLATE: WhatsappTemplateDef = {
  name: 'hello_world',
  label: 'Hello World (sample)',
  language: 'en_US',
  bodyText: 'Hello World\n\nWelcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test the Cloud API.\n\nWe hope you enjoy the experience!',
}

export async function listWhatsappTemplates(db: PrismaClient, brand: WhatsappBrand): Promise<WhatsappTemplateDef[]> {
  const rows = await db.whatsappTemplate.findMany({
    where: { brand },
    orderBy: { label: 'asc' },
    select: { name: true, label: true, language: true, bodyText: true, paramLabels: true },
  })
  return [...rows, HELLO_WORLD_TEMPLATE]
}

// `language` is optional so older clients that only send a name still resolve — the
// first match wins if the same name is registered in several languages.
export async function findWhatsappTemplate(db: PrismaClient, brand: WhatsappBrand, name: string, language?: string): Promise<WhatsappTemplateDef | undefined> {
  const templates = await listWhatsappTemplates(db, brand)
  return templates.find(t => t.name === name && (!language || t.language === language))
}

// Counts the distinct {{n}} placeholders in a template body — the compose form needs
// exactly one value per placeholder or Meta rejects the send.
export function countTemplateParams(bodyText: string): number {
  const nums = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]))
  return nums.length ? Math.max(...nums) : 0
}

// Fills {{1}}, {{2}}, ... in a template's body with the given params, for local preview/display.
export function renderWhatsappTemplateBody(def: WhatsappTemplateDef, params: string[]): string {
  return def.bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? `{{${n}}}`)
}
