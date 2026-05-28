import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

async function requireManage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!['ADMIN', 'SUPER_ADMIN', 'SALES'].includes(role)) return null
  return session
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const contacts = await db.agentContact.findMany({
      where: { agentId: id },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(contacts)
  } catch (error) {
    console.error('Error fetching agent contacts:', error)
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireManage()
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const { name, email, whatsapp } = await request.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const contact = await db.agentContact.create({
      data: {
        agentId:  id,
        name:     name.trim(),
        email:    email?.trim()    || null,
        whatsapp: whatsapp?.trim() || null,
      },
    })
    return NextResponse.json(contact, { status: 201 })
  } catch (error) {
    console.error('Error creating agent contact:', error)
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 })
  }
}
