'use client'

import { useSession, signOut } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// Only pages behind the staff login watch for an expired session. Allowlist (not a public-path
// blocklist) so every token/PIN link — /kalender, /request-order, /po-receive, /crew-receive,
// /guest-form, /cashier, /agent/calendar, etc., including ones added later — is never interrupted
// when the same browser logs out of the ERP in another tab.
const PROTECTED_PATHS = ['/admin', '/super-admin', '/calendar', '/print', '/proto-documents']

function isProtected(pathname: string) {
  return pathname === '/' || PROTECTED_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export function SessionWatcher() {
  const { status } = useSession()
  const pathname = usePathname()
  const wasAuthenticated = useRef(false)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    if (!isProtected(pathname)) return
    if (status === 'authenticated') {
      wasAuthenticated.current = true
    }
    if (status === 'unauthenticated' && wasAuthenticated.current) {
      setExpired(true)
    }
  }, [status, pathname])

  if (!expired) return null

  // Blocking: no close button, outside click and Escape are ignored — the only way out is logging in again.
  return (
    <Dialog open>
      <DialogContent
        className="sm:max-w-[360px] p-0 gap-0 overflow-hidden"
        showCloseButton={false}
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        {/* Header accent */}
        <div className="h-1.5 w-full" style={{ backgroundColor: 'var(--brand)' }} />

        <div className="px-6 py-6 text-center">
          {/* Icon */}
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'color-mix(in srgb, var(--brand) 8%, transparent)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>

          <DialogTitle className="text-lg font-bold text-foreground mb-1 leading-normal">Session Expired</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            Your session has expired due to inactivity. Please log in again to continue.
          </DialogDescription>

          <Button
            variant="brand"
            size="lg"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="mt-5 w-full font-semibold"
          >
            Log In Again
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
