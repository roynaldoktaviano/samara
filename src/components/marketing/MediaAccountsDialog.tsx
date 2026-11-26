'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusBadge } from '@/components/ui/status-badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { ChevronLeft, KeyRound, Loader2, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { formatDate, formatRelative } from '@/lib/format'

interface MediaAccount {
  id: string
  name: string
  email: string
  organization: string | null
  note: string | null
  portalActive: boolean
  hasPassword: boolean
  portalPasswordSetAt: string | null
  lastLoginAt: string | null
  createdAt: string
  visibleCategoryIds: string[]
}

interface CategoryOption { id: string; name: string }

interface FormState {
  name: string
  email: string
  organization: string
  note: string
  password: string
  restricted: boolean
  categoryIds: string[]
}

const EMPTY_FORM: FormState = { name: '', email: '', organization: '', note: '', password: '', restricted: false, categoryIds: [] }

/**
 * Press / media logins for the Agent Portal ("Media" tab on its sign-in screen). Media
 * accounts see the yacht resource library and Press & Media, never the availability calendar.
 */
export default function MediaAccountsDialog({ open, onOpenChange, categories }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: CategoryOption[]
}) {
  const confirm = useConfirm()
  const [accounts, setAccounts] = useState<MediaAccount[]>([])
  const [loading, setLoading] = useState(true)
  // null = list view; 'new' = create form; otherwise the account being edited.
  const [editing, setEditing] = useState<MediaAccount | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Refetched every time the dialog opens; the spinner only shows before the first load.
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/media-accounts')
      if (res.ok) setAccounts(await res.json())
      else toast.error('Failed to load media accounts')
    } catch { toast.error('Failed to load media accounts') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  function handleOpenChange(next: boolean) {
    if (!next) setEditing(null)
    onOpenChange(next)
  }

  function startCreate() {
    setForm(EMPTY_FORM)
    setEditing('new')
  }

  function startEdit(a: MediaAccount) {
    setForm({
      name: a.name, email: a.email, organization: a.organization ?? '', note: a.note ?? '', password: '',
      restricted: a.visibleCategoryIds.length > 0, categoryIds: a.visibleCategoryIds,
    })
    setEditing(a)
  }

  function upsert(account: MediaAccount) {
    setAccounts(prev => prev.some(a => a.id === account.id) ? prev.map(a => a.id === account.id ? account : a) : [account, ...prev])
  }

  async function save() {
    const isNew = editing === 'new'
    if (!form.name.trim() || !form.email.trim()) { toast.error('Name and email are required'); return }
    if (isNew && form.password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (!isNew && form.password && form.password.length < 8) { toast.error('New password must be at least 8 characters'); return }
    if (form.restricted && form.categoryIds.length === 0) { toast.error('Pick at least one category, or allow all categories'); return }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name, email: form.email, organization: form.organization, note: form.note,
      }
      if (form.password) payload.password = form.password
      let res: Response
      if (isNew) {
        res = await fetch('/api/marketing/media-accounts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        const created = await res.json().catch(() => ({}))
        if (!res.ok) { toast.error(created.error ?? 'Failed to create account'); return }
        // Category access is applied as a second step so the create route stays simple.
        if (form.restricted) {
          res = await fetch(`/api/marketing/media-accounts/${created.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryIds: form.categoryIds }),
          })
          upsert(res.ok ? await res.json() : created)
        } else {
          upsert(created)
        }
        toast.success('Media account created — share the email and password with them directly')
      } else if (editing) {
        payload.categoryIds = form.restricted ? form.categoryIds : null
        res = await fetch(`/api/marketing/media-accounts/${editing.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        const updated = await res.json().catch(() => ({}))
        if (!res.ok) { toast.error(updated.error ?? 'Failed to save account'); return }
        upsert(updated)
        toast.success(form.password ? 'Saved — password reset and existing sessions signed out' : 'Account saved')
      }
      setEditing(null)
    } catch { toast.error('Failed to save account') }
    finally { setSaving(false) }
  }

  async function toggleActive(a: MediaAccount, active: boolean) {
    setBusyId(a.id)
    try {
      const res = await fetch(`/api/marketing/media-accounts/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }),
      })
      if (!res.ok) { toast.error('Failed to update access'); return }
      upsert(await res.json())
    } finally { setBusyId(null) }
  }

  async function remove(a: MediaAccount) {
    const ok = await confirm({
      title: `Delete ${a.name}?`,
      description: 'They will be signed out of the portal immediately. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setBusyId(a.id)
    try {
      const res = await fetch(`/api/marketing/media-accounts/${a.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete account'); return }
      setAccounts(prev => prev.filter(x => x.id !== a.id))
      toast.success('Media account deleted')
    } finally { setBusyId(null) }
  }

  const categoryName = (id: string) => categories.find(c => c.id === id)?.name ?? 'Unknown'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {editing === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Media accounts</DialogTitle>
              <DialogDescription>
                Press and media contacts sign into the Agent Portal with the &ldquo;Media&rdquo; option. They can browse yacht
                resources and Press &amp; Media, but never see the availability calendar.
              </DialogDescription>
            </DialogHeader>

            <div className="flex justify-end">
              <Button size="sm" onClick={startCreate}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add media account</Button>
            </div>

            {loading ? (
              <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : accounts.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground border rounded-lg border-dashed">
                No media accounts yet.
              </div>
            ) : (
              <ul className="divide-y border rounded-lg">
                {accounts.map(a => (
                  <li key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{a.name}</p>
                          <StatusBadge tone={a.portalActive ? 'success' : 'neutral'} size="sm">{a.portalActive ? 'Active' : 'Inactive'}</StatusBadge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {a.email}{a.organization ? ` · ${a.organization}` : ''}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {a.lastLoginAt ? `Last login ${formatRelative(a.lastLoginAt)}` : 'Never logged in'}
                          {' · '}
                          {a.visibleCategoryIds.length > 0
                            ? `Sees ${a.visibleCategoryIds.map(categoryName).join(', ')}`
                            : 'Sees all categories'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:shrink-0 pl-12 sm:pl-0">
                      <Switch
                        checked={a.portalActive}
                        disabled={busyId === a.id}
                        onCheckedChange={v => toggleActive(a, v)}
                        aria-label={a.portalActive ? 'Deactivate portal access' : 'Activate portal access'}
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(a)} aria-label="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" disabled={busyId === a.id} onClick={() => remove(a)} aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <button onClick={() => setEditing(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-fit">
                <ChevronLeft className="h-3.5 w-3.5" /> All media accounts
              </button>
              <DialogTitle>{editing === 'new' ? 'New media account' : `Edit ${editing.name}`}</DialogTitle>
              {editing !== 'new' && (
                <DialogDescription>
                  Created {formatDate(editing.createdAt)}
                  {editing.portalPasswordSetAt ? ` · password set ${formatDate(editing.portalPasswordSetAt)}` : ''}
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ma-name">Name</Label>
                <Input id="ma-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ma-org">Publication / organisation</Label>
                <Input id="ma-org" value={form.organization} onChange={e => setForm(f => ({ ...f, organization: e.target.value }))} placeholder="Condé Nast Traveller" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ma-email">Email (login)</Label>
                <Input id="ma-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@publication.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ma-password" className="flex items-center gap-1.5">
                  <KeyRound className="h-3 w-3" /> {editing === 'new' ? 'Password' : 'New password'}
                </Label>
                <Input
                  id="ma-password" type="text" autoComplete="new-password" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder={editing === 'new' ? 'At least 8 characters' : 'Leave blank to keep current'}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ma-note">Internal note</Label>
                <Textarea id="ma-note" rows={2} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. Feature on Komodo, Q1 2027" />
              </div>
            </div>

            <div className="rounded-lg border p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Limit categories</p>
                  <p className="text-xs text-muted-foreground">Off = sees every Media Kit category (e.g. turn on to hide Rates &amp; Terms).</p>
                </div>
                <Switch checked={form.restricted} onCheckedChange={v => setForm(f => ({ ...f, restricted: v }))} />
              </div>
              {form.restricted && (
                <div className="grid grid-cols-2 gap-2">
                  {categories.map(c => (
                    <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={form.categoryIds.includes(c.id)}
                        onCheckedChange={v => setForm(f => ({
                          ...f,
                          categoryIds: v ? [...f.categoryIds, c.id] : f.categoryIds.filter(id => id !== c.id),
                        }))}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                {editing === 'new' ? 'Create account' : 'Save changes'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
