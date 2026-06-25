import { NextRequest, NextResponse } from 'next/server'
import { centralDb } from '@/lib/central-db'

// Public endpoint — returns tenant branding info from email (no auth needed)
export async function GET(req: NextRequest) {
  const email = new URL(req.url).searchParams.get('email')
  if (!email) return NextResponse.json(null)

  // Check if super admin
  const central = await centralDb.centralUser.findUnique({
    where: { email },
    select: { isSuperAdmin: true },
  }).catch(() => null)

  if (central?.isSuperAdmin) {
    return NextResponse.json({
      tenantName: 'System Administration',
      logoUrl: null, // uses default Samara logo
      slug: 'super-admin',
    })
  }

  // Find tenant from email
  const userTenant = await centralDb.userTenant.findFirst({
    where: { user: { email } },
    include: { tenant: { select: { name: true, slug: true, logoUrl: true } } },
  }).catch(() => null)

  if (!userTenant) return NextResponse.json(null)

  return NextResponse.json({
    tenantName: userTenant.tenant.name,
    logoUrl: userTenant.tenant.logoUrl,
    slug: userTenant.tenant.slug,
  })
}
