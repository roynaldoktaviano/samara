'use client'

import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter } from '@/components/ui/sidebar'
import { LayoutDashboard, Anchor, Calendar, Users, DollarSign, Wrench, Menu, LogOut, ChevronDown, Ship } from 'lucide-react'
import Dashboard from '@/components/dashboard/Dashboard'
import Yachts from '@/components/yachts/Yachts'
import Bookings from '@/components/bookings/Bookings'
import Customers from '@/components/customers/Customers'
import CalendarView from '@/components/calendar/CalendarViewFixed'
import Expenses from '@/components/expenses/Expenses'
import Maintenance from '@/components/maintenance/Maintenance'
import OpenTrips from '@/components/open-trips/OpenTrips'

type View = 'dashboard' | 'yachts' | 'bookings' | 'customers' | 'calendar' | 'expenses' | 'maintenance' | 'open-trips'

type NavItem = {
  id: View
  label: string
  icon: React.ElementType
  roles: string[]
}

const navigationItems: NavItem[] = [
  { id: 'calendar',     label: 'Dashboard',    icon: Calendar,         roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF'] },
  { id: 'yachts',       label: 'Yachts',       icon: Anchor,           roles: ['SUPER_ADMIN', 'ADMIN'] },
  { id: 'bookings',     label: 'Bookings',     icon: Calendar,         roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF'] },
  { id: 'open-trips',   label: 'Open Trips',   icon: Ship,             roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
  { id: 'customers',    label: 'Customers',    icon: Users,            roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
  { id: 'dashboard',    label: 'Statistics',   icon: LayoutDashboard,  roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
  { id: 'expenses',     label: 'Expenses',     icon: DollarSign,       roles: ['SUPER_ADMIN', 'ADMIN'] },
  { id: 'maintenance',  label: 'Maintenance',  icon: Wrench,           roles: ['SUPER_ADMIN', 'ADMIN'] },
]

const roleBadgeColor: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-700',
  ADMIN:       'bg-blue-100 text-blue-700',
  MANAGER:     'bg-teal-100 text-teal-700',
  STAFF:       'bg-gray-100 text-gray-600',
}

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN:       'Admin',
  MANAGER:     'Manager',
  STAFF:       'Staff',
}

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [currentView, setCurrentView] = useState<View>('calendar')
  const [showUserMenu, setShowUserMenu] = useState(false)

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!session) {
    router.push('/login')
    return null
  }

  const userRole = session.user.role
  const visibleNavItems = navigationItems.filter((item) => item.roles.includes(userRole))

  // If current view is not accessible for this role, reset to first accessible view
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
      default:             return <CalendarView />
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
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        onClick={() => setCurrentView(item.id)}
                        isActive={activeView === item.id}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-4 border-t">
            {/* User info + logout */}
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
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
              </button>

              {showUserMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-1 rounded-md border bg-background shadow-md z-50">
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors rounded-md"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>

            <p className="mt-3 text-[10.5px] text-muted-foreground text-center">
              © 2026 Samara Liveaboard.
            </p>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <Menu className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold capitalize">
                {currentNavItem?.label ?? activeView}
              </h2>
            </div>
          </header>
          <div className="p-6">
            {renderView()}
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}
