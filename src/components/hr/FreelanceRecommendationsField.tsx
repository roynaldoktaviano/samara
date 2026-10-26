'use client'

import { useId } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface FreelanceRecommendation { id: string; name: string; phone: string }

// Optional add-row field on the Leave Request form — who the requester knows that could
// freelance-cover their trips while they're out, so HR can reach out. Shared by the
// HR-filed form (LeaveRequestsPage) and the self-service form (MyLeaveRequestsPage).
export function FreelanceRecommendationsField({ value, onChange }: {
  value: FreelanceRecommendation[]
  onChange: (value: FreelanceRecommendation[]) => void
}) {
  function addRow() { onChange([...value, { id: crypto.randomUUID(), name: '', phone: '' }]) }
  function updateRow(id: string, patch: Partial<FreelanceRecommendation>) { onChange(value.map(r => r.id === id ? { ...r, ...patch } : r)) }
  function removeRow(id: string) { onChange(value.filter(r => r.id !== id)) }

  const headingId = useId()
  const hintId = useId()

  return (
    <div role="group" aria-labelledby={headingId} aria-describedby={hintId} className="space-y-1.5">
      <p id={headingId} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Freelance Recommendation (optional)</p>
      <p id={hintId} className="text-[11px] text-muted-foreground">Know someone who could cover your trips while you&apos;re out? List them so HR can reach out.</p>
      <div className="space-y-2">
        {value.map(r => (
          <div key={r.id} className="flex items-center gap-2 border-2 border-border rounded-xl p-2.5">
            <Input value={r.name} onChange={e => updateRow(r.id, { name: e.target.value })} placeholder="Name"
              aria-label="Recommended person's name" className="flex-1 h-8 font-medium min-w-0" />
            <Input value={r.phone} onChange={e => updateRow(r.id, { phone: e.target.value })} placeholder="Phone number"
              aria-label="Recommended person's phone number" className="w-36 h-8 shrink-0" />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(r.id)} aria-label="Remove recommendation"
              className="size-7 text-muted-foreground hover:text-destructive shrink-0">
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={addRow}
          className="w-full gap-1.5 border-2 border-dashed rounded-xl text-muted-foreground shadow-none hover:border-primary hover:text-foreground">
          <Plus className="size-3.5" /> Add Recommendation
        </Button>
      </div>
    </div>
  )
}
