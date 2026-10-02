import { NextResponse } from 'next/server'
import { CASHIER_COOKIE } from '@/lib/cashier-access'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(CASHIER_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
