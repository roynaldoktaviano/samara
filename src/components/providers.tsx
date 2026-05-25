'use client'

import { SessionProvider } from 'next-auth/react'
import { PageTransitionProvider } from './PageTransitionOverlay'
import { SessionWatcher } from './SessionWatcher'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={5 * 60}      // cek validitas session tiap 5 menit
      refetchOnWindowFocus={true}   // cek ulang saat tab aktif kembali
    >
      <PageTransitionProvider>
        {children}
      </PageTransitionProvider>
      <SessionWatcher />
    </SessionProvider>
  )
}
