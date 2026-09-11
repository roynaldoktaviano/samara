// MOCKUP ONLY — not wired to real DB/API. Local state + seed data, for design review.
// If approved, this becomes the blueprint for the real Document Version Control module
// (schema: DocumentTemplate + DocumentTemplateVersion + document snapshot on Payment/Booking).
'use client'

import { useState } from 'react'
import {
  FileText, Clock, ChevronRight, X, Eye, CheckCircle2,
  History, Plus, Search, ArrowLeft, ShieldCheck, Link2, AlertCircle, Download, Printer,
} from 'lucide-react'
import { buildPreviewHtml } from './pdfPreview'

type Version = {
  id: string
  number: number
  date: string
  by: string
  notes: string
  active: boolean
  content: string
}

type DocTemplate = {
  id: string
  name: string
  category: 'Legal' | 'Booking' | 'Finance' | 'Agent'
  versions: Version[]
  variableNote?: string
}

type GeneratedDoc = {
  id: string
  docType: string
  refNumber: string
  bookingCode: string
  generatedAt: string
  generatedBy: string
  templateName: string
  templateVersion: number
}

const CATEGORY_COLOR: Record<DocTemplate['category'], string> = {
  Legal: 'bg-red-100 text-red-700',
  Booking: 'bg-blue-100 text-blue-700',
  Finance: 'bg-emerald-100 text-emerald-700',
  Agent: 'bg-purple-100 text-purple-700',
}

// Real T&C copy sourced from src/app/print/invoice/[id]/page.tsx (the "TNC_FULL" text below is
// pulled verbatim from the invoice's hardcoded T&C pages) — used here as content only, this
// mockup is NOT wired back to that print page.
const TNC_FULL = `TERMS & CONDITIONS

Preamble
These Terms and Conditions ("T&C") govern all bookings and services provided to or by Samara Yachting and all its subsidiaries or partners (the "Principal") for yacht charters. These terms are binding for all clients who engage in these services, either directly or through an authorized Travel Agency ("Agency"). By confirming a booking and/or making payment, the Guest acknowledges and agrees to these T&C.

1. Roles and Responsibilities
1.1. **Principal and Operator:** Samara Yachting acts as the commercial principal and/or chartering entity. The operational management of the vessel is carried out by the Operator.
1.2. **Travel Agent:** Where a booking is made through a Travel Agent, the Agency acts solely as an intermediary between the Guest and the Principal. The Travel Agent does not own, operate, manage, or control the vessel, crew, or maritime operations and shall not be considered a contractual carrier or service provider.

2. Hierarchy of Documents
In the event of any inconsistency between: a) the signed Charter Contract, b) these Terms & Conditions, and c) any marketing material, brochure, website content, or Agency communication — the provisions of the signed Charter Contract shall prevail, followed by these Terms & Conditions.

3. Cruise Type
3.1. **Private Charter:** The entire vessel is chartered exclusively by one group. Guests enjoy full use of all cabins, crew, and a custom itinerary. Activities include island hopping, snorkeling, and leisure cruising.
3.2. **Open Trip (FIT):** Guests book individual cabins for 2 guests (extra beds available) and share the vessel and program with other travelers on a fixed schedule. Open Trips will operate as scheduled once a minimum booking of three (3) cabins is reached. If the minimum booking is not reached, the booking may be moved to the next available schedule, and guests will be informed in advance.

4. Check-In and Check-Out Times
4.1. **Check-In:** Boarding begins at 10:00 AM on the first day of the trip. Guests are strongly encouraged to arrive at the destination one day in advance to avoid delays.
4.2. **Check-Out:** Disembarkation is scheduled around 2:00 PM on the final day of the cruise.
4.3. For Private Charters, check-in and check-out times may vary depending on the customized itinerary and flight schedules, as agreed upon in advance with the Principal.

5. Bookings and Payments
Charters and FIT below USD 5,000.- per night:
5.1. **Deposit:** A non-refundable deposit of 30% is required within 3 days of booking to confirm a reservation.
5.2. **Balance Payment:** The remaining 70% must be paid at least 30 days before the departure date.
5.3. **Short-Notice Bookings:** For bookings made within 30 days of departure, full payment is required at the time of booking.
Charters and FIT above USD 5,000.- per night:
5.4. **Deposit:** A non-refundable deposit of 30% is required within 3 days of booking to confirm a reservation.
5.5. **Balance Payment:** The remaining 70% must be paid at least 90 days before the departure date.
5.6. **Short-Notice Bookings:** For bookings made within 90 days of departure, full payment is required at the time of booking.
General Payment Rules:
5.7. **Failure to Pay:** If payment deadlines are not met, the booking may be canceled without refund of previous payments.
5.8. **Payment Methods:** Payment may be made by bank transfer or credit card. Credit card payments incur a 3% processing fee. All bank charges are the responsibility of the guest or agent.
5.9. **Payment Instructions:** All payments must be made to the official bank account in the currency specified in the invoice issued by the Principal.

6. Cancellations and Refunds
FIT — 6.1. **More than 30 days before departure:** Payments are refundable minus the 30% deposit. 6.2. **30 days or less before departure:** No refund.
Charters — 6.3. **More than 90 days before departure:** Payments are refundable minus the 30% deposit. 6.4. **90 days or less before departure:** No refund.

7. General Policies
7.1. **General Refund Policy:** Payments are generally non-refundable. However, the Principal may, acting reasonably and in good faith, assist with rescheduling or offering alternative solutions where possible. No obligation or precedent is created.
7.2. **Force Majeure:** In cases of force majeure, including but not limited to natural disasters, or similar uncontrollable events, adverse sea conditions, port closures, government restrictions, or safety-related decisions, the Principal may offer rescheduling or alternative arrangements at its discretion.
7.3. Weather conditions at sea are unpredictable. Rain, swell, or cloudiness may occur and are not grounds for refund or cancellation.

8. Rescheduling
8.1. **Discretionary Rescheduling:** While our policies are firm to ensure fairness and operational consistency, the Principal may, at its sole discretion, choose to offer alternative solutions in extraordinary cases. Any exception granted is made without obligation and does not set a precedent.

9. Illness Before or During the Trip
9.1. **Prior to Trip:** The cancellation policy remains in effect. No refunds are granted unless covered by travel insurance.
9.2. **During Trip:** If a guest falls ill and cannot participate in activities, no refund will be granted. A formal letter may be issued to support a travel insurance claim.

10. General Inclusions and Exclusions
10.1. **Included in the Cruise:** transfers to/from local airport or local hotel; accommodation onboard the Vessel; all meals, snacks, coffee/tea, and mineral water and local beers; scuba diving for certified divers and use of water sports equipment (where available); guided excursions and scheduled activities.
10.2. **Not Included:** alcoholic beverages; domestic flights and hotel accommodations before or after the trip; travel insurance; crew gratuities (suggested at 10% of the trip value); optional activities not listed in the itinerary.
10.3. Specific inclusions vary depending on the vessel and/or trip type. Details might be defined in the Charter Contract in writing.

11. Guest Responsibilities
11.1. Guests must follow all safety instructions provided by the crew.
11.2. Respectful and cooperative behavior toward staff and fellow guests is expected at all times.
11.3. Guests are **financially responsible** for any damage to the vessel or its equipment caused by negligence or misconduct.
11.4. Failure to comply with safety or ecological rules may result in exclusion from activities without refund.

12. Onboard Payments
12.1. Onboard purchases, such as alcoholic drinks or merchandise, can be paid in cash or by credit card (3% surcharge).

13. Diving Activities (if offered)
13.1. Guests must hold a valid dive certification (e.g., PADI Open Water).
13.2. **Dive insurance is mandatory** and must be presented before the first dive.
13.3. A signed liability waiver is required before participating.
13.4. Missed dives for personal or medical reasons are non-refundable.

14. Liability and Indemnity
14.1. **Assumption of Risk:** Guests participate in all onboard and offboard activities at their own risk.
14.2. **Limitation of Liability:** To the maximum extent permitted by applicable law, neither the Principal, its subsidiaries, partners, Agents, employees, nor crew shall be liable for injury, illness, death, loss, damage, delay, or expense arising from slips/trips/falls onboard, participation in snorkeling/diving/swimming/trekking, shore excursions by third parties, guest negligence, loss/theft of belongings, travel disruptions, or incomplete travel documentation/insurance.
14.3. **Gross Negligence:** The Principal shall only be liable where gross negligence or intentional misconduct can be clearly demonstrated.
14.4. **Travel Insurance:** Guests are strongly advised to obtain comprehensive travel and medical insurance.
14.5. **Indemnification:** By participating in the cruise, all Guests agree to fully indemnify, defend, and hold harmless the Principal, its subsidiaries, partners, Agents, employees, and crew from any claims arising from the Guest's actions or omissions.
14.6. **Weather and Itinerary Changes:** The Principal shall comply with all directives issued by port authorities or the Indonesian Coast Guard. The Captain may adjust the route, activities, or schedule at their discretion.

15. Changes and Price Adjustments
15.1. The Principal reserves the right to update brochures, service descriptions, and pricing at any time before a booking is confirmed.
15.2. In very rare cases, price adjustments after booking may occur due to significant increases in fuel/operational costs, new government fees/taxes/port charges, or major exchange rate fluctuations. Guests will be informed and may accept or cancel under applicable terms.

16. Cancellation by the Principal for Guest Misconduct
16.1. The Principal reserves the right to cancel a guest's participation **without refund** if the guest provides false personal information, fails to follow crew instructions/safety procedures, damages the vessel, or endangers themselves, other guests, or marine life.

17. Governing Law
17.1. These Terms & Conditions are governed by the laws of the **Republic of Indonesia**. Any disputes shall be resolved through **mediation or arbitration in Bali**.

18. Acknowledgment and Acceptance
By confirming a booking, the guest acknowledges that they have **read, understood, and agreed** to these Terms and Conditions.

19. Contact
For assistance or inquiries, please contact Samara Yachting.`

const TNC_V2 = TNC_FULL.split('15. Changes and Price Adjustments')[0].trim()
const TNC_V1 = TNC_FULL.split('10. General Inclusions and Exclusions')[0].trim()

// Real C&P copy sourced from src/app/print/agent-agreement/[id]/page.tsx (the annex printed
// alongside the Agent Agreement) — content only, not wired back to that print page. The source
// file literally bakes the version into the title ("2026 - v1.0") with no structured history —
// this is the exact case Document Version Control is meant to replace.
const CP_FULL = `COMMISSION AND PAYMENT TERMS (C&P)
2026 - v1.0

PREAMBLE
These Commission and Payment Terms ("C&P") are an integral part of the Travel Agency Agreement (the "Agreement") entered into between **Samara Yachting** (the "Principal") and the **Agency**. The most recent version of the C&P of the actual Year shall apply at all times. In case of conflict, the provisions of the main Agreement shall take precedence.

1. Nightly Rates Samara 1 Open Trip
Room                              3D2N        4D3N        5D4N
Room Kelor (2 pax)                US$ 1'855   US$ 2'780   US$ 3'710
Room Kanawa (2 pax)                US$ 1'855   US$ 2'780   US$ 3'710
Room Padar (2 pax)                 US$ 1'855   US$ 2'780   US$ 3'710
Room Rica (2 pax)                  US$ 1'690   US$ 2'540   US$ 3'385
Room Komodo (2 pax)                US$ 1'690   US$ 2'540   US$ 3'385
Extra Bed room Komodo and Rinca    US$ 770     US$ 1'155   US$ 1'540

2. Nightly Rates Private Charter
Boat            Komodo      Komodo-Sumbawa  Maumere-Alor  Spice Island  Raja Ampat    PAX
Samara I        US$ 4'600   N/A             N/A           N/A           N/A           10 adults + 2 extra bed
Samara II       US$ 4'500   N/A             N/A           N/A           N/A           8 adults + 2 extra bed
Mischief        US$ 8'000   US$ 8'500       US$ 9'500     US$ 9'500     US$ 9'500     6 adults + 1 extra bed
Samara Otium    US$ 14'000  US$ 14'000      US$ 14'000    US$ 14'000    US$ 14'000    12 adults + 2 extra bed
* Relocation from a non-scheduled base: 50% of nightly rate/night, not commissionable.
** Rates are subject to 12% VAT.

3. Commission Structure
3.1. **Open Trip:** The Agency is entitled to a commission of **{{commission_open_trip}}%** on the total charter price for each successful Open Trip booking.
3.2. **Private Charter:** The Agency is entitled to a commission of **{{commission_private_charter}}%** on the total charter price for each successful Private Charter booking.
3.3. **Net Basis:** Commission is calculated on the net booking value, excluding government taxes, port fees, and any APA (Advance Provisioning Allowance) if applicable.
3.4. **Performance-Based or Exceptional Adjustments:** Higher commissions may apply based on sales volume, prepayment agreements, or other specific conditions. These must be confirmed **in writing** and approved by the Principal on a **case-by-case basis**.

4. Payment Terms
4.1. **Payments Collected by the Agent:**
   - **30% Down Payment (DP):** Must be transferred in full to the Principal without deduction within the stipulated deadline.
   - **70% Balance Payment:** The Agency may deduct the agreed commission from the balance before transferring the remainder to the Principal.
4.2. **Payment Schedule:** Payments must follow the schedule outlined in the Annex Terms and Conditions (T&C) and the Agent Agreement.
4.3. **Exceptions:** Any deviation from the above payment handling must be agreed upon in writing on a case-by-case basis.
4.4. **Payment Method:** Payments must be made via bank transfer or credit card, in USD or IDR, to the account specified by the Principal.
4.5. Credit card payments are subject to a 3% processing fee.
4.6. All transfer fees are the responsibility of the Agency or the client.

5. Commission and Payment Terms for Agencies
5.1. **Cancellations:** Commissions are not payable for bookings canceled by the client unless explicitly stated in writing otherwise.
5.2. **Refunds:** If a refund is issued to the client, any paid commission shall be adjusted or reclaimed proportionately.
5.3. **Force Majeure:** In cases where a booking is canceled due to force majeure events, commissions will not be payable unless otherwise specified in writing.

6. Reporting and Records
6.1. Agencies must maintain accurate records of bookings and transactions for verification purposes. The Principal reserves the right to request booking records or audit financial details related to commissions.

7. Non-Circumvention
7.1. The Agency agrees not to bypass the Principal by engaging directly with clients for services that compete with the Principal's offerings without prior written consent.

8. Miscellaneous
8.1. Any disputes regarding commissions must be raised in writing within 30 days of the payment date.
8.2. **Governing Law:** This Contract is governed by the laws of the Republic of Indonesia.
8.3. **Dispute Resolution:** Any disputes arising from this Contract shall be resolved through mediation or arbitration in Bali, Indonesia.

For updates or clarifications, please refer to the latest Travel Agency Agreement or contact Samara Yachting via info@samarayachting.com.`

const SEED_TEMPLATES: DocTemplate[] = [
  {
    id: 't1',
    name: 'Terms & Conditions',
    category: 'Legal',
    versions: [
      { id: 'v3', number: 3, date: '2026-08-01', by: 'Roy', notes: 'Tambah Pasal 15–19 (price adjustment, governing law, acknowledgment, contact) — menyamakan dengan T&C yang tercetak di invoice', active: true, content: TNC_FULL },
      { id: 'v2', number: 2, date: '2026-05-12', by: 'Roy', notes: 'Perluas Pasal 10–14 (inclusions/exclusions, liability & indemnity) yang sebelumnya hanya garis besar', active: false, content: TNC_V2 },
      { id: 'v1', number: 1, date: '2026-01-10', by: 'Admin', notes: 'Versi awal — cakupan dasar booking, pembayaran, dan pembatalan', active: false, content: TNC_V1 },
    ],
  },
  {
    id: 't2',
    name: 'Booking Confirmation Template',
    category: 'Booking',
    versions: [
      { id: 'v2', number: 2, date: '2026-07-18', by: 'Roy', notes: 'Tambah bagian itinerary harian', active: true, content: 'Booking Confirmation\n\nDear {{guest_name}},\n\nTerima kasih telah melakukan booking dengan Samara Yachting. Berikut detail perjalanan Anda:\n\nKapal: {{yacht_name}}\nTanggal: {{start_date}} — {{end_date}}\n\nItinerary Harian:\n{{itinerary_days}}' },
      { id: 'v1', number: 1, date: '2026-02-02', by: 'Admin', notes: 'Versi awal', active: false, content: 'Booking Confirmation\n\nDear {{guest_name}},\n\nTerima kasih telah melakukan booking dengan Samara Yachting. Berikut detail perjalanan Anda:\n\nKapal: {{yacht_name}}\nTanggal: {{start_date}} — {{end_date}}' },
    ],
  },
  {
    id: 't3',
    name: 'Invoice Legal Footer',
    category: 'Finance',
    versions: [
      { id: 'v1', number: 1, date: '2026-01-10', by: 'Admin', notes: 'Versi awal', active: true, content: 'Invoice ini sah tanpa tanda tangan basah. Pembayaran dianggap final setelah dana diterima di rekening Samara Yachting.' },
    ],
  },
  {
    id: 't4',
    name: 'Agent Agreement Template',
    category: 'Agent',
    versions: [
      { id: 'v4', number: 4, date: '2026-06-30', by: 'Roy', notes: 'Update skema komisi tier 3', active: true, content: 'Perjanjian Kerjasama Agent\n\nKomisi:\nTier 1 (1-5 booking/bulan): 10%\nTier 2 (6-15 booking/bulan): 12%\nTier 3 (16+ booking/bulan): 15%\n\nKerahasiaan:\nAgent wajib menjaga kerahasiaan harga nett dan data pelanggan Samara Yachting.' },
      { id: 'v3', number: 3, date: '2026-04-01', by: 'Roy', notes: 'Perbaikan klausul eksklusivitas wilayah', active: false, content: 'Perjanjian Kerjasama Agent\n\nKomisi:\nTier 1 (1-5 booking/bulan): 10%\nTier 2 (6-15 booking/bulan): 12%\nTier 3 (16+ booking/bulan): 13%\n\nKerahasiaan:\nAgent wajib menjaga kerahasiaan harga nett dan data pelanggan Samara Yachting.' },
      { id: 'v2', number: 2, date: '2026-03-01', by: 'Admin', notes: 'Tambah klausul kerahasiaan', active: false, content: 'Perjanjian Kerjasama Agent\n\nKomisi:\nTier 1 (1-5 booking/bulan): 10%\nTier 2 (6-15 booking/bulan): 12%\n\nKerahasiaan:\nAgent wajib menjaga kerahasiaan harga nett dan data pelanggan Samara Yachting.' },
      { id: 'v1', number: 1, date: '2026-01-15', by: 'Admin', notes: 'Versi awal', active: false, content: 'Perjanjian Kerjasama Agent\n\nKomisi:\nTier 1 (1-5 booking/bulan): 10%\nTier 2 (6-15 booking/bulan): 12%' },
    ],
  },
  {
    id: 't5',
    name: 'Commission & Payment Terms (C&P)',
    category: 'Agent',
    variableNote: 'Dokumen ini sebagian isinya per-agent: {{commission_open_trip}} dan {{commission_private_charter}} diisi dari data komisi masing-masing agent saat dokumen digenerate. Konten di sini adalah master text bersama (rate table, klausul), bukan hasil generate per agent.',
    versions: [
      { id: 'v1', number: 1, date: '2026-01-01', by: 'Admin', notes: 'Migrasi dari file PDF statis yang sudah ada ("2026 - v1.0", dicetak bareng Agent Agreement) — belum pernah punya riwayat versi sebelum ini', active: true, content: CP_FULL },
    ],
  },
]

const SEED_GENERATED: GeneratedDoc[] = [
  { id: 'g1', docType: 'Invoice', refNumber: 'REQ-BK1092-1', bookingCode: 'BK-1092', generatedAt: '2026-08-05', generatedBy: 'Finance Team', templateName: 'Terms & Conditions', templateVersion: 3 },
  { id: 'g2', docType: 'Booking Confirmation', refNumber: 'BC-BK1092', bookingCode: 'BK-1092', generatedAt: '2026-08-05', generatedBy: 'Finance Team', templateName: 'Booking Confirmation Template', templateVersion: 2 },
  { id: 'g3', docType: 'Invoice', refNumber: 'REQ-BK0987-1', bookingCode: 'BK-0987', generatedAt: '2026-06-20', generatedBy: 'Roy', templateName: 'Terms & Conditions', templateVersion: 2 },
  { id: 'g4', docType: 'Agent Agreement', refNumber: 'AGR-AG0044', bookingCode: '—', generatedAt: '2026-07-02', generatedBy: 'Admin', templateName: 'Agent Agreement Template', templateVersion: 4 },
  { id: 'g5', docType: 'Commission & Payment Terms', refNumber: 'CP-AG0044', bookingCode: '—', generatedAt: '2026-07-02', generatedBy: 'Admin', templateName: 'Commission & Payment Terms (C&P)', templateVersion: 1 },
]

const fmtDate = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

export default function DocumentVersionControlProto() {
  const [tab, setTab] = useState<'templates' | 'generated'>('templates')
  const [templates, setTemplates] = useState<DocTemplate[]>(SEED_TEMPLATES)
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [versionModal, setVersionModal] = useState(false)
  const [draftNotes, setDraftNotes] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [draftActivate, setDraftActivate] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pdfPreview, setPdfPreview] = useState<{ docTitle: string; version: Version } | null>(null)

  const selected = templates.find(t => t.id === selectedId) ?? null
  const filtered = templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))

  function openDetail(id: string) {
    setSelectedId(id)
    setView('detail')
  }

  function openVersionModal() {
    if (!selected) return
    const active = selected.versions.find(v => v.active) ?? selected.versions[0]
    setDraftNotes('')
    setDraftContent(active?.content ?? '')
    setDraftActivate(true)
    setVersionModal(true)
  }

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function submitVersion() {
    if (!selected || !draftContent.trim()) return
    setTemplates(prev => prev.map(t => {
      if (t.id !== selected.id) return t
      const nextNumber = Math.max(...t.versions.map(v => v.number)) + 1
      const newVersion: Version = {
        id: `v${nextNumber}-${t.id}`,
        number: nextNumber,
        date: new Date().toISOString().slice(0, 10),
        by: 'Roy',
        notes: draftNotes || '(no notes)',
        active: draftActivate,
        content: draftContent,
      }
      const versions = draftActivate ? t.versions.map(v => ({ ...v, active: false })) : t.versions
      return { ...t, versions: [newVersion, ...versions] }
    }))
    setVersionModal(false)
  }

  function setActiveVersion(templateId: string, versionId: string) {
    setTemplates(prev => prev.map(t => t.id !== templateId ? t : {
      ...t,
      versions: t.versions.map(v => ({ ...v, active: v.id === versionId })),
    }))
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 w-fit">
          <AlertCircle className="h-3.5 w-3.5" /> Mockup — data lokal, belum terhubung ke database
        </div>

        <div>
          <h2 className="text-2xl font-bold tracking-tight">Document Version Control</h2>
          <p className="text-muted-foreground text-sm mt-1">Kelola versi TnC, template booking confirmation, dan dokumen legal lainnya</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          <button
            onClick={() => { setTab('templates'); setView('list') }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'templates' ? 'border-[#bdac7e] text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Templates &amp; Legal Docs
          </button>
          <button
            onClick={() => setTab('generated')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'generated' ? 'border-[#bdac7e] text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Generated Documents (Snapshots)
          </button>
        </div>

        {tab === 'templates' && view === 'list' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  className="w-full pl-9 pr-3 h-9 border rounded-md text-sm focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] outline-none"
                  placeholder="Cari dokumen..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <button className="flex items-center gap-2 bg-[#bdac7e] hover:bg-[#a89860] text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
                <Plus className="h-4 w-4" /> New Document Template
              </button>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Document</th>
                    <th className="text-left px-4 py-3 font-medium">Category</th>
                    <th className="text-left px-4 py-3 font-medium">Active Version</th>
                    <th className="text-left px-4 py-3 font-medium">Last Updated</th>
                    <th className="text-left px-4 py-3 font-medium">Updated By</th>
                    <th className="text-left px-4 py-3 font-medium">History</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(t => {
                    const active = t.versions.find(v => v.active) ?? t.versions[0]
                    return (
                      <tr key={t.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(t.id)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium">{t.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLOR[t.category]}`}>{t.category}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold">v{active.number}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(active.date)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{active.by}</td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground"><History className="h-3.5 w-3.5" /> {t.versions.length} version{t.versions.length !== 1 ? 's' : ''}</span>
                        </td>
                        <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            </div>
          </div>
        )}

        {tab === 'templates' && view === 'detail' && selected && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => setView('list')} className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    {selected.name}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLOR[selected.category]}`}>{selected.category}</span>
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{selected.versions.length} version{selected.versions.length !== 1 ? 's' : ''} tersimpan</p>
                </div>
              </div>
              <button onClick={openVersionModal} className="flex items-center gap-2 bg-[#bdac7e] hover:bg-[#a89860] text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
                <Plus className="h-4 w-4" /> New Version
              </button>
            </div>

            {selected.variableNote && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
                <p className="text-xs text-purple-800">{selected.variableNote}</p>
              </div>
            )}

            {/* Version history timeline */}
            <div className="rounded-xl border overflow-hidden">
              <div className="px-5 py-3 bg-muted/40 border-b">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Version History</h4>
              </div>
              <div className="divide-y">
                {selected.versions.map(v => (
                  <div key={v.id} className="px-5 py-4 flex items-start gap-4">
                    <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${v.active ? 'bg-green-500' : 'bg-muted'}`}>
                      {v.active ? <CheckCircle2 className="h-4 w-4 text-white" /> : <span className="text-xs font-bold text-muted-foreground">v{v.number}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">Version {v.number}</span>
                        {v.active && <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">Active</span>}
                        <span className="text-xs text-muted-foreground">· {fmtDate(v.date)} · by {v.by}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{v.notes}</p>
                      {expanded.has(v.id) ? (
                        <pre className="mt-2 text-xs whitespace-pre-wrap font-sans bg-muted/30 rounded-md p-3 border">{v.content}</pre>
                      ) : (
                        <p className="text-xs text-muted-foreground/70 mt-2 truncate max-w-lg">{v.content.split('\n')[0]}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => toggleExpanded(v.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium">
                        <Eye className="h-3.5 w-3.5" /> {expanded.has(v.id) ? 'Hide' : 'View'}
                      </button>
                      <button onClick={() => setPdfPreview({ docTitle: selected.name, version: v })} className="flex items-center gap-1 text-xs text-[#bdac7e] hover:text-[#a89860] font-medium">
                        <FileText className="h-3.5 w-3.5" /> Preview as PDF
                      </button>
                      {!v.active && (
                        <button onClick={() => setActiveVersion(selected.id, v.id)} className="text-xs text-[#bdac7e] hover:text-[#a89860] font-medium">
                          Set as Active
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 px-4 py-3 flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Dokumen yang sudah digenerate (invoice, booking confirmation) tetap memakai versi yang berlaku saat itu — mengaktifkan versi baru di sini tidak mengubah dokumen lama yang sudah terbit. Lihat tab <span className="font-medium text-foreground">Generated Documents</span>.
              </p>
            </div>
          </div>
        )}

        {tab === 'generated' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Snapshot dokumen yang sudah digenerate untuk booking/invoice — immutable, tetap terkunci ke versi template yang berlaku saat digenerate.
            </p>
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Document</th>
                    <th className="text-left px-4 py-3 font-medium">Ref No.</th>
                    <th className="text-left px-4 py-3 font-medium">Booking</th>
                    <th className="text-left px-4 py-3 font-medium">Template Used</th>
                    <th className="text-left px-4 py-3 font-medium">Generated</th>
                    <th className="text-left px-4 py-3 font-medium">By</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {SEED_GENERATED.map(g => (
                    <tr key={g.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{g.docType}</td>
                      <td className="px-4 py-3 font-mono text-xs">{g.refNumber}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{g.bookingCode}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-xs">
                          <Link2 className="h-3 w-3 text-muted-foreground" />
                          {g.templateName} <span className="font-mono text-muted-foreground">v{g.templateVersion}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(g.generatedAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{g.generatedBy}</td>
                      <td className="px-4 py-3">
                        <button className="flex items-center gap-1 text-xs text-[#bdac7e] hover:text-[#a89860] font-medium">
                          <Download className="h-3.5 w-3.5" /> View PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </div>
        )}
      </div>

      {/* New Version Modal — write/edit content directly, no file upload */}
      {versionModal && selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="font-semibold text-base">New Version</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{selected.name} — mulai dari isi versi aktif, edit sesuai kebutuhan</p>
              </div>
              <button onClick={() => setVersionModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Document Content</label>
                  <span className="text-[11px] text-muted-foreground">Pakai <code className="font-mono bg-muted px-1 rounded">**teks**</code> untuk bold</span>
                </div>
                <textarea
                  className="w-full border rounded-md px-3 py-2.5 text-sm font-mono resize-y bg-background focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] outline-none transition"
                  rows={10}
                  placeholder="Tulis isi dokumen di sini... contoh: 1.1. **Deposit:** wajib dibayar dalam 3 hari."
                  value={draftContent}
                  onChange={e => setDraftContent(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Version Notes</label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm resize-none bg-background focus:ring-1 focus:ring-[#bdac7e]/50 focus:border-[#bdac7e] outline-none transition"
                  rows={2}
                  placeholder="Apa yang berubah di versi ini?"
                  value={draftNotes}
                  onChange={e => setDraftNotes(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={draftActivate} onChange={e => setDraftActivate(e.target.checked)} className="accent-[#bdac7e]" />
                Set sebagai versi aktif sekarang
              </label>
              {!draftActivate && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Tersimpan sebagai draft — versi lama tetap aktif sampai kamu aktifkan manual.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t bg-muted/20">
              <button onClick={() => setVersionModal(false)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">Cancel</button>
              <button onClick={submitVersion} disabled={!draftContent.trim()} className="px-5 py-2 text-sm bg-[#bdac7e] text-white rounded-md hover:bg-[#a89860] font-medium disabled:opacity-50">
                Save Version
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview — renders the version's content inside the same visual chrome (cover,
          navy header/footer, tables) as the real print pages, in an isolated iframe. */}
      {pdfPreview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 bg-white border-b shrink-0">
            <div>
              <h3 className="font-semibold text-sm">{pdfPreview.docTitle}</h3>
              <p className="text-xs text-muted-foreground">Version {pdfPreview.version.number}{pdfPreview.version.active ? ' · Active' : ''} · Print preview</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => (document.getElementById('pdf-preview-frame') as HTMLIFrameElement | null)?.contentWindow?.print()}
                className="flex items-center gap-1.5 text-sm bg-[#bdac7e] hover:bg-[#a89860] text-white px-3 py-1.5 rounded-md font-medium"
              >
                <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
              </button>
              <button onClick={() => setPdfPreview(null)} className="p-1.5 hover:bg-muted rounded-md"><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe
              id="pdf-preview-frame"
              title="PDF Preview"
              srcDoc={buildPreviewHtml(pdfPreview.docTitle, pdfPreview.version.number, pdfPreview.version.active, pdfPreview.version.content)}
              className="w-full h-full border-0"
            />
          </div>
        </div>
      )}
    </div>
  )
}
