'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RupiahInput } from '@/components/ui/rupiah-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatMoney } from '@/lib/format'
import { BUDGET_CURRENCIES, type BudgetCurrency } from '@/lib/collaboration-budget'

/** One editable line. `amount` is the raw string being typed (digits for IDR, decimal for USD). */
export interface BudgetRow { key: string; name: string; amount: string }

let rowSeq = 0
export const newBudgetRow = (name = '', amount = ''): BudgetRow => ({ key: `b${Date.now()}-${rowSeq++}`, name, amount })

export const budgetRowsFrom = (items: { name: string; amount: number }[] | undefined | null): BudgetRow[] =>
  items?.length ? items.map(i => newBudgetRow(i.name, String(i.amount))) : [newBudgetRow()]

/** Rows to send to the API — fully blank rows dropped. */
export const budgetRowsPayload = (rows: BudgetRow[]) =>
  rows.filter(r => r.name.trim() || r.amount.trim()).map(r => ({ name: r.name.trim(), amount: r.amount }))

const rowAmount = (r: BudgetRow) => parseFloat(r.amount) || 0

/** Valid = no half-filled rows (name without amount or vice versa). Budget is optional — all-empty is fine. */
export function budgetRowsValid(rows: BudgetRow[]): boolean {
  const filled = rows.filter(r => r.name.trim() || r.amount.trim())
  return filled.every(r => r.name.trim() && r.amount.trim() !== '' && !isNaN(Number(r.amount)) && Number(r.amount) >= 0)
}

export function BudgetStructureEditor({ currency, onCurrencyChange, rows, onRowsChange, disabled }: {
  currency: BudgetCurrency
  onCurrencyChange: (c: BudgetCurrency) => void
  rows: BudgetRow[]
  onRowsChange: (rows: BudgetRow[]) => void
  disabled?: boolean
}) {
  const total = rows.reduce((s, r) => s + rowAmount(r), 0)
  const setRow = (key: string, patch: Partial<BudgetRow>) => onRowsChange(rows.map(r => (r.key === key ? { ...r, ...patch } : r)))
  const removeRow = (key: string) => {
    const next = rows.filter(r => r.key !== key)
    onRowsChange(next.length ? next : [newBudgetRow()])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Budget structure <span className="normal-case font-normal">(optional)</span>
        </Label>
        <Select value={currency} onValueChange={v => onCurrencyChange(v as BudgetCurrency)} disabled={disabled}>
          <SelectTrigger className="h-8 w-24 text-xs" aria-label="Budget currency"><SelectValue /></SelectTrigger>
          <SelectContent>
            {BUDGET_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border divide-y">
        {rows.map((r, i) => (
          <div key={r.key} className="flex items-center gap-2 p-2">
            <Input
              value={r.name}
              onChange={e => setRow(r.key, { name: e.target.value })}
              placeholder={i === 0 ? 'e.g. Fuel, Crew meals, Photographer' : 'Item'}
              className="h-9 text-sm flex-1 min-w-0"
              aria-label={`Budget item ${i + 1} name`}
              disabled={disabled}
            />
            <div className="w-36 sm:w-44 shrink-0">
              {currency === 'IDR' ? (
                <RupiahInput
                  value={r.amount}
                  onChange={v => setRow(r.key, { amount: v })}
                  aria-label={`Budget item ${i + 1} amount`}
                  disabled={disabled}
                />
              ) : (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={r.amount}
                    onChange={e => setRow(r.key, { amount: e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1') })}
                    placeholder="0"
                    className="h-9 text-sm pl-7"
                    aria-label={`Budget item ${i + 1} amount`}
                    disabled={disabled}
                  />
                </div>
              )}
            </div>
            <Button
              type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeRow(r.key)} aria-label={`Remove budget item ${i + 1}`} disabled={disabled}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/40">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 -ml-1 text-xs" onClick={() => onRowsChange([...rows, newBudgetRow()])} disabled={disabled}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add item
          </Button>
          <div className="text-sm">
            <span className="text-muted-foreground mr-2">Total</span>
            <span className="font-semibold tabular-nums">{formatMoney(total, { currency })}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
