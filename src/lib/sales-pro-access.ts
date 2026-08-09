import { jwtVerify, SignJWT } from 'jose'

// Gate for the /sales-pro microsite: one shared password known only to the sales team
// (SALES_PRO_PASSWORD), not tied to individual staff accounts — unlike Agent Portal's
// per-agent bcrypt login, this page has no per-user identity to check.
export const SALES_PRO_COOKIE = 'sales-pro-access'

export function getSalesProSecret(): Uint8Array {
  const secret = process.env.SSO_JWT_SECRET
  if (!secret) throw new Error('SSO_JWT_SECRET is not configured')
  return new TextEncoder().encode(secret)
}

export async function signSalesProToken(): Promise<string> {
  return new SignJWT({ scope: 'sales-pro' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(getSalesProSecret())
}

export async function verifySalesProToken(token: string | undefined): Promise<boolean> {
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, getSalesProSecret())
    return payload.scope === 'sales-pro'
  } catch {
    return false
  }
}
