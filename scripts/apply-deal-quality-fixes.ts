/**
 * Marketing won-deal audit (2026-11-24) — data fixes before migration, ERP side only (Freshsales is
 * never written to). Records decisions in FreshsalesDealFix so they survive every archive pull:
 *  - every Freshsales deal that looks like a test (Abel, Ursula Wastian, "Test" …) → isTest
 *    (left out of reports, uploads and the FS → ERP deal migration); ERP Deals made from them too;
 *  - Robby Weatherley: real Won date = when the deal was created as Won (2024-04-29), the hand-typed
 *    closed date (2024-04-10) is earlier than the contact itself;
 *  - Beulen Delphine: amount 0 in Freshsales — only the DP (USD 2,127) is known, so it is noted, not
 *    guessed; set the amount with `--beulen-amount=<USD>` once sales confirm it.
 *
 * Run: npx tsx scripts/apply-deal-quality-fixes.ts            (dry run, prints what would change)
 *      npx tsx scripts/apply-deal-quality-fixes.ts --apply
 */
import { PrismaClient } from '@prisma/client'
import { looksLikeTest } from '../src/lib/deal-quality'

const db = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const beulenArg = process.argv.find(a => a.startsWith('--beulen-amount='))
const BEULEN_AMOUNT = beulenArg ? Number(beulenArg.split('=')[1]) : null
const NOTE = 'Marketing won-deal audit 2026-11-24'

const ROBBY_DEAL = '113000664584'
const BEULEN_DEAL = '113001465773'

async function main() {
  const deals = await db.freshsalesDeal.findMany({ where: { isDeleted: false }, select: { id: true, name: true, contactFsIds: true, stageFsId: true, closedDate: true } })
  const contacts = await db.freshsalesContact.findMany({ where: { id: { in: [...new Set(deals.flatMap(d => d.contactFsIds))] } }, select: { id: true, name: true } })
  const contactName = new Map(contacts.map(c => [c.id, c.name]))
  const existing = new Map((await db.freshsalesDealFix.findMany()).map(f => [f.dealId, f]))

  const tests = deals.filter(d => looksLikeTest(d.name, ...d.contactFsIds.map(id => contactName.get(id))))
  // A decision already recorded (e.g. un-flagged by hand) is left alone
  const newTests = tests.filter(d => existing.get(d.id)?.isTest == null)
  console.log(`Test-looking Freshsales deals: ${tests.length} (${newTests.length} to flag)`)
  for (const d of newTests) console.log(`  ${d.id}  ${d.name}`)

  const erpTestDeals = await db.deal.findMany({ where: { freshsalesDealId: { in: tests.map(d => d.id) }, isTest: false }, select: { id: true } })
  console.log(`ERP deals made from them, to mark isTest: ${erpTestDeals.length}`)

  const robbyWon = await db.$queryRaw<{ at: Date }[]>`
    SELECT min("occurredAt") AS at FROM "FreshsalesTimelineEvent"
    WHERE "targetType" = 'Deal' AND "targetFsId" = ${ROBBY_DEAL} AND "actionType" IN ('CREATE', 'STAGE_CHANGE') AND "actionData"->>'stage_name' ILIKE 'won%'`
  const robbyAt = robbyWon[0]?.at ?? null
  console.log(`Robby Weatherley real Won date: ${robbyAt?.toISOString() ?? 'not found'}`)
  console.log(`Beulen Delphine amount: ${BEULEN_AMOUNT ? `set to USD ${BEULEN_AMOUNT}` : 'unknown — noted only'}`)

  if (!APPLY) { console.log('\nDry run — pass --apply to write.'); return }

  for (const d of newTests) {
    await db.freshsalesDealFix.upsert({
      where: { dealId: d.id },
      create: { dealId: d.id, isTest: true, note: `${NOTE}: test deal` },
      update: { isTest: true, note: `${NOTE}: test deal` },
    })
  }
  if (erpTestDeals.length) await db.deal.updateMany({ where: { id: { in: erpTestDeals.map(d => d.id) } }, data: { isTest: true } })
  if (robbyAt) {
    await db.freshsalesDealFix.upsert({
      where: { dealId: ROBBY_DEAL },
      create: { dealId: ROBBY_DEAL, wonAt: robbyAt, note: `${NOTE}: closed date 2024-04-10 was typed before the contact existed; Won = deal created as Won. Lead came from a Mischief Google ad (gclid landing on mischiefvoyage.com).` },
      update: { wonAt: robbyAt },
    })
  }
  await db.freshsalesDealFix.upsert({
    where: { dealId: BEULEN_DEAL },
    create: {
      dealId: BEULEN_DEAL,
      ...(BEULEN_AMOUNT && BEULEN_AMOUNT > 0 ? { amount: BEULEN_AMOUNT, currency: 'USD' } : {}),
      note: `${NOTE}: amount 0 in Freshsales; DP USD 2,127 received 2026-09-10 — full amount to be confirmed by sales.`,
    },
    update: BEULEN_AMOUNT && BEULEN_AMOUNT > 0 ? { amount: BEULEN_AMOUNT, currency: 'USD' } : {},
  })
  console.log('\nApplied.')
}
main().finally(() => db.$disconnect())
