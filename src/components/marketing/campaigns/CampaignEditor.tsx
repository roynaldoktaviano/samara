'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, ChevronLeft, ChevronRight, Users, Send } from 'lucide-react'
import { toast } from 'sonner'
import EmailBuilder from '@/components/marketing/builder/EmailBuilder'
import { createBlock, renderBlocksToHtml, normalizeDesign, DEFAULT_EMAIL_SETTINGS, type EmailBlock, type EmailSettings } from '@/lib/email-builder'

const ACCENT = '#bdac7e'
const STEPS = ['Details', 'Design', 'Audience', 'Review'] as const

interface TemplateSummary { id: string; name: string }

interface AudienceState {
  customers: boolean; customersSearch: string
  agents: boolean; agentsSearch: string
  agentContacts: boolean; agentContactsSearch: string
  manualEmails: string
}

const emptyAudience = (): AudienceState => ({
  customers: true, customersSearch: '',
  agents: false, agentsSearch: '',
  agentContacts: false, agentContactsSearch: '',
  manualEmails: '',
})

function buildAudienceSources(a: AudienceState) {
  return {
    ...(a.customers && { customers: a.customersSearch ? { search: a.customersSearch } : {} }),
    ...(a.agents && { agents: a.agentsSearch ? { search: a.agentsSearch } : {} }),
    ...(a.agentContacts && { agentContacts: a.agentContactsSearch ? { search: a.agentContactsSearch } : {} }),
    manualEmails: a.manualEmails.split(/[\n,]/).map(s => s.trim()).filter(Boolean),
  }
}

function audienceStateFromSources(sources: any): AudienceState {
  const a = emptyAudience()
  a.customers = !!sources?.customers
  a.customersSearch = sources?.customers?.search ?? ''
  a.agents = !!sources?.agents
  a.agentsSearch = sources?.agents?.search ?? ''
  a.agentContacts = !!sources?.agentContacts
  a.agentContactsSearch = sources?.agentContacts?.search ?? ''
  a.manualEmails = (sources?.manualEmails ?? []).join('\n')
  return a
}

export default function CampaignEditor({
  open, onOpenChange, campaignId, onSaved, onSent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string | null
  onSaved: () => void
  onSent?: (id: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [id, setId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [fromName, setFromName] = useState('')
  const [blocks, setBlocks] = useState<EmailBlock[]>([])
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_EMAIL_SETTINGS)
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [audience, setAudience] = useState<AudienceState>(emptyAudience())
  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [audienceLoading, setAudienceLoading] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)

  const reset = useCallback(() => {
    setStep(0); setId(campaignId)
    setName(''); setSubject(''); setPreviewText(''); setFromEmail(''); setFromName('')
    setBlocks([createBlock('text'), createBlock('footer')])
    setSettings(DEFAULT_EMAIL_SETTINGS)
    setAudience(emptyAudience()); setAudienceCount(null); setScheduledAt('')
  }, [campaignId])

  useEffect(() => {
    if (!open) return
    fetch('/api/marketing/templates').then(r => r.ok ? r.json() : []).then(setTemplates).catch(() => {})

    if (campaignId) {
      setLoading(true)
      fetch(`/api/marketing/campaigns/${campaignId}`)
        .then(r => r.json())
        .then(c => {
          const design = normalizeDesign(c.blocksJson)
          setId(c.id)
          setName(c.name); setSubject(c.subject); setPreviewText(c.previewText ?? '')
          setFromEmail(c.fromEmail); setFromName(c.fromName ?? '')
          setBlocks(design.blocks)
          setSettings(design.settings)
          setAudience(audienceStateFromSources(c.audienceSources))
          setStep(0)
        })
        .finally(() => setLoading(false))
    } else {
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaignId])

  const applyTemplate = async (templateId: string) => {
    const res = await fetch(`/api/marketing/templates/${templateId}`)
    if (!res.ok) return
    const t = await res.json()
    const design = normalizeDesign(t.blocksJson)
    setBlocks(design.blocks)
    setSettings(design.settings)
  }

  const previewAudience = useCallback(async () => {
    setAudienceLoading(true)
    try {
      const res = await fetch('/api/marketing/audience-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAudienceSources(audience)),
      })
      const data = await res.json()
      setAudienceCount(res.ok ? data.count : null)
    } finally {
      setAudienceLoading(false)
    }
  }, [audience])

  useEffect(() => {
    if (step === 2 && open) previewAudience()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, open])

  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (!name.trim()) return 'Campaign name is required'
      if (!subject.trim()) return 'Subject is required'
      if (!fromEmail.trim()) return 'From email is required'
    }
    if (s === 1 && blocks.length === 0) return 'Add at least one block to the design'
    return null
  }

  const persist = async (): Promise<string | null> => {
    const err = validateStep(0)
    if (err) { toast.error(err); return null }
    setSaving(true)
    try {
      const payload = {
        name, subject, previewText, fromEmail, fromName,
        blocksJson: { blocks, settings },
        audienceSources: buildAudienceSources(audience),
      }
      const res = await fetch(id ? `/api/marketing/campaigns/${id}` : '/api/marketing/campaigns', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error ?? 'Failed to save campaign'); return null }
      setId(data.id)
      return data.id as string
    } finally {
      setSaving(false)
    }
  }

  const saveDraft = async () => {
    const savedId = await persist()
    if (savedId) { toast.success('Draft saved'); onSaved() }
  }

  const sendNow = async () => {
    const savedId = await persist()
    if (!savedId) return
    setSending(true)
    try {
      const res = await fetch(`/api/marketing/campaigns/${savedId}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error ?? 'Failed to send'); return }
      toast.success('Campaign is sending…')
      onSaved()
      onOpenChange(false)
      onSent?.(savedId)
    } finally {
      setSending(false)
    }
  }

  const schedule = async () => {
    if (!scheduledAt) { toast.error('Pick a date/time first'); return }
    const savedId = await persist()
    if (!savedId) return
    setSending(true)
    try {
      const res = await fetch(`/api/marketing/campaigns/${savedId}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduledAt }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error ?? 'Failed to schedule'); return }
      toast.success('Campaign scheduled')
      onSaved()
      onOpenChange(false)
    } finally {
      setSending(false)
    }
  }

  const next = () => {
    const err = validateStep(step)
    if (err) { toast.error(err); return }
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-none p-0 flex flex-col gap-0">
        <SheetHeader className="border-b shrink-0">
          <SheetTitle>{id ? 'Edit Campaign' : 'New Campaign'}</SheetTitle>
        </SheetHeader>

        <div className="flex items-center gap-1 border-b px-4 py-2 shrink-0 text-sm">
          {STEPS.map((label, i) => (
            <button
              key={label}
              onClick={() => i < step && setStep(i)}
              className={`px-3 py-1.5 rounded-md font-medium ${i === step ? 'text-white' : i < step ? 'text-muted-foreground hover:bg-gray-100' : 'text-gray-300 cursor-default'}`}
              style={i === step ? { backgroundColor: ACCENT } : undefined}
            >
              {i + 1}. {label}
            </button>
          ))}
          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={saveDraft} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save Draft
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {step === 0 && (
              <div className="p-6 max-w-xl mx-auto space-y-4">
                <div className="space-y-1.5">
                  <Label>Campaign name <span className="text-red-500">*</span></Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Internal name, e.g. July Promo" />
                </div>
                <div className="space-y-1.5">
                  <Label>Subject <span className="text-red-500">*</span></Label>
                  <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="What recipients see as the subject line" />
                </div>
                <div className="space-y-1.5">
                  <Label>Preview text</Label>
                  <Input value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="Shown after the subject in most inboxes" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>From email <span className="text-red-500">*</span></Label>
                    <Input value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="marketing@samarayachting.com" />
                    <p className="text-[11px] text-muted-foreground">Must use a domain verified in Resend.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>From name</Label>
                    <Input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Samara Yachting" />
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="h-full flex flex-col">
                {templates.length > 0 && (
                  <div className="flex items-center gap-2 px-4 py-2 border-b">
                    <Label className="text-xs shrink-0">Start from template</Label>
                    <Select onValueChange={applyTemplate}>
                      <SelectTrigger className="h-8 text-sm max-w-xs"><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                      <SelectContent>
                        {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex-1 min-h-0">
                  <EmailBuilder blocks={blocks} onBlocksChange={setBlocks} settings={settings} onSettingsChange={setSettings} />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="p-6 max-w-2xl mx-auto space-y-5">
                <div className="border rounded-lg p-4 space-y-2">
                  <label className="flex items-center gap-2 font-medium text-sm">
                    <input type="checkbox" checked={audience.customers} onChange={e => setAudience(a => ({ ...a, customers: e.target.checked }))} />
                    Guests (from bookings)
                  </label>
                  {audience.customers && (
                    <Input value={audience.customersSearch} onChange={e => setAudience(a => ({ ...a, customersSearch: e.target.value }))} placeholder="Filter by name or email (optional)" className="h-8 text-sm ml-6 w-[calc(100%-1.5rem)]" />
                  )}
                </div>
                <div className="border rounded-lg p-4 space-y-2">
                  <label className="flex items-center gap-2 font-medium text-sm">
                    <input type="checkbox" checked={audience.agents} onChange={e => setAudience(a => ({ ...a, agents: e.target.checked }))} />
                    Agents
                  </label>
                  {audience.agents && (
                    <Input value={audience.agentsSearch} onChange={e => setAudience(a => ({ ...a, agentsSearch: e.target.value }))} placeholder="Filter by name or email (optional)" className="h-8 text-sm ml-6 w-[calc(100%-1.5rem)]" />
                  )}
                </div>
                <div className="border rounded-lg p-4 space-y-2">
                  <label className="flex items-center gap-2 font-medium text-sm">
                    <input type="checkbox" checked={audience.agentContacts} onChange={e => setAudience(a => ({ ...a, agentContacts: e.target.checked }))} />
                    Agent contacts
                  </label>
                  {audience.agentContacts && (
                    <Input value={audience.agentContactsSearch} onChange={e => setAudience(a => ({ ...a, agentContactsSearch: e.target.value }))} placeholder="Filter by name or email (optional)" className="h-8 text-sm ml-6 w-[calc(100%-1.5rem)]" />
                  )}
                </div>
                <div className="border rounded-lg p-4 space-y-2">
                  <Label className="font-medium text-sm">Manual emails (optional)</Label>
                  <Textarea rows={3} value={audience.manualEmails} onChange={e => setAudience(a => ({ ...a, manualEmails: e.target.value }))} placeholder={'one per line, or comma-separated'} className="font-mono text-xs" />
                </div>

                <div className="flex items-center gap-2 text-sm bg-muted/40 rounded-lg p-3">
                  <Users className="h-4 w-4" style={{ color: ACCENT }} />
                  {audienceLoading ? (
                    <span className="text-muted-foreground">Calculating audience...</span>
                  ) : (
                    <span><strong>{audienceCount ?? 0}</strong> recipient{audienceCount === 1 ? '' : 's'} (deduplicated, unsubscribed excluded)</span>
                  )}
                  <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={previewAudience}>Refresh</Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="p-6 max-w-2xl mx-auto space-y-5">
                <div className="border rounded-lg overflow-hidden">
                  <iframe title="Campaign preview" srcDoc={renderBlocksToHtml(blocks, settings)} className="w-full bg-white" style={{ height: 420, border: 'none' }} sandbox="" />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm bg-muted/40 rounded-lg p-3">
                  <div><span className="text-muted-foreground">Subject:</span> {subject}</div>
                  <div><span className="text-muted-foreground">From:</span> {fromName ? `${fromName} <${fromEmail}>` : fromEmail}</div>
                  <div><span className="text-muted-foreground">Recipients:</span> {audienceCount ?? '—'}</div>
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={sendNow} disabled={sending || saving} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
                    {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Send Now
                  </Button>
                  <span className="text-xs text-muted-foreground">or</span>
                  <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="h-9 w-56" />
                  <Button variant="outline" onClick={schedule} disabled={sending || saving}>Schedule</Button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t px-4 py-3 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < STEPS.length - 1 && (
            <Button size="sm" onClick={next} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
