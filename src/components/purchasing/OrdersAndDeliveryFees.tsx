'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'

const OrdersPage   = dynamic(() => import('./orders/OrdersPage'),   { loading: () => <p className="text-sm text-muted-foreground py-8">Memuat...</p> })
const DeliveryFeesPage = dynamic(() => import('./delivery-fees/DeliveryFeesPage'), { loading: () => <p className="text-sm text-muted-foreground py-8">Memuat...</p> })

const TABS = [
  { key: 'orders',        label: 'Purchase Orders' },
  { key: 'delivery-fees', label: 'Delivery Fees'   },
] as const

type Tab = typeof TABS[number]['key']

// openPoId lets another page (e.g. Item by Location, via page.tsx) deep-link
// straight into a specific PO's detail view — there's no URL-based routing
// anywhere in this app, so this is plain prop-drilling: page.tsx holds the
// pending id, forces this tab to 'orders', and OrdersPage opens it and reports
// back via onOpenPoHandled so the same id doesn't re-trigger on next render.
export default function OrdersAndDeliveryFees({ openPoId, onOpenPoHandled }: { openPoId?: string | null; onOpenPoHandled?: () => void } = {}) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''
  // Warehouse, plus the two yacht-scoped viewer roles, all get the same read-only,
  // single-tab view — the actual scoping of which POs they see happens server-side
  // (GET /api/purchasing/orders), this just matches the surrounding UI to that.
  const isWarehouse = ['WAREHOUSE', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR'].includes(role)

  const [tab, setTab] = useState<Tab>('orders')

  useEffect(() => { if (openPoId) setTab('orders') }, [openPoId])

  const visibleTabs = isWarehouse ? TABS.filter(t => t.key === 'orders') : TABS

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Purchase Orders</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {isWarehouse ? 'Daftar PO yang perlu diterima' : 'Purchase order dan delivery fee ke supplier'}
        </p>
      </div>
      {!isWarehouse && (
        <div className="flex gap-1 border-b">
          {visibleTabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-amber-500 text-amber-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {tab === 'orders' ? <OrdersPage warehouseView={isWarehouse} openPoId={openPoId} onOpenPoHandled={onOpenPoHandled} /> : <DeliveryFeesPage />}
    </div>
  )
}
