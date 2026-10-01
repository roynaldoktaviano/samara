'use client'

import { useRef } from 'react'
import { ImageIcon, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { readUploadFile } from '@/lib/fileUpload'
import { FilePreview } from '@/components/ui/file-preview'
import { useFileDrop } from '@/hooks/useFileDrop'

export const MAX_PROOF_FILES = 5
const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']

/**
 * Transfer-proof picker that accepts several files (e.g. a DP the customer paid in two
 * separate transfers). The first file is stored as Payment.proofOfTransfer, the rest go
 * to Payment.proofOfTransferExtra.
 */
export function ProofFilesInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = (files: File[]) => {
    const valid = files.filter(f => ALLOWED.includes(f.type))
    if (valid.length < files.length) toast.error('Only JPG, PNG or PDF files are allowed')
    const room = MAX_PROOF_FILES - value.length
    if (valid.length > room) toast.error(`Maximum ${MAX_PROOF_FILES} files`)
    const take = valid.slice(0, Math.max(0, room))
    if (!take.length) return
    Promise.all(take.map(f => readUploadFile(f)))
      .then(urls => onChange([...value, ...urls]))
      .catch(() => toast.error('Failed to process file'))
  }

  const { isDragging, dropProps } = useFileDrop(addFiles)

  return (
    <>
      {value.length === 0 ? (
        <div
          {...dropProps}
          className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors min-h-36 overflow-hidden cursor-pointer ${
            isDragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
          }`}
          onClick={() => inputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <ImageIcon className="h-10 w-10 opacity-30" />
            <p className="text-sm">{isDragging ? 'Drop to upload' : 'Click or drag to select image or PDF'}</p>
            <p className="text-xs opacity-60">JPG, JPEG, PNG or PDF · Up to {MAX_PROOF_FILES} files · Auto-compressed</p>
          </div>
        </div>
      ) : (
        <div
          {...dropProps}
          className={`grid grid-cols-2 gap-2 rounded-xl p-1 ${isDragging ? 'ring-2 ring-primary bg-primary/5' : ''}`}
        >
          {value.map((src, i) => (
            <div key={i} className="relative border rounded-lg overflow-hidden bg-muted/20">
              <FilePreview src={src} alt={`Transfer proof ${i + 1}`} className="w-full h-36 object-contain" />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                aria-label="Remove file"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {value.length < MAX_PROOF_FILES && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed rounded-lg h-36 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:border-primary/50"
            >
              <Plus className="h-5 w-5" />
              {isDragging ? 'Drop to add' : 'Add file'}
            </button>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        className="hidden"
        onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
      />
    </>
  )
}
