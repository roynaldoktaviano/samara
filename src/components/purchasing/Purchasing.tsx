'use client'

import { useState } from 'react'
import { ShoppingCart, Package, ArrowRightLeft, ClipboardList, MapPin, BarChart3, AlertCircle, Boxes, TrendingDown } from 'lucide-react'
import dynamic from 'next/dynamic'

const ItemsPage         = dynamic(() => import('./items/ItemsPage'),                   { loading: () => <Loading /> })
const LocationsPage     = dynamic(() => import('./locations/LocationsPage'),            { loading: () => <Loading /> })
const RequestsPage      = dynamic(() => import('./requests/RequestsPage'),              { loading: () => <Loading /> })
const WithdrawalsPage   = dynamic(() => import('./reports/WithdrawalsPage'),            { loading: () => <Loading /> })

type PurchasingView =
  | 'overview'
  | 'requests'
  | 'orders'
  | 'receiving'
  | 'transfers'
  | 'stock'
  | 'items'
  | 'locations'
  | 'reports'
  | 'withdrawals'

const NAV: { id: PurchasingView; label: string; icon: React.ElementType; description: string; built?: boolean }[] = [
  { id: 'overview',     label: 'Overview',          icon: BarChart3,     description: 'Stock & activity dashboard'          },
  { id: 'requests',     label: 'Purchase Request',   icon: ClipboardList, description: 'Item purchase requests',    built: true },
  { id: 'orders',       label: 'Purchase Order',     icon: ShoppingCart,  description: 'POs to suppliers'                    },
  { id: 'receiving',    label: 'Goods Receipt',      icon: Package,       description: 'Receive items at warehouse'          },
  { id: 'transfers',    label: 'Transfer to Vessel', icon: ArrowRightLeft,description: 'Ship items to vessel'                },
  { id: 'stock',        label: 'Warehouse Stock',    icon: Boxes,         description: 'Stock balance per item'              },
  { id: 'items',        label: 'Item Master',        icon: Package,       description: 'Catalog & item pricing',    built: true },
  { id: 'locations',    label: 'Locations',          icon: MapPin,        description: 'Warehouses & vessel locations', built: true },
  { id: 'withdrawals',  label: 'Withdrawal Report',  icon: TrendingDown,  description: 'Items withdrawn per vessel',  built: true },
  { id: 'reports',      label: 'Reports',            icon: BarChart3,     description: 'Stock movement reports'              },
]

export default function Purchasing() {
  const [view, setView] = useState<PurchasingView>('overview')
  const active = NAV.find(n => n.id === view)!

  return (
    <div className="flex h-full min-h-[600px] gap-0">
      <aside className="w-52 shrink-0 border-r bg-muted/30 flex flex-col py-3 gap-0.5">
        <div className="px-4 pb-2 mb-1 border-b">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShoppingCart className="h-4 w-4" /> Purchasing
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">& Inventory</p>
        </div>
        {NAV.map(item => {
          const Icon = item.icon
          const isActive = view === item.id
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors rounded-none w-full
                ${isActive
                  ? 'bg-amber-50 text-amber-800 font-medium border-r-2 border-amber-500'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.built && !isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
            </button>
          )
        })}
      </aside>

      <main className="flex-1 overflow-auto p-6">
        <PurchasingContent view={view} />
      </main>
    </div>
  )
}

function PurchasingContent({ view }: { view: PurchasingView }) {
  switch (view) {
    case 'overview':  return <OverviewPage />
    case 'requests':  return <RequestsPage />
    case 'items':     return <ItemsPage />
    case 'locations': return <LocationsPage />
    case 'orders':      return <ComingSoon title="Purchase Order" desc="POs to suppliers based on approved purchase requests." />
    case 'receiving':   return <ComingSoon title="Goods Receipt" desc="Warehouse admin confirms & photographs items received from suppliers." />
    case 'transfers':   return <ComingSoon title="Transfer to Vessel" desc="Ship items from warehouse to vessel." />
    case 'stock':       return <ComingSoon title="Warehouse Stock" desc="Real-time stock balance per item per location." />
    case 'withdrawals': return <WithdrawalsPage />
    case 'reports':     return <ComingSoon title="Reports" desc="Stock movement, receipt, and dispatch reports." />
    default:          return <OverviewPage />
  }
}

function OverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
        <p className="text-muted-foreground text-sm mt-1">Summary of purchasing & inventory activity</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Warehouse Stock',     value: '—', note: 'total active items'  },
          { label: 'PO Pending',          value: '—', note: 'awaiting receipt'    },
          { label: 'Transfer In Transit', value: '—', note: 'in transit'          },
          { label: 'Crew Request',        value: '—', note: 'pending action'      },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="text-2xl font-bold mt-1">{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{kpi.note}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border bg-amber-50 border-amber-200 p-4 flex gap-3">
        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-800">
          <p className="font-medium">Progress: Item Master ✓ · Locations ✓ · Purchase Request ✓</p>
          <p className="mt-0.5 text-amber-700">Next: Purchase Order → Goods Receipt → Transfer to Vessel</p>
        </div>
      </div>
    </div>
  )
}

function Loading() {
  return <div className="text-sm text-muted-foreground py-8">Loading...</div>
}

function ComingSoon({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-sm mt-1">{desc}</p>
      </div>
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        <ShoppingCart className="h-8 w-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">Coming soon</p>
        <p className="text-xs mt-1">This feature is under development</p>
      </div>
    </div>
  )
}
