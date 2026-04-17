'use client'

import { useState } from 'react'
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter } from '@/components/ui/sidebar'
import { LayoutDashboard, Anchor, Calendar, Users, DollarSign, Wrench, Ship, Menu } from 'lucide-react'
import Dashboard from '@/components/dashboard/Dashboard'
import Yachts from '@/components/yachts/Yachts'
import Bookings from '@/components/bookings/Bookings'
import Customers from '@/components/customers/Customers'
import CalendarView from '@/components/calendar/CalendarView'
import Expenses from '@/components/expenses/Expenses'
import Maintenance from '@/components/maintenance/Maintenance'

type View = 'dashboard' | 'yachts' | 'bookings' | 'customers' | 'calendar' | 'expenses' | 'maintenance'

const navigationItems = [
  { id: 'dashboard' as View, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'yachts' as View, label: 'Yachts', icon: Anchor },
  { id: 'bookings' as View, label: 'Bookings', icon: Calendar },
  { id: 'customers' as View, label: 'Customers', icon: Users },
  { id: 'calendar' as View, label: 'Calendar', icon: Calendar },
  { id: 'expenses' as View, label: 'Expenses', icon: DollarSign },
  { id: 'maintenance' as View, label: 'Maintenance', icon: Wrench },
]

export default function Home() {
  const [currentView, setCurrentView] = useState<View>('dashboard')

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />
      case 'yachts':
        return <Yachts />
      case 'bookings':
        return <Bookings />
      case 'customers':
        return <Customers />
      case 'calendar':
        return <CalendarView />
      case 'expenses':
        return <Expenses />
      case 'maintenance':
        return <Maintenance />
      default:
        return <Dashboard />
    }
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar>
          <SidebarHeader className="p-6 border-b">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Ship className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-bold text-lg">YachtERP</h1>
                <p className="text-xs text-muted-foreground">Booking System</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
              <SidebarMenu>
                {navigationItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        onClick={() => setCurrentView(item.id)}
                        isActive={currentView === item.id}
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
            <div className="text-xs text-muted-foreground">
              © 2025 YachtERP v1.0
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <Menu className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold capitalize">{currentView}</h2>
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