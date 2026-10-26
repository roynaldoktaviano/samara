'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Bell, X } from 'lucide-react'
import { isPushSupported, subscribeToPush } from '@/lib/push-client'
import { Button } from '@/components/ui/button'

const DISMISS_KEY = 'push-prompt-dismissed'

// A quiet, dismissible nudge to enable push — not a blocking modal. Only ever offered
// once per browser (until localStorage is cleared) and only when permission is still
// 'default' (never asked, or the browser doesn't remember a denial as 'default').
export function PushNotificationPrompt() {
  const { data: session } = useSession()
  const [visible, setVisible] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session?.user?.id) return
    if (!isPushSupported()) return
    if (localStorage.getItem(DISMISS_KEY)) return
    if (Notification.permission !== 'default') return
    const timer = setTimeout(() => setVisible(true), 2000)
    return () => clearTimeout(timer)
  }, [session])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  async function enable() {
    setSubscribing(true)
    setError('')
    const result = await subscribeToPush()
    setSubscribing(false)
    if (!result.ok) { setError(result.error); return }
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 sm:w-80 rounded-xl border bg-card shadow-lg overflow-hidden animate-in slide-in-from-bottom-2">
      <div className="flex items-start gap-3 p-4">
        <div className="shrink-0 p-2 rounded-full bg-primary/15">
          <Bell className="h-4 w-4 text-primary-strong" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Enable notifications?</p>
          <p className="text-xs text-muted-foreground mt-0.5">Get instant alerts on your phone/laptop for approvals, POs, and payments — even when the tab is closed.</p>
          {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <Button size="sm" className="text-xs" onClick={enable} loading={subscribing}>
              {subscribing ? 'Enabling…' : 'Enable'}
            </Button>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground" onClick={dismiss}>
              Maybe later
            </Button>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="size-7 -mt-1 -mr-1 text-muted-foreground hover:text-foreground" onClick={dismiss} aria-label="Dismiss">
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
