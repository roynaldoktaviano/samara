import { NextResponse } from 'next/server'
import { getTenantBranding } from '@/lib/tenant-branding'

// Public — shown on the sign-in screen before a PIN is entered.
export async function GET() {
  return NextResponse.json(getTenantBranding(process.env.CASHIER_TENANT_SLUG || 'samara'))
}
