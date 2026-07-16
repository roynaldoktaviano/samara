// Block-based email design model + renderer shared between the drag & drop
// builder (client) and campaign send/preview (server) so what you see in the
// builder is exactly the HTML that gets sent.

export type BlockAlign = 'left' | 'center' | 'right'

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Palatino', value: 'Palatino, "Palatino Linotype", serif' },
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
  padding: number
}

export interface HeadingBlock {
  id: string
  type: 'heading'
  html: string
  align: BlockAlign
  fontSize: number
  fontFamily: string
  color: string
  padding: number
}

export interface ImageBlock {
  id: string
  type: 'image'
  src: string
  alt: string
  width: number // percent of content width, 10-100
  align: BlockAlign
  link?: string
  padding: number
}

export interface LogoBlock {
  id: string
  type: 'logo'
  src: string
  alt: string
  width: number
  align: BlockAlign
  link?: string
  padding: number
}

export interface VideoBlock {
  id: string
  type: 'video'
  videoUrl: string
  thumbnailSrc: string
  width: number
  align: BlockAlign
  padding: number
}

export interface HtmlBlock {
  id: string
  type: 'html'
  code: string
  padding: number
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
  padding: number
}

export interface DividerBlock {
  id: string
  type: 'divider'
  color: string
  thickness: number
  padding: number
}

export interface SpacerBlock {
  id: string
  type: 'spacer'
  height: number
}

// A column holds a nested list of content blocks — anything except another
// 'columns' or 'section' block (no nested containers, keeps the drag & drop tree 2 levels deep).
export interface ColumnsBlock {
  id: string
  type: 'columns'
  columns: EmailBlock[][] // 1-6 columns, evenly split
  padding: number
  gap: number // total horizontal space between columns, in px
}

export type SectionBackgroundSize = 'cover' | 'contain' | 'repeat'

// A full-width container with its own background (color and/or image) — holds
// a nested list of content blocks, same 2-level-tree restriction as columns.
export interface SectionBlock {
  id: string
  type: 'section'
  blocks: EmailBlock[]
  padding: number
  backgroundColor: string
  backgroundImage: string // '' = none
  backgroundSize: SectionBackgroundSize
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
  padding: number
}

export interface FooterBlock {
  id: string
  type: 'footer'
  companyName: string
  address: string
  align: BlockAlign
  showUnsubscribe: boolean
  padding: number
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

/** Normalizes stored design JSON — handles legacy rows saved before `settings` existed (bare block array). */
export function normalizeDesign(raw: unknown): EmailDesign {
  if (Array.isArray(raw)) return { blocks: raw as EmailBlock[], settings: { ...DEFAULT_EMAIL_SETTINGS } }
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).blocks)) {
    const r = raw as { blocks: EmailBlock[]; settings?: Partial<EmailSettings> }
    return { blocks: r.blocks, settings: { ...DEFAULT_EMAIL_SETTINGS, ...r.settings } }
  }
  return { blocks: [], settings: { ...DEFAULT_EMAIL_SETTINGS } }
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
      return { id: nextId(), type: 'text', html: '<p>Write something...</p>', align: 'left', fontSize: 15, fontFamily: DEFAULT_FONT, color: '#1f2937', padding: 16 }
    case 'heading':
      return { id: nextId(), type: 'heading', html: '<p><strong>Your Heading</strong></p>', align: 'left', fontSize: 26, fontFamily: DEFAULT_FONT, color: '#1f2937', padding: 16 }
    case 'image':
      return { id: nextId(), type: 'image', src: '', alt: '', width: 100, align: 'center', padding: 16 }
    case 'logo':
      return { id: nextId(), type: 'logo', src: '', alt: 'Logo', width: 30, align: 'center', padding: 16 }
    case 'video':
      return { id: nextId(), type: 'video', videoUrl: '', thumbnailSrc: '', width: 100, align: 'center', padding: 16 }
    case 'html':
      return { id: nextId(), type: 'html', code: '<p>Custom HTML...</p>', padding: 16 }
    case 'button':
      return { id: nextId(), type: 'button', label: 'Click Here', url: 'https://', bgColor: '#bdac7e', textColor: '#ffffff', fontFamily: DEFAULT_FONT, align: 'center', borderRadius: 6, padding: 16 }
    case 'divider':
      return { id: nextId(), type: 'divider', color: '#e5e7eb', thickness: 1, padding: 16 }
    case 'spacer':
      return { id: nextId(), type: 'spacer', height: 24 }
    case 'columns':
      return { id: nextId(), type: 'columns', padding: 16, gap: 24, columns: [[], []] }
    case 'section':
      return { id: nextId(), type: 'section', padding: 24, backgroundColor: '#f9fafb', backgroundImage: '', backgroundSize: 'cover', blocks: [] }
    case 'social':
      return { id: nextId(), type: 'social', links: [{ platform: 'Instagram', url: 'https://instagram.com' }], align: 'center', padding: 16 }
    case 'footer':
      return { id: nextId(), type: 'footer', companyName: '', address: '', align: 'center', showUnsubscribe: true, padding: 20 }
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

function renderColumnCell(list: EmailBlock[]): string {
  if (list.length === 0) return ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list.map(renderBlock).join('')}</table>`
}

function renderBlock(block: EmailBlock): string {
  switch (block.type) {
    case 'text':
      return `<tr><td style="padding:${block.padding}px;text-align:${block.align};font-size:${block.fontSize}px;line-height:1.5;color:${block.color};font-family:${block.fontFamily};">${block.html}</td></tr>`

    case 'heading':
      return `<tr><td style="padding:${block.padding}px;text-align:${block.align};font-size:${block.fontSize}px;line-height:1.3;color:${block.color};font-family:${block.fontFamily};font-weight:700;">${block.html}</td></tr>`

    case 'image':
    case 'logo': {
      const img = `<img src="${esc(block.src)}" alt="${esc(block.alt)}" width="${block.width}%" style="max-width:${block.width}%;width:${block.width}%;height:auto;display:inline-block;border:0;" />`
      const inner = block.link ? `<a href="${esc(block.link)}" target="_blank" rel="noopener noreferrer">${img}</a>` : img
      return `<tr><td style="padding:${block.padding}px;text-align:${block.align};">${inner}</td></tr>`
    }

    case 'video': {
      const img = `<img src="${esc(block.thumbnailSrc)}" alt="Video thumbnail" width="${block.width}%" style="max-width:${block.width}%;width:${block.width}%;height:auto;display:inline-block;border:0;" />`
      return `<tr><td style="padding:${block.padding}px;text-align:${block.align};">
        <a href="${esc(block.videoUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;">
          ${img}
          <div style="margin-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#374151;">&#9654; Watch video</div>
        </a>
      </td></tr>`
    }

    case 'html':
      return `<tr><td style="padding:${block.padding}px;">${block.code}</td></tr>`

    case 'button':
      return `<tr><td style="padding:${block.padding}px;text-align:${block.align};">
        <a href="${esc(block.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:${block.bgColor};color:${block.textColor};text-decoration:none;font-family:${block.fontFamily};font-size:15px;font-weight:600;padding:12px 28px;border-radius:${block.borderRadius}px;">${esc(block.label)}</a>
      </td></tr>`

    case 'divider':
      return `<tr><td style="padding:${block.padding}px;"><div style="border-top:${block.thickness}px solid ${block.color};line-height:0;font-size:0;">&nbsp;</div></td></tr>`

    case 'spacer':
      return `<tr><td style="height:${block.height}px;line-height:${block.height}px;font-size:0;">&nbsp;</td></tr>`

    case 'columns': {
      const n = block.columns.length || 1
      const halfGap = (block.gap ?? 24) / 2
      const width = (100 / n).toFixed(4)
      const cells = block.columns.map((list, i) => {
        const padLeft = i === 0 ? 0 : halfGap
        const padRight = i === n - 1 ? 0 : halfGap
        return `<td width="${width}%" valign="top" style="padding-left:${padLeft}px;padding-right:${padRight}px;">${renderColumnCell(list)}</td>`
      }).join('')
      return `<tr><td style="padding:${block.padding}px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>
      </td></tr>`
    }

    case 'section': {
      const bg = block.backgroundImage
        ? `background-color:${block.backgroundColor};background-image:url('${esc(block.backgroundImage)}');background-repeat:${block.backgroundSize === 'repeat' ? 'repeat' : 'no-repeat'};background-position:center;background-size:${block.backgroundSize};`
        : `background-color:${block.backgroundColor};`
      return `<tr><td style="padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${bg}"><tr>
          <td style="padding:${block.padding}px;">${renderColumnCell(block.blocks)}</td>
        </tr></table>
      </td></tr>`
    }

    case 'social':
      return `<tr><td style="padding:${block.padding}px;text-align:${block.align};">
        ${block.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#374151;text-decoration:underline;">${esc(l.platform)}</a>`).join('')}
      </td></tr>`

    case 'footer':
      return `<tr><td style="padding:${block.padding}px;text-align:${block.align};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#9ca3af;">
        ${block.companyName ? `<div>${esc(block.companyName)}</div>` : ''}
        ${block.address ? `<div>${esc(block.address)}</div>` : ''}
        ${block.showUnsubscribe ? `<div style="margin-top:8px;"><a href="${UNSUBSCRIBE_TOKEN}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a></div>` : ''}
      </td></tr>`
  }
}

export function renderBlocksToHtml(blocks: EmailBlock[], settings?: Partial<EmailSettings>): string {
  const s = { ...DEFAULT_EMAIL_SETTINGS, ...settings }
  const rows = blocks.map(renderBlock).join('\n')
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${s.pageBackground};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${s.pageBackground};">
      <tr>
        <td align="center" style="padding:${s.contentPadding}px 12px;">
          <table role="presentation" width="${s.contentWidth}" cellpadding="0" cellspacing="0" style="max-width:${s.contentWidth}px;width:100%;background:${s.contentBackground};border-radius:8px;overflow:hidden;">
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
