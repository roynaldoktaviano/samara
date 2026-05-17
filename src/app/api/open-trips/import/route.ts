import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const HEADERS = ['title', 'yachtName', 'startDate', 'endDate', 'destination', 'region', 'departurePort', 'arrivalPort', 'description']

/* ── GET /api/open-trips/import — download dynamic CSV template ── */
export async function GET() {
  const yachts = await db.yacht.findMany({
    select: { name: true },
    orderBy: { name: 'asc' },
  })

  const q = (v: string) => `"${v}"`

  const rows: string[] = []

  // Header
  rows.push(HEADERS.map(q).join(','))

  // One example row per yacht so user can see all valid yacht names
  yachts.forEach((y, i) => {
    const num = i + 1
    rows.push([
      `Trip Example ${num}`,
      y.name,
      '2026-08-01',
      '2026-08-08',
      'Raja Ampat',
      'East Indonesia',
      'Sorong',
      'Sorong',
      `Example trip for ${y.name}`,
    ].map(q).join(','))
  })

  // Blank separator + valid yacht names reference
  rows.push('')
  rows.push(q('--- VALID YACHT NAMES (use exactly as written below) ---'))
  yachts.forEach(y => rows.push(q(y.name)))

  const csv = rows.join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="open-trips-template.csv"',
    },
  })
}

/* ── POST /api/open-trips/import — bulk create from CSV body ── */
export async function POST(req: NextRequest) {
  try {
    const text = await req.text()
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 400 })
    }

    const parseRow = (line: string): string[] => {
      const cols: string[] = []
      let cur = ''
      let inQuote = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') { inQuote = !inQuote }
        else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = '' }
        else cur += ch
      }
      cols.push(cur.trim())
      return cols
    }

    const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/^"|"$/g, ''))
    const idx = (name: string) => headers.indexOf(name)

    const required = ['title', 'yachtname', 'startdate', 'enddate', 'destination']
    const missing  = required.filter(f => idx(f) === -1)
    if (missing.length) {
      return NextResponse.json({ error: `Missing required columns: ${missing.join(', ')}` }, { status: 400 })
    }

    // Pre-fetch all yachts so we can match by name
    const yachts = await db.yacht.findMany({
      select: { id: true, name: true, cabinCount: true, cabins: { select: { id: true } } },
    })
    const yachtByName = Object.fromEntries(
      yachts.map(y => [y.name.toLowerCase().trim(), y])
    )

    const results: { row: number; status: 'created' | 'error'; title?: string; error?: string }[] = []

    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i].trim()
      // skip blank lines and reference section lines
      if (!raw || raw.startsWith('"---') || raw.startsWith('---')) continue

      const cols = parseRow(lines[i]).map(c => c.replace(/^"|"$/g, ''))
      const get  = (name: string) => cols[idx(name)]?.trim() ?? ''

      const title         = get('title')
      const yachtName     = get('yachtname')
      const startDate     = get('startdate')
      const endDate       = get('enddate')
      const destination   = get('destination')
      const region        = get('region')
      const departurePort = get('departureport')
      const arrivalPort   = get('arrivalport')
      const description   = get('description')

      if (!title || !yachtName || !startDate || !endDate || !destination) {
        results.push({ row: i + 1, status: 'error', error: 'Missing required fields' })
        continue
      }

      const yacht = yachtByName[yachtName.toLowerCase()]
      if (!yacht) {
        results.push({ row: i + 1, status: 'error', title, error: `Yacht "${yachtName}" not found` })
        continue
      }

      const start = new Date(startDate)
      const end   = new Date(endDate)
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        results.push({ row: i + 1, status: 'error', title, error: 'Invalid date format (use YYYY-MM-DD)' })
        continue
      }
      if (end <= start) {
        results.push({ row: i + 1, status: 'error', title, error: 'endDate must be after startDate' })
        continue
      }

      const totalCabins = yacht.cabins.length || yacht.cabinCount

      try {
        await db.openTrip.create({
          data: {
            title,
            description:   description || null,
            yachtId:       yacht.id,
            startDate:     start,
            endDate:       end,
            destination,
            region:        region || null,
            departurePort: departurePort || null,
            arrivalPort:   arrivalPort || null,
            pricePerCabin: 0,
            maxCapacity:   totalCabins,
            status:        'open',
          },
        })
        results.push({ row: i + 1, status: 'created', title })
      } catch (e) {
        results.push({ row: i + 1, status: 'error', title, error: String(e) })
      }
    }

    const created = results.filter(r => r.status === 'created').length
    const errors  = results.filter(r => r.status === 'error').length

    return NextResponse.json({ created, errors, results }, { status: 200 })
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json({ error: 'Failed to process CSV' }, { status: 500 })
  }
}
