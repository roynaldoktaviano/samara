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
  align: BlockAlign
  showUnsubscribe: boolean
  padding: number // fixed/locked block, never exposed in the inspector — no need for per-side padding or hide-on
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

// Fixed footer — every design (except raw-HTML mode) gets exactly this footer,
// appended if missing. It's not user-editable: the builder UI never lets it be
// selected, dragged, or deleted, and normalizeDesign re-asserts its content on
// every load/save so it can't drift even via a direct API call.
export const FIXED_FOOTER_ADDRESS = 'Jalan Tukad Badung IXB No.9, Renon, Denpasar Selatan, Kota Denpasar, Bali 80234'

function fixedFooterBlock(): FooterBlock {
  return { id: nextId(), type: 'footer', companyName: '', address: FIXED_FOOTER_ADDRESS, align: 'center', showUnsubscribe: true, padding: 20, backgroundColor: '#000000' }
}

function withFixedFooter(blocks: EmailBlock[]): EmailBlock[] {
  // Raw-HTML authoring mode is a single freeform 'html' block — the fixed footer doesn't apply.
  if (blocks.length === 1 && blocks[0].type === 'html') return blocks
  return [...blocks.filter(b => b.type !== 'footer'), fixedFooterBlock()]
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
      return { ...raw, padding: typeof raw.padding === 'number' ? raw.padding : 20, backgroundColor: raw.backgroundColor || '#000000' }
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
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"${classAttr(`sec-${block.id}`)} style="${bg}"><tr>
          <td style="padding:${paddingCss(block.padding)};">${renderColumnCell(block.blocks)}</td>
        </tr></table>
      </td></tr>`
    }

    case 'social':
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};text-align:${block.align};">
        ${block.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#374151;text-decoration:underline;">${esc(l.platform)}</a>`).join('')}
      </td></tr>`

    case 'footer':
      return `<tr><td class="footer-block" style="padding:${block.padding}px;text-align:${block.align};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#9ca3af;background-color:${block.backgroundColor || '#000000'};">
        ${block.companyName ? `<div>${esc(block.companyName)}</div>` : ''}
        ${block.address ? `<div>${esc(block.address)}</div>` : ''}
        ${block.showUnsubscribe ? `<div style="margin-top:8px;"><a href="${UNSUBSCRIBE_TOKEN}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a></div>` : ''}
      </td></tr>`
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
    if (b.type === 'button') {
      rules.push(`@media (prefers-color-scheme: dark){.btn-${b.id}{background:${b.bgColor} !important;color:${b.textColor} !important;}}`)
    }
    if (b.type === 'text' || b.type === 'heading') {
      rules.push(`@media (prefers-color-scheme: dark){.lc-${b.id}{color:${b.color} !important;background-color:transparent !important;}}`)
    }
    if (b.type === 'divider') {
      rules.push(`@media (prefers-color-scheme: dark){.div-${b.id}{border-top-color:${b.color} !important;}}`)
    }
    if (b.type === 'footer') {
      rules.push(`@media (prefers-color-scheme: dark){.footer-block{background-color:${b.backgroundColor || '#000000'} !important;color:#9ca3af !important;}}`)
    }
    if (b.type === 'section') {
      rules.push(`@media (prefers-color-scheme: dark){.sec-${b.id}{background-color:${b.backgroundColor} !important;}}`)
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
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <style>
      @media only screen and (max-width:600px){.hide-mobile{display:none !important;}}
      @media only screen and (min-width:601px){.hide-desktop{display:none !important;}}
      @media (prefers-color-scheme: dark){
        .email-page,.email-body{background:${s.pageBackground} !important;}
        .email-content{background:${s.contentBackground} !important;}
      }
      ${extraStyles}
    </style>
  </head>
  <body class="email-body" style="margin:0;padding:0;background:${s.pageBackground};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-page" style="background:${s.pageBackground};">
      <tr>
        <td align="center" style="padding:${s.contentPadding}px 12px;">
          <table role="presentation" width="${s.contentWidth}" cellpadding="0" cellspacing="0" class="email-content" style="max-width:${s.contentWidth}px;width:100%;background:${s.contentBackground};border-radius:8px;overflow:hidden;">
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
