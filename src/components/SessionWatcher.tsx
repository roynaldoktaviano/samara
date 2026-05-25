'use client'

import { useSession, signOut } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'

export function SessionWatcher() {
  const { status } = useSession()
  const wasAuthenticated = useRef(false)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') {
      wasAuthenticated.current = true
    }
    if (status === 'unauthenticated' && wasAuthenticated.current) {
      setExpired(true)
    }
  }, [status])

  if (!expired) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-2xl mx-4 overflow-hidden"
        style={{ maxWidth: 360, width: '100%' }}
      >
        {/* Header accent */}
        <div className="h-1.5 w-full" style={{ backgroundColor: '#1a5f6e' }} />

        <div className="px-6 py-6 text-center">
          {/* Icon */}
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: '#f0f9fb' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1a5f6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>

          <h2 className="text-lg font-bold text-gray-800 mb-1">Sesi Telah Berakhir</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Sesi Anda sudah habis karena tidak aktif. Silakan login kembali untuk melanjutkan.
          </p>

          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="mt-5 w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#1a5f6e' }}
          >
            Login Kembali
          </button>
        </div>
      </div>
    </div>
  )
}
