export function isPdfDataUrl(src: string): boolean {
  return src.startsWith('data:application/pdf')
}

/**
 * Reads an uploaded file into a data URL for storage. Images are downscaled
 * and re-encoded as JPEG to keep payload size reasonable; PDFs are passed
 * through as-is since they can't be recompressed the same way.
 */
export function readUploadFile(file: File, maxPx = 1200, quality = 0.75): Promise<string> {
  if (file.type === 'application/pdf') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read PDF'))
      reader.readAsDataURL(file)
    })
  }
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxPx || height > maxPx) {
        const ratio = Math.min(maxPx / width, maxPx / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(objectUrl)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image'))
    }
    img.src = objectUrl
  })
}
