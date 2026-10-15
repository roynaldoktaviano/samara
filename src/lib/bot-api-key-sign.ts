import { createHmac } from 'crypto'

// Pure signing half of the BOT API key scheme (format + revocation rules in
// src/lib/bot-api-key.ts). Kept dependency-free so scripts/create-bot-api-key.ts can import it.

export const BOT_KEY_PREFIX = 'sbk_'

function signingSecret(): string {
  const s = process.env.BOT_API_KEY_SECRET || process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('BOT_API_KEY_SECRET / NEXTAUTH_SECRET is not set')
  // Domain-separated so a key signature can never double as any other NextAuth-signed value.
  return `bot-api-key:v1:${s}`
}

export function signBotKeyPayload(payload: string, passwordHash: string): string {
  return createHmac('sha256', signingSecret()).update(`${payload}|${passwordHash}`).digest('base64url')
}

export function createBotApiKey(tenantId: string | null, userId: string, passwordHash: string): string {
  const payload = Buffer.from(JSON.stringify({ t: tenantId, u: userId })).toString('base64url')
  return `${BOT_KEY_PREFIX}${payload}.${signBotKeyPayload(payload, passwordHash)}`
}
