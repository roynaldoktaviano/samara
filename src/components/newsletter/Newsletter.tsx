'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDate } from '@/lib/format'
import { Separator } from '@/components/ui/separator'
import { Mail, Send, Loader2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

interface SendRecord {
  id: string
  subject: string
  fromEmail: string
  fromName: string | null
  recipients: string[]
  status: string
  errorMessage: string | null
  sentByName: string | null
  createdAt: string
  openedCount: number
  clickedCount: number
}

const ACCENT = 'var(--primary)'

export default function Newsletter() {
  const [subject,     setSubject]     = useState('')
  const [bodyHtml,    setBodyHtml]    = useState('')
  const [fromEmail,   setFromEmail]   = useState('')
  const [fromName,    setFromName]    = useState('')
  const [previewText, setPreviewText] = useState('')
  const [recipients,  setRecipients]  = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [sending,    setSending]    = useState(false)

  const [history, setHistory] = useState<SendRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/newsletter')
      if (res.ok) setHistory(await res.json())
    } catch { /* non-critical */ } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  const recipientList = recipients
    .split(/[\n,]/)
    .map(r => r.trim())
    .filter(Boolean)

  const send = async () => {
    if (!subject || !bodyHtml || !fromEmail || recipientList.length === 0) {
      toast.error('Fill in the subject, email body, from address and at least 1 recipient')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, bodyHtml, fromEmail, fromName, previewText, recipients: recipientList }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to send email')
        return
      }
      if (data.failed > 0) {
        toast.warning(`Sent to ${data.sent} of ${data.sent + data.failed} recipients. Failed: ${data.failures.join('; ')}`)
      } else {
        toast.success(`Sent to ${data.sent} recipients`)
      }
      fetchHistory()
    } catch {
      toast.error('Failed to reach the server')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5" style={{ color: ACCENT }} />
        <h1 className="text-xl font-semibold">Newsletter</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compose</CardTitle>
          <CardDescription>Send email directly — not yet linked to a contact list, so enter recipients manually for now.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>From <span className="text-destructive">*</span></Label>
              <Input
                placeholder="newsletter@samarayachting.com"
                value={fromEmail}
                onChange={e => setFromEmail(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Must use a domain verified in Resend.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Sender Name</Label>
              <Input
                placeholder="Samara Yachting"
                value={fromName}
                onChange={e => setFromName(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Shown as the name before the email address in the recipient’s inbox.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Subject <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Email subject…"
                value={subject}
                onChange={e => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Preview Text</Label>
              <Input
                placeholder="Short summary shown after the subject…"
                value={previewText}
                onChange={e => setPreviewText(e.target.value)}
                maxLength={150}
              />
              <p className="text-[11px] text-muted-foreground">If empty, the inbox will pull it from the email body automatically.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Recipients <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder={'one email per line, or separate with commas\nexample:\nbudi@mail.com\nsiti@mail.com'}
              rows={3}
              value={recipients}
              onChange={e => setRecipients(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">{recipientList.length} recipients detected</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Email Body (HTML) <span className="text-destructive">*</span></Label>
              <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setShowPreview(v => !v)}>
                {showPreview ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                {showPreview ? 'Hide preview' : 'View preview'}
              </Button>
            </div>
            <Textarea
              placeholder="<p>Write the email body here, HTML tags allowed…</p>"
              rows={12}
              value={bodyHtml}
              onChange={e => setBodyHtml(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          {showPreview && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Preview</Label>
              <div className="border rounded-lg overflow-hidden bg-white">
                <iframe
                  title="Email preview"
                  srcDoc={bodyHtml || '<p style="color:#9ca3af;font-family:sans-serif;padding:12px">No content yet…</p>'}
                  className="w-full"
                  style={{ height: 400, border: 'none' }}
                  sandbox=""
                />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={send} disabled={sending} style={{ backgroundColor: ACCENT, color: 'var(--primary-foreground)' }} className="hover:opacity-90">
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {sending ? 'Sending…' : `Send to ${recipientList.length} recipient${recipientList.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send History</CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No emails sent yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map(h => (
                <div key={h.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{h.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {h.recipients.length} recipients · {h.openedCount}/{h.recipients.length} opened · {h.clickedCount}/{h.recipients.length} clicked a link · from {h.fromName ? `${h.fromName} <${h.fromEmail}>` : h.fromEmail} · by {h.sentByName ?? 'Unknown'} · {formatDate(h.createdAt, 'datetime')}
                      </p>
                      {h.errorMessage && (
                        <p className="text-xs text-destructive mt-1">{h.errorMessage}</p>
                      )}
                    </div>
                    <StatusBadge
                      tone={
                        h.status === 'sent' ? 'success' :
                        h.status === 'partial' ? 'warning' :
                        'destructive'
                      }
                    >
                      {h.status}
                    </StatusBadge>
                  </div>
                  <Separator className="mt-3" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
