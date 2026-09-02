'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { Users, Plus, Trash2, Loader2, ChevronRight, UserSquare2 } from 'lucide-react'
import { toast } from 'sonner'
import { AudienceSourceFields, emptyAudience, buildAudienceSources, audienceStateFromSources, type AudienceState, type YachtSummary } from '@/components/marketing/audiences/AudienceSourceFields'
import { ACCENT, CARD_THEMES, PageHeader, ModuleHero } from '@/components/marketing/shared/MarketingUI'

interface Segment {
  id: string
  name: string
  description: string | null
  sources: unknown
  createdByName: string | null
  createdAt: string
  updatedAt: string
}

const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

export default function AudiencesPage() {
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState<Record<string, number | null>>({})
  const [yachts, setYachts] = useState<YachtSummary[]>([])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [audience, setAudience] = useState<AudienceState>(emptyAudience())
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Segment | null>(null)

  const fetchSegments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/audiences')
      if (res.ok) {
        const data: Segment[] = await res.json()
        setSegments(data)
        data.forEach(s => {
          fetch('/api/marketing/audience-preview', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s.sources),
          }).then(r => r.ok ? r.json() : null).then(d => {
            setCounts(prev => ({ ...prev, [s.id]: d ? d.count : null }))
          }).catch(() => setCounts(prev => ({ ...prev, [s.id]: null })))
        })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSegments() }, [fetchSegments])
  useEffect(() => {
    fetch('/api/yachts').then(r => r.ok ? r.json() : []).then(list => setYachts(list.map((y: YachtSummary) => ({ id: y.id, name: y.name })))).catch(() => {})
  }, [])

  const previewAudience = useCallback(async () => {
    setPreviewLoading(true)
    try {
      const res = await fetch('/api/marketing/audience-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildAudienceSources(audience)),
      })
      const data = await res.json()
      setPreviewCount(res.ok ? data.count : null)
    } finally {
      setPreviewLoading(false)
    }
  }, [audience])

  useEffect(() => {
    if (editorOpen) previewAudience()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorOpen])

  const openNew = () => {
    setEditingId(null); setName(''); setDescription(''); setAudience(emptyAudience()); setPreviewCount(null)
    setEditorOpen(true)
  }

  const openEdit = (s: Segment) => {
    setEditingId(s.id); setName(s.name); setDescription(s.description ?? '')
    setAudience(audienceStateFromSources(s.sources)); setPreviewCount(null)
    setEditorOpen(true)
  }

  const save = async () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const payload = { name: name.trim(), description: description.trim() || null, sources: buildAudienceSources(audience) }
      const res = await fetch(editingId ? `/api/marketing/audiences/${editingId}` : '/api/marketing/audiences', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error ?? 'Failed to save audience'); return }
      toast.success(editingId ? 'Audience updated' : 'Audience created')
      setEditorOpen(false)
      fetchSegments()
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const res = await fetch(`/api/marketing/audiences/${deleteTarget.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Audience deleted'); fetchSegments() }
    else toast.error('Failed to delete audience')
    setDeleteTarget(null)
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <PageHeader
        eyebrow="MARKETING" title="Audiences & Segments"
        subtitle="Create reusable CRM, guest, agent and behavioural audiences for every channel."
        action={<Button onClick={openNew} className="bg-black text-white hover:bg-black/85"><Plus className="h-4 w-4 mr-2" /> Create new</Button>}
      />

      <ModuleHero icon={Users} title="Audiences & Segments" description="This module is included in the system structure and shares the same campaign, audience, content and attribution data." badge="Connected" />

      {loading ? (
        <p className="text-sm text-muted-foreground p-6">Loading...</p>
      ) : segments.length === 0 ? (
        <div className="border rounded-xl border-dashed p-12 text-center text-muted-foreground">
          <UserSquare2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No saved audiences yet</p>
          <p className="text-xs mt-1">Build one here, or save one while creating an Email Campaign.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {segments.map((s, i) => {
            const theme = CARD_THEMES[i % CARD_THEMES.length]
            const count = counts[s.id]
            return (
              <button key={s.id} onClick={() => openEdit(s)} className="text-left border rounded-xl bg-white p-4 hover:shadow-md hover:border-[#bdac7e]/50 transition-all">
                <div className="flex items-start justify-between">
                  <span className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: theme.bg, color: theme.fg }}>
                    <Users className="h-4 w-4" />
                  </span>
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                    {count === undefined ? <Loader2 className="h-3 w-3 animate-spin" /> : `${count ?? 0} contacts`}
                  </Badge>
                </div>
                <h3 className="font-semibold text-sm mt-3">{s.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{s.description || `Updated ${fmt(s.updatedAt)}`}</p>
                <div className="flex items-center gap-1 text-xs font-medium mt-3" style={{ color: ACCENT }}>
                  Open <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </button>
            )
          })}
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit audience' : 'New audience'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Past luxury charter guests" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="What this audience is for" />
            </div>

            <AudienceSourceFields audience={audience} setAudience={setAudience} yachts={yachts} />

            <div className="flex items-center gap-2 text-sm bg-muted/40 rounded-lg p-3">
              <Users className="h-4 w-4" style={{ color: ACCENT }} />
              {previewLoading ? (
                <span className="text-muted-foreground">Calculating audience...</span>
              ) : (
                <span><strong>{previewCount ?? 0}</strong> contact{previewCount === 1 ? '' : 's'} (deduplicated, unsubscribed excluded)</span>
              )}
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={previewAudience}>Refresh</Button>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              {editingId ? (
                <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(segments.find(s => s.id === editingId) ?? null)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
                <Button disabled={saving} onClick={save} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingId ? 'Save changes' : 'Create audience'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete audience?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete &quot;{deleteTarget?.name}&quot;. Campaigns that already used it are unaffected.</AlertDialogDescription>
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
