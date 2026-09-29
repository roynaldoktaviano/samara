'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { CaseSensitive, Plus, Trash2, Loader2, Upload, Info } from 'lucide-react'
import { unzip } from 'fflate'
import { useFileDrop } from '@/hooks/useFileDrop'
import { customFontValue } from '@/lib/email-builder'
import { refreshEmailFonts } from '@/components/marketing/shared/useEmailFonts'

interface EmailFont {
  id: string
  family: string
  weight: number
  style: string
  format: string
  fileUrl: string
  fileName: string
  fallback: string
  createdByName: string | null
  createdAt: string
}

const FONT_EXTS = ['woff2', 'woff', 'ttf', 'otf']
const ACCEPT = '.woff2,.woff,.ttf,.otf,.zip'
const MAX_BYTES = 5 * 1024 * 1024
// When a zip ships the same face in several formats, keep the one that's smallest and best
// supported by email clients that render web fonts at all.
const FORMAT_RANK: Record<string, number> = { woff2: 0, woff: 1, ttf: 2, otf: 3 }
const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
const FALLBACKS = [
  { label: 'Sans-serif (Arial)', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Serif (Georgia)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Serif (Times New Roman)', value: "'Times New Roman', Times, serif" },
  { label: 'Monospace (Courier New)', value: "'Courier New', Courier, monospace" },
]
const WEIGHTS = [
  [100, 'Thin'], [200, 'Extra Light'], [300, 'Light'], [400, 'Regular'], [500, 'Medium'],
  [600, 'Semi Bold'], [700, 'Bold'], [800, 'Extra Bold'], [900, 'Black'],
] as const
const WEIGHT_LABEL = Object.fromEntries(WEIGHTS) as Record<number, string>

// Best-effort guess from typical font file names ("Montserrat-SemiBoldItalic.woff2") so the
// common case needs no typing — everything stays editable before upload.
function guessFromFileName(name: string): { family: string; weight: number; style: 'normal' | 'italic' } {
  const base = name.replace(/\.[^.]+$/, '')
  const style = /italic|oblique/i.test(base) ? 'italic' : 'normal'
  const tokens: [RegExp, number][] = [
    [/extra\s*light|ultra\s*light/i, 200], [/semi\s*bold|demi\s*bold/i, 600], [/extra\s*bold|ultra\s*bold/i, 800],
    [/thin|hairline/i, 100], [/light/i, 300], [/medium/i, 500], [/black|heavy/i, 900], [/bold/i, 700],
  ]
  const weight = tokens.find(([re]) => re.test(base))?.[1] ?? 400
  const family = base
    .split(/[-_]/)[0]
    .replace(/(variable|vf|webfont)$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
  return { family: family || base, weight, style }
}

interface UploadItem {
  key: string
  file: File
  family: string
  weight: number
  style: 'normal' | 'italic'
  include: boolean
  note?: string
}

function unzipFonts(zip: File): Promise<File[]> {
  return zip.arrayBuffer().then(buf => new Promise((resolve, reject) => {
    unzip(new Uint8Array(buf), {
      // Skip macOS resource-fork junk (__MACOSX/, ._Name.ttf) and everything that isn't a font (licenses, previews).
      filter: f => {
        const base = f.name.split('/').pop() ?? ''
        return !f.name.startsWith('__MACOSX/') && !base.startsWith('._') && FONT_EXTS.includes(extOf(base))
      },
    }, (err, entries) => {
      if (err) return reject(err)
      resolve(Object.entries(entries).map(([path, data]) => new File([data as BlobPart], path.split('/').pop()!)))
    })
  }))
}

export default function EmailFontsPage() {
  const [fonts, setFonts] = useState<EmailFont[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [items, setItems] = useState<UploadItem[]>([])
  const [fallback, setFallback] = useState(FALLBACKS[0].value)
  const [presetFamily, setPresetFamily] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [confirmDelete, setConfirmDelete] = useState<EmailFont | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [previewText, setPreviewText] = useState('The quick brown fox jumps over the lazy dog')
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchFonts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/fonts')
      if (!res.ok) throw new Error()
      setFonts(await res.json())
    } catch { toast.error('Failed to load fonts') }
    finally { setLoading(false) }
  }, [])

  // The shared hook also injects every face into document.head, which is what makes the
  // previews on this page render in the uploaded font.
  useEffect(() => { fetchFonts(); refreshEmailFonts() }, [fetchFonts])

  const families = useMemo(() => {
    const map = new Map<string, EmailFont[]>()
    for (const f of fonts) map.set(f.family, [...(map.get(f.family) ?? []), f])
    return Array.from(map, ([family, faces]) => ({ family, faces }))
  }, [fonts])

  const existsInLibrary = (family: string, weight: number, style: string) =>
    fonts.some(f => f.family.toLowerCase() === family.trim().toLowerCase() && f.weight === weight && f.style === style)

  // Accepts loose font files and/or .zip archives (e.g. a Google Fonts download) and turns
  // them into one reviewable row per face. Rows that would clash — same family/weight/style
  // twice in the batch, a variable font next to static cuts, or a face already in the
  // library — start unchecked so the default "Upload" does the sensible thing.
  const pickFiles = async (picked: File[]) => {
    if (!picked.length) return
    setReading(true)
    try {
      const expanded: File[] = []
      for (const f of picked) {
        const ext = extOf(f.name)
        if (ext === 'zip') {
          try { expanded.push(...await unzipFonts(f)) }
          catch { toast.error(`Could not read ${f.name}`) }
        } else if (FONT_EXTS.includes(ext)) expanded.push(f)
        else toast.error(`${f.name} is not a font or .zip file`)
      }
      if (!expanded.length) { toast.error('No .woff2, .woff, .ttf, or .otf files found'); return }

      const rows: UploadItem[] = expanded
        .sort((a, b) => (FORMAT_RANK[extOf(a.name)] ?? 9) - (FORMAT_RANK[extOf(b.name)] ?? 9))
        .map((file, i) => {
          const guess = guessFromFileName(file.name)
          const existing = families.find(fam => fam.family.toLowerCase() === guess.family.toLowerCase())
          return { key: `${i}-${file.name}`, file, family: presetFamily ?? existing?.family ?? guess.family, weight: guess.weight, style: guess.style, include: true }
        })

      const hasStatic = new Set(rows.filter(r => !/variable/i.test(r.file.name)).map(r => r.family.toLowerCase()))
      const seen = new Set<string>()
      for (const r of rows) {
        const id = `${r.family.toLowerCase()}|${r.weight}|${r.style}`
        if (r.file.size > MAX_BYTES) Object.assign(r, { include: false, note: 'Over 5MB' })
        else if (/variable/i.test(r.file.name) && hasStatic.has(r.family.toLowerCase())) Object.assign(r, { include: false, note: 'Variable font — static files used instead' })
        else if (existsInLibrary(r.family, r.weight, r.style)) Object.assign(r, { include: false, note: 'Already in library' })
        else if (seen.has(id)) Object.assign(r, { include: false, note: 'Duplicate in another format' })
        if (r.include) seen.add(id)
      }
      setItems(rows)
      const fam = families.find(f => f.family.toLowerCase() === rows[0].family.toLowerCase())
      if (fam) setFallback(fam.faces[0].fallback)
    } finally { setReading(false) }
  }

  const { isDragging, dropProps } = useFileDrop(files => { pickFiles(files) }, uploading || reading)

  const updateItem = (key: string, patch: Partial<UploadItem>) =>
    setItems(prev => prev.map(r => (r.key === key ? { ...r, ...patch, note: patch.include === undefined ? r.note : undefined } : r)))

  const openUpload = (family?: string) => {
    setItems([])
    setPresetFamily(family ?? null)
    const existing = family ? families.find(f => f.family === family) : undefined
    setFallback(existing?.faces[0].fallback ?? FALLBACKS[0].value)
    setDialogOpen(true)
  }

  const selected = items.filter(r => r.include)

  const handleUpload = async () => {
    if (!selected.length) { toast.error('Select at least one font file'); return }
    if (selected.some(r => !r.family.trim())) { toast.error('Every selected font needs a family name'); return }
    const keys = selected.map(r => `${r.family.trim().toLowerCase()}|${r.weight}|${r.style}`)
    if (new Set(keys).size !== keys.length) { toast.error('Two selected files have the same family, weight and style'); return }
    const dup = selected.find(r => existsInLibrary(r.family, r.weight, r.style))
    if (dup) { toast.error(`${dup.family} ${WEIGHT_LABEL[dup.weight]}${dup.style === 'italic' ? ' Italic' : ''} already exists — delete it first to replace it`); return }

    setUploading(true)
    setProgress({ done: 0, total: selected.length })
    const failed: string[] = []
    for (const r of selected) {
      try {
        const fd = new FormData()
        fd.append('file', r.file)
        fd.append('family', r.family.trim())
        fd.append('weight', String(r.weight))
        fd.append('style', r.style)
        fd.append('fallback', fallback)
        const res = await fetch('/api/marketing/fonts', { method: 'POST', body: fd })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Upload failed')
        }
      } catch (e) {
        failed.push(`${r.file.name}: ${e instanceof Error ? e.message : 'Upload failed'}`)
      }
      setProgress(p => ({ ...p, done: p.done + 1 }))
    }
    setUploading(false)
    const ok = selected.length - failed.length
    if (ok) toast.success(`${ok} font file${ok > 1 ? 's' : ''} uploaded`)
    if (failed.length) toast.error(failed.join('\n'))
    else setDialogOpen(false)
    // Leave only the failed rows so they can be fixed and retried.
    setItems(prev => prev.filter(r => !r.include || failed.some(f => f.startsWith(`${r.file.name}:`))))
    await fetchFonts()
    refreshEmailFonts()
  }

  const handleDelete = async (f: EmailFont) => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/marketing/fonts/${f.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Font deleted')
      setConfirmDelete(null)
      await fetchFonts()
      refreshEmailFonts()
    } catch { toast.error('Failed to delete font') }
    finally { setDeleting(false) }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CaseSensitive className="h-4 w-4" /> Email Fonts
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Upload brand fonts to use in Email Templates and Email Campaigns — they appear in the builder&apos;s Font dropdown
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => openUpload()} className="gap-1.5 shrink-0">
              <Plus className="h-4 w-4" /> Upload Font
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Custom fonts show in Apple Mail, iOS Mail, Outlook for Mac and most mobile apps. Gmail and Outlook for
              Windows don&apos;t support custom fonts and will show the <span className="font-semibold">fallback font</span> instead —
              pick the fallback closest to your font&apos;s look.
            </p>
          </div>

          {fonts.length > 0 && (
            <Input value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="Type to preview..." className="h-8 text-sm" />
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
            </div>
          ) : families.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <CaseSensitive className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No fonts uploaded yet
            </div>
          ) : (
            <div className="space-y-3">
              {families.map(({ family, faces }) => (
                <div key={family} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{family}</div>
                      <div className="text-xs text-muted-foreground truncate">Fallback: {faces[0].fallback}</div>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs shrink-0" onClick={() => openUpload(family)}>
                      <Plus className="h-3.5 w-3.5" /> Add Weight
                    </Button>
                  </div>
                  <div className="divide-y rounded-md border">
                    {faces.map(f => (
                      <div key={f.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="w-32 shrink-0 space-y-0.5">
                          <div className="text-xs font-medium">{WEIGHT_LABEL[f.weight] ?? f.weight}{f.style === 'italic' ? ' Italic' : ''}</div>
                          <Badge variant="outline" className="text-[10px] uppercase">{f.format === 'truetype' ? 'ttf' : f.format === 'opentype' ? 'otf' : f.format}</Badge>
                        </div>
                        <div
                          className="flex-1 min-w-0 truncate text-lg"
                          style={{ fontFamily: customFontValue(f.family, f.fallback), fontWeight: f.weight, fontStyle: f.style }}
                          title={f.fileName}
                        >
                          {previewText || family}
                        </div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmDelete(f)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => !uploading && setDialogOpen(v)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{presetFamily ? `Add Weight — ${presetFamily}` : 'Upload Font'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div
              {...dropProps}
              onClick={() => !reading && !uploading && inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
            >
              {reading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
              <span className="text-sm text-muted-foreground">
                {items.length ? 'Drop or click to choose different files' : 'Drop font files or a .zip here, or click to browse'}
              </span>
              <span className="text-[11px] text-muted-foreground">.woff2 (recommended), .woff, .ttf, .otf or a .zip of them — max 5MB per font</span>
              <input
                ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden"
                onChange={e => { pickFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
              />
            </div>

            {items.length > 0 && (
              <div className="rounded-md border divide-y">
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={items.every(r => r.include) ? true : items.some(r => r.include) ? 'indeterminate' : false}
                    onCheckedChange={v => setItems(prev => prev.map(r => ({ ...r, include: v === true })))}
                  />
                  <span>{selected.length} of {items.length} file{items.length > 1 ? 's' : ''} selected</span>
                </div>
                {items.map(r => (
                  <div key={r.key} className={`flex flex-wrap sm:flex-nowrap items-center gap-2 px-3 py-2 ${r.include ? '' : 'opacity-60'}`}>
                    <Checkbox checked={r.include} onCheckedChange={v => updateItem(r.key, { include: v === true })} />
                    <div className="w-full sm:w-40 min-w-0 order-last sm:order-none">
                      <div className="text-xs font-medium truncate" title={r.file.name}>{r.file.name}</div>
                      {r.note && <div className="text-[10px] text-amber-600">{r.note}</div>}
                    </div>
                    <Input
                      value={r.family} placeholder="Family name" className="h-8 text-sm flex-1 min-w-[120px]"
                      onChange={e => updateItem(r.key, { family: e.target.value })}
                    />
                    <Select value={String(r.weight)} onValueChange={v => updateItem(r.key, { weight: Number(v) })}>
                      <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WEIGHTS.map(([w, label]) => <SelectItem key={w} value={String(w)}>{w} — {label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={r.style} onValueChange={v => updateItem(r.key, { style: v as 'normal' | 'italic' })}>
                      <SelectTrigger className="h-8 text-xs w-[90px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="italic">Italic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
            {items.length > 0 && (
              <p className="text-[11px] text-muted-foreground">Use the same family name for every weight of a font so they group together in the builder.</p>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Fallback font</Label>
              <Select value={fallback} onValueChange={setFallback}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FALLBACKS.map(f => <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Shown in email apps that don&apos;t support custom fonts (Gmail, Outlook for Windows).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || reading || !selected.length}>
              {uploading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {uploading ? `Uploading ${progress.done}/${progress.total}...` : `Upload${selected.length > 1 ? ` ${selected.length} Files` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={v => !v && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Font</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-semibold text-foreground">{confirmDelete?.family} {confirmDelete && (WEIGHT_LABEL[confirmDelete.weight] ?? confirmDelete.weight)}{confirmDelete?.style === 'italic' ? ' Italic' : ''}</span>?
            Templates and campaigns using it will show the fallback font the next time they&apos;re saved or sent. Emails already sent are not affected.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleting} onClick={() => confirmDelete && handleDelete(confirmDelete)}>
              {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
