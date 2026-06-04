'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Upload, Trash2, Loader2, CheckCircle, ExternalLink } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const ACCENT = '#bdac7e'

interface TncInfo {
  uploaded: boolean
  fileName?: string
  updatedAt?: string
  updatedBy?: string
}

export default function TncPdfSettings() {
  const [info,        setInfo]        = useState<TncInfo | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [uploading,   setUploading]   = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [toast,       setToast]       = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchInfo = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings/tnc-pdf')
      if (res.ok) setInfo(await res.json())
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchInfo() }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf') { showToast('error', 'File harus berformat PDF'); return }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/settings/tnc-pdf', { method: 'POST', body: fd })
      if (res.ok) {
        showToast('success', 'PDF berhasil diupload')
        await fetchInfo()
      } else {
        const d = await res.json()
        showToast('error', d.error ?? 'Upload gagal')
      }
    } finally { setUploading(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/settings/tnc-pdf', { method: 'DELETE' })
      if (res.ok) { showToast('success', 'PDF dihapus'); await fetchInfo() }
    } finally { setDeleting(false); setConfirmDel(false) }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" style={{ color: ACCENT }} />
            Terms &amp; Conditions PDF
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            PDF ini otomatis dilampirkan di setiap invoice yang dicetak. Upload PDF baru untuk mengganti T&amp;C.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Memuat…
            </div>
          ) : info?.uploaded ? (
            <div className="space-y-3">
              {/* Current file info */}
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${ACCENT}20` }}>
                  <FileText className="h-4 w-4" style={{ color: ACCENT }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{info.fileName}</p>
                  {info.updatedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Diupload {new Date(info.updatedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {info.updatedBy && ` oleh ${info.updatedBy}`}
                    </p>
                  )}
                </div>
                <a
                  href="/api/public/tnc-pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Preview PDF"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input type="file" accept="application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
                  <span className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent transition-colors ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Ganti PDF
                  </span>
                </label>
                <Button
                  variant="ghost" size="sm"
                  className="h-8 px-3 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setConfirmDel(true)}
                  disabled={deleting}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Hapus
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed rounded-lg gap-3">
              <FileText className="h-8 w-8 text-muted-foreground/40" />
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Belum ada T&amp;C PDF</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Invoice akan menggunakan T&amp;C bawaan yang sudah ada</p>
              </div>
              <label className="cursor-pointer">
                <input type="file" accept="application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
                <span className={`inline-flex items-center gap-1.5 h-8 px-4 text-xs font-medium rounded-md text-white transition-colors ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:opacity-90'}`}
                  style={{ backgroundColor: ACCENT }}>
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Upload PDF
                </span>
              </label>
            </div>
          )}

          {/* Toast */}
          {toast && (
            <div className={`mt-3 flex items-center gap-2 text-xs rounded-md px-3 py-2 ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {toast.type === 'success' && <CheckCircle className="h-3.5 w-3.5 shrink-0" />}
              {toast.msg}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm delete */}
      <AlertDialog open={confirmDel} onOpenChange={v => !v && setConfirmDel(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus T&amp;C PDF?</AlertDialogTitle>
            <AlertDialogDescription>
              Invoice akan kembali menggunakan T&amp;C bawaan yang hardcoded. Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
