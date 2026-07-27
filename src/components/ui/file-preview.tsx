'use client'

import { useRef } from 'react'
import { FileText, Camera } from 'lucide-react'
import { isPdfDataUrl, readUploadFile } from '@/lib/fileUpload'
import { useFileDrop } from '@/hooks/useFileDrop'

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
