'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Download, CheckCircle2, AlertTriangle } from 'lucide-react'

interface Result { totalFetched: number; created: number; updated: number; merged: number; target: 'lead' | 'guest' }
interface RowData {
  name: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null
  nationality: string | null; address: string | null
}
// Opaque to the client — just carried from the batched import response
// through to /resolve so the review step can create the Inquiry row too.
interface InquiryPayload {
  checkInDate: string | null; checkOutDate: string | null; guestCount: number | null
  tripType: string | null; message: string | null
  utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmTerm: string | null
  rawPayload: Record<string, unknown>
  createdAt: string | null
}
interface PossibleMatch {
  freshsalesContactId: string
  freshsalesData: RowData
  inquiry: InquiryPayload | null
  existingId: string
  existingName: string
  existingEmail: string | null
  existingPhone: string | null
  matchedBy: 'email' | 'phone'
}

type Phase = 'form' | 'importing' | 'review' | 'resolving' | 'done'
const RESOLVE_CHUNK = 200

export default function FreshsalesImportModal({
  open, onOpenChange, onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const [viewId, setViewId] = useState('')
  const [target, setTarget] = useState<'lead' | 'guest'>('lead')
  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [progress, setProgress] = useState<{ fetched: number; created: number; updated: number; totalPages: number; pagesDone: number } | null>(null)
  const [matches, setMatches] = useState<PossibleMatch[]>([])
  const [decisions, setDecisions] = useState<Record<string, 'merge' | 'create'>>({})

  const reset = () => {
    setViewId(''); setTarget('lead'); setPhase('form'); setError(''); setResult(null)
    setProgress(null); setMatches([]); setDecisions({})
  }

  // Large views (30k+ contacts) are walked in bounded page-range batches so
  // no single request risks the serverless function timeout. We keep
  // calling the endpoint with an advancing startPage until it reports done.
  // Contacts that match an existing Lead/Customer by email or phone (but not
  // by freshsalesContactId) are held back by the API for review instead of
  // being written — accumulated here and resolved in a separate step once
  // the user decides merge vs. create-separate for each.
  const runImport = async () => {
    if (!viewId.trim()) { setError('Enter a Freshsales View ID first'); return }
    setPhase('importing')
    setError('')
    setProgress(null)

    const totals = { totalFetched: 0, created: 0, updated: 0 }
    const collectedMatches: PossibleMatch[] = []
    let startPage = 1
    let done = false

    try {
      while (!done) {
        const res = await fetch('/api/freshsales/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewId: viewId.trim(), target, startPage }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(`${data?.error ?? 'Import failed'} (stopped at page ${startPage} — safe to retry, already-imported contacts won't be duplicated)`)
          setPhase('form')
          return
        }
        totals.totalFetched += data.fetchedThisBatch
        totals.created += data.created
        totals.updated += data.updated
        collectedMatches.push(...(data.possibleMatches ?? []))
        done = data.done
        startPage = data.nextPage ?? startPage
        setProgress({ fetched: totals.totalFetched, created: totals.created, updated: totals.updated, totalPages: data.totalPages, pagesDone: done ? data.totalPages : startPage - 1 })
      }

      if (collectedMatches.length) {
        setMatches(collectedMatches)
        setDecisions(Object.fromEntries(collectedMatches.map(m => [m.freshsalesContactId, 'merge' as const])))
        setResult({ ...totals, merged: 0, target })
        setPhase('review')
      } else {
        setResult({ ...totals, merged: 0, target })
        setPhase('done')
        onImported()
      }
    } catch {
      setError('Import failed — safe to retry, already-imported contacts won\'t be duplicated')
      setPhase('form')
    }
  }

  const resolveMatches = async () => {
    setPhase('resolving')
    setError('')
    let merged = 0
    let createdNew = 0
    try {
      for (let i = 0; i < matches.length; i += RESOLVE_CHUNK) {
        const chunk = matches.slice(i, i + RESOLVE_CHUNK)
        const res = await fetch('/api/freshsales/import/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target,
            decisions: chunk.map(m => ({
              freshsalesContactId: m.freshsalesContactId,
              action: decisions[m.freshsalesContactId] ?? 'merge',
              existingId: m.existingId,
              data: m.freshsalesData,
              inquiry: m.inquiry,
            })),
          }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data?.error ?? 'Failed to resolve duplicates'); setPhase('review'); return }
        merged += data.merged
        createdNew += data.created
      }
      setResult(r => r ? { ...r, created: r.created + createdNew, merged } : r)
      setPhase('done')
      onImported()
    } catch {
      setError('Failed to resolve duplicates — safe to retry')
      setPhase('review')
    }
  }

  const setAllDecisions = (action: 'merge' | 'create') =>
    setDecisions(Object.fromEntries(matches.map(m => [m.freshsalesContactId, action])))

  const importing = phase === 'importing'
  const resolving = phase === 'resolving'

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className={phase === 'review' ? 'sm:max-w-3xl' : 'sm:max-w-md'}>
        <DialogHeader>
          <DialogTitle>Import from Freshsales</DialogTitle>
        </DialogHeader>

        {phase === 'done' && result ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Imported as {result.target === 'lead' ? 'Leads' : 'Guests'}
            </div>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="rounded-lg border p-3">
                <p className="text-xl font-bold">{result.totalFetched}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Fetched</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xl font-bold text-green-700">{result.created}</p>
                <p className="text-xs text-muted-foreground mt-0.5">New</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xl font-bold text-blue-700">{result.updated}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Updated</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xl font-bold text-amber-700">{result.merged}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Merged</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Import another view</Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : phase === 'review' ? (
          <div className="space-y-3 py-2">
            {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {matches.length} contact(s) share an email or WhatsApp number with an existing {target === 'lead' ? 'Lead' : 'Guest'}. Review before continuing.
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Merge links the Freshsales contact to the existing record and refreshes its details. Create keeps them as two separate records.</p>
              <div className="flex gap-2 shrink-0 ml-2">
                <Button size="sm" variant="outline" onClick={() => setAllDecisions('merge')} disabled={resolving}>Merge all</Button>
                <Button size="sm" variant="outline" onClick={() => setAllDecisions('create')} disabled={resolving}>Create all separate</Button>
              </div>
            </div>
            <ScrollArea className="h-80 border rounded-lg">
              <div className="divide-y">
                {matches.map(m => (
                  <div key={m.freshsalesContactId} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0 text-sm">
                      <p className="font-medium truncate">{m.freshsalesData.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.freshsalesData.email || '—'} · {m.freshsalesData.phone || '—'}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        matches existing <Badge variant="outline" className="text-[10px] px-1 py-0">{m.matchedBy}</Badge> → <span className="font-medium">{m.existingName}</span> ({m.existingEmail || m.existingPhone || m.existingId})
                      </p>
                    </div>
                    <RadioGroup
                      value={decisions[m.freshsalesContactId] ?? 'merge'}
                      onValueChange={v => setDecisions(d => ({ ...d, [m.freshsalesContactId]: v as 'merge' | 'create' }))}
                      className="flex gap-3 shrink-0"
                    >
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="merge" id={`merge-${m.freshsalesContactId}`} disabled={resolving} />
                        <Label htmlFor={`merge-${m.freshsalesContactId}`} className="font-normal cursor-pointer text-xs">Merge</Label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="create" id={`create-${m.freshsalesContactId}`} disabled={resolving} />
                        <Label htmlFor={`create-${m.freshsalesContactId}`} className="font-normal cursor-pointer text-xs">Create separate</Label>
                      </div>
                    </RadioGroup>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={resolving}>Cancel</Button>
              <Button onClick={resolveMatches} disabled={resolving}>
                {resolving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                {resolving ? 'Applying…' : `Apply ${matches.length} decision(s)`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

            <div className="space-y-1.5">
              <Label>Freshsales View ID</Label>
              <Input value={viewId} onChange={e => setViewId(e.target.value)} placeholder="e.g. 113000008394" disabled={importing} />
              <p className="text-[11px] text-muted-foreground">Find this in your Freshsales URL when viewing a saved list — the number at the end of `.../contacts/view/113000008394`.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Import as</Label>
              <RadioGroup value={target} onValueChange={v => setTarget(v as 'lead' | 'guest')} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="lead" id="fs-target-lead" disabled={importing} />
                  <Label htmlFor="fs-target-lead" className="font-normal cursor-pointer">Leads</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="guest" id="fs-target-guest" disabled={importing} />
                  <Label htmlFor="fs-target-guest" className="font-normal cursor-pointer">Guests</Label>
                </div>
              </RadioGroup>
              <p className="text-[11px] text-muted-foreground">Contacts already imported before (matched by Freshsales ID) will be updated, not duplicated. Contacts matching an existing record by email/phone will be flagged for you to review.</p>
            </div>

            {importing && progress && (
              <p className="text-xs text-muted-foreground">
                Importing… {progress.fetched} fetched ({progress.created} new, {progress.updated} updated)
                {progress.totalPages > 1 && ` — page ${progress.pagesDone}/${progress.totalPages}`}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
              <Button onClick={runImport} disabled={importing}>
                {importing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
                {importing ? 'Importing…' : 'Import'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
