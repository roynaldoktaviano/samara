// Shared connected-dot timeline UI (green check / red X / hollow grey "not yet") used by
// both the PO detail page (src/components/purchasing/orders/OrdersPage.tsx) and the PR
// detail page (src/components/purchasing/requests/RequestsPage.tsx) so a request's
// journey and its resulting PO's journey read as one visual language.
export type TimelineStep = {
  key: string
  done: boolean
  label: string
  date: string | null
  sub: (string | null | undefined)[]
  photos?: string[]
  photoLabel?: string
  cancelled?: boolean
}

export function Timeline({
  steps, title = 'Order Timeline', sticky = false, onViewPhoto,
}: {
  steps: TimelineStep[]
  title?: string
  sticky?: boolean
  onViewPhoto?: (photoKey: string) => void
}) {
  return (
    <div className={`rounded-xl border bg-card p-4 ${sticky ? 'lg:sticky lg:top-4' : ''}`}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">{title}</p>
      <div>
        {steps.map((step, idx) => (
          <div key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${step.cancelled ? 'bg-red-500' : step.done ? 'bg-green-500' : 'border-2 border-muted bg-white'}`}>
                {step.cancelled
                  ? <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  : step.done
                    ? <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    : <div className="h-1.5 w-1.5 rounded-full bg-muted" />}
              </div>
              {idx < steps.length - 1 && (
                <div className="w-px flex-1 my-1.5 min-h-[16px] bg-border" />
              )}
            </div>
            <div className="pb-4 flex-1 min-w-0">
              <p className={`text-sm font-semibold leading-6 ${step.cancelled ? 'text-red-600' : !step.done ? 'text-muted-foreground/40' : ''}`}>{step.label}</p>
              {step.date && <p className="text-xs text-muted-foreground">{step.date}</p>}
              {step.sub.filter(Boolean).map((s, i) => (
                <p key={i} className="text-xs text-muted-foreground/70 truncate">{s}</p>
              ))}
              {onViewPhoto && step.photos && step.photos.length > 0 && (
                <div className="flex flex-wrap gap-x-2">
                  {step.photos.map((p, i) => (
                    <button key={i} onClick={() => onViewPhoto(p)} className="mt-1 text-xs text-green-600 hover:text-green-700 font-medium underline underline-offset-2">
                      {step.photos!.length > 1 ? `${step.photoLabel ?? 'View photo'} ${i + 1}` : (step.photoLabel ?? 'View photo')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
