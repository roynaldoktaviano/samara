'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Bell, X } from 'lucide-react'
import { isPushSupported, subscribeToPush } from '@/lib/push-client'

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
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border bg-white shadow-lg overflow-hidden animate-in slide-in-from-bottom-2">
      <div className="flex items-start gap-3 p-4">
        <div className="shrink-0 p-2 rounded-full bg-[#bdac7e]/15">
          <Bell className="h-4 w-4 text-[#7a6a3f]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Aktifkan notifikasi?</p>
          <p className="text-xs text-muted-foreground mt-0.5">Dapat notif langsung di HP/laptop untuk approval, PO, dan pembayaran — walau tab-nya tertutup.</p>
          {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
          <div className="flex items-center gap-2 mt-2.5">
            <button
              onClick={enable}
              disabled={subscribing}
              className="px-3 py-1.5 text-xs font-medium bg-[#bdac7e] hover:bg-[#a89860] disabled:opacity-50 text-white rounded-md transition-colors"
            >
              {subscribing ? 'Mengaktifkan...' : 'Aktifkan'}
            </button>
            <button onClick={dismiss} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              Nanti saja
            </button>
          </div>
        </div>
        <button onClick={dismiss} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
