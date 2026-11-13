import { randomBytes, randomInt } from 'crypto'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest, NextResponse } from 'next/server'
import type { OnboardingForm, PrismaClient } from '@prisma/client'
import { resolveTenantByLookup } from '@/lib/resolve-tenant'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { sendBulkEmail } from '@/lib/resend-mailer'
import { ONBOARDING_LINK_DAYS } from '@/lib/onboarding-fields'

// Server side of the public Onboarding Form (/onboarding/[token]). Access = the unguessable
// token in the link + a 6-digit PIN HR gives the joiner over a separate channel. A correct
// PIN issues a short-lived cookie scoped to this one form's API path; the cookie carries
// pinSetAt, so HR's "Reset PIN" immediately ends any open session.

export const ONBOARDING_COOKIE = 'onboarding-access'
const SESSION_SECONDS = 2 * 60 * 60
export const PIN_MAX_ATTEMPTS = 5
export const PIN_LOCK_MINUTES = 30

function secret(): Uint8Array {
  const s = process.env.SSO_JWT_SECRET
  if (!s) throw new Error('SSO_JWT_SECRET is not configured')
  return new TextEncoder().encode(s)
}

export function newOnboardingToken() {
  return randomBytes(24).toString('base64url')
}

export function newOnboardingExpiry() {
  return new Date(Date.now() + ONBOARDING_LINK_DAYS * 24 * 60 * 60 * 1000)
}

/** Returns the plain PIN (shown to HR once) and its bcrypt hash (stored). */
export async function newOnboardingPin() {
  const pin = String(randomInt(0, 1_000_000)).padStart(6, '0')
  return { pin, pinHash: await bcrypt.hash(pin, 10) }
}

export function checkOnboardingPin(pin: string, hash: string) {
  return bcrypt.compare(pin, hash)
}

/** Base URL for links in outgoing email — the public host behind the proxy, else NEXT_PUBLIC_APP_URL. */
export function appBaseUrl(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  if (host && !/^(localhost|127\.|0\.0\.0\.0)/.test(host)) return `https://${host}`
  return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')
}

export function onboardingLink(base: string, token: string) {
  return `${base}/onboarding/${token}`
}

export async function findOnboardingByToken(token: string) {
  if (!token || token.length < 20) return null
  return resolveTenantByLookup(client => client.onboardingForm.findUnique({ where: { token } }))
}

export async function setOnboardingSession(res: NextResponse, form: Pick<OnboardingForm, 'id' | 'token' | 'pinSetAt'>) {
  const jwt = await new SignJWT({ fid: form.id, pv: form.pinSetAt.getTime() })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(secret())
  res.cookies.set(ONBOARDING_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_SECONDS,
    // Scoped to this form's API only — a second form opened in the same browser gets its own cookie.
    path: `/api/onboarding/${form.token}`,
  })
}

export async function hasOnboardingSession(req: NextRequest, form: Pick<OnboardingForm, 'id' | 'pinSetAt'>) {
  const cookie = req.cookies.get(ONBOARDING_COOKIE)?.value
  if (!cookie) return false
  try {
    const { payload } = await jwtVerify(cookie, secret())
    return payload.fid === form.id && payload.pv === form.pinSetAt.getTime()
  } catch {
    return false
  }
}

export function isOnboardingExpired(form: Pick<OnboardingForm, 'expiresAt'>) {
  return form.expiresAt.getTime() < Date.now()
}

/**
 * Resolves the tenant DB + form for a joiner request and checks the PIN session.
 * `error` is a ready-to-return { status, message } when access is denied.
 */
export async function resolveOnboardingSession(req: NextRequest, token: string): Promise<
  | { db: PrismaClient; form: OnboardingForm; error?: undefined }
  | { error: { status: number; message: string } }
> {
  const found = await findOnboardingByToken(token)
  if (!found) return { error: { status: 404, message: 'Invalid link' } }
  const { db, record: form } = found
  if (!(await hasOnboardingSession(req, form))) return { error: { status: 401, message: 'Session expired — please enter your PIN again' } }
  if (form.status !== 'INVITED' && form.status !== 'REVISION_REQUESTED') {
    return { error: { status: 409, message: 'This form can no longer be edited' } }
  }
  if (isOnboardingExpired(form)) return { error: { status: 410, message: 'This link has expired' } }
  return { db, form }
}

/** Only real image/PDF data URLs are accepted from the public form, capped at ~10 MB each. */
export function isAcceptableUpload(v: unknown): v is string {
  return typeof v === 'string'
    && /^data:(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf);base64,/.test(v)
    && v.length <= 14_000_000
}

// ── Email ─────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function noreplyFrom(inboxFrom: string | null) {
  const domain = inboxFrom?.match(/@([^\s>]+)/)?.[1] ?? 'samarayachting.com'
  return `noreply@${domain}`
}

/**
 * Emails the joiner their form link. The PIN is deliberately NOT included — HR hands it
 * over separately, so a leaked/forwarded email alone can't open the form.
 */
export async function sendOnboardingEmail(params: {
  tenantId: string | undefined
  to: string
  fullName: string
  link: string
  roleTitle?: string | null
  expiresAt: Date
  kind: 'invite' | 'revision'
  revisionNote?: string | null
  /** EMPLOYEE_UPDATE = an existing employee asked to check/complete their data. */
  purpose?: 'NEW_JOINER' | 'EMPLOYEE_UPDATE'
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!params.tenantId) return { ok: false, error: 'No tenant on this session' }
  const [apiKey, inboxFrom] = await Promise.all([
    getTenantSecret(params.tenantId, 'resendApiKey'),
    getTenantSecret(params.tenantId, 'emailInboxFromAddress'),
  ])
  if (!apiKey) return { ok: false, error: 'Email sending is not configured (Resend API key missing)' }

  const expires = params.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const isUpdate = params.purpose === 'EMPLOYEE_UPDATE'
  const formName = isUpdate ? 'employee data form' : 'onboarding form'
  const title = isUpdate ? 'Employee Data Form' : 'Onboarding Form'
  const intro = params.kind === 'invite'
    ? isUpdate
      ? `<p style="margin:0 0 14px;">Our HR team is updating employee records. Please check your personal details and documents, correct anything that is out of date and fill in what is missing.</p>`
      : `<p style="margin:0 0 14px;">Welcome aboard! Before your first day${params.roleTitle ? ` as <strong>${esc(params.roleTitle)}</strong>` : ''}, please complete your onboarding form with your personal details and documents.</p>`
    : `<p style="margin:0 0 14px;">Our HR team reviewed your ${formName} and needs a few changes:</p>
       <div style="margin:0 0 14px;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;white-space:pre-wrap;">${esc(params.revisionNote ?? '')}</div>
       <p style="margin:0 0 14px;">Please open the form again, update it and submit.</p>`
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a252f;line-height:1.5;">
      <h2 style="color:#a8956a;margin:0 0 12px;">${title}</h2>
      <p style="margin:0 0 14px;">Hi ${esc(params.fullName)},</p>
      ${intro}
      <p style="margin:22px 0;">
        <a href="${esc(params.link)}" style="background:#d97706;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;">Open ${title}</a>
      </p>
      <p style="margin:0 0 8px;">You will need the <strong>6-digit PIN</strong> our HR team sends you separately to open the form.</p>
      <p style="margin:0 0 8px;color:#5c5648;">This link is valid until ${expires}.</p>
      <p style="color:#8a8378;font-size:12px;border-top:1px solid #ece6d8;padding-top:12px;margin-top:22px;">
        Automated email — please don't reply. If you didn't expect this, you can ignore it.
      </p>
    </div>`

  const res = await sendBulkEmail({
    apiKey, from: noreplyFrom(inboxFrom), fromName: 'Samara HR',
    subject: params.kind === 'invite'
      ? (isUpdate ? 'Please update your employee data' : 'Please complete your onboarding form')
      : `Action needed: update your ${formName}`,
    recipients: [{ email: params.to, htmlFor: html }],
  })
  const failure = res.failures[params.to]
  return failure ? { ok: false, error: failure } : { ok: true }
}

