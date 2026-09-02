'use client'

// Shared visual language for the marketing module's dashboards — mirrors the polish of
// the proto-3 mockup (src/app/proto-3/App.jsx: StatCard, Sparkline, card-grid module
// cards) but keeps this app's own gold accent instead of the mockup's blue, so it stays
// consistent with the marketing pages already shipped (Campaigns, Templates, Media Kit).

export const ACCENT = '#bdac7e'

// Same rotating icon-square palette used by the Audiences/Automations card grids —
// centralized here so every marketing page cycles through identical colors.
export const CARD_THEMES = [
  { bg: '#eef2ff', fg: '#4f46e5' },
  { bg: '#ecfdf5', fg: '#059669' },
  { bg: '#fff7ed', fg: '#d97706' },
  { bg: '#faf5ff', fg: '#9333ea' },
]

export function PageHeader({ eyebrow, title, subtitle, action }: {
  eyebrow: string
  title: string
  subtitle: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <div className="text-[11px] font-bold tracking-wider" style={{ color: ACCENT }}>{eyebrow}</div>
        <h1 className="text-2xl font-bold tracking-tight mt-1">{title}</h1>
        <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
      </div>
      {action}
    </div>
  )
}

export function Sparkline({ data, color = ACCENT, height = 32 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = Math.max(1, max - min)
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100
    const y = height - 3 - ((v - min) / range) * (height - 8)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function KpiCard({ icon: Icon, label, value, sub, trend, trendColor }: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  trend?: number[]
  trendColor?: string
}) {
  return (
    <div className="border rounded-xl bg-white p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" style={{ color: ACCENT }} /> {label}
      </div>
      <p className="text-2xl font-bold tracking-tight mt-2">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      {trend && trend.length > 1 && (
        <div className="mt-2 -mb-1">
          <Sparkline data={trend} color={trendColor} />
        </div>
      )}
    </div>
  )
}

export function SectionCard({ title, subtitle, action, children }: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="border rounded-xl bg-white p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-sm">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function ModuleHero({ icon: Icon, title, description, badge }: {
  icon: React.ElementType
  title: string
  description: string
  badge?: string
}) {
  return (
    <div className="border rounded-xl bg-white p-5 flex items-center gap-4">
      <span className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: CARD_THEMES[0].bg, color: CARD_THEMES[0].fg }}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex-1 min-w-0">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {badge && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 shrink-0">{badge}</span>}
    </div>
  )
}
