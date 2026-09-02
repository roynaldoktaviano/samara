// Shared sidebar/module catalog — used by src/app/page.tsx to render the sidebar and by
// the Roles & Permissions admin screen (src/components/roles/RolesPermissions.tsx) to
// build its per-role checklist. `roles` on each item is only the DEFAULT access list —
// the effective, admin-editable list lives in RoleModuleAccess (see src/lib/role-permissions.ts).
import {
  Calendar, Users, Ship, UserCog, CreditCard, Bell, CheckCircle2, TrendingUp, TrendingDown,
  Briefcase, Tag, Shield, Building2, Settings, ShoppingCart, ClipboardList, Boxes,
  ArrowRightLeft, Package, MapPin, IdCard, Wallet, Banknote, Compass, Send, LayoutTemplate,
  UserPlus, LayoutDashboard, Zap, PenSquare, Globe, Image, LineChart, Layers, FileText,
  MessageCircle, Mail, Receipt, Percent, PackagePlus, CalendarCheck, CalendarOff, HandCoins,
  Anchor, KeyRound, CalendarDays, Plane, Star, Clock,
} from 'lucide-react'

export type View = 'dashboard' | 'my-approvals' | 'my-leave-requests' | 'my-business-trips' | 'my-overtime' | 'statistics' | 'sales-stats' | 'finance-stats' | 'leads-stats' | 'yachts' | 'destinations' | 'bookings' | 'customers' | 'leads' | 'calendar' | 'expenses' | 'maintenance' | 'open-trips' | 'users' | 'roles' | 'payments' | 'agents' | 'vouchers' | 'activity-log' | 'banks' | 'settings' | 'chat-inbox' | 'chat-email' | 'purchasing-overview' | 'purchasing-requests' | 'purchasing-orders' | 'purchasing-stock' | 'purchasing-transfers' | 'purchasing-items' | 'purchasing-item-types' | 'purchasing-locations' | 'purchasing-stock-counts' | 'purchasing-exceptions' | 'purchasing-reports' | 'purchasing-suppliers' | 'purchasing-withdrawals' | 'hr-overview' | 'hr-employees' | 'hr-leave-requests' | 'hr-business-trips' | 'hr-candidates' | 'hr-entities-assignments' | 'hr-compensation' | 'hr-performance-reviews' | 'hr-payroll' | 'hr-attendance' | 'hr-national-holidays' | 'hr-overtime' | 'hr-loans' | 'hr-boat-documents' | 'finance-po-payments' | 'finance-po-reimbursements' | 'finance-delivery-fee-payments' | 'finance-delivery-fee-reimbursements' | 'finance-business-trip-reimbursements' | 'finance-agent-clawback' | 'agent-leads' | 'trip-sheet' | 'marketing-campaigns' | 'marketing-templates' | 'marketing-dashboard' | 'marketing-calendar' | 'marketing-automations' | 'marketing-audiences' | 'marketing-content-studio' | 'marketing-publishing' | 'marketing-landing-pages' | 'marketing-assets' | 'marketing-performance' | 'marketing-reports' | 'marketing-settings' | 'pos-categories' | 'pos-menu' | 'pos-packages' | 'pos-discounts' | 'pos-billing'

export type NavItem = {
  id: View
  label: string
  icon: React.ElementType
  roles: string[]
  group: string
  feature?: string  // tenant feature flag required to show this item
  subGroup?: string // optional sub-heading within a group's sidebar section (e.g. Marketing → "Create & Publish")
}

export const NAV_GROUPS = [
  { key: 'main',       label: 'Main' },
  { key: 'chat',       label: 'Chat', icon: MessageCircle },
  { key: 'operations', label: 'Operations', icon: Ship },
  { key: 'finance',    label: 'Finance', icon: Wallet },
  { key: 'statistics', label: 'Statistics', icon: TrendingUp },
  { key: 'marketing',  label: 'Marketing', icon: Send },
  { key: 'management', label: 'Management', icon: Shield },
  { key: 'purchasing', label: 'Purchasing & Inventory', icon: ShoppingCart },
  { key: 'pos',        label: 'Point of Sale', icon: Receipt },
  { key: 'hr',         label: 'People & HR', icon: IdCard },
]

export const MARKETING_SUB_GROUPS = [
  { key: 'create-publish', label: 'Create & Publish' },
  { key: 'measure',        label: 'Measure' },
]

export const navigationItems: NavItem[] = [
  { id: 'calendar',      label: 'Dashboard',      icon: Calendar,   roles: ['ADMIN', 'SALES', 'FINANCE', 'MARKETING', 'HR', 'PURCHASING', 'CREW', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR'], group: 'main' },
  { id: 'my-approvals',  label: 'My Approvals',  icon: CheckCircle2, roles: ['SUPER_ADMIN', 'ADMIN', 'SALES', 'FINANCE', 'MARKETING', 'HR', 'PURCHASING', 'WAREHOUSE', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR'], group: 'main' },
  { id: 'my-leave-requests', label: 'Leave Request', icon: CalendarDays, roles: ['SUPER_ADMIN', 'ADMIN', 'SALES', 'FINANCE', 'MARKETING', 'PURCHASING', 'WAREHOUSE', 'HR', 'SALES_MARKETING', 'FINANCE_DIRECTOR', 'CREW', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR'], group: 'main' },
  { id: 'my-business-trips', label: 'Business Trip', icon: Plane, roles: ['SUPER_ADMIN', 'ADMIN', 'SALES', 'FINANCE', 'MARKETING', 'PURCHASING', 'WAREHOUSE', 'HR', 'SALES_MARKETING', 'FINANCE_DIRECTOR', 'CREW', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR'], group: 'main' },
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
  { id: 'finance-business-trip-reimbursements', label: 'Business Trip Reimbursements', icon: Banknote, roles: ['ADMIN', 'FINANCE'], group: 'finance' },
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
  { id: 'roles',         label: 'Roles & Permissions', icon: KeyRound, roles: ['ADMIN', 'SUPER_ADMIN'],                 group: 'management' },
  { id: 'activity-log',  label: 'Activity Log',    icon: Shield,     roles: ['ADMIN'],                                  group: 'management' },
  { id: 'settings',      label: 'Settings',        icon: Settings,   roles: ['ADMIN', 'SUPER_ADMIN'],                   group: 'management' },
  { id: 'purchasing-overview',   label: 'Dashboard',        icon: ShoppingCart,   roles: ['ADMIN', 'PURCHASING'], group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-requests',  label: 'Purchase Requests', icon: ClipboardList,  roles: ['ADMIN', 'PURCHASING', 'WAREHOUSE', 'CREW', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR'],               group: 'purchasing', feature: 'purchasing' },
  { id: 'purchasing-orders',    label: 'Purchase Orders',   icon: FileText,       roles: ['ADMIN', 'PURCHASING', 'WAREHOUSE', 'BOAT_CAPTAIN', 'CRUISE_DIRECTOR'], group: 'purchasing', feature: 'purchasing' },
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
  { id: 'pos-categories', label: 'Categories',      icon: Tag,         roles: ['ADMIN', 'SUPER_ADMIN'], group: 'pos', feature: 'pos' },
  { id: 'pos-menu',       label: 'Menu & Pricing',  icon: Receipt,     roles: ['ADMIN', 'SUPER_ADMIN'], group: 'pos', feature: 'pos' },
  { id: 'pos-packages',   label: 'Packages',        icon: PackagePlus, roles: ['ADMIN', 'SUPER_ADMIN'], group: 'pos', feature: 'pos' },
  { id: 'pos-discounts',  label: 'Discounts',       icon: Percent,     roles: ['ADMIN', 'SUPER_ADMIN'], group: 'pos', feature: 'pos' },
  { id: 'pos-billing',    label: 'Billing History', icon: ClipboardList, roles: ['ADMIN', 'SUPER_ADMIN'], group: 'pos', feature: 'pos' },
  { id: 'hr-overview',   label: 'Overview',       icon: LayoutDashboard, roles: ['ADMIN', 'SUPER_ADMIN', 'HR'],        group: 'hr'         },
  { id: 'hr-employees',  label: 'Employees',      icon: IdCard,     roles: ['ADMIN', 'SUPER_ADMIN', 'HR'],             group: 'hr'         },
  { id: 'hr-leave-requests', label: 'Leave Requests', icon: Calendar, roles: ['ADMIN', 'SUPER_ADMIN', 'HR'],           group: 'hr'         },
  { id: 'hr-business-trips', label: 'Business Trips', icon: Plane, roles: ['ADMIN', 'SUPER_ADMIN', 'HR'],              group: 'hr'         },
  { id: 'hr-candidates', label: 'Talent Pool',    icon: UserPlus,   roles: ['ADMIN', 'SUPER_ADMIN', 'HR'],             group: 'hr'         },
  { id: 'hr-entities-assignments', label: 'Entities & Assignments', icon: Building2, roles: ['ADMIN', 'SUPER_ADMIN', 'HR'], group: 'hr'   },
  { id: 'hr-compensation', label: 'Roles & Compensation', icon: Wallet, roles: ['ADMIN', 'SUPER_ADMIN', 'HR'],         group: 'hr'         },
  { id: 'hr-performance-reviews', label: 'Performance Reviews', icon: Star, roles: ['ADMIN', 'SUPER_ADMIN', 'HR'],     group: 'hr'         },
  { id: 'hr-payroll',    label: 'Payroll', icon: Banknote, roles: ['ADMIN', 'SUPER_ADMIN', 'HR', 'FINANCE'],           group: 'hr'         },
  { id: 'hr-attendance', label: 'Attendance Recap', icon: CalendarCheck, roles: ['ADMIN', 'SUPER_ADMIN', 'HR'],        group: 'hr'         },
  { id: 'hr-national-holidays', label: 'National Holidays', icon: CalendarOff, roles: ['ADMIN', 'SUPER_ADMIN', 'HR'], group: 'hr'         },
  // Phase 1: HR-only while the weekend/holiday-only rule and approval flow get tried out
  // internally — see src/app/api/hr/overtime/mine/route.ts. Once confirmed, "My Overtime"
  // moves to the 'main' group with the same broad roles list as my-business-trips above,
  // so every user can self-file — the HR queue below stays as-is either way.
  { id: 'my-overtime', label: 'My Overtime', icon: Clock, roles: ['ADMIN', 'SUPER_ADMIN', 'HR'],                      group: 'hr'         },
  { id: 'hr-overtime', label: 'Overtime',    icon: Clock, roles: ['ADMIN', 'SUPER_ADMIN', 'HR'],                      group: 'hr'         },
  { id: 'hr-loans', label: 'Employee Loans & Cash Bon', icon: HandCoins, roles: ['ADMIN', 'SUPER_ADMIN', 'HR', 'FINANCE'], group: 'hr'    },
  { id: 'hr-boat-documents', label: 'Boat Documents', icon: Anchor, roles: ['ADMIN', 'SUPER_ADMIN', 'HR'],                 group: 'hr'    },
]
