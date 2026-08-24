'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Briefcase, Plus, Search, Pencil, UserX, UserCheck,
  Loader2, Mail, Building2, Percent, RotateCw,
  Users, Trash2, Check, X, MessageCircle, ChevronDown, ChevronRight, ChevronLeft,
  Link2, Copy, ShieldOff, ShieldCheck, BarChart2, AlertTriangle,
  Download, Upload, FileDown, KeyRound, ListChecks,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NATIONALITIES } from '@/lib/nationalities'
import { roleMatches } from '@/lib/role-utils'

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
  commissionOpenTrip: number
  commissionPrivateCharter: number
  isActive: boolean
  country: string | null
  address: string | null
  email: string | null
  whatsapp: string | null
  note: string | null
  website: string | null
  instagram: string | null
  source: string | null
  currentCondition: string | null
  contract: string | null
  contractFileName: string | null
  calendarToken: string | null
  calendarActive: boolean
  hasPortalPassword: boolean
  portalActive: boolean
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
  addedByName: string | null
}

const EMPTY_FORM = { name: '', commission: '0', commissionOpenTrip: '0', commissionPrivateCharter: '0', salespersonId: '', country: '', address: '', email: '', whatsapp: '', note: '', website: '', instagram: '', source: '', currentCondition: '', contract: '', contractFile: '', contractFileName: '' }
const EMPTY_CONTACT = { name: '', email: '', whatsapp: '', jobTitle: '', dateOfBirth: '' }
const ACCENT = '#bdac7e'
const TODAY = new Date().toISOString().split('T')[0]

function parseDuplicateNote(note: string | null): { originalName: string; date: string; salesperson: string } | null {
  if (!note) return null
  const match = note.match(/duplikat dari agent "([^"]+)" \(dibuat ([\d-]+), salesperson ([^)]+)\)/i)
  if (!match) return null
  return { originalName: match[1], date: match[2], salesperson: match[3] }
}

export default function Agents() {
  const { data: session } = useSession()
  const userRole  = (session?.user as { role?: string })?.role ?? ''
  const userId    = session?.user?.id ?? ''
  const isAdmin     = ['ADMIN', 'SUPER_ADMIN'].includes(userRole)
  const isSales     = roleMatches(userRole, ['SALES'])
  const canManage   = roleMatches(userRole, ['ADMIN', 'SUPER_ADMIN', 'SALES'])
  const canCalendar = roleMatches(userRole, ['ADMIN', 'SUPER_ADMIN', 'SALES'])
  const canPortal   = canCalendar
  const canGenerateContract = !!(session?.user as { tenantFeatures?: Record<string, boolean> })?.tenantFeatures?.agentContract

  const canActOnAgent = (a: AgentRecord) => isAdmin || a.salespersonId === userId

  const [agents,     setAgents]     = useState<AgentRecord[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([])

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing,   setEditing]   = useState<AgentRecord | null>(null)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState('')
  const [fileError,    setFileError]    = useState('')

  const similarAgents = useMemo(() => {
    const typed = form.name.trim().toLowerCase()
    if (typed.length < 3) return []
    return agents.filter(a => {
      if (editing && a.id === editing.id) return false
      const existing = a.name.trim().toLowerCase()
      if (existing.length < 3) return false
      return existing.includes(typed) || typed.includes(existing)
    })
  }, [form.name, agents, editing])

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
  const [expandedId,            setExpandedId]            = useState<string | null>(null)
  const [contactsCache,         setContactsCache]         = useState<Record<string, AgentContact[]>>({})
  const [contactsLoadingId,     setContactsLoadingId]     = useState<string | null>(null)
  // expanded row contact actions (all sales can manage for any agent)
  const [expandedAddingId,      setExpandedAddingId]      = useState<string | null>(null)
  const [expandedContactForm,   setExpandedContactForm]   = useState(EMPTY_CONTACT)
  const [expandedSaving,        setExpandedSaving]        = useState(false)
  const [expandedEditingId,     setExpandedEditingId]     = useState<string | null>(null)
  const [expandedEditForm,      setExpandedEditForm]      = useState(EMPTY_CONTACT)
  // void contract
  const [voidingId,             setVoidingId]             = useState<string | null>(null)
  // contract confirm modal
  const [contractConfirmModal,  setContractConfirmModal]  = useState<{ agent: AgentRecord; missing: string[] } | null>(null)

  // filters & pagination
  const [scope,             setScope]             = useState<'mine' | 'all'>('mine')
  const [filterCountry,     setFilterCountry]     = useState('')
  const [filterSalesperson, setFilterSalesperson]  = useState('')
  const [page,              setPage]               = useState(0)
  const [pageSize,          setPageSize]           = useState(10)

  // reset page when filters/search change
  useEffect(() => { setPage(0) }, [search, filterCountry, filterSalesperson])

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
  const [statsAgent,        setStatsAgent]        = useState<AgentRecord | null>(null)
  const [statsData,         setStatsData]         = useState<any>(null)
  const [statsLoading,      setStatsLoading]      = useState(false)
  const [copiedId,          setCopiedId]          = useState<string | null>(null)

  // agent portal password management (assigned salesperson or admin)
  const [portalDialogAgent,        setPortalDialogAgent]        = useState<AgentRecord | null>(null)
  const [portalPasswordValue,      setPortalPasswordValue]      = useState('')
  const [portalPasswordConfirm,    setPortalPasswordConfirm]    = useState('')
  const [portalPasswordError,      setPortalPasswordError]      = useState('')
  const [portalSaving,             setPortalSaving]             = useState(false)
  const [portalConfirm,            setPortalConfirm]            = useState<{ agent: AgentRecord; action: 'deactivate' | 'activate' } | null>(null)
  const [portalActing,             setPortalActing]             = useState(false)
  const [portalStatsAgent,         setPortalStatsAgent]         = useState<AgentRecord | null>(null)
  const [portalStatsData,          setPortalStatsData]          = useState<any>(null)
  const [portalStatsLoading,       setPortalStatsLoading]       = useState(false)

  // agent portal media-kit category visibility (assigned salesperson or admin)
  const [categoryDialogAgent,      setCategoryDialogAgent]      = useState<AgentRecord | null>(null)
  const [allCategories,            setAllCategories]            = useState<{ id: string; name: string }[]>([])
  const [categoryRestricted,       setCategoryRestricted]       = useState(false)
  const [categorySelectedIds,      setCategorySelectedIds]      = useState<Set<string>>(new Set())
  const [categoryLoading,          setCategoryLoading]          = useState(false)
  const [categorySaving,           setCategorySaving]           = useState(false)

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
        setSalesUsers(users.filter(u => roleMatches(u.role, ['SALES'])))
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

  const openPortalDialog = (agent: AgentRecord) => {
    setPortalDialogAgent(agent)
    setPortalPasswordValue('')
    setPortalPasswordConfirm('')
    setPortalPasswordError('')
  }

  const handleSetPortalPassword = async () => {
    if (!portalDialogAgent) return
    if (portalPasswordValue.length < 8) { setPortalPasswordError('Password minimal 8 karakter'); return }
    if (portalPasswordValue !== portalPasswordConfirm) { setPortalPasswordError('Konfirmasi password tidak sama'); return }
    setPortalSaving(true)
    setPortalPasswordError('')
    try {
      const res = await fetch(`/api/agents/${portalDialogAgent.id}/portal-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: portalPasswordValue }),
      })
      if (res.ok) { await fetchAgents(); setPortalDialogAgent(null) }
      else { const data = await res.json().catch(() => ({})); setPortalPasswordError(data.error || 'Gagal menyimpan password') }
    } catch (e) { console.error(e); setPortalPasswordError('Gagal menyimpan password') }
    finally { setPortalSaving(false) }
  }

  const handlePortalAction = async () => {
    if (!portalConfirm) return
    const { agent, action } = portalConfirm
    setPortalActing(true)
    try {
      const res = await fetch(`/api/agents/${agent.id}/portal-password`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: action === 'activate' }),
      })
      if (res.ok) { await fetchAgents(); setPortalConfirm(null) }
    } catch (e) { console.error(e) }
    finally { setPortalActing(false) }
  }

  const openCategoryDialog = async (agent: AgentRecord) => {
    setCategoryDialogAgent(agent)
    setCategoryLoading(true)
    try {
      const [categoriesRes, visibilityRes] = await Promise.all([
        fetch('/api/marketing/categories'),
        fetch(`/api/agents/${agent.id}/portal-categories`),
      ])
      const cats: { id: string; name: string }[] = categoriesRes.ok ? await categoriesRes.json() : allCategories
      setAllCategories(cats)
      if (visibilityRes.ok) {
        const data = await visibilityRes.json()
        const restricted = !!data.restricted
        setCategoryRestricted(restricted)
        // Unrestricted means the agent currently sees every category — pre-check them all so
        // switching to "Choose specific" starts from that same state, not an empty checklist.
        setCategorySelectedIds(new Set<string>(restricted ? (data.visibleCategoryIds ?? []) : cats.map(c => c.id)))
      }
    } catch (e) { console.error(e) }
    finally { setCategoryLoading(false) }
  }

  const toggleCategorySelected = (id: string) => {
    setCategorySelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleSaveCategories = async () => {
    if (!categoryDialogAgent) return
    setCategorySaving(true)
    try {
      const res = await fetch(`/api/agents/${categoryDialogAgent.id}/portal-categories`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restricted: categoryRestricted, categoryIds: Array.from(categorySelectedIds) }),
      })
      if (res.ok) setCategoryDialogAgent(null)
    } catch (e) { console.error(e) }
    finally { setCategorySaving(false) }
  }

  const openStats = async (agent: AgentRecord) => {
    setStatsAgent(agent)
    setStatsLoading(true)
    setStatsData(null)
    const res = await fetch(`/api/agents/${agent.id}/calendar-stats`)
    if (res.ok) setStatsData(await res.json())
    setStatsLoading(false)
  }

  const openPortalStats = async (agent: AgentRecord) => {
    setPortalStatsAgent(agent)
    setPortalStatsLoading(true)
    setPortalStatsData(null)
    const res = await fetch(`/api/agents/${agent.id}/portal-access-logs`)
    if (res.ok) setPortalStatsData(await res.json())
    setPortalStatsLoading(false)
  }

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setContacts([])
    setAddingContact(false)
    setEditingContact(null)
    setSaveError('')
    setFileError('')
    setSheetOpen(true)
  }

  const openEdit = (a: AgentRecord) => {
    setEditing(a)
    setForm({
      name:          a.name,
      commission:               String(a.commission),
      commissionOpenTrip:       String(a.commissionOpenTrip),
      commissionPrivateCharter: String(a.commissionPrivateCharter),
      salespersonId: a.salespersonId ?? '',
      country:       a.country    ?? '',
      address:       a.address    ?? '',
      email:         a.email      ?? '',
      whatsapp:      a.whatsapp   ?? '',
      note:             a.note             ?? '',
      website:          a.website          ?? '',
      instagram:        a.instagram        ?? '',
      source:           a.source           ?? '',
      currentCondition: a.currentCondition ?? '',
      contract:         a.contract         ?? '',
      contractFile:     '',
      contractFileName: a.contractFileName ?? '',
    })
    setAddingContact(false)
    setEditingContact(null)
    setContactForm(EMPTY_CONTACT)
    setSaveError('')
    setFileError('')
    fetchContacts(a.id)
    setSheetOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      const url    = editing ? `/api/agents/${editing.id}` : '/api/agents'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:          form.name.trim(),
          commission:               parseFloat(form.commission) || 0,
          commissionOpenTrip:       parseFloat(form.commissionOpenTrip) || 0,
          commissionPrivateCharter: parseFloat(form.commissionPrivateCharter) || 0,
          salespersonId: isSales ? userId : (form.salespersonId || null),
          country:          form.country          || null,
          address:          form.address          || null,
          email:            form.email            || null,
          whatsapp:         form.whatsapp         || null,
          note:             form.note             || null,
          website:          form.website          || null,
          instagram:        form.instagram        || null,
          source:           form.source           || null,
          currentCondition: form.currentCondition || null,
          contract:         form.contract         || null,
          ...(form.contract !== 'Yes'
            ? { contractFile: null, contractFileName: null }
            : form.contractFile === 'REMOVE'
              ? { contractFile: null, contractFileName: null }
              : form.contractFile
                ? { contractFile: form.contractFile, contractFileName: form.contractFileName }
                : {}),
        }),
      })
      if (res.ok) { await fetchAgents(); setSheetOpen(false) }
      else { const d = await res.json(); setSaveError(d.error ?? 'Failed to save') }
    } catch (e) { console.error(e); setSaveError('Something went wrong') }
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

  // ── Expanded row contact handlers (all sales, any agent) ──────────────────
  const handleExpandedAdd = async (agentId: string) => {
    if (!expandedContactForm.name.trim()) return
    setExpandedSaving(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...expandedContactForm, dateOfBirth: expandedContactForm.dateOfBirth || null }),
      })
      if (res.ok) {
        const created = await res.json()
        setContactsCache(c => ({ ...c, [agentId]: [...(c[agentId] ?? []), created] }))
        setExpandedAddingId(null)
        setExpandedContactForm(EMPTY_CONTACT)
      }
    } catch (e) { console.error(e) }
    finally { setExpandedSaving(false) }
  }

  const handleExpandedUpdate = async (agentId: string, contactId: string) => {
    if (!expandedEditForm.name.trim()) return
    setExpandedSaving(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...expandedEditForm, dateOfBirth: expandedEditForm.dateOfBirth || null }),
      })
      if (res.ok) {
        const updated = await res.json()
        setContactsCache(c => ({ ...c, [agentId]: (c[agentId] ?? []).map(x => x.id === contactId ? updated : x) }))
        setExpandedEditingId(null)
      }
    } catch (e) { console.error(e) }
    finally { setExpandedSaving(false) }
  }

  const handleExpandedDelete = async (agentId: string, contactId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/contacts/${contactId}`, { method: 'DELETE' })
      if (res.ok) setContactsCache(c => ({ ...c, [agentId]: (c[agentId] ?? []).filter(x => x.id !== contactId) }))
    } catch (e) { console.error(e) }
  }

  // ── Void contract ───────────────────────────────────────────────────────────
  const handleVoidContract = async (agentId: string) => {
    setVoidingId(agentId)
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void_contract' }),
      })
      if (res.ok) await fetchAgents()
    } catch (e) { console.error(e) }
    finally { setVoidingId(null) }
  }

  const BLOCKED_CONDITIONS = ['No Response', 'Not Qualified', 'Inactive']

  // ── Generate contract with validation ──────────────────────────────────────
  const handleGenerateContract = (a: AgentRecord) => {
    if (!a.currentCondition || BLOCKED_CONDITIONS.includes(a.currentCondition)) {
      setContractConfirmModal({ agent: a, missing: [`__blocked_condition__:${a.currentCondition ?? 'Not Set'}`] })
      return
    }
    if (a.contract === 'Yes' && a.contractFileName) {
      setContractConfirmModal({ agent: a, missing: ['__contract_uploaded__'] })
      return
    }
    const missing: string[] = []
    if (!a.address?.trim()) missing.push('Address')
    if (!a.country?.trim()) missing.push('Country')
    if (!a.email?.trim())   missing.push('Email')
    const hasCommission = (a.commission ?? 0) > 0 || (a.commissionOpenTrip ?? 0) > 0 || (a.commissionPrivateCharter ?? 0) > 0
    if (!hasCommission)     missing.push('Commission')
    // always show confirmation modal (with or without missing fields)
    setContractConfirmModal({ agent: a, missing })
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

  const AGENT_CSV_HEADER = [
    'name', 'salesperson', 'country', 'address', 'email', 'whatsapp', 'website', 'instagram',
    'source', 'currentCondition', 'commissionOpenTrip', 'commissionPrivateCharter', 'contract', 'isActive', 'note',
    'contactName', 'contactEmail', 'contactWhatsapp', 'contactJobTitle', 'contactDateOfBirth',
  ]

  const downloadTemplate = () => {
    const sample = [
      'Navelia LLC', 'Efrinda', 'United States', '123 Main St, Miami, FL', 'info@navelia.com', '+1 305 555 0100',
      'https://navelia.com', '@navelia', 'Referral', 'Active', '20', '15', 'Yes', 'true', 'Long-time partner agent',
      'Philip D De Wilde', 'philip@navelia.com', '+62 853 3351 4655', 'Charter Manager', '1985-04-12',
    ]
    const csv = [AGENT_CSV_HEADER.join(','), sample.map(v => `"${v.replace(/"/g, '""')}"`).join(',')].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'template-agents.csv'; a.click()
    URL.revokeObjectURL(url)
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
  const salespersonOptions = useMemo(() => {
    const map = new Map<string, string>()
    agents.forEach(a => { if (a.salesperson?.id && a.salesperson.name) map.set(a.salesperson.id, a.salesperson.name) })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [agents])

  const filtered = agents.filter(a => {
    if (isSales && scope === 'mine' && a.salespersonId !== userId) return false
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !(a.salesperson?.name ?? '').toLowerCase().includes(search.toLowerCase())) return false
    if (filterCountry     && a.country              !== filterCountry)     return false
    if (filterSalesperson && a.salesperson?.id       !== filterSalesperson) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages - 1)
  const paginated  = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize)

  const activeCount    = agents.filter(a => a.isActive).length
  const hasActiveFilter = !!(filterCountry || filterSalesperson)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-0.5">
            <h3 className="text-2xl font-bold tracking-tight">Agents</h3>
            <button onClick={() => fetchAgents()} title="Refresh" className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
              <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {isSales && (
              <div className="flex items-center rounded-lg border bg-muted p-0.5 text-xs font-semibold">
                <button
                  onClick={() => setScope('mine')}
                  className="px-3 py-1 rounded-md transition-colors"
                  style={scope === 'mine' ? { background: ACCENT, color: 'white' } : { color: '#6b7280' }}
                >
                  My Agents
                </button>
                <button
                  onClick={() => setScope('all')}
                  className="px-3 py-1 rounded-md transition-colors"
                  style={scope === 'all' ? { background: ACCENT, color: 'white' } : { color: '#6b7280' }}
                >
                  All Agents
                </button>
              </div>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {loading ? '…' : `${activeCount} active agent${activeCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <Button
                variant="outline" size="sm"
                onClick={downloadTemplate}
                className="h-8 px-3 text-xs"
                title="Download a sample CSV with the correct columns"
              >
                <FileDown className="h-3.5 w-3.5 mr-1.5" />
                Template
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
            onClick={() => { setFilterCountry(''); setFilterSalesperson('') }}
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
                    <th className="pb-3 w-6" />
                    <th className="pb-3 pr-3 font-medium text-muted-foreground text-xs">Agent</th>
                    <th className="pb-3 pr-3 font-medium text-muted-foreground text-xs hidden lg:table-cell">Country</th>
                    <th className="pb-3 pr-3 font-medium text-muted-foreground text-xs">Contract</th>
                    {canCalendar && <th className="pb-3 pr-3 font-medium text-muted-foreground text-xs">Calendar</th>}
                    {canPortal && <th className="pb-3 pr-3 font-medium text-muted-foreground text-xs">Portal</th>}
                    <th className="pb-3 pr-3 font-medium text-muted-foreground text-xs hidden md:table-cell">Salesperson</th>
                    <th className="pb-3 pr-3 font-medium text-muted-foreground text-xs text-center">Commission</th>
                    <th className="pb-3 pr-3 font-medium text-muted-foreground text-xs text-center hidden md:table-cell">Bookings</th>
                    <th className="pb-3 pr-3 font-medium text-muted-foreground text-xs hidden lg:table-cell">Created</th>
                    <th className="pb-3 pr-3 font-medium text-muted-foreground text-xs text-center">Status</th>
                    {canManage && <th className="pb-3 font-medium text-muted-foreground text-xs text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginated.map(a => {
                    const duplicateInfo = !a.isActive ? parseDuplicateNote(a.note) : null
                    return (
                    <React.Fragment key={a.id}>
                    <tr className={`hover:bg-muted/30 transition-colors cursor-pointer ${duplicateInfo ? 'opacity-60 bg-red-50/50' : ''}`} onClick={() => handleToggleExpand(a.id)}>

                      {/* Expand chevron */}
                      <td className="py-2.5 pr-1 w-6">
                        <span className="flex items-center justify-center text-muted-foreground">
                          {expandedId === a.id
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                        </span>
                      </td>

                      {/* Avatar + name */}
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-white text-xs font-bold uppercase"
                            style={{ backgroundColor: a.isActive ? ACCENT : '#9ca3af' }}
                          >
                            {a.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-sm leading-tight">{a.name}</div>
                            {a.country && <div className="text-[11px] text-muted-foreground lg:hidden">{a.country}</div>}
                            {duplicateInfo && (
                              <div className="flex items-center gap-1 text-[11px] text-red-600 font-medium mt-0.5">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                Duplikat — sudah dibuat lebih dulu oleh {duplicateInfo.salesperson} pada {new Date(duplicateInfo.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Country — hidden on small screens (shown under name instead) */}
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground hidden lg:table-cell">
                        {a.country || <span className="text-muted-foreground/40">—</span>}
                      </td>

                      {/* Contract */}
                      <td className="py-2.5 pr-3">
                        {canActOnAgent(a) ? (
                          <div className="flex items-center gap-1.5">
                            {a.contract
                              ? <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                  a.contract === 'Yes' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                                }`}>{a.contract}</span>
                              : <span className="text-muted-foreground/40 text-xs">—</span>}
                            {a.contract === 'Yes' && a.contractFileName && (
                              <a
                                href={`/api/agents/${a.id}/contract`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={a.contractFileName}
                                className="text-muted-foreground hover:text-[#bdac7e] transition-colors"
                              >
                                <Download className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                      </td>

                      {/* Calendar */}
                      {canCalendar && (
                        <td className="py-2.5 pr-3" onClick={e => e.stopPropagation()}>
                          {!canActOnAgent(a) ? (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              {!a.calendarToken ? (
                                <button
                                  onClick={() => setCalendarConfirm({ agent: a, action: 'generate' })}
                                  className="flex items-center gap-1 text-[11px] text-[#bdac7e] hover:underline font-medium"
                                >
                                  <Link2 className="h-3 w-3" /> Gen
                                </button>
                              ) : (
                                <>
                                  <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${a.calendarActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                    {a.calendarActive ? 'On' : 'Off'}
                                  </span>
                                  <button
                                    onClick={() => copyCalendarLink(a.calendarToken!, a.id)}
                                    className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                                    title="Copy calendar link"
                                  >
                                    {copiedId === a.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                                  </button>
                                  <button
                                    onClick={() => setCalendarConfirm({ agent: a, action: a.calendarActive ? 'deactivate' : 'activate' })}
                                    className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                                    title={a.calendarActive ? 'Deactivate calendar' : 'Activate calendar'}
                                  >
                                    {a.calendarActive ? <ShieldOff className="h-3 w-3 text-red-500" /> : <ShieldCheck className="h-3 w-3 text-emerald-600" />}
                                  </button>
                                  <button
                                    onClick={() => setCalendarConfirm({ agent: a, action: 'reset' })}
                                    className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                                    title="Reset calendar token"
                                  >
                                    <RotateCw className="h-3 w-3 text-amber-500" />
                                  </button>
                                  <button
                                    onClick={() => openStats(a)}
                                    className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                                    title="View access stats"
                                  >
                                    <BarChart2 className="h-3 w-3" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      )}

                      {/* Agent portal password */}
                      {canPortal && (
                        <td className="py-2.5 pr-3" onClick={e => e.stopPropagation()}>
                          {!canActOnAgent(a) ? (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              {!a.hasPortalPassword ? (
                                <button
                                  onClick={() => openPortalDialog(a)}
                                  className="flex items-center gap-1 text-[11px] text-[#bdac7e] hover:underline font-medium"
                                >
                                  <KeyRound className="h-3 w-3" /> Set
                                </button>
                              ) : (
                                <>
                                  <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${a.portalActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                    {a.portalActive ? 'On' : 'Off'}
                                  </span>
                                  <button
                                    onClick={() => openPortalDialog(a)}
                                    className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                                    title="Reset portal password"
                                  >
                                    <RotateCw className="h-3 w-3 text-amber-500" />
                                  </button>
                                  <button
                                    onClick={() => setPortalConfirm({ agent: a, action: a.portalActive ? 'deactivate' : 'activate' })}
                                    className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                                    title={a.portalActive ? 'Deactivate portal access' : 'Activate portal access'}
                                  >
                                    {a.portalActive ? <ShieldOff className="h-3 w-3 text-red-500" /> : <ShieldCheck className="h-3 w-3 text-emerald-600" />}
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => openCategoryDialog(a)}
                                className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                                title="Media Kit categories shown to this agent"
                              >
                                <ListChecks className="h-3 w-3" />
                              </button>
                              {a.hasPortalPassword && (
                                <button
                                  onClick={() => openPortalStats(a)}
                                  className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                                  title="Portal login history"
                                >
                                  <BarChart2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )}

                      {/* Salesperson — hidden on small screens */}
                      <td className="py-2.5 pr-3 hidden md:table-cell">
                        {a.salesperson
                          ? <span className="text-xs">{a.salesperson.name ?? '—'}</span>
                          : <span className="text-xs text-muted-foreground/40">—</span>
                        }
                      </td>

                      {/* Commission OT + PC stacked */}
                      <td className="py-2.5 pr-3 text-center">
                        {canActOnAgent(a) ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center gap-1 text-[11px]">
                              <span className="text-muted-foreground/60">OT</span>
                              <span className="font-semibold" style={{ color: ACCENT }}>{a.commissionOpenTrip}%</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px]">
                              <span className="text-muted-foreground/60">PC</span>
                              <span className="font-semibold" style={{ color: ACCENT }}>{a.commissionPrivateCharter}%</span>
                            </div>
                          </div>
                        ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                      </td>

                      {/* Booking count — hidden on small screens */}
                      <td className="py-2.5 pr-3 text-center text-xs text-muted-foreground hidden md:table-cell">
                        {a._count.bookings}
                      </td>

                      {/* Created date — hidden on small/medium screens */}
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>

                      {/* Status badge — currentCondition */}
                      <td className="py-2.5 pr-3 text-center">
                        {(() => {
                          const cond = a.currentCondition
                          const cfg: Record<string, string> = {
                            'Active':           'bg-emerald-50 text-emerald-700 border-emerald-200',
                            'In Conversation':  'bg-blue-50 text-blue-700 border-blue-200',
                            'Follow Up':        'bg-violet-50 text-violet-700 border-violet-200',
                            'Contract Sent':    'bg-amber-50 text-amber-700 border-amber-200',
                            'No Response':      'bg-orange-50 text-orange-600 border-orange-200',
                            'Not Qualified':    'bg-red-50 text-red-600 border-red-200',
                            'Inactive':         'bg-gray-50 text-gray-400 border-gray-200',
                          }
                          const cls = cond && cfg[cond] ? cfg[cond] : 'bg-gray-50 text-gray-400 border-gray-200'
                          return (
                            <Badge variant="outline" className={`text-[11px] px-1.5 py-0 whitespace-nowrap ${cls}`}>
                              {cond ?? '—'}
                            </Badge>
                          )
                        })()}
                      </td>

                      {/* Actions — icon-only */}
                      {canManage && (
                        <td className="py-2.5 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5 justify-end">
                            {canActOnAgent(a) && canGenerateContract && (
                              a.contract === 'Yes' && a.contractFileName ? (
                                <button
                                  className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                                  onClick={() => { if (confirm('Void contract? The uploaded contract will be removed and a new one can be generated.')) handleVoidContract(a.id) }}
                                  title="Void contract"
                                  disabled={voidingId === a.id}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <button
                                  className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
                                  onClick={() => handleGenerateContract(a)}
                                  title="Generate agent contract"
                                >
                                  <FileDown className="h-3.5 w-3.5" />
                                </button>
                              )
                            )}
                            {canActOnAgent(a) && (
                              <button
                                className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
                                onClick={() => openEdit(a)}
                                title="Edit agent"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canActOnAgent(a) && (
                              <button
                                className={`p-1.5 rounded transition-colors ${a.isActive
                                  ? 'hover:bg-red-50 text-red-500'
                                  : 'hover:bg-emerald-50 text-emerald-600'
                                }`}
                                onClick={() => setConfirmAgent(a)}
                                title={a.isActive ? 'Deactivate agent' : 'Activate agent'}
                              >
                                {a.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>

                    {/* ── Expanded contacts row ── */}
                    {expandedId === a.id && (
                      <tr key={`${a.id}-contacts`} className="bg-muted/20">
                        <td />
                        <td colSpan={(isAdmin ? 10 : (canCalendar || canManage) ? 9 : 8) + (canPortal ? 1 : 0)} className="py-3 pr-4">
                          <div className="pl-12 pr-2">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Contact Persons {contactsCache[a.id]?.length ? `(${contactsCache[a.id].length})` : ''}
                              </p>
                              {canManage && expandedAddingId !== a.id && (
                                <button
                                  onClick={() => { setExpandedAddingId(a.id); setExpandedContactForm(EMPTY_CONTACT); setExpandedEditingId(null) }}
                                  className="flex items-center gap-1 text-xs text-[#bdac7e] hover:underline font-medium"
                                >
                                  <Plus className="h-3 w-3" /> Add
                                </button>
                              )}
                            </div>

                            {contactsLoadingId === a.id ? (
                              <div className="space-y-1.5">
                                {[...Array(2)].map((_, i) => <div key={i} className="h-8 w-full rounded bg-muted animate-pulse" />)}
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                {(contactsCache[a.id] ?? []).map(c => (
                                  <div key={c.id} className="rounded-md border bg-background px-3 py-2">
                                    {expandedEditingId === c.id ? (
                                      <div className="space-y-2">
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="space-y-1">
                                            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Name *</label>
                                            <input className="w-full h-7 text-xs border rounded px-2" value={expandedEditForm.name} onChange={e => setExpandedEditForm(f => ({ ...f, name: e.target.value }))} />
                                          </div>
                                          <div className="space-y-1">
                                            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Job Title</label>
                                            <input className="w-full h-7 text-xs border rounded px-2" value={expandedEditForm.jobTitle} onChange={e => setExpandedEditForm(f => ({ ...f, jobTitle: e.target.value }))} />
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="space-y-1">
                                            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Email</label>
                                            <input className="w-full h-7 text-xs border rounded px-2" value={expandedEditForm.email} onChange={e => setExpandedEditForm(f => ({ ...f, email: e.target.value }))} />
                                          </div>
                                          <div className="space-y-1">
                                            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">WhatsApp</label>
                                            <input className="w-full h-7 text-xs border rounded px-2" value={expandedEditForm.whatsapp} onChange={e => setExpandedEditForm(f => ({ ...f, whatsapp: e.target.value }))} />
                                          </div>
                                        </div>
                                        <div className="flex gap-2 justify-end">
                                          <button type="button" onClick={() => setExpandedEditingId(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                                          <button type="button" disabled={expandedSaving || !expandedEditForm.name.trim()} onClick={() => handleExpandedUpdate(a.id, c.id)} className="text-xs font-medium text-[#bdac7e] hover:underline disabled:opacity-50">
                                            {expandedSaving ? 'Saving…' : 'Save'}
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-medium">{c.name}</span>
                                            {c.jobTitle && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{c.jobTitle}</span>}
                                          </div>
                                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                            {c.email && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Mail className="h-3 w-3" />{c.email}</span>}
                                            {c.whatsapp && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><MessageCircle className="h-3 w-3" />{c.whatsapp}</span>}
                                            {c.dateOfBirth && <span className="text-[11px] text-muted-foreground">🎂 {new Date(c.dateOfBirth).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>}
                                            {c.addedByName && <span className="text-[10px] text-muted-foreground/60">added by {c.addedByName}</span>}
                                          </div>
                                        </div>
                                        {canManage && (
                                          <div className="flex items-center gap-0.5 shrink-0">
                                            <button onClick={() => { setExpandedEditingId(c.id); setExpandedEditForm({ name: c.name, email: c.email ?? '', whatsapp: c.whatsapp ?? '', jobTitle: c.jobTitle ?? '', dateOfBirth: c.dateOfBirth ? c.dateOfBirth.split('T')[0] : '' }) }} className="p-1 rounded hover:bg-muted text-muted-foreground"><Pencil className="h-3 w-3" /></button>
                                            <button onClick={() => handleExpandedDelete(a.id, c.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}

                                {!contactsCache[a.id]?.length && expandedAddingId !== a.id && (
                                  <p className="text-xs text-muted-foreground py-1">No contact persons yet.</p>
                                )}

                                {/* Add form */}
                                {expandedAddingId === a.id && (
                                  <div className="rounded-md border border-dashed border-[#bdac7e]/50 bg-[#bdac7e]/5 p-3 space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Name *</label>
                                        <input autoFocus className="w-full h-7 text-xs border rounded px-2" value={expandedContactForm.name} onChange={e => setExpandedContactForm(f => ({ ...f, name: e.target.value }))} />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Job Title</label>
                                        <input className="w-full h-7 text-xs border rounded px-2" value={expandedContactForm.jobTitle} onChange={e => setExpandedContactForm(f => ({ ...f, jobTitle: e.target.value }))} />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Email</label>
                                        <input className="w-full h-7 text-xs border rounded px-2" value={expandedContactForm.email} onChange={e => setExpandedContactForm(f => ({ ...f, email: e.target.value }))} />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">WhatsApp</label>
                                        <input className="w-full h-7 text-xs border rounded px-2" value={expandedContactForm.whatsapp} onChange={e => setExpandedContactForm(f => ({ ...f, whatsapp: e.target.value }))} />
                                      </div>
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                      <button type="button" onClick={() => { setExpandedAddingId(null); setExpandedContactForm(EMPTY_CONTACT) }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /> Cancel</button>
                                      <button type="button" disabled={expandedSaving || !expandedContactForm.name.trim()} onClick={() => handleExpandedAdd(a.id)} className="flex items-center gap-1 text-xs font-medium text-[#bdac7e] hover:underline disabled:opacity-50">
                                        {expandedSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  )})}
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
            <div className="flex-1 p-6 space-y-5 overflow-y-auto">

              {/* Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agency / Company Name <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9 h-10"
                    placeholder="e.g. ABC Tours, Raja Ampat Travel"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                {similarAgents.length > 0 && (
                  <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      {similarAgents.map(a => (
                        <div key={a.id}>
                          Agent ini mirip seperti <span className="font-semibold">{a.name}</span> milik {a.salesperson?.name || 'tanpa salesperson'}, biar tidak double
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Commission */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Commission</Label>
                <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-muted/40 border">
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">Open Trip</p>
                    <div className="relative">
                      <Percent className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        type="number" min="0" max="100" step="0.5"
                        className="pl-8 h-9 text-sm"
                        value={form.commissionOpenTrip}
                        onChange={e => setForm(f => ({ ...f, commissionOpenTrip: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">Private Charter</p>
                    <div className="relative">
                      <Percent className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        type="number" min="0" max="100" step="0.5"
                        className="pl-8 h-9 text-sm"
                        value={form.commissionPrivateCharter}
                        onChange={e => setForm(f => ({ ...f, commissionPrivateCharter: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Salesperson — admin only */}
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Salesperson</Label>
                  <Select
                    value={form.salespersonId || 'none'}
                    onValueChange={v => setForm(f => ({ ...f, salespersonId: v === 'none' ? '' : v }))}
                  >
                    <SelectTrigger className="h-10">
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
              )}

              {/* Country */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Country</Label>
                <CountrySelect value={form.country} onChange={v => setForm(f => ({ ...f, country: v }))} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</Label>
                <Input
                  type="email"
                  className="h-10"
                  placeholder="agent@example.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">WhatsApp</Label>
                <Input
                  className="h-10"
                  placeholder="+62 812 3456 7890"
                  value={form.whatsapp}
                  onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Website</Label>
                <Input
                  className="h-10"
                  placeholder="https://example.com"
                  value={form.website}
                  onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instagram</Label>
                <Input
                  className="h-10"
                  placeholder="@username"
                  value={form.instagram}
                  onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Address</Label>
                <textarea
                  rows={2}
                  placeholder="Company address..."
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source</Label>
                {(() => {
                  const SOURCES = ['Referral','Cold Outreach','Exhibition / Event','Social Media','Website','WhatsApp Blast','Walk In','Other']
                  const isOther = form.source !== '' && !SOURCES.slice(0, -1).includes(form.source)
                  const selectVal = isOther ? 'Other' : (form.source || 'none')
                  return (
                    <>
                      <Select
                        value={selectVal}
                        onValueChange={v => setForm(f => ({ ...f, source: v === 'none' ? '' : v === 'Other' ? 'Other' : v }))}
                      >
                        <SelectTrigger className="h-10"><SelectValue placeholder="— Select —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {(form.source === 'Other' || isOther) && (
                        <Input
                          autoFocus
                          className="h-9"
                          placeholder="Please specify source..."
                          value={isOther ? form.source : ''}
                          onChange={e => setForm(f => ({ ...f, source: e.target.value || 'Other' }))}
                        />
                      )}
                    </>
                  )
                })()}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Condition</Label>
                <Select value={form.currentCondition || 'none'} onValueChange={v => setForm(f => ({ ...f, currentCondition: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="— Select —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    <SelectItem value="In Conversation">In Conversation</SelectItem>
                    <SelectItem value="Follow Up">Follow Up</SelectItem>
                    <SelectItem value="Contract Sent">Contract Sent</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="No Response">No Response</SelectItem>
                    <SelectItem value="Not Qualified">Not Qualified</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Note</Label>
                <textarea
                  rows={3}
                  placeholder="Special notes about this agent..."
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contract</Label>
                <Select
                  value={form.contract || 'none'}
                  onValueChange={v => {
                    setForm(f => ({ ...f, contract: v === 'none' ? '' : v, ...(v !== 'Yes' ? { contractFile: '', contractFileName: '' } : {}) }))
                    setFileError('')
                  }}
                >
                  <SelectTrigger className="h-10"><SelectValue placeholder="— Select —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ── Contract PDF Upload (shown when contract = Yes) ── */}
              {form.contract === 'Yes' && (
                <div className="space-y-2 rounded-lg border border-dashed p-3 bg-muted/30">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contract PDF</Label>

                  {/* existing file indicator */}
                  {editing && editing.contractFileName && !form.contractFile && (
                    <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                      <span className="text-xs text-muted-foreground flex-1 truncate">{editing.contractFileName}</span>
                      <a
                        href={`/api/agents/${editing.id}/contract`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-medium hover:underline"
                        style={{ color: ACCENT }}
                      >
                        <Download className="h-3.5 w-3.5" /> View
                      </a>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setForm(f => ({ ...f, contractFile: 'REMOVE', contractFileName: '' }))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* new file selected */}
                  {form.contractFile && form.contractFile !== 'REMOVE' && (
                    <div className="flex items-center gap-2 rounded-md border bg-emerald-50 px-3 py-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span className="text-xs text-emerald-700 flex-1 truncate">{form.contractFileName}</span>
                      <button
                        type="button"
                        className="text-emerald-600 hover:text-destructive"
                        onClick={() => setForm(f => ({ ...f, contractFile: '', contractFileName: editing?.contractFileName ?? '' }))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* remove indicator */}
                  {form.contractFile === 'REMOVE' && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-red-50 px-3 py-2">
                      <span className="text-xs text-destructive flex-1">File will be removed on save</span>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:underline"
                        onClick={() => setForm(f => ({ ...f, contractFile: '', contractFileName: editing?.contractFileName ?? '' }))}
                      >Undo</button>
                    </div>
                  )}

                  {/* upload button */}
                  {(!form.contractFile || form.contractFile === '') && !(editing && editing.contractFileName) && (
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 hover:bg-muted/50 transition-colors">
                      <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Select PDF file (max 5 MB)</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={e => {
                          setFileError('')
                          const file = e.target.files?.[0]
                          if (!file) return
                          if (file.size > 5 * 1024 * 1024) {
                            setFileError('File exceeds 5 MB. Please compress the PDF before uploading.')
                            e.target.value = ''
                            return
                          }
                          const reader = new FileReader()
                          reader.onload = ev => {
                            setForm(f => ({ ...f, contractFile: ev.target?.result as string, contractFileName: file.name }))
                          }
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                  )}

                  {/* replace button when file exists */}
                  {((editing && editing.contractFileName && !form.contractFile) || (form.contractFile && form.contractFile !== 'REMOVE')) && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:underline w-fit">
                      <Upload className="h-3 w-3" />
                      <span>Replace file</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={e => {
                          setFileError('')
                          const file = e.target.files?.[0]
                          if (!file) return
                          if (file.size > 5 * 1024 * 1024) {
                            setFileError('File exceeds 5 MB. Please compress the PDF before uploading.')
                            e.target.value = ''
                            return
                          }
                          const reader = new FileReader()
                          reader.onload = ev => {
                            setForm(f => ({ ...f, contractFile: ev.target?.result as string, contractFileName: file.name }))
                          }
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                  )}

                  {fileError && <p className="text-xs text-destructive">{fileError}</p>}
                </div>
              )}

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
                                <div className="space-y-1">
                                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Name *</label>
                                  <Input
                                    value={editContactForm.name}
                                    onChange={e => setEditContactForm(f => ({ ...f, name: e.target.value }))}
                                    className="h-7 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Job Title</label>
                                  <Input
                                    value={editContactForm.jobTitle}
                                    onChange={e => setEditContactForm(f => ({ ...f, jobTitle: e.target.value }))}
                                    className="h-7 text-sm"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Email</label>
                                  <Input
                                    value={editContactForm.email}
                                    onChange={e => setEditContactForm(f => ({ ...f, email: e.target.value }))}
                                    className="h-7 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">WhatsApp</label>
                                  <Input
                                    value={editContactForm.whatsapp}
                                    onChange={e => setEditContactForm(f => ({ ...f, whatsapp: e.target.value }))}
                                    className="h-7 text-sm"
                                  />
                                </div>
                              </div>
                              <div className="space-y-1 w-1/2 pr-1">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Date of Birth</label>
                                <Input
                                  type="date"
                                  max={TODAY}
                                  value={editContactForm.dateOfBirth}
                                  onChange={e => setEditContactForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                                  className="h-7 text-sm"
                                />
                              </div>
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
                            <div className="space-y-1">
                              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Name *</label>
                              <Input
                                autoFocus
                                value={contactForm.name}
                                onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))}
                                className="h-7 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Job Title</label>
                              <Input
                                value={contactForm.jobTitle}
                                onChange={e => setContactForm(f => ({ ...f, jobTitle: e.target.value }))}
                                className="h-7 text-sm"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Email</label>
                              <Input
                                value={contactForm.email}
                                onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
                                className="h-7 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">WhatsApp</label>
                              <Input
                                value={contactForm.whatsapp}
                                onChange={e => setContactForm(f => ({ ...f, whatsapp: e.target.value }))}
                                className="h-7 text-sm"
                              />
                            </div>
                          </div>
                          <div className="space-y-1 w-1/2 pr-1">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Date of Birth</label>
                            <Input
                              type="date"
                              max={TODAY}
                              value={contactForm.dateOfBirth}
                              onChange={e => setContactForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                              className="h-7 text-sm"
                            />
                          </div>
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
            <div className="p-6 border-t space-y-3">
              {saveError && (
                <p className="text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded-lg px-3 py-2">{saveError}</p>
              )}
              <div className="flex gap-2">
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

      {/* ── Agent Portal Password Dialog ── */}
      <Dialog open={!!portalDialogAgent} onOpenChange={v => !v && setPortalDialogAgent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[#bdac7e]" />
              {portalDialogAgent?.hasPortalPassword ? 'Reset Portal Password' : 'Set Portal Password'}
            </DialogTitle>
            <DialogDescription>
              {portalDialogAgent?.hasPortalPassword
                ? `Set a new agent portal password for ${portalDialogAgent?.name}. The old password will stop working immediately.`
                : `Set an agent portal password for ${portalDialogAgent?.name}. They will log in to the portal with their email and this password.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="portal-password">New password</Label>
              <Input
                id="portal-password"
                type="password"
                autoFocus
                value={portalPasswordValue}
                onChange={e => setPortalPasswordValue(e.target.value)}
                placeholder="Minimal 8 karakter"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-password-confirm">Confirm password</Label>
              <Input
                id="portal-password-confirm"
                type="password"
                value={portalPasswordConfirm}
                onChange={e => setPortalPasswordConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSetPortalPassword()}
              />
            </div>
            {portalPasswordError && <p className="text-xs text-red-600">{portalPasswordError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPortalDialogAgent(null)}>Cancel</Button>
            <Button disabled={portalSaving} onClick={handleSetPortalPassword} style={{ backgroundColor: ACCENT }} className="text-white">
              {portalSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {portalDialogAgent?.hasPortalPassword ? 'Reset Password' : 'Set Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Agent Portal Access Confirmation ── */}
      <AlertDialog open={!!portalConfirm} onOpenChange={v => !v && setPortalConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {portalConfirm?.action === 'deactivate' && <><ShieldOff className="h-4 w-4 text-red-500" /> Deactivate Portal Access</>}
              {portalConfirm?.action === 'activate' && <><ShieldCheck className="h-4 w-4 text-emerald-600" /> Activate Portal Access</>}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {portalConfirm?.action === 'deactivate' && `Deactivate agent portal access for ${portalConfirm?.agent.name}. They will not be able to log in until reactivated. Their password is preserved.`}
              {portalConfirm?.action === 'activate' && `Reactivate agent portal access for ${portalConfirm?.agent.name}. Their existing password will work again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={portalActing}
              onClick={handlePortalAction}
              className={portalConfirm?.action === 'deactivate' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
            >
              {portalActing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {portalConfirm?.action === 'deactivate' && 'Yes, Deactivate'}
              {portalConfirm?.action === 'activate' && 'Yes, Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Media Kit Category Visibility ── */}
      <Dialog open={!!categoryDialogAgent} onOpenChange={v => !v && setCategoryDialogAgent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-[#bdac7e]" /> Media Kit Categories — {categoryDialogAgent?.name}
            </DialogTitle>
            <DialogDescription>Choose which Media Kit categories this agent sees in their portal.</DialogDescription>
          </DialogHeader>
          {categoryLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-3 py-2">
              <RadioGroup value={categoryRestricted ? 'restricted' : 'all'} onValueChange={v => setCategoryRestricted(v === 'restricted')}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="cat-all" />
                  <Label htmlFor="cat-all" className="font-normal cursor-pointer">Show all categories</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="restricted" id="cat-restricted" />
                  <Label htmlFor="cat-restricted" className="font-normal cursor-pointer">Choose specific categories</Label>
                </div>
              </RadioGroup>

              {categoryRestricted && (
                <div className="space-y-1.5 max-h-64 overflow-y-auto rounded-lg border p-3">
                  {allCategories.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No categories yet.</p>
                  ) : allCategories.map(c => (
                    <div key={c.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`cat-${c.id}`}
                        checked={categorySelectedIds.has(c.id)}
                        onCheckedChange={() => toggleCategorySelected(c.id)}
                      />
                      <Label htmlFor={`cat-${c.id}`} className="font-normal cursor-pointer">{c.name}</Label>
                    </div>
                  ))}
                  {categorySelectedIds.size === 0 && (
                    <p className="text-xs text-amber-600 mt-1">No categories selected — this agent will see nothing in Media Kit.</p>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogAgent(null)}>Cancel</Button>
            <Button disabled={categorySaving || categoryLoading} onClick={handleSaveCategories} style={{ backgroundColor: ACCENT }} className="text-white">
              {categorySaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* ── Agent Portal Login History ── */}
      <AlertDialog open={!!portalStatsAgent} onOpenChange={v => !v && setPortalStatsAgent(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4" style={{ color: ACCENT }} />
              Portal Access — {portalStatsAgent?.name}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            {portalStatsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : portalStatsData ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Total Logins', value: portalStatsData.totalAccess, color: 'text-foreground' },
                    { label: 'Last Login', value: portalStatsData.lastAccess ? new Date(portalStatsData.lastAccess).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—', color: 'text-foreground' },
                    { label: 'Suspicious', value: portalStatsData.suspiciousCount, color: portalStatsData.suspiciousCount > 0 ? 'text-red-600' : 'text-muted-foreground' },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {portalStatsData.recentLogs?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Logins</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {portalStatsData.recentLogs.map((log: any) => (
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
              <p className="text-sm text-muted-foreground text-center py-4">No logins yet</p>
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

      {/* ── Contract confirm modal ── */}
      <AlertDialog open={!!contractConfirmModal} onOpenChange={v => { if (!v) setContractConfirmModal(null) }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            {contractConfirmModal?.missing[0]?.startsWith('__blocked_condition__') ? (
              <>
                <AlertDialogTitle className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-600 shrink-0">
                    <X className="h-4 w-4" />
                  </span>
                  Cannot Generate Contract
                </AlertDialogTitle>
                <p className="text-sm text-muted-foreground pt-1">
                  Contract cannot be generated for <strong>{contractConfirmModal?.agent.name}</strong> because their current condition is{' '}
                  <span className="font-semibold text-red-600">
                    {contractConfirmModal?.missing[0]?.split(':')[1]}
                  </span>.
                  Please update the agent&apos;s condition before proceeding.
                </p>
              </>
            ) : contractConfirmModal?.missing[0] === '__contract_uploaded__' ? (
              <>
                <AlertDialogTitle className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-600 shrink-0">
                    <FileDown className="h-4 w-4" />
                  </span>
                  Contract Already Uploaded
                </AlertDialogTitle>
                <p className="text-sm text-muted-foreground pt-1">
                  <strong>{contractConfirmModal?.agent.name}</strong> already has a signed contract uploaded.
                  Please void the existing contract first before generating a new one.
                </p>
              </>
            ) : (
              <>
                <AlertDialogTitle className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#1a3050]/10 text-[#1a3050] shrink-0">
                    <FileDown className="h-4 w-4" />
                  </span>
                  Confirm Agent Data
                </AlertDialogTitle>
                <p className="text-sm text-muted-foreground pt-1">
                  Please review the following data for <strong>{contractConfirmModal?.agent.name}</strong> before generating the contract. Make sure all information is correct and accurate — double-check before proceeding.
                </p>
                {contractConfirmModal && (() => {
                  const a = contractConfirmModal.agent
                  const rows: { label: string; value: string | null; missing: boolean }[] = [
                    { label: 'Name',     value: a.name,     missing: !a.name?.trim() },
                    { label: 'Address',  value: a.address,  missing: !a.address?.trim() },
                    { label: 'Country',  value: a.country,  missing: !a.country?.trim() },
                    { label: 'Email',    value: a.email,    missing: !a.email?.trim() },
                    { label: 'WhatsApp', value: a.whatsapp, missing: false },
                    {
                      label: 'Commission',
                      value: [
                        a.commission           ? `General ${a.commission}%`              : null,
                        a.commissionOpenTrip   ? `Open Trip ${a.commissionOpenTrip}%`    : null,
                        a.commissionPrivateCharter ? `Charter ${a.commissionPrivateCharter}%` : null,
                      ].filter(Boolean).join(' · ') || null,
                      missing: (a.commission ?? 0) === 0 && (a.commissionOpenTrip ?? 0) === 0 && (a.commissionPrivateCharter ?? 0) === 0,
                    },
                  ]
                  return (
                    <div className="mt-3 rounded-lg border overflow-hidden text-sm">
                      {rows.map(r => (
                        <div key={r.label} className={`grid grid-cols-[90px_1fr] gap-2 px-3 py-2.5 border-b last:border-b-0 ${r.missing ? 'bg-red-50' : ''}`}>
                          <span className="text-muted-foreground text-xs pt-0.5 shrink-0">{r.label}</span>
                          {r.missing ? (
                            <span className="flex items-center gap-1 text-red-500 font-medium text-xs">
                              <X className="h-3 w-3 shrink-0" /> Not filled
                            </span>
                          ) : (
                            <span className="text-foreground font-medium text-xs break-words leading-relaxed">
                              {r.value || <span className="text-muted-foreground/40">—</span>}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })()}
                {contractConfirmModal?.missing.length ? (
                  <p className="text-xs text-red-500 mt-2 font-medium">
                    ⚠ Some required fields are missing. Please fill them in before generating.
                  </p>
                ) : null}
              </>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setContractConfirmModal(null)}>Cancel</AlertDialogCancel>
            {!contractConfirmModal?.missing[0] && !contractConfirmModal?.missing.length && (
              <AlertDialogAction
                onClick={() => {
                  window.open(`/print/agent-agreement/${contractConfirmModal!.agent.id}`, '_blank')
                  setContractConfirmModal(null)
                }}
              >
                Generate Contract
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
