'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { Palette, Plus, Pencil, Trash2, Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import EmailBuilder from '@/components/marketing/builder/EmailBuilder'
import { createBlock, normalizeDesign, DEFAULT_EMAIL_SETTINGS, type EmailBlock, type EmailSettings } from '@/lib/email-builder'

const ACCENT = '#bdac7e'

interface Template {
  id: string
  name: string
  description: string | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
}

interface TemplateFull extends Template {
  blocksJson: unknown
  bodyHtml: string
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [blocks, setBlocks] = useState<EmailBlock[]>([])
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_EMAIL_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/templates')
      if (res.ok) setTemplates(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  const openNew = () => {
    setEditingId(null)
    setName('')
    setDescription('')
    setBlocks([createBlock('text'), createBlock('footer')])
    setSettings(DEFAULT_EMAIL_SETTINGS)
    setEditorOpen(true)
  }

  const openEdit = async (t: Template) => {
    const res = await fetch(`/api/marketing/templates/${t.id}`)
    if (!res.ok) { toast.error('Failed to load template'); return }
    const full: TemplateFull = await res.json()
    const design = normalizeDesign(full.blocksJson)
    setEditingId(full.id)
    setName(full.name)
    setDescription(full.description ?? '')
    setBlocks(design.blocks)
    setSettings(design.settings)
    setEditorOpen(true)
  }

  const duplicate = async (t: Template) => {
    const res = await fetch(`/api/marketing/templates/${t.id}`)
    if (!res.ok) { toast.error('Failed to load template'); return }
    const full: TemplateFull = await res.json()
    const create = await fetch('/api/marketing/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${full.name} (copy)`, description: full.description, blocksJson: full.blocksJson }),
    })
    if (create.ok) { toast.success('Template duplicated'); fetchTemplates() }
  }

  const save = async () => {
    if (!name.trim()) { toast.error('Template name is required'); return }
    setSaving(true)
    try {
      const url = editingId ? `/api/marketing/templates/${editingId}` : '/api/marketing/templates'
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, blocksJson: { blocks, settings } }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error ?? 'Failed to save template'); return }
      toast.success('Template saved')
      setEditorOpen(false)
      fetchTemplates()
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const res = await fetch(`/api/marketing/templates/${deleteTarget.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Template deleted'); fetchTemplates() }
    else toast.error('Failed to delete template')
    setDeleteTarget(null)
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5" style={{ color: ACCENT }} />
          <h1 className="text-xl font-semibold">Email Templates</h1>
        </div>
        <Button onClick={openNew} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
          <Plus className="h-4 w-4 mr-2" /> New Template
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : templates.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No templates yet. Create one to reuse across campaigns.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <Card key={t.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-2">
                <p className="font-medium text-sm">{t.name}</p>
                {t.description && <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>}
                <p className="text-[11px] text-muted-foreground">Updated {new Date(t.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                <div className="flex gap-1.5 pt-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openEdit(t)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => duplicate(t)}><Copy className="h-3 w-3 mr-1" />Duplicate</Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs text-red-600 ml-auto" onClick={() => setDeleteTarget(t)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent side="right" className="w-full sm:max-w-none p-0 flex flex-col gap-0">
          <SheetHeader className="border-b shrink-0">
            <SheetTitle>{editingId ? 'Edit Template' : 'New Template'}</SheetTitle>
          </SheetHeader>
          <div className="flex items-center gap-3 border-b px-4 py-2 shrink-0">
            <div className="flex-1">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="h-8 mt-1" placeholder="e.g. Monthly Newsletter" />
            </div>
            <div className="flex-1">
              <Label className="text-xs">Description (optional)</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} className="h-8 mt-1" />
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <EmailBuilder
              blocks={blocks}
              onBlocksChange={setBlocks}
              settings={settings}
              onSettingsChange={setSettings}
              toolbarExtra={
                <Button onClick={save} disabled={saving} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90 rounded-full" size="sm">
                  {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Save Template
                </Button>
              }
            />
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete &quot;{deleteTarget?.name}&quot;. Campaigns already using it keep their own copy of the design.</AlertDialogDescription>
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
