import { NextRequest, NextResponse } from 'next/server'
import { signSalesProToken, SALES_PRO_COOKIE } from '@/lib/sales-pro-access'
import { isRateLimited, recordFailedAttempt, clearAttempts } from '@/lib/rate-limit'

function getIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'
}

export async function POST(request: NextRequest) {
  const { password } = await request.json().catch(() => ({ password: '' }))
  if (typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'Password wajib diisi' }, { status: 400 })
  }

  const rateLimitKey = `sales-pro:${getIp(request)}`
  if (isRateLimited(rateLimitKey)) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan gagal. Coba lagi dalam beberapa menit.' }, { status: 429 })
  }

  const expected = process.env.SALES_PRO_PASSWORD
  if (!expected) {
    return NextResponse.json({ error: 'Halaman ini belum dikonfigurasi (SALES_PRO_PASSWORD kosong)' }, { status: 500 })
  }

  if (password !== expected) {
    recordFailedAttempt(rateLimitKey)
    return NextResponse.json({ error: 'Password salah' }, { status: 401 })
  }
  clearAttempts(rateLimitKey)

  const token = await signSalesProToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SALES_PRO_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return res
}
