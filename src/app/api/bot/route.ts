import { NextRequest, NextResponse } from 'next/server'
import { recordBotCall, requireBotAccess } from '@/lib/bot-api-key'
import { BOT_RESOURCES, botSafeFields } from '@/lib/bot-access'

// Catalog of everything a BOT account can read — lets a bot discover resources and their
// columns without any out-of-band docs. ADMIN/SUPER_ADMIN can call it too, to preview exactly
// what the bot sees.
export async function GET(req: NextRequest) {
  const auth = await requireBotAccess()
  if (!auth.ok) return auth.response
  await recordBotCall(auth, req.nextUrl, 'catalog', 0)

  const resources = Object.entries(BOT_RESOURCES).map(([name, r]) => ({
    name,
    path: `/api/bot/${name}`,
    description: r.description,
    fields: botSafeFields(r.model).map(f => ({ name: f.name, type: f.type })),
  }))

  return NextResponse.json({
    readOnly: true, // except the create-only POST /api/bot/talent-pool
    usage: {
      auth: 'Header "Authorization: Bearer sbk_…" (BOT API key), or a logged-in BOT session cookie',
      list: 'GET /api/bot/{resource}?limit=100&cursor={lastId}&from=YYYY-MM-DD&to=YYYY-MM-DD&{field}={value}',
      detail: 'GET /api/bot/{resource}/{id}',
      createCandidate: 'POST /api/bot/talent-pool — JSON { fullName (required), appliedRole (job title) or appliedRoleId, phone, email, source, expectedSalary, location, readyJoinDate (YYYY-MM-DD), notes, skills[], languages[] }. Create only: bots cannot edit or delete candidates.',
      notes: 'limit max 500. Rate limits per bot account: 60 requests/minute and 10,000 rows/hour (HTTP 429 with Retry-After). Every call is logged. from/to filter the resource\'s main date column. Any listed field can be used as an exact-match filter. Use nextCursor from the response to page.',
    },
    resources,
  })
}
