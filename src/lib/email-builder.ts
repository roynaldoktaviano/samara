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

// Mobile-only overrides for a text/heading block's size, alignment, and color —
// applied via a max-width:600px media query in the exported HTML (see
// collectExtraStyles) on top of the block's own (desktop) values. Undefined
// fields simply inherit the desktop value; the whole object is optional so
// blocks with no mobile customization carry no extra data.
export interface TextMobileOverride {
  fontSize?: number
  align?: BlockAlign
  color?: string
}

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
  mobile?: TextMobileOverride
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
  mobile?: TextMobileOverride
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
  fillHeight: boolean // stretch + crop (object-fit:cover) to match the height of sibling blocks in the same column row — ignores width/autoWidth
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
  fillHeight: boolean
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

// See TextMobileOverride — same mobile-only-override mechanism, applied to a button's own fields.
export interface ButtonMobileOverride {
  fontSize?: number
  align?: BlockAlign
  bgColor?: string
  textColor?: string
}

export interface ButtonBlock {
  id: string
  type: 'button'
  label: string // simple inline HTML (bold/italic/underline/strike/sup/sub/<br>) — see migrateBlock's legacy plain-text upgrade
  url: string
  bgColor: string
  textColor: string
  fontSize: number
  fontFamily: string
  lineHeight: number
  align: BlockAlign
  borderRadius: number
  padding: Padding
  hideOn: HideOn
  mobile?: ButtonMobileOverride
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

// See TextMobileOverride — same mobile-only-override mechanism: the vertical space
// between stacked columns often needs to be smaller (or larger) than the horizontal
// gap used when they sit side by side on desktop.
export interface ColumnsMobileOverride {
  gap?: number
}

// A column holds a nested list of content blocks — anything except another
// 'columns' or 'section' block (no nested containers, keeps the drag & drop tree 2 levels deep).
export interface ColumnsBlock {
  id: string
  type: 'columns'
  columns: EmailBlock[][] // 1-6 columns, evenly split
  padding: Padding
  gap: number // total horizontal space between side-by-side columns, in px
  hideOn: HideOn
  stackOnMobile: boolean // below 600px, drop each column to full width, one per row
  mobile?: ColumnsMobileOverride // gap: vertical space between stacked columns, in px
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
  logoUrl: string // shown centered above the social icon row, blank = no logo
  facebookUrl: string
  instagramUrl: string
  whatsappNumber: string
  websiteUrl: string
  linkedinUrl: string
  align: BlockAlign
  showUnsubscribe: boolean
  lineHeight: number
  fontFamily: string
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
export const DEFAULT_FOOTER_LOGO_URL = 'https://samaraliveaboard.com/wp-content/uploads/2026/02/Element-4Logo-Smara-White-e1772086245612.png'

function fixedFooterBlock(): FooterBlock {
  return {
    id: nextId(), type: 'footer', align: 'center', showUnsubscribe: true, padding: 20, backgroundColor: '#000000', lineHeight: 1.6, fontFamily: DEFAULT_FONT,
    companyName: 'PT Samara Wisata Bahari',
    address: FIXED_FOOTER_ADDRESS,
    logoUrl: DEFAULT_FOOTER_LOGO_URL,
    facebookUrl: '',
    instagramUrl: '',
    whatsappNumber: '+62 859-5495-1085',
    websiteUrl: 'https://samaraliveaboard.com',
    linkedinUrl: '',
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
        fillHeight: typeof raw.fillHeight === 'boolean' ? raw.fillHeight : false,
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
      return {
        ...raw,
        padding: migratePadding(raw.padding, 16),
        hideOn,
        fontFamily: migrateFontFamily(raw.fontFamily) ?? raw.fontFamily,
        lineHeight: typeof raw.lineHeight === 'number' ? raw.lineHeight : 1.3,
        fontSize: typeof raw.fontSize === 'number' ? raw.fontSize : 15,
        // Labels used to be plain text (escaped + \n→<br> at render time, see
        // the old renderMultilineLabel) — now the rich-text label editor stores
        // real HTML directly, so legacy labels need that same escape done once,
        // up front. A label already containing '<' or '&' has necessarily been
        // through this (either migrated before, or typed via the contentEditable
        // editor, which always serializes typed '<'/'&' as entities) — never both.
        label: /[<&]/.test(raw.label) ? raw.label : esc(raw.label).replace(/\n/g, '<br>'),
      }
    case 'video':
    case 'html':
    case 'social':
      return { ...raw, padding: migratePadding(raw.padding, 16), hideOn }
    case 'spacer':
      return { ...raw, hideOn }
    case 'columns':
      return { ...raw, padding: migratePadding(raw.padding, 16), hideOn, columns: raw.columns.map(list => list.map(migrateBlock)), stackOnMobile: raw.stackOnMobile ?? true }
    case 'section':
      return { ...raw, padding: migratePadding(raw.padding, 24), hideOn, blocks: raw.blocks.map(migrateBlock) }
    case 'footer':
      return {
        ...raw,
        padding: typeof raw.padding === 'number' ? raw.padding : 20,
        backgroundColor: raw.backgroundColor || '#000000',
        lineHeight: typeof raw.lineHeight === 'number' ? raw.lineHeight : 1.6,
        fontFamily: migrateFontFamily(raw.fontFamily) ?? raw.fontFamily ?? DEFAULT_FONT,
        companyName: raw.companyName || 'PT Samara Wisata Bahari',
        address: raw.address || FIXED_FOOTER_ADDRESS,
        logoUrl: raw.logoUrl || DEFAULT_FOOTER_LOGO_URL,
        facebookUrl: raw.facebookUrl || '',
        instagramUrl: raw.instagramUrl || '',
        whatsappNumber: raw.whatsappNumber || '+62 859-5495-1085',
        websiteUrl: raw.websiteUrl || 'https://samaraliveaboard.com',
        linkedinUrl: raw.linkedinUrl || '',
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
      return { id: nextId(), type: 'image', src: '', alt: '', width: 100, align: 'center', autoWidth: false, fullWidthOnMobile: false, fillHeight: false, padding: uniformPadding(16), hideOn: 'none' }
    case 'logo':
      return { id: nextId(), type: 'logo', src: '', alt: 'Logo', width: 30, align: 'center', autoWidth: false, fullWidthOnMobile: false, fillHeight: false, padding: uniformPadding(16), hideOn: 'none' }
    case 'video':
      return { id: nextId(), type: 'video', videoUrl: '', thumbnailSrc: '', width: 100, align: 'center', padding: uniformPadding(16), hideOn: 'none' }
    case 'html':
      return { id: nextId(), type: 'html', code: '<p>Custom HTML...</p>', padding: uniformPadding(16), hideOn: 'none' }
    case 'button':
      return { id: nextId(), type: 'button', label: 'Click Here', url: '', bgColor: '#bdac7e', textColor: '#ffffff', fontSize: 15, fontFamily: DEFAULT_FONT, lineHeight: 1.3, align: 'center', borderRadius: 6, padding: uniformPadding(16), hideOn: 'none' }
    case 'divider':
      return { id: nextId(), type: 'divider', color: '#e5e7eb', thickness: 1, width: 100, align: 'center', padding: uniformPadding(16), hideOn: 'none' }
    case 'spacer':
      return { id: nextId(), type: 'spacer', height: 24, hideOn: 'none' }
    case 'columns':
      return { id: nextId(), type: 'columns', padding: uniformPadding(16), gap: 24, columns: [[], []], hideOn: 'none', stackOnMobile: true }
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

// Gmail's auto-dark-mode heuristic specifically targets pure black/white — it
// decides an element "needs fixing" for dark mode by detecting stark #000/#fff
// contrast pairs, then rewrites the color with an INLINE style. An inline style
// always wins the CSS cascade over any stylesheet rule (even !important + a
// data-ogsc attribute selector, which is why that alone didn't hold), so the only
// way to stop the rewrite is to never present the stark color it's looking for in
// the first place. Nudging by one RGB unit is visually identical but outside
// whatever threshold triggers the heuristic. Only ever applied to the rendered
// HTML's inline styles — the color picker and stored template data keep the exact
// value the user chose.
function darkModeSafe(hex: string): string {
  const h = hex.trim().toLowerCase()
  if (h === '#000' || h === '#000000') return '#010101'
  if (h === '#fff' || h === '#ffffff') return '#fefefe'
  return hex
}

function paddingCss(p: Padding): string {
  return `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`
}

// A link inserted into rich text (via RichTextField's createLink) is a bare
// <a href="..."> with no styling of its own — several mobile mail clients
// (iOS Mail and Outlook mobile chief among them) don't let an inline <a>
// inherit its parent <td>'s line-height/font-size the way a plain <span>
// does, and fall back to their own default instead, which shows up as an
// uneven gap wherever a link sits inside an otherwise normal paragraph.
// Stamping the same line-height/font-size/font-family directly onto every
// <a> closes that gap; .lc-${id} a in collectExtraStyles reinforces it
// (color included, since Outlook.com strips unrecognized inline props but
// keeps <style> rules) for the few clients that ignore the inline version.
function styleAnchors(html: string, style: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    if (/\sstyle\s*=/i.test(attrs)) {
      return `<a${attrs.replace(/style\s*=\s*(["'])(.*?)\1/i, (_m2, q: string, existing: string) => `style=${q}${existing};${style}${q}`)}>`
    }
    return `<a${attrs} style="${style}">`
  })
}

function hideOnClass(hideOn: HideOn): string {
  return hideOn === 'desktop' ? 'hide-desktop' : hideOn === 'mobile' ? 'hide-mobile' : ''
}

function classAttr(...classes: (string | false | undefined)[]): string {
  const cls = classes.filter(Boolean).join(' ')
  return cls ? ` class="${cls}"` : ''
}

// Gmail's auto-dark-mode (mainly its Android/iOS apps, which are the least consistent about
// honoring the color-scheme/supported-color-schemes opt-out meta tags) marks elements it has
// force-recolored with data-ogsc (text) / data-ogsb (background) attributes. Google has never
// documented exactly which element gets the marker — reports vary between the recolored element
// itself and a wrapping ancestor — so this covers both shapes rather than betting on one.
function darkOverride(selector: string, decls: string): string {
  return `[data-ogsc] ${selector},${selector}[data-ogsc],[data-ogsb] ${selector},${selector}[data-ogsb]{${decls}}`
}

function renderColumnCell(list: EmailBlock[], contentWidth: number): string {
  if (list.length === 0) return ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list.map(b => renderBlock(b, contentWidth)).join('')}</table>`
}

// A lone "fill column height" image is painted as the <td>'s own background
// rather than sized as a foreground <img> — two earlier approaches (percentage
// height, then position:absolute) both failed in real-world testing. Percentage
// heights only resolve against an ancestor with a *specified* height, and a
// table cell's height here is exactly the auto/content-driven kind — even
// though its *rendered* size is already fixed by the row. position:absolute
// sidesteps that rule on paper, but Gmail's CSS sanitizer drops `position`
// from inline styles entirely, silently undoing it. `background-image` +
// `background-size:cover` sidesteps both problems at once: a background always
// paints across the element's own real rendered box directly — no percentage
// resolution or positioning math involved — and both properties are on
// Gmail's supported CSS list. Outlook (Word engine) doesn't render
// background-image on a <td> at all without a VML fallback, and can't match
// an unknown sibling height either way, so it gets a separate plain <img> at
// natural size instead (see the `columns` case's mso branch) rather than a
// missing image.
function renderFillHeightCell(block: ImageBlock | LogoBlock, widthPct: string, padding: string, cls: string): string {
  const src = esc(block.src)
  const inner = block.link
    ? `<a href="${esc(block.link)}" target="_blank" rel="noopener noreferrer" style="display:block;">&nbsp;</a>`
    : '&nbsp;'
  return `<td width="${widthPct}%" valign="top" class="${cls}" background="${src}" style="${padding}background-image:url('${src}');background-size:cover;background-position:center;background-repeat:no-repeat;">${inner}</td>`
}

// Feather-style line icons for the footer's social row. Rendered as hosted PNG
// files (public/email/icon-*-mid.png), not inline <svg> or a data-URI <img> —
// Outlook doesn't support inline SVG at all, and most mail clients (Gmail
// included) block data:image/svg+xml URIs outright as an XSS precaution, which
// is why they were rendering as broken-image boxes. A plain hosted
// <img src="https://.../icon.png"> is the one technique that's reliably
// supported everywhere.
//
// A single neutral mid-gray (#9ca3af, matching the footer's body-text color)
// instead of white — the footer's near-black background still gets forcibly
// recolored to white by Gmail's iOS app despite the darkModeSafe nudge + pin
// (its heuristic isn't limited to literal #000000 the way the button/text
// fixes assumed), which made a white icon invisible whenever that happened. A
// raster <img>'s pixels can't be recolored by CSS, so an earlier version tried
// stacking two color variants and toggling visibility by media query — but
// that relies on Gmail cleanly hiding one of them, and when it doesn't both
// render at once, overlapping into a garbled/skewed-looking icon. One
// mid-tone image sidesteps that risk entirely: legible-enough on both a black
// and a white background, no toggle to fail.
type FooterIconKind = 'facebook' | 'instagram' | 'whatsapp' | 'link' | 'linkedin'
const FOOTER_ICON_LABEL: Record<FooterIconKind, string> = { facebook: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp', link: 'Website', linkedin: 'LinkedIn' }

function footerIcon(kind: FooterIconKind): string {
  // A relative src (what an unset/misconfigured NEXT_PUBLIC_APP_URL produces) has
  // no domain to resolve against inside an email and renders as a broken image —
  // fall back to the ERP's own live domain so this never silently breaks.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://erp.samarayachting.com'
  // ?v=N busts a stale CDN-cached response for these paths (Cloudflare had cached a
  // negative response for icon-instagram.png's 404 once, at v=2) — bump this if a
  // stale cached version (a 404, or literally the old icon artwork) ever gets stuck
  // on any of these paths again. Bumped to v=3 when the whatsapp/link artwork itself
  // was replaced (real WhatsApp mark + globe glyph), since the filename didn't change.
  // Bumped to v=4 when facebook/linkedin/whatsapp were recolored white, same reason.
  // Bumped to v=5 when instagram/link (globe) were recolored white to match them.
  // Bumped to v=6 when facebook/linkedin were replaced outright: the "v=4 recolor"
  // had actually swapped them for a filled white badge with the logo cut out in
  // solid black, not a real recolor — inconsistent with the plain white outline
  // (Lucide "feather-style") look every other icon here actually has. Redrawn from
  // the same Lucide facebook/linkedin glyphs, stroked in white, to match.
  // A non-empty alt matters here specifically: Outlook and most corporate mail
  // clients block remote images by default until the recipient explicitly loads
  // them, and a blank alt="" renders as a bare broken-image box with no label —
  // a real word at least tells the recipient what's missing until then.
  return `<img src="${appUrl}/email/icon-${kind}-mid.png?v=6" width="20" height="20" alt="${FOOTER_ICON_LABEL[kind]}" style="display:inline-block;vertical-align:middle;border:0;outline:none;" />`
}

// Table-based sizing (HTML width/height attributes, not just CSS) — the
// bulletproof technique for fixed-size elements in email HTML. CSS-only
// sizing (e.g. display:inline-block + width on an <a>) is exactly the kind
// of thing Gmail/Outlook/Apple Mail can render inconsistently or ignore,
// which is how these icons ended up oversized in preview.
// The field accepts either a raw phone number ("+62 859-...") or an
// already-formed WhatsApp link (e.g. https://api.whatsapp.com/send/?phone=...,
// pasted straight from WhatsApp's own "click to chat" tool) — treat anything
// that already looks like a URL as-is instead of mangling it by stripping
// digits out of the whole string.
function whatsappUrl(value: string): string {
  const v = value.trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://wa.me/${v.replace(/[^0-9]/g, '')}`
}

function renderFooterSocialRow(block: FooterBlock): string {
  const allLinks: { url: string; icon: FooterIconKind }[] = [
    { url: block.facebookUrl, icon: 'facebook' },
    { url: block.instagramUrl, icon: 'instagram' },
    { url: whatsappUrl(block.whatsappNumber), icon: 'whatsapp' },
    { url: block.linkedinUrl, icon: 'linkedin' },
    { url: block.websiteUrl, icon: 'link' },
  ]
  const links = allLinks.filter(l => l.url)
  if (!links.length) return ''
  const cell = (l: { url: string; icon: FooterIconKind }) => `
    <td style="padding:0 6px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
        <tr>
          <td width="40" height="40" align="center" valign="middle" class="footer-badge" style="width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.35);font-size:0;line-height:0;">
            <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;width:40px;height:40px;line-height:40px;text-align:center;text-decoration:none;">${footerIcon(l.icon)}</a>
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

// Classic Outlook desktop (Word rendering engine) is famously unreliable at honoring
// @media-based hide/show — even when the query itself matches, its `display:none`
// support doesn't inherit into a nested <table> (see the columns/section cases below),
// so a "hide on desktop" block can end up showing anyway, duplicating the "hide on
// mobile" counterpart right above it. Outlook desktop DOES reliably honor MSO
// conditional comments though (its HTML preprocessor strips them outright, before any
// CSS is even considered) — wrapping "hide on desktop" content in the standard
// `if !mso` idiom guarantees Outlook desktop never sees it at all, sidestepping the
// display:none quirk entirely rather than hoping the CSS fix below is enough. This
// only helps for hideOn:'desktop' (a mobile-only block) — there's no equivalent
// Outlook-desktop-specific trick for hideOn:'mobile' (a desktop-only block), but
// Outlook desktop is unambiguously a desktop context, so simply not hiding it there
// (i.e. doing nothing) already gives the right answer.
function renderBlock(block: EmailBlock, contentWidth: number): string {
  const html = renderBlockInner(block, contentWidth)
  return ('hideOn' in block && block.hideOn === 'desktop') ? `<!--[if !mso]><!-->${html}<!--<![endif]-->` : html
}

function renderBlockInner(block: EmailBlock, contentWidth: number): string {
  switch (block.type) {
    case 'text': {
      // Color lives on an inner <span>, not the <td> — Gmail's dark mode lightens
      // any sufficiently dark text color it finds on a <td>/<body>-level element,
      // regardless of exact value (unlike its background pass, which only targets
      // literal pure black/white and is already handled by darkModeSafe). Moving
      // the color one level down onto a plain <span> dodges that targeted pass,
      // the same trick that fixed the button's forced link-color override.
      const linkStyle = `line-height:${block.lineHeight};font-size:${block.fontSize}px;font-family:${block.fontFamily};color:${darkModeSafe(block.linkColor)};text-decoration:underline;`
      return `<tr><td${classAttr(`lc-${block.id}`, hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};text-align:${block.align};font-size:${block.fontSize}px;line-height:${block.lineHeight};letter-spacing:${block.letterSpacing}px;font-family:${block.fontFamily};"><span style="color:${darkModeSafe(block.color)};">${styleAnchors(block.html, linkStyle)}</span></td></tr>`
    }

    case 'heading': {
      const linkStyle = `line-height:${block.lineHeight};font-size:${block.fontSize}px;font-family:${block.fontFamily};color:${darkModeSafe(block.linkColor)};text-decoration:underline;`
      return `<tr><td${classAttr(`lc-${block.id}`, hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};text-align:${block.align};font-size:${block.fontSize}px;line-height:${block.lineHeight};letter-spacing:${block.letterSpacing}px;font-family:${block.fontFamily};font-weight:700;"><span style="color:${darkModeSafe(block.color)};">${styleAnchors(block.html, linkStyle)}</span></td></tr>`
    }

    case 'image':
    case 'logo': {
      // A bare CSS max-width with no HTML `width` attribute is exactly what leaves an
      // image at its full native pixel size in clients that scale images off the width
      // attribute rather than recomputing CSS layout (a common webmail image-rendering
      // shortcut) — a multi-megapixel upload then blows way past its column, dragging a
      // large empty gap in after it. The attribute is a hard cap sized to the column/
      // content width; the inline max-width:100% still lets capable clients shrink it
      // further if the real container ends up narrower still.
      // fillHeight is only actually achievable when this image is the sole block in
      // a column next to another column — the `columns` case below detects that and
      // renders it via renderFillHeightCell() instead of ever reaching this branch.
      // Anywhere else (no sibling column to match) there's nothing to fill against,
      // so it just falls back to ordinary sizing.
      const autoWidthPx = Math.max(1, Math.round(contentWidth - block.padding.left - block.padding.right))
      const dims = block.autoWidth
        ? `width="${autoWidthPx}" style="max-width:100%;height:auto;display:inline-block;border:0;"`
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
      // The text color lives on an inner <span>, not the <a> itself — Gmail's dark
      // mode runs a separate forced-recolor pass specifically for <a> link color
      // that ignores the darkModeSafe nudge, but leaves a child span's color alone.
      return `<tr><td${classAttr(`btn-wrap-${block.id}`, hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};text-align:${block.align};">
        <a href="${esc(block.url)}" target="_blank" rel="noopener noreferrer"${classAttr(`btn-${block.id}`)} style="color:${darkModeSafe(block.textColor)};display:inline-block;background:${darkModeSafe(block.bgColor)};text-decoration:none;font-family:${block.fontFamily};font-size:${block.fontSize}px;font-weight:600;line-height:${block.lineHeight};padding:12px 28px;border-radius:${block.borderRadius}px;"><span style="color:${darkModeSafe(block.textColor)};">${block.label}</span></a>
      </td></tr>`

    case 'divider': {
      const margin = block.align === 'center' ? '0 auto' : block.align === 'right' ? '0 0 0 auto' : '0 auto 0 0'
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};"><div${classAttr(`div-${block.id}`)} style="border-top:${block.thickness}px solid ${darkModeSafe(block.color)};line-height:0;font-size:0;width:${block.width}%;margin:${margin};">&nbsp;</div></td></tr>`
    }

    case 'spacer':
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="height:${block.height}px;line-height:${block.height}px;font-size:0;">&nbsp;</td></tr>`

    case 'columns': {
      const n = block.columns.length || 1
      const gap = block.gap ?? 24
      const halfGap = gap / 2
      const width = (100 / n).toFixed(4)
      const innerWidth = contentWidth - block.padding.left - block.padding.right
      const colMaxPx = Math.max(40, Math.floor((innerWidth - (n - 1) * gap) / n))
      const soleFillImageOf = (list: EmailBlock[]) =>
        list.length === 1 && (list[0].type === 'image' || list[0].type === 'logo') && list[0].fillHeight ? (list[0] as ImageBlock | LogoBlock) : null
      const hasFillImage = block.columns.some(list => soleFillImageOf(list) !== null)

      if (hasFillImage) {
        // A fill-height image needs a real table row — cells in the same <tr> are
        // always equal height, no CSS required for that part at all. The "fluid
        // hybrid" mobile-stacking markup used below for ordinary columns instead
        // renders each column as an independent `display:inline-block` div, which
        // has no equal-height guarantee between siblings (no flexbox/grid to lean
        // on either, since avoiding those is the whole reason that markup exists),
        // so it's skipped entirely here. Stacking on narrow screens instead comes
        // from a @media override in collectExtraStyles that turns these same cells
        // into full-width blocks — a pure enhancement on top of the always-side-by-
        // side base, same idea as the fluid columns' own @media relaxation below: a
        // client that ignores it just stays side-by-side instead of failing to stack.
        const cellsFor = (mso: boolean) => block.columns.map((list, i) => {
          const padLeft = i === 0 ? 0 : halfGap
          const padRight = i === n - 1 ? 0 : halfGap
          const cls = `col-${block.id}-${i}`
          const fillImage = soleFillImageOf(list)
          if (fillImage) {
            const p = fillImage.padding
            const padding = `padding:${p.top}px ${padRight + p.right}px ${p.bottom}px ${padLeft + p.left}px;`
            if (mso) {
              // Outlook (Word engine) doesn't render background-image on a <td>
              // without a VML fallback, and can't match an unknown sibling height
              // either way — natural size is a better fallback than a blank cell.
              const autoWidthPx = Math.max(1, Math.round(colMaxPx - p.left - p.right))
              const img = `<img src="${esc(fillImage.src)}" alt="${esc(fillImage.alt)}" width="${autoWidthPx}" style="max-width:100%;height:auto;display:block;border:0;" />`
              const inner = fillImage.link ? `<a href="${esc(fillImage.link)}" target="_blank" rel="noopener noreferrer">${img}</a>` : img
              return `<td width="${width}%" valign="top" class="${cls}" style="${padding}">${inner}</td>`
            }
            return renderFillHeightCell(fillImage, width, padding, cls)
          }
          return `<td width="${width}%" valign="top" class="${cls}" style="padding-left:${padLeft}px;padding-right:${padRight}px;">${renderColumnCell(list, colMaxPx)}</td>`
        }).join('')
        const msoTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cellsFor(true)}</tr></table>`
        const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cellsFor(false)}</tr></table>`
        return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};">
          <!--[if mso]>${msoTable}<![endif]-->
          <!--[if !mso]><!-->${table}<!--<![endif]-->
        </td></tr>`
      }

      const tdCells = block.columns.map((list, i) => {
        const padLeft = i === 0 ? 0 : halfGap
        const padRight = i === n - 1 ? 0 : halfGap
        return `<td width="${width}%" valign="top" style="padding-left:${padLeft}px;padding-right:${padRight}px;">${renderColumnCell(list, colMaxPx)}</td>`
      }).join('')
      const tdTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${tdCells}</tr></table>`
      if (!block.stackOnMobile) {
        // Fixed percentage-width <td> cells never reflow on their own — identical
        // markup for every client (Outlook included), so there's nothing conditional
        // to branch on when the design intentionally keeps columns side by side.
        return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};">${tdTable}</td></tr>`
      }
      // "Fluid hybrid" columns: each column is a `display:inline-block` div capped
      // at its desktop pixel width (max-width) but fluid down to `width:100%` of
      // whatever room is left. Side by side, the columns' natural inline-level
      // wrapping keeps them on one line as long as they all fit; once the
      // container gets too narrow for all of them (a phone screen) the same CSS
      // wrapping drops the extras to their own line — one column per row, same as
      // ordinary text wrapping. This needs no @media query to do that, so unlike
      // an approach gated behind one, it stacks correctly even in clients that
      // strip <style>/@media entirely (Gmail's Android app has historically been
      // one) instead of leaving them stuck side-by-side on a phone. `font-size:0`
      // on the wrapper kills the whitespace gap browsers render between adjacent
      // inline-block elements (the whitespace/newlines between the divs in this
      // template); each column div sets its own font-size back so that gap doesn't
      // shrink its actual content. Outlook desktop (Word engine) doesn't wrap inline-block at all —
      // it gets the plain `<table><td>` version instead, via the same
      // MSO-conditional-comment idiom `renderBlock` uses for hideOn:'desktop' above.
      const mobileGap = block.mobile?.gap ?? gap
      const fluidCells = block.columns.map((list, i) => {
        const padLeft = i === 0 ? 0 : halfGap
        const padRight = i === n - 1 ? 0 : halfGap
        const padBottom = i === n - 1 ? 0 : mobileGap
        // The max-width cap (needed so columns wrap instead of just shrinking) sticks
        // around after a column has actually wrapped to its own row, leaving it stuck
        // at its desktop half-width instead of filling the row — collectExtraStyles
        // adds a `@media max-width:600px` rule keyed on this class that relaxes the
        // cap to 100% there. That's a pure enhancement on top of the wrap itself
        // (which needs no media-query support to work at all): a client that ignores
        // it still wraps correctly, just stays capped at its desktop width instead of
        // filling the row — text-align:center below at least keeps that centered
        // instead of flush against the left edge.
        return `<div class="col-${block.id}-${i}" style="display:inline-block;vertical-align:top;width:100%;max-width:${colMaxPx}px;box-sizing:border-box;padding:0 ${padRight}px ${padBottom}px ${padLeft}px;font-size:14px;">${renderColumnCell(list, colMaxPx)}</div>`
      }).join('')
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};">
        <!--[if mso]>${tdTable}<![endif]-->
        <!--[if !mso]><!--><div style="font-size:0;line-height:0;text-align:center;">${fluidCells}</div><!--<![endif]-->
      </td></tr>`
    }

    case 'section': {
      const sectionBg = darkModeSafe(block.backgroundColor)
      const bg = block.backgroundImage
        ? `background-color:${sectionBg};background-image:url('${esc(block.backgroundImage)}');background-repeat:${block.backgroundSize === 'repeat' ? 'repeat' : 'no-repeat'};background-position:center;background-size:${block.backgroundSize};`
        : `background-color:${sectionBg};`
      // Same nested-<table> hide-class duplication as columns above.
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"${classAttr(`sec-${block.id}`, hideOnClass(block.hideOn))} bgcolor="${sectionBg}" style="${bg}"><tr>
          <td style="padding:${paddingCss(block.padding)};">${renderColumnCell(block.blocks, contentWidth - block.padding.left - block.padding.right)}</td>
        </tr></table>
      </td></tr>`
    }

    case 'social':
      return `<tr><td${classAttr(hideOnClass(block.hideOn))} style="padding:${paddingCss(block.padding)};text-align:${block.align};">
        ${block.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#374151;text-decoration:underline;">${esc(l.platform)}</a>`).join('')}
      </td></tr>`

    case 'footer': {
      // Color lives on inner <span>s, not the <td> — same reason as text/heading/button above.
      const footerBg = darkModeSafe(block.backgroundColor || '#000000')
      const logo = block.logoUrl
        ? `<div style="margin-bottom:16px;"><img src="${esc(block.logoUrl)}" alt="${esc(block.companyName || 'Logo')}" width="120" style="max-width:120px;width:120px;height:auto;display:inline-block;border:0;" /></div>`
        : ''
      const sent = block.companyName && block.address
        ? `<div style="margin-bottom:12px;"><span style="color:#9ca3af;">Message sent by ${esc(block.companyName)} at ${esc(block.address)}.</span></div>`
        : ''
      const unsubscribe = block.showUnsubscribe
        ? `<div><span style="color:#9ca3af;">Don't want to receive emails from us? Manage your email preferences </span><a href="${UNSUBSCRIBE_TOKEN}" style="text-decoration:underline;"><span style="color:#9ca3af;">here</span></a><span style="color:#9ca3af;">.</span></div>`
        : ''
      return `<tr><td class="footer-block" bgcolor="${footerBg}" style="padding:${block.padding}px;text-align:${block.align};font-family:${block.fontFamily};font-size:12px;line-height:${block.lineHeight};background-color:${footerBg};">
        ${logo}
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
    if (b.type === 'text' || b.type === 'heading') {
      // Reinforces the inline styleAnchors() stamp above (see its comment) for
      // clients that strip inline styles on <a> but keep a <style> block.
      rules.push(`.lc-${b.id} a{${b.linkColor ? `color:${b.linkColor} !important;` : ''}line-height:${b.lineHeight} !important;font-size:${b.fontSize}px !important;}`)
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
      const bg = darkModeSafe(b.bgColor)
      const fg = darkModeSafe(b.textColor)
      rules.push(`@media (prefers-color-scheme: dark){.btn-${b.id}{background:${bg} !important;}.btn-${b.id} span{color:${fg} !important;}}`)
      rules.push(darkOverride(`.btn-${b.id}`, `background:${bg} !important;`))
      rules.push(darkOverride(`.btn-${b.id} span`, `color:${fg} !important;`))
      if (b.mobile) {
        const btnDecls = [
          b.mobile.fontSize ? `font-size:${b.mobile.fontSize}px !important;` : '',
          b.mobile.bgColor ? `background:${darkModeSafe(b.mobile.bgColor)} !important;` : '',
        ].join('')
        const wrapDecl = b.mobile.align ? `.btn-wrap-${b.id}{text-align:${b.mobile.align} !important;}` : ''
        const spanDecl = b.mobile.textColor ? `.btn-${b.id} span{color:${darkModeSafe(b.mobile.textColor)} !important;}` : ''
        if (btnDecls || wrapDecl || spanDecl) rules.push(`@media only screen and (max-width:600px){${btnDecls ? `.btn-${b.id}{${btnDecls}}` : ''}${wrapDecl}${spanDecl}}`)
      }
    }
    if (b.type === 'text' || b.type === 'heading') {
      const fg = darkModeSafe(b.color)
      rules.push(`@media (prefers-color-scheme: dark){.lc-${b.id}{background-color:transparent !important;}.lc-${b.id} span{color:${fg} !important;}}`)
      rules.push(darkOverride(`.lc-${b.id}`, `background-color:transparent !important;`))
      rules.push(darkOverride(`.lc-${b.id} span`, `color:${fg} !important;`))
      if (b.mobile) {
        const decls = [
          b.mobile.fontSize ? `font-size:${b.mobile.fontSize}px !important;` : '',
          b.mobile.align ? `text-align:${b.mobile.align} !important;` : '',
        ].join('')
        const spanDecl = b.mobile.color ? `.lc-${b.id} span{color:${darkModeSafe(b.mobile.color)} !important;}` : ''
        if (decls || spanDecl) rules.push(`@media only screen and (max-width:600px){${decls ? `.lc-${b.id}{${decls}}` : ''}${spanDecl}}`)
      }
    }
    if (b.type === 'divider') {
      const c = darkModeSafe(b.color)
      rules.push(`@media (prefers-color-scheme: dark){.div-${b.id}{border-top-color:${c} !important;}}`)
      rules.push(darkOverride(`.div-${b.id}`, `border-top-color:${c} !important;`))
    }
    if (b.type === 'footer') {
      const bg = darkModeSafe(b.backgroundColor || '#000000')
      // Text and icons switch to dark-readable colors under dark mode instead of
      // just re-pinning the original light ones — see the comment on footerIcon:
      // Gmail's iOS app still forces this near-black background to white despite
      // the pin below, so the light-on-dark pairing needs to become dark-on-light
      // to stay legible when that happens. Compliant clients that actually honor
      // the light-only color-scheme meta tag never evaluate this rule at all
      // (their footer never leaves the authored black/light-gray look), so this
      // doesn't risk dark-on-dark anywhere the background pin actually holds.
      const darkText = '#374151'
      rules.push(`@media (prefers-color-scheme: dark){.footer-block{background-color:${bg} !important;}.footer-block span{color:${darkText} !important;}.footer-badge{border-color:rgba(55,65,81,.35) !important;}}`)
      rules.push(darkOverride('.footer-block', `background-color:${bg} !important;`))
      rules.push(darkOverride('.footer-block span', `color:${darkText} !important;`))
      rules.push(darkOverride('.footer-badge', 'border-color:rgba(55,65,81,.35) !important;'))
    }
    if (b.type === 'section') {
      const bg = darkModeSafe(b.backgroundColor)
      rules.push(`@media (prefers-color-scheme: dark){.sec-${b.id}{background-color:${bg} !important;}}`)
      rules.push(darkOverride(`.sec-${b.id}`, `background-color:${bg} !important;`))
      rules.push(...collectExtraStyles(b.blocks))
    }
    if (b.type === 'columns') {
      if (b.stackOnMobile) {
        // A column holding a fill-height image is rendered as a real <td> (see the
        // `columns` case), not the `display:inline-block` div the other branch
        // relaxes here — it needs `display:block` to actually stack instead of
        // just widening while stuck in its table cell.
        const fillImageIndex = b.columns.findIndex(list => list.length === 1 && (list[0].type === 'image' || list[0].type === 'logo') && list[0].fillHeight)
        const hasFillImage = fillImageIndex !== -1
        const decls = b.columns.map((_, i) => {
          if (!hasFillImage) return `.col-${b.id}-${i}{max-width:100% !important;}`
          if (i !== fillImageIndex) return `.col-${b.id}-${i}{display:block !important;width:100% !important;}`
          // Stacking also strips away the equal-height table row this column's
          // background-image relied on for its height (see renderFillHeightCell),
          // leaving it ~0px tall — just whatever padding it was given. A width-based
          // aspect-ratio box (padding-top:%, height:0) gives it a real height again
          // on its own terms: percentage padding reliably resolves against width
          // alone in every client, unlike percentage height. font-size/line-height:0
          // keep the cell's own "&nbsp;" content from adding any stray height on top.
          return `.col-${b.id}-${i}{display:block !important;width:100% !important;height:0 !important;padding-top:56.25% !important;padding-bottom:0 !important;overflow:hidden !important;font-size:0 !important;line-height:0 !important;}`
        }).join('')
        rules.push(`@media only screen and (max-width:600px){${decls}}`)
      }
      rules.push(...collectExtraStyles(b.columns.flat()))
    }
  }
  return rules
}

export function renderBlocksToHtml(blocks: EmailBlock[], settings?: Partial<EmailSettings>): string {
  const s = { ...DEFAULT_EMAIL_SETTINGS, ...settings }
  const pageBg = darkModeSafe(s.pageBackground)
  const contentBg = darkModeSafe(s.contentBackground)
  const rows = blocks.map(b => renderBlock(b, s.contentWidth)).join('\n')
  const extraStyles = collectExtraStyles(blocks).join('\n')
  // Every @media rule (mobile hide/show, columns stacking, dark mode) lives in this
  // one block, repeated verbatim right after <body> opens. Gmail's iOS/Android apps
  // are the reason: they strip <style> out of <head> entirely (any @media there is
  // silently dropped) but do honor a <style> tag placed in the body — this is the
  // standard, widely-documented workaround, not decoration. Other clients just
  // parse the same rules twice, which is harmless.
  // Mirrors the `.email-rich-text` reset in globals.css (used by the builder's own
  // RichTextField) so a <p>/<ul>/<blockquote> from rich-text content looks the same
  // here as it did while editing — the exported HTML has no Tailwind Preflight to
  // undo, so left alone these tags would fall back to the browser's own default
  // margins/bullets (typically top+bottom on every <p>, not just a bottom gap
  // between paragraphs), reading as noticeably more padding than what was set.
  const styleBlock = `
      p{margin:0 0 1em;}
      p:last-child{margin-bottom:0;}
      ul,ol{margin:0 0 1em;padding-left:1.5em;}
      ul:last-child,ol:last-child{margin-bottom:0;}
      ul{list-style:disc;}
      ol{list-style:decimal;}
      li{display:list-item;}
      blockquote{margin:0 0 1em;padding-left:1em;border-left:3px solid currentColor;opacity:.85;}
      @media only screen and (max-width:600px){.hide-mobile{display:none !important;}}
      @media only screen and (min-width:601px){.hide-desktop{display:none !important;}}
      @media (prefers-color-scheme: dark){
        .email-page,.email-body{background:${pageBg} !important;}
        .email-content{background:${contentBg} !important;}
      }
      ${darkOverride('.email-page', `background:${pageBg} !important;`)}
      ${darkOverride('.email-body', `background:${pageBg} !important;`)}
      ${darkOverride('.email-content', `background:${contentBg} !important;`)}
      ${extraStyles}`
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <style type="text/css">${styleBlock}
    </style>
  </head>
  <body class="email-body" style="margin:0;padding:0;background:${pageBg};">
    <style type="text/css">${styleBlock}
    </style>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-page" bgcolor="${pageBg}" style="background:${pageBg};">
      <tr>
        <td align="center" style="padding:${s.contentPadding}px 12px;">
          <table role="presentation" width="${s.contentWidth}" cellpadding="0" cellspacing="0" class="email-content" bgcolor="${contentBg}" style="max-width:${s.contentWidth}px;width:100%;background:${contentBg};border-radius:8px;overflow:hidden;">
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
