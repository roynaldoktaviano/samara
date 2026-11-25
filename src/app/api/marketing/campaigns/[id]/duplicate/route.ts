import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'
import { roleMatches } from '@/lib/role-utils'
import type { Prisma } from '@prisma/client'

const ALLOWED = ['ADMIN', 'MARKETING', 'SUPER_ADMIN']

// Copy a campaign (any status) into a fresh DRAFT with the exact same content,
// sender, audience and type. Send history / schedule are not copied.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || !roleMatches(role, ALLOWED)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getDb(session)

  const src = await db.emailCampaign.findUnique({ where: { id } })
  if (!src) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const userName = session.user.name ?? session.user.email ?? 'Unknown'
  const copy = await db.emailCampaign.create({
    data: {
      name: `${src.name} (Copy)`,
      subject: src.subject,
      previewText: src.previewText,
      fromEmail: src.fromEmail,
      fromName: src.fromName,
      templateId: src.templateId,
      blocksJson: (src.blocksJson ?? {}) as Prisma.InputJsonValue,
      bodyHtml: src.bodyHtml,
      audienceSources: (src.audienceSources ?? {}) as Prisma.InputJsonValue,
      emailType: src.emailType,
      createdByUserId: session.user.id,
      createdByName: userName,
    },
  })

  logActivity({
    userId: session.user.id,
    userName,
    userRole: role,
    action: 'CREATE', entity: 'EmailCampaign', entityId: copy.id,
    detail: `Duplicate campaign: ${src.name} → ${copy.name}`,
  }, db).catch(() => {})

  return NextResponse.json(copy, { status: 201 })
}
