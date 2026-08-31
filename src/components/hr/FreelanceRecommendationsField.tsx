'use client'

import { Plus, X } from 'lucide-react'

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

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Freelance Recommendation (optional)</label>
      <p className="text-[11px] text-muted-foreground">Know someone who could cover your trips while you&apos;re out? List them so HR can reach out.</p>
      <div className="space-y-2">
        {value.map(r => (
          <div key={r.id} className="flex items-center gap-2 border-2 border-gray-100 rounded-xl p-2.5">
            <input value={r.name} onChange={e => updateRow(r.id, { name: e.target.value })} placeholder="Name"
              className="flex-1 h-8 text-sm font-medium bg-transparent focus:outline-none min-w-0" />
            <input value={r.phone} onChange={e => updateRow(r.id, { phone: e.target.value })} placeholder="Phone number"
              className="w-36 h-8 text-sm bg-transparent focus:outline-none shrink-0" />
            <button type="button" onClick={() => removeRow(r.id)} className="p-1.5 text-muted-foreground hover:text-destructive shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button type="button" onClick={addRow}
          className="w-full flex items-center justify-center gap-1.5 border-2 border-dashed rounded-xl py-2 text-sm text-muted-foreground hover:border-[#bdac7e] hover:text-foreground transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Recommendation
        </button>
      </div>
    </div>
  )
}
