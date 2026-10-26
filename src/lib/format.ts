/* ─── Shared formatters ───────────────────────────────────────────────────────
   One place for how money, numbers and dates look across the ERP. UI copy is
   English, so dates use en-GB ("24 Oct 2026"); Rupiah keeps Indonesian digit
   grouping ("Rp 1.250.000"), which is how staff read amounts everywhere else.
   Every formatter accepts null/undefined/invalid input and returns EMPTY. */

export const EMPTY = '—'

type NumInput = number | string | null | undefined
type DateInput = string | number | Date | null | undefined

function toNumber(n: NumInput): number | null {
  if (n === null || n === undefined || n === '') return null
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) ? v : null
}

// Newer ICU writes September as "Sept" in en-GB; keep every month at three letters.
const tidyMonths = (s: string) => s.replace(/\bSept\b/g, 'Sep')

function toDate(d: DateInput): Date | null {
  if (d === null || d === undefined || d === '') return null
  const v = d instanceof Date ? d : new Date(d)
  return Number.isNaN(v.getTime()) ? null : v
}

/* ── Numbers ── */

/** 1250000 → "1.250.000"; decimals are only shown when present (up to `decimals`). */
export function formatNumber(n: NumInput, opts: { decimals?: number; empty?: string } = {}): string {
  const v = toNumber(n)
  if (v === null) return opts.empty ?? EMPTY
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: opts.decimals ?? 0 }).format(v)
}

/** 1250000 → "1.3M", 850000 → "850K", 3400000000 → "3.4B". */
export function formatCompact(n: NumInput, opts: { empty?: string } = {}): string {
  const v = toNumber(n)
  if (v === null) return opts.empty ?? EMPTY
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = abs / size
      const text = scaled >= 100 ? Math.round(scaled).toString() : scaled.toFixed(1).replace(/\.0$/, '')
      return `${sign}${text}${suffix}`
    }
  }
  return `${sign}${Math.round(abs)}`
}

/** 0.125 → "12.5%" (pass `fraction: false` when the value is already a percentage). */
export function formatPercent(n: NumInput, opts: { decimals?: number; fraction?: boolean; empty?: string } = {}): string {
  const v = toNumber(n)
  if (v === null) return opts.empty ?? EMPTY
  const pct = opts.fraction === false ? v : v * 100
  return `${pct.toFixed(opts.decimals ?? 0).replace(/\.0+$/, '')}%`
}

/* ── Money ── */

type MoneyOptions = {
  /** ISO code; defaults to IDR. */
  currency?: string | null
  /** Fraction digits. Defaults: 0 for IDR, 2 for other currencies. */
  decimals?: number
  /** Prefix positive values with "+". */
  signed?: boolean
  empty?: string
}

/**
 * IDR → "Rp 1.250.000" / "-Rp 1.250.000"; other currencies → "$1,250.00", "€1,250.00", "AUD 1,250.00".
 * IDR is rounded to whole rupiah unless `decimals` is given.
 */
export function formatMoney(n: NumInput, opts: MoneyOptions = {}): string {
  const v = toNumber(n)
  if (v === null) return opts.empty ?? EMPTY
  const currency = (opts.currency || 'IDR').toUpperCase()
  const sign = v < 0 ? '-' : opts.signed && v > 0 ? '+' : ''
  const abs = Math.abs(v)
  if (currency === 'IDR') {
    const decimals = opts.decimals ?? 0
    const digits = new Intl.NumberFormat('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(abs)
    return `${sign}Rp ${digits}`
  }
  const decimals = opts.decimals ?? 2
  let text: string
  try {
    text = new Intl.NumberFormat('en-US', {
      style: 'currency', currency, currencyDisplay: 'symbol',
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(abs)
  } catch {
    text = `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(abs)}`
  }
  return sign + text
}

/** Compact money for KPI tiles and charts: "Rp 1.3M", "Rp 850K", "$12.5K". */
export function formatMoneyCompact(n: NumInput, opts: { currency?: string | null; empty?: string } = {}): string {
  const v = toNumber(n)
  if (v === null) return opts.empty ?? EMPTY
  const currency = (opts.currency || 'IDR').toUpperCase()
  const compact = formatCompact(Math.abs(v))
  const sign = v < 0 ? '-' : ''
  if (currency === 'IDR') return `${sign}Rp ${compact}`
  const symbol = new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'symbol' })
    .formatToParts(0).find(p => p.type === 'currency')?.value ?? `${currency} `
  return `${sign}${symbol}${compact}`
}

/* ── Dates ── */

export type DateStyle =
  | 'medium'         // 24 Oct 2026
  | 'short'          // 24 Oct
  | 'long'           // Sat, 24 Oct 2026
  | 'numeric'        // 24/10/2026
  | 'monthYear'      // Oct 2026
  | 'datetime'       // 24 Oct 2026, 10:06
  | 'datetimeShort'  // 24 Oct, 10:06
  | 'time'           // 10:06

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  medium:        { day: '2-digit', month: 'short', year: 'numeric' },
  short:         { day: '2-digit', month: 'short' },
  long:          { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' },
  numeric:       { day: '2-digit', month: '2-digit', year: 'numeric' },
  monthYear:     { month: 'short', year: 'numeric' },
  datetime:      { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
  datetimeShort: { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false },
  time:          { hour: '2-digit', minute: '2-digit', hour12: false },
}

type DateOptions = {
  /**
   * Format in UTC. Use for date-only values stored as midnight UTC (trip start/end dates,
   * due dates) so they don't shift a day in timezones west of UTC.
   */
  utc?: boolean
  empty?: string
}

/** Dates in one house style. Default 'medium' → "24 Oct 2026". */
export function formatDate(d: DateInput, style: DateStyle = 'medium', opts: DateOptions = {}): string {
  const v = toDate(d)
  if (!v) return opts.empty ?? EMPTY
  return tidyMonths(v.toLocaleString('en-GB', { ...DATE_OPTIONS[style], ...(opts.utc ? { timeZone: 'UTC' } : {}) }))
}

/** "24 – 27 Oct 2026", "30 Oct – 2 Nov 2026", "28 Dec 2026 – 3 Jan 2027". */
export function formatDateRange(start: DateInput, end: DateInput, opts: DateOptions = {}): string {
  const a = toDate(start), b = toDate(end)
  if (!a || !b) return a ? formatDate(a, 'medium', opts) : opts.empty ?? EMPTY
  const tz = opts.utc ? { timeZone: 'UTC' } : {}
  const part = (d: Date, o: Intl.DateTimeFormatOptions) => tidyMonths(d.toLocaleDateString('en-GB', { ...o, ...tz }))
  const sameYear = part(a, { year: 'numeric' }) === part(b, { year: 'numeric' })
  const sameMonth = sameYear && part(a, { month: 'numeric' }) === part(b, { month: 'numeric' })
  if (sameMonth) return `${part(a, { day: 'numeric' })} – ${part(b, { day: 'numeric', month: 'short', year: 'numeric' })}`
  if (sameYear) return `${part(a, { day: 'numeric', month: 'short' })} – ${part(b, { day: 'numeric', month: 'short', year: 'numeric' })}`
  return `${part(a, { day: 'numeric', month: 'short', year: 'numeric' })} – ${part(b, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the medium date. Future dates: "in 5 min". */
export function formatRelative(d: DateInput, opts: { now?: Date; empty?: string } = {}): string {
  const v = toDate(d)
  if (!v) return opts.empty ?? EMPTY
  const now = opts.now ?? new Date()
  const diff = now.getTime() - v.getTime()
  const future = diff < 0
  const min = Math.round(Math.abs(diff) / 60000)
  const wrap = (s: string) => (future ? `in ${s}` : `${s} ago`)
  if (min < 1) return 'just now'
  if (min < 60) return wrap(`${min} min`)
  const h = Math.round(min / 60)
  if (h < 24) return wrap(`${h} h`)
  const days = Math.round(h / 24)
  if (days === 1) return future ? 'tomorrow' : 'yesterday'
  if (days < 7) return wrap(`${days} days`)
  return formatDate(v)
}
