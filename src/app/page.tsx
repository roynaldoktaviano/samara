'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter } from '@/components/ui/sidebar'
import { LayoutDashboard, Anchor, Calendar, Users, DollarSign, Wrench, Menu, LogOut, ChevronDown, Ship, UserCog, CreditCard, Bell, CheckCheck, Clock, CheckCircle2, XCircle, Briefcase, Tag, Shield } from 'lucide-react'
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

type View = 'dashboard' | 'yachts' | 'bookings' | 'customers' | 'calendar' | 'expenses' | 'maintenance' | 'open-trips' | 'users' | 'payments' | 'agents' | 'vouchers' | 'activity-log'

type NavItem = {
  id: View
  label: string
  icon: React.ElementType
  roles: string[]
}

const navigationItems: NavItem[] = [
  { id: 'calendar',    label: 'Dashboard',   icon: Calendar,        roles: ['ADMIN', 'SALES', 'FINANCE', 'MARKETING'] },
  { id: 'yachts',      label: 'Yachts',      icon: Anchor,          roles: ['ADMIN'] },
  { id: 'bookings',    label: 'Bookings',    icon: Calendar,        roles: ['ADMIN', 'SALES'] },
  { id: 'payments',    label: 'Payments',    icon: CreditCard,      roles: ['ADMIN', 'SALES', 'FINANCE'] },
  { id: 'open-trips',  label: 'Open Trips',  icon: Ship,            roles: ['ADMIN', 'SALES', 'MARKETING'] },
  { id: 'customers',   label: 'Guests',      icon: Users,           roles: ['ADMIN', 'SALES', 'MARKETING'] },
  { id: 'dashboard',   label: 'Statistics',  icon: LayoutDashboard, roles: ['ADMIN', 'FINANCE'] },
  { id: 'expenses',    label: 'Expenses',    icon: DollarSign,      roles: ['ADMIN', 'FINANCE'] },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench,          roles: ['ADMIN', 'FINANCE'] },
  { id: 'agents',      label: 'Agents',      icon: Briefcase,       roles: ['ADMIN', 'SALES', 'FINANCE'] },
  { id: 'vouchers',      label: 'Vouchers',    icon: Tag,    roles: ['ADMIN'] },
  { id: 'users',         label: 'Team',        icon: UserCog, roles: ['ADMIN'] },
  { id: 'activity-log',  label: 'Activity Log', icon: Shield, roles: ['ADMIN'] },
]

const roleBadgeColor: Record<string, string> = {
  ADMIN:     'bg-purple-100 text-purple-700',
  SALES:     'bg-blue-100 text-blue-700',
  FINANCE:   'bg-emerald-100 text-emerald-700',
  MARKETING: 'bg-orange-100 text-orange-700',
}

const roleLabel: Record<string, string> = {
  ADMIN:     'Admin',
  SALES:     'Sales',
  FINANCE:   'Finance',
  MARKETING: 'Marketing',
}

interface Notification {
  id: string
  type: string
  title: string
  body: string
  isRead: boolean
  paymentId: string | null
  bookingId: string | null
  createdAt: string
}

const NOTIF_ICON: Record<string, React.ElementType> = {
  PAYMENT_SUBMITTED: Clock,
  PAYMENT_CONFIRMED: CheckCircle2,
  PAYMENT_REJECTED:  XCircle,
  DEPOSIT_DUE_H2:    Bell,
  DEPOSIT_DUE_H1:    Bell,
  DEPOSIT_DUE_H0:    Bell,
}
const NOTIF_COLOR: Record<string, string> = {
  PAYMENT_SUBMITTED: 'text-amber-600',
  PAYMENT_CONFIRMED: 'text-green-600',
  PAYMENT_REJECTED:  'text-red-600',
  DEPOSIT_DUE_H2:    'text-amber-500',
  DEPOSIT_DUE_H1:    'text-orange-500',
  DEPOSIT_DUE_H0:    'text-red-600',
}

function fmtRelative(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const min  = Math.floor(diff / 60000)
  if (min < 1)   return 'Baru saja'
  if (min < 60)  return `${min} menit lalu`
  const hr = Math.floor(min / 60)
  if (hr < 24)   return `${hr} jam lalu`
  return `${Math.floor(hr / 24)} hari lalu`
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
  const [currentView, setCurrentView] = useState<View>('calendar')
  const [showUserMenu, setShowUserMenu] = useState(false)

  // ── Notifications ──────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [pendingPayments, setPendingPayments] = useState(0)
  const [bellShake, setBellShake] = useState(false)
  const notifRef   = useRef<HTMLDivElement>(null)
  const prevUnread = useRef(-1) // -1 = not yet initialised

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

  const fetchPendingPayments = useCallback(async () => {
    try {
      const res = await fetch('/api/payments')
      if (res.ok) {
        const data = await res.json()
        setPendingPayments(data.filter((p: { status: string }) => p.status === 'pending_confirmation').length)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    if (!session) return
    const refresh = () => { fetchNotifications(); fetchPendingPayments() }
    const interval = setInterval(refresh, 30000)
    refresh()
    return () => clearInterval(interval)
  }, [session, fetchNotifications, fetchPendingPayments])

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

  // Close notif dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
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

  const handleNotifClick = (n: Notification) => {
    markOneRead(n.id)
    setNotifOpen(false)
    if (n.paymentId) {
      setCurrentView('payments')
    } else if (n.bookingId || n.type.startsWith('DEPOSIT_DUE')) {
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

  const userRole = session.user.role
  const isFinance = userRole === 'FINANCE' || userRole === 'ADMIN'
  const visibleNavItems = navigationItems.filter((item) => item.roles.includes(userRole))

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
      case 'vouchers':      return <Vouchers />
      case 'activity-log':  return <ActivityLog />
      default:              return <CalendarView />
    }
  }

  const currentNavItem = visibleNavItems.find((item) => item.id === activeView)

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background w-full">
        <Sidebar>
          <SidebarHeader className="p-6 border-b">
            <div className="flex items-center gap-3">
              <img src="https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png" alt="Samara liveaboard logo" />
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
              <SidebarMenu>
                {visibleNavItems.map((item) => {
                  const Icon = item.icon
                  const showDot =
                    item.id === 'payments' && (
                      isFinance ? pendingPayments > 0 : unreadCount > 0
                    )
                  const dotCount = item.id === 'payments'
                    ? (isFinance ? pendingPayments : unreadCount)
                    : 0

                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        onClick={() => setCurrentView(item.id)}
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
                                className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none"
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
                })}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-4 border-t">
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 hover:bg-muted transition-colors text-left"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a5f6e] text-white text-xs font-semibold uppercase">
                  {session.user.name?.charAt(0) ?? session.user.email?.charAt(0) ?? 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {session.user.name ?? session.user.email}
                  </p>
                  <span className={`inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${roleBadgeColor[userRole] ?? 'bg-gray-100 text-gray-600'}`}>
                    {roleLabel[userRole] ?? userRole}
                  </span>
                </div>
                <motion.div
                  animate={{ rotate: showUserMenu ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
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
                    style={{ transformOrigin: 'bottom left' }}
                    className="absolute bottom-full left-0 right-0 mb-1 rounded-md border bg-background shadow-md z-50"
                  >
                    <button
                      onClick={() => signOut({ callbackUrl: '/login' })}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors rounded-md"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <p className="mt-3 text-[10.5px] text-muted-foreground text-center">
              © 2026 Samara Liveaboard.
            </p>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur-sm px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <Menu className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <AnimatePresence mode="wait">
                <motion.h2
                  key={activeView}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.18 }}
                  className="text-xl font-semibold capitalize"
                >
                  {currentNavItem?.label ?? activeView}
                </motion.h2>
              </AnimatePresence>
            </div>

            {/* ── Notification Bell ── */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(v => !v)}
                className="relative p-2 rounded-full hover:bg-muted transition-colors"
              >
                <motion.div
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
                      className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none"
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
                    className="absolute right-0 top-full mt-2 w-80 rounded-xl border bg-background shadow-xl z-50 overflow-hidden"
                  >
                    {/* Dropdown header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                      <span className="font-semibold text-sm">Notifikasi</span>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllRead}
                          className="flex items-center gap-1 text-xs text-[#1a5f6e] hover:underline"
                        >
                          <CheckCheck className="h-3 w-3" />
                          Tandai semua dibaca
                        </button>
                      )}
                    </div>

                    {/* Notification list */}
                    <div className="max-h-80 overflow-y-auto divide-y">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Tidak ada notifikasi
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
                              <p className="text-[10px] text-muted-foreground/70 mt-1">{fmtRelative(n.createdAt)}</p>
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
                          Lihat bookings →
                        </button>
                      )}
                      <button
                        onClick={() => { setCurrentView('payments'); setNotifOpen(false) }}
                        className="text-xs text-[#1a5f6e] hover:underline"
                      >
                        Lihat payments →
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </header>

          <div className="p-6 overflow-hidden">
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
  )
}
