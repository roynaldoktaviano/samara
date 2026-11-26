'use client'

import { readUploadFile } from '@/lib/fileUpload'
import { PRIVATE_FILE_MAX_SIZE, PRIVATE_FILE_TYPES, type PrivateFileScope } from '@/lib/private-files'

/**
 * Uploads one HR file to private R2 storage and returns its `/api/files/private/…` reference.
 * Photos are downscaled + re-encoded as JPEG first (same as before, so scans stay readable but
 * small); PDFs go up untouched.
 */
export async function uploadPrivateFile(file: File, scope: PrivateFileScope): Promise<string> {
  if (!PRIVATE_FILE_TYPES.includes(file.type)) throw new Error('Only photos or PDF files are allowed')
  let body: Blob = file
  let name = file.name || 'file'
  if (file.type.startsWith('image/') && file.type !== 'image/gif') {
    try {
      const dataUrl = await readUploadFile(file, 2000, 0.85)
      body = await (await fetch(dataUrl)).blob()
      name = name.replace(/\.[a-z0-9]{1,5}$/i, '') + '.jpg'
    } catch {
      // Browser can't decode it (e.g. HEIC on Chrome) — upload the original.
    }
  }
  if (body.size > PRIVATE_FILE_MAX_SIZE) throw new Error('File must be under 15MB')

  const form = new FormData()
  form.append('file', body, name)
  form.append('scope', scope)
  const res = await fetch('/api/files/private-upload', { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ref) throw new Error(data.error ?? 'Upload failed')
  return data.ref as string
}
