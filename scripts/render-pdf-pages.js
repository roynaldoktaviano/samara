#!/usr/bin/env node
// Standalone script — runs outside Next.js/Turbopack, so pdfjs resolves correctly
// Usage: node scripts/render-pdf-pages.js <base64-pdf-data>
// Output: JSON { images: string[] }

const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
const { createCanvas } = require('canvas')
const path = require('path')

pdfjs.GlobalWorkerOptions.workerSrc = path.resolve(
  __dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.js'
)

async function main() {
  const b64 = process.argv[2]
  if (!b64) { console.error('No PDF data'); process.exit(1) }

  const data = new Uint8Array(Buffer.from(b64, 'base64'))
  const pdf  = await pdfjs.getDocument({ data }).promise
  const images = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page     = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas   = createCanvas(viewport.width, viewport.height)
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    images.push(canvas.toDataURL('image/jpeg', 0.92))
  }

  process.stdout.write(JSON.stringify({ images }))
}

main().catch(err => { console.error(err.message); process.exit(1) })
