'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, ShoppingCart, ClipboardList, ShieldAlert, ArrowLeft, Trash2, UserCheck, MapPin, Package } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { NativeSelect } from '@/components/ui/native-select'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { formatDate, formatMoney } from '@/lib/format'
import { useHidePrices } from '@/hooks/useHidePrices'

interface PrItem { id: string; itemName: string; quantity: number; unit: string; estimatedCost: number; notes: string | null }
interface MyPr {
  id: string
  prNumber: string
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'ON_PROCESS' | 'CONVERTED' | 'REJECTED' | 'CANCELLED'
  notes: string | null
  createdAt: string
  neededByDate: string | null
  isUrgent: boolean
  urgentReason: string | null
  approvedAt: string | null
  rejectedAt: string | null
  cancelledAt: string | null
  deliveryLocation: { name: string } | null
  approverEmployee: { fullName: string } | null
  approvedBy: { name: string | null } | null
  rejectedBy: { name: string | null } | null
  items: PrItem[]
  orders: { poNumber: string; status: string }[]
}
interface LocationOpt { id: string; name: string; type: string; parentId: string | null }

interface LineDraft { key: string; itemName: string; quantity: string; unit: string; estimatedCost: string; notes: string }

const newLine = (): LineDraft => ({ key: crypto.randomUUID(), itemName: '', quantity: '1', unit: 'pcs', estimatedCost: '', notes: '' })

// Where the request is from the requester's point of view — a CONVERTED PR is shown by how
// far its PO(s) got, since "Converted" means nothing to someone outside Purchasing.
function statusOf(r: MyPr): { label: string; tone: StatusTone } {
  switch (r.status) {
    case 'PENDING_APPROVAL': return { label: 'Awaiting Manager', tone: 'warning' }
    case 'DRAFT': return { label: 'Warehouse Check', tone: 'info' }
    case 'ON_PROCESS': return { label: 'With Purchasing', tone: 'info' }
    case 'REJECTED': return { label: 'Rejected', tone: 'destructive' }
    case 'CANCELLED': return { label: 'Cancelled', tone: 'neutral' }
    case 'CONVERTED': {
      const live = r.orders.filter(o => o.status !== 'CANCELLED' && o.status !== 'REJECTED')
      if (live.length > 0 && live.every(o => o.status === 'RECEIVED' || o.status === 'COMPLETED')) return { label: 'Received', tone: 'success' }
      if (live.some(o => o.status === 'IN_TRANSIT' || o.status === 'PARTIALLY_RECEIVED')) return { label: 'On Delivery', tone: 'primary' }
      return { label: 'Ordered', tone: 'primary' }
    }
  }
}

export default function MyPurchaseRequestsPage() {
  const confirm = useConfirm()
  const hidePrices = useHidePrices()
  const [loading, setLoading] = useState(true)
  const [linked, setLinked] = useState(true)
  const [approverName, setApproverName] = useState<string | null>(null)
  const [locations, setLocations] = useState<LocationOpt[]>([])
  const [requests, setRequests] = useState<MyPr[]>([])
  const [selected, setSelected] = useState<MyPr | null>(null)

  const [modal, setModal] = useState(false)
  const [reason, setReason] = useState('')
  const [locationId, setLocationId] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const [urgentReason, setUrgentReason] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([newLine()])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)

  const reload = useCallback(async () => {
    const res = await fetch('/api/purchasing/requests/mine')
    let list: MyPr[] = []
    if (res.ok) {
      const data = await res.json()
      setLinked(data.linked)
      setApproverName(data.approverName)
      setLocations(data.locations ?? [])
      list = data.requests ?? []
      setRequests(list)
    }
    setLoading(false)
    return list
  }, [])

  useEffect(() => { reload() }, [reload])

  function openAdd() {
    setReason(''); setLocationId(''); setNeededBy(''); setIsUrgent(false); setUrgentReason('')
    setLines([newLine()]); setFormError(''); setModal(true)
  }

  const setLine = (key: string, patch: Partial<LineDraft>) => setLines(ls => ls.map(l => l.key === key ? { ...l, ...patch } : l))

  async function submit() {
    if (!reason.trim()) { setFormError('Please explain what this purchase is for'); return }
    if (!locationId) { setFormError('Please select where it should be delivered'); return }
    const filled = lines.filter(l => l.itemName.trim())
    if (filled.length === 0) { setFormError('Add at least one item'); return }
    if (filled.some(l => !(Number(l.quantity) > 0))) { setFormError('Every item needs a quantity greater than 0'); return }
    if (isUrgent && !urgentReason.trim()) { setFormError('Please explain why this is urgent'); return }
    setSaving(true); setFormError('')
    const res = await fetch('/api/purchasing/requests/mine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason, deliveryLocationId: locationId, neededByDate: neededBy || undefined, isUrgent, urgentReason: isUrgent ? urgentReason : undefined,
        items: filled.map(l => ({ itemName: l.itemName, quantity: Number(l.quantity), unit: l.unit, estimatedCost: Number(l.estimatedCost) || 0, notes: l.notes })),
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setFormError(data.error ?? 'Failed to submit'); return }
    setModal(false)
    toast.success(data.status === 'PENDING_APPROVAL' ? `${data.prNumber} sent to your manager for approval` : `${data.prNumber} sent to Purchasing`)
    reload()
  }

  async function withdraw(r: MyPr) {
    const ok = await confirm({
      title: `Withdraw ${r.prNumber}?`,
      description: 'Your manager has not approved it yet. The request will be deleted.',
      confirmLabel: 'Yes, Withdraw',
      destructive: true,
    })
    if (!ok) return
    setWithdrawing(true)
    const res = await fetch(`/api/purchasing/requests/${r.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setWithdrawing(false)
    if (!res.ok) { toast.error(data.error ?? 'Failed to withdraw'); return }
    toast.success(`${r.prNumber} withdrawn`)
    setSelected(null)
    reload()
  }

  const total = (r: MyPr) => r.items.reduce((s, i) => s + i.quantity * i.estimatedCost, 0)
  const draftTotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.estimatedCost) || 0), 0)

  const header = (
    <div>
      <h2 className="text-2xl font-bold tracking-tight">Purchase Request</h2>
      <p className="text-muted-foreground text-sm mt-1">Ask Purchasing to buy something you need — your manager approves it first</p>
    </div>
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="rounded-lg border overflow-hidden animate-pulse">
          <div className="h-10 bg-muted/50 border-b" />
          {[...Array(3)].map((_, i) => <div key={i} className="px-5 py-4 border-t flex gap-4"><div className="h-4 w-40 rounded bg-muted" /><div className="h-4 w-20 rounded bg-muted" /></div>)}
        </div>
      </div>
    )
  }

  if (!linked) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-xl border bg-warning/10 border-warning/30 px-6 py-10 text-center">
          <ShieldAlert className="h-8 w-8 mx-auto mb-3 text-warning" />
          <p className="font-medium text-sm">Your account isn&apos;t linked to an HR employee profile yet</p>
          <p className="text-muted-foreground text-sm mt-1">Ask an Admin to link your login to an employee record under Team, then you&apos;ll be able to request a purchase here.</p>
        </div>
      </div>
    )
  }

  if (selected) {
    const st = statusOf(selected)
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setSelected(null)} className="-ml-3 gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft /> Back to Purchase Requests
        </Button>

        <div className="rounded-2xl border bg-card max-w-2xl">
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b">
            <div className="min-w-0">
              <p className="font-mono text-xs text-muted-foreground">{selected.prNumber}</p>
              <h2 className="text-lg font-bold tracking-tight mt-0.5 whitespace-pre-wrap">{selected.notes || '—'}</h2>
            </div>
            <StatusBadge tone={st.tone} className="px-2.5 py-1 shrink-0">{st.label}</StatusBadge>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Deliver To</p>
                <p className="font-medium mt-0.5 flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{selected.deliveryLocation?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Needed By</p>
                <p className="font-medium mt-0.5">{formatDate(selected.neededByDate)}</p>
              </div>
            </div>

            {selected.isUrgent && selected.urgentReason && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                <p className="text-[11px] font-semibold text-destructive uppercase tracking-wide">Urgent</p>
                <p className="text-sm text-destructive mt-0.5">{selected.urgentReason}</p>
              </div>
            )}

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">Items</p>
              <ul className="rounded-xl border divide-y">
                {selected.items.map((it, i) => (
                  <li key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{it.itemName}</p>
                      {it.notes && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{it.notes}</p>}
                    </div>
                    {!hidePrices && it.estimatedCost > 0 && <span className="text-xs text-muted-foreground tabular-nums">{formatMoney(it.estimatedCost * it.quantity)}</span>}
                    <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums">{it.quantity} {it.unit}</span>
                  </li>
                ))}
              </ul>
              {!hidePrices && total(selected) > 0 && (
                <p className="text-xs text-muted-foreground text-right mt-2">Estimated total <span className="font-semibold text-foreground tabular-nums">{formatMoney(total(selected))}</span></p>
              )}
            </div>

            <div className="text-xs border-t pt-3 space-y-1.5">
              <p className="text-muted-foreground uppercase tracking-wide font-semibold">Manager Approval</p>
              {selected.status === 'PENDING_APPROVAL' ? (
                <p className="text-warning">Waiting for {selected.approverEmployee?.fullName ?? 'your manager'} to approve.</p>
              ) : selected.status === 'REJECTED' ? (
                <p className="text-destructive">Rejected{selected.rejectedAt && ` ${formatDate(selected.rejectedAt)}`}{selected.rejectedBy?.name && ` by ${selected.rejectedBy.name}`} — check your notifications for the reason.</p>
              ) : selected.approvedAt ? (
                <p className="text-muted-foreground">Approved {formatDate(selected.approvedAt)}{selected.approvedBy?.name && ` by ${selected.approvedBy.name}`}</p>
              ) : (
                <p className="text-muted-foreground">Not needed — no manager on file, sent straight to Purchasing.</p>
              )}
            </div>

            {selected.orders.length > 0 && (
              <div className="text-xs space-y-1">
                <p className="text-muted-foreground uppercase tracking-wide font-semibold">Purchase Orders</p>
                {selected.orders.map(o => (
                  <p key={o.poNumber}><span className="font-mono">{o.poNumber}</span> <span className="text-muted-foreground">· {o.status.replace(/_/g, ' ').toLowerCase()}</span></p>
                ))}
              </div>
            )}

            <div className="text-xs text-muted-foreground border-t pt-3">Requested {formatDate(selected.createdAt)}</div>
          </div>

          {selected.status === 'PENDING_APPROVAL' && (
            <div className="border-t p-5 flex justify-end">
              <Button variant="outline" onClick={() => withdraw(selected)} loading={withdrawing}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 /> Withdraw Request
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        {header}
        <Button onClick={openAdd}>
          <Plus /> New Purchase Request
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">PR No.</th>
              <th className="text-left px-4 py-3 font-medium">For</th>
              <th className="text-left px-4 py-3 font-medium">Items</th>
              {!hidePrices && <th className="text-right px-4 py-3 font-medium">Est. Total</th>}
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {requests.length === 0 ? (
              <tr><td colSpan={hidePrices ? 5 : 6} className="text-center py-12 text-muted-foreground text-sm">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-20" />
                You haven&apos;t requested a purchase yet.
              </td></tr>
            ) : requests.map(r => {
              const st = statusOf(r)
              return (
                <tr key={r.id} className="hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelected(r)}>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{r.prNumber}</td>
                  <td className="px-4 py-3 text-xs max-w-56 truncate" title={r.notes ?? undefined}>{r.notes || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-56 truncate" title={r.items.map(i => i.itemName).join(', ')}>
                    {r.items.map(i => i.itemName).join(', ')}
                  </td>
                  {!hidePrices && <td className="px-4 py-3 text-right text-xs tabular-nums whitespace-nowrap">{total(r) > 0 ? formatMoney(total(r)) : '—'}</td>}
                  <td className="px-4 py-3 text-center"><StatusBadge tone={st.tone}>{st.label}</StatusBadge></td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      </div>

      <Dialog open={modal} onOpenChange={o => { if (!o) setModal(false) }}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[92vh] flex flex-col overflow-hidden" aria-describedby={undefined} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="flex-row items-center gap-2 px-6 py-4 pr-12 border-b text-left shrink-0">
            <ShoppingCart className="h-4 w-4 text-primary-strong" />
            <DialogTitle className="text-sm font-bold">New Purchase Request</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4 overflow-y-auto">
            {formError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{formError}</p>}

            <div className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${approverName ? 'bg-muted/50 text-muted-foreground' : 'bg-warning/10 text-warning'}`}>
              <UserCheck className="h-3.5 w-3.5 shrink-0" />
              {approverName
                ? <span>Goes to <span className="font-semibold text-foreground">{approverName}</span> for approval first, then to Purchasing.</span>
                : <span>No manager on file for you — this goes straight to Purchasing. Ask HR to set your manager.</span>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mpr-reason" className="gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">What is it for? <span className="text-destructive">*</span></Label>
              <Textarea id="mpr-reason" rows={2} className="resize-none" autoFocus
                placeholder="e.g. Replacement keyboard for the sales laptop — current one has broken keys"
                value={reason} onChange={e => setReason(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mpr-location" className="gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Deliver To <span className="text-destructive">*</span></Label>
                <NativeSelect id="mpr-location" className="h-10 w-full" value={locationId} onChange={e => setLocationId(e.target.value)}>
                  <option value="">Select location…</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mpr-needed" className="gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Needed By <span className="normal-case font-normal text-muted-foreground/70">(optional)</span></Label>
                <Input id="mpr-needed" type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Items <span className="text-destructive">*</span></p>
              {lines.map((l, idx) => (
                <div key={l.key} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                    <Input aria-label={`Item ${idx + 1} name`} placeholder="Item name / description" value={l.itemName} onChange={e => setLine(l.key, { itemName: e.target.value })} />
                    {lines.length > 1 && (
                      <Button variant="ghost" size="icon" aria-label={`Remove item ${idx + 1}`} className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  <div className={`grid gap-2 pl-6 ${hidePrices ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    <Input aria-label={`Item ${idx + 1} quantity`} type="number" min={0} step="any" placeholder="Qty" value={l.quantity} onChange={e => setLine(l.key, { quantity: e.target.value })} />
                    <Input aria-label={`Item ${idx + 1} unit`} placeholder="Unit (pcs, box…)" value={l.unit} onChange={e => setLine(l.key, { unit: e.target.value })} />
                    {!hidePrices && (
                      <Input aria-label={`Item ${idx + 1} estimated unit price`} inputMode="numeric" placeholder="Est. price / unit"
                        value={l.estimatedCost ? new Intl.NumberFormat('id-ID').format(Number(l.estimatedCost)) : ''}
                        onChange={e => setLine(l.key, { estimatedCost: e.target.value.replace(/\D/g, '') })} />
                    )}
                  </div>
                  <div className="pl-6">
                    <Input aria-label={`Item ${idx + 1} notes`} placeholder="Spec, brand, link… (optional)" value={l.notes} onChange={e => setLine(l.key, { notes: e.target.value })} />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={() => setLines(ls => [...ls, newLine()])}><Plus /> Add Item</Button>
                {!hidePrices && draftTotal > 0 && <p className="text-xs text-muted-foreground">Estimated total <span className="font-semibold text-foreground tabular-nums">{formatMoney(draftTotal)}</span></p>}
              </div>
            </div>

            <div className="rounded-lg border px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="mpr-urgent" className="text-sm">Urgent</Label>
                <Switch id="mpr-urgent" checked={isUrgent} onCheckedChange={setIsUrgent} />
              </div>
              {isUrgent && (
                <Textarea aria-label="Why is it urgent" rows={2} className="resize-none" placeholder="Why is it urgent?"
                  value={urgentReason} onChange={e => setUrgentReason(e.target.value)} />
              )}
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50 shrink-0">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={submit} loading={saving}>
              {saving ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
