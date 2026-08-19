'use client'

import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Camera, Image as ImageIcon } from 'lucide-react'
import { isPdfDataUrl, readUploadFile } from '@/lib/fileUpload'
import { useFileDrop } from '@/hooks/useFileDrop'

// A file input with capture="environment" alone forces the camera app directly on many
// tablet/Android browsers, skipping the gallery entirely — no way to pick an existing
// photo. This renders two hidden inputs (one with capture, one without) behind a small
// "Take Photo / Choose from Gallery" menu, so callers keep their own trigger button's
// look and just toggle `open` from that trigger's onClick.
export function PhotoSourceMenu({ open, onClose, onFiles, multiple = false }: {
  open: boolean
  onClose: () => void
  onFiles: (files: File[]) => void
  multiple?: boolean
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    onClose()
    if (files.length) onFiles(files)
  }

  return (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple={multiple} className="hidden" onChange={handleChange} />
      <input ref={galleryRef} type="file" accept="image/*" multiple={multiple} className="hidden" onChange={handleChange} />
      {open && typeof document !== 'undefined' && createPortal(
        // Rendered at document.body via portal, positioned fixed+centered on the
        // viewport rather than anchored under the trigger button — the trigger often
        // sits inside a scrollable, overflow-hidden modal (e.g. Custom Request), and
        // an anchored dropdown there gets clipped out of view on shorter/tablet screens.
        <div className="fixed inset-0 z-100 flex items-center justify-center px-4" onClick={onClose}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-white border rounded-lg shadow-xl overflow-hidden w-48" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => cameraRef.current?.click()}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-amber-50 flex items-center gap-2 transition-colors">
              <Camera className="h-4 w-4 text-muted-foreground" /> Take Photo
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-amber-50 flex items-center gap-2 border-t transition-colors">
              <ImageIcon className="h-4 w-4 text-muted-foreground" /> Choose from Gallery
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

export function FilePreview({ src, alt, className, onClick }: { src: string; alt: string; className?: string; onClick?: () => void }) {
  if (isPdfDataUrl(src)) {
    return (
      <div
        role={onClick ? 'button' : undefined}
        onClick={onClick}
        className={`flex flex-col items-center justify-center gap-1.5 bg-red-50 border-red-200 text-red-600 ${className ?? ''}`}
      >
        <FileText className="h-6 w-6" />
        <span className="text-xs font-medium">PDF Document</span>
      </div>
    )
  }
  return <img src={src} alt={alt} className={className} onClick={onClick} />
}

/** Multi-file picker (images + PDF) — used wherever a nota/receipt/transfer-proof can have more than one file. */
export function MultiFilePicker({ files, onChange }: { files: string[]; onChange: (files: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  function handleFiles(list: FileList | File[]) {
    Promise.all(Array.from(list).map(f => readUploadFile(f))).then(newOnes => onChange([...files, ...newOnes]))
  }
  function removeAt(i: number) { onChange(files.filter((_, idx) => idx !== i)) }
  const { isDragging, dropProps } = useFileDrop(handleFiles)
  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" className="hidden"
        onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = '' }} />
      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative group aspect-square rounded-lg border bg-muted/20 overflow-hidden">
              <FilePreview src={f} alt={`File ${i + 1}`} className="w-full h-full object-cover" />
              <button type="button" onClick={() => removeAt(i)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={() => inputRef.current?.click()} {...dropProps}
        className={`w-full border-2 border-dashed rounded-xl py-6 flex flex-col items-center gap-1.5 transition-colors ${
          isDragging ? 'border-amber-400 bg-amber-50 text-amber-700' : 'text-muted-foreground hover:border-amber-400 hover:text-amber-700'
        }`}>
        <Camera className="h-5 w-5 text-amber-500" />
        <span className="text-sm font-medium">{isDragging ? 'Drop to upload' : files.length > 0 ? 'Add more files' : 'Take a photo or upload photo/PDF'}</span>
      </button>
    </div>
  )
}
