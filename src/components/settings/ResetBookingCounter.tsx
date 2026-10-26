'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RotateCcw, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function ResetBookingCounter() {
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [toast,   setToast]   = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 5000)
  }

  const handleReset = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/reset-counters', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        showToast('success', data.message)
      } else {
        showToast('error', data.error ?? 'Reset failed')
      }
    } catch {
      showToast('error', 'Network error')
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            Reset Booking Code Counter
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Restart the booking code sequence from 0001. Only possible when there are no bookings.
          </p>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setOpen(true)}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RotateCcw className="h-3.5 w-3.5 mr-1.5" />}
            Reset Counter
          </Button>

          {toast && (
            <div className={`mt-3 flex items-center gap-2 text-xs rounded-md px-3 py-2 ${toast.type === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
              {toast.type === 'success'
                ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
              {toast.msg}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Booking Code Counter?</AlertDialogTitle>
            <AlertDialogDescription>
              All booking code counters (SL1-ST-xxxx, SL1-PC-xxxx, etc.) will be reset to 0.
              The next booking will start from <strong>0001</strong> again.
              <br /><br />
              Make sure all bookings have been deleted before running this reset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              disabled={loading}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Yes, Reset Counter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
