import jwt from 'jsonwebtoken'

const SECRET = process.env.SSO_JWT_SECRET!

export interface SSOPayload {
  userId:  string
  email:   string
  name:    string | null
}

export function signSSOToken(payload: SSOPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}

export function verifySSOToken(token: string): SSOPayload {
  return jwt.verify(token, SECRET) as SSOPayload
}
