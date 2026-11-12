import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { PrismaClient } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { canAccessLead } from '@/lib/lead-access'
import { contactDetail, isMissingTable } from '@/lib/freshsales-archive-view'

// Freshsales history (deals, emails, WhatsApp chat log, stage/owner changes) of one ERP Lead or
// Guest — shown on the Lead / Sales Pipeline / Guest detail. Access follows the ERP record, not
// the Freshsales Archive menu: a SALES rep sees it for the leads they own.
//   GET ?lead=<leadId>  |  ?customer=<customerId>
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = (await getDb(session)) as unknown as PrismaClient
  const role = (session.user as { role?: string }).role
  const leadId = req.nextUrl.searchParams.get('lead')
  const customerId = req.nextUrl.searchParams.get('customer')

  let fsId: string | null = null
  if (leadId) {
    if (!(await canAccessLead(db, role, session.user.id, leadId))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    fsId = (await db.lead.findUnique({ where: { id: leadId }, select: { freshsalesContactId: true } }))?.freshsalesContactId ?? null
  } else if (customerId) {
    fsId = (await db.customer.findUnique({ where: { id: customerId }, select: { freshsalesContactId: true } }))?.freshsalesContactId ?? null
  } else return NextResponse.json({ error: 'lead or customer required' }, { status: 400 })

  if (!fsId) return NextResponse.json({ linked: false })
  try {
    const contact = await db.freshsalesContact.findUnique({ where: { id: fsId } })
    if (!contact) return NextResponse.json({ linked: false })
    return NextResponse.json({ linked: true, ...(await contactDetail(db, contact)) })
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ linked: false })
    throw e
  }
}
