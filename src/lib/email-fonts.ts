import type { PrismaClient } from '@prisma/client'
import { renderBlocksToHtml, type EmailDesign, type EmailFontFace } from '@/lib/email-builder'

// File extension → CSS `format()` hint for @font-face, plus the MIME type R2 serves it with.
export const FONT_FORMATS: Record<string, { format: string; mime: string }> = {
  woff2: { format: 'woff2', mime: 'font/woff2' },
  woff: { format: 'woff', mime: 'font/woff' },
  ttf: { format: 'truetype', mime: 'font/ttf' },
  otf: { format: 'opentype', mime: 'font/otf' },
}

/**
 * Family names and fallback stacks end up verbatim inside a single-quoted CSS string that
 * itself sits in a double-quoted style="..." attribute, so strip anything that could break
 * out of either (quotes, backslashes, braces, semicolons, angle brackets).
 */
export function sanitizeFontFamily(raw: string): string {
  return raw.replace(/["'\;{}<>]/g, '').replace(/\s+/g, ' ').trim()
}

export function sanitizeFallback(raw: string): string {
  return raw.replace(/["\;{}<>]/g, '').replace(/\s+/g, ' ').trim()
}

export async function loadEmailFonts(db: PrismaClient): Promise<EmailFontFace[]> {
  return db.emailFont.findMany({
    orderBy: [{ family: 'asc' }, { weight: 'asc' }],
    select: { family: true, weight: true, style: true, format: true, fileUrl: true, fallback: true },
  })
}

/** Server-side render with the tenant's uploaded fonts — use this instead of calling renderBlocksToHtml directly. */
export async function renderDesignHtml(db: PrismaClient, design: EmailDesign): Promise<string> {
  return renderBlocksToHtml(design.blocks, design.settings, await loadEmailFonts(db))
}
