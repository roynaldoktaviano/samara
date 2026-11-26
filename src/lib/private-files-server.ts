import { randomUUID } from 'crypto'
import { putToR2 } from '@/lib/r2'
import { roleMatches } from '@/lib/role-utils'
import { nameWithExt, privateRefFromKey, type PrivateFileScope } from '@/lib/private-files'

const HR_ROLES = ['ADMIN', 'SUPER_ADMIN', 'HR']

/** Who may upload into a scope. */
export function canUploadPrivate(scope: PrivateFileScope, role: string | null | undefined): boolean {
  return roleMatches(role, HR_ROLES) && !!scope
}

/**
 * Who may open a file in a scope. Employee documents (KTP, KK, contracts…) are HR-only.
 * Candidate CVs are also shown to the manager who raised the recruitment request (My
 * Recruitment Requests), so any signed-in staff user — the key is an unguessable UUID.
 */
export function canViewPrivate(scope: string, role: string | null | undefined): boolean {
  if (scope === 'hr-employee') return roleMatches(role, HR_ROLES)
  if (scope === 'hr-candidate') return true
  return false
}

/** Stores bytes privately and returns the DB reference. */
export async function putPrivateFile(scope: PrivateFileScope, bytes: Buffer, mime: string, name: string): Promise<string> {
  const key = `private/${scope}/${randomUUID()}/${nameWithExt(name, mime)}`
  await putToR2(key, bytes, mime)
  return privateRefFromKey(key)
}

const DATA_URL = /^data:([^;,]+)(;base64)?,/

/** Uploads one base64 data URL to private storage; anything else is returned unchanged. */
export async function persistDataUrl(value: string, scope: PrivateFileScope, name = 'document'): Promise<string> {
  const m = typeof value === 'string' ? value.match(DATA_URL) : null
  if (!m) return value
  const mime = m[1] === 'image/jpg' ? 'image/jpeg' : m[1]
  const payload = value.slice(m[0].length)
  const bytes = m[2] ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload))
  return putPrivateFile(scope, bytes, mime, name)
}

/**
 * Moves every data URL in a file list to private R2 storage (other entries kept as they are).
 * Lets older clients / public forms keep sending data URLs while the DB only ever stores refs.
 */
export async function persistDataUrls(list: unknown, scope: PrivateFileScope, name = 'document'): Promise<string[]> {
  if (!Array.isArray(list)) return []
  const strings = list.filter((v): v is string => typeof v === 'string' && !!v)
  return Promise.all(strings.map(v => persistDataUrl(v, scope, name)))
}

export const EMPLOYEE_DOC_KEYS = [
  'seamanBookFiles', 'bstFiles', 'medicalCheckupFiles', 'ijazahFiles', 'certificateFiles', 'contractFiles',
  'ktpFiles', 'kkFiles', 'npwpFiles', 'photoFiles',
] as const

/** Returns `body` with every listed file-array field's data URLs moved to private storage. */
export async function persistDocFields<T extends Record<string, unknown>>(
  body: T, keys: readonly string[], scope: PrivateFileScope,
): Promise<T> {
  if (!body || typeof body !== 'object') return body
  const out: Record<string, unknown> = { ...body }
  await Promise.all(keys.map(async k => {
    if (Array.isArray(out[k])) out[k] = await persistDataUrls(out[k], scope, k.replace(/Files$/, ''))
  }))
  return out as T
}

/** Candidate additionalDocuments: [{ id, name, description, fileKey }] — moves each fileKey. */
export async function persistCandidateDocs(docs: unknown): Promise<unknown> {
  if (!Array.isArray(docs)) return docs
  return Promise.all(docs.map(async d => {
    if (!d || typeof d !== 'object') return d
    const doc = d as { name?: unknown; fileKey?: unknown }
    if (typeof doc.fileKey !== 'string') return d
    return { ...doc, fileKey: await persistDataUrl(doc.fileKey, 'hr-candidate', String(doc.name ?? 'document')) }
  }))
}
