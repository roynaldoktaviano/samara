'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDate } from '@/lib/format'
import { MATCH_CONFIDENCES, MATCH_CONFIDENCE_LABEL, isMatchConfidence } from '@/lib/wa-match-confidence'
import { AdConsentBadge } from '@/components/shared/AdConsentBadge'

// Everything the website / WhatsApp button told us about where one inquiry came from — shared
// by the Lead and Guest inquiry history. For a WhatsApp click match, sales can correct the
// confidence here (LOW is never uploaded to Google/Meta, see src/lib/ad-consent.ts).

export interface AttributionInquiry {
  id: string
  source: string
  createdAt: string
  utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null; utmTerm?: string | null; utmContent?: string | null
  gclid?: string | null; gbraid?: string | null; wbraid?: string | null; fbclid?: string | null; msclkid?: string | null
  lastSource?: string | null; lastMedium?: string | null; lastCampaign?: string | null; lastTerm?: string | null; lastContent?: string | null
  lastGclid?: string | null; lastGbraid?: string | null; lastWbraid?: string | null; lastFbclid?: string | null; lastMsclkid?: string | null
  fbc?: string | null; fbp?: string | null
  firstLandingUrl?: string | null; landingUrl?: string | null; firstReferrer?: string | null; referrer?: string | null
  ipAddress?: string | null; userAgent?: string | null; sessionAttributes?: string | null
  adConsent?: string | null; consentRegion?: string | null
  waRef?: string | null; matchConfidence?: string | null; matchConfidenceById?: string | null
}

/** Whether an inquiry has anything worth opening the dialog for. */
export function hasAttribution(i: AttributionInquiry): boolean {
  return !!(i.utmSource || i.utmMedium || i.utmCampaign || i.lastSource || i.gclid || i.gbraid || i.wbraid || i.fbclid || i.msclkid
    || i.lastGclid || i.lastMsclkid || i.fbc || i.fbp || i.firstLandingUrl || i.landingUrl || i.referrer || i.ipAddress || i.userAgent
    || i.sessionAttributes || i.waRef)
}

const CONFIDENCE_COLOR: Record<string, string> = {
  CONFIDENT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  LOW: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}

/** Small "WhatsApp click · Ref SL-XXXXX · Medium" chip for an inquiry card. */
export function WaMatchBadge({ inquiry }: { inquiry: AttributionInquiry }) {
  if (!inquiry.waRef && !inquiry.matchConfidence) return null
  const c = inquiry.matchConfidence
  return (
    <span
      title={c === 'LOW' ? 'Low-confidence match — never sent to Google/Meta until changed to Medium or Confident' : 'WhatsApp button click matched to this chat'}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${c ? CONFIDENCE_COLOR[c] ?? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground'}`}
    >
      WhatsApp click{inquiry.waRef ? ` · ${inquiry.waRef}` : ''}{c && isMatchConfidence(c) ? ` · ${MATCH_CONFIDENCE_LABEL[c]}` : ''}
    </span>
  )
}

type Row = readonly [string, string | null | undefined]

function Section({ title, note, rows }: { title: string; note?: string; rows: readonly Row[] }) {
  const filled = rows.filter(([, v]) => v)
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        {title}{note && <span className="font-normal normal-case"> — {note}</span>}
      </p>
      {filled.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No data</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {filled.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-3 px-3 py-1.5">
              <span className="text-xs text-muted-foreground shrink-0">{label}</span>
              <span className="text-xs font-mono text-right break-all">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function InquiryAttributionDialog({ inquiry, onClose, onUpdated }: {
  inquiry: AttributionInquiry | null
  onClose: () => void
  onUpdated?: (updated: AttributionInquiry) => void
}) {
  const [saving, setSaving] = useState(false)

  const changeConfidence = async (value: string) => {
    if (!inquiry || value === inquiry.matchConfidence) return
    setSaving(true)
    try {
      const res = await fetch(`/api/inquiries/${inquiry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchConfidence: value }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to update')
      onUpdated?.({ ...inquiry, matchConfidence: body.matchConfidence, matchConfidenceById: body.matchConfidenceById })
      toast.success('Click ID match updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!inquiry} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Attribution</DialogTitle>
          <DialogDescription>{inquiry && formatDate(inquiry.createdAt, 'datetime')}</DialogDescription>
        </DialogHeader>
        {inquiry && (
          <div className="space-y-4 text-sm">
            {(inquiry.waRef || inquiry.matchConfidence) && (
              <div className="rounded-lg border px-3 py-2 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">WhatsApp Click Match</p>
                {inquiry.waRef && <p className="text-xs">Ref <span className="font-mono">{inquiry.waRef}</span></p>}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">Click ID match</span>
                  <Select value={inquiry.matchConfidence ?? undefined} onValueChange={changeConfidence} disabled={saving}>
                    <SelectTrigger className="h-8 w-40"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {MATCH_CONFIDENCES.map(c => <SelectItem key={c} value={c}>{MATCH_CONFIDENCE_LABEL[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Confident = the chat carried this ref. Medium = the only button tap in the 30 min before the chat. Low = several taps in that window — never sent to Google/Meta until you raise it.
                  {inquiry.matchConfidenceById ? ' Set by hand.' : ''}
                </p>
              </div>
            )}
            {inquiry.adConsent && <AdConsentBadge consent={inquiry.adConsent} region={inquiry.consentRegion} />}
            <Section title="First Touch" note="visitor's very first session" rows={[
              ['Source', inquiry.utmSource], ['Medium', inquiry.utmMedium], ['Campaign', inquiry.utmCampaign],
              ['Term', inquiry.utmTerm], ['Content', inquiry.utmContent],
              ['Google Click ID', inquiry.gclid], ['Google Braid (app)', inquiry.gbraid], ['Google Braid (web)', inquiry.wbraid],
              ['Facebook Click ID', inquiry.fbclid], ['Microsoft Click ID', inquiry.msclkid],
              ['Landing page', inquiry.firstLandingUrl], ['Referrer', inquiry.firstReferrer],
            ]} />
            <Section title="Last Touch" note="this inquiry's own source" rows={[
              ['Source', inquiry.lastSource], ['Medium', inquiry.lastMedium], ['Campaign', inquiry.lastCampaign],
              ['Term', inquiry.lastTerm], ['Content', inquiry.lastContent],
              ['Google Click ID', inquiry.lastGclid], ['Google Braid (app)', inquiry.lastGbraid], ['Google Braid (web)', inquiry.lastWbraid],
              ['Facebook Click ID', inquiry.lastFbclid], ['Microsoft Click ID', inquiry.lastMsclkid],
              ['Landing page', inquiry.landingUrl], ['Referrer', inquiry.referrer],
            ]} />
            <Section title="Browser" note="stored for every lead; consent decides what is sent" rows={[
              ['Meta click (fbc)', inquiry.fbc], ['Meta browser (fbp)', inquiry.fbp],
              ['IP address', inquiry.ipAddress], ['User agent', inquiry.userAgent],
              ['Session attributes', inquiry.sessionAttributes],
            ]} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
