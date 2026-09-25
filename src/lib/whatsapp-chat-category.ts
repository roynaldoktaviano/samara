// Client-safe constants for WhatsApp chat triage (see src/lib/whatsapp-lead.ts for the
// server-side logic) — kept separate so UI components don't pull in server-only modules.

export const WHATSAPP_CHAT_CATEGORIES = ['UNSORTED', 'SALES', 'GUEST', 'VENDOR', 'SPAM'] as const
export type WhatsappChatCategory = typeof WHATSAPP_CHAT_CATEGORIES[number]

export const WHATSAPP_CHAT_CATEGORY_LABEL: Record<WhatsappChatCategory, string> = {
  UNSORTED: 'Belum dipilah',
  SALES: 'Sales',
  GUEST: 'Tamu (sudah booking)',
  VENDOR: 'Vendor / Partner',
  SPAM: 'Spam / Salah nomor',
}

export function isWhatsappChatCategory(value: unknown): value is WhatsappChatCategory {
  return typeof value === 'string' && (WHATSAPP_CHAT_CATEGORIES as readonly string[]).includes(value)
}
