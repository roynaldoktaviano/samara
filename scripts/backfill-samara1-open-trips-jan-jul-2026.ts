/**
 * One-off backfill: historical Samara I booking data for Jan–Jul 2026, sourced from
 * "Open Invoice and Booking List Trip 2026 - SAMARA 1.csv" (Aug 2026 onward was already
 * entered manually through the app before this script was written).
 *
 * Reviewed and confirmed row-by-row with the user before running — see conversation
 * for the full reconciliation (agent name matching, sales rep remapping, extra-bed
 * handling, the Susan Bouckaert gross-price special case, etc).
 *
 * Safety: the whole import runs inside a single Prisma transaction — if anything
 * fails partway, everything rolls back and the database is left untouched. Also
 * guarded by an upfront check that no bookings already exist for Samara I in this
 * date range (would indicate this script — or a manual entry — already ran).
 *
 * Run: npx tsx scripts/backfill-samara1-open-trips-jan-jul-2026.ts
 * Dry run only (no writes): npx tsx scripts/backfill-samara1-open-trips-jan-jul-2026.ts --dry-run
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const YACHT_NAME = 'Samara I'
const CODE_PREFIX_OT = 'SL1-ST-'
const CODE_PREFIX_PC = 'SL1-PC-'

type CabinAlloc = { cabin: string; pax: number; extraBed?: 'cabin' | 'service' }

type BookingDef = {
  guest: string
  agent: string | null // resolved DB agent name, or null = Direct
  sales: string // resolved DB user name
  cabins: CabinAlloc[] // empty for Private Charter
  pax?: number // Private Charter total pax
  total: number
  dep: number
  status: 'fully_paid' | 'partially_paid' | 'pending' | 'cancelled'
  idrTotal?: number // raw Rupiah total from CSV, when settled in IDR
  notes?: string
  cancelReason?: string
  customerExtra?: { email?: string; phone?: string; nationality?: string }
  agentEmail?: string // only used when creating a brand-new agent
  agentCommissionPrivate?: number
}

type TripDef = {
  no: number
  type: 'Sharing' | 'Private'
  startDate: string
  endDate: string
  bookings: BookingDef[]
}

const TRIPS: TripDef[] = [
  { no: 1, type: 'Sharing', startDate: '2026-01-08', endDate: '2026-01-10', bookings: [
    { guest: 'Sebastian', agent: null, sales: 'Efrinda', cabins: [{ cabin: 'Kelor', pax: 2 }], total: 3390.50, dep: 3390.50, status: 'fully_paid' },
    { guest: 'Kelsie Morris', agent: null, sales: 'Efrinda', cabins: [{ cabin: 'Padar', pax: 1 }], total: 1905, dep: 1905, status: 'fully_paid' },
  ]},
  { no: 2, type: 'Sharing', startDate: '2026-03-14', endDate: '2026-03-17', bookings: [
    { guest: 'Tracey Bennewies', agent: null, sales: 'Laika', cabins: [{ cabin: 'Padar', pax: 2 }], total: 2930, dep: 2930, status: 'fully_paid' },
    { guest: 'Nathan Christopher Siebel', agent: null, sales: 'Efrinda', cabins: [{ cabin: 'Komodo', pax: 2 }], total: 2690, dep: 2690, status: 'fully_paid' },
    { guest: 'Sundeep Katasani', agent: 'Rainforest Cruises', sales: 'Laika', cabins: [{ cabin: 'Kelor', pax: 2 }, { cabin: 'Kanawa', pax: 2 }], total: 5026, dep: 5026, status: 'fully_paid' },
  ]},
  { no: 3, type: 'Sharing', startDate: '2026-03-22', endDate: '2026-03-24', bookings: [
    { guest: 'Mira & Nadim Tohme', agent: null, sales: 'Efrinda', cabins: [{ cabin: 'Kelor', pax: 2 }], total: 1955, dep: 1955, status: 'fully_paid' },
    { guest: 'Romy Backus', agent: 'Rainforest Cruises', sales: 'Laika', cabins: [{ cabin: 'Padar', pax: 2 }], total: 1676.75, dep: 1676.75, status: 'fully_paid' },
  ]},
  { no: 4, type: 'Sharing', startDate: '2026-03-26', endDate: '2026-03-29', bookings: [
    { guest: 'Karen Van Haarlem', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Kelor', pax: 2 }], total: 2930, dep: 2930, status: 'fully_paid' },
    { guest: 'Joanne Eldridge', agent: null, sales: 'Efrinda', cabins: [{ cabin: 'Padar', pax: 2 }], total: 2930, dep: 2930, status: 'cancelled', cancelReason: 'Trip cancelled — payment non-refundable (per original booking notes)', notes: 'CC Link Flywire' },
    { guest: 'Louis Lebel', agent: null, sales: 'Laika', cabins: [{ cabin: 'Kanawa', pax: 2 }], total: 2930, dep: 830, status: 'cancelled', cancelReason: 'Trip cancelled — payment non-refundable (per original booking notes); only DP was collected', notes: 'DP to DBS Hongkong' },
  ]},
  { no: 5, type: 'Sharing', startDate: '2026-03-31', endDate: '2026-04-02', bookings: [
    { guest: 'Leonor Martinez & Alejandro Robles', agent: 'Wow Travel', sales: 'Efrinda', cabins: [{ cabin: 'Kelor', pax: 2 }], total: 1676.75, dep: 1676.75, status: 'fully_paid' },
    { guest: 'Jonathan Millet', agent: null, sales: 'Laika', cabins: [{ cabin: 'Padar', pax: 1 }, { cabin: 'Kanawa', pax: 2 }], total: 3860, dep: 3860, status: 'fully_paid' },
    { guest: 'Sarah Baldock & family', agent: null, sales: 'Laika', cabins: [{ cabin: 'Rinca', pax: 2 }, { cabin: 'Komodo', pax: 2 }], total: 3575, dep: 3575, status: 'fully_paid' },
  ]},
  { no: 6, type: 'Sharing', startDate: '2026-04-04', endDate: '2026-04-06', bookings: [
    { guest: 'Desmond Sean Fennell', agent: null, sales: 'Laika', cabins: [{ cabin: 'Kelor', pax: 2 }, { cabin: 'Kanawa', pax: 2 }], total: 3910, dep: 3910, status: 'fully_paid' },
    { guest: 'Drury & Connor Family', agent: null, sales: 'Laika', cabins: [{ cabin: 'Padar', pax: 2 }, { cabin: 'Rinca', pax: 2 }, { cabin: 'Komodo', pax: 3, extraBed: 'cabin' }], total: 6355, dep: 6355, status: 'fully_paid' },
  ]},
  { no: 7, type: 'Sharing', startDate: '2026-04-09', endDate: '2026-04-11', bookings: [
    { guest: 'Nicola & William Lakeman', agent: null, sales: 'Efrinda', cabins: [{ cabin: 'Kelor', pax: 2 }], total: 1855, dep: 1855, status: 'fully_paid' },
    { guest: 'Jose Luis de Zubicaray', agent: 'Pirates Bay Cruising by PT. Blue Nirvana', sales: 'Laika', cabins: [{ cabin: 'Rinca', pax: 3, extraBed: 'cabin' }], total: 2241, dep: 2241, status: 'fully_paid' },
    { guest: 'Lauren', agent: 'Khiri Travel', sales: 'Efrinda', cabins: [{ cabin: 'Kanawa', pax: 2 }], total: 1534, dep: 1534, status: 'fully_paid', idrTotal: 25_771_200 },
    { guest: 'Emma Purdon', agent: null, sales: 'Laika', cabins: [{ cabin: 'Komodo', pax: 3, extraBed: 'cabin' }], total: 2610, dep: 2610, status: 'fully_paid' },
    { guest: 'Stefano Miggiano', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Padar', pax: 3, extraBed: 'service' }], total: 1820, dep: 1820, status: 'fully_paid' },
  ]},
  { no: 8, type: 'Sharing', startDate: '2026-04-13', endDate: '2026-04-16', bookings: [
    { guest: 'Pablo Sánchez Nieto', agent: 'Nomnia Travel', sales: 'Laika', cabins: [{ cabin: 'Padar', pax: 2 }], total: 2363, dep: 2363, status: 'fully_paid' },
    { guest: 'Jasmine Bhinder', agent: null, sales: 'Laika', cabins: [{ cabin: 'Kelor', pax: 2 }, { cabin: 'Rinca', pax: 2 }], total: 5620, dep: 5620, status: 'fully_paid' },
    { guest: 'Rafael Souza', agent: null, sales: 'Caroline', cabins: [{ cabin: 'Kanawa', pax: 2 }], total: 2930, dep: 2930, status: 'fully_paid' },
    { guest: 'Marcel & Linda Heinze', agent: 'Go Vacation', sales: 'Efrinda', cabins: [{ cabin: 'Komodo', pax: 2 }], total: 2309, dep: 2309, status: 'fully_paid', idrTotal: 39_222_983 },
  ]},
  { no: 9, type: 'Sharing', startDate: '2026-04-18', endDate: '2026-04-20', bookings: [
    { guest: 'James & Gillian James', agent: 'ICS Travel', sales: 'Efrinda', cabins: [{ cabin: 'Kelor', pax: 2 }], total: 1676.75, dep: 1676.75, status: 'fully_paid', idrTotal: 27_426_600 },
    { guest: 'Alison Pringle', agent: 'Rainforest Cruises', sales: 'Laika', cabins: [{ cabin: 'Padar', pax: 2 }], total: 1676.75, dep: 1676.75, status: 'fully_paid' },
    { guest: 'Vandeputte', agent: 'Top Indonesia Holiday', sales: 'Efrinda', cabins: [{ cabin: 'Kanawa', pax: 2 }], total: 1576.75, dep: 1576.75, status: 'fully_paid' },
    { guest: 'Annette & Rebecka', agent: 'Yacth Marketing Agency', sales: 'Efrinda', cabins: [{ cabin: 'Rinca', pax: 2 }], total: 1536.50, dep: 1536.50, status: 'fully_paid' },
    { guest: 'Xindi Yu & Sissi Sun', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Komodo', pax: 2 }], total: 1621, dep: 1621, status: 'fully_paid' },
  ]},
  { no: 10, type: 'Sharing', startDate: '2026-04-22', endDate: '2026-04-25', bookings: [
    { guest: 'Sharon & Tom Hall', agent: null, sales: 'Laika', cabins: [{ cabin: 'Kelor', pax: 2 }], total: 2930, dep: 2930, status: 'fully_paid' },
    { guest: 'Michael Bolliger', agent: null, sales: 'Caroline', cabins: [{ cabin: 'Padar', pax: 2 }, { cabin: 'Kanawa', pax: 2 }], total: 5004, dep: 5004, status: 'fully_paid' },
  ]},
  { no: 11, type: 'Sharing', startDate: '2026-04-27', endDate: '2026-04-29', bookings: [
    { guest: 'De Wilde Mariane & Bertossi Pascal', agent: null, sales: 'Laika', cabins: [{ cabin: 'Kelor', pax: 2 }], total: 1955, dep: 1955, status: 'fully_paid' },
    { guest: 'Zihui Tan', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Padar', pax: 2 }], total: 1770, dep: 1753, status: 'fully_paid', notes: 'BP will paid onboard — CSV nyisain balance $17 walau status PAID' },
    { guest: 'Mads Werner', agent: null, sales: 'Efrinda', cabins: [{ cabin: 'Kanawa', pax: 2 }, { cabin: 'Rinca', pax: 2 }], total: 3340.50, dep: 3340.50, status: 'fully_paid' },
  ]},
  { no: 12, type: 'Sharing', startDate: '2026-05-01', endDate: '2026-05-03', bookings: [
    { guest: 'Karolina Astaman', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Kelor', pax: 2 }, { cabin: 'Kanawa', pax: 2 }], total: 3910, dep: 3910, status: 'fully_paid', idrTotal: 64_910_024 },
    { guest: 'Susan Margaret Hones', agent: null, sales: 'Laika', cabins: [{ cabin: 'Padar', pax: 1 }], total: 1955, dep: 1955, status: 'fully_paid' },
  ]},
  { no: 13, type: 'Sharing', startDate: '2026-05-05', endDate: '2026-05-08', bookings: [
    { guest: 'Maria Fadul', agent: 'Dive concept', sales: 'Efrinda', cabins: [{ cabin: 'Kelor', pax: 2 }], total: 2363, dep: 2363, status: 'fully_paid', idrTotal: 38_646_865 },
    { guest: 'Ricardo Matsumoto Tommasini', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Padar', pax: 2 }], total: 2930, dep: 2930, status: 'fully_paid' },
    { guest: 'Katie', agent: null, sales: 'Efrinda', cabins: [{ cabin: 'Kanawa', pax: 2 }, { cabin: 'Rinca', pax: 2 }], total: 5620, dep: 5620, status: 'fully_paid' },
  ]},
  { no: 14, type: 'Sharing', startDate: '2026-05-10', endDate: '2026-05-13', bookings: [
    { guest: 'Sarah Joyce', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Kelor', pax: 2 }], total: 2930, dep: 2930, status: 'fully_paid' },
    { guest: 'Marina Erthal Thuler', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Padar', pax: 2 }], total: 2930, dep: 2930, status: 'fully_paid' },
  ]},
  { no: 15, type: 'Sharing', startDate: '2026-05-15', endDate: '2026-05-18', bookings: [
    { guest: 'Eve Chen', agent: null, sales: 'Laika', cabins: [{ cabin: 'Padar', pax: 2 }], total: 2780, dep: 2780, status: 'fully_paid' },
    { guest: 'Matti Dickinson', agent: 'Yacth Marketing Agency', sales: 'Efrinda', cabins: [{ cabin: 'Kelor', pax: 2 }], total: 2780, dep: 2780, status: 'fully_paid' },
    { guest: 'Lorraine Gambassi', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Kanawa', pax: 2 }], total: 4160, dep: 4160, status: 'fully_paid' },
  ]},
  { no: 16, type: 'Sharing', startDate: '2026-05-21', endDate: '2026-05-24', bookings: [
    { guest: 'Juliet Davis', agent: 'Rainforest Cruises', sales: 'Laika', cabins: [{ cabin: 'Rinca', pax: 2 }], total: 2309, dep: 2309, status: 'fully_paid' },
    { guest: 'Julia Brand', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Padar', pax: 2 }], total: 2930, dep: 2930, status: 'fully_paid' },
    { guest: 'Anne Marie Henriette', agent: null, sales: 'Laika', cabins: [{ cabin: 'Kelor', pax: 2 }], total: 2930, dep: 2930, status: 'fully_paid' },
    { guest: 'Margaret and Timothy Rees', agent: 'ICS Travel', sales: 'Efrinda', cabins: [{ cabin: 'Kanawa', pax: 2 }], total: 2513, dep: 2513, status: 'fully_paid', idrTotal: 42_693_357 },
    { guest: 'Daniel Holmedahl', agent: null, sales: 'Laika', cabins: [{ cabin: 'Komodo', pax: 2 }], total: 2400, dep: 2400, status: 'fully_paid', notes: 'CSV kolom Agent diisi nama tamu sendiri — dicatat Direct' },
  ]},
  { no: 17, type: 'Private', startDate: '2026-05-26', endDate: '2026-05-30', bookings: [
    { guest: 'Regis Lelong', agent: null, sales: 'Wiwin', cabins: [], pax: 12, total: 18400, dep: 18400, status: 'fully_paid', notes: 'TNK will pay onboard' },
  ]},
  { no: 18, type: 'Sharing', startDate: '2026-06-02', endDate: '2026-06-05', bookings: [
    { guest: 'Ria Advani', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Kelor', pax: 2 }, { cabin: 'Kanawa', pax: 2 }], total: 5860, dep: 5860, status: 'fully_paid' },
    { guest: 'Camilla Hamillton', agent: 'The Yacht Club Indonesia', sales: 'Efrinda', cabins: [{ cabin: 'Padar', pax: 2 }], total: 2780, dep: 2780, status: 'fully_paid' },
    { guest: 'India Kelly', agent: 'Top Indonesia Holiday', sales: 'Efrinda', cabins: [{ cabin: 'Rinca', pax: 2 }], total: 2159, dep: 2159, status: 'fully_paid' },
    { guest: 'Adam Willis', agent: null, sales: 'Laika', cabins: [{ cabin: 'Komodo', pax: 2 }], total: 2690, dep: 2690, status: 'fully_paid' },
  ]},
  { no: 19, type: 'Sharing', startDate: '2026-06-09', endDate: '2026-06-12', bookings: [
    { guest: 'Alexia Honegger', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Kelor', pax: 2 }, { cabin: 'Kanawa', pax: 2 }], total: 5860, dep: 5860, status: 'fully_paid' },
  ]},
  { no: 20, type: 'Sharing', startDate: '2026-06-14', endDate: '2026-06-17', bookings: [
    { guest: 'Sabrina', agent: null, sales: 'Efrinda', cabins: [{ cabin: 'Kanawa', pax: 1 }], total: 2855, dep: 2855, status: 'fully_paid' },
    { guest: 'Megan Johnson & Maya Rose', agent: null, sales: 'Laika', cabins: [{ cabin: 'Kelor', pax: 2 }], total: 2925, dep: 2925, status: 'fully_paid' },
    { guest: 'Marcel Twohig & family', agent: null, sales: 'Laika', cabins: [{ cabin: 'Padar', pax: 2 }, { cabin: 'Rinca', pax: 3, extraBed: 'cabin' }], total: 6850, dep: 6850, status: 'fully_paid' },
    { guest: 'Dimitri Jacques Lucien Francois', agent: null, sales: 'Efrinda', cabins: [{ cabin: 'Komodo', pax: 2 }], total: 2361, dep: 2361, status: 'fully_paid' },
  ]},
  { no: 21, type: 'Sharing', startDate: '2026-06-19', endDate: '2026-06-23', bookings: [
    { guest: 'Callie Gray', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Kelor', pax: 2 }], total: 3910, dep: 3910, status: 'fully_paid' },
    { guest: 'Ayush N', agent: null, sales: 'Laika', cabins: [{ cabin: 'Padar', pax: 2 }], total: 3710, dep: 3710, status: 'fully_paid', idrTotal: 62_966_120 },
    { guest: 'Alix Roquette Jouffroy', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Rinca', pax: 2 }], total: 3247, dep: 3247, status: 'fully_paid', idrTotal: 55_958_570 },
    { guest: 'Maria Sullivan', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Kanawa', pax: 2 }], total: 3539, dep: 3539, status: 'fully_paid' },
  ]},
  { no: 22, type: 'Private', startDate: '2026-06-26', endDate: '2026-06-29', bookings: [
    { guest: 'Chamoy Family', agent: 'Khiri Travel', sales: 'Efrinda', cabins: [], pax: 10, total: 11040, dep: 11040, status: 'fully_paid', idrTotal: 183_396_480 },
  ]},
  { no: 23, type: 'Private', startDate: '2026-07-03', endDate: '2026-07-07', bookings: [
    {
      guest: 'Susan Bouckaert', agent: 'Seven Seas', sales: 'Wiwin', cabins: [], pax: 11,
      total: 19500, dep: 19500, status: 'fully_paid', idrTotal: 325_600_000,
      notes: 'Boat Rate $4,600/night × 4 = $18,400 + Komodo NP entrance fee $100/pax × 11 = $1,100. Grand Total Published Rate $19,500 — 20% agent commission ($3,680) payable to agent after trip completion, not deducted from guest total.',
      customerExtra: { email: undefined, phone: '+6282146893404', nationality: 'Australian' },
      agentEmail: 'guteri@thesevenseas.net', agentCommissionPrivate: 20,
    },
  ]},
  { no: 24, type: 'Private', startDate: '2026-07-11', endDate: '2026-07-15', bookings: [
    { guest: 'Louise Holden', agent: null, sales: 'Wiwin', cabins: [], pax: 8, total: 19200, dep: 19200, status: 'fully_paid' },
  ]},
  { no: 25, type: 'Sharing', startDate: '2026-07-17', endDate: '2026-07-20', bookings: [
    { guest: 'Vanessa Yawn', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Kelor', pax: 2 }, { cabin: 'Padar', pax: 2 }], total: 5860, dep: 5860, status: 'fully_paid' },
    { guest: 'Harrison & Jones', agent: 'Pirates Bay Cruising by PT. Blue Nirvana', sales: 'Laika', cabins: [{ cabin: 'Kanawa', pax: 2 }], total: 2513, dep: 2513, status: 'fully_paid' },
    { guest: 'Oliver Christoph Peter Kuntze', agent: 'Abercrombie & Kent DMC Indonesia', sales: 'Efrinda', cabins: [{ cabin: 'Komodo', pax: 2 }, { cabin: 'Rinca', pax: 2 }], total: 4618, dep: 4618, status: 'fully_paid', idrTotal: 77_508_512 },
  ]},
  { no: 26, type: 'Sharing', startDate: '2026-07-22', endDate: '2026-07-24', bookings: [
    { guest: 'Lotte Kerremans', agent: 'Oceanic Escape', sales: 'Dwi', cabins: [{ cabin: 'Komodo', pax: 2 }, { cabin: 'Rinca', pax: 3, extraBed: 'cabin' }], total: 4150, dep: 4150, status: 'fully_paid' },
    { guest: 'Nicole Alvarez', agent: null, sales: 'Wiwin', cabins: [{ cabin: 'Kelor', pax: 2 }, { cabin: 'Padar', pax: 2 }], total: 3910, dep: 3910, status: 'fully_paid' },
    { guest: 'Chloe Rageau & Carole Lucienne', agent: null, sales: 'Laika', cabins: [{ cabin: 'Kanawa', pax: 2 }], total: 1955, dep: 1955, status: 'fully_paid' },
  ]},
  { no: 27, type: 'Private', startDate: '2026-07-28', endDate: '2026-08-01', bookings: [
    { guest: 'Myriam & Bjoern Jost', agent: 'Ultimate Indonesia Yacht (UIY)', sales: 'Dwi', cabins: [], pax: 5, total: 14260, dep: 14260, status: 'fully_paid' },
  ]},
]

async function nextVal(tx: any, key: string): Promise<number> {
  const result = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "Counter" (key, value)
    VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE
    SET value = "Counter".value + 1
    RETURNING value
  `
  return Number(result[0].value)
}

async function generateBookingCode(tx: any, prefix: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const num = await nextVal(tx, `booking:${prefix}`)
    const code = `${prefix}${String(num).padStart(4, '0')}`
    const exists = await tx.booking.findUnique({ where: { bookingCode: code }, select: { id: true } })
    if (!exists) return code
  }
  throw new Error(`Failed to generate unique booking code for prefix ${prefix}`)
}

async function findOrCreateCustomer(tx: any, name: string, extra?: BookingDef['customerExtra']) {
  const existing = await tx.customer.findFirst({ where: { name, deletedAt: null } })
  if (existing) return existing
  return tx.customer.create({
    data: {
      name,
      email: extra?.email ?? null,
      phone: extra?.phone ?? null,
      nationality: extra?.nationality ?? null,
    },
  })
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const yacht = await db.yacht.findFirst({ where: { name: YACHT_NAME }, include: { cabins: true } })
  if (!yacht) throw new Error(`Yacht "${YACHT_NAME}" not found`)
  const cabinByName = new Map(yacht.cabins.map(c => [c.name.replace(/\s*Cabin$/i, ''), c]))

  const salesUsers = await db.user.findMany({ where: { name: { in: ['Efrinda', 'Laika', 'Wiwin', 'Caroline', 'Dwi'] } } })
  const salesByName = new Map(salesUsers.map(u => [u.name, u]))
  for (const n of ['Efrinda', 'Laika', 'Wiwin', 'Caroline', 'Dwi']) {
    if (!salesByName.has(n)) throw new Error(`Sales user "${n}" not found`)
  }

  // Safety guard: abort if anything already exists for Samara I in this window
  const clash = await db.booking.count({
    where: { yachtId: yacht.id, startDate: { gte: new Date('2026-01-01'), lt: new Date('2026-08-02') } },
  })
  if (clash > 0) {
    throw new Error(`Found ${clash} existing Samara I booking(s) already in Jan 1 – Aug 2 2026 — aborting to avoid duplicates. Investigate before re-running.`)
  }

  const agentNames = new Set<string>()
  for (const t of TRIPS) for (const b of t.bookings) if (b.agent) agentNames.add(b.agent)

  const stats = { openTrips: 0, bookings: 0, guests: 0, cancelled: 0, agentsCreated: 0 }

  const run = async (tx: any) => {
    // Resolve/create agents up front — fail loudly if an expected existing agent is missing
    // (a typo here would silently create a duplicate agent record).
    const agentByName = new Map<string, { id: string }>()
    for (const name of agentNames) {
      let agent = await tx.agent.findFirst({ where: { name } })
      if (!agent) {
        if (name === 'Seven Seas') {
          const src = TRIPS.flatMap(t => t.bookings).find(b => b.agent === 'Seven Seas')
          agent = await tx.agent.create({
            data: {
              name: 'Seven Seas',
              email: src?.agentEmail ?? null,
              commissionPrivateCharter: src?.agentCommissionPrivate ?? 0,
            },
          })
          stats.agentsCreated++
          console.log(`[agent] created "Seven Seas" (${agent.id})`)
        } else {
          throw new Error(`Expected existing agent "${name}" not found — check the name mapping before re-running.`)
        }
      }
      agentByName.set(name, agent)
    }

    for (const trip of TRIPS) {
      let openTripId: string | null = null

      if (trip.type === 'Sharing') {
        const start = new Date(trip.startDate)
        const end = new Date(trip.endDate)
        const nights = Math.round((end.getTime() - start.getTime()) / 86_400_000)
        const mm = String(start.getMonth() + 1).padStart(2, '0')
        const title = `Open Trip Komodo ${nights + 1}D${nights}N - ${mm}/${start.getFullYear()}`

        const openTrip = await tx.openTrip.create({
          data: {
            title,
            yachtId: yacht.id,
            startDate: start,
            endDate: end,
            destination: 'Komodo National Park',
            departurePort: 'Labuan Bajo',
            arrivalPort: 'Labuan Bajo',
            region: 'Nusa Tenggara',
            pricePerCabin: 0,
            maxCapacity: yacht.cabins.length,
            status: 'open',
          },
        })
        openTripId = openTrip.id
        stats.openTrips++
        console.log(`[open-trip #${trip.no}] ${title} (${trip.startDate} → ${trip.endDate}) — ${openTrip.id}`)
      }

      for (const b of trip.bookings) {
        const lead = await findOrCreateCustomer(tx, b.guest, b.customerExtra)

        const guestDefs: { customerId: string; cabinId: string | null }[] = []
        const extraBedNotes: string[] = []

        if (trip.type === 'Sharing') {
          let firstPax = true
          let tbdCounter = 0
          for (const alloc of b.cabins) {
            const cabin = cabinByName.get(alloc.cabin)
            if (!cabin) throw new Error(`Cabin "${alloc.cabin}" not found on ${YACHT_NAME}`)
            for (let i = 0; i < alloc.pax; i++) {
              let customerId: string
              if (firstPax) {
                customerId = lead.id
                firstPax = false
              } else {
                tbdCounter++
                const tbdName = `${b.guest} TBD ${tbdCounter}`
                const tbd = await findOrCreateCustomer(tx, tbdName)
                customerId = tbd.id
              }
              guestDefs.push({ customerId, cabinId: cabin.id })
            }
            if (alloc.extraBed === 'cabin') extraBedNotes.push(`Extra bed ×1 (${cabin.name})`)
          }
        } else {
          const totalPax = b.pax ?? 1
          for (let i = 0; i < totalPax; i++) {
            const customerId = i === 0 ? lead.id : (await findOrCreateCustomer(tx, `${b.guest} TBD ${i}`)).id
            guestDefs.push({ customerId, cabinId: null })
          }
        }

        const currency = b.idrTotal ? 'IDR' : 'USD'
        const exchangeRate = b.idrTotal ? Number((b.idrTotal / b.total).toFixed(2)) : null

        const noteParts = [b.notes]
        if (extraBedNotes.length) noteParts.push(`[Extra Beds] ${extraBedNotes.join(', ')}`)
        const notes = noteParts.filter(Boolean).join('\n') || null

        const prefix = trip.type === 'Sharing' ? CODE_PREFIX_OT : CODE_PREFIX_PC
        const bookingCode = await generateBookingCode(tx, prefix)
        const sales = salesByName.get(b.sales)!
        const agent = b.agent ? agentByName.get(b.agent) : null

        const booking = await tx.booking.create({
          data: {
            bookingCode,
            customerId: lead.id,
            agentId: agent?.id ?? null,
            openTripId,
            source: agent ? 'AGENT' : 'DIRECT',
            tripType: trip.type === 'Sharing' ? 'OPEN_TRIP' : 'PRIVATE_CHARTER',
            yachtId: yacht.id,
            startDate: new Date(trip.startDate),
            endDate: new Date(trip.endDate),
            destination: 'Komodo National Park',
            status: b.status,
            totalPrice: b.total,
            depositPaid: b.dep,
            guestCount: guestDefs.length,
            notes,
            cancelReason: b.cancelReason ?? null,
            currency,
            exchangeRate,
            salesperson: sales.name,
            salespersonId: sales.id,
            guests: { create: guestDefs.map(g => ({ customerId: g.customerId, cabinId: g.cabinId, isLead: g.customerId === lead.id })) },
            services: b.cabins.some(c => c.extraBed === 'service')
              ? { create: [{ name: `Extra Bed (${b.cabins.find(c => c.extraBed === 'service')!.cabin})`, price: 0, quantity: 1 }] }
              : undefined,
          },
          select: { id: true, bookingCode: true },
        })

        stats.bookings++
        stats.guests += guestDefs.length
        if (b.status === 'cancelled') stats.cancelled++
        console.log(`  [booking] ${booking.bookingCode} — ${b.guest} (${guestDefs.length} guest${guestDefs.length > 1 ? 's' : ''}, $${b.total}, ${b.status})`)
      }
    }
  }

  if (dryRun) {
    console.log('--- DRY RUN: rolling back after planning, nothing persisted ---')
    await db.$transaction(async (tx) => {
      await run(tx)
      throw new Error('__DRY_RUN_ROLLBACK__')
    }, { timeout: 120_000 }).catch(e => {
      if (e.message !== '__DRY_RUN_ROLLBACK__') throw e
    })
  } else {
    await db.$transaction(run, { timeout: 120_000 })
  }

  console.log('\n=== Summary ===')
  console.log(stats)
  console.log(dryRun ? '(dry run — nothing was written)' : 'Done.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
