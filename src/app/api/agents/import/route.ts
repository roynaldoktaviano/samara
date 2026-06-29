import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/get-db'
import { logActivity } from '@/lib/activity'

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const parseRow = (line: string): string[] => {
    const fields: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    fields.push(cur.trim())
    return fields
  }

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '').trim())
  return lines.slice(1).map(line => {
    const vals = parseRow(line)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  })
}

const VALID_CONTRACTS = ['Yes', 'Not Yet', 'Not Qualified']

// Normalize column name aliases
function col(row: Record<string, string>, ...keys: string[]) {
  for (const k of keys) {
    const v = row[k.toLowerCase().replace(/\s+/g, '')]
    if (v !== undefined) return v.trim()
  }
  return ''
}

export async function POST(request: NextRequest) {
  const db = await getDb()
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let text: string
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    text = await file.text()
  } catch {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 400 })
  }

  const rows = parseCSV(text)
  if (rows.length === 0) {
    return NextResponse.json({ error: 'File is empty or missing header row' }, { status: 400 })
  }

  const firstRow = rows[0]
  const hasName = 'name' in firstRow || 'agentname' in firstRow || 'agent' in firstRow || 'company' in firstRow
  if (!hasName) {
    return NextResponse.json({ error: 'CSV must have a "name" column' }, { status: 400 })
  }

  // Load all sales users for name matching
  const salesUsers = await db.user.findMany({
    where: { role: { in: ['SALES', 'ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true, name: true, email: true },
  })

  function matchSalesperson(raw: string): string | null {
    if (!raw) return null
    const lower = raw.toLowerCase().trim()
    const match = salesUsers.find(u =>
      u.name?.toLowerCase() === lower ||
      u.email.toLowerCase() === lower ||
      u.name?.toLowerCase().includes(lower) ||
      lower.includes(u.name?.toLowerCase() ?? '____')
    )
    return match?.id ?? null
  }

  // Existing agents by name (case-insensitive lookup)
  const existingAgents = await db.agent.findMany({
    select: { id: true, name: true },
  })
  const existingMap = new Map(existingAgents.map(a => [a.name.toLowerCase().trim(), a.id]))

  // First pass: collect unique agents from CSV (keyed by name, last non-empty value wins for optional fields)
  const agentMeta: Map<string, {
    name: string; commission: number; country: string | null
    note: string | null; contract: string | null
    isActive: boolean; salespersonId: string | null
  }> = new Map()

  const errors: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row  = rows[i]
    const rowNum = i + 2

    const name = col(row, 'name', 'agentName', 'agent', 'company').trim()
    if (!name) continue

    const key = name.toLowerCase().trim()

    const commissionRaw = col(row, 'commission')
    const commission = commissionRaw ? parseFloat(commissionRaw) : 0
    if (commissionRaw && isNaN(commission)) {
      errors.push(`Row ${rowNum}: invalid commission "${commissionRaw}"`)
      continue
    }

    const contract = col(row, 'contract') || null
    if (contract && !VALID_CONTRACTS.includes(contract)) {
      errors.push(`Row ${rowNum}: invalid contract "${contract}" — use: ${VALID_CONTRACTS.join(', ')}`)
    }

    const country      = col(row, 'country') || null
    const note         = col(row, 'note', 'notes') || null
    const isActiveRaw  = col(row, 'isActive', 'active') || 'true'
    const isActive     = isActiveRaw.toLowerCase() !== 'false'
    const salespersonRaw = col(row, 'salesperson', 'sales', 'pic')
    const salespersonId  = matchSalesperson(salespersonRaw)
    if (!salespersonId) {
      errors.push(`Row ${rowNum} ("${name}"): salesperson "${salespersonRaw || '(empty)'}" not found — row skipped`)
      continue
    }

    if (!agentMeta.has(key)) {
      agentMeta.set(key, { name, commission, country, note, contract, isActive, salespersonId })
    } else {
      // Update meta only if new row provides non-empty values
      const prev = agentMeta.get(key)!
      if (country)      prev.country      = country
      if (note)         prev.note         = note
      if (contract)     prev.contract     = contract
      if (commissionRaw) prev.commission  = commission
      if (salespersonId) prev.salespersonId = salespersonId
    }
  }

  // Second pass: upsert agents
  let agentsCreated = 0
  let agentsUpdated = 0
  const agentIdMap  = new Map<string, string>() // normalizedName → agentId

  for (const [key, meta] of agentMeta) {
    const existingId = existingMap.get(key)
    if (existingId) {
      try {
        await db.agent.update({
          where: { id: existingId },
          data: {
            commission:    meta.commission,
            country:       meta.country,
            note:          meta.note,
            contract:      meta.contract,
            isActive:      meta.isActive,
            ...(meta.salespersonId ? { salespersonId: meta.salespersonId } : {}),
          },
        })
        agentIdMap.set(key, existingId)
        agentsUpdated++
      } catch (e: any) {
        errors.push(`Agent "${meta.name}": ${e.message ?? 'update failed'}`)
      }
    } else {
      try {
        const agent = await db.agent.create({
          data: {
            name:           meta.name,
            commission:     meta.commission,
            country:        meta.country,
            note:           meta.note,
            contract:       meta.contract,
            isActive:       meta.isActive,
            salespersonId:  meta.salespersonId,
          },
        })
        agentIdMap.set(key, agent.id)
        agentsCreated++
      } catch (e: any) {
        errors.push(`Agent "${meta.name}": ${e.message ?? 'create failed'}`)
      }
    }
  }

  // Third pass: create contact persons
  let contactsCreated = 0
  const skippedContacts: { row: number; agent: string; reason: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const agentName = col(row, 'name', 'agentName', 'agent', 'company').trim()
    if (!agentName) continue

    const contactName = col(row, 'contactName', 'contact', 'contactPerson', 'person').trim()
    if (!contactName) continue

    const agentId = agentIdMap.get(agentName.toLowerCase().trim())
    if (!agentId) {
      skippedContacts.push({ row: i + 2, agent: agentName, reason: 'Agent not found' })
      continue
    }

    const contactEmail    = col(row, 'contactEmail', 'email') || null
    const contactWhatsapp = col(row, 'contactWhatsapp', 'whatsapp', 'wa', 'phone') || null
    const contactJobTitle = col(row, 'contactJobTitle', 'jobTitle', 'title', 'role') || null
    const dobRaw          = col(row, 'dateOfBirth', 'dob', 'birthday') || null

    let dateOfBirth: Date | null = null
    if (dobRaw) {
      const d = new Date(dobRaw)
      if (!isNaN(d.getTime())) dateOfBirth = d
    }

    try {
      // Check existing contact by agentId + name (case-insensitive)
      const existingContact = await db.agentContact.findFirst({
        where: {
          agentId,
          name: { equals: contactName, mode: 'insensitive' },
        },
        select: { id: true },
      })

      if (existingContact) {
        await db.agentContact.update({
          where: { id: existingContact.id },
          data: {
            ...(contactEmail    ? { email:       contactEmail }    : {}),
            ...(contactWhatsapp ? { whatsapp:    contactWhatsapp } : {}),
            ...(contactJobTitle ? { jobTitle:    contactJobTitle } : {}),
            ...(dateOfBirth     ? { dateOfBirth: dateOfBirth }     : {}),
          },
        })
      } else {
        await db.agentContact.create({
          data: {
            agentId,
            name:        contactName,
            email:       contactEmail,
            whatsapp:    contactWhatsapp,
            jobTitle:    contactJobTitle,
            dateOfBirth,
          },
        })
        contactsCreated++
      }
    } catch (e: any) {
      skippedContacts.push({ row: i + 2, agent: agentName, reason: e.message ?? 'Create failed' })
    }
  }

  if (agentsCreated > 0 || agentsUpdated > 0) {
    logActivity({
      userId:   session!.user.id,
      userName: session!.user.name ?? session!.user.email ?? 'Unknown',
      userRole: role,
      action: 'CREATE', entity: 'Agent', entityId: 'bulk',
      detail: `Import CSV: ${agentsCreated} new agent(s), ${agentsUpdated} updated, ${contactsCreated} new contact(s)`,
    }, db).catch(() => {})
  }

  return NextResponse.json({
    agentsCreated,
    agentsExisting: agentsUpdated,
    contactsCreated,
    contactsSkipped: skippedContacts.length,
    skippedContacts,
    errors,
  })
}
