'use client'

import { FileText } from 'lucide-react'
import { isPdfDataUrl } from '@/lib/fileUpload'

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
