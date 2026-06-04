'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
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
  Users, Trash2, Check, X, MessageCircle, ChevronDown, ChevronRight, ChevronLeft,
  Link2, Copy, ShieldOff, ShieldCheck, BarChart2, AlertTriangle,
  Download, Upload,
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
  calendarToken: string | null
  calendarActive: boolean
  salespersonId: string | null
  salesperson: { id: string; name: string | null } | null
  createdAt: string
  _count: { bookings: number }
}

interface CalendarStats {
  hasToken: boolean
  isActive: boolean
  totalAccess: number
  lastAccess: string | null
  suspiciousCount: number
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
  const isAdmin     = ['ADMIN', 'SUPER_ADMIN'].includes(userRole)
  const canManage   = ['ADMIN', 'SUPER_ADMIN', 'SALES'].includes(userRole)
  const canCalendar = ['ADMIN', 'SUPER_ADMIN', 'SALES'].includes(userRole)

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

  // filters & pagination
  const [filterCountry,     setFilterCountry]     = useState('')
  const [filterType,        setFilterType]         = useState('')
  const [filterSalesperson, setFilterSalesperson]  = useState('')
  const [page,              setPage]               = useState(0)
  const [pageSize,          setPageSize]           = useState(10)

  // reset page when filters/search change
  useEffect(() => { setPage(0) }, [search, filterCountry, filterType, filterSalesperson])

  // export / import
  const [exporting,       setExporting]       = useState(false)
  const [importResult,    setImportResult]    = useState<{
    agentsCreated: number; agentsExisting: number
    contactsCreated: number; contactsSkipped: number
    skippedContacts: { row: number; agent: string; reason: string }[]
    errors: string[]
  } | null>(null)
  const [importing,       setImporting]       = useState(false)
  const [showSkipDetails, setShowSkipDetails] = useState(false)

  // calendar token management (admin only)
  const [calendarConfirm,   setCalendarConfirm]   = useState<{ agent: AgentRecord; action: 'generate' | 'reset' | 'deactivate' | 'activate' | 'revoke' } | null>(null)
  const [calendarActing,    setCalendarActing]    = useState(false)
  const [calendarStats,     setCalendarStats]     = useState<Record<string, CalendarStats>>({})
  const [statsAgent,        setStatsAgent]        = useState<AgentRecord | null>(null)
  const [statsData,         setStatsData]         = useState<any>(null)
  const [statsLoading,      setStatsLoading]      = useState(false)
  const [copiedId,          setCopiedId]          = useState<string | null>(null)

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

  const calendarBaseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const handleCalendarAction = async () => {
    if (!calendarConfirm) return
    const { agent, action } = calendarConfirm
    setCalendarActing(true)
    try {
      let res: Response
      if (action === 'generate' || action === 'reset') {
        res = await fetch(`/api/agents/${agent.id}/calendar-token`, { method: 'POST' })
      } else if (action === 'deactivate') {
        res = await fetch(`/api/agents/${agent.id}/calendar-token`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: false }),
        })
      } else if (action === 'activate') {
        res = await fetch(`/api/agents/${agent.id}/calendar-token`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: true }),
        })
      } else {
        res = await fetch(`/api/agents/${agent.id}/calendar-token`, { method: 'DELETE' })
      }
      if (res.ok) { await fetchAgents(); setCalendarConfirm(null) }
    } catch (e) { console.error(e) }
    finally { setCalendarActing(false) }
  }

  const copyCalendarLink = (token: string, agentId: string) => {
    const link = `${calendarBaseUrl}/agent/calendar?token=${token}`
    navigator.clipboard.writeText(link)
    setCopiedId(agentId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const openStats = async (agent: AgentRecord) => {
    setStatsAgent(agent)
    setStatsLoading(true)
    setStatsData(null)
    const res = await fetch(`/api/agents/${agent.id}/calendar-stats`)
    if (res.ok) setStatsData(await res.json())
    setStatsLoading(false)
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

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/agents/export')
      if (!res.ok) return
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `agents-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch('/api/agents/import', { method: 'POST', body: fd })
      const data = await res.json()
      setImportResult(data)
      if (data.agentsCreated > 0) fetchAgents()
    } finally { setImporting(false) }
  }

  // Filter options derived from loaded data
  const countryOptions     = useMemo(() => [...new Set(agents.map(a => a.country).filter(Boolean) as string[])].sort(), [agents])
  const typeOptions        = useMemo(() => [...new Set(agents.map(a => a.agentType).filter(Boolean) as string[])].sort(), [agents])
  const salespersonOptions = useMemo(() => {
    const map = new Map<string, string>()
    agents.forEach(a => { if (a.salesperson?.id && a.salesperson.name) map.set(a.salesperson.id, a.salesperson.name) })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [agents])

  const filtered = agents.filter(a => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !(a.salesperson?.name ?? '').toLowerCase().includes(search.toLowerCase())) return false
    if (filterCountry     && a.country              !== filterCountry)     return false
    if (filterType        && a.agentType             !== filterType)        return false
    if (filterSalesperson && a.salesperson?.id       !== filterSalesperson) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages - 1)
  const paginated  = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize)

  const activeCount    = agents.filter(a => a.isActive).length
  const hasActiveFilter = !!(filterCountry || filterType || filterSalesperson)

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
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button
                variant="outline" size="sm"
                onClick={handleExport}
                disabled={exporting}
                className="h-8 px-3 text-xs"
              >
                {exporting
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  : <Download className="h-3.5 w-3.5 mr-1.5" />}
                Export CSV
              </Button>

              <label className="cursor-pointer">
                <input
                  type="file" accept=".csv" className="hidden"
                  onChange={handleImport}
                  disabled={importing}
                />
                <span
                  className={`inline-flex items-center h-8 px-3 text-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground font-medium transition-colors ${importing ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  {importing
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                  Import CSV
                </span>
              </label>
            </>
          )}

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
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9 w-56"
            placeholder="Search agent…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <Select value={filterCountry || 'all'} onValueChange={v => setFilterCountry(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder="All Countries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Countries</SelectItem>
            {countryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterType || 'all'} onValueChange={v => setFilterType(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-9 w-40 text-sm">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {typeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterSalesperson || 'all'} onValueChange={v => setFilterSalesperson(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder="All Salespersons" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Salespersons</SelectItem>
            {salespersonOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>

        {hasActiveFilter && (
          <button
            onClick={() => { setFilterCountry(''); setFilterType(''); setFilterSalesperson('') }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
      </div>

      {/* Table card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Agent List
            {!loading && (
              <span className="ml-2 font-normal text-muted-foreground text-sm">
                ({filtered.length}{filtered.length !== agents.length ? ` of ${agents.length}` : ''})
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
              <p className="text-sm">{search || hasActiveFilter ? 'No agents match the filters' : 'No agents yet'}</p>
              {canManage && !search && !hasActiveFilter && (
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
                    {canCalendar && <th className="pb-3 pr-4 font-medium text-muted-foreground">Calendar Access</th>}
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Salesperson</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-center">Commission</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-center">Bookings</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-center">Status</th>
                    {canManage && <th className="pb-3 font-medium text-muted-foreground text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginated.map(a => (
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

                      {/* Calendar Access */}
                      {canCalendar && (
                        <td className="py-3 pr-4" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            {!a.calendarToken ? (
                              <button
                                onClick={() => setCalendarConfirm({ agent: a, action: 'generate' })}
                                className="flex items-center gap-1 text-xs text-[#bdac7e] hover:underline font-medium"
                              >
                                <Link2 className="h-3 w-3" /> Generate
                              </button>
                            ) : (
                              <>
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${a.calendarActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {a.calendarActive ? 'Active' : 'Off'}
                                </span>
                                <button
                                  onClick={() => copyCalendarLink(a.calendarToken!, a.id)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                                  title="Copy link"
                                >
                                  {copiedId === a.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                                </button>
                                <button
                                  onClick={() => setCalendarConfirm({ agent: a, action: a.calendarActive ? 'deactivate' : 'activate' })}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                                  title={a.calendarActive ? 'Deactivate' : 'Activate'}
                                >
                                  {a.calendarActive ? <ShieldOff className="h-3 w-3 text-red-500" /> : <ShieldCheck className="h-3 w-3 text-emerald-600" />}
                                </button>
                                <button
                                  onClick={() => setCalendarConfirm({ agent: a, action: 'reset' })}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                                  title="Reset token"
                                >
                                  <RotateCw className="h-3 w-3 text-amber-500" />
                                </button>
                                <button
                                  onClick={() => openStats(a)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                                  title="View access stats"
                                >
                                  <BarChart2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}

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
                        <td colSpan={isAdmin ? 9 : canCalendar ? 9 : canManage ? 8 : 7} className="py-2 pr-4">
                          <div className="pl-12 pr-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                              Contact Persons
                            </p>
                            {contactsLoadingId === a.id ? (
                              <div className="space-y-1.5">
                                {[...Array(2)].map((_, i) => <div key={i} className="h-8 w-full rounded bg-muted animate-pulse" />)}
                              </div>
                            ) : !contactsCache[a.id]?.length ? (
                              <p className="text-xs text-muted-foreground py-1">No contact persons added yet.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-muted">
                                    <th className="pb-1.5 pr-4 text-left font-medium text-muted-foreground">Name</th>
                                    <th className="pb-1.5 pr-4 text-left font-medium text-muted-foreground">Job Title</th>
                                    <th className="pb-1.5 pr-4 text-left font-medium text-muted-foreground">Email</th>
                                    <th className="pb-1.5 pr-4 text-left font-medium text-muted-foreground">WhatsApp</th>
                                    <th className="pb-1.5 text-left font-medium text-muted-foreground">Birthday</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-muted/60">
                                  {contactsCache[a.id].map(c => (
                                    <tr key={c.id} className="hover:bg-muted/30">
                                      <td className="py-1.5 pr-4 font-medium text-foreground">{c.name}</td>
                                      <td className="py-1.5 pr-4 text-muted-foreground">{c.jobTitle || <span className="opacity-30">—</span>}</td>
                                      <td className="py-1.5 pr-4 text-muted-foreground">
                                        {c.email
                                          ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
                                          : <span className="opacity-30">—</span>}
                                      </td>
                                      <td className="py-1.5 pr-4 text-muted-foreground">{c.whatsapp || <span className="opacity-30">—</span>}</td>
                                      <td className="py-1.5 text-muted-foreground">
                                        {c.dateOfBirth
                                          ? new Date(c.dateOfBirth).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                                          : <span className="opacity-30">—</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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

          {/* Pagination */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between pt-4 border-t text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="text-xs">Rows per page</span>
                <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0) }}>
                  <SelectTrigger className="h-7 w-16 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map(n => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <span className="text-xs">
                {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, filtered.length)} of {filtered.length}
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(0)}
                  disabled={safePage === 0}
                  className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                  title="First page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs px-1">Page {safePage + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage >= totalPages - 1}
                  className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  disabled={safePage >= totalPages - 1}
                  className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Last page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
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

      {/* ── Calendar Token Confirmation ── */}
      <AlertDialog open={!!calendarConfirm} onOpenChange={v => !v && setCalendarConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {calendarConfirm?.action === 'generate' && <><Link2 className="h-4 w-4 text-[#bdac7e]" /> Generate Calendar Link</>}
              {calendarConfirm?.action === 'reset' && <><RotateCw className="h-4 w-4 text-amber-500" /> Reset Calendar Token</>}
              {calendarConfirm?.action === 'deactivate' && <><ShieldOff className="h-4 w-4 text-red-500" /> Deactivate Calendar Access</>}
              {calendarConfirm?.action === 'activate' && <><ShieldCheck className="h-4 w-4 text-emerald-600" /> Activate Calendar Access</>}
              {calendarConfirm?.action === 'revoke' && <><AlertTriangle className="h-4 w-4 text-red-600" /> Revoke Calendar Token</>}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {calendarConfirm?.action === 'generate' && `Generate a unique calendar access link for ${calendarConfirm.agent.name}. Share this link so they can view the vessel schedule.`}
              {calendarConfirm?.action === 'reset' && `Reset the calendar token for ${calendarConfirm?.agent.name}. The old link will immediately stop working and a new link will be generated.`}
              {calendarConfirm?.action === 'deactivate' && `Deactivate calendar access for ${calendarConfirm?.agent.name}. Their link will stop working immediately. The token is preserved and can be reactivated later.`}
              {calendarConfirm?.action === 'activate' && `Reactivate calendar access for ${calendarConfirm?.agent.name}. Their existing link will work again.`}
              {calendarConfirm?.action === 'revoke' && `Permanently revoke the calendar token for ${calendarConfirm?.agent.name}. This cannot be undone — a new token will need to be generated.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={calendarActing}
              onClick={handleCalendarAction}
              className={
                calendarConfirm?.action === 'deactivate' || calendarConfirm?.action === 'revoke'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : calendarConfirm?.action === 'activate'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'text-white'
              }
              style={calendarConfirm?.action === 'generate' || calendarConfirm?.action === 'reset' ? { backgroundColor: ACCENT } : {}}
            >
              {calendarActing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {calendarConfirm?.action === 'generate' && 'Generate Link'}
              {calendarConfirm?.action === 'reset' && 'Yes, Reset Token'}
              {calendarConfirm?.action === 'deactivate' && 'Yes, Deactivate'}
              {calendarConfirm?.action === 'activate' && 'Yes, Activate'}
              {calendarConfirm?.action === 'revoke' && 'Yes, Revoke'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Calendar Stats Modal ── */}
      <AlertDialog open={!!statsAgent} onOpenChange={v => !v && setStatsAgent(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4" style={{ color: ACCENT }} />
              Calendar Access — {statsAgent?.name}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            {statsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : statsData ? (
              <>
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Total Opens', value: statsData.totalAccess, color: 'text-foreground' },
                    { label: 'Last Access', value: statsData.lastAccess ? new Date(statsData.lastAccess).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—', color: 'text-foreground' },
                    { label: 'Suspicious', value: statsData.suspiciousCount, color: statsData.suspiciousCount > 0 ? 'text-red-600' : 'text-muted-foreground' },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {/* Recent logs */}
                {statsData.recentLogs?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Access</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {statsData.recentLogs.map((log: any) => (
                        <div key={log.id} className={`flex items-center justify-between text-xs px-3 py-1.5 rounded ${log.isSuspicious ? 'bg-red-50 text-red-700' : 'bg-muted/30'}`}>
                          <span className="font-mono">{log.ip}</span>
                          {log.isSuspicious && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
                          <span className="text-muted-foreground shrink-0">{new Date(log.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Import Result ── */}
      <AlertDialog open={!!importResult} onOpenChange={v => { if (!v) { setImportResult(null); setShowSkipDetails(false) } }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" style={{ color: ACCENT }} /> Import Result
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3 py-1">
            {/* Summary grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Agents Created</p>
                <p className="text-2xl font-bold text-emerald-600">{importResult?.agentsCreated ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Agents Existing</p>
                <p className="text-2xl font-bold text-blue-500">{importResult?.agentsExisting ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Contacts Created</p>
                <p className="text-2xl font-bold text-emerald-600">{importResult?.contactsCreated ?? 0}</p>
              </div>
              <button
                className="rounded-lg border p-3 text-center hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => (importResult?.contactsSkipped ?? 0) > 0 && setShowSkipDetails(v => !v)}
              >
                <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                  Contacts Skipped
                  {(importResult?.contactsSkipped ?? 0) > 0 && (
                    <span className="text-[10px] text-amber-500 underline">
                      {showSkipDetails ? '▲ hide' : '▼ details'}
                    </span>
                  )}
                </p>
                <p className="text-2xl font-bold text-amber-600">{importResult?.contactsSkipped ?? 0}</p>
              </button>
            </div>

            {/* Skipped contacts detail */}
            {showSkipDetails && (importResult?.skippedContacts?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1.5">
                  Skipped Detail ({importResult!.skippedContacts.length} rows)
                </p>
                {/* Group by reason first */}
                {(() => {
                  type SkippedItem = { row: number; agent: string; reason: string }
                  const grouped = importResult!.skippedContacts.reduce<Record<string, SkippedItem[]>>((acc, s) => {
                    ;(acc[s.reason] ??= []).push(s)
                    return acc
                  }, {})
                  return (
                    <div className="space-y-2">
                      {Object.entries(grouped).map(([reason, items]) => (
                        <div key={reason} className="rounded-lg border border-amber-100 bg-amber-50/50">
                          <div className="flex items-center justify-between px-3 py-1.5 border-b border-amber-100">
                            <span className="text-xs font-semibold text-amber-700">{reason}</span>
                            <span className="text-[10px] font-bold text-amber-500 bg-amber-100 rounded px-1.5 py-0.5">{items.length}</span>
                          </div>
                          <div className="max-h-36 overflow-y-auto divide-y divide-amber-100">
                            {items.map((s, i) => (
                              <div key={i} className="flex items-center justify-between px-3 py-1 text-xs">
                                <span className="text-amber-800 font-medium truncate max-w-[240px]">{s.agent}</span>
                                <span className="text-amber-500 shrink-0 ml-2">row {s.row}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Errors */}
            {importResult?.errors && importResult.errors.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-1.5">
                  Errors ({importResult.errors.length})
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{e}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => { setImportResult(null); setShowSkipDetails(false) }}>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
