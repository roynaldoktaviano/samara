// Moves HR files stored as base64 data URLs in the DB into private R2 storage, replacing each
// with a `/api/files/private/…` reference (see src/lib/private-files.ts). Before this, every
// Employee/Candidate save and every list load carried megabytes of base64 JSON — HR saw
// "Saving…" hang and sometimes fail.
//
//   npx tsx scripts/migrate-hr-files-to-r2.ts                 # dry run, every active tenant
//   npx tsx scripts/migrate-hr-files-to-r2.ts samara --apply  # apply to one tenant
//
// Run with --apply only AFTER the code that understands the refs is deployed — older code shows
// them as broken files. Idempotent: entries that are already refs/URLs are left alone, so it can
// be re-run safely. Before updating, the original values of every changed row are written to
// ~/neon-backup/hr-files-before-r2-<tenant>-<timestamp>.json.
//
// Tables/fields: Employee + OnboardingForm document arrays, Candidate.resumeFiles and
// Candidate.additionalDocuments[].fileKey.
import { PrismaClient as CentralClient } from '@prisma/central-client'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const apply = process.argv.includes('--apply')
const slugs = process.argv.slice(2).filter(a => !a.startsWith('--'))

const EMPLOYEE_KEYS = [
  'seamanBookFiles', 'bstFiles', 'medicalCheckupFiles', 'ijazahFiles', 'certificateFiles', 'contractFiles',
  'ktpFiles', 'kkFiles', 'npwpFiles', 'photoFiles',
] as const
const ONBOARDING_KEYS = [
  'ktpFiles', 'kkFiles', 'npwpFiles', 'photoFiles', 'ijazahFiles', 'certificateFiles',
  'seamanBookFiles', 'bstFiles', 'medicalCheckupFiles',
] as const

const isData = (v: unknown) => typeof v === 'string' && v.startsWith('data:')
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`

async function migrate(slug: string, url: string) {
  // Loaded after dotenv — r2.ts reads its env vars at import time.
  const { persistDataUrl } = await import('../src/lib/private-files-server')
  const db = new PrismaClient({ datasources: { db: { url } } })
  const backup: { table: string; id: string; before: Record<string, unknown> }[] = []
  let files = 0
  let bytes = 0
  const count = (list: unknown[]) => { for (const v of list) if (isData(v)) { files++; bytes += (v as string).length } }

  try {
    // ── Employee ────────────────────────────────────────────────────────────────
    const employees = await db.employee.findMany({ select: { id: true, fullName: true, ...Object.fromEntries(EMPLOYEE_KEYS.map(k => [k, true])) } })
    for (const e of employees as unknown as Record<string, unknown>[]) {
      const dirty = EMPLOYEE_KEYS.filter(k => (e[k] as string[]).some(isData))
      if (!dirty.length) continue
      dirty.forEach(k => count(e[k] as string[]))
      console.log(`  Employee ${e.fullName}: ${dirty.join(', ')}`)
      if (!apply) continue
      const data: Record<string, string[]> = {}
      for (const k of dirty) data[k] = await Promise.all((e[k] as string[]).map(v => persistDataUrl(v, 'hr-employee', k.replace(/Files$/, ''))))
      backup.push({ table: 'Employee', id: e.id as string, before: Object.fromEntries(dirty.map(k => [k, e[k]])) })
      await db.employee.update({ where: { id: e.id as string }, data })
    }

    // ── OnboardingForm ──────────────────────────────────────────────────────────
    const forms = await db.onboardingForm.findMany({ select: { id: true, fullName: true, ...Object.fromEntries(ONBOARDING_KEYS.map(k => [k, true])) } })
    for (const f of forms as unknown as Record<string, unknown>[]) {
      const dirty = ONBOARDING_KEYS.filter(k => (f[k] as string[]).some(isData))
      if (!dirty.length) continue
      dirty.forEach(k => count(f[k] as string[]))
      console.log(`  OnboardingForm ${f.fullName}: ${dirty.join(', ')}`)
      if (!apply) continue
      const data: Record<string, string[]> = {}
      for (const k of dirty) data[k] = await Promise.all((f[k] as string[]).map(v => persistDataUrl(v, 'hr-employee', k.replace(/Files$/, ''))))
      backup.push({ table: 'OnboardingForm', id: f.id as string, before: Object.fromEntries(dirty.map(k => [k, f[k]])) })
      await db.onboardingForm.update({ where: { id: f.id as string }, data })
    }

    // ── Candidate ───────────────────────────────────────────────────────────────
    const candidates = await db.candidate.findMany({ select: { id: true, fullName: true, resumeFiles: true, additionalDocuments: true } })
    for (const c of candidates) {
      const docs = Array.isArray(c.additionalDocuments) ? (c.additionalDocuments as { name?: string; fileKey?: string }[]) : []
      const cvDirty = c.resumeFiles.some(isData)
      const docsDirty = docs.some(d => isData(d?.fileKey))
      if (!cvDirty && !docsDirty) continue
      count(c.resumeFiles)
      count(docs.map(d => d?.fileKey))
      console.log(`  Candidate ${c.fullName}: ${[cvDirty && 'CV', docsDirty && 'documents'].filter(Boolean).join(', ')}`)
      if (!apply) continue
      const resumeFiles = await Promise.all(c.resumeFiles.map(v => persistDataUrl(v, 'hr-candidate', 'cv')))
      const additionalDocuments = await Promise.all(docs.map(async d =>
        d && typeof d.fileKey === 'string' ? { ...d, fileKey: await persistDataUrl(d.fileKey, 'hr-candidate', d.name ?? 'document') } : d))
      backup.push({ table: 'Candidate', id: c.id, before: { resumeFiles: c.resumeFiles, additionalDocuments: c.additionalDocuments } })
      await db.candidate.update({ where: { id: c.id }, data: { resumeFiles, additionalDocuments } })
    }
  } finally {
    if (backup.length) {
      const dir = path.join(os.homedir(), 'neon-backup')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, `hr-files-before-r2-${slug}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
      fs.writeFileSync(file, JSON.stringify(backup))
      console.log(`  backup of ${backup.length} row(s) → ${file}`)
    }
    await db.$disconnect()
  }
  console.log(`${apply ? '✓' : '·'} ${slug}: ${files} base64 file(s), ${mb(bytes)}${apply ? ' moved to R2' : ' to move (dry run — pass --apply)'}`)
}

;(async () => {
  const central = new CentralClient({ datasources: { db: { url: process.env.CENTRAL_DATABASE_URL } } })
  const tenants = await central.tenant.findMany({
    where: { isActive: true, ...(slugs.length ? { slug: { in: slugs } } : {}) },
    select: { slug: true, databaseUrl: true },
  })
  await central.$disconnect()
  if (!tenants.length) throw new Error('No matching active tenant')
  let failed = 0
  for (const t of tenants) {
    console.log(`── ${t.slug}`)
    try { await migrate(t.slug, t.databaseUrl) } catch (e) { failed++; console.error(`✗ ${t.slug}:`, e instanceof Error ? e.message : e) }
  }
  process.exit(failed ? 1 : 0)
})()
