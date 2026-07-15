'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Palette, Plus, Pencil, Trash2, Copy, Loader2, Code2, LayoutTemplate, Eye, EyeOff } from 'lucide-react'
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
  const [pickModeOpen, setPickModeOpen] = useState(false)
  const [htmlMode, setHtmlMode] = useState(false)
  const [rawHtml, setRawHtml] = useState('')
  const [showHtmlPreview, setShowHtmlPreview] = useState(false)

  // A template is "HTML mode" if its whole design is a single raw-HTML block —
  // that's how the HTML editor path saves, so re-detect it to reopen the same editor.
  const isHtmlModeDesign = (b: EmailBlock[]) => b.length === 1 && b[0].type === 'html'

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
    setPickModeOpen(true)
  }

  const startBuilderMode = () => {
    setBlocks([createBlock('text'), createBlock('footer')])
    setSettings(DEFAULT_EMAIL_SETTINGS)
    setHtmlMode(false)
    setShowHtmlPreview(false)
    setPickModeOpen(false)
    setEditorOpen(true)
  }

  const startHtmlMode = () => {
    setRawHtml('')
    setSettings(DEFAULT_EMAIL_SETTINGS)
    setHtmlMode(true)
    setShowHtmlPreview(false)
    setPickModeOpen(false)
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
    setSettings(design.settings)
    if (isHtmlModeDesign(design.blocks)) {
      setHtmlMode(true)
      setRawHtml((design.blocks[0] as { code: string }).code)
      setShowHtmlPreview(false)
    } else {
      setHtmlMode(false)
      setBlocks(design.blocks)
    }
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
    if (htmlMode && !rawHtml.trim()) { toast.error('HTML content is required'); return }
    setSaving(true)
    try {
      const savedBlocks = htmlMode ? [{ ...createBlock('html'), code: rawHtml, padding: 0 }] : blocks
      const url = editingId ? `/api/marketing/templates/${editingId}` : '/api/marketing/templates'
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, blocksJson: { blocks: savedBlocks, settings } }),
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
            {htmlMode ? (
              <div className="h-full flex flex-col p-4 gap-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">HTML</Label>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setShowHtmlPreview(v => !v)}>
                      {showHtmlPreview ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                      {showHtmlPreview ? 'Sembunyikan preview' : 'Lihat preview'}
                    </Button>
                    <Button onClick={save} disabled={saving} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90 rounded-full" size="sm">
                      {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                      Save Template
                    </Button>
                  </div>
                </div>
                <div className={`flex-1 min-h-0 grid ${showHtmlPreview ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                  <Textarea
                    value={rawHtml}
                    onChange={e => setRawHtml(e.target.value)}
                    placeholder="<table>...</table> atau <div>...</div> — isi HTML lengkap template kamu"
                    className="font-mono text-xs h-full resize-none"
                  />
                  {showHtmlPreview && (
                    <div className="border rounded-lg overflow-hidden bg-white">
                      <iframe
                        title="Template HTML preview"
                        srcDoc={rawHtml || '<p style="color:#9ca3af;font-family:sans-serif;padding:12px">Belum ada isi...</p>'}
                        className="w-full h-full"
                        style={{ border: 'none' }}
                        sandbox=""
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
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
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={pickModeOpen} onOpenChange={setPickModeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Buat template baru</DialogTitle>
            <DialogDescription>Mau bikin desain-nya pakai HTML sendiri, atau pakai drag & drop builder?</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={startHtmlMode}
              className="flex flex-col items-center gap-2 rounded-lg border p-5 hover:border-[--accent] hover:bg-muted/50 transition-colors"
              style={{ '--accent': ACCENT } as React.CSSProperties}
            >
              <Code2 className="h-6 w-6" style={{ color: ACCENT }} />
              <span className="text-sm font-medium">HTML</span>
              <span className="text-[11px] text-muted-foreground text-center">Tulis / paste kode HTML sendiri</span>
            </button>
            <button
              type="button"
              onClick={startBuilderMode}
              className="flex flex-col items-center gap-2 rounded-lg border p-5 hover:border-[--accent] hover:bg-muted/50 transition-colors"
              style={{ '--accent': ACCENT } as React.CSSProperties}
            >
              <LayoutTemplate className="h-6 w-6" style={{ color: ACCENT }} />
              <span className="text-sm font-medium">Builder</span>
              <span className="text-[11px] text-muted-foreground text-center">Susun pakai drag & drop block</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

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
