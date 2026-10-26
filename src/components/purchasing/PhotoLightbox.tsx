'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { isPdfDataUrl } from '@/lib/fileUpload'

// Shared full-screen photo/PDF viewer used wherever a Timeline step (or any other purchasing
// UI) links to a proof photo — dispatch/receipt photos, payment notas, transfer proofs.
// Portalled to <body> with pointer events re-enabled, so it also works when opened from
// inside a Radix <Dialog> (which disables pointer events on everything outside itself).
// Escape closes the lightbox first without also closing the dialog underneath.
export function PhotoLightbox({ photoKey, onClose, zIndexClass = 'z-60' }: { photoKey: string; onClose: () => void; zIndexClass?: string }) {
  const isPdf = isPdfDataUrl(photoKey)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  if (!mounted) return null
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isPdf ? 'PDF preview' : 'Photo preview'}
      className={`pointer-events-auto fixed inset-0 bg-black/70 ${zIndexClass} flex items-center justify-center p-4`}
      onClick={onClose}
    >
      <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        {isPdf ? (
          <div className="bg-card rounded-xl shadow-2xl overflow-hidden">
            <embed src={photoKey} type="application/pdf" className="w-full h-[75vh]" />
            <div className="p-3 flex justify-center">
              <a href={photoKey} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-strong font-medium underline underline-offset-2">
                Open PDF in new tab
              </a>
            </div>
          </div>
        ) : (
          <img src={photoKey} alt="Proof" className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]" />
        )}
        <button type="button" onClick={onClose} aria-label="Close preview" className="absolute top-3 right-3 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70">
          <X className="h-4 w-4" />
        </button>
        <p className="text-center text-white/60 text-xs mt-3">Click outside or press Esc to close</p>
      </div>
    </div>,
    document.body,
  )
}
