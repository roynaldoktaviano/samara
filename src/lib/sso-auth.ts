import { cookies } from 'next/headers'
import { verifySSOToken, SSOPayload } from './sso-jwt'

export const SSO_COOKIE = 'erp-sso-token'

export async function getSSOSession(): Promise<SSOPayload | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SSO_COOKIE)?.value
    if (!token) return null
    return verifySSOToken(token)
  } catch {
    return null
  }
}
