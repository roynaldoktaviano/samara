'use client'

import { useState, useEffect, useCallback } from 'react'
import { Wallet, Pencil, Trash2, Plus, TrendingUp, TrendingDown, CheckCircle2, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'sonner'
import { formatMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'

interface LocationLite { id: string; name: string }
interface RoleLite { id: string; title: string; isActive: boolean; location: LocationLite | null }
interface Band { id: string; roleId: string; level: 'HIGH' | 'MEDIUM' | 'LOW'; minSalary: number; maxSalary: number; role: { id: string; title: string } }
interface EmployeeRow {
  id: string; fullName: string; employeeNumber: string; isActive: boolean
  basicSalary: number | null; level: 'HIGH' | 'MEDIUM' | 'LOW' | null
  role: { id: string; title: string } | null
}

const LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const
const LEVEL_LABEL: Record<string, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' }
const LEVEL_COLOR: Record<string, string> = {
  HIGH: 'bg-success/10 border-success/30 text-success',
  MEDIUM: 'bg-warning/10 border-warning/30 text-warning',
  LOW: 'bg-muted/50 border-border text-muted-foreground',
}

const ROLE_BLANK = { title: '', locationId: '' }

export default function CompensationPage() {
  const [roles, setRoles] = useState<RoleLite[]>([])
  const [locations, setLocations] = useState<LocationLite[]>([])
  const [bands, setBands] = useState<Band[]>([])
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [loading, setLoading] = useState(true)

  // Compensation band edit modal
  const [editing, setEditing] = useState<{ roleId: string; roleTitle: string; level: typeof LEVELS[number]; band: Band | null } | null>(null)
  const [form, setForm] = useState({ minSalary: '', maxSalary: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Role add/edit modal
  const [roleModal, setRoleModal] = useState<{ role: RoleLite | null } | null>(null)
  const [roleForm, setRoleForm] = useState({ ...ROLE_BLANK })
  const [roleSaving, setRoleSaving] = useState(false)
  const [roleFormError, setRoleFormError] = useState('')
  const confirm = useConfirm()

  const load = useCallback(async () => {
    setLoading(true)
    const [roleRes, locRes, bandRes, empRes] = await Promise.all([
      fetch('/api/hr/roles?all=1'), fetch('/api/hr/work-locations'), fetch('/api/hr/compensation-bands'), fetch('/api/hr/employees'),
    ])
    if (roleRes.ok) setRoles(await roleRes.json())
    if (locRes.ok) setLocations(await locRes.json())
    if (bandRes.ok) setBands(await bandRes.json())
    if (empRes.ok) setEmployees(await empRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openEdit(roleId: string, roleTitle: string, level: typeof LEVELS[number]) {
    const band = bands.find(b => b.roleId === roleId && b.level === level) ?? null
    setForm({ minSalary: band ? String(band.minSalary) : '', maxSalary: band ? String(band.maxSalary) : '' })
    setEditing({ roleId, roleTitle, level, band })
    setFormError('')
  }

  async function save() {
    if (!editing) return
    setSaving(true); setFormError('')
    const res = await fetch('/api/hr/compensation-bands', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId: editing.roleId, level: editing.level, minSalary: form.minSalary, maxSalary: form.maxSalary }),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error ?? 'An error occurred'); setSaving(false); return }
    setEditing(null); setSaving(false); load()
  }

  function openAddRole() { setRoleForm({ ...ROLE_BLANK }); setRoleFormError(''); setRoleModal({ role: null }) }
  function openEditRole(role: RoleLite) { setRoleForm({ title: role.title, locationId: role.location?.id ?? '' }); setRoleFormError(''); setRoleModal({ role }) }

  async function saveRole() {
    if (!roleForm.title.trim()) { setRoleFormError('Title is required'); return }
    setRoleSaving(true); setRoleFormError('')
    const url = roleModal?.role ? `/api/hr/roles/${roleModal.role.id}` : '/api/hr/roles'
    const res = await fetch(url, {
      method: roleModal?.role ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: roleForm.title, locationId: roleForm.locationId || null }),
    })
    const data = await res.json()
    if (!res.ok) { setRoleFormError(data.error ?? 'An error occurred'); setRoleSaving(false); return }
    setRoleModal(null); setRoleSaving(false); load()
  }

  async function toggleRoleActive(role: RoleLite) {
    await fetch(`/api/hr/roles/${role.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !role.isActive }),
    })
    load()
  }

  async function deleteRole(role: RoleLite) {
    if (!(await confirm({
      title: 'Delete Role?',
      description: (
        <>
          <span className="font-medium text-foreground">{role.title}</span> and its compensation bands will be removed permanently.
          Roles still assigned to an employee or candidate can&apos;t be deleted — deactivate it instead.
        </>
      ),
      destructive: true,
    }))) return
    const res = await fetch(`/api/hr/roles/${role.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Failed to delete') }
    load()
  }

  const bandFor = (roleId: string, level: string) => bands.find(b => b.roleId === roleId && b.level === level) ?? null

  const activeWithSalary = employees.filter(e => e.isActive && e.basicSalary != null && e.role && e.level)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Roles & Compensation</h2>
          <p className="text-muted-foreground text-sm mt-1">Approved salary range per role and skill level, and where each employee sits against it</p>
        </div>
        <Button onClick={openAddRole}>
          <Plus /> Add Role
        </Button>
      </div>

      {loading ? (
        <div className="rounded-xl border p-5 animate-pulse h-64" />
      ) : (
        <>
          {/* Compensation bands grid */}
          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  {LEVELS.map(l => <th key={l} className="text-center px-4 py-3 font-medium">{LEVEL_LABEL[l]}</th>)}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {roles.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">No roles defined yet.</td></tr>
                ) : roles.map(role => (
                  <tr key={role.id} className={`hover:bg-muted/20 ${!role.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{role.title}</p>
                      {role.location && <p className="text-xs text-muted-foreground">{role.location.name}</p>}
                    </td>
                    {LEVELS.map(level => {
                      const band = bandFor(role.id, level)
                      return (
                        <td key={level} className="px-4 py-3 text-center">
                          <button onClick={() => openEdit(role.id, role.title, level)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:opacity-80 ${band ? LEVEL_COLOR[level] : 'border-dashed text-muted-foreground'}`}>
                            {band ? `${formatMoney(band.minSalary)} – ${formatMoney(band.maxSalary)}` : 'Set range'}
                            <Pencil className="h-3 w-3" />
                          </button>
                        </td>
                      )
                    })}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => toggleRoleActive(role)} className="size-7"
                          title={role.isActive ? 'Deactivate' : 'Activate'} aria-label={role.isActive ? 'Deactivate role' : 'Activate role'}>
                          {role.isActive
                            ? <ToggleRight className="size-5 text-success" />
                            : <ToggleLeft className="size-5 text-muted-foreground" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditRole(role)} className="size-7 text-muted-foreground" aria-label="Edit role">
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteRole(role)} className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" aria-label="Delete role">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          {/* Employee position vs range */}
          <div className="rounded-xl border overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b bg-muted/20">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Salary Position vs. Approved Range</h3>
            </div>
            {activeWithSalary.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                No active employees have both a Role, Level, and Basic Salary set yet — fill these in on the Employees page to see them here.
              </p>
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Employee</th>
                    <th className="text-left px-4 py-3 font-medium">Role</th>
                    <th className="text-center px-4 py-3 font-medium">Level</th>
                    <th className="text-right px-4 py-3 font-medium">Basic Salary</th>
                    <th className="text-left px-4 py-3 font-medium">Approved Range</th>
                    <th className="text-center px-4 py-3 font-medium">Position</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activeWithSalary.map(e => {
                    const band = bandFor(e.role!.id, e.level!)
                    const salary = e.basicSalary!
                    let position: { label: string; color: string; icon: React.ElementType } | null = null
                    if (band) {
                      if (salary < band.minSalary) position = { label: 'Below range', color: 'text-destructive', icon: TrendingDown }
                      else if (salary > band.maxSalary) position = { label: 'Above range', color: 'text-info', icon: TrendingUp }
                      else position = { label: 'Within range', color: 'text-success', icon: CheckCircle2 }
                    }
                    return (
                      <tr key={e.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <p className="font-medium">{e.fullName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{e.employeeNumber}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{e.role?.title}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${LEVEL_COLOR[e.level!]}`}>{LEVEL_LABEL[e.level!]}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{formatMoney(salary)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{band ? `${formatMoney(band.minSalary)} – ${formatMoney(band.maxSalary)}` : 'No range set'}</td>
                        <td className="px-4 py-3 text-center">
                          {position ? (
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${position.color}`}>
                              <position.icon className="h-3.5 w-3.5" /> {position.label}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            )}
          </div>
        </>
      )}

      {/* ── Edit Band Modal ── */}
      <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null) }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="font-bold text-sm pr-6">{editing ? `${editing.roleTitle} — ${LEVEL_LABEL[editing.level]}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {formError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{formError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="comp-band-min" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Min Salary</Label>
                <Input id="comp-band-min" type="number" className="h-10"
                  value={form.minSalary} onChange={e => setForm(f => ({ ...f, minSalary: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comp-band-max" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Max Salary</Label>
                <Input id="comp-band-max" type="number" className="h-10"
                  value={form.maxSalary} onChange={e => setForm(f => ({ ...f, maxSalary: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} loading={saving} className="font-semibold">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Role Modal ── */}
      <Dialog open={!!roleModal} onOpenChange={o => { if (!o) setRoleModal(null) }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="font-bold text-sm pr-6">{roleModal?.role ? 'Edit Role' : 'Add Role'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {roleFormError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{roleFormError}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="comp-role-title" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title</Label>
              <Input id="comp-role-title" autoFocus className="h-10"
                value={roleForm.title} onChange={e => setRoleForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-role-location" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</Label>
              <NativeSelect id="comp-role-location" className="h-10"
                value={roleForm.locationId} onChange={e => setRoleForm(f => ({ ...f, locationId: e.target.value }))}>
                <option value="">— Not location-specific —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </NativeSelect>
              <p className="text-[11px] text-muted-foreground">Optional — set this if the role only exists at one location (e.g. a role specific to one vessel).</p>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/50">
            <Button variant="outline" onClick={() => setRoleModal(null)}>Cancel</Button>
            <Button onClick={saveRole} loading={roleSaving} className="font-semibold">
              {roleSaving ? 'Saving…' : roleModal?.role ? 'Save Changes' : 'Add Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
