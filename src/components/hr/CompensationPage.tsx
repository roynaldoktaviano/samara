'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pencil, Trash2, Plus, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'

interface LocationLite { id: string; name: string }
interface RoleLite { id: string; title: string; isActive: boolean; location: LocationLite | null; jobDescription: string | null }

const ROLE_BLANK = { title: '', locationId: '', jobDescription: '' }

export default function CompensationPage() {
  const [roles, setRoles] = useState<RoleLite[]>([])
  const [locations, setLocations] = useState<LocationLite[]>([])
  const [loading, setLoading] = useState(true)

  // Role add/edit modal
  const [roleModal, setRoleModal] = useState<{ role: RoleLite | null } | null>(null)
  const [roleForm, setRoleForm] = useState({ ...ROLE_BLANK })
  const [roleSaving, setRoleSaving] = useState(false)
  const [roleFormError, setRoleFormError] = useState('')
  const confirm = useConfirm()

  const load = useCallback(async () => {
    setLoading(true)
    const [roleRes, locRes] = await Promise.all([fetch('/api/hr/roles?all=1'), fetch('/api/hr/work-locations')])
    if (roleRes.ok) setRoles(await roleRes.json())
    if (locRes.ok) setLocations(await locRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAddRole() { setRoleForm({ ...ROLE_BLANK }); setRoleFormError(''); setRoleModal({ role: null }) }
  function openEditRole(role: RoleLite) { setRoleForm({ title: role.title, locationId: role.location?.id ?? '', jobDescription: role.jobDescription ?? '' }); setRoleFormError(''); setRoleModal({ role }) }

  async function saveRole() {
    if (!roleForm.title.trim()) { setRoleFormError('Title is required'); return }
    setRoleSaving(true); setRoleFormError('')
    const url = roleModal?.role ? `/api/hr/roles/${roleModal.role.id}` : '/api/hr/roles'
    const res = await fetch(url, {
      method: roleModal?.role ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: roleForm.title, locationId: roleForm.locationId || null, jobDescription: roleForm.jobDescription }),
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
          <span className="font-medium text-foreground">{role.title}</span> will be removed permanently.
          Roles still assigned to an employee or candidate can&apos;t be deleted — deactivate it instead.
        </>
      ),
      destructive: true,
    }))) return
    const res = await fetch(`/api/hr/roles/${role.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Failed to delete') }
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Roles</h2>
          <p className="text-muted-foreground text-sm mt-1">Job roles that can be assigned to employees and candidates</p>
        </div>
        <Button onClick={openAddRole}>
          <Plus /> Add Role
        </Button>
      </div>

      {loading ? (
        <div className="rounded-xl border p-5 animate-pulse h-64" />
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Location</th>
                <th className="text-left px-4 py-3 font-medium">Job Description</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {roles.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">No roles defined yet.</td></tr>
              ) : roles.map(role => (
                <tr key={role.id} className={`hover:bg-muted/20 ${!role.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium">{role.title}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{role.location?.name ?? 'All locations'}</td>
                  <td className="px-4 py-3 text-xs max-w-80">
                    {role.jobDescription
                      ? <button type="button" onClick={() => openEditRole(role)} className="block w-full text-left truncate text-muted-foreground hover:text-foreground" title={role.jobDescription}>{role.jobDescription}</button>
                      : <span className="text-muted-foreground/60">Not set</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{role.isActive ? 'Active' : 'Inactive'}</td>
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
      )}

      {/* ── Add/Edit Role Modal ── */}
      <Dialog open={!!roleModal} onOpenChange={o => { if (!o) setRoleModal(null) }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-lg p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="font-bold text-sm pr-6">{roleModal?.role ? 'Edit Role' : 'Add Role'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
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
            <div className="space-y-1.5">
              <Label htmlFor="comp-role-job-description" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Job Description</Label>
              <Textarea id="comp-role-job-description" rows={8} className="resize-y text-sm"
                placeholder={'Responsibilities, requirements, qualifications…'}
                value={roleForm.jobDescription} onChange={e => setRoleForm(f => ({ ...f, jobDescription: e.target.value }))} />
              <p className="text-[11px] text-muted-foreground">Filled in automatically when a supervisor requests recruitment for this role.</p>
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
