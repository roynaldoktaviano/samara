'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'

const RequestsPage = dynamic(() => import('./requests/RequestsPage'), { loading: () => <p className="text-sm text-muted-foreground py-8">Memuat...</p> })
const OrdersPage   = dynamic(() => import('./orders/OrdersPage'),   { loading: () => <p className="text-sm text-muted-foreground py-8">Memuat...</p> })

const TABS = [
  { key: 'requests', label: 'Purchase Requests' },
  { key: 'orders',   label: 'Purchase Orders'   },
] as const

type Tab = typeof TABS[number]['key']

export default function RequestsAndOrders() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''
  const isWarehouse = role === 'WAREHOUSE'

  const [tab, setTab] = useState<Tab>(isWarehouse ? 'orders' : 'requests')

  const visibleTabs = isWarehouse ? TABS.filter(t => t.key === 'orders') : TABS

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{isWarehouse ? 'Purchase Orders' : 'Requests & POs'}</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {isWarehouse ? 'Daftar PO yang perlu diterima' : 'Purchase request dan purchase order ke supplier'}
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
      {tab === 'requests' ? <RequestsPage /> : <OrdersPage warehouseView={isWarehouse} />}
    </div>
  )
}
