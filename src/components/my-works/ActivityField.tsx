'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Send, Trash2 } from 'lucide-react'
import { Avatar, useWorks, userLabel, type WorkUser } from './shared'

interface Activity { id: string; kind: 'COMMENT' | 'ESTIMATION'; body: string; createdAt: string; userId: string; user: WorkUser }

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Comments + automatic "changed the estimation" entries for one task (oldest first). */
export default function ActivityField({ todoId }: { todoId: string }) {
  const { meId } = useWorks()
  const [items, setItems] = useState<Activity[] | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

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

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true); setError('')
    const res = await fetch(`/api/my-works/${todoId}/activity`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    }).catch(() => null)
    setSending(false)
    if (!res?.ok) { setError((await res?.json().catch(() => null))?.error ?? 'Failed to send'); return }
    const { activity } = await res.json()
    setItems(i => [...(i ?? []), activity])
    setDraft('')
  }

  async function remove(a: Activity) {
    if (!confirm('Delete this comment?')) return
    const res = await fetch(`/api/my-works/${todoId}/activity?activityId=${a.id}`, { method: 'DELETE' })
    if (res.ok) setItems(i => (i ?? []).filter(x => x.id !== a.id))
  }

  return (
    <div className="space-y-3">
      {items === null ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map(a => a.kind === 'ESTIMATION' ? (
            <li key={a.id} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 mt-0.5 shrink-0 text-sky-600" />
              <span><span className="font-medium text-foreground">{userLabel(a.user)}</span> {a.body} · {ago(a.createdAt)}</span>
            </li>
          ) : (
            <li key={a.id} className="flex items-start gap-2 group">
              <Avatar user={a.user} id={a.userId} size={24} />
              <div className="flex-1 min-w-0 rounded-lg bg-muted/50 px-3 py-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold">{userLabel(a.user)}</span>
                  <span className="text-muted-foreground">{ago(a.createdAt)}</span>
                  {a.userId === meId && (
                    <button onClick={() => remove(a)} title="Delete comment"
                      className="ml-auto p-0.5 rounded text-muted-foreground hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{a.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <textarea rows={2} placeholder="Write a comment... (Ctrl+Enter to send)" value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() } }}
          className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none" />
        <button onClick={send} disabled={!draft.trim() || sending} title="Send"
          className="h-9 w-9 flex items-center justify-center rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 transition-colors">
          <Send className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
