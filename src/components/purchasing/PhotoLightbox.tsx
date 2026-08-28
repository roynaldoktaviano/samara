import { X } from 'lucide-react'
import { isPdfDataUrl } from '@/lib/fileUpload'

// Shared full-screen photo/PDF viewer used wherever a Timeline step (or any other purchasing
// UI) links to a proof photo — dispatch/receipt photos, payment notas, transfer proofs.
export function PhotoLightbox({ photoKey, onClose, zIndexClass = 'z-50' }: { photoKey: string; onClose: () => void; zIndexClass?: string }) {
  const isPdf = isPdfDataUrl(photoKey)
  return (
    <div className={`fixed inset-0 bg-black/70 ${zIndexClass} flex items-center justify-center p-4`} onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        {isPdf ? (
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
            <embed src={photoKey} type="application/pdf" className="w-full h-[75vh]" />
            <div className="p-3 flex justify-center">
              <a href={photoKey} target="_blank" rel="noopener noreferrer" className="text-sm text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2">
                Open PDF in new tab
              </a>
            </div>
          </div>
        ) : (
          <img src={photoKey} alt="Proof" className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]" />
        )}
        <button onClick={onClose} className="absolute top-3 right-3 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70">
          <X className="h-4 w-4" />
        </button>
        <p className="text-center text-white/60 text-xs mt-3">Click outside to close</p>
      </div>
    </div>
  )
}
