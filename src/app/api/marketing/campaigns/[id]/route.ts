import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { renderBlocksToHtml, normalizeDesign } from '@/lib/email-builder'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const campaign = await db.emailCampaign.findUnique({
    where: { id },
    include: {
      recipients: {
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { clicks: { orderBy: { clickedAt: 'desc' } } },
      },
    },
  })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(campaign)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.emailCampaign.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'SENT' || existing.status === 'SENDING') {
    return NextResponse.json({ error: 'Cannot edit a campaign that has been sent' }, { status: 409 })
  }

  const { name, subject, previewText, fromEmail, fromName, templateId, blocksJson, audienceSources, status, scheduledAt } = await req.json()
  const design = blocksJson ? normalizeDesign(blocksJson) : null

  const campaign = await db.emailCampaign.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(subject !== undefined && { subject: subject.trim() }),
      ...(previewText !== undefined && { previewText: previewText?.trim() || null }),
      ...(fromEmail !== undefined && { fromEmail: fromEmail.trim() }),
      ...(fromName !== undefined && { fromName: fromName?.trim() || null }),
      ...(templateId !== undefined && { templateId: templateId || null }),
      ...(design && { blocksJson: JSON.parse(JSON.stringify(design)), bodyHtml: renderBlocksToHtml(design.blocks, design.settings) }),
      ...(audienceSources !== undefined && { audienceSources }),
      ...(status === 'CANCELED' && { status: 'CANCELED' as const, scheduledAt: null }),
      ...(scheduledAt !== undefined && status !== 'CANCELED' && {
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: scheduledAt ? ('SCHEDULED' as const) : ('DRAFT' as const),
      }),
    },
  })
  return NextResponse.json(campaign)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !ALLOWED.includes(role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const existing = await db.emailCampaign.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'SENDING') return NextResponse.json({ error: 'Cannot delete while sending' }, { status: 409 })

  await db.emailCampaign.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
