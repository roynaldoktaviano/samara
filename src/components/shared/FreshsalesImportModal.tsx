'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Loader2, Download, CheckCircle2 } from 'lucide-react'

interface Result { totalFetched: number; created: number; updated: number; target: 'lead' | 'guest' }

export default function FreshsalesImportModal({
  open, onOpenChange, onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const [viewId, setViewId] = useState('')
  const [target, setTarget] = useState<'lead' | 'guest'>('lead')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  const reset = () => { setViewId(''); setTarget('lead'); setError(''); setResult(null) }

  const handleImport = async () => {
    if (!viewId.trim()) { setError('Enter a Freshsales View ID first'); return }
    setImporting(true)
    setError('')
    try {
      const res = await fetch('/api/freshsales/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewId: viewId.trim(), target }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error ?? 'Import failed'); return }
      setResult({ totalFetched: data.totalFetched, created: data.created, updated: data.updated, target: data.target })
      onImported()
    } catch {
      setError('Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import from Freshsales</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Imported as {result.target === 'lead' ? 'Leads' : 'Guests'}
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
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
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Import another view</Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

            <div className="space-y-1.5">
              <Label>Freshsales View ID</Label>
              <Input value={viewId} onChange={e => setViewId(e.target.value)} placeholder="e.g. 113000008394" />
              <p className="text-[11px] text-muted-foreground">Find this in your Freshsales URL when viewing a saved list — the number at the end of `.../contacts/view/113000008394`.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Import as</Label>
              <RadioGroup value={target} onValueChange={v => setTarget(v as 'lead' | 'guest')} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="lead" id="fs-target-lead" />
                  <Label htmlFor="fs-target-lead" className="font-normal cursor-pointer">Leads</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="guest" id="fs-target-guest" />
                  <Label htmlFor="fs-target-guest" className="font-normal cursor-pointer">Guests</Label>
                </div>
              </RadioGroup>
              <p className="text-[11px] text-muted-foreground">Contacts already imported before (matched by Freshsales ID) will be updated, not duplicated.</p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
              <Button onClick={handleImport} disabled={importing}>
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
