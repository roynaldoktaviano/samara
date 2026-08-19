'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { usePageTransition } from '@/components/PageTransitionOverlay'
import { getTenantBranding } from '@/lib/tenant-branding'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, SidebarTrigger } from '@/components/ui/sidebar'
import { Anchor, Calendar, Users, LogOut, ChevronDown, Ship, UserCog, CreditCard, Bell, CheckCheck, Clock, CheckCircle2, XCircle, Briefcase, Tag, Shield, TrendingUp, TrendingDown, Building2, Settings, UserPen, Eye, EyeOff, ShoppingCart, ClipboardList, Boxes, ArrowRightLeft, Package, MapPin, IdCard, Wallet, Banknote, Compass, Send, LayoutTemplate, UserPlus, LayoutDashboard, Zap, PenSquare, Globe, Image, LineChart, Layers, FileText, MessageCircle, Mail } from 'lucide-react'
import { roleMatches } from '@/lib/role-utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import Dashboard from '@/components/dashboard/Dashboard'
import Yachts from '@/components/yachts/Yachts'
import Destinations from '@/components/destinations/Destinations'
import Bookings from '@/components/bookings/Bookings'
import Customers from '@/components/customers/Customers'
import Leads from '@/components/leads/Leads'
import CalendarView from '@/components/calendar/CalendarViewFixed'
import Expenses from '@/components/expenses/Expenses'
import Maintenance from '@/components/maintenance/Maintenance'
import OpenTrips from '@/components/open-trips/OpenTrips'
import UsersPage from '@/components/users/Users'
import Payments from '@/components/payments/Payments'
import TripSheet from '@/components/payments/TripSheet'
import PurchaseOrderPayments from '@/components/finance/PurchaseOrderPayments'
import POReimbursements from '@/components/finance/POReimbursements'
import AgentClawbacks from '@/components/finance/AgentClawbacks'
import DeliveryFeePayments from '@/components/finance/DeliveryFeePayments'
import DeliveryFeeReimbursements from '@/components/finance/DeliveryFeeReimbursements'
import AgentLeadsPage from '@/components/agents/AgentLeadsPage'
import Agents from '@/components/agents/Agents'
import Vouchers from '@/components/vouchers/Vouchers'
import ActivityLog from '@/components/activity/ActivityLog'
import Statistics from '@/components/statistics/Statistics'
import SalesStats from '@/components/statistics/SalesStats'
import LeadsStats from '@/components/leads/LeadsStats'
import PurchasingOverview from '@/components/purchasing/PurchasingOverview'
import PurchasingItemsPage from '@/components/purchasing/items/ItemsPage'
import PurchasingItemTypesPage from '@/components/purchasing/item-types/ItemTypesPage'
import PurchasingLocationsPage from '@/components/purchasing/locations/LocationsPage'
import PurchasingRequestsPage from '@/components/purchasing/requests/RequestsPage'
import MyApprovalsPage from '@/components/approvals/MyApprovalsPage'
import PurchasingOrdersPage from '@/components/purchasing/OrdersAndDeliveryFees'
import PurchasingStockPage from '@/components/purchasing/stock/StockPage'
import PurchasingTransfersPage from '@/components/purchasing/transfers/TransfersPage'
import PurchasingExceptionsPage from '@/components/purchasing/exceptions/ExceptionsPage'
import PurchasingReportsPage from '@/components/purchasing/reports/ReportsPage'
import PurchasingWithdrawalsPage from '@/components/purchasing/reports/WithdrawalsPage'
import PurchasingStockCountsPage from '@/components/purchasing/stock-counts/StockCountsPage'
import PurchasingSuppliersPage from '@/components/purchasing/suppliers/SuppliersPage'
import EmployeesPage from '@/components/hr/EmployeesPage'
import EmailInboxPage from '@/components/email-inbox/EmailInboxPage'
import UnifiedInbox from '@/components/chat/UnifiedInbox'
import Banks from '@/components/banks/Banks'
import TncPdfSettings from '@/components/settings/TncPdfSettings'
import ResetBookingCounter from '@/components/settings/ResetBookingCounter'
import CompanySettings from '@/components/settings/CompanySettings'
import FinanceStats from '@/components/statistics/FinanceStats'
import FinanceRevenueTable from '@/components/statistics/FinanceRevenueTable'
import SalesPerformanceTable from '@/components/statistics/SalesPerformanceTable'
import CampaignsPage from '@/components/marketing/campaigns/CampaignsPage'
import TemplatesPage from '@/components/marketing/templates/TemplatesPage'
import MediaKit from '@/components/marketing/MediaKit'

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

type View = 'dashboard' | 'my-approvals' | 'statistics' | 'sales-stats' | 'finance-stats' | 'leads-stats' | 'yachts' | 'destinations' | 'bookings' | 'customers' | 'leads' | 'calendar' | 'expenses' | 'maintenance' | 'open-trips' | 'users' | 'payments' | 'agents' | 'vouchers' | 'activity-log' | 'banks' | 'settings' | 'chat-inbox' | 'chat-email' | 'purchasing-overview' | 'purchasing-requests' | 'purchasing-orders' | 'purchasing-stock' | 'purchasing-transfers' | 'purchasing-items' | 'purchasing-item-types' | 'purchasing-locations' | 'purchasing-stock-counts' | 'purchasing-exceptions' | 'purchasing-reports' | 'purchasing-suppliers' | 'purchasing-withdrawals' | 'hr-employees' | 'finance-po-payments' | 'finance-po-reimbursements' | 'finance-delivery-fee-payments' | 'finance-delivery-fee-reimbursements' | 'finance-agent-clawback' | 'agent-leads' | 'trip-sheet' | 'marketing-campaigns' | 'marketing-templates' | 'marketing-dashboard' | 'marketing-calendar' | 'marketing-automations' | 'marketing-audiences' | 'marketing-content-studio' | 'marketing-publishing' | 'marketing-landing-pages' | 'marketing-assets' | 'marketing-performance' | 'marketing-reports' | 'marketing-settings'

type NavItem = {
  id: View
  label: string
  icon: React.ElementType
  roles: string[]
  group: string
  feature?: string  // tenant feature flag required to show this item
  subGroup?: string // optional sub-heading within a group's sidebar section (e.g. Marketing → "Create & Publish")
}

const NAV_GROUPS = [
  { key: 'main',       label: 'Main' },
  { key: 'chat',       label: 'Chat', icon: MessageCircle },
  { key: 'operations', label: 'Operations', icon: Ship },
  { key: 'finance',    label: 'Finance', icon: Wallet },
  { key: 'statistics', label: 'Statistics', icon: TrendingUp },
  { key: 'marketing',  label: 'Marketing', icon: Send },
  { key: 'management', label: 'Management', icon: Shield },
  { key: 'purchasing', label: 'Purchasing & Inventory', icon: ShoppingCart },
  { key: 'hr',         label: 'People & HR', icon: IdCard },
]

const MARKETING_SUB_GROUPS = [
  { key: 'create-publish', label: 'Create & Publish' },
  { key: 'measure',        label: 'Measure' },
]

const navigationItems: NavItem[] = [
  { id: 'calendar',      label: 'Dashboard',      icon: Calendar,   roles: ['ADMIN', 'SALES', 'FINANCE', 'MARKETING', 'HR', 'PURCHASING'], group: 'main' },
  { id: 'my-approvals',  label: 'My Approvals',  icon: CheckCircle2, roles: ['SUPER_ADMIN', 'ADMIN', 'SALES', 'FINANCE', 'MARKETING', 'HR', 'PURCHASING', 'WAREHOUSE'], group: 'main' },
  { id: 'chat-inbox',    label: 'All Chats',      icon: MessageCircle, roles: ['ADMIN', 'SALES'],                      group: 'chat' },
  { id: 'chat-email',    label: 'Email',          icon: Mail,          roles: ['ADMIN', 'SALES'],                      group: 'chat' },
  { id: 'bookings',      label: 'Bookings',        icon: Calendar,   roles: ['ADMIN', 'SALES'],                         group: 'operations' },
  { id: 'open-trips',    label: 'Open Trips',      icon: Ship,       roles: ['ADMIN', 'MARKETING'],                     group: 'operations' },
  { id: 'customers',     label: 'Guests',          icon: Users,      roles: ['ADMIN', 'SALES', 'MARKETING'],            group: 'operations' },
  { id: 'leads',         label: 'Leads',           icon: UserPlus,   roles: ['ADMIN', 'SALES', 'MARKETING'],            group: 'operations' },
  { id: 'yachts',        label: 'Yachts',          icon: Anchor,     roles: ['ADMIN'],                                  group: 'operations' },
  { id: 'destinations',  label: 'Destinations',    icon: Compass,    roles: ['ADMIN'],                                  group: 'operations' },
  { id: 'payments',      label: 'Payments',        icon: CreditCard, roles: ['ADMIN', 'FINANCE'],                       group: 'finance'    },
  { id: 'trip-sheet',    label: 'Trip Sheet',      icon: Ship,       roles: ['ADMIN', 'FINANCE', 'PURCHASING', 'HR'],   group: 'operations' },
  { id: 'banks',         label: 'Bank Accounts',   icon: Building2,  roles: ['ADMIN', 'FINANCE'],                       group: 'finance'    },
  { id: 'finance-po-payments', label: 'PO Payments', icon: Wallet,   roles: ['ADMIN', 'FINANCE'],                       group: 'finance', feature: 'purchasing' },
  { id: 'finance-po-reimbursements', label: 'Reimbursements', icon: Banknote, roles: ['ADMIN', 'FINANCE'],              group: 'finance', feature: 'purchasing' },
  { id: 'finance-delivery-fee-payments', label: 'Delivery Fee Payments', icon: Wallet,   roles: ['ADMIN', 'FINANCE'],   group: 'finance', feature: 'purchasing' },
  { id: 'finance-delivery-fee-reimbursements', label: 'Delivery Fee Reimbursements', icon: Banknote, roles: ['ADMIN', 'FINANCE'], group: 'finance', feature: 'purchasing' },
  { id: 'finance-agent-clawback', label: 'Agent Clawback', icon: Banknote, roles: ['ADMIN', 'FINANCE'], group: 'finance' },
  { id: 'statistics',    label: 'Overview',        icon: TrendingUp, roles: ['ADMIN'],                                  group: 'statistics' },
  { id: 'finance-stats', label: 'Finance Stats',   icon: TrendingUp, roles: ['ADMIN', 'FINANCE'],                       group: 'statistics' },
  { id: 'sales-stats',   label: 'Sales Stats',     icon: TrendingUp, roles: ['ADMIN', 'SALES'],                         group: 'statistics' },
  { id: 'leads-stats',   label: 'Leads Stats',     icon: TrendingUp, roles: ['ADMIN', 'SALES', 'MARKETING'],            group: 'statistics' },
  { id: 'agents',        label: 'Agents',          icon: Briefcase,  roles: ['ADMIN', 'SALES'],                         group: 'operations' },
  { id: 'agent-leads',   label: 'Agent Leads',     icon: Users,      roles: ['ADMIN', 'SALES'],                         group: 'operations' },
  { id: 'vouchers',      label: 'Vouchers',        icon: Tag,        roles: ['ADMIN'],                                  group: 'marketing'  },
  { id: 'marketing-dashboard',      label: 'Command Center',   icon: LayoutDashboard, roles: ['ADMIN', 'MARKETING'],    group: 'marketing', feature: 'marketing' },
  { id: 'marketing-campaigns',      label: 'Email Campaigns',  icon: Send,            roles: ['ADMIN', 'MARKETING'],    group: 'marketing', feature: 'marketing' },
  { id: 'marketing-calendar',       label: 'Content Calendar', icon: Calendar,        roles: ['ADMIN', 'MARKETING'],    group: 'marketing', feature: 'marketing' },
  { id: 'marketing-automations',    label: 'Automations',      icon: Zap,             roles: ['ADMIN', 'MARKETING'],    group: 'marketing', feature: 'marketing' },
  { id: 'marketing-audiences',      label: 'Audiences',        icon: Users,           roles: ['ADMIN', 'MARKETING'],    group: 'marketing', feature: 'marketing' },
  { id: 'marketing-content-studio', label: 'Content Studio',   icon: PenSquare,       roles: ['ADMIN', 'MARKETING'],    group: 'marketing', feature: 'marketing', subGroup: 'create-publish' },
  { id: 'marketing-templates',      label: 'Email Templates',  icon: LayoutTemplate,  roles: ['ADMIN', 'MARKETING'],    group: 'marketing', feature: 'marketing', subGroup: 'create-publish' },
  { id: 'marketing-publishing',     label: 'Publishing Center', icon: Send,           roles: ['ADMIN', 'MARKETING'],    group: 'marketing', feature: 'marketing', subGroup: 'create-publish' },
  { id: 'marketing-landing-pages',  label: 'Landing Pages',    icon: Globe,           roles: ['ADMIN', 'MARKETING'],    group: 'marketing', feature: 'marketing', subGroup: 'create-publish' },
  { id: 'marketing-assets',         label: 'Media Kit',        icon: Image,           roles: ['ADMIN', 'MARKETING'],    group: 'marketing', feature: 'marketing', subGroup: 'create-publish' },
  { id: 'marketing-performance',    label: 'Performance',      icon: LineChart,       roles: ['ADMIN', 'MARKETING'],    group: 'marketing', feature: 'marketing', subGroup: 'measure' },
  { id: 'marketing-reports',        label: 'Reports',          icon: Layers,          roles: ['ADMIN', 'MARKETING'],    group: 'marketing', feature: 'marketing', subGroup: 'measure' },
  { id: 'marketing-settings',       label: 'Settings',         icon: Settings,        roles: ['ADMIN', 'MARKETING'],    group: 'marketing', feature: 'marketing' },
  { id: 'users',         label: 'Team',            icon: UserCog,    roles: ['ADMIN'],                                  group: 'management' },
  { id: 'activity-log',  label: 'Activity Log',    icon: Shield,     roles: ['ADMIN'],                                  group: 'management' },
  { id: 'settings',      label: 'Settings',        icon: Settings,   roles: ['ADMIN', 'SUPER_ADMIN'],                   group: 'management' },
  { id: 'purchasing-overview',   label: 'Dashboard',        icon: ShoppingCart,   roles: ['ADMIN', 'PURCHASING'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-requests',  label: 'Purchase Requests', icon: ClipboardList,  roles: ['ADMIN', 'PURCHASING', 'WAREHOUSE'],               group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-orders',    label: 'Purchase Orders',   icon: FileText,       roles: ['ADMIN', 'PURCHASING', 'WAREHOUSE'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-stock',     label: 'Item by Location', icon: Boxes,          roles: ['ADMIN', 'PURCHASING', 'WAREHOUSE'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-transfers', label: 'Transfers',          icon: ArrowRightLeft, roles: ['ADMIN', 'PURCHASING', 'WAREHOUSE'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-items',        label: 'Items & Pricing',  icon: Package,     roles: ['ADMIN', 'PURCHASING'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-item-types',   label: 'Item Types',       icon: Tag,         roles: ['ADMIN'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-locations',    label: 'Locations',        icon: MapPin,      roles: ['ADMIN', 'PURCHASING'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-stock-counts', label: 'Stock Counts',     icon: Shield,      roles: ['ADMIN', 'PURCHASING', 'WAREHOUSE'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-suppliers',     label: 'Suppliers',        icon: Building2,   roles: ['ADMIN', 'PURCHASING'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-exceptions',   label: 'Exceptions',        icon: Bell,        roles: ['ADMIN', 'PURCHASING'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-withdrawals',  label: 'Withdrawal Report', icon: TrendingDown, roles: ['ADMIN', 'PURCHASING'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-reports',      label: 'Reports',           icon: TrendingUp,  roles: ['ADMIN', 'PURCHASING'], group: 'purchasing', feature: 'purchasing' },
  { id: 'hr-employees',  label: 'Employees',      icon: IdCard,     roles: ['ADMIN', 'SUPER_ADMIN', 'HR'],             group: 'hr'         },
]

const roleBadgeColor: Record<string, string> = {
  ADMIN:      'bg-purple-100 text-purple-700',
  SALES:      'bg-blue-100 text-blue-700',
  FINANCE:    'bg-emerald-100 text-emerald-700',
  MARKETING:  'bg-orange-100 text-orange-700',
  PURCHASING: 'bg-amber-100 text-amber-700',
  WAREHOUSE:  'bg-teal-100 text-teal-700',
  HR:         'bg-pink-100 text-pink-700',
}

const roleLabel: Record<string, string> = {
  ADMIN:      'Admin',
  SALES:      'Sales',
  FINANCE:    'Finance',
  MARKETING:  'Marketing',
  PURCHASING: 'Purchasing',
  WAREHOUSE:  'Warehouse',
  HR:         'HR',
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
  requestId: string | null
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
  REQUEST_ORDER_SUBMITTED: ClipboardList,
  PO_PAYMENT_REQUESTED:   Wallet,
  PO_PAYMENT_PAID:        CheckCircle2,
  PO_PAID_BY_PURCHASING: CheckCircle2,
  PO_REIMBURSEMENT_REQUESTED: Banknote,
  PO_REIMBURSEMENT_PAID:      CheckCircle2,
  PO_FULLY_PAID:              CheckCircle2,
}
const NOTIF_COLOR: Record<string, string> = {
  PAYMENT_SUBMITTED: 'text-amber-600',
  PAYMENT_CONFIRMED: 'text-green-600',
  PAYMENT_REJECTED:  'text-red-600',
  INVOICE_READY:     'text-violet-600',
  DEPOSIT_DUE_H2:    'text-amber-500',
  DEPOSIT_DUE_H1:    'text-orange-500',
  DEPOSIT_DUE_H0:    'text-red-600',
  REQUEST_ORDER_SUBMITTED: 'text-blue-600',
  PO_PAYMENT_REQUESTED: 'text-amber-600',
  PO_PAYMENT_PAID: 'text-green-600',
  PO_PAID_BY_PURCHASING: 'text-green-600',
  PO_REIMBURSEMENT_REQUESTED: 'text-amber-600',
  PO_REIMBURSEMENT_PAID: 'text-green-600',
  PO_FULLY_PAID: 'text-green-600',
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

function MarketingComingSoon({ title, desc, icon: Icon }: { title: string; desc: string; icon: React.ElementType }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-sm mt-1">{desc}</p>
      </div>
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        <Icon className="h-8 w-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">Coming soon</p>
        <p className="text-xs mt-1">This feature is currently in development</p>
      </div>
    </div>
  )
}

const dropdownVariants = {
  hidden:  { opacity: 0, scale: 0.95, y: -6 },
  visible: { opacity: 1, scale: 1,    y: 0  },
}

// Opacity-only — no x/y/scale here. Any of those makes Framer Motion apply a persistent
// `transform` style to the wrapping motion.div (even at rest, e.g. `translateY(0px)`),
// which breaks `position: sticky` for every descendant on every page (a transformed
// ancestor changes containing-block computations the same way it does for `fixed`). That
// silently broke the Create PR cart sidebar's sticky behavior — this keeps the fade
// transition without reintroducing the transform.
const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
}

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { trigger: triggerTransition } = usePageTransition()
  const [currentView, setCurrentView] = useState<View>(() => {
    if (typeof window === 'undefined') return 'calendar'
    return (localStorage.getItem('lastView') as View | null) ?? 'calendar'
  })
  // Remembers the last section visited so a browser refresh lands back where the
  // user was instead of resetting to the default view. Role/visibility is still
  // re-checked below (isCurrentViewAllowed) so a stored view the user no longer
  // has access to falls back safely.
  useEffect(() => {
    localStorage.setItem('lastView', currentView)
  }, [currentView])
  // Set when an email row is clicked in the "All Chats" unified inbox — WhatsApp/Instagram
  // open inline in that same screen, but Email is still its own separate page (deliberately
  // not chat-bubble UI), so this tells it which conversation to auto-open once it mounts.
  const [emailDeepLinkId, setEmailDeepLinkId] = useState<string | null>(null)
  // Lets Item by Location's "click PO number" deep-link into a specific PO's
  // detail view on the Purchase Orders page — there's no URL routing between
  // top-level views in this app, so this is the plain state-lifting equivalent.
  const [pendingPoId, setPendingPoId] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
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
  const [pendingRequestOrders, setPendingRequestOrders] = useState(0)
  const [pendingMyApprovals, setPendingMyApprovals] = useState(0)
  const [pendingPOPayments, setPendingPOPayments] = useState(0)
  const [pendingPOReimbursements, setPendingPOReimbursements] = useState(0)
  const [pendingDeliveryFeePayments, setPendingDeliveryFeePayments] = useState(0)
  const [pendingDeliveryFeeReimbursements, setPendingDeliveryFeeReimbursements] = useState(0)
  const [unreadWhatsapp, setUnreadWhatsapp] = useState(0)
  const [unreadInstagram, setUnreadInstagram] = useState(0)
  const [unreadEmailInbox, setUnreadEmailInbox] = useState(0)

  const fetchPendingPayments = useCallback(async () => {
    try {
      const res = await fetch('/api/payments')
      if (res.ok) {
        const data = await res.json()
        setPendingPayments(data.filter((p: { status: string }) => p.status === 'pending_confirmation' || p.status === 'requested').length)
      }
    } catch { /* silent */ }
  }, [])

  const fetchPendingRequestOrders = useCallback(async () => {
    try {
      const role = (session?.user as { role?: string })?.role ?? ''
      if (!['PURCHASING', 'ADMIN', 'SUPER_ADMIN'].includes(role)) return
      const res = await fetch('/api/purchasing/requests')
      if (res.ok) {
        const data = await res.json()
        setPendingRequestOrders(Array.isArray(data)
          ? data.filter((r: { status: string; requestedByEmployeeId: string | null }) => r.status === 'DRAFT' && r.requestedByEmployeeId).length
          : 0)
      }
    } catch { /* silent */ }
  }, [session])

  const fetchPendingMyApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/purchasing/my-approvals')
      if (res.ok) {
        // Response is { prApprovals, quotationApprovals }, not a flat array — counting
        // data.length here always read 0, so the sidebar badge never showed even with
        // items waiting (e.g. a pending supplier-selection approval).
        const data = await res.json()
        const prCount = Array.isArray(data?.prApprovals) ? data.prApprovals.length : 0
        const quotationCount = Array.isArray(data?.quotationApprovals) ? data.quotationApprovals.length : 0
        setPendingMyApprovals(prCount + quotationCount)
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

  const fetchPendingPurchasingFinance = useCallback(async () => {
    try {
      const role = (session?.user as { role?: string })?.role ?? ''
      if (!['FINANCE', 'ADMIN', 'SUPER_ADMIN'].includes(role)) return
      const countPending = (data: unknown) => Array.isArray(data) ? data.filter((r: { status: string }) => r.status === 'PENDING').length : 0
      const [poPayRes, poReimbRes, dfPayRes, dfReimbRes] = await Promise.all([
        fetch('/api/finance/purchase-order-payments'),
        fetch('/api/finance/po-reimbursements'),
        fetch('/api/finance/delivery-fee-payments'),
        fetch('/api/finance/delivery-fee-reimbursements'),
      ])
      if (poPayRes.ok) setPendingPOPayments(countPending(await poPayRes.json()))
      if (poReimbRes.ok) setPendingPOReimbursements(countPending(await poReimbRes.json()))
      if (dfPayRes.ok) setPendingDeliveryFeePayments(countPending(await dfPayRes.json()))
      if (dfReimbRes.ok) setPendingDeliveryFeeReimbursements(countPending(await dfReimbRes.json()))
    } catch { /* silent */ }
  }, [session])

  const fetchUnreadWhatsapp = useCallback(async () => {
    try {
      const role = (session?.user as { role?: string })?.role ?? ''
      if (!['ADMIN', 'SALES'].includes(role)) return
      const res = await fetch('/api/whatsapp/conversations')
      if (res.ok) {
        const data = await res.json()
        setUnreadWhatsapp(Array.isArray(data) ? data.reduce((s: number, c: { unreadCount: number }) => s + c.unreadCount, 0) : 0)
      }
    } catch { /* silent */ }
  }, [session])

  const fetchUnreadInstagram = useCallback(async () => {
    try {
      const role = (session?.user as { role?: string })?.role ?? ''
      if (!['ADMIN', 'SALES'].includes(role)) return
      const res = await fetch('/api/instagram/conversations')
      if (res.ok) {
        const data = await res.json()
        setUnreadInstagram(Array.isArray(data) ? data.reduce((s: number, c: { unreadCount: number }) => s + c.unreadCount, 0) : 0)
      }
    } catch { /* silent */ }
  }, [session])

  const fetchUnreadEmailInbox = useCallback(async () => {
    try {
      const role = (session?.user as { role?: string })?.role ?? ''
      if (!['ADMIN', 'SALES'].includes(role)) return
      const res = await fetch('/api/email-inbox/conversations')
      if (res.ok) {
        const data = await res.json()
        setUnreadEmailInbox(Array.isArray(data) ? data.reduce((s: number, c: { unreadCount: number }) => s + c.unreadCount, 0) : 0)
      }
    } catch { /* silent */ }
  }, [session])

  useEffect(() => {
    if (!session) return
    const refresh = () => { fetchNotifications(); fetchPendingPayments(); fetchPendingRefunds(); fetchPendingRequestOrders(); fetchPendingMyApprovals(); fetchPendingPurchasingFinance(); fetchUnreadWhatsapp(); fetchUnreadInstagram(); fetchUnreadEmailInbox() }
    const interval = setInterval(refresh, 30000)
    refresh()
    return () => clearInterval(interval)
  }, [session, fetchNotifications, fetchPendingPayments, fetchPendingRefunds, fetchPendingRequestOrders, fetchPendingMyApprovals, fetchPendingPurchasingFinance, fetchUnreadWhatsapp, fetchUnreadInstagram, fetchUnreadEmailInbox])

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
    if ((n.type === 'PO_PAYMENT_REQUESTED' || n.type === 'PO_PAID_BY_PURCHASING') && isFinance) {
      setCurrentView('finance-po-payments')
    } else if (n.type === 'PO_REIMBURSEMENT_REQUESTED' && isFinance) {
      setCurrentView('finance-po-reimbursements')
    } else if ((n.type === 'DF_PAYMENT_REQUESTED' || n.type === 'DF_PAID_BY_PURCHASING') && isFinance) {
      setCurrentView('finance-delivery-fee-payments')
    } else if (n.type === 'DF_REIMBURSEMENT_REQUESTED' && isFinance) {
      setCurrentView('finance-delivery-fee-reimbursements')
    } else if (n.requestId || n.type === 'REQUEST_ORDER_SUBMITTED') {
      setCurrentView('purchasing-requests')
    } else if (n.orderId || n.type.startsWith('PO_') || n.type.startsWith('DF_')) {
      setCurrentView('purchasing-orders')
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
    roleMatches(userRole, item.roles) &&
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
      case 'destinations': return <Destinations />
      case 'bookings':     return <Bookings />
      case 'customers':    return <Customers />
      case 'leads':        return <Leads />
      case 'calendar':     return <CalendarView />
      case 'chat-inbox':   return <UnifiedInbox onOpenEmail={id => { setEmailDeepLinkId(id); setCurrentView('chat-email') }} />
      case 'chat-email':   return <EmailInboxPage initialConversationId={emailDeepLinkId ?? undefined} />
      case 'open-trips':   return <OpenTrips />
      case 'expenses':     return <Expenses />
      case 'maintenance':  return <Maintenance />
      case 'users':        return <UsersPage />
      case 'payments':     return <Payments />
      case 'trip-sheet':   return <TripSheet />
      case 'agents':       return <Agents />
      case 'agent-leads':  return <AgentLeadsPage />
      case 'banks':         return <Banks />
      case 'finance-po-payments': return <PurchaseOrderPayments />
      case 'finance-po-reimbursements': return <POReimbursements />
      case 'finance-delivery-fee-payments': return <DeliveryFeePayments />
      case 'finance-delivery-fee-reimbursements': return <DeliveryFeeReimbursements />
      case 'finance-agent-clawback': return <AgentClawbacks />
      case 'vouchers':      return <Vouchers />
      case 'marketing-dashboard': return <MarketingComingSoon title="Command Center" desc="A rollup of every campaign's performance, spend, ROAS, and tasks that need attention." icon={LayoutDashboard} />
      case 'marketing-campaigns': return <CampaignsPage />
      case 'marketing-calendar': return <MarketingComingSoon title="Content Calendar" desc="See every campaign, email send, and scheduled post in one calendar." icon={Calendar} />
      case 'marketing-automations': return <MarketingComingSoon title="Automations" desc="Behavior- and trip-data-driven journeys (pre-trip, post-trip, and more)." icon={Zap} />
      case 'marketing-audiences': return <MarketingComingSoon title="Audiences" desc="Build and save reusable audience segments for use across campaigns." icon={Users} />
      case 'marketing-content-studio': return <MarketingComingSoon title="Content Studio" desc="Produce and approve content across formats — social, video, ads — in one place." icon={PenSquare} />
      case 'marketing-templates': return <TemplatesPage />
      case 'marketing-publishing': return <MarketingComingSoon title="Publishing Center" desc="A weekly publishing queue and schedule across every channel." icon={Send} />
      case 'marketing-landing-pages': return <MarketingComingSoon title="Landing Pages" desc="Build and publish campaign pages straight to the brand website." icon={Globe} />
      case 'marketing-assets': return <MediaKit />
      case 'marketing-performance': return <MarketingComingSoon title="Performance" desc="A cross-campaign, cross-channel rollup — revenue, ROAS, and channel comparison." icon={LineChart} />
      case 'marketing-reports': return <MarketingComingSoon title="Reports" desc="Recurring reports and campaign result summaries." icon={Layers} />
      case 'marketing-settings': return <MarketingComingSoon title="Marketing Settings" desc="Brands, integrations, attribution rules, and approval policies." icon={Settings} />
      case 'my-approvals':   return <MyApprovalsPage />
      case 'activity-log':   return <ActivityLog />
      case 'statistics':     return <Statistics />
      case 'finance-stats':  return <FinanceTabView />
      case 'sales-stats':    return <SalesStats />
      case 'leads-stats':    return <LeadsStats />
      case 'purchasing-overview':   return <PurchasingOverview />
      case 'purchasing-requests':  return <PurchasingRequestsPage onOpenPo={(id: string) => { setPendingPoId(id); setCurrentView('purchasing-orders') }} />
      case 'purchasing-orders':    return <PurchasingOrdersPage openPoId={pendingPoId} onOpenPoHandled={() => setPendingPoId(null)} />
      case 'purchasing-items':     return <PurchasingItemsPage />
      case 'purchasing-item-types': return <PurchasingItemTypesPage />
      case 'purchasing-locations': return <PurchasingLocationsPage />
      case 'purchasing-stock':     return <PurchasingStockPage onOpenPo={(id: string) => { setPendingPoId(id); setCurrentView('purchasing-orders') }} />
      case 'purchasing-transfers':    return <PurchasingTransfersPage />
      case 'purchasing-stock-counts': return <PurchasingStockCountsPage />
      case 'purchasing-suppliers':    return <PurchasingSuppliersPage />
      case 'purchasing-exceptions':   return <PurchasingExceptionsPage />
      case 'purchasing-withdrawals':  return <PurchasingWithdrawalsPage />
      case 'purchasing-reports':      return <PurchasingReportsPage />
      case 'hr-employees':  return <EmployeesPage />
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
          <SidebarHeader className="px-5 py-5 border-b" style={branding.sidebarBg ? { borderColor: 'rgba(255,255,255,0.18)' } : undefined}>
            <div className="flex items-center gap-3">
              <img
                src={branding.logoUrl}
                alt={branding.name}
                className="h-11 w-auto object-contain"
              />
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            {(() => {
              const renderItems = (items: NavItem[], asChild = false) => items.map((item) => {
                const Icon = item.icon
                const showDot =
                  (item.id === 'payments' && isFinance && (pendingPayments + pendingRefunds) > 0) ||
                  (item.id === 'bookings' && !isFinance && (invoiceReadyCount + pendingRefunds) > 0) ||
                  (item.id === 'purchasing-requests' && pendingRequestOrders > 0) ||
                  (item.id === 'my-approvals' && pendingMyApprovals > 0) ||
                  (item.id === 'finance-po-payments' && pendingPOPayments > 0) ||
                  (item.id === 'finance-po-reimbursements' && pendingPOReimbursements > 0) ||
                  (item.id === 'finance-delivery-fee-payments' && pendingDeliveryFeePayments > 0) ||
                  (item.id === 'finance-delivery-fee-reimbursements' && pendingDeliveryFeeReimbursements > 0) ||
                  (item.id === 'chat-email' && unreadEmailInbox > 0) ||
                  (item.id === 'chat-inbox' && (unreadWhatsapp + unreadInstagram) > 0)
                const dotCount =
                  item.id === 'payments' && isFinance ? pendingPayments + pendingRefunds :
                  item.id === 'bookings' && !isFinance ? invoiceReadyCount + pendingRefunds :
                  item.id === 'purchasing-requests' ? pendingRequestOrders :
                  item.id === 'my-approvals' ? pendingMyApprovals :
                  item.id === 'finance-po-payments' ? pendingPOPayments :
                  item.id === 'finance-po-reimbursements' ? pendingPOReimbursements :
                  item.id === 'finance-delivery-fee-payments' ? pendingDeliveryFeePayments :
                  item.id === 'finance-delivery-fee-reimbursements' ? pendingDeliveryFeeReimbursements :
                  item.id === 'chat-email' ? unreadEmailInbox :
                  item.id === 'chat-inbox' ? unreadWhatsapp + unreadInstagram :
                  0
                const isItemActive = activeView === item.id
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      onClick={() => {
                        setCurrentView(item.id)
                        if (item.id === 'bookings') markInvoiceReadyAsRead()
                      }}
                      isActive={isItemActive}
                      className={`relative !py-3.5 !px-3 rounded-lg transition-colors ${asChild ? 'pl-8 text-xs' : 'text-[13px]'} ${
                        isItemActive
                          ? 'bg-[#bdac7e]/15 text-[#7a6a3f] font-semibold hover:bg-[#bdac7e]/20 hover:text-[#7a6a3f]'
                          : asChild
                            ? 'text-gray-500 font-normal hover:bg-gray-100 hover:text-gray-800'
                            : 'text-gray-700 font-medium hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <Icon className={`${asChild ? 'h-3.5 w-3.5' : 'h-[17px] w-[17px]'} ${isItemActive ? 'text-[#8a744a]' : 'text-gray-400'}`} />
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
                      <span className="truncate">{item.label}</span>
                      {isItemActive && <span className="absolute right-2 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-[#bdac7e]" />}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })

              // Shared collapsible-section chrome used by both the Admin (domain groups)
              // and Sales & Marketing (division groups) sidebars below.
              const renderExpandableSection = (key: string, label: string, SectionIcon: React.ElementType, sectionItems: NavItem[], isSectionActive: boolean) => {
                const isExpanded = isSectionActive || expandedGroups.has(key)

                return (
                  <div key={key} className={`rounded-lg transition-colors ${isExpanded ? 'bg-gray-50 pb-2' : ''}`}>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => setExpandedGroups(prev => {
                          const next = new Set(prev)
                          if (next.has(key)) next.delete(key)
                          else next.add(key)
                          return next
                        })}
                        className={`!py-3.5 !px-3 rounded-lg text-[14px] transition-colors ${
                          isSectionActive
                            ? 'text-[#7a6a3f] font-semibold hover:bg-gray-100'
                            : 'text-gray-800 font-semibold hover:bg-gray-100'
                        }`}
                      >
                        <SectionIcon className={`h-[17px] w-[17px] shrink-0 ${isSectionActive ? 'text-[#8a744a]' : 'text-gray-500'}`} />
                        <span className="flex-1 truncate">{label}</span>
                        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          {key === 'marketing' ? (
                            <>
                              <SidebarMenu className="pt-4 px-1 gap-4">
                                {renderItems(sectionItems.filter(i => !i.subGroup), true)}
                              </SidebarMenu>
                              {MARKETING_SUB_GROUPS.map(sub => (
                                (() => {
                                  const subItems = sectionItems.filter(i => i.subGroup === sub.key)
                                  if (!subItems.length) return null
                                  return (
                                    <div key={sub.key} className="mt-4">
                                      <div className="pl-3 pb-2 flex items-center text-[10px] font-semibold uppercase tracking-wider text-[#a8874f]">
                                        {sub.label}
                                      </div>
                                      <SidebarMenu className="px-1 gap-4">{renderItems(subItems, true)}</SidebarMenu>
                                    </div>
                                  )
                                })()
                              ))}
                            </>
                          ) : (
                            <SidebarMenu className="pt-4 px-1 gap-4">{renderItems(sectionItems, true)}</SidebarMenu>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              }

              if (isAdmin) {
                const activeGroupKey = navigationItems.find(i => i.id === activeView)?.group

                return (
                  <SidebarGroup className="!p-3 pt-4">
                    <SidebarGroupLabel className="!h-auto px-2 pb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Menu
                    </SidebarGroupLabel>
                    <SidebarMenu className="gap-5">
                      {NAV_GROUPS.map(group => {
                        const groupItems = visibleNavItems.filter(i => i.group === group.key)
                        if (!groupItems.length) return null

                        // "Main" is just the single Dashboard entry-point — a plain link, not
                        // an expandable module like the ones below.
                        if (group.key === 'main') return <React.Fragment key={group.key}>{renderItems(groupItems)}</React.Fragment>

                        const GroupIcon = group.icon ?? Boxes
                        const isGroupActive = group.key === activeGroupKey
                        return renderExpandableSection(group.key, group.label, GroupIcon, groupItems, isGroupActive)
                      })}
                    </SidebarMenu>
                  </SidebarGroup>
                )
              }

              // Combined Sales & Marketing accounts see both divisions' items merged into
              // one nav list (roleMatches expands SALES_MARKETING into SALES + MARKETING),
              // so bucket them back into two labeled, collapsible sections — same chrome as
              // Admin's domain groups — instead of one flat, unlabeled list.
              if (userRole === 'SALES_MARKETING') {
                const divisionOf = (item: NavItem): 'sales' | 'marketing' | null => {
                  if (item.group === 'main') return null
                  if (item.roles.includes('SALES')) return 'sales'
                  if (item.roles.includes('MARKETING')) return 'marketing'
                  return null
                }
                const DIVISIONS: { key: 'sales' | 'marketing'; label: string; icon: React.ElementType }[] = [
                  { key: 'sales',     label: 'Sales',     icon: Briefcase },
                  { key: 'marketing', label: 'Marketing', icon: Send },
                ]
                const mainItems = visibleNavItems.filter(i => i.group === 'main')
                const activeNavItem = navigationItems.find(i => i.id === activeView)
                const activeDivision = activeNavItem ? divisionOf(activeNavItem) : null

                return (
                  <SidebarGroup className="!p-3 pt-4">
                    <SidebarGroupLabel className="!h-auto px-2 pb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Menu
                    </SidebarGroupLabel>
                    <SidebarMenu className="gap-5">
                      {renderItems(mainItems)}
                      {DIVISIONS.map(division => {
                        const divisionItems = visibleNavItems.filter(i => divisionOf(i) === division.key)
                        if (!divisionItems.length) return null
                        return renderExpandableSection(division.key, division.label, division.icon, divisionItems, division.key === activeDivision)
                      })}
                    </SidebarMenu>
                  </SidebarGroup>
                )
              }

              // Finance Director accounts see Purchasing + Finance + HR items merged into
              // one nav list (roleMatches expands FINANCE_DIRECTOR into those three roles),
              // so bucket them back into three labeled, collapsible sections — same treatment
              // as Sales & Marketing above — instead of one flat, unlabeled list.
              if (userRole === 'FINANCE_DIRECTOR') {
                const divisionOf = (item: NavItem): 'purchasing' | 'finance' | 'hr' | null => {
                  if (item.group === 'main') return null
                  if (item.roles.includes('PURCHASING')) return 'purchasing'
                  if (item.roles.includes('FINANCE')) return 'finance'
                  if (item.roles.includes('HR')) return 'hr'
                  return null
                }
                const DIVISIONS = NAV_GROUPS.filter((g): g is typeof g & { key: 'purchasing' | 'finance' | 'hr'; icon: React.ElementType } =>
                  g.key === 'purchasing' || g.key === 'finance' || g.key === 'hr'
                )
                const mainItems = visibleNavItems.filter(i => i.group === 'main')
                const activeNavItem = navigationItems.find(i => i.id === activeView)
                const activeDivision = activeNavItem ? divisionOf(activeNavItem) : null

                return (
                  <SidebarGroup className="!p-3 pt-4">
                    <SidebarGroupLabel className="!h-auto px-2 pb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Menu
                    </SidebarGroupLabel>
                    <SidebarMenu className="gap-5">
                      {renderItems(mainItems)}
                      {DIVISIONS.map(division => {
                        const divisionItems = visibleNavItems.filter(i => divisionOf(i) === division.key)
                        if (!divisionItems.length) return null
                        return renderExpandableSection(division.key, division.label, division.icon, divisionItems, division.key === activeDivision)
                      })}
                    </SidebarMenu>
                  </SidebarGroup>
                )
              }

              return (
                <SidebarGroup className="!p-3 pt-4">
                  <SidebarGroupLabel className="!h-auto px-2 pb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Menu
                  </SidebarGroupLabel>
                  <SidebarMenu className="gap-5">{renderItems(visibleNavItems)}</SidebarMenu>
                </SidebarGroup>
              )
            })()}
          </SidebarContent>

          <SidebarFooter className="px-5 py-4 border-t" style={branding.sidebarBg ? { borderColor: 'rgba(255,255,255,0.18)' } : undefined}>
            <p className="text-[10.5px] text-center text-gray-400" style={branding.sidebarBg ? { color: 'rgba(255,255,255,0.45)' } : undefined}>
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

          {/* overflow-x-hidden only — a plain overflow-hidden here clips `position: sticky`
              on anything inside (e.g. the Create PR cart sidebar), since sticky needs an
              unbroken chain of visible/scroll overflow up to its scrolling ancestor
              (`main.overflow-auto` above). pageVariants is opacity-only now (no x/y), so
              there's no transition overflow left to worry about on either axis anyway. */}
          <div className="p-3 sm:p-4 xl:p-6 overflow-x-hidden">
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
