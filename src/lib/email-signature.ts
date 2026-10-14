// Chat › Email signature. Each user fills in their own values (Edit Profile menu →
// Email Signature); the layout is fixed here so every rep's signature looks the same.
// Shared by the server (appended to outgoing Chat › Email mail) and the editor's preview,
// so keep this file free of server-only imports.

export interface EmailSignature {
  enabled: boolean
  photoUrl: string
  name: string
  title: string
  location: string
  phone: string
  phoneLabel: string
  website: string
  bookingUrl: string
}

export const EMPTY_EMAIL_SIGNATURE: EmailSignature = {
  enabled: true,
  photoUrl: '',
  name: '',
  title: '',
  location: 'Indonesia',
  phone: '',
  phoneLabel: 'Indonesia',
  website: 'samaraLiveaboard.com',
  bookingUrl: '',
}

export const BOOKING_LINK_LABEL = 'Book a 30-minute video consultation'

const MAX_LEN = 300

/** Coerces whatever is stored in User.emailSignature (or sent by the editor) into a clean EmailSignature. */
export function normalizeEmailSignature(raw: unknown): EmailSignature | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const str = (k: keyof EmailSignature) => (typeof r[k] === 'string' ? (r[k] as string).trim().slice(0, MAX_LEN) : EMPTY_EMAIL_SIGNATURE[k] as string)
  return {
    enabled: r.enabled !== false,
    photoUrl: str('photoUrl'),
    name: str('name'),
    title: str('title'),
    location: str('location'),
    phone: str('phone'),
    phoneLabel: str('phoneLabel'),
    website: str('website'),
    bookingUrl: str('bookingUrl'),
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Only http(s) links are rendered — anything else is dropped rather than put in an href. */
function safeUrl(url: string): string | null {
  const u = /^https?:\/\//i.test(url) ? url : url ? `https://${url}` : ''
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
  } catch { return null }
}

export interface SignatureContext {
  /** The sender's login email — always the address shown, so it matches the From header. */
  email: string
  /** Brand from the shared From address, e.g. "Samara Yachting". */
  company: string | null
}

const NAME_COLOR = '#2c4f5e'
const TITLE_COLOR = '#b3955c'
const MUTED = '#8a8a8a'
const TEXT = '#222222'
const FONT = "font-family:Arial,Helvetica,sans-serif;"

/** Email-client-safe HTML (tables + inline styles). Empty string when there's nothing to show. */
export function renderEmailSignatureHtml(sig: EmailSignature | null, ctx: SignatureContext): string {
  if (!sig || !sig.enabled || !sig.name) return ''

  const subtitle = [
    sig.title ? `<span style="color:${TITLE_COLOR};font-weight:bold;">${esc(sig.title)}</span>` : '',
    ctx.company ? esc(ctx.company) : '',
    sig.location ? esc(sig.location) : '',
  ].filter(Boolean).join(' &bull; ')

  const row = (label: string, value: string) =>
    `<tr><td style="${FONT}font-size:13px;color:${MUTED};padding:2px 24px 2px 0;white-space:nowrap;">${label}</td>` +
    `<td style="${FONT}font-size:13px;color:${TEXT};padding:2px 0;">${value}</td></tr>`

  const rows: string[] = []
  if (ctx.email) rows.push(row('E-mail', `<a href="mailto:${esc(ctx.email)}" style="color:${TEXT};text-decoration:none;">${esc(ctx.email)}</a>`))
  if (sig.phone) {
    const tel = sig.phone.replace(/[^\d+]/g, '')
    const label = sig.phoneLabel ? ` <span style="color:${MUTED};">(${esc(sig.phoneLabel)})</span>` : ''
    rows.push(row('Direct', `<a href="tel:${esc(tel)}" style="color:${TEXT};text-decoration:none;">${esc(sig.phone)}</a>${label}`))
  }
  const web = safeUrl(sig.website)
  if (web) rows.push(row('Web', `<a href="${esc(web)}" style="color:${NAME_COLOR};text-decoration:none;">${esc(sig.website.replace(/^https?:\/\//i, '').replace(/\/$/, ''))}</a>`))

  const booking = safeUrl(sig.bookingUrl)
  const photo = safeUrl(sig.photoUrl)

  return (
    `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-collapse:collapse;"><tr>` +
    (photo
      ? `<td valign="top" style="padding:0 20px 0 0;"><img src="${esc(photo)}" width="96" height="96" alt="${esc(sig.name)}" style="display:block;width:96px;height:96px;border-radius:50%;object-fit:cover;border:0;"></td>`
      : '') +
    `<td valign="top">` +
    `<div style="${FONT}font-size:18px;font-weight:bold;color:${NAME_COLOR};line-height:1.3;">${esc(sig.name)}</div>` +
    (subtitle ? `<div style="${FONT}font-size:13px;color:${MUTED};line-height:1.5;margin-bottom:14px;">${subtitle}</div>` : '') +
    (rows.length ? `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows.join('')}</table>` : '') +
    (booking
      ? `<div style="${FONT}font-size:13px;margin-top:14px;"><a href="${esc(booking)}" style="color:${NAME_COLOR};font-weight:bold;text-decoration:underline;">${BOOKING_LINK_LABEL}</a></div>`
      : '') +
    `</td></tr></table>`
  )
}

/** Plain-text fallback for the text/plain part. */
export function renderEmailSignatureText(sig: EmailSignature | null, ctx: SignatureContext): string {
  if (!sig || !sig.enabled || !sig.name) return ''
  const lines = [
    '--',
    sig.name,
    [sig.title, ctx.company, sig.location].filter(Boolean).join(' • '),
    ctx.email ? `E-mail: ${ctx.email}` : '',
    sig.phone ? `Direct: ${sig.phone}${sig.phoneLabel ? ` (${sig.phoneLabel})` : ''}` : '',
    sig.website ? `Web: ${sig.website}` : '',
    safeUrl(sig.bookingUrl) ? `${BOOKING_LINK_LABEL}: ${safeUrl(sig.bookingUrl)}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}
