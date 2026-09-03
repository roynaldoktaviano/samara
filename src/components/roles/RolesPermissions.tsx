'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { KeyRound, Search, RotateCcw, Save, Lock, ShieldCheck } from 'lucide-react'

type RoleKey = 'SUPER_ADMIN' | 'ADMIN' | 'SALES' | 'FINANCE' | 'MARKETING' | 'MARKETING_DIRECTOR' | 'PURCHASING' | 'WAREHOUSE' | 'HR' | 'SALES_MARKETING' | 'FINANCE_DIRECTOR' | 'CREW' | 'BOAT_CAPTAIN' | 'CRUISE_DIRECTOR'

interface RoleRow { role: RoleKey; modules: string[]; isCustomized: boolean }
interface ModuleDef { id: string; label: string; group: string; subGroup?: string; feature?: string }
interface GroupDef { key: string; label: string }

const ROLE_META: Record<RoleKey, { label: string; desc: string; color: string }> = {
  ADMIN:             { label: 'Admin',             desc: 'Full access by default',                            color: 'bg-purple-100 text-purple-700' },
  SUPER_ADMIN:       { label: 'Super Admin',        desc: 'System administration',                             color: 'bg-red-100 text-red-700' },
  SALES:             { label: 'Sales',              desc: 'Manage bookings & guests',                          color: 'bg-blue-100 text-blue-700' },
  SALES_MARKETING:   { label: 'Sales & Marketing',  desc: 'Combined role',                                     color: 'bg-indigo-100 text-indigo-700' },
  FINANCE:           { label: 'Finance',            desc: 'Financial overview & costs',                        color: 'bg-emerald-100 text-emerald-700' },
  MARKETING:         { label: 'Marketing',          desc: 'Trips & customer reach',                            color: 'bg-orange-100 text-orange-700' },
  MARKETING_DIRECTOR:{ label: 'Marketing Director',  desc: 'Marketing + approval authority',                    color: 'bg-fuchsia-100 text-fuchsia-700' },
  PURCHASING:        { label: 'Purchasing',         desc: 'Manage procurement',                                color: 'bg-amber-100 text-amber-700' },
  WAREHOUSE:         { label: 'Warehouse',          desc: 'Receive & check incoming goods',                    color: 'bg-teal-100 text-teal-700' },
  HR:                { label: 'HR',                 desc: 'People & employee records',                         color: 'bg-pink-100 text-pink-700' },
  FINANCE_DIRECTOR:  { label: 'Finance Director',   desc: 'Combined role',                                     color: 'bg-cyan-100 text-cyan-700' },
  CREW:              { label: 'Crew',               desc: 'Ship crew — Purchase Request only',                 color: 'bg-sky-100 text-sky-700' },
  BOAT_CAPTAIN:      { label: 'Boat Captain',        desc: 'Purchase Request + approves crew requests',        color: 'bg-blue-100 text-blue-700' },
  CRUISE_DIRECTOR:   { label: 'Cruise Director',     desc: 'Purchase Request + approves crew requests',        color: 'bg-indigo-100 text-indigo-700' },
}

// Mirrors ALWAYS_ON in src/lib/role-permissions.ts — kept in sync manually since that file
// isn't safe to import from a client bundle (it types against @prisma/client).
const FORCED_MODULES: Partial<Record<RoleKey, string[]>> = {
  ADMIN: ['users', 'roles'],
  SUPER_ADMIN: ['users', 'roles'],
}

export default function RolesPermissions() {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [modules, setModules] = useState<ModuleDef[]>([])
  const [groups, setGroups] = useState<GroupDef[]>([])
  const [selectedRole, setSelectedRole] = useState<RoleKey>('ADMIN')
  const [draft, setDraft] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/roles')
      if (res.ok) {
        const data = await res.json()
        setRoles(data.roles)
        setModules(data.modules)
        setGroups(data.groups)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const current = roles.find(r => r.role === selectedRole)

  useEffect(() => {
    if (current) setDraft(new Set(current.modules))
  }, [current?.role, current?.modules.join(',')])

  const forced = FORCED_MODULES[selectedRole] ?? []
  const dirty = useMemo(() => {
    if (!current) return false
    const orig = new Set(current.modules)
    if (orig.size !== draft.size) return true
    for (const id of orig) if (!draft.has(id)) return true
    return false
  }, [current, draft])

  const toggle = (id: string) => {
    if (forced.includes(id)) return
    setDraft(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/roles/${selectedRole}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: Array.from(draft) }),
      })
      if (!res.ok) { toast.error('Failed to save'); return }
      const updated = await res.json()
      setRoles(prev => prev.map(r => r.role === selectedRole ? { ...r, modules: updated.modules, isCustomized: true } : r))
      toast.success(`Saved permissions for ${ROLE_META[selectedRole].label}`)
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  const resetToDefault = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/roles/${selectedRole}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to reset'); return }
      const updated = await res.json()
      setRoles(prev => prev.map(r => r.role === selectedRole ? { ...r, modules: updated.modules, isCustomized: false } : r))
      setDraft(new Set(updated.modules))
      toast.success(`Reset ${ROLE_META[selectedRole].label} to default`)
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  const filteredModules = modules.filter(m => m.label.toLowerCase().includes(search.trim().toLowerCase()))
  const groupedModules = groups
    .map(g => ({ group: g, items: filteredModules.filter(m => m.group === g.key) }))
    .filter(g => g.items.length > 0)

  if (loading) {
    return <div className="text-sm text-muted-foreground py-10 text-center">Loading roles…</div>
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <KeyRound className="w-6 h-6" /> Roles &amp; Permissions
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Choose which modules each role can open in the sidebar. Roles themselves are fixed —
          this only controls their module access.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
        <Card className="h-fit">
          <CardContent className="p-2">
            {roles.map(r => {
              const meta = ROLE_META[r.role]
              return (
                <button
                  key={r.role}
                  onClick={() => setSelectedRole(r.role)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 mb-1 transition-colors ${
                    selectedRole === r.role ? 'bg-muted' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge className={`${meta.color} border-0 font-medium`}>{meta.label}</Badge>
                    {r.isCustomized && <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{r.modules.length} modules enabled</p>
                </button>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Badge className={`${ROLE_META[selectedRole].color} border-0 font-medium`}>{ROLE_META[selectedRole].label}</Badge>
                {current?.isCustomized && <span className="text-xs font-normal text-muted-foreground">customized</span>}
              </CardTitle>
              <CardDescription>{ROLE_META[selectedRole].desc}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={resetToDefault} disabled={saving || !current?.isCustomized}>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset to Default
              </Button>
              <Button size="sm" onClick={save} disabled={saving || !dirty} className="bg-[#bdac7e] hover:bg-[#a89660] text-white">
                <Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Search modules…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
            </div>

            {groupedModules.map(({ group, items }) => (
              <div key={group.key}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{group.label}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                  {items.map(m => {
                    const isForced = forced.includes(m.id)
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${isForced ? 'opacity-70' : 'cursor-pointer hover:bg-muted/50'}`}
                      >
                        <Checkbox checked={draft.has(m.id)} disabled={isForced} onCheckedChange={() => toggle(m.id)} />
                        <span className="text-sm">{m.label}</span>
                        {m.feature && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{m.feature}</Badge>}
                        {isForced && <Lock className="w-3 h-3 text-muted-foreground" />}
                      </label>
                    )
                  })}
                </div>
                <Separator className="mt-4" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
