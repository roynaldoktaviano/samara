'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, MailX, CheckCircle2 } from 'lucide-react'

const ACCENT = '#bdac7e'

interface Info {
  email: string
  alreadyUnsubscribed: boolean
  campaignName: string
  fromName: string
}

function UnsubscribeContent() {
  const token = useSearchParams().get('token')
  const [info, setInfo] = useState<Info | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) { setError('Missing or invalid link'); setLoading(false); return }
    fetch(`/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) { setError(data?.error ?? 'Invalid or expired link'); return }
        setInfo(data)
        setDone(data.alreadyUnsubscribed)
      })
      .finally(() => setLoading(false))
  }, [token])

  const confirm = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/marketing/unsubscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      })
      if (res.ok) setDone(true)
      else setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-sm w-full bg-white rounded-xl shadow-sm border p-8 text-center space-y-4">
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        ) : error ? (
          <>
            <MailX className="h-8 w-8 mx-auto text-red-400" />
            <p className="text-sm text-gray-600">{error}</p>
          </>
        ) : done ? (
          <>
            <CheckCircle2 className="h-8 w-8 mx-auto" style={{ color: ACCENT }} />
            <p className="font-medium">You&apos;re unsubscribed</p>
            <p className="text-sm text-gray-500">{info?.email} will no longer receive emails from {info?.fromName}.</p>
          </>
        ) : (
          <>
            <MailX className="h-8 w-8 mx-auto text-gray-400" />
            <p className="font-medium">Unsubscribe from {info?.fromName}?</p>
            <p className="text-sm text-gray-500">{info?.email} will stop receiving future emails like &quot;{info?.campaignName}&quot;.</p>
            <button
              onClick={confirm}
              disabled={submitting}
              className="w-full rounded-md py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-60"
              style={{ backgroundColor: ACCENT }}
            >
              {submitting ? 'Unsubscribing...' : 'Unsubscribe'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeContent />
    </Suspense>
  )
}
