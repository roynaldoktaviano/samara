'use client'

import { useEffect, useState } from 'react'

const isPdf = (v: string) => v.startsWith('data:application/pdf')

// Renders one guest attachment (passport photo, diving insurance, etc.) as its own
// print page(s), placed right after that guest's data page. Images print as-is; a PDF
// is decoded client-side (pdfjs-dist) into one <img> per page, same technique as the
// PdfFlipbook in agent-portal/page.tsx — a raw <embed>/<iframe> of a PDF does NOT get
// captured by the browser's native "Print" pipeline, only real <img> content does.
export function AttachmentPages({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const [images, setImages] = useState<string[] | null>(isPdf(value) ? null : [value])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!isPdf(value)) return
    let cancelled = false
    ;(async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
        }
        const pdf = await pdfjsLib.getDocument(value).promise
        const out: string[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 2 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('no 2d context')
          await page.render({ canvasContext: ctx, viewport }).promise
          out.push(canvas.toDataURL('image/jpeg', 0.9))
        }
        if (!cancelled) setImages(out)
      } catch (e) {
        console.error('[AttachmentPages] failed to render PDF', e)
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [value])

  const caption = (suffix?: string) =>
    `${sub ? `${sub} · ` : ''}${label}${suffix ?? ''}`

  if (failed) {
    return (
      <div className="samara-page" style={{ pageBreakBefore: 'always', breakBefore: 'page' }}>
        <div className="samara-page-body" style={{ padding: '16px 32px' }}>
          <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1px', color: '#999', marginBottom: 8 }}>{caption()}</p>
          <p style={{ fontSize: 11, color: '#c0392b' }}>Could not be rendered for printing — open the guest&apos;s file in Customers to view it.</p>
        </div>
      </div>
    )
  }

  if (!images) {
    return (
      <div className="samara-page" style={{ pageBreakBefore: 'always', breakBefore: 'page' }}>
        <div className="samara-page-body" style={{ padding: '16px 32px' }}>
          <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1px', color: '#999', marginBottom: 8 }}>{caption()}</p>
          <p style={{ fontSize: 11, color: '#999' }}>Preparing document for print…</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {images.map((src, i) => (
        <div key={i} className="samara-page" style={{ pageBreakBefore: 'always', breakBefore: 'page' }}>
          <div className="samara-page-body" style={{ padding: '16px 32px', display: 'flex', flexDirection: 'column' }}>
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '1px', color: '#999', marginBottom: 10 }}>
              {caption(images.length > 1 ? ` (${i + 1}/${images.length})` : '')}
            </p>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={src} alt={label} style={{ maxWidth: '100%', maxHeight: '24cm', objectFit: 'contain' }} />
            </div>
          </div>
        </div>
      ))}
    </>
  )
}
