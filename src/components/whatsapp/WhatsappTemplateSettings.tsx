'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import { FileText, Plus, Pencil, Trash2, RefreshCw } from 'lucide-react'
import { WHATSAPP_BRANDS, WHATSAPP_BRAND_LABELS, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { countTemplateParams } from '@/lib/whatsapp-templates'

interface TemplateRow { id: string; name: string; label: string; language: string; bodyText: string; paramLabels: string[] }
type FormState = Omit<TemplateRow, 'id'> & { id?: string }

const EMPTY_FORM: FormState = { name: '', label: '', language: 'en', bodyText: '', paramLabels: [] }

/**
 * Admin registry of approved WhatsApp Message Templates per brand (see WhatsappTemplate in
 * prisma/schema.prisma). The template itself is created and approved in Meta Business
 * Manager — this only tells the ERP it exists, so sales can pick it when starting a chat or
 * replying after the 24h window closes.
 */
export default function WhatsappTemplateSettings() {
  const [brand, setBrand] = useState<WhatsappBrand>(WHATSAPP_BRANDS[0])
  const [rows, setRows] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const confirm = useConfirm()

  const load = useCallback(async (forBrand: WhatsappBrand) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/templates?brand=${forBrand}&manage=1`)
      setRows(res.ok ? await res.json() : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(brand) }, [brand, load])

  const paramCount = useMemo(() => countTemplateParams(form?.bodyText ?? ''), [form?.bodyText])

  async function save() {
    if (!form) return
    setSaving(true)
    try {
      const res = await fetch(form.id ? `/api/whatsapp/templates/${form.id}` : '/api/whatsapp/templates', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, brand, paramLabels: form.paramLabels.slice(0, paramCount) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      toast.success('Template saved')
      setForm(null)
      await load(brand)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function syncFromMeta() {
    setSyncing(true)
    try {
      const res = await fetch('/api/whatsapp/templates/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to sync')
      toast.success(`Synced from Meta: ${data.created} new, ${data.updated} updated`)
      if (data.skipped?.length) toast.warning(`Skipped ${data.skipped.length} template(s):\n${data.skipped.join('\n')}`, { duration: 10000 })
      await load(brand)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to sync')
    } finally {
      setSyncing(false)
    }
  }

  async function remove(row: TemplateRow) {
    if (!(await confirm({
      title: `Delete template "${row.label}" from the ERP?`,
      description: 'The template in Meta is not deleted.',
      destructive: true,
    }))) return
    const res = await fetch(`/api/whatsapp/templates/${row.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete'); return }
    await load(brand)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-5 w-5" /> WhatsApp Templates
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          First create the template and get it approved in Meta Business Manager (WhatsApp Manager › Message Templates) for
          that brand number, then register it here with the exact same <b>name</b> and <b>language</b>. Templates are
          used to start a chat with a new customer, or to reply after the 24h window has passed.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={brand} onValueChange={v => setBrand(v as WhatsappBrand)}>
          <TabsList>
            {WHATSAPP_BRANDS.map(b => <TabsTrigger key={b} value={b}>{WHATSAPP_BRAND_LABELS[b]}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={syncFromMeta} loading={syncing}>
            {!syncing && <RefreshCw className="h-4 w-4" />} Sync from Meta
          </Button>
          <Button size="sm" onClick={() => setForm({ ...EMPTY_FORM })}>
            <Plus className="h-4 w-4" /> Add Template
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Template — {WHATSAPP_BRAND_LABELS[brand]}</CardTitle>
          <CardDescription>&quot;Hello World (sample)&quot; is always available for testing and doesn&apos;t need to be registered.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No templates registered for {WHATSAPP_BRAND_LABELS[brand]} yet.</p>
          ) : rows.map(row => (
            <div key={row.id} className="rounded-md border p-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground font-mono">{row.name} · {row.language}</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1.5 line-clamp-3">{row.bodyText}</p>
              </div>
              <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={() => setForm({ ...row })} aria-label={`Edit template ${row.label}`}><Pencil className="size-3.5" /></Button>
              <Button size="icon" variant="ghost" className="size-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => remove(row)} aria-label={`Delete template ${row.label}`}><Trash2 className="size-3.5" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={open => { if (!open) setForm(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit' : 'Add'} Template — {WHATSAPP_BRAND_LABELS[brand]}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="wa-tpl-name" className="text-xs">Template name (exactly as in Meta)</Label>
                  <Input id="wa-tpl-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="follow_up_inquiry" className="h-9 font-mono" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="wa-tpl-language" className="text-xs">Language code</Label>
                  <Input id="wa-tpl-language" value={form.language} onChange={e => setForm({ ...form, language: e.target.value })} placeholder="en / en_US / id" className="h-9 font-mono" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="wa-tpl-label" className="text-xs">Label (shown to sales)</Label>
                <Input id="wa-tpl-label" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Follow up inquiry" className="h-9" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wa-tpl-body" className="text-xs">Message body (copy from Meta, including {'{{1}}'}, {'{{2}}'}, …)</Label>
                <Textarea id="wa-tpl-body" value={form.bodyText} onChange={e => setForm({ ...form, bodyText: e.target.value })} rows={5}
                  placeholder={'Hi {{1}}, thank you for your interest in {{2}}...'} />
              </div>
              {paramCount > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="wa-tpl-param-0" className="text-xs">Label for each placeholder</Label>
                  {Array.from({ length: paramCount }, (_, i) => (
                    <Input key={i} id={`wa-tpl-param-${i}`} aria-label={`Label for placeholder {{${i + 1}}}`} value={form.paramLabels[i] ?? ''} placeholder={`{{${i + 1}}} — e.g. Customer name`} className="h-9"
                      onChange={e => { const next = [...form.paramLabels]; next[i] = e.target.value; setForm({ ...form, paramLabels: next }) }} />
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
