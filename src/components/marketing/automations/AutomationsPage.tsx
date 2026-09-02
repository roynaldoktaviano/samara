'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { Zap, Plus, Trash2, Loader2, ChevronRight, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { ACCENT, CARD_THEMES, PageHeader, ModuleHero } from '@/components/marketing/shared/MarketingUI'

type TriggerType = 'BEFORE_TRIP' | 'AFTER_TRIP' | 'GUEST_BIRTHDAY'

const TRIGGER_LABEL: Record<TriggerType, string> = {
  BEFORE_TRIP: 'Before trip departure',
  AFTER_TRIP: 'After trip return',
  GUEST_BIRTHDAY: "On guest's birthday",
}

interface Automation {
  id: string
  name: string
  description: string | null
  triggerType: TriggerType
  offsetDays: number
  status: 'ACTIVE' | 'PAUSED'
  templateId: string
  template: { name: string }
  subject: string
  fromEmail: string
  fromName: string | null
  sentCount: number
  pendingCount: number
  failedCount: number
  createdByName: string | null
  createdAt: string
}

interface TemplateSummary { id: string; name: string }

function offsetLabel(triggerType: TriggerType, offsetDays: number): string {
  if (triggerType === 'GUEST_BIRTHDAY') return offsetDays === 0 ? 'On their birthday' : `${offsetDays} day${offsetDays === 1 ? '' : 's'} after their birthday`
  const verb = triggerType === 'BEFORE_TRIP' ? 'before' : 'after'
  return offsetDays === 0 ? `Same day` : `${offsetDays} day${offsetDays === 1 ? '' : 's'} ${verb}`
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingStatus, setEditingStatus] = useState<'ACTIVE' | 'PAUSED'>('PAUSED')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState<TriggerType>('BEFORE_TRIP')
  const [offsetDays, setOffsetDays] = useState('3')
  const [templateId, setTemplateId] = useState('')
  const [subject, setSubject] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [fromName, setFromName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/automations')
      if (res.ok) setAutomations(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    fetch('/api/marketing/templates').then(r => r.ok ? r.json() : []).then(setTemplates).catch(() => {})
  }, [])

  const openNew = () => {
    setEditingId(null); setEditingStatus('PAUSED'); setName(''); setDescription(''); setTriggerType('BEFORE_TRIP'); setOffsetDays('3')
    setTemplateId(''); setSubject(''); setFromEmail(''); setFromName('')
    setEditorOpen(true)
  }

  const openEdit = (a: Automation) => {
    setEditingId(a.id); setEditingStatus(a.status); setName(a.name); setDescription(a.description ?? '')
    setTriggerType(a.triggerType); setOffsetDays(String(a.offsetDays))
    setTemplateId(a.templateId); setSubject(a.subject); setFromEmail(a.fromEmail); setFromName(a.fromName ?? '')
    setEditorOpen(true)
  }

  const save = async () => {
    if (!name.trim() || !templateId || !subject.trim() || !fromEmail.trim()) {
      toast.error('Name, template, subject and from email are required'); return
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(), description: description.trim() || null, triggerType,
        offsetDays: parseInt(offsetDays, 10) || 0, templateId, subject: subject.trim(),
        fromEmail: fromEmail.trim(), fromName: fromName.trim() || null,
        ...(editingId && { status: editingStatus }),
      }
      const res = await fetch(editingId ? `/api/marketing/automations/${editingId}` : '/api/marketing/automations', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error ?? 'Failed to save automation'); return }
      toast.success(editingId ? 'Automation updated' : 'Automation created — turn it on when ready')
      setEditorOpen(false)
      fetchAll()
    } finally {
      setSaving(false)
    }
  }

  const toggleEditingStatus = async (checked: boolean) => {
    const nextStatus = checked ? 'ACTIVE' : 'PAUSED'
    setEditingStatus(nextStatus)
    if (!editingId) return
    setTogglingId(editingId)
    try {
      const res = await fetch(`/api/marketing/automations/${editingId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }),
      })
      if (res.ok) {
        setAutomations(prev => prev.map(x => x.id === editingId ? { ...x, status: nextStatus } : x))
      } else { toast.error('Failed to update status'); setEditingStatus(checked ? 'PAUSED' : 'ACTIVE') }
    } finally {
      setTogglingId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const res = await fetch(`/api/marketing/automations/${deleteTarget.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Automation deleted'); setEditorOpen(false); fetchAll() }
    else toast.error('Failed to delete automation')
    setDeleteTarget(null)
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <PageHeader
        eyebrow="MARKETING" title="Marketing Automations"
        subtitle="Build behavioural, lifecycle and trip-based journeys using live ERP data."
        action={<Button onClick={openNew} className="bg-black text-white hover:bg-black/85"><Plus className="h-4 w-4 mr-2" /> Create new</Button>}
      />

      <ModuleHero icon={Zap} title="Marketing Automations" description="This module is included in the system structure and shares the same campaign, audience, content and attribution data." badge="Connected" />

      {loading ? (
        <p className="text-sm text-muted-foreground p-6">Loading...</p>
      ) : automations.length === 0 ? (
        <div className="border rounded-xl border-dashed p-12 text-center text-muted-foreground">
          <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No automations yet</p>
          <p className="text-xs mt-1">Create one for pre-trip reminders, post-trip follow-ups, or birthday messages.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {automations.map((a, i) => {
            const theme = CARD_THEMES[i % CARD_THEMES.length]
            return (
              <button key={a.id} onClick={() => openEdit(a)} className="text-left border rounded-xl bg-white p-4 hover:shadow-md hover:border-[#bdac7e]/50 transition-all">
                <div className="flex items-start justify-between">
                  <span className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: theme.bg, color: theme.fg }}>
                    <Zap className="h-4 w-4" />
                  </span>
                  <Badge className={a.status === 'ACTIVE' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}>
                    {a.status === 'ACTIVE' ? 'Active' : 'Paused'}
                  </Badge>
                </div>
                <h3 className="font-semibold text-sm mt-3">{a.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{TRIGGER_LABEL[a.triggerType]} · {offsetLabel(a.triggerType, a.offsetDays)}</p>
                <div className="flex items-center gap-1 text-xs font-medium mt-3" style={{ color: ACCENT }}>
                  Open <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </button>
            )
          })}
        </div>
      )}

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingId ? 'Edit automation' : 'New automation'}</SheetTitle>
          </SheetHeader>
          <div className="p-6 space-y-4">
            {editingId && (
              <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/30">
                <div>
                  <p className="text-sm font-medium">{editingStatus === 'ACTIVE' ? 'Active' : 'Paused'}</p>
                  <p className="text-xs text-muted-foreground">{editingStatus === 'ACTIVE' ? 'Running on the hourly automation check' : 'Turn on to start sending'}</p>
                </div>
                <Switch checked={editingStatus === 'ACTIVE'} disabled={togglingId === editingId} onCheckedChange={toggleEditingStatus} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pre-trip guest journey" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="What this automation does" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Trigger</Label>
                <Select value={triggerType} onValueChange={v => setTriggerType(v as TriggerType)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TRIGGER_LABEL) as TriggerType[]).map(t => <SelectItem key={t} value={t}>{TRIGGER_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Days offset</Label>
                <Input type="number" value={offsetDays} onChange={e => setOffsetDays(e.target.value)} placeholder="3" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-2">{TRIGGER_LABEL[triggerType]} · {offsetLabel(triggerType, parseInt(offsetDays, 10) || 0)}</p>

            <div className="space-y-1.5">
              <Label>Email template <span className="text-red-500">*</span></Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {templates.length === 0 && <p className="text-[11px] text-amber-600">No email templates yet — create one under Marketing → Email Templates first.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Subject <span className="text-red-500">*</span></Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="What recipients see as the subject line" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From email <span className="text-red-500">*</span></Label>
                <Input value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="hello@samarayachting.com" />
              </div>
              <div className="space-y-1.5">
                <Label>From name</Label>
                <Input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Samara Yachting" />
              </div>
            </div>

            {editingId && (
              <div className="pt-2">
                {automations.find(a => a.id === editingId) && (() => {
                  const a = automations.find(x => x.id === editingId)!
                  return <p className="text-xs text-muted-foreground">{a.sentCount} sent · {a.pendingCount} pending · {a.failedCount} failed</p>
                })()}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              {editingId ? (
                <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(automations.find(a => a.id === editingId) ?? null)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
                <Button disabled={saving} onClick={save} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingId ? 'Save changes' : 'Create automation'}
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete automation?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete &quot;{deleteTarget?.name}&quot; and its send history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
