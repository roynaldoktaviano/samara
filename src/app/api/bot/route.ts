import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { BOT_RESOURCES, botSafeFields } from '@/lib/bot-access'

// Catalog of everything a BOT account can read — lets a bot discover resources and their
// columns without any out-of-band docs. ADMIN/SUPER_ADMIN can call it too, to preview exactly
// what the bot sees.
export async function GET() {
  const auth = await requireRole(['BOT', 'ADMIN', 'SUPER_ADMIN'])
  if (!auth.ok) return auth.response

  const resources = Object.entries(BOT_RESOURCES).map(([name, r]) => ({
    name,
    path: `/api/bot/${name}`,
    description: r.description,
    fields: botSafeFields(r.model).map(f => ({ name: f.name, type: f.type })),
  }))

  return NextResponse.json({
    readOnly: true,
    usage: {
      list: 'GET /api/bot/{resource}?limit=100&cursor={lastId}&from=YYYY-MM-DD&to=YYYY-MM-DD&{field}={value}',
      detail: 'GET /api/bot/{resource}/{id}',
      notes: 'limit max 500. from/to filter the resource\'s main date column. Any listed field can be used as an exact-match filter. Use nextCursor from the response to page.',
    },
    resources,
  })
}
