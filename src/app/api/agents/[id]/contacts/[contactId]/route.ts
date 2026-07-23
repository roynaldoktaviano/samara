import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { roleMatches } from '@/lib/role-utils'

async function requireManage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!roleMatches(role, ['ADMIN', 'SUPER_ADMIN', 'SALES'])) return null
  return session
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const db = await getDb()
  try {
    const session = await requireManage()
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { contactId } = await params
    const { name, email, whatsapp, jobTitle, dateOfBirth } = await request.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const contact = await db.agentContact.update({
      where: { id: contactId },
      data: {
        name:        name.trim(),
        email:       email?.trim()    || null,
        whatsapp:    whatsapp?.trim() || null,
        jobTitle:    jobTitle?.trim() || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      },
    })
    return NextResponse.json(contact)
  } catch (error) {
    console.error('Error updating agent contact:', error)
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 })
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const db = await getDb()
  try {
    const session = await requireManage()
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { contactId } = await params
    await db.agentContact.delete({ where: { id: contactId } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting agent contact:', error)
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 })
  }
}
