'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

// Gates a "reveal" boolean behind re-entering your own current password (checked
// server-side against your own session, see /api/auth/verify-password). Render
// `dialog` wherever the modal should mount, and call `requestReveal` from an eye
// button; `revealed` flips true once the password checks out.
export function usePasswordGate() {
  const [revealed, setRevealed] = useState(false)
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)

  async function submit() {
    if (!password) return
    setChecking(true)
    try {
      const res = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        toast.error('Incorrect password')
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
          <DialogDescription>Enter your account password to view this data.</DialogDescription>
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
    requestReveal: () => setOpen(true),
    hide: () => setRevealed(false),
    dialog,
  }
}
