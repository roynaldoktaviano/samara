'use client'

import { useState } from 'react'
import { Download, FileText, Stethoscope } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FilePreview } from '@/components/ui/file-preview'
import { downloadDataUrl, extFromDataUrl } from '@/lib/fileUpload'

// Shared bits for the three leave types (annual Leave / WFH / Sick Leave) used by the
// self-service, HR and My Approvals screens.

export type LeaveType = 'LEAVE' | 'WFH' | 'SICK'

export const LEAVE_TYPE_OPTIONS: { value: LeaveType; label: string }[] = [
  { value: 'LEAVE', label: 'Leave' },
  { value: 'SICK', label: 'Sick Leave' },
  { value: 'WFH', label: 'WFH' },
]

export const LEAVE_TYPE_SHORT: Record<LeaveType, string> = { LEAVE: 'Leave', WFH: 'WFH', SICK: 'Sick' }

const BADGE_CLS: Record<LeaveType, string> = {
  LEAVE: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  WFH: 'bg-info/15 text-info',
  SICK: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

export function LeaveTypeBadge({ type, className = '' }: { type: LeaveType; className?: string }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${BADGE_CLS[type]} ${className}`}>
      {LEAVE_TYPE_SHORT[type]}
    </span>
  )
}

/** Day-count hint under the date pickers. */
export function leaveDaysHint(type: LeaveType, days: number, whose: 'your' | 'their' = 'your') {
  const d = `${days} day${days !== 1 ? 's' : ''}`
  if (type === 'WFH') return `${d} of WFH — does not use ${whose} leave balance`
  if (type === 'SICK') return `${d} of sick leave — does not use ${whose} annual leave`
  return `${d} of leave`
}

/** "View Doctor's Letter" — loads a sick leave's attachments on demand (they're not in list responses). */
export function SickLetterButton({ requestId, employeeName, size = 'sm' }: { requestId: string; employeeName: string; size?: 'sm' | 'xs' }) {
  const [files, setFiles] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function open() {
    setLoading(true)
    const res = await fetch(`/api/hr/leave-requests/${requestId}/attachments`)
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { toast.error(data.error ?? "Could not load the doctor's letter"); return }
    setFiles(data.attachments ?? [])
  }

  const fileName = (i: number, f: string) => `${employeeName.replace(/[^a-z0-9]+/gi, '-')}-sick-letter-${i + 1}.${extFromDataUrl(f)}`

  return (
    <>
      {size === 'xs' ? (
        <button type="button" onClick={open} disabled={loading}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 dark:text-rose-300 hover:underline disabled:opacity-50">
          <Stethoscope className="size-3" /> {loading ? 'Loading…' : "Doctor's letter"}
        </button>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={open} loading={loading}>
          <Stethoscope /> Doctor&apos;s Letter
        </Button>
      )}
      <Dialog open={files !== null} onOpenChange={o => { if (!o) setFiles(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Doctor&apos;s letter — {employeeName}</DialogTitle>
            <DialogDescription>Attached to this sick leave request.</DialogDescription>
          </DialogHeader>
          {files && files.length === 0 ? (
            <p className="text-sm text-muted-foreground">No file attached.</p>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {files?.map((f, i) => (
                <div key={i} className="border rounded-lg overflow-hidden">
                  {f.startsWith('data:image/') ? (
                    <FilePreview src={f} alt={`Doctor's letter ${i + 1}`} className="w-full max-h-96 object-contain bg-muted/30" />
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-6 justify-center text-sm text-muted-foreground"><FileText className="size-5" /> PDF file</div>
                  )}
                  <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30">
                    <span className="text-xs">File {i + 1}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => downloadDataUrl(f, fileName(i, f))}><Download /> Download</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
