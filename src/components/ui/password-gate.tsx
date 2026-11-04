'use client'

import { useCallback, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

// Gates a "reveal" boolean behind re-entering your own current password (checked
// server-side against your own session, see /api/auth/verify-password). Render
// `dialog` wherever the modal should mount, and call `requestReveal` from an eye
// button; `revealed` flips true once the password checks out. Pass `endpoint` to check
// against a route that also unlocks something server-side (e.g. /api/hr/payroll/unlock).
export function usePasswordGate({ endpoint = '/api/auth/verify-password', description = 'Enter your account password to view this data.' }: { endpoint?: string; description?: string } = {}) {
  const [revealed, setRevealed] = useState(false)
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)
  const requestReveal = useCallback(() => setOpen(true), [])
  const hide = useCallback(() => setRevealed(false), [])

  async function submit() {
    if (!password) return
    setChecking(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        toast.error((await res.json().catch(() => null))?.error ?? 'Incorrect password')
        return
      }
      setRevealed(true)
      setOpen(false)
      setPassword('')
    } finally {
      setChecking(false)
    }
  }

  const dialog = (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setPassword('') }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm your password</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="password-gate-input" className="text-xs">Password</Label>
          <Input
            id="password-gate-input"
            type="password"
            autoFocus
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={checking || !password}>
            {checking && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return {
    revealed,
    requestReveal,
    hide,
    dialog,
  }
}
