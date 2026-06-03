'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Briefcase, Plus, Search, Pencil, UserX, UserCheck,
  Loader2, Mail, Building2, Percent, RotateCw,
  Users, Trash2, Check, X, MessageCircle, ChevronDown, ChevronRight,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NATIONALITIES } from '@/lib/nationalities'

function CountrySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filtered = query.trim()
    ? NATIONALITIES.filter(n => n.toLowerCase().includes(query.toLowerCase()))
    : NATIONALITIES
  return (
    <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) setQuery('') }}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className={value ? '' : 'text-muted-foreground'}>{value || 'Select country'}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 ml-2 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search country…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="overflow-y-scroll p-1 overscroll-contain" style={{ maxHeight: 208 }} onWheel={e => e.stopPropagation()}>
            {filtered.length === 0
              ? <p className="py-4 text-center text-sm text-muted-foreground">Not found.</p>
              : filtered.map(n => (
                <button key={n} type="button"
                  onClick={() => { onChange(n === value ? '' : n); setOpen(false); setQuery('') }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left"
                >
                  <Check className={`h-3.5 w-3.5 shrink-0 ${value === n ? 'opacity-100' : 'opacity-0'}`} />
                  {n}
                </button>
              ))
            }
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface AgentRecord {
  id: string
  name: string
  commission: number
  isActive: boolean
  country: string | null
  agentType: string | null
  contract: string | null
  salespersonId: string | null
  salesperson: { id: string; name: string | null } | null
  createdAt: string
  _count: { bookings: number }
}

interface SalesUser {
  id: string
  name: string | null
  email: string
}

interface AgentContact {
  id: string
  name: string
  email: string | null
  whatsapp: string | null
  jobTitle: string | null
  dateOfBirth: string | null
}

const EMPTY_FORM = { name: '', commission: '0', salespersonId: '', country: '', agentType: '', contract: '' }
const EMPTY_CONTACT = { name: '', email: '', whatsapp: '', jobTitle: '', dateOfBirth: '' }
const ACCENT = '#bdac7e'

export default function Agents() {
  const { data: session } = useSession()
  const userRole = (session?.user as { role?: string })?.role ?? ''
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(userRole)
  const canManage = ['ADMIN', 'SUPER_ADMIN', 'SALES'].includes(userRole)

  const [agents,     setAgents]     = useState<AgentRecord[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([])

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing,   setEditing]   = useState<AgentRecord | null>(null)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)

  const [confirmAgent, setConfirmAgent] = useState<AgentRecord | null>(null)
  const [toggling,     setToggling]     = useState(false)

  // contacts (sheet)
  const [contacts,       setContacts]       = useState<AgentContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [addingContact,  setAddingContact]  = useState(false)
  const [contactForm,    setContactForm]    = useState(EMPTY_CONTACT)
  const [savingContact,  setSavingContact]  = useState(false)
  const [editingContact, setEditingContact] = useState<AgentContact | null>(null)
  const [editContactForm, setEditContactForm] = useState(EMPTY_CONTACT)

  // inline expand/collapse contacts in table
  const [expandedId,        setExpandedId]        = useState<string | null>(null)
  const [contactsCache,     setContactsCache]     = useState<Record<string, AgentContact[]>>({})
  const [contactsLoadingId, setContactsLoadingId] = useState<string | null>(null)

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agents?all=true')
      if (res.ok) setAgents(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.ok ? r.json() : [])
      .then((users: (SalesUser & { role: string })[]) =>
        setSalesUsers(users.filter(u => u.role === 'SALES'))
      )
      .catch(() => {})
  }, [])

  const fetchContacts = async (agentId: string) => {
    setContactsLoading(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/contacts`)
      if (res.ok) {
        const data = await res.json()
        setContacts(data)
        setContactsCache(prev => ({ ...prev, [agentId]: data }))
      }
    } finally {
      setContactsLoading(false)
    }
  }

  const handleToggleExpand = async (agentId: string) => {
    if (expandedId === agentId) { setExpandedId(null); return }
    setExpandedId(agentId)
    if (contactsCache[agentId]) return
    setContactsLoadingId(agentId)
    try {
      const res = await fetch(`/api/agents/${agentId}/contacts`)
      if (res.ok) {
        const data = await res.json()
        setContactsCache(prev => ({ ...prev, [agentId]: data }))
      }
    } finally {
      setContactsLoadingId(null)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setContacts([])
    setAddingContact(false)
    setEditingContact(null)
    setSheetOpen(true)
  }

  const openEdit = (a: AgentRecord) => {
    setEditing(a)
    setForm({
      name:          a.name,
      commission:    String(a.commission),
      salespersonId: a.salespersonId ?? '',
      country:       a.country    ?? '',
      agentType:     a.agentType  ?? '',
      contract:      a.contract   ?? '',
    })
    setAddingContact(false)
    setEditingContact(null)
    setContactForm(EMPTY_CONTACT)
    fetchContacts(a.id)
    setSheetOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const url    = editing ? `/api/agents/${editing.id}` : '/api/agents'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:          form.name.trim(),
          commission:    parseFloat(form.commission) || 0,
          salespersonId: form.salespersonId || null,
          country:       form.country   || null,
          agentType:     form.agentType || null,
          contract:      form.contract  || null,
        }),
      })
      if (res.ok) { await fetchAgents(); setSheetOpen(false) }
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleAddContact = async () => {
    if (!contactForm.name.trim() || !editing) return
    setSavingContact(true)
    try {
      const res = await fetch(`/api/agents/${editing.id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...contactForm,
          dateOfBirth: contactForm.dateOfBirth || null,
        }),
      })
      if (res.ok) {
        const c = await res.json()
        setContacts(prev => {
          const updated = [...prev, c]
          setContactsCache(cache => ({ ...cache, [editing.id]: updated }))
          return updated
        })
        setContactForm(EMPTY_CONTACT)
        setAddingContact(false)
      }
    } finally { setSavingContact(false) }
  }

  const handleUpdateContact = async () => {
    if (!editingContact || !editContactForm.name.trim() || !editing) return
    setSavingContact(true)
    try {
      const res = await fetch(`/api/agents/${editing.id}/contacts/${editingContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editContactForm,
          dateOfBirth: editContactForm.dateOfBirth || null,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        setContacts(prev => {
          const next = prev.map(c => c.id === updated.id ? updated : c)
          setContactsCache(cache => ({ ...cache, [editing.id]: next }))
          return next
        })
        setEditingContact(null)
      }
    } finally { setSavingContact(false) }
  }

  const handleDeleteContact = async (contactId: string) => {
    if (!editing) return
    try {
      const res = await fetch(`/api/agents/${editing.id}/contacts/${contactId}`, { method: 'DELETE' })
      if (res.ok) {
        setContacts(prev => {
          const next = prev.filter(c => c.id !== contactId)
          if (editing) setContactsCache(cache => ({ ...cache, [editing.id]: next }))
          return next
        })
      }
    } catch (e) { console.error(e) }
  }

  const handleToggleActive = async () => {
    if (!confirmAgent) return
    setToggling(true)
    try {
      const res = await fetch(`/api/agents/${confirmAgent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: confirmAgent.name, isActive: !confirmAgent.isActive }),
      })
      if (res.ok) { await fetchAgents(); setConfirmAgent(null) }
    } catch (e) { console.error(e) }
    finally { setToggling(false) }
  }

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.salesperson?.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const activeCount = agents.filter(a => a.isActive).length

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-bold tracking-tight">Agents</h3>
            <button onClick={() => fetchAgents()} title="Refresh" className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
              <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-muted-foreground text-sm">
            {loading ? '…' : `${activeCount} active agent${activeCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        {canManage && (
          <Button
            onClick={openCreate}
            style={{ backgroundColor: ACCENT, color: 'white' }}
            className="hover:opacity-90"
          >
            <Plus className="h-4 w-4 mr-2" /> Add Agent
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search name, company, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Agent List
            {!loading && (
              <span className="ml-2 font-normal text-muted-foreground text-sm">
                ({filtered.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{search ? 'No agents found' : 'No agents yet'}</p>
              {canManage && !search && (
                <Button onClick={openCreate} variant="outline" size="sm" className="mt-3">
                  <Plus className="h-4 w-4 mr-1" /> Add First Agent
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 w-8" />
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Agent</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Country</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Type</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Contract</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Salesperson</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-center">Commission</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-center">Bookings</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-center">Status</th>
                    {canManage && <th className="pb-3 font-medium text-muted-foreground text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(a => (
                    <React.Fragment key={a.id}>
                    <tr className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => handleToggleExpand(a.id)}>

                      {/* Expand chevron */}
                      <td className="py-3 pr-2 w-8">
                        <span className="flex items-center justify-center text-muted-foreground">
                          {expandedId === a.id
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />}
                        </span>
                      </td>

                      {/* Avatar + name */}
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-white text-sm font-bold uppercase"
                            style={{ backgroundColor: a.isActive ? ACCENT : '#9ca3af' }}
                          >
                            {a.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold">{a.name}</div>
                          </div>
                        </div>
                      </td>

                      {/* Country */}
                      <td className="py-3 pr-4 text-sm text-muted-foreground">
                        {a.country || <span className="text-muted-foreground/40">—</span>}
                      </td>

                      {/* Agent Type */}
                      <td className="py-3 pr-4">
                        {a.agentType
                          ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{a.agentType}</span>
                          : <span className="text-muted-foreground/40 text-xs">—</span>}
                      </td>

                      {/* Contract */}
                      <td className="py-3 pr-4">
                        {a.contract
                          ? <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              a.contract === 'Yes' ? 'bg-emerald-50 text-emerald-700' :
                              a.contract === 'Not Yet' ? 'bg-amber-50 text-amber-700' :
                              'bg-red-50 text-red-600'
                            }`}>{a.contract}</span>
                          : <span className="text-muted-foreground/40 text-xs">—</span>}
                      </td>

                      {/* Salesperson */}
                      <td className="py-3 pr-4">
                        {a.salesperson
                          ? <span className="text-sm">{a.salesperson.name ?? '—'}</span>
                          : <span className="text-xs text-muted-foreground/40">—</span>
                        }
                      </td>

                      {/* Commission */}
                      <td className="py-3 pr-4 text-center">
                        <span className="font-semibold" style={{ color: ACCENT }}>{a.commission}%</span>
                      </td>

                      {/* Booking count */}
                      <td className="py-3 pr-4 text-center text-muted-foreground">
                        {a._count.bookings}
                      </td>

                      {/* Status badge */}
                      <td className="py-3 pr-4 text-center">
                        <Badge variant="outline" className={
                          a.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-gray-50 text-gray-500 border-gray-200'
                        }>
                          {a.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>

                      {/* Actions */}
                      {canManage && (
                        <td className="py-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => openEdit(a)}
                            >
                              <Pencil className="h-3 w-3 mr-1" /> Edit
                            </Button>
                            {isAdmin && (
                              <Button
                                variant="ghost" size="sm"
                                className={`h-7 px-2 text-xs ${a.isActive
                                  ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                                  : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                                }`}
                                onClick={() => setConfirmAgent(a)}
                              >
                                {a.isActive
                                  ? <><UserX    className="h-3 w-3 mr-1" /> Deactivate</>
                                  : <><UserCheck className="h-3 w-3 mr-1" /> Activate</>
                                }
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>

                    {/* ── Expanded contacts row ── */}
                    {expandedId === a.id && (
                      <tr key={`${a.id}-contacts`} className="bg-muted/20">
                        <td />
                        <td colSpan={canManage ? 8 : 7} className="pb-3 pt-1 pr-4">
                          <div className="pl-12">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                              Contact Persons
                            </p>
                            {contactsLoadingId === a.id ? (
                              <div className="flex gap-2">
                                {[...Array(2)].map((_, i) => (
                                  <div key={i} className="h-9 w-44 rounded-lg bg-muted animate-pulse" />
                                ))}
                              </div>
                            ) : !contactsCache[a.id]?.length ? (
                              <p className="text-xs text-muted-foreground py-1">No contact persons added yet.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {contactsCache[a.id].map(c => (
                                  <div key={c.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                                    <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                      style={{ backgroundColor: ACCENT }}>
                                      {c.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <p className="font-medium text-xs leading-tight">{c.name}</p>
                                        {c.jobTitle && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{c.jobTitle}</span>}
                                      </div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        {c.email && (
                                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                            <Mail className="h-3 w-3" />{c.email}
                                          </span>
                                        )}
                                        {c.whatsapp && (
                                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                            <MessageCircle className="h-3 w-3" />{c.whatsapp}
                                          </span>
                                        )}
                                        {c.dateOfBirth && (
                                          <span className="text-[11px] text-muted-foreground">
                                            🎂 {new Date(c.dateOfBirth).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create / Edit Sheet ── */}
      {canManage && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="sm:max-w-md flex flex-col gap-0 p-0">
            {/* Colored header */}
            <SheetHeader className="p-6 border-b" style={{ background: `linear-gradient(135deg, ${ACCENT}18, transparent)` }}>
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: ACCENT }}>
                  <Briefcase className="h-5 w-5 text-white" />
                </div>
                <div>
                  <SheetTitle>{editing ? 'Edit Agent' : 'Add New Agent'}</SheetTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {editing ? editing.name : 'Company / agency details'}
                  </p>
                </div>
              </div>
            </SheetHeader>

            {/* Form */}
            <div className="flex-1 p-6 space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <Label>Agency / Company Name <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Building2 className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="e.g. ABC Tours, Raja Ampat Travel"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
              </div>


              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Commission (%)</Label>
                  <div className="relative">
                    <Percent className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number" min="0" max="100" step="0.5"
                      className="pl-9"
                      value={form.commission}
                      onChange={e => setForm(f => ({ ...f, commission: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Salesperson</Label>
                  <Select
                    value={form.salespersonId || 'none'}
                    onValueChange={v => setForm(f => ({ ...f, salespersonId: v === 'none' ? '' : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="— Select sales —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {salesUsers.map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name ?? u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Country, Agent Type, Contract */}
              <div className="space-y-1.5">
                <Label>Country</Label>
                <CountrySelect value={form.country} onChange={v => setForm(f => ({ ...f, country: v }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Agent Type</Label>
                  <Select
                    value={form.agentType || 'none'}
                    onValueChange={v => setForm(f => ({ ...f, agentType: v === 'none' ? '' : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="— Select type —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      <SelectItem value="Wholesale">Wholesale</SelectItem>
                      <SelectItem value="Affiliator">Affiliator</SelectItem>
                      <SelectItem value="Retail">Retail</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Contract</Label>
                  <Select
                    value={form.contract || 'none'}
                    onValueChange={v => setForm(f => ({ ...f, contract: v === 'none' ? '' : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="— Select —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="Not Yet">Not Yet</SelectItem>
                      <SelectItem value="Not Qualified">Not Qualified</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ── Contact Persons (edit mode only) ── */}
              {editing && (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Contact Persons</span>
                      {!contactsLoading && (
                        <span className="text-xs text-muted-foreground">({contacts.length})</span>
                      )}
                    </div>
                    {!addingContact && (
                      <button
                        type="button"
                        onClick={() => { setAddingContact(true); setEditingContact(null) }}
                        className="flex items-center gap-1 text-xs text-[#bdac7e] hover:underline font-medium"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add
                      </button>
                    )}
                  </div>

                  {contactsLoading ? (
                    <div className="space-y-2">
                      {[...Array(2)].map((_, i) => (
                        <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {contacts.map(c => (
                        <div key={c.id} className="rounded-lg border bg-muted/30 p-3">
                          {editingContact?.id === c.id ? (
                            /* inline edit form */
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  placeholder="Name *"
                                  value={editContactForm.name}
                                  onChange={e => setEditContactForm(f => ({ ...f, name: e.target.value }))}
                                  className="h-7 text-sm"
                                />
                                <Input
                                  placeholder="Job Title"
                                  value={editContactForm.jobTitle}
                                  onChange={e => setEditContactForm(f => ({ ...f, jobTitle: e.target.value }))}
                                  className="h-7 text-sm"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  placeholder="Email"
                                  value={editContactForm.email}
                                  onChange={e => setEditContactForm(f => ({ ...f, email: e.target.value }))}
                                  className="h-7 text-sm"
                                />
                                <Input
                                  placeholder="WhatsApp"
                                  value={editContactForm.whatsapp}
                                  onChange={e => setEditContactForm(f => ({ ...f, whatsapp: e.target.value }))}
                                  className="h-7 text-sm"
                                />
                              </div>
                              <Input
                                type="date"
                                placeholder="Date of Birth"
                                value={editContactForm.dateOfBirth}
                                onChange={e => setEditContactForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                                className="h-7 text-sm"
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => setEditingContact(null)}
                                  className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={savingContact || !editContactForm.name.trim()}
                                  onClick={handleUpdateContact}
                                  className="text-xs font-medium text-[#bdac7e] hover:underline disabled:opacity-50"
                                >
                                  {savingContact ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* display row */
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium truncate">{c.name}</p>
                                  {c.jobTitle && (
                                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{c.jobTitle}</span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                  {c.email && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Mail className="h-3 w-3" />{c.email}
                                    </span>
                                  )}
                                  {c.whatsapp && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <MessageCircle className="h-3 w-3" />{c.whatsapp}
                                    </span>
                                  )}
                                  {c.dateOfBirth && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      🎂 {new Date(c.dateOfBirth).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingContact(c)
                                    setEditContactForm({ name: c.name, email: c.email ?? '', whatsapp: c.whatsapp ?? '', jobTitle: c.jobTitle ?? '', dateOfBirth: c.dateOfBirth ? c.dateOfBirth.split('T')[0] : '' })
                                    setAddingContact(false)
                                  }}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteContact(c.id)}
                                  className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Add form */}
                      {addingContact && (
                        <div className="rounded-lg border border-dashed border-[#bdac7e]/50 bg-[#bdac7e]/5 p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              autoFocus
                              placeholder="Name *"
                              value={contactForm.name}
                              onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))}
                              className="h-7 text-sm"
                            />
                            <Input
                              placeholder="Job Title"
                              value={contactForm.jobTitle}
                              onChange={e => setContactForm(f => ({ ...f, jobTitle: e.target.value }))}
                              className="h-7 text-sm"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              placeholder="Email"
                              value={contactForm.email}
                              onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
                              className="h-7 text-sm"
                            />
                            <Input
                              placeholder="WhatsApp"
                              value={contactForm.whatsapp}
                              onChange={e => setContactForm(f => ({ ...f, whatsapp: e.target.value }))}
                              className="h-7 text-sm"
                            />
                          </div>
                          <Input
                            type="date"
                            placeholder="Date of Birth"
                            value={contactForm.dateOfBirth}
                            onChange={e => setContactForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                            className="h-7 text-sm"
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => { setAddingContact(false); setContactForm(EMPTY_CONTACT) }}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3 w-3" /> Cancel
                            </button>
                            <button
                              type="button"
                              disabled={savingContact || !contactForm.name.trim()}
                              onClick={handleAddContact}
                              className="flex items-center gap-1 text-xs font-medium text-[#bdac7e] hover:underline disabled:opacity-50"
                            >
                              {savingContact
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Check className="h-3 w-3" />
                              }
                              Save
                            </button>
                          </div>
                        </div>
                      )}

                      {contacts.length === 0 && !addingContact && (
                        <p className="text-xs text-muted-foreground text-center py-3">
                          No contact persons yet
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t flex gap-2">
              <Button variant="outline" onClick={() => setSheetOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                disabled={!form.name.trim() || saving}
                onClick={handleSave}
                className="flex-1 hover:opacity-90"
                style={{ backgroundColor: ACCENT, color: 'white' }}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editing ? 'Save Changes' : 'Add Agent'}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* ── Confirm toggle active/inactive ── */}
      <AlertDialog open={!!confirmAgent} onOpenChange={v => !v && setConfirmAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAgent?.isActive ? 'Deactivate Agent?' : 'Activate Agent?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAgent?.isActive
                ? `${confirmAgent.name} will no longer appear as an option in new bookings. Existing bookings are not affected.`
                : `${confirmAgent?.name} will become active again and can be selected for new bookings.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={toggling}
              onClick={handleToggleActive}
              className={confirmAgent?.isActive
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
            >
              {toggling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {confirmAgent?.isActive ? 'Yes, Deactivate' : 'Yes, Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
