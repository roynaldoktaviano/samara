'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageSquare, Send, Trash2 } from 'lucide-react'
import { Avatar, useWorks, userLabel, type WorkUser } from './shared'

interface Comment { id: string; body: string; createdAt: string; userId: string; user: WorkUser }

const fmtWhen = (s: string) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Comment thread on a task (ClickUp-style activity column). Enter sends, Shift+Enter adds a line. */
export default function CommentsPanel({ todoId }: { todoId: string }) {
  const { meId } = useWorks()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/my-works/${todoId}/comments`)
    if (res.ok) { setComments((await res.json()).comments ?? []); setError('') }
    else setError('Could not load comments')
    setLoading(false)
  }, [todoId])
  useEffect(() => { load() }, [load])
  // Someone else commenting re-broadcasts the 'my-works' topic (see src/app/page.tsx).
  useEffect(() => {
    window.addEventListener('my-works-changed', load)
    return () => window.removeEventListener('my-works-changed', load)
  }, [load])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [comments.length])

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true); setError('')
    const res = await fetch(`/api/my-works/${todoId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    })
    const data = await res.json().catch(() => ({}))
    setSending(false)
    if (!res.ok) { setError(data.error ?? 'Failed to send'); return }
    setComments(cs => [...cs, data.comment]); setText('')
  }

  async function remove(c: Comment) {
    if (!confirm('Delete this comment?')) return
    setComments(cs => cs.filter(x => x.id !== c.id))
    const res = await fetch(`/api/my-works/${todoId}/comments/${c.id}`, { method: 'DELETE' })
    if (!res.ok) load()
  }

  return (
    <div className="flex flex-col flex-1 w-full min-w-0 h-full min-h-0">
      <div className="px-5 py-3 border-b flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />Comments
        {comments.length > 0 && <span className="text-xs font-normal text-muted-foreground">({comments.length})</span>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="space-y-3 animate-pulse">{[0, 1].map(i => <div key={i} className="h-20 rounded-xl bg-muted" />)}</div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No comments yet.<br />Start the conversation below.</p>
        ) : comments.map(c => (
          <div key={c.id} className="group rounded-xl border bg-background p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Avatar id={c.userId} user={c.user} size={26} />
              <span className="text-sm font-semibold truncate">{userLabel(c.user)}</span>
              <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{fmtWhen(c.createdAt)}</span>
              {c.userId === meId && (
                <button onClick={() => remove(c)} title="Delete comment"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-opacity">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">{c.body}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t p-3 space-y-1.5">
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-end gap-2 border rounded-xl px-3 py-2 bg-background focus-within:ring-1 focus-within:ring-amber-500">
          <textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Write a comment..."
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
            className="flex-1 resize-none text-sm bg-transparent focus:outline-none max-h-32" />
          <button onClick={send} disabled={!text.trim() || sending} title="Send"
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
