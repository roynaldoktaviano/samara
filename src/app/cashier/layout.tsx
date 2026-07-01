import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Samara Cashier',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Samara Cashier',
  },
}

export const viewport: Viewport = {
  themeColor: '#bdac7e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  return children
}
