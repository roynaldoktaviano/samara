'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { uploadToR2 } from '@/lib/r2-client'
import { useFileDrop } from '@/hooks/useFileDrop'
import { EMPTY_EMAIL_SIGNATURE, renderEmailSignatureHtml, type EmailSignature } from '@/lib/email-signature'

const PHOTO_PX = 192 // shown at 96px, 2x for retina

/** Center-crops to a square and scales down, so the photo is never stretched in mail clients that ignore object-fit. */
async function squarePhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = PHOTO_PX
  canvas.height = PHOTO_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PHOTO_PX, PHOTO_PX)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_PX, PHOTO_PX)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new Error('Could not process photo')
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' })
}

export default function EmailSignatureDialog({ open, onOpenChange, userId }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
}) {
  const [sig, setSig] = useState<EmailSignature>(EMPTY_EMAIL_SIGNATURE)
  const [ctx, setCtx] = useState<{ email: string; company: string | null }>({ email: '', company: null })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/profile/email-signature')
      .then(r => r.json())
      .then(data => {
        setCtx({ email: data.defaults?.email ?? '', company: data.defaults?.company ?? null })
        setSig(data.signature ?? { ...EMPTY_EMAIL_SIGNATURE, name: data.defaults?.name ?? '' })
      })
      .catch(() => toast.error('Failed to load signature'))
      .finally(() => setLoading(false))
  }, [open])

  const set = <K extends keyof EmailSignature>(key: K, value: EmailSignature[K]) => setSig(s => ({ ...s, [key]: value }))

  async function handlePhoto(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image'); return }
    setUploading(true)
    try {
      const photo = await squarePhoto(file)
      const { url } = await uploadToR2('/api/profile/email-signature/photo', `email-signatures/${userId}/${Date.now()}.jpg`, photo)
      set('photoUrl', url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }
  const { isDragging, dropProps } = useFileDrop(files => handlePhoto(files[0]), uploading)

  async function handleSave() {
    if (sig.enabled && !sig.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/profile/email-signature', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: sig }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to save signature'); return }
      toast.success('Email signature saved')
      onOpenChange(false)
    } catch {
      toast.error('Failed to save signature')
    } finally {
      setSaving(false)
    }
  }

  const previewHtml = renderEmailSignatureHtml({ ...sig, enabled: true }, ctx)
  const busy = loading || saving

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email Signature</DialogTitle>
          <DialogDescription>Added below every email you send from Chat › Email. The layout is the same for everyone — only your details change.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label htmlFor="sig-enabled" className="cursor-pointer">Add signature to my emails</Label>
                <Switch id="sig-enabled" checked={sig.enabled} onCheckedChange={v => set('enabled', v)} disabled={busy} />
              </div>

              <div className="flex items-center gap-3">
                <div
                  {...dropProps}
                  onClick={() => !uploading && fileRef.current?.click()}
                  className={`relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-dashed ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'} flex items-center justify-center`}
                >
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    : sig.photoUrl ? <img src={sig.photoUrl} alt="" className="h-full w-full object-cover" />
                    : <Camera className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>Click or drop a photo. It is cropped to a square automatically.</p>
                  {sig.photoUrl && (
                    <button type="button" onClick={() => set('photoUrl', '')} className="mt-1 inline-flex items-center gap-1 text-red-600 hover:underline">
                      <Trash2 className="h-3 w-3" /> Remove photo
                    </button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/heic" className="hidden"
                  onChange={e => { handlePhoto(e.target.files?.[0]); e.target.value = '' }} />
              </div>

              <Field label="Name *" value={sig.name} onChange={v => set('name', v)} disabled={busy} placeholder="Efrinda Priyanka" />
              <Field label="Job Title" value={sig.title} onChange={v => set('title', v)} disabled={busy} placeholder="Yacht Charter Consultant" />
              <Field label="Location" value={sig.location} onChange={v => set('location', v)} disabled={busy} placeholder="Indonesia" />
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input value={ctx.email} disabled />
                <p className="text-[11px] text-muted-foreground">Always your login email, so it matches the sender address.</p>
              </div>
              <div className="grid grid-cols-[1fr_8rem] gap-2">
                <Field label="Direct Phone" value={sig.phone} onChange={v => set('phone', v)} disabled={busy} placeholder="+62 812 1994 3006" />
                <Field label="Phone Label" value={sig.phoneLabel} onChange={v => set('phoneLabel', v)} disabled={busy} placeholder="Indonesia" />
              </div>
              <Field label="Website" value={sig.website} onChange={v => set('website', v)} disabled={busy} placeholder="samaraLiveaboard.com" />
              <Field label="Video Consultation Booking Link" value={sig.bookingUrl} onChange={v => set('bookingUrl', v)} disabled={busy} placeholder="https://calendly.com/…  (leave empty to hide)" />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
              <div className="rounded-md border bg-white p-4 text-black">
                <p style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 14 }}>Hi Sarah,<br />Thank you for your inquiry…</p>
                {previewHtml
                  ? <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  : <p className="mt-6 text-xs text-gray-400">Fill in your name to see the signature.</p>}
              </div>
              {!sig.enabled && <p className="text-xs text-amber-600">Signature is turned off — it won’t be added to your emails.</p>}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy || uploading}>{saving ? 'Saving...' : 'Save Signature'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, value, onChange, disabled, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} />
    </div>
  )
}
