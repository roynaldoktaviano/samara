'use client'

// Client-side counterpart to src/lib/r2.ts's presignUpload — mirrors the old
// @vercel/blob/client `upload()` call shape closely enough to be a near drop-in:
// ask the given route for a presigned PUT URL, then PUT the file straight to R2
// (never through our own serverless function, so there's no body-size cap on it).
export async function uploadToR2(handleUploadUrl: string, pathname: string, file: File): Promise<{ url: string }> {
  const res = await fetch(handleUploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pathname, contentType: file.type, size: file.size }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Failed to get upload URL')

  const putRes = await fetch(data.url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!putRes.ok) throw new Error('Upload to storage failed')

  return { url: data.publicUrl }
}

/**
 * Same as uploadToR2, but reports real upload progress — needs XMLHttpRequest
 * (fetch has no upload-progress event) for the PUT step specifically.
 */
export function uploadToR2WithProgress(
  handleUploadUrl: string, pathname: string, file: File, onProgress: (percent: number) => void,
): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    fetch(handleUploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pathname, contentType: file.type, size: file.size }),
    })
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { reject(new Error(data.error ?? 'Failed to get upload URL')); return }

        const xhr = new XMLHttpRequest()
        xhr.open('PUT', data.url)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve({ url: data.publicUrl })
          else reject(new Error('Upload to storage failed'))
        }
        xhr.onerror = () => reject(new Error('Upload to storage failed'))
        xhr.send(file)
      })
      .catch(e => reject(e instanceof Error ? e : new Error('Failed to get upload URL')))
  })
}
