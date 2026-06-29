'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { usePageTransition } from '@/components/PageTransitionOverlay'
import { getTenantBranding } from '@/lib/tenant-branding'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, SidebarTrigger } from '@/components/ui/sidebar'
import { Anchor, Calendar, Users, LogOut, ChevronDown, Ship, UserCog, CreditCard, Bell, CheckCheck, Clock, CheckCircle2, XCircle, Briefcase, Tag, Shield, TrendingUp, TrendingDown, Building2, Settings, UserPen, Eye, EyeOff, ShoppingCart, ClipboardList, Boxes, ArrowRightLeft, Package, MapPin } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import Dashboard from '@/components/dashboard/Dashboard'
import Yachts from '@/components/yachts/Yachts'
import Bookings from '@/components/bookings/Bookings'
import Customers from '@/components/customers/Customers'
import CalendarView from '@/components/calendar/CalendarViewFixed'
import Expenses from '@/components/expenses/Expenses'
import Maintenance from '@/components/maintenance/Maintenance'
import OpenTrips from '@/components/open-trips/OpenTrips'
import UsersPage from '@/components/users/Users'
import Payments from '@/components/payments/Payments'
import Agents from '@/components/agents/Agents'
import Vouchers from '@/components/vouchers/Vouchers'
import ActivityLog from '@/components/activity/ActivityLog'
import Statistics from '@/components/statistics/Statistics'
import SalesStats from '@/components/statistics/SalesStats'
import PurchasingOverview from '@/components/purchasing/PurchasingOverview'
import PurchasingItemsPage from '@/components/purchasing/items/ItemsPage'
import PurchasingLocationsPage from '@/components/purchasing/locations/LocationsPage'
import PurchasingRequestsPage from '@/components/purchasing/RequestsAndOrders'
import PurchasingStockPage from '@/components/purchasing/stock/StockPage'
import PurchasingTransfersPage from '@/components/purchasing/transfers/TransfersPage'
import PurchasingExceptionsPage from '@/components/purchasing/exceptions/ExceptionsPage'
import PurchasingReportsPage from '@/components/purchasing/reports/ReportsPage'
import PurchasingWithdrawalsPage from '@/components/purchasing/reports/WithdrawalsPage'
import PurchasingStockCountsPage from '@/components/purchasing/stock-counts/StockCountsPage'
import PurchasingSuppliersPage from '@/components/purchasing/suppliers/SuppliersPage'
import Banks from '@/components/banks/Banks'
import TncPdfSettings from '@/components/settings/TncPdfSettings'
import ResetBookingCounter from '@/components/settings/ResetBookingCounter'
import CompanySettings from '@/components/settings/CompanySettings'
import FinanceStats from '@/components/statistics/FinanceStats'
import FinanceRevenueTable from '@/components/statistics/FinanceRevenueTable'
import SalesPerformanceTable from '@/components/statistics/SalesPerformanceTable'

const FINANCE_TABS = [
  { key: 'summary',           label: 'Revenue Summary'   },
  { key: 'overview',          label: 'Finance Overview'  },
  { key: 'sales-performance', label: 'Sales Performance' },
] as const
type FinanceTab = typeof FINANCE_TABS[number]['key']

function FinanceTabView() {
  const [tab, setTab] = useState<FinanceTab>('summary')
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        {FINANCE_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-[#1a5f6e] text-[#1a5f6e]' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'summary'           && <FinanceRevenueTable />}
      {tab === 'overview'          && <FinanceStats />}
      {tab === 'sales-performance' && <SalesPerformanceTable />}
    </div>
  )
}

type View = 'dashboard' | 'statistics' | 'sales-stats' | 'finance-stats' | 'yachts' | 'bookings' | 'customers' | 'calendar' | 'expenses' | 'maintenance' | 'open-trips' | 'users' | 'payments' | 'agents' | 'vouchers' | 'activity-log' | 'banks' | 'settings' | 'purchasing-overview' | 'purchasing-requests' | 'purchasing-stock' | 'purchasing-transfers' | 'purchasing-items' | 'purchasing-locations' | 'purchasing-stock-counts' | 'purchasing-exceptions' | 'purchasing-reports' | 'purchasing-suppliers' | 'purchasing-withdrawals'

type NavItem = {
  id: View
  label: string
  icon: React.ElementType
  roles: string[]
  group: string
  feature?: string  // tenant feature flag required to show this item
}

const NAV_GROUPS = [
  { key: 'main',       label: 'Main'       },
  { key: 'operations', label: 'Operations' },
  { key: 'finance',    label: 'Finance'    },
  { key: 'statistics', label: 'Statistics' },
  { key: 'marketing',  label: 'Marketing'  },
  { key: 'management', label: 'Management' },
  { key: 'purchasing', label: 'Purchasing & Inventory' },
]

const navigationItems: NavItem[] = [
  { id: 'calendar',      label: 'Dashboard',      icon: Calendar,   roles: ['ADMIN', 'SALES', 'FINANCE', 'MARKETING'], group: 'main'       },
  { id: 'bookings',      label: 'Bookings',        icon: Calendar,   roles: ['ADMIN', 'SALES'],                         group: 'operations' },
  { id: 'open-trips',    label: 'Open Trips',      icon: Ship,       roles: ['ADMIN', 'MARKETING'],                     group: 'operations' },
  { id: 'customers',     label: 'Guests',          icon: Users,      roles: ['ADMIN', 'SALES', 'MARKETING'],            group: 'operations' },
  { id: 'yachts',        label: 'Yachts',          icon: Anchor,     roles: ['ADMIN'],                                  group: 'operations' },
  { id: 'payments',      label: 'Payments',        icon: CreditCard, roles: ['ADMIN', 'FINANCE'],                       group: 'finance'    },
  { id: 'banks',         label: 'Bank Accounts',   icon: Building2,  roles: ['ADMIN', 'FINANCE'],                       group: 'finance'    },
  { id: 'statistics',    label: 'Overview',        icon: TrendingUp, roles: ['ADMIN'],                                  group: 'statistics' },
  { id: 'finance-stats', label: 'Finance Stats',   icon: TrendingUp, roles: ['ADMIN', 'FINANCE'],                       group: 'statistics' },
  { id: 'sales-stats',   label: 'Sales Stats',     icon: TrendingUp, roles: ['ADMIN', 'SALES'],                         group: 'statistics' },
  { id: 'agents',        label: 'Agents',          icon: Briefcase,  roles: ['ADMIN', 'SALES'],                         group: 'marketing'  },
  { id: 'vouchers',      label: 'Vouchers',        icon: Tag,        roles: ['ADMIN'],                                  group: 'marketing'  },
  { id: 'users',         label: 'Team',            icon: UserCog,    roles: ['ADMIN'],                                  group: 'management' },
  { id: 'activity-log',  label: 'Activity Log',    icon: Shield,     roles: ['ADMIN'],                                  group: 'management' },
  { id: 'settings',      label: 'Settings',        icon: Settings,   roles: ['ADMIN', 'SUPER_ADMIN'],                   group: 'management' },
  { id: 'purchasing-overview',   label: 'Purchasing',        icon: ShoppingCart,   roles: ['ADMIN', 'PURCHASING'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-requests',  label: 'Requests & POs',    icon: ClipboardList,  roles: ['ADMIN', 'PURCHASING', 'WAREHOUSE'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-stock',     label: 'Stock by Location', icon: Boxes,          roles: ['ADMIN', 'PURCHASING', 'WAREHOUSE'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-transfers', label: 'Transfers',          icon: ArrowRightLeft, roles: ['ADMIN', 'PURCHASING', 'WAREHOUSE'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-items',        label: 'Items & Pricing',  icon: Package,     roles: ['ADMIN', 'PURCHASING'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-locations',    label: 'Locations',        icon: MapPin,      roles: ['ADMIN', 'PURCHASING'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-stock-counts', label: 'Stock Counts',     icon: Shield,      roles: ['ADMIN', 'PURCHASING', 'WAREHOUSE'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-suppliers',     label: 'Suppliers',        icon: Building2,   roles: ['ADMIN', 'PURCHASING'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-exceptions',   label: 'Exceptions',        icon: Bell,        roles: ['ADMIN', 'PURCHASING'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-withdrawals',  label: 'Withdrawal Report', icon: TrendingDown, roles: ['ADMIN', 'PURCHASING', 'WAREHOUSE'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-reports',      label: 'Reports',           icon: TrendingUp,  roles: ['ADMIN', 'PURCHASING'], group: 'purchasing', feature: 'purchasing' },
]

const roleBadgeColor: Record<string, string> = {
  ADMIN:      'bg-purple-100 text-purple-700',
  SALES:      'bg-blue-100 text-blue-700',
  FINANCE:    'bg-emerald-100 text-emerald-700',
  MARKETING:  'bg-orange-100 text-orange-700',
  PURCHASING: 'bg-amber-100 text-amber-700',
  WAREHOUSE:  'bg-teal-100 text-teal-700',
}

const roleLabel: Record<string, string> = {
  ADMIN:      'Admin',
  SALES:      'Sales',
  FINANCE:    'Finance',
  MARKETING:  'Marketing',
  PURCHASING: 'Purchasing',
  WAREHOUSE:  'Warehouse',
}

interface Notification {
  id: string
  type: string
  title: string
  body: string
  isRead: boolean
  paymentId: string | null
  bookingId: string | null
  orderId: string | null
  createdAt: string
}

const NOTIF_ICON: Record<string, React.ElementType> = {
  PAYMENT_SUBMITTED:      Clock,
  PAYMENT_CONFIRMED:      CheckCircle2,
  PAYMENT_REJECTED:       XCircle,
  INVOICE_READY:          CreditCard,
  DEPOSIT_DUE_H2:         Bell,
  DEPOSIT_DUE_H1:         Bell,
  DEPOSIT_DUE_H0:         Bell,
  PO_ORDERED:             ShoppingCart,
  PO_IN_TRANSIT:          ArrowRightLeft,
  PO_RECEIVED:            CheckCircle2,
  PO_PARTIALLY_RECEIVED:  CheckCircle2,
}
const NOTIF_COLOR: Record<string, string> = {
  PAYMENT_SUBMITTED: 'text-amber-600',
  PAYMENT_CONFIRMED: 'text-green-600',
  PAYMENT_REJECTED:  'text-red-600',
  INVOICE_READY:     'text-violet-600',
  DEPOSIT_DUE_H2:    'text-amber-500',
  DEPOSIT_DUE_H1:    'text-orange-500',
  DEPOSIT_DUE_H0:    'text-red-600',
}

function fmtRelative(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const min  = Math.floor(diff / 60000)
  if (min < 1)   return 'Just now'
  if (min < 60)  return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24)   return `${hr} hr ago`
  return `${Math.floor(hr / 24)} days ago`
}

function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx();
    ([
      [880, 0,    0.5],
      [659, 0.18, 0.5],
    ] as [number, number, number][]).forEach(([freq, delay, dur]) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + delay)
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + delay + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + dur + 0.05)
    })
  } catch { /* AudioContext not supported */ }
}

function PurchasingComingSoon({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-sm mt-1">{desc}</p>
      </div>
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        <ShoppingCart className="h-8 w-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">Segera hadir</p>
        <p className="text-xs mt-1">Fitur ini sedang dalam pengembangan</p>
      </div>
    </div>
  )
}

const dropdownVariants = {
  hidden:  { opacity: 0, scale: 0.95, y: -6 },
  visible: { opacity: 1, scale: 1,    y: 0  },
}

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0  },
  exit:    { opacity: 0, y: -6 },
}

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { trigger: triggerTransition } = usePageTransition()
  const [currentView, setCurrentView] = useState<View>('calendar')
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [profileOpen, setProfileOpen]   = useState(false)
  const [profileName, setProfileName]   = useState('')
  const [profileCurPw, setProfileCurPw] = useState('')
  const [profileNewPw, setProfileNewPw] = useState('')
  const [profileConfPw, setProfileConfPw] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [showCurPw, setShowCurPw]       = useState(false)
  const [showNewPw, setShowNewPw]       = useState(false)
  const [sidebarDefaultOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : true
  )

  // ── Notifications ──────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [pendingPayments, setPendingPayments] = useState(0)
  const [bellShake, setBellShake] = useState(false)
  const notifRef    = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const prevUnread  = useRef(-1) // -1 = not yet initialised

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data: Notification[] = await res.json()
      setNotifications(data)

      const newCount = data.filter(n => !n.isRead).length

      // Only fire sound + toast when truly new notifications arrive (not on first load)
      if (prevUnread.current >= 0 && newCount > prevUnread.current) {
        playChime()
        setBellShake(true)
        setTimeout(() => setBellShake(false), 700)

        // Show a toast for each new unread notification
        const newOnes = data.filter(n => !n.isRead).slice(0, newCount - prevUnread.current)
        newOnes.slice(0, 3).forEach(n => {
          if (n.type === 'PAYMENT_CONFIRMED')          toast.success(n.title, { description: n.body })
          else if (n.type === 'PAYMENT_REJECTED')      toast.error(n.title,   { description: n.body })
          else if (n.type === 'DEPOSIT_DUE_H0')        toast.error(n.title,   { description: n.body })
          else if (n.type === 'DEPOSIT_DUE_H1')        toast.warning(n.title, { description: n.body })
          else                                          toast.info(n.title,    { description: n.body })
        })
      }

      prevUnread.current = newCount
    } catch { /* silent */ }
  }, [])

  const generateReminders = useCallback(async () => {
    try {
      await fetch('/api/notifications/reminders', { method: 'POST' })
    } catch { /* silent */ }
  }, [])

  const [pendingRefunds, setPendingRefunds] = useState(0)

  const fetchPendingPayments = useCallback(async () => {
    try {
      const res = await fetch('/api/payments')
      if (res.ok) {
        const data = await res.json()
        setPendingPayments(data.filter((p: { status: string }) => p.status === 'pending_confirmation' || p.status === 'requested').length)
      }
    } catch { /* silent */ }
  }, [])

  const fetchPendingRefunds = useCallback(async () => {
    try {
      const role = (session?.user as { role?: string })?.role ?? ''
      const financeRoles = ['FINANCE', 'ADMIN', 'SUPER_ADMIN']
      const view = financeRoles.includes(role) ? 'finance' : 'sales'
      const res = await fetch(`/api/bookings/pending-refund?view=${view}`)
      if (res.ok) {
        const data = await res.json()
        setPendingRefunds(Array.isArray(data) ? data.length : 0)
      }
    } catch { /* silent */ }
  }, [session])

  useEffect(() => {
    if (!session) return
    const refresh = () => { fetchNotifications(); fetchPendingPayments(); fetchPendingRefunds() }
    const interval = setInterval(refresh, 30000)
    refresh()
    return () => clearInterval(interval)
  }, [session, fetchNotifications, fetchPendingPayments, fetchPendingRefunds])

  // Generate deposit-due reminders on mount, then every 5 minutes
  // fetchNotifications is called inside the async fn (not synchronously in effect body)
  useEffect(() => {
    if (!session) return
    async function run() {
      await generateReminders()
      fetchNotifications()
    }
    run()
    const interval = setInterval(run, 300_000)
    return () => clearInterval(interval)
  }, [session, generateReminders, fetchNotifications])

  // Immediate refresh when a payment action fires
  useEffect(() => {
    const handler = () => { fetchNotifications(); fetchPendingPayments() }
    window.addEventListener('payment-updated', handler)
    return () => window.removeEventListener('payment-updated', handler)
  }, [fetchNotifications, fetchPendingPayments])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unreadCount = notifications.filter(n => !n.isRead).length

  const markAllRead = async () => {
    await fetch('/api/notifications', { method: 'PATCH' })
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
  }

  const markOneRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
  }

  const openProfileDialog = () => {
    setProfileName(session?.user?.name ?? '')
    setProfileCurPw('')
    setProfileNewPw('')
    setProfileConfPw('')
    setShowCurPw(false)
    setShowNewPw(false)
    setShowUserMenu(false)
    setProfileOpen(true)
  }

  const handleProfileSave = async () => {
    const trimName = profileName.trim()
    if (!trimName) { toast.error('Name cannot be empty'); return }
    if (profileNewPw && profileNewPw !== profileConfPw) { toast.error('New passwords do not match'); return }
    if (profileNewPw && profileNewPw.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (profileNewPw && !profileCurPw) { toast.error('Enter your current password to change it'); return }
    setProfileSaving(true)
    try {
      const body: Record<string, string> = { name: trimName }
      if (profileNewPw) { body.currentPassword = profileCurPw; body.newPassword = profileNewPw }
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to update profile'); return }
      toast.success('Profile updated')
      setProfileOpen(false)
    } catch {
      toast.error('Failed to update profile')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleNotifClick = (n: Notification) => {
    markOneRead(n.id)
    setNotifOpen(false)
    if (n.orderId || n.type.startsWith('PO_')) {
      setCurrentView('purchasing-requests')
    } else if (n.paymentId && isFinance) {
      setCurrentView('payments')
    } else if (n.bookingId || n.paymentId || n.type.startsWith('DEPOSIT_DUE')) {
      setCurrentView('bookings')
    }
  }

  // ── Auth guard ─────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4"
        >
          <motion.div
            initial={{ rotate: 0 }}
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            className="w-9 h-9 border-[3px] border-[#bdac7e] border-t-transparent rounded-full"
          />
          <p className="text-sm text-muted-foreground tracking-wide">Loading…</p>
        </motion.div>
      </div>
    )
  }

  if (!session) {
    router.push('/login')
    return null
  }

  const branding = getTenantBranding(session.user.tenantSlug)

  const userRole = session.user.role
  const isAdmin   = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN'
  const isFinance = userRole === 'FINANCE' || userRole === 'ADMIN'
  const tenantFeatures = (session.user as { tenantFeatures?: Record<string, boolean> }).tenantFeatures ?? {}
  const visibleNavItems = navigationItems.filter((item) =>
    item.roles.includes(userRole) &&
    (!item.feature || tenantFeatures[item.feature] === true)
  )

  const invoiceReadyCount = !isFinance
    ? notifications.filter(n => !n.isRead && n.type === 'INVOICE_READY').length
    : 0

  const markInvoiceReadyAsRead = () => {
    const unreadInvoiceReady = notifications.filter(n => !n.isRead && n.type === 'INVOICE_READY')
    if (!unreadInvoiceReady.length) return
    unreadInvoiceReady.forEach(n => fetch(`/api/notifications/${n.id}`, { method: 'PATCH' }).catch(() => {}))
    setNotifications(prev => prev.map(n => n.type === 'INVOICE_READY' ? { ...n, isRead: true } : n))
  }

  const isCurrentViewAllowed = visibleNavItems.some((item) => item.id === currentView)
  const activeView = isCurrentViewAllowed ? currentView : visibleNavItems[0]?.id ?? 'calendar'


  const renderView = () => {
    switch (activeView) {
      case 'dashboard':    return <Dashboard />
      case 'yachts':       return <Yachts />
      case 'bookings':     return <Bookings />
      case 'customers':    return <Customers />
      case 'calendar':     return <CalendarView />
      case 'open-trips':   return <OpenTrips />
      case 'expenses':     return <Expenses />
      case 'maintenance':  return <Maintenance />
      case 'users':        return <UsersPage />
      case 'payments':     return <Payments />
      case 'agents':       return <Agents />
      case 'banks':         return <Banks />
      case 'vouchers':      return <Vouchers />
      case 'activity-log':   return <ActivityLog />
      case 'statistics':     return <Statistics />
      case 'finance-stats':  return <FinanceTabView />
      case 'sales-stats':    return <SalesStats />
      case 'purchasing-overview':   return <PurchasingOverview />
      case 'purchasing-requests':  return <PurchasingRequestsPage />
      case 'purchasing-items':     return <PurchasingItemsPage />
      case 'purchasing-locations': return <PurchasingLocationsPage />
      case 'purchasing-stock':     return <PurchasingStockPage />
      case 'purchasing-transfers':    return <PurchasingTransfersPage />
      case 'purchasing-stock-counts': return <PurchasingStockCountsPage />
      case 'purchasing-suppliers':    return <PurchasingSuppliersPage />
      case 'purchasing-exceptions':   return <PurchasingExceptionsPage />
      case 'purchasing-withdrawals':  return <PurchasingWithdrawalsPage />
      case 'purchasing-reports':      return <PurchasingReportsPage />
      case 'settings':      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-2xl font-bold tracking-tight">Settings</h3>
            <p className="text-muted-foreground text-sm">Konfigurasi sistem</p>
          </div>
          <CompanySettings />
          <TncPdfSettings />
          <ResetBookingCounter />
        </div>
      )
      default:              return <CalendarView />
    }
  }

  return (
    <>
    {branding.primaryColor && (
      <style>{`
        /* ── Sidebar ── */
        [data-sidebar="sidebar"] {
          background-color: ${branding.sidebarBg} !important;
        }
        [data-sidebar="sidebar"] button,
        [data-sidebar="sidebar"] a,
        [data-sidebar="sidebar"] span {
          color: rgba(255,255,255,0.82) !important;
        }
        [data-sidebar="group-label"] {
          color: rgba(255,255,255,0.48) !important;
        }
        [data-sidebar="sidebar"] p {
          color: rgba(255,255,255,0.45) !important;
        }
        [data-sidebar="sidebar"] button[data-active="true"],
        [data-sidebar="sidebar"] button[data-active="true"] span {
          background-color: rgba(255,255,255,0.18) !important;
          color: #ffffff !important;
        }
        [data-sidebar="sidebar"] button:hover {
          background-color: rgba(255,255,255,0.12) !important;
          color: #ffffff !important;
        }
        [data-sidebar="sidebar"] button:hover span { color: #ffffff !important; }
        [data-sidebar="sidebar"] svg { color: inherit !important; }

        /* ── Global primary color overrides ── */
        [data-tenant="siloina"] {
          --brand-primary: ${branding.primaryColor};
          --brand-primary-hover: ${branding.primaryHover};
        }
        [data-tenant="siloina"] [class*="1a5f6e"] {
          --_c: ${branding.primaryColor};
        }
        [data-tenant="siloina"] [class*="bg-"][class*="1a5f6e"] {
          background-color: ${branding.primaryColor} !important;
        }
        [data-tenant="siloina"] [class*="bg-"][class*="145260"],
        [data-tenant="siloina"] [class*="bg-"][class*="1a5f6e"]:hover {
          background-color: ${branding.primaryHover} !important;
        }
        [data-tenant="siloina"] [class*="text-"][class*="1a5f6e"] {
          color: ${branding.primaryColor} !important;
        }
        [data-tenant="siloina"] [class*="text-"][class*="1a5f6e"]:hover {
          color: ${branding.primaryColor} !important;
        }
        [data-tenant="siloina"] [class*="border-"][class*="1a5f6e"] {
          border-color: ${branding.primaryColor} !important;
        }
        [data-tenant="siloina"] [stroke="#1a5f6e"] {
          stroke: ${branding.primaryColor} !important;
        }
        [data-tenant="siloina"] [class*="ring-"][class*="1a5f6e"],
        [data-tenant="siloina"] [class*="1a5f6e\/"] {
          --tw-ring-color: ${branding.primaryColor}33 !important;
        }
      `}</style>
    )}
    <SidebarProvider defaultOpen={sidebarDefaultOpen}>
      <div className="flex min-h-screen bg-background w-full" data-tenant={session.user.tenantSlug ?? 'samara'}>
        <Sidebar>
          <SidebarHeader className="p-4 border-b" style={branding.sidebarBg ? { borderColor: 'rgba(255,255,255,0.18)' } : undefined}>
            <div className="flex items-center gap-3">
              <img
                src={branding.logoUrl}
                alt={branding.name}
                className="h-12 w-auto object-contain"
              />
            </div>
          </SidebarHeader>

          <SidebarContent>
            {(() => {
              const renderItems = (items: NavItem[]) => items.map((item) => {
                const Icon = item.icon
                const showDot =
                  (item.id === 'payments' && isFinance && (pendingPayments + pendingRefunds) > 0) ||
                  (item.id === 'bookings' && !isFinance && (invoiceReadyCount + pendingRefunds) > 0)
                const dotCount =
                  item.id === 'payments' && isFinance ? pendingPayments + pendingRefunds :
                  item.id === 'bookings' && !isFinance ? invoiceReadyCount + pendingRefunds :
                  0
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      onClick={() => {
                        setCurrentView(item.id)
                        if (item.id === 'bookings') markInvoiceReadyAsRead()
                      }}
                      isActive={activeView === item.id}
                    >
                      <div className="relative shrink-0">
                        <Icon className="h-4 w-4" />
                        <AnimatePresence>
                          {showDot && (
                            <motion.span
                              key={dotCount}
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                              className="absolute -top-1.5 -right-1.5 min-w-3.5 h-3.5 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none"
                            >
                              {dotCount > 9 ? '9+' : dotCount}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })

              if (isAdmin) {
                return NAV_GROUPS.map(group => {
                  const groupItems = visibleNavItems.filter(i => i.group === group.key)
                  if (!groupItems.length) return null
                  return (
                    <SidebarGroup key={group.key}>
                      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                      <SidebarMenu>{renderItems(groupItems)}</SidebarMenu>
                    </SidebarGroup>
                  )
                })
              }

              return (
                <SidebarGroup>
                  <SidebarGroupLabel>Menu</SidebarGroupLabel>
                  <SidebarMenu>{renderItems(visibleNavItems)}</SidebarMenu>
                </SidebarGroup>
              )
            })()}
          </SidebarContent>

          <SidebarFooter className="px-4 py-3 border-t" style={branding.sidebarBg ? { borderColor: 'rgba(255,255,255,0.18)' } : undefined}>
            <p className="text-[10.5px] text-center" style={branding.sidebarBg ? { color: 'rgba(255,255,255,0.45)' } : undefined}>
              © 2026 {branding.name}.
            </p>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex h-12 items-center border-b bg-background/95 backdrop-blur-sm px-3 xl:px-4">
            <SidebarTrigger className="h-8 w-8 shrink-0" />
            <div className="flex-1" />

            <div className="flex items-center gap-3">

              {/* ── Notification Bell ── */}
              <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(v => !v)}
                className="relative p-2.5 rounded-full hover:bg-muted transition-colors"
              >
                <motion.div
                  initial={{ rotate: 0 }}
                  animate={bellShake ? { rotate: [0, -22, 22, -14, 14, -6, 6, 0] } : { rotate: 0 }}
                  transition={{ duration: 0.65, ease: 'easeInOut' }}
                >
                  <Bell className="h-5 w-5 text-muted-foreground" />
                </motion.div>

                <AnimatePresence>
                  {unreadCount > 0 && (
                    <motion.span
                      key={unreadCount}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                      className="absolute top-1 right-1 min-w-4 h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none"
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>

              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    variants={dropdownVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    style={{ transformOrigin: 'top right' }}
                    className="absolute right-0 top-full mt-2 w-[calc(100vw-1rem)] sm:w-80 max-w-sm rounded-xl border bg-background shadow-xl z-50 overflow-hidden"
                  >
                    {/* Dropdown header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                      <span className="font-semibold text-sm">Notifications</span>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllRead}
                          className="flex items-center gap-1 text-xs text-[#1a5f6e] hover:underline"
                        >
                          <CheckCheck className="h-3 w-3" />
                          Mark all as read
                        </button>
                      )}
                    </div>

                    {/* Notification list */}
                    <div className="max-h-80 overflow-y-auto divide-y">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No notifications
                        </div>
                      ) : notifications.slice(0, 20).map((n, i) => {
                        const Icon  = NOTIF_ICON[n.type]  ?? Bell
                        const color = NOTIF_COLOR[n.type] ?? 'text-muted-foreground'
                        return (
                          <motion.button
                            key={n.id}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03, duration: 0.18 }}
                            onClick={() => handleNotifClick(n)}
                            className={[
                              'w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-start gap-3',
                              !n.isRead ? 'bg-blue-50/50 dark:bg-blue-950/20' : '',
                            ].join(' ')}
                          >
                            <div className={`mt-0.5 shrink-0 ${color}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-semibold ${!n.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {n.title}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                              <p className="text-[10px] text-muted-foreground/70 mt-1" suppressHydrationWarning>{fmtRelative(n.createdAt)}</p>
                            </div>
                            {!n.isRead && (
                              <span className="shrink-0 mt-1.5 w-2 h-2 rounded-full bg-blue-500" />
                            )}
                          </motion.button>
                        )
                      })}
                    </div>

                    {/* Footer */}
                    <div className="border-t px-4 py-2 bg-muted/20 flex gap-3 justify-center">
                      {notifications.some(n => n.type.startsWith('DEPOSIT_DUE')) && (
                        <button
                          onClick={() => { setCurrentView('bookings'); setNotifOpen(false) }}
                          className="text-xs text-[#bdac7e] hover:underline"
                        >
                          View bookings →
                        </button>
                      )}
                      {isFinance && (
                        <button
                          onClick={() => { setCurrentView('payments'); setNotifOpen(false) }}
                          className="text-xs text-[#1a5f6e] hover:underline"
                        >
                          View payments →
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              </div>

              {/* ── Separator ── */}
              <div className="h-6 w-px bg-border" />

              {/* ── User Menu ── */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(v => !v)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a5f6e] text-white text-sm font-semibold uppercase">
                    {session.user.name?.charAt(0) ?? session.user.email?.charAt(0) ?? 'U'}
                  </div>
                  <div className="text-left hidden sm:block min-w-18">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold leading-none mb-1 ${roleBadgeColor[userRole] ?? 'bg-gray-100 text-gray-600'}`}>
                      {roleLabel[userRole] ?? userRole}
                    </span>
                    <p className="text-sm font-medium text-foreground leading-none">
                      {session.user.name ?? session.user.email}
                    </p>
                  </div>
                  <motion.div animate={{ rotate: showUserMenu ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      variants={dropdownVariants}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      style={{ transformOrigin: 'top right' }}
                      className="absolute right-0 top-full mt-1 w-48 rounded-md border bg-background shadow-md z-50 overflow-hidden"
                    >
                      <button
                        onClick={openProfileDialog}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        <UserPen className="h-4 w-4 text-muted-foreground" />
                        Edit Profile
                      </button>
                      <div className="border-t mx-2" />
                      <button
                        onClick={() => triggerTransition(() => signOut({ callbackUrl: '/login' }), 900, branding)}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>
          </header>

          <div className="p-3 sm:p-4 xl:p-6 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </SidebarProvider>

    {/* ── Edit Profile Dialog ── */}
    <Dialog open={profileOpen} onOpenChange={v => { if (!v) setProfileOpen(false) }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={profileName}
              onChange={e => setProfileName(e.target.value)}
              disabled={profileSaving}
              placeholder="Your name"
            />
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Change Password <span className="font-normal normal-case">(optional)</span></p>

            {/* Current password */}
            <div className="space-y-1.5">
              <Label htmlFor="profile-cur-pw">Current Password</Label>
              <div className="relative">
                <Input
                  id="profile-cur-pw"
                  type={showCurPw ? 'text' : 'password'}
                  value={profileCurPw}
                  onChange={e => setProfileCurPw(e.target.value)}
                  disabled={profileSaving}
                  placeholder="••••••••"
                  className="pr-9"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCurPw(v => !v)}
                  tabIndex={-1}
                >
                  {showCurPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div className="space-y-1.5">
              <Label htmlFor="profile-new-pw">New Password</Label>
              <div className="relative">
                <Input
                  id="profile-new-pw"
                  type={showNewPw ? 'text' : 'password'}
                  value={profileNewPw}
                  onChange={e => setProfileNewPw(e.target.value)}
                  disabled={profileSaving}
                  placeholder="Min. 6 characters"
                  className="pr-9"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNewPw(v => !v)}
                  tabIndex={-1}
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm new password */}
            <div className="space-y-1.5">
              <Label htmlFor="profile-conf-pw">Confirm New Password</Label>
              <Input
                id="profile-conf-pw"
                type="password"
                value={profileConfPw}
                onChange={e => setProfileConfPw(e.target.value)}
                disabled={profileSaving}
                placeholder="Repeat new password"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setProfileOpen(false)} disabled={profileSaving}>
            Cancel
          </Button>
          <Button onClick={handleProfileSave} disabled={profileSaving}>
            {profileSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
