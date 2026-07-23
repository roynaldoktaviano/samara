import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'

import { roleMatches } from '@/lib/role-utils'

const ALLOWED = ['ADMIN', 'SUPER_ADMIN', 'SALES']

// Promotes a reviewed AgentLead into a real Agent. If an Agent with the same name
// already exists (case-insensitive), reuses it instead of creating a duplicate —
// new AgentContact rows are only added for lead contacts not already present
// (matched by email), keeping the real Agent table free of duplicates.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const lead = await db.agentLead.findUnique({ where: { id }, include: { contacts: true } })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (lead.status !== 'NEW') return NextResponse.json({ error: 'This lead has already been promoted or discarded' }, { status: 409 })
  if (lead.contacts.length === 0) return NextResponse.json({ error: 'Lead has no contacts to promote' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const agentName = (body?.name || lead.name).trim()
  const primary = lead.contacts[0]

  const existingAgent = await db.agent.findFirst({ where: { name: { equals: agentName, mode: 'insensitive' } } })

  const agent = existingAgent ?? await db.agent.create({
    data: {
      name: agentName,
      email: body?.email ?? primary.email ?? null,
      whatsapp: body?.whatsapp ?? primary.whatsapp ?? null,
      source: 'Freshsales',
    },
  })

  const existingContacts = existingAgent
    ? await db.agentContact.findMany({ where: { agentId: agent.id }, select: { email: true } })
    : []
  const existingEmails = new Set(existingContacts.map(c => c.email?.toLowerCase()).filter(Boolean))

  const actingUser = await db.user.findUnique({ where: { id: session.user.id }, select: { name: true } })

  let contactsCreated = 0
  for (const c of lead.contacts) {
    if (c.email && existingEmails.has(c.email.toLowerCase())) continue
    await db.agentContact.create({
      data: {
        agentId: agent.id,
        name: c.name,
        email: c.email,
        whatsapp: c.whatsapp,
        jobTitle: c.jobTitle,
        addedById: session.user.id,
        addedByName: actingUser?.name ?? null,
      },
    })
    contactsCreated++
  }

  const updatedLead = await db.agentLead.update({
    where: { id },
    data: { status: 'PROMOTED', promotedAgentId: agent.id, promotedAt: new Date(), promotedById: session.user.id },
  })

  return NextResponse.json({ agent, lead: updatedLead, contactsCreated, reusedExistingAgent: !!existingAgent })
}
