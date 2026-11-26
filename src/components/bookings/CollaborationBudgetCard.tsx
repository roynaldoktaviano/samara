'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'
import { budgetTotal, normalizeBudgetCurrency, type BudgetCurrency } from '@/lib/collaboration-budget'
import { BudgetStructureEditor, budgetRowsFrom, budgetRowsPayload, budgetRowsValid, type BudgetRow } from '@/components/bookings/BudgetStructureEditor'

export interface CollaborationBudget {
  id: string
  budgetCurrency?: string | null
  budgetItems?: { id?: string; name: string; amount: number }[]
}

/**
 * Budget structure of a Collaboration Book inside a booking detail view — read-only list with
 * total, plus an inline editor for Marketing/Admin. `onSaved` receives the fresh currency + items.
 */
export function CollaborationBudgetCard({ booking, canEdit, onSaved }: {
  booking: CollaborationBudget
  canEdit: boolean
  onSaved?: (next: { budgetCurrency: string; budgetItems: { id: string; name: string; amount: number }[] }) => void
}) {
  const items = booking.budgetItems ?? []
  const currency = normalizeBudgetCurrency(booking.budgetCurrency)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftCurrency, setDraftCurrency] = useState<BudgetCurrency>(currency)
  const [rows, setRows] = useState<BudgetRow[]>([])

  const startEdit = () => {
    setDraftCurrency(currency)
    setRows(budgetRowsFrom(items))
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/budget`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budgetCurrency: draftCurrency, budgetItems: budgetRowsPayload(rows) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed to save budget'); return }
      onSaved?.({ budgetCurrency: data.budgetCurrency, budgetItems: data.budgetItems })
      setEditing(false)
      toast.success('Budget structure saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border overflow-hidden text-xs">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Budget Structure
        </p>
        {canEdit && !editing && (
          <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] font-semibold" onClick={startEdit}>
            <Pencil className="h-3 w-3 mr-1" /> Edit
          </Button>
        )}
      </div>

      {editing ? (
        <div className="p-3 space-y-3">
          <BudgetStructureEditor currency={draftCurrency} onCurrencyChange={setDraftCurrency} rows={rows} onRowsChange={setRows} disabled={saving} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            <Button type="button" size="sm" loading={saving} disabled={!budgetRowsValid(rows)} onClick={save}>Save</Button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <p className="px-3 py-3 text-muted-foreground">No budget items yet.</p>
      ) : (
        <div className="divide-y">
          {items.map((it, i) => (
            <div key={it.id ?? i} className="flex justify-between gap-4 px-3 py-2">
              <span className="text-muted-foreground">{it.name}</span>
              <span className="font-medium tabular-nums">{formatMoney(it.amount, { currency })}</span>
            </div>
          ))}
          <div className="flex justify-between gap-4 px-3 py-2 bg-muted/30">
            <span className="font-semibold">Total budget</span>
            <span className="font-semibold tabular-nums">{formatMoney(budgetTotal(items), { currency })}</span>
          </div>
        </div>
      )}
    </div>
  )
}
