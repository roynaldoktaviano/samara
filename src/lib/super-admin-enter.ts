import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { centralDb } from '@/lib/central-db'
import { getTenantDb } from '@/lib/tenant-db'

// "Open ERP" from the Super Admin dashboard. A super admin's own session has no tenant, so
// it can't use the ERP. Instead the dashboard asks the server for a short-lived, single-use
// ticket and trades it (NextAuth provider 'super-admin-ticket' in src/lib/auth.ts) for a normal
// tenant session as a tenant user with role SUPER_ADMIN, which the session treats exactly like
// ADMIN (see effectiveSessionRole in src/lib/role-utils.ts). The same ticket mechanism takes
// the super admin back to the dashboard ('return'), so no password is asked either way.

const TICKET_TTL_MS = 60 * 1000
type TicketPayload =
  | { mode: 'enter'; superAdminId: string; tenantId: string; nonce: string; exp: number }
  | { mode: 'return'; superAdminId: string; nonce: string; exp: number }

// Single-use: a ticket's nonce is burnt on first use. In-memory is enough. Tickets live 60s
// and the app runs as a single Node process.
const usedNonces = new Map<string, number>()

function key() {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set')
  return `super-admin-ticket:${secret}`
}

type TicketInput =
  | { mode: 'enter'; superAdminId: string; tenantId: string }
  | { mode: 'return'; superAdminId: string }

export function signSuperAdminTicket(input: TicketInput) {
  const payload = { ...input, nonce: crypto.randomBytes(16).toString('hex'), exp: Date.now() + TICKET_TTL_MS }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', key()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function consumeSuperAdminTicket(ticket: string | undefined): TicketPayload | null {
  if (!ticket) return null
  const [body, sig] = ticket.split('.')
  if (!body || !sig) return null
  const expected = crypto.createHmac('sha256', key()).update(body).digest('base64url')
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null
  let p: TicketPayload
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch { return null }
  const now = Date.now()
  if (!p?.nonce || !p.superAdminId || !p.exp || p.exp < now) return null
  if (p.mode !== 'enter' && p.mode !== 'return') return null
  if (p.mode === 'enter' && !p.tenantId) return null
  for (const [n, exp] of usedNonces) if (exp < now) usedNonces.delete(n)
  if (usedNonces.has(p.nonce)) return null
  usedNonces.set(p.nonce, p.exp)
  return p
}

/** The active super admin behind this id, or null. */
export async function activeSuperAdmin(id: string) {
  const u = await centralDb.centralUser.findUnique({ where: { id }, select: { id: true, email: true, name: true, isSuperAdmin: true, isActive: true } })
  return u?.isSuperAdmin && u.isActive ? u : null
}

/**
 * The super admin's own user row in the tenant DB (same email, role SUPER_ADMIN), created on
 * first entry. Records the super admin makes inside the ERP (createdBy, approvals, logs) need
 * a real tenant user to point at. Its password is random and never used: entry is by ticket only,
 * and step 1 of the password login always matches the central super admin first.
 */
export async function ensureTenantSuperAdminUser(databaseUrl: string, superAdmin: { email: string; name: string | null }) {
  const db = getTenantDb(databaseUrl)
  const existing = await db.user.findUnique({ where: { email: superAdmin.email } })
  if (existing) {
    if (existing.role === 'SUPER_ADMIN') return existing
    // The same email as a regular staff account would hand that person's identity to the super
    // admin. Refuse rather than silently promote or reuse it.
    throw new Error(`${superAdmin.email} is already a ${existing.role} user in this tenant`)
  }
  return db.user.create({
    data: {
      email: superAdmin.email,
      name: superAdmin.name ?? 'Super Admin',
      password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      role: 'SUPER_ADMIN',
    },
  })
}
