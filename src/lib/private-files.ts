// Private HR files (employee documents, candidate CVs) live in R2 under `private/<scope>/…`
// and are stored in the DB as a same-origin reference `/api/files/private/<scope>/…`. That route
// checks the session + role, then redirects to a 5-minute signed R2 URL — the files are never
// served by the public files.samarayachting.com host. Before this they were base64 data URLs in
// the DB, which made every Employee/Candidate save and list load carry megabytes of JSON.
//
// Client-safe: no server imports here.

export const PRIVATE_FILE_SCOPES = ['hr-employee', 'hr-candidate'] as const
export type PrivateFileScope = (typeof PRIVATE_FILE_SCOPES)[number]

export const PRIVATE_FILE_ROUTE = '/api/files/private/'
export const PRIVATE_FILE_MAX_SIZE = 15 * 1024 * 1024
export const PRIVATE_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf']

export function isPrivateFileRef(src: string | null | undefined): src is string {
  return typeof src === 'string' && src.startsWith(PRIVATE_FILE_ROUTE)
}

/** R2 key behind a private ref (`/api/files/private/hr-employee/<id>/a.pdf` → `private/hr-employee/<id>/a.pdf`). */
export function privateKeyFromRef(ref: string): string | null {
  if (!isPrivateFileRef(ref)) return null
  try {
    return 'private/' + ref.slice(PRIVATE_FILE_ROUTE.length).split('?')[0].split('/').map(decodeURIComponent).join('/')
  } catch {
    return null
  }
}

export function privateRefFromKey(key: string): string {
  return PRIVATE_FILE_ROUTE + key.replace(/^private\//, '').split('/').map(encodeURIComponent).join('/')
}

export function safeFileName(name: string, fallback = 'file'): string {
  const cleaned = (name || '').normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-100)
  return cleaned.replace(/^[_.]+/, '') || fallback
}

export function extForMime(mime: string): string {
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/heic') return 'heic'
  if (mime === 'image/heif') return 'heif'
  return 'jpg'
}

/** Makes sure the file name carries the right extension (the viewer relies on `.pdf`). */
export function nameWithExt(name: string, mime: string): string {
  const ext = extForMime(mime)
  const base = safeFileName(name).replace(/\.[a-z0-9]{1,5}$/i, '')
  return `${base || 'file'}.${ext}`
}
