'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Plus, Edit, Trash2, Eye, EyeOff, Search, IdCard } from 'lucide-react'

type Role = 'ADMIN' | 'SUPER_ADMIN' | 'SALES' | 'FINANCE' | 'MARKETING' | 'MARKETING_DIRECTOR' | 'PURCHASING' | 'WAREHOUSE' | 'HR' | 'SALES_MARKETING' | 'FINANCE_DIRECTOR' | 'CREW' | 'BOAT_CAPTAIN' | 'CRUISE_DIRECTOR'
type PurchasingDivision = 'BOAT_OPERATION' | 'BUILDING_MATERIAL'

interface UserRecord {
  id: string
  name: string | null
  email: string
  role: Role
  createdAt: string
  purchasingDivision: PurchasingDivision | null
  assignedYachtId: string | null
  employeeProfile: { id: string; fullName: string; employeeNumber: string } | null
}

const DIVISIONS: { value: PurchasingDivision; label: string }[] = [
  { value: 'BOAT_OPERATION',   label: 'Boat Operation' },
  { value: 'BUILDING_MATERIAL', label: 'Building Material' },
]

interface EmployeeOption { id: string; fullName: string; employeeNumber: string }

function EmployeeCombobox({ value, options, onChange }: {
  value: string; options: EmployeeOption[]; onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const opts = q ? options.filter(e => e.fullName.toLowerCase().includes(q) || e.employeeNumber.toLowerCase().includes(q)) : options
  const selected = options.find(e => e.id === value)

  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full h-9 border rounded-md px-3 text-sm text-left flex items-center justify-between bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors">
        <span className={selected ? '' : 'text-muted-foreground'}>{selected ? `${selected.fullName} (${selected.employeeNumber})` : '— No employee linked —'}</span>
        <IdCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-xl z-50 max-h-60 flex flex-col">
            <div className="p-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input autoFocus className="w-full h-8 border rounded px-2.5 pl-8 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="overflow-y-auto">
              {value && (
                <button type="button" onClick={() => { onChange(''); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted border-b transition-colors">
                  — No employee linked —
                </button>
              )}
              {opts.length === 0 && (
                <p className="px-3 py-3 text-sm text-muted-foreground">No employees found</p>
              )}
              {opts.map(e => (
                <button key={e.id} type="button" onClick={() => { onChange(e.id); setOpen(false); setSearch('') }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors">
                  {e.fullName} <span className="text-muted-foreground">({e.employeeNumber})</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const ROLES: { value: Role; label: string; desc: string; color: string; modules: string }[] = [
  {
    value: 'SALES',
    label: 'Sales',
    desc: 'Manage bookings & guests',
    color: 'bg-blue-100 text-blue-700',
    modules: 'Dashboard, Bookings, Open Trips, Guests',
  },
  {
    value: 'SALES_MARKETING',
    label: 'Sales & Marketing',
    desc: 'Combined role — full Sales + Marketing access',
    color: 'bg-indigo-100 text-indigo-700',
    modules: 'Everything Sales and Marketing can access',
  },
  {
    value: 'FINANCE',
    label: 'Finance',
    desc: 'Financial overview & costs',
    color: 'bg-emerald-100 text-emerald-700',
    modules: 'Dashboard, Statistics, Expenses, Maintenance, Bookings',
  },
  {
    value: 'MARKETING',
    label: 'Marketing',
    desc: 'Trips & customer reach',
    color: 'bg-orange-100 text-orange-700',
    modules: 'Dashboard, Open Trips, Guests, Email Campaigns, Email Templates',
  },
  {
    value: 'MARKETING_DIRECTOR',
    label: 'Marketing Director',
    desc: 'Everything Marketing can do, plus approval authority',
    color: 'bg-fuchsia-100 text-fuchsia-700',
    modules: 'Same as Marketing — plus approving Content Studio items and moving campaigns out of Approval',
  },
  {
    value: 'PURCHASING',
    label: 'Purchasing',
    desc: 'Manage procurement',
    color: 'bg-amber-100 text-amber-700',
    modules: 'Purchasing (PR, PO, Suppliers, Items, Stock)',
  },
  {
    value: 'WAREHOUSE',
    label: 'Warehouse',
    desc: 'Receive & check incoming goods',
    color: 'bg-teal-100 text-teal-700',
    modules: 'Purchasing (PO, Stock, Transfers, Stock Counts)',
  },
  {
    value: 'HR',
    label: 'HR',
    desc: 'People & employee records',
    color: 'bg-pink-100 text-pink-700',
    modules: 'Trip Sheet',
  },
  {
    value: 'FINANCE_DIRECTOR',
    label: 'Finance Director',
    desc: 'Combined role — full Purchasing + Finance + HR access',
    color: 'bg-cyan-100 text-cyan-700',
    modules: 'Everything Purchasing, Finance, and HR can access',
  },
  {
    value: 'CREW',
    label: 'Crew',
    desc: 'Ship crew — file purchase requests',
    color: 'bg-sky-100 text-sky-700',
    modules: 'Purchasing (Purchase Requests only)',
  },
  {
    value: 'BOAT_CAPTAIN',
    label: 'Boat Captain',
    desc: 'File & approve crew purchase requests',
    color: 'bg-blue-100 text-blue-700',
    modules: 'Purchasing (Purchase Requests, My Approvals)',
  },
  {
    value: 'CRUISE_DIRECTOR',
    label: 'Cruise Director',
    desc: 'File & approve crew purchase requests',
    color: 'bg-indigo-100 text-indigo-700',
    modules: 'Purchasing (Purchase Requests, My Approvals)',
  },
  {
    value: 'ADMIN',
    label: 'Admin',
    desc: 'Full access',
    color: 'bg-purple-100 text-purple-700',
    modules: 'All Modules',
  },
  {
    value: 'SUPER_ADMIN',
    label: 'Super Admin',
    desc: 'System administration',
    color: 'bg-red-100 text-red-700',
    modules: 'All Modules',
  },
]

const roleMeta = (role: Role) =>
  ROLES.find(r => r.value === role) ?? {
    value: role,
    label: role,
    desc: '',
    color: 'bg-gray-100 text-gray-700',
    modules: '-',
  }

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

export default function UsersPage() {
  const { data: session } = useSession()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [yachts, setYachts] = useState<{ id: string; name: string }[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserRecord | null>(null)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState<Role>('SALES')
  const [formEmployeeId, setFormEmployeeId] = useState('')
  const [formPurchasingDivision, setFormPurchasingDivision] = useState<PurchasingDivision | ''>('')
  const [formAssignedYachtId, setFormAssignedYachtId] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchUsers = async () => {
    setLoading(true)
    const res = await fetch('/api/users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }

  const fetchEmployees = async () => {
    const res = await fetch('/api/hr/employees')
    if (res.ok) setEmployees(await res.json())
  }

  const fetchYachts = async () => {
    const res = await fetch('/api/yachts')
    if (res.ok) {
      const data = await res.json() as { id: string; name: string }[]
      setYachts(data.map(y => ({ id: y.id, name: y.name })))
    }
  }

  useEffect(() => { fetchUsers(); fetchEmployees(); fetchYachts() }, [])

  // Employees already linked to a different login shouldn't be pickable here —
  // the currently-selected one stays visible so switching back is possible.
  const employeeOptions = employees.filter(e => e.id === formEmployeeId || !users.some(u => u.employeeProfile?.id === e.id && u.id !== editUser?.id))

  const openAdd = () => {
    setEditUser(null)
    setFormName(''); setFormEmail(''); setFormPassword(''); setFormRole('SALES'); setFormEmployeeId('')
    setFormPurchasingDivision(''); setFormAssignedYachtId('')
    setShowPw(false); setFormError('')
    setDialogOpen(true)
  }

  const openEdit = (u: UserRecord) => {
    setEditUser(u)
    setFormName(u.name ?? ''); setFormEmail(u.email); setFormPassword(''); setFormRole(u.role)
    setFormEmployeeId(u.employeeProfile?.id ?? '')
    setFormPurchasingDivision(u.purchasingDivision ?? '')
    setFormAssignedYachtId(u.assignedYachtId ?? '')
    setShowPw(false); setFormError('')
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setFormError('')
    setSaving(true)
    try {
      if (editUser) {
        const body: Record<string, string> = { name: formName, email: formEmail, role: formRole, employeeId: formEmployeeId, purchasingDivision: formPurchasingDivision, assignedYachtId: formAssignedYachtId }
        if (formPassword) body.password = formPassword
        const res = await fetch(`/api/users/${editUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) { const d = await res.json(); setFormError(d.error ?? 'Failed'); return }
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName, email: formEmail, password: formPassword, role: formRole, employeeId: formEmployeeId, purchasingDivision: formPurchasingDivision, assignedYachtId: formAssignedYachtId }),
        })
        if (!res.ok) { const d = await res.json(); setFormError(d.error ?? 'Failed'); return }
      }
      setDialogOpen(false)
      fetchUsers()
      fetchEmployees()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    await fetch(`/api/users/${deleteTarget.id}`, { method: 'DELETE' })
    setDeleting(false)
    setDeleteTarget(null)
    fetchUsers()
  }

  const countsByRole = ROLES.filter(r => r.value !== 'SUPER_ADMIN').map(r => ({ ...r, count: users.filter(u => u.role === r.value).length }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Team Management</h3>
          <p className="text-muted-foreground">Manage user accounts and access levels</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Role summary cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {countsByRole.map(r => (
          <Card key={r.value}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${r.color}`}>
                  {r.label}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{r.count}</div>
              <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Users table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>{users.length} accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table className="table-fixed w-full">
              <colgroup>
                <col className="w-44" />
                <col className="w-52" />
                <col className="w-28" />
                <col />
                <col className="w-32" />
                <col className="w-24" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Module Access</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(6)].map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-muted animate-pulse rounded" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : users.map(u => {
                  const meta = roleMeta(u.role)
                  const isSelf = u.id === session?.user.id
                  const moduleList = meta.modules.split(', ')
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-[#1a5f6e] text-white flex items-center justify-center text-xs font-bold uppercase shrink-0">
                            {(u.name ?? u.email).charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate flex items-center gap-1.5">
                              {u.name ?? '—'}
                              {isSelf && (
                                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">you</span>
                              )}
                            </p>
                            {u.employeeProfile && (
                              <p className="text-[11px] text-muted-foreground truncate" title="Linked employee">
                                {u.employeeProfile.fullName} ({u.employeeProfile.employeeNumber})
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm truncate">{u.email}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${meta.color}`}>
                          {meta.label}
                        </span>
                        {u.purchasingDivision && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {DIVISIONS.find(d => d.value === u.purchasingDivision)?.label}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {moduleList.map(m => (
                            <span key={m} className="inline-block text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full whitespace-nowrap">
                              {m}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{fmtDate(u.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={isSelf}
                            title={isSelf ? 'Cannot delete your own account' : 'Delete user'}
                            onClick={() => setDeleteTarget(u)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editUser ? 'Edit User' : 'Add New User'}</DialogTitle>
            <DialogDescription>
              {editUser ? 'Update user details and role.' : 'Create a new account for a team member.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input
                  placeholder="John Doe"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input
                  type="email"
                  placeholder="user@samara.com"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                {editUser ? 'New Password' : 'Password'}
                {!editUser && <span className="text-destructive"> *</span>}
              </Label>
              <div className="relative">
                <Input
                  type={showPw ? 'text' : 'password'}
                  placeholder={editUser ? 'Leave blank to keep current password' : 'Min. 8 characters'}
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Role <span className="text-destructive">*</span></Label>
              <Select value={formRole} onValueChange={v => setFormRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter(r => r.value !== 'SUPER_ADMIN').map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${r.color}`}>
                          {r.label}
                        </span>
                        <span className="text-muted-foreground text-xs">{r.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formRole === 'PURCHASING' && (
              <div className="space-y-1.5">
                <Label>Purchasing Division</Label>
                <Select value={formPurchasingDivision || 'NONE'} onValueChange={v => setFormPurchasingDivision(v === 'NONE' ? '' : v as PurchasingDivision)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— Not assigned (sees every request) —</SelectItem>
                    {DIVISIONS.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Requests submitted for this division only notify and show up for this person (plus Admin/Super Admin).</p>
              </div>
            )}

            {(formRole === 'BOAT_CAPTAIN' || formRole === 'CRUISE_DIRECTOR') && (
              <div className="space-y-1.5">
                <Label>Assigned Yacht <span className="text-destructive">*</span></Label>
                <Select value={formAssignedYachtId || 'NONE'} onValueChange={v => setFormAssignedYachtId(v === 'NONE' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— Select a yacht —</SelectItem>
                    {yachts.map(y => (
                      <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Which yacht this person captains/directs — they only get notified about deliveries to this yacht.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Link to Employee</Label>
              <EmployeeCombobox value={formEmployeeId} options={employeeOptions} onChange={setFormEmployeeId} />
              <p className="text-[11px] text-muted-foreground">Connects this login to an HR employee record for approvals and org-chart lookups.</p>
            </div>

            {/* Access preview */}
            <div className="rounded-lg bg-muted/40 border px-3 py-2.5 text-xs space-y-1">
              <p className="font-semibold text-foreground mb-1">Module Access</p>
              <p className="text-muted-foreground">{ROLES.find(r => r.value === formRole)?.modules}</p>
            </div>

            {formError && (
              <p className="text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded-lg px-3 py-2">
                {formError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={saving || !formEmail || (!editUser && !formPassword)}
              onClick={handleSave}
            >
              {saving ? 'Saving...' : editUser ? 'Save Changes' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name ?? deleteTarget?.email}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? 'Deleting...' : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
