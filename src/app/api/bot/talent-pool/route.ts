import { NextRequest, NextResponse } from 'next/server'
import { recordBotCall, requireBotAccess } from '@/lib/bot-api-key'
import { getDb } from '@/lib/get-db'

// Create-only Talent Pool intake for BOT accounts (e.g. a recruiting bot screening applicants).
// This is the ONE write a BOT may make (whitelisted in src/middleware.ts BOT_WRITE_PATHS):
// POST only — there is no GET/PUT/PATCH/DELETE here, so a bot can add candidates but never
// read the pool back, edit or delete. Status is always TALENT_POOL; HR takes it from there.
// File fields (CV / documents) are not accepted — bots have no upload access; HR attaches them.

const str = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
const strList = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, 100)).slice(0, 50) : []

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
      notes: str(body.notes, 5000),
      skills: strList(body.skills),
      languages: strList(body.languages),
      updatedAt: new Date(),
    },
    select: { id: true, fullName: true, status: true, createdAt: true },
  })

  await recordBotCall(auth, req.nextUrl, 'talent-pool', 1, 'POST')
  return NextResponse.json(candidate, { status: 201 })
}
