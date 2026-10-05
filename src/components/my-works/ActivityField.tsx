'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Trash2, Paperclip, X, Loader2, FileText, Upload } from 'lucide-react'
import { useFileDrop } from '@/hooks/useFileDrop'
import { uploadToR2WithProgress } from '@/lib/r2-client'
import { Avatar, fmtSize, useWorks, userLabel, type Attachment, type WorkUser } from './shared'

interface Activity {
  id: string; kind: 'COMMENT' | 'ESTIMATION'; body: string; createdAt: string
  userId: string; user: WorkUser; attachments: Attachment[]
}
interface Pending { id: string; name: string; progress: number; error?: string }

const MAX_SIZE = 25 * 1024 * 1024 // keep in sync with TODO_ATTACHMENT_MAX_SIZE (src/lib/todo.ts)
const MAX_FILES = 10 // keep in sync with TODO_COMMENT_MAX_FILES

// "Oct 5 at 9:41 pm" — same feel as ClickUp's activity feed.
function fmtWhen(iso: string) {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  return `${day} at ${time}`
}

function CommentFiles({ files }: { files: Attachment[] }) {
  const images = files.filter(f => f.contentType.startsWith('image/'))
  const others = files.filter(f => !f.contentType.startsWith('image/'))
  return (
    <div className="mt-2 space-y-1.5">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {images.map(f => (
            <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" title={f.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.name} className="h-28 max-w-[220px] rounded-md border object-cover hover:opacity-90" />
            </a>
          ))}
        </div>
      )}
      {others.map(f => (
        <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" download={f.name}
          className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs hover:bg-muted">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate flex-1 font-medium">{f.name}</span>
          <span className="text-muted-foreground shrink-0">{fmtSize(f.size)}</span>
        </a>
      ))}
    </div>
  )
}

/**
 * Right-hand Activity panel of the task modal: "created" + estimation history and comments
 * (oldest first, newest at the bottom), with a composer that takes files/images by click,
 * paste or drag & drop.
 */
export default function ActivityField({ todoId, uploadPrefix, createdAt, createdBy }: {
  todoId: string; uploadPrefix: string; createdAt: string; createdBy: { id: string; user: WorkUser | undefined }
}) {
  const { meId } = useWorks()
  const [items, setItems] = useState<Activity[] | null>(null)
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const filesRef = useRef(files)
  filesRef.current = files

  const load = useCallback(async () => {
    const res = await fetch(`/api/my-works/${todoId}/activity`).catch(() => null)
    if (res?.ok) setItems((await res.json()).activities ?? [])
    else setItems(i => i ?? [])
  }, [todoId])
  useEffect(() => { load() }, [load])
  // Someone else commenting / changing dates while this task is open.
  useEffect(() => {
    window.addEventListener('my-works-changed', load)
    return () => window.removeEventListener('my-works-changed', load)
  }, [load])
  // Keep the newest entry in view.
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [items?.length])

  async function addFiles(list: File[]) {
    const room = MAX_FILES - filesRef.current.length - pending.filter(p => !p.error).length
    const jobs = list.slice(0, Math.max(0, room)).map(file => ({ file, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` }))
    if (!jobs.length) return
    setPending(p => [...p, ...jobs.map(j => ({ id: j.id, name: j.file.name, progress: 0, error: j.file.size > MAX_SIZE ? 'Over 25MB' : undefined }))])
    await Promise.all(jobs.filter(j => j.file.size <= MAX_SIZE).map(async ({ file, id }) => {
      const safe = (file.name || 'pasted-image.png').replace(/[/\\?#%]/g, '_')
      try {
        const { url } = await uploadToR2WithProgress('/api/my-works/upload', `${uploadPrefix}${Date.now()}-${safe}`, file,
          pr => setPending(p => p.map(x => x.id === id ? { ...x, progress: pr } : x)))
        const att: Attachment = { url, name: file.name || safe, size: file.size, contentType: file.type || 'application/octet-stream', uploadedAt: new Date().toISOString() }
        filesRef.current = [...filesRef.current, att]
        setFiles(filesRef.current)
        setPending(p => p.filter(x => x.id !== id))
      } catch (e) {
        setPending(p => p.map(x => x.id === id ? { ...x, error: e instanceof Error ? e.message : 'Upload failed' } : x))
      }
    }))
  }
  const { isDragging, dropProps } = useFileDrop(addFiles)
  const uploading = pending.some(p => !p.error)

  async function send() {
    const body = draft.trim()
    if ((!body && !files.length) || sending || uploading) return
    setSending(true); setError('')
    const res = await fetch(`/api/my-works/${todoId}/activity`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, attachments: files }),
    }).catch(() => null)
    setSending(false)
    if (!res?.ok) { setError((await res?.json().catch(() => null))?.error ?? 'Failed to send'); return }
    const { activity } = await res.json()
    setItems(i => [...(i ?? []), activity])
    setDraft(''); setFiles([]); setPending([])
  }

  async function remove(a: Activity) {
    if (!confirm('Delete this comment?')) return
    const res = await fetch(`/api/my-works/${todoId}/activity?activityId=${a.id}`, { method: 'DELETE' })
    if (res.ok) setItems(i => (i ?? []).filter(x => x.id !== a.id))
  }

  const who = (id: string, u: WorkUser | undefined) => id === meId ? 'You' : userLabel(u)
  const canSend = (draft.trim() || files.length) && !sending && !uploading

  return (
    <div className="relative flex flex-col h-full min-h-0" {...dropProps}>
      {isDragging && (
        <div className="absolute inset-2 z-10 rounded-xl border-2 border-dashed border-amber-500 bg-amber-50/90 flex flex-col items-center justify-center text-sm font-medium text-amber-800 pointer-events-none">
          <Upload className="h-6 w-6 mb-1" />Drop files to attach to your comment
        </div>
      )}
      <div className="px-5 py-3.5 border-b bg-background">
        <h4 className="font-semibold text-sm">Activity</h4>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        <div className="flex items-start gap-2 text-xs text-muted-foreground px-1">
          <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/60 shrink-0" />
          <span className="flex-1">{who(createdBy.id, createdBy.user)} created this task</span>
          <span className="shrink-0">{fmtWhen(createdAt)}</span>
        </div>
        {items === null && <p className="text-xs text-muted-foreground px-1">Loading...</p>}
        {items?.map(a => a.kind === 'ESTIMATION' ? (
          <div key={a.id} className="flex items-start gap-2 text-xs text-muted-foreground px-1">
            <span className="mt-1.5 h-1 w-1 rounded-full bg-sky-500 shrink-0" />
            <span className="flex-1"><span className="font-medium text-foreground">{who(a.userId, a.user)}</span> {a.body}</span>
            <span className="shrink-0">{fmtWhen(a.createdAt)}</span>
          </div>
        ) : (
          <div key={a.id} className="rounded-xl border bg-background p-3 group">
            <div className="flex items-center gap-2">
              <Avatar user={a.user} id={a.userId} size={26} />
              <span className="text-sm font-semibold truncate">{userLabel(a.user)}</span>
              <span className="text-xs text-muted-foreground shrink-0">{fmtWhen(a.createdAt)}</span>
              {a.userId === meId && (
                <button onClick={() => remove(a)} title="Delete comment"
                  className="ml-auto p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {a.body && <p className="text-sm whitespace-pre-wrap break-words mt-2">{a.body}</p>}
            {a.attachments?.length > 0 && <CommentFiles files={a.attachments} />}
          </div>
        ))}
      </div>

      <div className="border-t bg-background p-3">
        <div className="rounded-xl border focus-within:ring-1 focus-within:ring-amber-500">
          <textarea rows={2} placeholder="Write a comment..." value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() } }}
            onPaste={e => { const f = Array.from(e.clipboardData.files); if (f.length) { e.preventDefault(); addFiles(f) } }}
            className="w-full px-3 pt-2.5 text-sm bg-transparent focus:outline-none resize-none" />
          {(files.length > 0 || pending.length > 0) && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {files.map(f => (
                <span key={f.url} className="flex items-center gap-1.5 rounded-md border bg-muted/40 pl-1 pr-1.5 py-1 text-xs max-w-[180px]">
                  {f.contentType.startsWith('image/')
                    ? <img src={f.url} alt="" className="h-6 w-6 rounded object-cover" /> // eslint-disable-line @next/next/no-img-element
                    : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className="truncate">{f.name}</span>
                  <button onClick={() => setFiles(x => x.filter(y => y.url !== f.url))} className="text-muted-foreground hover:text-red-600"><X className="h-3 w-3" /></button>
                </span>
              ))}
              {pending.map(p => (
                <span key={p.id} className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs max-w-[180px] ${p.error ? 'border-red-200 bg-red-50 text-red-700' : 'bg-muted/40'}`}>
                  {p.error ? <Paperclip className="h-3.5 w-3.5 shrink-0" /> : <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
                  <span className="truncate">{p.error ? `${p.name} — ${p.error}` : `${p.name} ${p.progress}%`}</span>
                  {p.error && <button onClick={() => setPending(x => x.filter(y => y.id !== p.id))}><X className="h-3 w-3" /></button>}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 px-2 pb-2">
            <button type="button" onClick={() => inputRef.current?.click()} title="Attach files or images"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
              <Paperclip className="h-4 w-4" />
            </button>
            <input ref={inputRef} type="file" multiple className="hidden"
              onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = '' }} />
            <span className="text-[11px] text-muted-foreground">Ctrl+Enter to send · paste or drop files</span>
            <button onClick={send} disabled={!canSend} title="Send"
              className="ml-auto h-8 px-3 flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-40 transition-colors">
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Send
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      </div>
    </div>
  )
}
