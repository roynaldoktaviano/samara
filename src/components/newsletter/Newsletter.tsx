'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
}

const ACCENT = '#bdac7e'

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
      toast.error('Isi subject, isi email, from address, dan minimal 1 penerima')
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
        toast.error(data?.error ?? 'Gagal mengirim email')
        return
      }
      if (data.failed > 0) {
        toast.warning(`Terkirim ke ${data.sent} dari ${data.sent + data.failed} penerima. Gagal: ${data.failures.join('; ')}`)
      } else {
        toast.success(`Berhasil terkirim ke ${data.sent} penerima`)
      }
      fetchHistory()
    } catch {
      toast.error('Gagal menghubungi server')
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
          <CardDescription>Kirim email langsung — belum terhubung ke daftar kontak, penerima diisi manual dulu.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>From <span className="text-red-500">*</span></Label>
              <Input
                placeholder="newsletter@samarayachting.com"
                value={fromEmail}
                onChange={e => setFromEmail(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Harus pakai domain yang udah diverifikasi di Resend.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Nama Pengirim</Label>
              <Input
                placeholder="Samara Yachting"
                value={fromName}
                onChange={e => setFromName(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Tampil sebagai nama sebelum alamat email di inbox penerima.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Subject <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Judul email..."
                value={subject}
                onChange={e => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Preview Text</Label>
              <Input
                placeholder="Ringkasan singkat yang tampil setelah subject..."
                value={previewText}
                onChange={e => setPreviewText(e.target.value)}
                maxLength={150}
              />
              <p className="text-[11px] text-muted-foreground">Kalau kosong, inbox akan otomatis ambil dari isi email.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Penerima <span className="text-red-500">*</span></Label>
            <Textarea
              placeholder={'satu email per baris, atau pisahkan koma\ncontoh:\nbudi@mail.com\nsiti@mail.com'}
              rows={3}
              value={recipients}
              onChange={e => setRecipients(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">{recipientList.length} penerima terdeteksi</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Isi Email (HTML) <span className="text-red-500">*</span></Label>
              <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setShowPreview(v => !v)}>
                {showPreview ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                {showPreview ? 'Sembunyikan preview' : 'Lihat preview'}
              </Button>
            </div>
            <Textarea
              placeholder="<p>Tulis isi email di sini, boleh pakai tag HTML...</p>"
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
                  srcDoc={bodyHtml || '<p style="color:#9ca3af;font-family:sans-serif;padding:12px">Belum ada isi...</p>'}
                  className="w-full"
                  style={{ height: 400, border: 'none' }}
                  sandbox=""
                />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={send} disabled={sending} style={{ backgroundColor: ACCENT, color: 'white' }} className="hover:opacity-90">
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {sending ? 'Mengirim...' : `Kirim ke ${recipientList.length} penerima`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riwayat Pengiriman</CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <p className="text-sm text-muted-foreground">Memuat...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada email yang dikirim.</p>
          ) : (
            <div className="space-y-3">
              {history.map(h => (
                <div key={h.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{h.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {h.recipients.length} penerima · {h.openedCount}/{h.recipients.length} dibuka · dari {h.fromName ? `${h.fromName} <${h.fromEmail}>` : h.fromEmail} · oleh {h.sentByName ?? 'Unknown'} · {new Date(h.createdAt).toLocaleString('id-ID')}
                      </p>
                      {h.errorMessage && (
                        <p className="text-xs text-red-600 mt-1">{h.errorMessage}</p>
                      )}
                    </div>
                    <Badge
                      className={
                        h.status === 'sent' ? 'bg-green-100 text-green-700 border-green-200' :
                        h.status === 'partial' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                        'bg-red-100 text-red-700 border-red-200'
                      }
                    >
                      {h.status}
                    </Badge>
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
