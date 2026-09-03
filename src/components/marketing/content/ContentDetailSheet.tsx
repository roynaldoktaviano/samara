'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Loader2, UploadCloud, Image as ImageIcon, FileText, CheckCircle2, XCircle,
  ArrowRight, ExternalLink, Trash2, Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { useFileDrop } from '@/hooks/useFileDrop'
import { uploadToR2WithProgress } from '@/lib/r2-client'
import { FORMAT_LABELS, STATUS_LABELS, STATUS_STYLE, type ContentItem } from './contentTypes'
import { useMarketingTeam, ownerOptionNames } from '@/components/marketing/shared/useMarketingTeam'

const ACCENT = '#bdac7e'

const ACTION_COPY: Record<string, { text: string; tone: string }> = {
  START_PRODUCTION: { text: 'moved this to In Production', tone: 'text-blue-700' },
  SUBMIT_APPROVAL: { text: 'submitted this for approval', tone: 'text-amber-700' },
  APPROVE: { text: 'approved this content', tone: 'text-green-700' },
  REQUEST_CHANGES: { text: 'requested changes', tone: 'text-red-700' },
  RESUBMIT: { text: 'started revisions', tone: 'text-blue-700' },
  PUBLISH: { text: 'marked this as published', tone: 'text-violet-700' },
}

const fmtWhen = (d: string) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const APPROVER_ROLES = ['ADMIN', 'SUPER_ADMIN', 'MARKETING_DIRECTOR']

export default function ContentDetailSheet({ id, onOpenChange, onChanged }: {
  id: string | null
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const { data: session } = useSession()
  const canApprove = APPROVER_ROLES.includes((session?.user as { role?: string })?.role ?? '')
  const [item, setItem] = useState<ContentItem | null>(null)
  const team = useMarketingTeam()
  const [loading, setLoading] = useState(true)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [revisionNote, setRevisionNote] = useState('')
  const [showRevisionBox, setShowRevisionBox] = useState(false)
  const [publishUrl, setPublishUrl] = useState('')
  const [showPublishBox, setShowPublishBox] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchItem = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/marketing/content/${id}`)
      if (res.ok) setItem(await res.json())
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchItem() }, [fetchItem])

  const runAction = async (action: string, extra?: Record<string, unknown>) => {
    if (!id) return
    setBusy(true)
    try {
      const res = await fetch(`/api/marketing/content/${id}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      if (!res.ok) { toast.error((await res.json().catch(() => null))?.error ?? 'Action failed'); return }
      await fetchItem()
      onChanged()
      setShowRevisionBox(false); setRevisionNote('')
      setShowPublishBox(false); setPublishUrl('')
    } finally {
      setBusy(false)
    }
  }

  const handleFilesPicked = async (files: File[]) => {
    const file = files[0]
    if (!file || !id) return
    setUploadPct(0)
    try {
      const pathname = `content-studio/${id}/${Date.now()}-${file.name}`
      const { url } = await uploadToR2WithProgress('/api/marketing/content/upload', pathname, file, setUploadPct)
      const mediaType = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : 'document'
      const res = await fetch(`/api/marketing/content/${id}/versions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaUrl: url, mediaType }),
      })
      if (!res.ok) { toast.error((await res.json().catch(() => null))?.error ?? 'Upload failed'); return }
      toast.success('New version uploaded')
      await fetchItem()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploadPct(null)
    }
  }

  const { isDragging, dropProps } = useFileDrop(handleFilesPicked, uploadPct !== null)

  const updateField = async (patch: Record<string, unknown>) => {
    if (!id) return
    const res = await fetch(`/api/marketing/content/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    if (res.ok) { onChanged() } else { toast.error('Failed to save') }
  }

  const postComment = async () => {
    if (!comment.trim() || !id) return
    const text = comment
    setComment('')
    const res = await fetch(`/api/marketing/content/${id}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    })
    if (res.ok) fetchItem()
    else toast.error('Failed to post comment')
  }

  const confirmDelete = async () => {
    if (!id) return
    const res = await fetch(`/api/marketing/content/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Content deleted'); onChanged(); onOpenChange(false) }
    else toast.error('Failed to delete')
    setDeleteConfirm(false)
  }

  const latestVersion = item?.versions?.[0] ?? null

  return (
    <>
      <Sheet open={!!id} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-2xl w-full overflow-y-auto p-0">
          {loading || !item ? (
            <div className="p-6">
              <SheetTitle className="sr-only">Loading content</SheetTitle>
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={STATUS_STYLE[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                  <Badge variant="outline">{FORMAT_LABELS[item.format]}</Badge>
                  {item.campaignTag && <Badge variant="outline" className="text-muted-foreground">{item.campaignTag}</Badge>}
                </div>
                <SheetTitle>
                  <input
                    defaultValue={item.title} onBlur={e => e.target.value.trim() && e.target.value !== item.title && updateField({ title: e.target.value })}
                    className="text-lg font-semibold w-full bg-transparent focus:outline-none focus:border-b focus:border-[#bdac7e]"
                  />
                </SheetTitle>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Media preview + upload */}
                <div>
                  <div
                    {...dropProps}
                    className={`relative rounded-xl border-2 border-dashed overflow-hidden bg-muted/30 transition-colors ${isDragging ? 'border-[#bdac7e] bg-[#bdac7e]/5' : 'border-border'}`}
                  >
                    {latestVersion?.mediaUrl ? (
                      latestVersion.mediaType === 'video' ? (
                        <video src={latestVersion.mediaUrl} controls className="w-full max-h-96 object-contain bg-black" />
                      ) : latestVersion.mediaType === 'image' ? (
                        <img src={latestVersion.mediaUrl} alt={item.title} className="w-full max-h-96 object-contain" />
                      ) : (
                        <a href={latestVersion.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-6 text-sm text-blue-600 hover:underline">
                          <FileText className="h-4 w-4" /> View file
                        </a>
                      )
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 py-14 text-muted-foreground">
                        <ImageIcon className="h-8 w-8 opacity-40" />
                        <p className="text-sm">No file uploaded yet</p>
                      </div>
                    )}
                    <button
                      type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadPct !== null}
                      className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-md bg-white/95 border px-2.5 py-1.5 text-xs font-medium shadow hover:bg-white"
                    >
                      {uploadPct !== null ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {uploadPct}%</> : <><UploadCloud className="h-3.5 w-3.5" /> Upload version</>}
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" className="hidden"
                      onChange={e => e.target.files?.length && handleFilesPicked(Array.from(e.target.files))} />
                  </div>
                  {item.versions.length > 0 && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span>Version {latestVersion?.versionNumber} of {item.versions.length}</span>
                      <span>·</span>
                      <span>{latestVersion?.createdByName} · {latestVersion && fmtWhen(latestVersion.createdAt)}</span>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Owner</Label>
                    <select
                      value={item.ownerName ?? ''} onChange={e => updateField({ ownerName: e.target.value || null })}
                      className="h-8 w-full text-sm border rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#bdac7e]"
                    >
                      <option value="">Unassigned</option>
                      {ownerOptionNames(team, item.ownerName).map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Due date</Label>
                    <Input type="date" defaultValue={item.dueDate ? item.dueDate.slice(0, 10) : ''} onBlur={e => updateField({ dueDate: e.target.value || null })} className="h-8 text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Caption / copy</Label>
                  <Textarea defaultValue={item.caption ?? ''} onBlur={e => updateField({ caption: e.target.value })} rows={3} placeholder="No caption yet" className="text-sm" />
                </div>

                {/* Status action bar */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  {item.status === 'IDEA' && (
                    <ActionRow icon={ArrowRight} label="Ready to start production on this idea." button="Start production" onClick={() => runAction('start_production')} busy={busy} />
                  )}
                  {item.status === 'IN_PRODUCTION' && (
                    <ActionRow
                      icon={Send} label={item.versions.length === 0 ? 'Upload a file above before submitting for approval.' : 'Ready for review once the file looks right.'}
                      button="Submit for approval" onClick={() => runAction('submit_approval')} busy={busy} disabled={item.versions.length === 0}
                    />
                  )}
                  {item.status === 'WAITING_APPROVAL' && !showRevisionBox && (
                    canApprove ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm text-muted-foreground flex-1 min-w-[180px]">Waiting for your decision.</p>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setShowRevisionBox(true)} disabled={busy}>
                          <XCircle className="h-3.5 w-3.5 mr-1.5" /> Request changes
                        </Button>
                        <Button size="sm" onClick={() => runAction('approve')} disabled={busy} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Approve
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Waiting for a Marketing Director to review.</p>
                    )
                  )}
                  {item.status === 'WAITING_APPROVAL' && showRevisionBox && (
                    <div className="space-y-2">
                      <Label className="text-xs">What needs to change?</Label>
                      <Textarea value={revisionNote} onChange={e => setRevisionNote(e.target.value)} rows={2} placeholder="e.g. Use the calmer opening shot for the luxury audience" autoFocus />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setShowRevisionBox(false); setRevisionNote('') }}>Cancel</Button>
                        <Button size="sm" variant="destructive" disabled={!revisionNote.trim() || busy} onClick={() => runAction('request_changes', { comment: revisionNote })}>Send back for revision</Button>
                      </div>
                    </div>
                  )}
                  {item.status === 'REVISION' && (
                    <ActionRow icon={ArrowRight} label="Changes were requested — see the note below. Start revising, then resubmit." button="Start revisions" onClick={() => runAction('resubmit')} busy={busy} />
                  )}
                  {item.status === 'APPROVED' && !showPublishBox && (
                    <ActionRow icon={CheckCircle2} label="Approved and ready to go live." button="Mark as published" onClick={() => setShowPublishBox(true)} busy={busy} />
                  )}
                  {item.status === 'APPROVED' && showPublishBox && (
                    <div className="space-y-2">
                      <Label className="text-xs">Live link (optional)</Label>
                      <Input value={publishUrl} onChange={e => setPublishUrl(e.target.value)} placeholder="https://instagram.com/p/..." />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setShowPublishBox(false); setPublishUrl('') }}>Cancel</Button>
                        <Button size="sm" disabled={busy} onClick={() => runAction('publish', { liveUrl: publishUrl })} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">Confirm published</Button>
                      </div>
                    </div>
                  )}
                  {item.status === 'PUBLISHED' && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-violet-600" /> Published{item.liveUrl && <>·<a href={item.liveUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">view live <ExternalLink className="h-3 w-3" /></a></>}
                    </div>
                  )}
                </div>

                {/* Comments / timeline */}
                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground">Discussion</Label>
                  <div className="space-y-3">
                    {(item.comments ?? []).map(c => (
                      <div key={c.id} className="text-sm">
                        {c.action ? (
                          <p className={`text-xs ${ACTION_COPY[c.action]?.tone ?? 'text-muted-foreground'}`}>
                            <strong>{c.authorName}</strong> {ACTION_COPY[c.action]?.text ?? c.action.toLowerCase()} · {fmtWhen(c.createdAt)}
                            {c.text && <span className="block mt-0.5 text-foreground not-italic">&ldquo;{c.text}&rdquo;</span>}
                          </p>
                        ) : (
                          <div>
                            <p><strong>{c.authorName}</strong> <span className="text-xs text-muted-foreground">{fmtWhen(c.createdAt)}</span></p>
                            <p className="text-muted-foreground">{c.text}</p>
                          </div>
                        )}
                      </div>
                    ))}
                    {(item.comments ?? []).length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
                  </div>
                  <div className="flex gap-2">
                    <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment..." onKeyDown={e => e.key === 'Enter' && postComment()} />
                    <Button size="sm" variant="outline" onClick={postComment} disabled={!comment.trim()}>Send</Button>
                  </div>
                </div>
              </div>

              <div className="border-t px-6 py-3 flex justify-end">
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteConfirm(true)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete content
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this content?</AlertDialogTitle>
            <AlertDialogDescription>This removes &quot;{item?.title}&quot; and its full version and comment history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ActionRow({ icon: Icon, label, button, onClick, busy, disabled }: {
  icon: React.ElementType; label: string; button: string; onClick: () => void; busy: boolean; disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <p className="text-sm text-muted-foreground flex-1">{label}</p>
      <Button size="sm" onClick={onClick} disabled={busy || disabled} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90 shrink-0">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : button}
      </Button>
    </div>
  )
}
