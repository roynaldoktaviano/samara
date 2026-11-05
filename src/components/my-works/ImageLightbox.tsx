'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import type { Attachment } from './shared'

// Full-screen viewer for My Works image attachments (comment images + task files), so a
// click previews in place instead of opening the raw R2 URL in a new tab. Same approach as
// purchasing/PhotoLightbox: portalled to <body> with pointer events re-enabled so it works
// from inside the task's Radix <Dialog>, and Escape is captured so it closes only the
// lightbox, not the dialog underneath. ←/→ step through the other images of the same group.
export function ImageLightbox({ images, index, onIndexChange, onClose }: {
  images: Attachment[]; index: number; onIndexChange: (i: number) => void; onClose: () => void
}) {
  const count = images.length
  const img = images[index]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && count > 1) onIndexChange((index - 1 + count) % count)
      else if (e.key === 'ArrowRight' && count > 1) onIndexChange((index + 1) % count)
      else return
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [index, count, onIndexChange, onClose])

  // Only ever rendered after a click, so document.body always exists here.
  if (!img) return null
  const navBtn = 'absolute top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70'
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="pointer-events-auto fixed inset-0 z-[60] bg-black/80 flex flex-col items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div className="absolute top-3 right-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
        <a href={img.url} target="_blank" rel="noopener noreferrer" download={img.name} title="Open original"
          aria-label={`Open original ${img.name}`} className="bg-black/50 text-white rounded-full p-2 hover:bg-black/70">
          <Download className="h-4 w-4" />
        </a>
        <button type="button" onClick={onClose} aria-label="Close preview" className="bg-black/50 text-white rounded-full p-2 hover:bg-black/70">
          <X className="h-4 w-4" />
        </button>
      </div>

      <img src={img.url} alt={img.name} onClick={e => e.stopPropagation()}
        className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl bg-white" />
      <p className="mt-3 text-white/80 text-xs truncate max-w-full" onClick={e => e.stopPropagation()}>
        {img.name}{count > 1 && <span className="text-white/50"> · {index + 1} / {count}</span>}
      </p>

      {count > 1 && (
        <>
          <button type="button" aria-label="Previous image" className={`${navBtn} left-3`}
            onClick={e => { e.stopPropagation(); onIndexChange((index - 1 + count) % count) }}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Next image" className={`${navBtn} right-3`}
            onClick={e => { e.stopPropagation(); onIndexChange((index + 1) % count) }}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
