import { NextRequest, NextResponse } from 'next/server'
import { recordBotCall, requireBotAccess } from '@/lib/bot-api-key'
import { getDb } from '@/lib/get-db'

// Create-only Talent Pool intake for BOT accounts (e.g. a recruiting bot screening applicants).
// This is the ONE write a BOT may make (whitelisted in src/middleware.ts BOT_WRITE_PATHS):
// POST only — there is no GET/PUT/PATCH/DELETE here, so a bot can add candidates but never
// read the pool back, edit or delete. Status is always TALENT_POOL; HR takes it from there.
// Files (CV + named documents) come inline as base64 and are stored as data URLs, exactly like
// the Talent Pool UI stores them. Only PDF/JPEG/PNG/WEBP, verified by magic bytes, size-capped.

const str = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
const strList = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, 100)).slice(0, 50) : []

const FILE_TYPES: Record<string, (b: Buffer) => boolean> = {
  'application/pdf': b => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
}
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_BYTES = 15 * 1024 * 1024
const MAX_FILES = 10

class FileError extends Error {}

/**
 * Accepts `{ contentType, base64 }` or a `data:<type>;base64,…` string and returns a data URL.
 * The real bytes must match the declared type, so e.g. HTML/JS renamed to .pdf is refused.
 */
function toDataUrl(v: unknown, label: string, budget: { bytes: number }): string {
  let contentType: string | undefined, b64: string | undefined
  if (typeof v === 'string') {
    const m = v.match(/^data:([^;,]+);base64,([\s\S]*)$/)
    if (!m) throw new FileError(`${label}: expected a data URL or { contentType, base64 }`)
    ;[, contentType, b64] = m
  } else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.contentType === 'string') contentType = o.contentType
    if (typeof o.base64 === 'string') b64 = o.base64
  }
  contentType = contentType?.toLowerCase().trim()
  if (contentType === 'image/jpg') contentType = 'image/jpeg'
  if (!contentType || !FILE_TYPES[contentType]) {
    throw new FileError(`${label}: contentType must be one of ${Object.keys(FILE_TYPES).join(', ')}`)
  }
  if (!b64) throw new FileError(`${label}: base64 is required`)
  const clean = b64.replace(/\s/g, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) throw new FileError(`${label}: invalid base64`)
  const buf = Buffer.from(clean, 'base64')
  if (buf.length === 0) throw new FileError(`${label}: file is empty`)
  if (buf.length > MAX_FILE_BYTES) throw new FileError(`${label}: file exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB`)
  budget.bytes += buf.length
  if (budget.bytes > MAX_TOTAL_BYTES) throw new FileError(`Total files exceed ${MAX_TOTAL_BYTES / 1024 / 1024} MB`)
  if (!FILE_TYPES[contentType](buf)) throw new FileError(`${label}: file content is not a valid ${contentType}`)
  return `data:${contentType};base64,${buf.toString('base64')}`
}

export async function POST(req: NextRequest) {
  const auth = await requireBotAccess()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 })
  }

  const fullName = str(body.fullName, 200)
  if (!fullName) return NextResponse.json({ error: 'fullName is required' }, { status: 400 })

  const email = str(body.email, 200)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  let expectedSalary: number | null = null
  if (body.expectedSalary !== undefined && body.expectedSalary !== null && body.expectedSalary !== '') {
    expectedSalary = Number(body.expectedSalary)
    if (!Number.isFinite(expectedSalary) || expectedSalary < 0) {
      return NextResponse.json({ error: 'expectedSalary must be a positive number' }, { status: 400 })
    }
  }

  let readyJoinDate: Date | null = null
  if (body.readyJoinDate) {
    readyJoinDate = new Date(String(body.readyJoinDate))
    if (isNaN(readyJoinDate.getTime())) return NextResponse.json({ error: 'Invalid readyJoinDate' }, { status: 400 })
  }

  // CV files → resumeFiles; named documents → additionalDocuments (same shape the UI writes).
  const cvIn = body.cv === undefined || body.cv === null ? [] : Array.isArray(body.cv) ? body.cv : [body.cv]
  const docsIn = body.documents === undefined || body.documents === null ? [] : body.documents
  if (!Array.isArray(docsIn)) return NextResponse.json({ error: 'documents must be an array' }, { status: 400 })
  if (cvIn.length + docsIn.length > MAX_FILES) {
    return NextResponse.json({ error: `Max ${MAX_FILES} files per candidate (cv + documents)` }, { status: 400 })
  }
  let resumeFiles: string[]
  let additionalDocuments: { id: string; name: string; description: string; fileKey: string }[]
  try {
    const budget = { bytes: 0 }
    resumeFiles = cvIn.map((f, i) => toDataUrl(f, `cv[${i}]`, budget))
    additionalDocuments = docsIn.map((d: unknown, i: number) => {
      const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>
      const name = str(o.name, 200)
      if (!name) throw new FileError(`documents[${i}]: name is required`)
      return {
        id: crypto.randomUUID(),
        name,
        description: str(o.description, 1000) ?? '',
        fileKey: toDataUrl(o.file, `documents[${i}].file`, budget),
      }
    })
  } catch (e) {
    if (e instanceof FileError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }

  const db = await getDb(auth.session)

  // Applied role: by id, or by job title (case-insensitive) since bots can't list EmployeeRole.
  let appliedRoleId: string | null = null
  const roleId = str(body.appliedRoleId, 100)
  const roleTitle = str(body.appliedRole, 200)
  if (roleId || roleTitle) {
    const role = await db.employeeRole.findFirst({
      where: roleId ? { id: roleId } : { title: { equals: roleTitle!, mode: 'insensitive' } },
      select: { id: true },
    })
    if (!role) return NextResponse.json({ error: `Unknown applied role: ${roleId ?? roleTitle}` }, { status: 400 })
    appliedRoleId = role.id
  }

  const source = str(body.source, 100)
  const candidate = await db.candidate.create({
    data: {
      id: crypto.randomUUID(),
      fullName,
      appliedRoleId,
      phone: str(body.phone, 50),
      email,
      source: source ?? `Bot (${auth.session.user.name || auth.session.user.email})`,
      expectedSalary,
      location: str(body.location, 200),
      readyJoinDate,
      resumeFiles,
      additionalDocuments,
      notes: str(body.notes, 5000),
      skills: strList(body.skills),
      languages: strList(body.languages),
      updatedAt: new Date(),
    },
    select: { id: true, fullName: true, status: true, createdAt: true },
  })

  await recordBotCall(auth, req.nextUrl, 'talent-pool', 1, 'POST')
  return NextResponse.json({ ...candidate, cvCount: resumeFiles.length, documentCount: additionalDocuments.length }, { status: 201 })
}
