'use client'

import { isHttpUrl } from '@/lib/url-safety'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface JourneyPageView {
  id: string
  url: string
  referrer?: string | null
  title?: string | null
  occurredAt: string
}

interface JourneyStep {
  id: string
  url: string
  title: string
  fullTitle: string
  path: string
  referrer?: string | null
  firstAt: Date
  views: number
}

function fmtGap(ms: number) {
  const min = Math.round(ms / 60000)
  if (min < 1) return '<1 min later'
  if (min < 60) return `${min} min later`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ${min % 60 ? `${min % 60} min ` : ''}later`
  const d = Math.floor(h / 24)
  return `${d} day${d > 1 ? 's' : ''} later`
}

function pathOf(url: string) {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, ''))
  } catch {
    return url
  }
}

function hostOf(url?: string | null) {
  if (!url) return null
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return null }
}

// Page titles usually end with " | Samara Liveaboard" — show the page part, keep the full title as a tooltip.
const shortTitle = (title: string) => title.split(/\s+\|\s+(?=[^|]*$)/)[0] || title

/** Chronological steps, oldest first; consecutive views of the same URL collapse into one step. */
function buildSteps(views: JourneyPageView[]): JourneyStep[] {
  const sorted = [...views].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
  const steps: JourneyStep[] = []
  for (const pv of sorted) {
    const prev = steps[steps.length - 1]
    if (prev && prev.url === pv.url) { prev.views++; continue }
    const fullTitle = pv.title || pv.url
    steps.push({
      id: pv.id,
      url: pv.url,
      title: pv.title ? shortTitle(pv.title) : pathOf(pv.url),
      fullTitle,
      path: pathOf(pv.url),
      referrer: pv.referrer,
      firstAt: new Date(pv.occurredAt),
      views: 1,
    })
  }
  return steps
}

/** Vertical step timeline of the pages a lead/customer visited before enquiring. */
export function WebsiteJourney({ pageViews }: { pageViews: JourneyPageView[] | null }) {
  if (pageViews === null) return <p className="text-xs text-muted-foreground">Loading…</p>
  if (pageViews.length === 0) return <p className="text-xs text-muted-foreground">No page views recorded yet</p>

  const steps = buildSteps(pageViews)
  const entryHost = hostOf(steps[0]?.referrer)
  const siteHost = hostOf(steps[0]?.url)
  const externalEntry = entryHost && entryHost !== siteHost ? entryHost : null

  return (
    <div className="rounded-lg border bg-card p-2 max-h-96 overflow-y-auto">
      <ol className="relative">
        {steps.map((step, i) => {
          const isFirst = i === 0
          const isLast = i === steps.length - 1
          const gap = isFirst ? null : step.firstAt.getTime() - steps[i - 1].firstAt.getTime()
          return (
            <li key={step.id} className="relative grid grid-cols-[28px_1fr] gap-3">
              {/* connector to the next step */}
              {!isLast && (
                <span aria-hidden className="absolute left-[13px] top-[34px] -bottom-[6px] w-0.5 rounded-full bg-primary/50" />
              )}
              <span
                aria-hidden
                className={cn(
                  'relative z-[1] mt-2.5 flex h-7 w-7 items-center justify-center rounded-full border-2',
                  isLast
                    ? 'border-primary bg-card ring-4 ring-primary/15'
                    : 'border-primary bg-primary',
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', isLast ? 'bg-primary' : 'bg-card')} />
              </span>

              <div className="min-w-0 rounded-lg border border-transparent px-3 py-2 mb-1 transition-colors hover:border-border hover:bg-muted/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold leading-snug truncate" title={step.fullTitle}>
                        {isHttpUrl(step.url)
                          ? <a href={step.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{step.title}</a>
                          : step.title}
                      </span>
                      {isFirst && steps.length > 1 && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary-strong">Entry</span>
                      )}
                      {isLast && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary-strong">Latest</span>
                      )}
                      {step.views > 1 && (
                        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">Viewed {step.views}×</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{step.path}</p>
                    {isFirst && externalEntry && (
                      <p className="text-xs text-muted-foreground">Arrived from <span className="font-medium text-foreground/80">{externalEntry}</span></p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-muted-foreground tabular-nums">{formatDate(step.firstAt, 'datetimeShort')}</p>
                    {gap !== null && <p className="text-[11px] text-muted-foreground/70">{fmtGap(gap)}</p>}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
