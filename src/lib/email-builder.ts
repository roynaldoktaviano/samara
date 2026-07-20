// Block-based email design model + renderer shared between the drag & drop
// builder (client) and campaign send/preview (server) so what you see in the
// builder is exactly the HTML that gets sent.

export type BlockAlign = 'left' | 'center' | 'right'

export interface Padding {
  top: number
  right: number
  bottom: number
  left: number
}

export function uniformPadding(n: number): Padding {
  return { top: n, right: n, bottom: n, left: n }
}

/** Padding object → React inline-style fields, for the canvas preview (the sent HTML uses `paddingCss` instead). */
export function paddingStyle(p: Padding): { paddingTop: number; paddingRight: number; paddingBottom: number; paddingLeft: number } {
  return { paddingTop: p.top, paddingRight: p.right, paddingBottom: p.bottom, paddingLeft: p.left }
}

/** Which viewport a block is hidden on, via a CSS media-query class injected into the exported HTML's <head>. */
export type HideOn = 'none' | 'desktop' | 'mobile'

// Font names with spaces are single-quoted, not double-quoted — these values get embedded
// verbatim inside double-quote-delimited style="..." attributes in the rendered email HTML,
// and an embedded " would terminate that attribute early and corrupt everything after it.
export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Georgia', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: 'Courier New', value: "'Courier New', Courier, monospace" },
  { label: 'Palatino', value: "Palatino, 'Palatino Linotype', serif" },
]
const DEFAULT_FONT = FONT_OPTIONS[0].value

export interface TextBlock {
  id: string
  type: 'text'
  html: string // sanitized-on-render simple HTML (bold/italic/link/lists only)
  align: BlockAlign
  fontSize: number
  fontFamily: string
  color: string
  linkColor: string
  lineHeight: number
  letterSpacing: number
  padding: Padding
  hideOn: HideOn
}

export interface HeadingBlock {
  id: string
  type: 'heading'
  html: string
  align: BlockAlign
  fontSize: number
  fontFamily: string
  color: string
  linkColor: string
  lineHeight: number
  letterSpacing: number
  padding: Padding
  hideOn: HideOn
}

export interface ImageBlock {
  id: string
  type: 'image'
  src: string
  alt: string
  width: number // percent of content width, 10-100 — ignored when autoWidth is on
  align: BlockAlign
  link?: string
  autoWidth: boolean
  fullWidthOnMobile: boolean // only meaningful when autoWidth is off
  padding: Padding
  hideOn: HideOn
}

export interface LogoBlock {
  id: string
  type: 'logo'
  src: string
  alt: string
  width: number
  align: BlockAlign
  link?: string
  autoWidth: boolean
  fullWidthOnMobile: boolean
  padding: Padding
  hideOn: HideOn
}

export interface VideoBlock {
  id: string
  type: 'video'
  videoUrl: string
  thumbnailSrc: string
  width: number
  align: BlockAlign
  padding: Padding
  hideOn: HideOn
}

export interface HtmlBlock {
  id: string
  type: 'html'
  code: string
  padding: Padding
  hideOn: HideOn
}

export interface ButtonBlock {
  id: string
  type: 'button'
  label: string
  url: string
  bgColor: string
  textColor: string
  fontFamily: string
  align: BlockAlign
  borderRadius: number
  padding: Padding
  hideOn: HideOn
}

export interface DividerBlock {
  id: string
  type: 'divider'
  color: string
  thickness: number
  width: number // percent of content width, 10-100
  align: BlockAlign
  padding: Padding
  hideOn: HideOn
}

export interface SpacerBlock {
  id: string
  type: 'spacer'
  height: number
  hideOn: HideOn
}

// A column holds a nested list of content blocks — anything except another
// 'columns' or 'section' block (no nested containers, keeps the drag & drop tree 2 levels deep).
export interface ColumnsBlock {
  id: string
  type: 'columns'
  columns: EmailBlock[][] // 1-6 columns, evenly split
  padding: Padding
  gap: number // total horizontal space between columns, in px
  hideOn: HideOn
}

export type SectionBackgroundSize = 'cover' | 'contain' | 'repeat'

// A full-width container with its own background (color and/or image) — holds
// a nested list of content blocks, same 2-level-tree restriction as columns.
export interface SectionBlock {
  id: string
  type: 'section'
  blocks: EmailBlock[]
  padding: Padding
  backgroundColor: string
  backgroundImage: string // '' = none
  backgroundSize: SectionBackgroundSize
  hideOn: HideOn
}

export interface SocialLink {
  platform: string
  url: string
}

export interface SocialBlock {
  id: string
  type: 'social'
  links: SocialLink[]
  align: BlockAlign
  padding: Padding
  hideOn: HideOn
}

export interface FooterBlock {
  id: string
  type: 'footer'
  companyName: string
  address: string
  instagramUrl: string
  whatsappNumber: string
  websiteUrl: string
  align: BlockAlign
  showUnsubscribe: boolean
  padding: number // position/behavior is fixed (can't move/delete/duplicate — see EmailBuilder.tsx), but its content fields above are editable per template/campaign via BlockInspector
  backgroundColor: string // fixed to black by default — not exposed as an editable field, so every footer stays visually consistent
}

export type EmailBlock =
  | TextBlock
  | HeadingBlock
  | ImageBlock
  | LogoBlock
  | VideoBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | ColumnsBlock
  | SectionBlock
  | SocialBlock
  | HtmlBlock
  | FooterBlock

/** Email-wide look & feel — background outside the content card, the card itself, its width and outer padding. */
export interface EmailSettings {
  pageBackground: string
  contentBackground: string
  contentWidth: number
  contentPadding: number
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  pageBackground: '#f3f4f6',
  contentBackground: '#ffffff',
  contentWidth: 600,
  contentPadding: 24,
}

export interface EmailDesign {
  blocks: EmailBlock[]
  settings: EmailSettings
}

// Every design (except raw-HTML mode) gets exactly one footer, appended if
// missing. Its position/behavior is fixed — the builder UI never lets it be
// dragged, duplicated, deleted, or pushed out of last place, and
// normalizeDesign re-appends one on every load/save if it's ever missing —
// but its content (company name, address, social links) IS editable per
// template/campaign via BlockInspector, since different templates use
// different sender identities.
export const FIXED_FOOTER_ADDRESS = 'Jalan Tukad Badung IXB No.9, Renon, Denpasar Selatan, Kota Denpasar, Bali 80234'

function fixedFooterBlock(): FooterBlock {
  return {
    id: nextId(), type: 'footer', align: 'center', showUnsubscribe: true, padding: 20, backgroundColor: '#000000',
    companyName: 'PT Samara Wisata Bahari',
    address: FIXED_FOOTER_ADDRESS,
    instagramUrl: '',
    whatsappNumber: '+62 859-5495-1085',
    websiteUrl: 'https://samaraliveaboard.com',
  }
}

function withFixedFooter(blocks: EmailBlock[]): EmailBlock[] {
  // Raw-HTML authoring mode is a single freeform 'html' block — the fixed footer doesn't apply.
  if (blocks.length === 1 && blocks[0].type === 'html') return blocks
  // Keep the existing footer's edited fields (company name, address, social
  // links) — only position/uniqueness is enforced here (moved to last, no
  // duplicates). migrateBlock already backfilled any missing fields on it.
  // A brand-new default footer is only synthesized when none exists at all.
  const existing = blocks.find((b): b is FooterBlock => b.type === 'footer')
  const footer = existing ?? fixedFooterBlock()
  return [...blocks.filter(b => b.type !== 'footer'), footer]
}

// ── Legacy-data migration ─────────────────────────────────────────────────
// Older saved designs used a single numeric `padding` and didn't have hideOn /
// text-typography / image-width fields at all. Backfill sensible defaults so
// existing templates & campaigns keep rendering correctly after this change.
function migratePadding(raw: unknown, fallback: number): Padding {
  if (raw && typeof raw === 'object' && 'top' in (raw as object)) return raw as Padding
  const n = typeof raw === 'number' ? raw : fallback
  return uniformPadding(n)
}

function migrateHideOn(raw: unknown): HideOn {
  return raw === 'desktop' || raw === 'mobile' ? raw : 'none'
}

// Designs saved before FONT_OPTIONS switched to single-quoted font names (e.g. "Times New
// Roman") stored a double-quoted value that corrupts the double-quote-delimited style="..."
// attribute in the rendered HTML — rewrite any leftover double quotes to single quotes.
function migrateFontFamily(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw.replace(/"/g, "'") : undefined
}

function migrateBlock(raw: EmailBlock): EmailBlock {
  const hideOn = migrateHideOn((raw as { hideOn?: unknown }).hideOn)
  switch (raw.type) {
    case 'text':
    case 'heading':
      return {
        ...raw,
        padding: migratePadding(raw.padding, 16),
        hideOn,
        fontFamily: migrateFontFamily(raw.fontFamily) ?? raw.fontFamily,
        lineHeight: typeof raw.lineHeight === 'number' ? raw.lineHeight : raw.type === 'heading' ? 1.3 : 1.5,
        letterSpacing: typeof raw.letterSpacing === 'number' ? raw.letterSpacing : 0,
        linkColor: raw.linkColor || '#2563eb',
      }
    case 'image':
    case 'logo':
      return {
        ...raw,
        padding: migratePadding(raw.padding, 16),
        hideOn,
        autoWidth: typeof raw.autoWidth === 'boolean' ? raw.autoWidth : false,
        fullWidthOnMobile: typeof raw.fullWidthOnMobile === 'boolean' ? raw.fullWidthOnMobile : false,
      }
    case 'divider':
      return {
        ...raw,
        padding: migratePadding(raw.padding, 16),
        hideOn,
        width: typeof raw.width === 'number' ? raw.width : 100,
        align: raw.align === 'left' || raw.align === 'right' ? raw.align : 'center',
      }
    case 'button':
      return { ...raw, padding: migratePadding(raw.padding, 16), hideOn, fontFamily: migrateFontFamily(raw.fontFamily) ?? raw.fontFamily }
    case 'video':
    case 'html':
    case 'social':
      return { ...raw, padding: migratePadding(raw.padding, 16), hideOn }
    case 'spacer':
      return { ...raw, hideOn }
    case 'columns':
      return { ...raw, padding: migratePadding(raw.padding, 16), hideOn, columns: raw.columns.map(list => list.map(migrateBlock)) }
    case 'section':
      return { ...raw, padding: migratePadding(raw.padding, 24), hideOn, blocks: raw.blocks.map(migrateBlock) }
    case 'footer':
      return {
        ...raw,
        padding: typeof raw.padding === 'number' ? raw.padding : 20,
        backgroundColor: raw.backgroundColor || '#000000',
        companyName: raw.companyName || 'PT Samara Wisata Bahari',
        address: raw.address || FIXED_FOOTER_ADDRESS,
        instagramUrl: raw.instagramUrl || '',
        whatsappNumber: raw.whatsappNumber || '+62 859-5495-1085',
        websiteUrl: raw.websiteUrl || 'https://samaraliveaboard.com',
      }
  }
}

/** Normalizes stored design JSON — handles legacy rows saved before `settings` existed (bare block array) and older block shapes. */
export function normalizeDesign(raw: unknown): EmailDesign {
  if (Array.isArray(raw)) return { blocks: withFixedFooter((raw as EmailBlock[]).map(migrateBlock)), settings: { ...DEFAULT_EMAIL_SETTINGS } }
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).blocks)) {
    const r = raw as { blocks: EmailBlock[]; settings?: Partial<EmailSettings> }
    return { blocks: withFixedFooter(r.blocks.map(migrateBlock)), settings: { ...DEFAULT_EMAIL_SETTINGS, ...r.settings } }
  }
  return { blocks: withFixedFooter([]), settings: { ...DEFAULT_EMAIL_SETTINGS } }
}

export const UNSUBSCRIBE_TOKEN = '{{UNSUBSCRIBE_URL}}'

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `blk_${Date.now().toString(36)}_${idCounter}`
}

export function createBlock(type: EmailBlock['type']): EmailBlock {
  switch (type) {
    case 'text':
      return { id: nextId(), type: 'text', html: '<p>Write something...</p>', align: 'left', fontSize: 15, fontFamily: DEFAULT_FONT, color: '#1f2937', linkColor: '#2563eb', lineHeight: 1.5, letterSpacing: 0, padding: uniformPadding(16), hideOn: 'none' }
    case 'heading':
      return { id: nextId(), type: 'heading', html: '<p><strong>Your Heading</strong></p>', align: 'left', fontSize: 26, fontFamily: DEFAULT_FONT, color: '#1f2937', linkColor: '#2563eb', lineHeight: 1.3, letterSpacing: 0, padding: uniformPadding(16), hideOn: 'none' }
    case 'image':
      return { id: nextId(), type: 'image', src: '', alt: '', width: 100, align: 'center', autoWidth: false, fullWidthOnMobile: false, padding: uniformPadding(16), hideOn: 'none' }
    case 'logo':
      return { id: nextId(), type: 'logo', src: '', alt: 'Logo', width: 30, align: 'center', autoWidth: false, fullWidthOnMobile: false, padding: uniformPadding(16), hideOn: 'none' }
    case 'video':
      return { id: nextId(), type: 'video', videoUrl: '', thumbnailSrc: '', width: 100, align: 'center', padding: uniformPadding(16), hideOn: 'none' }
    case 'html':
      return { id: nextId(), type: 'html', code: '<p>Custom HTML...</p>', padding: uniformPadding(16), hideOn: 'none' }
    case 'button':
      return { id: nextId(), type: 'button', label: 'Click Here', url: '', bgColor: '#bdac7e', textColor: '#ffffff', fontFamily: DEFAULT_FONT, align: 'center', borderRadius: 6, padding: uniformPadding(16), hideOn: 'none' }
    case 'divider':
      return { id: nextId(), type: 'divider', color: '#e5e7eb', thickness: 1, width: 100, align: 'center', padding: uniformPadding(16), hideOn: 'none' }
    case 'spacer':
      return { id: nextId(), type: 'spacer', height: 24, hideOn: 'none' }
    case 'columns':
      return { id: nextId(), type: 'columns', padding: uniformPadding(16), gap: 24, columns: [[], []], hideOn: 'none' }
    case 'section':
      return { id: nextId(), type: 'section', padding: uniformPadding(24), backgroundColor: '#f9fafb', backgroundImage: '', backgroundSize: 'cover', blocks: [], hideOn: 'none' }
    case 'social':
      return { id: nextId(), type: 'social', links: [{ platform: 'Instagram', url: 'https://instagram.com' }], align: 'center', padding: uniformPadding(16), hideOn: 'none' }
    case 'footer':
      return fixedFooterBlock()
  }
}

/** Deep-clones a block with fresh ids throughout (including nested column children) — needed for duplicate so nested blocks don't collide with their originals. */
export function cloneBlockWithNewIds(block: EmailBlock): EmailBlock {
  const id = nextId()
  if (block.type === 'columns') {
    return { ...block, id, columns: block.columns.map(list => list.map(cloneBlockWithNewIds)) }
  }
  if (block.type === 'section') {
    return { ...block, id, blocks: block.blocks.map(cloneBlockWithNewIds) }
  }
  return { ...block, id }
}

export const BLOCK_LABELS: Record<EmailBlock['type'], string> = {
  text: 'Text',
  heading: 'Heading',
  image: 'Image',
  logo: 'Logo',
  video: 'Video',
  button: 'Button',
  divider: 'Divider',
  spacer: 'Spacer',
  columns: 'Columns',
  section: 'Section',
  social: 'Social Links',
  html: 'Custom HTML',
  footer: 'Footer',
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function paddingCss(p: Padding): string {
  return `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`
}

function hideOnClass(hideOn: HideOn): string {
  return hideOn === 'desktop' ? 'hide-desktop' : hideOn === 'mobile' ? 'hide-mobile' : ''
}

function classAttr(...classes: (string | false | undefined)[]): string {
  const cls = classes.filter(Boolean).join(' ')
  return cls ? ` class="${cls}"` : ''
}

function renderColumnCell(list: EmailBlock[]): string {
  if (list.length === 0) return ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list.map(renderBlock).join('')}</table>`
}

function toBase64(str: string): string {
  // btoa is global in browsers (client canvas render) and Node 16+ (server send/preview render).
  if (typeof btoa === 'function') return btoa(str)
  return Buffer.from(str, 'utf-8').toString('base64')
}

// Feather-style line icons for the footer's social row, encoded as base64 PNG-less
// data-URI <img> (not raw inline <svg>) — Outlook doesn't support inline SVG at all,
// and several mobile mail clients silently strip <svg> too, which left the icon
// circles empty and — since the <a> then had no content and no explicit size —
// unclickable. A data-URI <img> renders reliably everywhere <img> works, which is
// effectively universal in HTML email.
type FooterIconKind = 'instagram' | 'whatsapp' | 'link'
function footerIcon(kind: FooterIconKind): string {
  const paths: Record<FooterIconKind, string> = {
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#ffffff" stroke="none"/>',
    whatsapp: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/>',
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[kind]}</svg>`
  return `<img src="data:image/svg+xml;base64,${toBase64(svg)}" width="16" height="16" alt="" style="display:inline-block;vertical-align:middle;border:0;outline:none;" />`
}

// Table-based sizing (HTML width/height attributes, not just CSS) — the
// bulletproof technique for fixed-size elements in email HTML. CSS-only
// sizing (e.g. display:inline-block + width on an <a>) is exactly the kind
// of thing Gmail/Outlook/Apple Mail can render inconsistently or ignore,
// which is how these icons ended up oversized in preview.
function renderFooterSocialRow(block: FooterBlock): string {
  const allLinks: { url: string; icon: FooterIconKind }[] = [
    { url: block.instagramUrl, icon: 'instagram' },
    { url: block.whatsappNumber ? `https://wa.me/${block.whatsappNumber.replace(/[^0-9]/g, '')}` : '', icon: 'whatsapp' },
    { url: block.websiteUrl, icon: 'link' },
  ]
  const links = allLinks.filter(l => l.url)
  if (!links.length) return ''
  const cell = (l: { url: string; icon: FooterIconKind }) => `
    <td style="padding:0 6px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
        <tr>
          <td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.35);font-size:0;line-height:0;">
            <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;text-decoration:none;">${footerIcon(l.icon)}</a>
          </td>
        </tr>
      </table>
    </td>`
  // `align` is the legacy HTML attribute Outlook's Word engine needs to
  // center a block-level <table>; `margin` is what actual browsers use.
  // text-align on the parent <td> only affects inline content, not this
  // table, so both have to be set explicitly here.
  const tableAlign = block.align === 'left' ? 'left' : block.align === 'right' ? 'right' : 'center'
  const marginCss = block.align === 'left' ? '0 0 14px 0' : block.align === 'right' ? '0 0 14px auto' : '0 auto 14px auto'
  return `<table role="presentation" align="${tableAlign}" cellpadding="0" cellspacing="0" style="margin:${marginCss};"><tr>${links.map(cell).join('')}</tr></table>`
}

function renderBlock(block: EmailBlock): string {
  switch (block.type) {
    case 'text':
      return `<tr><td${classAttr(`lc-${block.id}`, hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};text-align:${block.align};font-size:${block.fontSize}px;line-height:${block.lineHeight};letter-spacing:${block.letterSpacing}px;color:${block.color};font-family:${block.fontFamily};">${block.html}</td></tr>`

    case 'heading':
      return `<tr><td${classAttr(`lc-${block.id}`, hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};text-align:${block.align};font-size:${block.fontSize}px;line-height:${block.lineHeight};letter-spacing:${block.letterSpacing}px;color:${block.color};font-family:${block.fontFamily};font-weight:700;">${block.html}</td></tr>`

    case 'image':
    case 'logo': {
      const dims = block.autoWidth
        ? 'style="max-width:100%;height:auto;display:inline-block;border:0;"'
        : `width="${block.width}%" style="max-width:${block.width}%;width:${block.width}%;height:auto;display:inline-block;border:0;"`
      const fwmClass = !block.autoWidth && block.fullWidthOnMobile ? `fwm-${block.id}` : undefined
      const img = `<img src="${esc(block.src)}" alt="${esc(block.alt)}"${classAttr(fwmClass)} ${dims} />`
      const inner = block.link ? `<a href="${esc(block.link)}" target="_blank" rel="noopener noreferrer">${img}</a>` : img
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};text-align:${block.align};">${inner}</td></tr>`
    }

    case 'video': {
      const img = `<img src="${esc(block.thumbnailSrc)}" alt="Video thumbnail" width="${block.width}%" style="max-width:${block.width}%;width:${block.width}%;height:auto;display:inline-block;border:0;" />`
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};text-align:${block.align};">
        <a href="${esc(block.videoUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;">
          ${img}
          <div style="margin-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#374151;">&#9654; Watch video</div>
        </a>
      </td></tr>`
    }

    case 'html':
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};">${block.code}</td></tr>`

    case 'button':
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};text-align:${block.align};">
        <a href="${esc(block.url)}" target="_blank" rel="noopener noreferrer"${classAttr(`btn-${block.id}`)} style="display:inline-block;background:${block.bgColor};color:${block.textColor};text-decoration:none;font-family:${block.fontFamily};font-size:15px;font-weight:600;padding:12px 28px;border-radius:${block.borderRadius}px;">${esc(block.label)}</a>
      </td></tr>`

    case 'divider': {
      const margin = block.align === 'center' ? '0 auto' : block.align === 'right' ? '0 0 0 auto' : '0 auto 0 0'
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};"><div${classAttr(`div-${block.id}`)} style="border-top:${block.thickness}px solid ${block.color};line-height:0;font-size:0;width:${block.width}%;margin:${margin};">&nbsp;</div></td></tr>`
    }

    case 'spacer':
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="height:${block.height}px;line-height:${block.height}px;font-size:0;">&nbsp;</td></tr>`

    case 'columns': {
      const n = block.columns.length || 1
      const halfGap = (block.gap ?? 24) / 2
      const width = (100 / n).toFixed(4)
      const cells = block.columns.map((list, i) => {
        const padLeft = i === 0 ? 0 : halfGap
        const padRight = i === n - 1 ? 0 : halfGap
        return `<td width="${width}%" valign="top" style="padding-left:${padLeft}px;padding-right:${padRight}px;">${renderColumnCell(list)}</td>`
      }).join('')
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>
      </td></tr>`
    }

    case 'section': {
      const bg = block.backgroundImage
        ? `background-color:${block.backgroundColor};background-image:url('${esc(block.backgroundImage)}');background-repeat:${block.backgroundSize === 'repeat' ? 'repeat' : 'no-repeat'};background-position:center;background-size:${block.backgroundSize};`
        : `background-color:${block.backgroundColor};`
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"${classAttr(`sec-${block.id}`)} bgcolor="${block.backgroundColor}" style="${bg}"><tr>
          <td style="padding:${paddingCss(block.padding)};">${renderColumnCell(block.blocks)}</td>
        </tr></table>
      </td></tr>`
    }

    case 'social':
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};text-align:${block.align};">
        ${block.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#374151;text-decoration:underline;">${esc(l.platform)}</a>`).join('')}
      </td></tr>`

    case 'footer': {
      const sent = block.companyName && block.address
        ? `<div style="margin-bottom:12px;">Message sent by ${esc(block.companyName)} at ${esc(block.address)}.</div>`
        : ''
      const unsubscribe = block.showUnsubscribe
        ? `<div>Don't want to receive emails from us? Manage your email preferences <a href="${UNSUBSCRIBE_TOKEN}" style="color:#9ca3af;text-decoration:underline;">here</a>.</div>`
        : ''
      return `<tr><td class="footer-block" bgcolor="${block.backgroundColor || '#000000'}" style="padding:${block.padding}px;text-align:${block.align};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#9ca3af;background-color:${block.backgroundColor || '#000000'};">
        ${renderFooterSocialRow(block)}
        ${sent}
        ${unsubscribe}
      </td></tr>`
    }
  }
}

// Per-instance CSS (link color, full-width-on-mobile images) that can't be expressed
// as inline styles alone — collected once and emitted in the exported HTML's <head>.
function collectExtraStyles(blocks: EmailBlock[]): string[] {
  const rules: string[] = []
  for (const b of blocks) {
    if ((b.type === 'text' || b.type === 'heading') && b.linkColor) {
      rules.push(`.lc-${b.id} a{color:${b.linkColor} !important;}`)
    }
    if ((b.type === 'image' || b.type === 'logo') && !b.autoWidth && b.fullWidthOnMobile) {
      rules.push(`@media only screen and (max-width:600px){.fwm-${b.id}{width:100% !important;max-width:100% !important;}}`)
    }
    // Gmail/Apple Mail dark mode auto-inverts colors it thinks look wrong (e.g. white button
    // text flipping to black, or a light section background flipping dark) — pin every
    // authored color so dark mode can't touch any of them, matching the built template exactly.
    // Gmail's own auto-dark engine ignores prefers-color-scheme entirely and force-recolors
    // elements it decides are "unstyled," marking them with data-ogsc (text) / data-ogsb
    // (background) attributes as it does — targeting those attributes directly is the only
    // way to fight that override back, since it happens regardless of any @media support.
    if (b.type === 'button') {
      rules.push(`@media (prefers-color-scheme: dark){.btn-${b.id}{background:${b.bgColor} !important;color:${b.textColor} !important;}}`)
      rules.push(`[data-ogsc] .btn-${b.id},[data-ogsb] .btn-${b.id}{background:${b.bgColor} !important;color:${b.textColor} !important;}`)
    }
    if (b.type === 'text' || b.type === 'heading') {
      rules.push(`@media (prefers-color-scheme: dark){.lc-${b.id}{color:${b.color} !important;background-color:transparent !important;}}`)
      rules.push(`[data-ogsc] .lc-${b.id},[data-ogsb] .lc-${b.id}{color:${b.color} !important;background-color:transparent !important;}`)
    }
    if (b.type === 'divider') {
      rules.push(`@media (prefers-color-scheme: dark){.div-${b.id}{border-top-color:${b.color} !important;}}`)
      rules.push(`[data-ogsc] .div-${b.id},[data-ogsb] .div-${b.id}{border-top-color:${b.color} !important;}`)
    }
    if (b.type === 'footer') {
      rules.push(`@media (prefers-color-scheme: dark){.footer-block{background-color:${b.backgroundColor || '#000000'} !important;color:#9ca3af !important;}}`)
      rules.push(`[data-ogsc] .footer-block,[data-ogsb] .footer-block{background-color:${b.backgroundColor || '#000000'} !important;color:#9ca3af !important;}`)
    }
    if (b.type === 'section') {
      rules.push(`@media (prefers-color-scheme: dark){.sec-${b.id}{background-color:${b.backgroundColor} !important;}}`)
      rules.push(`[data-ogsc] .sec-${b.id},[data-ogsb] .sec-${b.id}{background-color:${b.backgroundColor} !important;}`)
      rules.push(...collectExtraStyles(b.blocks))
    }
    if (b.type === 'columns') rules.push(...collectExtraStyles(b.columns.flat()))
  }
  return rules
}

export function renderBlocksToHtml(blocks: EmailBlock[], settings?: Partial<EmailSettings>): string {
  const s = { ...DEFAULT_EMAIL_SETTINGS, ...settings }
  const rows = blocks.map(renderBlock).join('\n')
  const extraStyles = collectExtraStyles(blocks).join('\n')
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <style type="text/css">
      @media only screen and (max-width:600px){.hide-mobile{display:none !important;}}
      @media only screen and (min-width:601px){.hide-desktop{display:none !important;}}
      @media (prefers-color-scheme: dark){
        .email-page,.email-body{background:${s.pageBackground} !important;}
        .email-content{background:${s.contentBackground} !important;}
      }
      [data-ogsc] .email-page,[data-ogsb] .email-page,[data-ogsc] .email-body,[data-ogsb] .email-body{background:${s.pageBackground} !important;}
      [data-ogsc] .email-content,[data-ogsb] .email-content{background:${s.contentBackground} !important;}
      ${extraStyles}
    </style>
  </head>
  <body class="email-body" style="margin:0;padding:0;background:${s.pageBackground};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-page" bgcolor="${s.pageBackground}" style="background:${s.pageBackground};">
      <tr>
        <td align="center" style="padding:${s.contentPadding}px 12px;">
          <table role="presentation" width="${s.contentWidth}" cellpadding="0" cellspacing="0" class="email-content" bgcolor="${s.contentBackground}" style="max-width:${s.contentWidth}px;width:100%;background:${s.contentBackground};border-radius:8px;overflow:hidden;">
            ${rows}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/** Cheap string substitution done per-recipient at send time — avoids re-rendering the whole block tree for each email. */
export function injectUnsubscribeUrl(html: string, unsubscribeUrl: string): string {
  return html.split(UNSUBSCRIBE_TOKEN).join(unsubscribeUrl)
}

/**
 * Inserts a hidden preheader right after <body> so inbox clients show custom
 * preview text instead of grabbing the first visible line of the email.
 * Padded with zero-width joiners so trailing body text can't leak into the snippet.
 */
export function injectPreviewText(html: string, previewText: string): string {
  const text = previewText.trim()
  if (!text) return html
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const padding = '&nbsp;&zwnj;'.repeat(80)
  const preheader = `<div style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc}${padding}</div>`
  return /<body[^>]*>/i.test(html)
    ? html.replace(/(<body[^>]*>)/i, `$1${preheader}`)
    : preheader + html
}
