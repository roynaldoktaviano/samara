import crypto from 'crypto'
import { centralDb } from '@/lib/central-db'
import {
  type TenantSecretKey,
  type TenantSecrets,
  TENANT_SECRET_DEFINITIONS,
  VALID_TENANT_SECRET_KEYS as VALID_KEYS,
  TENANT_SECRET_ENV_FALLBACK as ENV_FALLBACK,
} from '@/lib/tenant-secrets-definitions'

export type { TenantSecretKey, TenantSecrets }
export { TENANT_SECRET_DEFINITIONS }

/** Validates and strips unknown keys from a secrets object (mirrors parseTenantFeatures). */
export function parseTenantSecrets(raw: unknown): TenantSecrets {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: TenantSecrets = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (VALID_KEYS.has(k) && typeof v === 'string' && v.trim()) {
      result[k as TenantSecretKey] = v.trim()
    }
  }
  return result
}

function getEncryptionKey(): Buffer {
  const hex = process.env.TENANT_SECRETS_KEY
  if (!hex) throw new Error('TENANT_SECRETS_KEY is not set')
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) throw new Error('TENANT_SECRETS_KEY must be a 32-byte hex string')
  return key
}

/** AES-256-GCM, keyed by TENANT_SECRETS_KEY — so a database copy alone never exposes the plaintext credential. */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv, authTag, encrypted].map(b => b.toString('base64')).join('.')
}

export function decryptSecret(ciphertext: string): string {
  const [ivB64, authTagB64, dataB64] = ciphertext.split('.')
  if (!ivB64 || !authTagB64 || !dataB64) throw new Error('Malformed encrypted secret')
  const key = getEncryptionKey()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}

/**
 * Resolves one secret for a tenant: its own override if set, else the matching
 * global env var. This fallback is what keeps every existing tenant working
 * unchanged until they're explicitly given their own credentials.
 */
export async function getTenantSecret(tenantId: string, key: TenantSecretKey): Promise<string | null> {
  const tenant = await centralDb.tenant.findUnique({ where: { id: tenantId }, select: { secrets: true } })
  const stored = (tenant?.secrets as TenantSecrets | null)?.[key]
  if (stored) return decryptSecret(stored)
  return process.env[ENV_FALLBACK[key]] || null
}

/** Merges new secret values into whatever a tenant already has set — never wipes other keys. */
export async function setTenantSecrets(tenantId: string, raw: unknown): Promise<void> {
  const parsed = parseTenantSecrets(raw)
  const tenant = await centralDb.tenant.findUnique({ where: { id: tenantId }, select: { secrets: true } })
  const merged: TenantSecrets = { ...((tenant?.secrets as TenantSecrets | null) ?? {}) }
  for (const [k, v] of Object.entries(parsed)) {
    merged[k as TenantSecretKey] = encryptSecret(v)
  }
  await centralDb.tenant.update({ where: { id: tenantId }, data: { secrets: JSON.parse(JSON.stringify(merged)) } })
}

/** Which secret keys a tenant currently has an override for — safe to return to a client, no values. */
export async function getTenantSecretStatus(tenantId: string): Promise<Record<TenantSecretKey, boolean>> {
  const tenant = await centralDb.tenant.findUnique({ where: { id: tenantId }, select: { secrets: true } })
  const stored = (tenant?.secrets as TenantSecrets | null) ?? {}
  return Object.fromEntries(TENANT_SECRET_DEFINITIONS.map(s => [s.key, !!stored[s.key]])) as Record<TenantSecretKey, boolean>
}
