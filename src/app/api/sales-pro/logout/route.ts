import { NextResponse } from 'next/server'
import { SALES_PRO_COOKIE } from '@/lib/sales-pro-access'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SALES_PRO_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
