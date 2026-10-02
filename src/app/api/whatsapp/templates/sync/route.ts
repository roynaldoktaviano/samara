import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { getTenantSecret } from '@/lib/tenant-secrets'
import { WHATSAPP_BRANDS, WHATSAPP_BRAND_SECRET_KEYS, WHATSAPP_GRAPH_VERSION, type WhatsappBrand } from '@/lib/whatsapp-brands'
import { countTemplateParams } from '@/lib/whatsapp-templates'

interface MetaComponent { type: string; format?: string; text?: string; buttons?: { type: string; url?: string }[] }
interface MetaTemplate { name: string; language: string; status: string; components?: MetaComponent[] }

// Why a template can't be sent by the ERP's sender (sendWhatsappTemplateMessage only fills
// positional {{n}} body params) — such templates are skipped rather than imported broken.
function unsupportedReason(t: MetaTemplate): string | null {
  const body = t.components?.find(c => c.type === 'BODY')?.text ?? ''
  if (/\{\{\s*[^}\d\s][^}]*\}\}/.test(body)) return 'uses named variables'
  const header = t.components?.find(c => c.type === 'HEADER')
  if (header && header.format && header.format !== 'TEXT') return `has a ${header.format.toLowerCase()} header`
  if (header?.text && /\{\{/.test(header.text)) return 'has a variable in the header'
  const buttons = t.components?.find(c => c.type === 'BUTTONS')?.buttons ?? []
  if (buttons.some(b => b.url && /\{\{/.test(b.url))) return 'has a dynamic URL button'
  return null
}

// POST { brand } — pulls APPROVED templates from Meta (GET /{waba-id}/message_templates)
// and upserts them into WhatsappTemplate. Existing rows keep their admin-set label, and
// their param labels too as long as the placeholder count didn't change.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!session?.user?.id || role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const brand = (WHATSAPP_BRANDS as readonly string[]).includes(body.brand) ? (body.brand as WhatsappBrand) : null
  if (!brand) return NextResponse.json({ error: 'Invalid or missing brand' }, { status: 400 })

  const tenantId = (session.user as { tenantId?: string }).tenantId
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })
  const keys = WHATSAPP_BRAND_SECRET_KEYS[brand]
  const [wabaId, apiToken] = await Promise.all([getTenantSecret(tenantId, keys.wabaId), getTenantSecret(tenantId, keys.apiToken)])
  if (!wabaId || !apiToken) {
    return NextResponse.json({ error: 'WhatsApp Business Account ID and API Token must be set for this brand in Super Admin > tenant secrets' }, { status: 400 })
  }

  const templates: MetaTemplate[] = []
  let url: string | null = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${wabaId}/message_templates?fields=name,language,status,components&limit=100`
  try {
    while (url) {
      const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return NextResponse.json({ error: `Meta: ${data?.error?.message ?? `returned ${res.status}`}` }, { status: 502 })
      templates.push(...(data.data ?? []))
      url = data.paging?.next ?? null
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to reach Meta' }, { status: 502 })
  }

  const db = await getDb(session)
  let created = 0, updated = 0
  const skipped: string[] = []
  for (const t of templates) {
    if (t.status !== 'APPROVED') continue
    const reason = unsupportedReason(t)
    if (reason) { skipped.push(`${t.name} (${t.language}) — ${reason}`); continue }
    const bodyText = t.components?.find(c => c.type === 'BODY')?.text?.trim() ?? ''
    if (!bodyText) { skipped.push(`${t.name} (${t.language}) — no body text`); continue }

    const paramCount = countTemplateParams(bodyText)
    const existing = await db.whatsappTemplate.findUnique({ where: { brand_name_language: { brand, name: t.name, language: t.language } } })
    const paramLabels = existing && existing.paramLabels.length === paramCount
      ? existing.paramLabels
      : Array.from({ length: paramCount }, (_, i) => `Param {{${i + 1}}}`)

    if (existing) {
      await db.whatsappTemplate.update({ where: { id: existing.id }, data: { bodyText, paramLabels } })
      updated++
    } else {
      await db.whatsappTemplate.create({ data: { brand, name: t.name, language: t.language, label: t.name, bodyText, paramLabels } })
      created++
    }
  }

  return NextResponse.json({ total: templates.length, created, updated, skipped })
}
