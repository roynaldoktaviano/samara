'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { usePathname } from 'next/navigation'
import { PageTransitionProvider } from './PageTransitionOverlay'
import { SessionWatcher } from './SessionWatcher'
import { ConfirmProvider } from './ui/confirm-dialog'

// Dark mode is only supported inside the ERP shell ('/'). Print documents, public
// guest/agent pages, cashier and login stay light.
const THEMED_PATHS = new Set(['/'])

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      forcedTheme={THEMED_PATHS.has(pathname) ? undefined : 'light'}
    >
      <SessionProvider
        refetchInterval={5 * 60}      // cek validitas session tiap 5 menit
        refetchOnWindowFocus={true}   // cek ulang saat tab aktif kembali
      >
        <PageTransitionProvider>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </PageTransitionProvider>
        <SessionWatcher />
      </SessionProvider>
    </ThemeProvider>
  )
}
