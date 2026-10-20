'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, MapPin, FileText, ClipboardCheck, X, Download, CalendarDays, Plane, Send, Package, ChevronRight } from 'lucide-react'
import { FilePreview } from '@/components/ui/file-preview'
import { isPdfDataUrl, downloadDataUrl, extFromDataUrl } from '@/lib/fileUpload'
import { FreelanceRecommendationsField, type FreelanceRecommendation } from '@/components/hr/FreelanceRecommendationsField'
import { tripDates, tripShortLabel, type TripOption } from '@/components/purchasing/TripPicker'

interface ApprovalRequest {
  id: string
  prNumber: string
  createdAt: string
  itemCount: number
  totalBudget: number
  notes: string | null
  neededByDate: string | null
  isUrgent: boolean
  urgentReason: string | null
  deliveryLocation: { id: string; name: string } | null
  requestedByEmployee: { id: string; fullName: string; employeeNumber: string; department: string | null } | null
}

interface RequestDetailItem {
  id: string
  itemName: string
  quantity: number
  unit: string
  estimatedCost: number
  supplierName: string | null
  notes: string | null
}

interface RequestDetail extends ApprovalRequest {
  purpose: 'STOCK_INVENTORY' | 'TRIP'
  trip: TripOption | null
  items: RequestDetailItem[]
}

interface QuotationApprovalItem {
  id: string
  requestId: string
  itemName: string
  quantity: number
  unit: string
  estimatedCost: number
  supplierName: string | null
  selectionJustification: string | null
  quotationSubmittedAt: string
  request: { id: string; prNumber: string }
  quotationSubmittedBy: { name: string | null } | null
  quotations: { id: string; supplierId: string | null; supplierName: string; price: number; submittedAt: string; fileKey: string | null }[]
}

interface CrewLeaveApproval {
  id: string
  type: 'LEAVE' | 'WFH'
  startDate: string; endDate: string; days: number
  reason: string | null
  needsFreelance: boolean
  freelanceRecommendations: FreelanceRecommendation[]
  requestedAt: string
  employee: { id: string; fullName: string; employeeNumber: string; leaveBalance: number | null }
}

interface BusinessTripApproval {
  id: string
  destination: string
  purpose: string
  startDate: string; endDate: string
  requestedAt: string
  employee: { id: string; fullName: string; employeeNumber: string }
}

interface TeamMember { id: string; fullName: string; employeeNumber: string; department: string | null; employmentStatus: string | null }
interface TeamPerformanceReview {
  id: string
  status: 'REQUESTED' | 'COMPLETED'
  createdAt: string
  employee: { id: string; fullName: string; employeeNumber: string }
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function UrgentBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white animate-pulse">
      <AlertTriangle className="h-3 w-3" /> URGENT
    </span>
  )
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{children}</span>
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}

function RequesterLine({ employee, sub }: { employee: ApprovalRequest['requestedByEmployee']; sub?: string }) {
  const name = employee?.fullName ?? '—'
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'
  const secondary = [employee?.department, sub].filter(Boolean).join(' · ')
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="h-8 w-8 shrink-0 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold flex items-center justify-center">{initials}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{name}</p>
        {secondary && <p className="text-xs text-muted-foreground truncate">{secondary}</p>}
      </div>
    </div>
  )
}

export default function MyApprovalsPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [quotationItems, setQuotationItems] = useState<QuotationApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<ApprovalRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [detailModal, setDetailModal] = useState<ApprovalRequest | null>(null)
  const [detail, setDetail] = useState<RequestDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [quoteRejectModal, setQuoteRejectModal] = useState<QuotationApprovalItem | null>(null)
  const [quoteRejectReason, setQuoteRejectReason] = useState('')
  // Which quotation the approver has picked for each pending item — this is the approver's
  // own decision, not something Purchasing set; nothing is pre-selected.
  const [chosenQuotation, setChosenQuotation] = useState<Record<string, string>>({})
  const [fileLightbox, setFileLightbox] = useState<string | null>(null)

  const [crewLeaveRequests, setCrewLeaveRequests] = useState<CrewLeaveApproval[]>([])
  // Per-request draft of needsFreelance/freelanceRecommendations — the Cruise
  // Director/Captain can correct what the requester filled in before approving (they
  // know the yacht's crew needs best), seeded from each request's own current values.
  const [crewLeaveDrafts, setCrewLeaveDrafts] = useState<Record<string, { needsFreelance: boolean; freelanceRecommendations: FreelanceRecommendation[] }>>({})
  const [crewRejectModal, setCrewRejectModal] = useState<CrewLeaveApproval | null>(null)
  const [crewRejectNote, setCrewRejectNote] = useState('')

  const [businessTripApprovals, setBusinessTripApprovals] = useState<BusinessTripApproval[]>([])
  const [tripDetailModal, setTripDetailModal] = useState<BusinessTripApproval | null>(null)
  const [tripRejectModal, setTripRejectModal] = useState<BusinessTripApproval | null>(null)
  const [tripRejectNote, setTripRejectNote] = useState('')

  const [teamReports, setTeamReports] = useState<TeamMember[]>([])
  const [teamReviews, setTeamReviews] = useState<TeamPerformanceReview[]>([])
  const [requestReviewModal, setRequestReviewModal] = useState<TeamMember | null>(null)
  const [requestReviewNote, setRequestReviewNote] = useState('')
  const [requestingReview, setRequestingReview] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [res, teamRes] = await Promise.all([
      fetch('/api/purchasing/my-approvals'),
      fetch('/api/hr/performance-reviews/mine'),
    ])
    if (res.ok) {
      const data = await res.json()
      setRequests(data.prApprovals ?? [])
      setQuotationItems(data.quotationApprovals ?? [])
      const crewLeave: CrewLeaveApproval[] = data.crewLeaveApprovals ?? []
      setCrewLeaveRequests(crewLeave)
      setCrewLeaveDrafts(Object.fromEntries(crewLeave.map(r => [r.id, { needsFreelance: r.needsFreelance, freelanceRecommendations: r.freelanceRecommendations }])))
      setBusinessTripApprovals(data.businessTripApprovals ?? [])
    }
    if (teamRes.ok) {
      const teamData = await teamRes.json()
      setTeamReports(teamData.directReports ?? [])
      setTeamReviews(teamData.requests ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function openDetail(r: ApprovalRequest) {
    setDetailModal(r)
    setDetail(null)
    setDetailLoading(true)
    const res = await fetch(`/api/purchasing/requests/${r.id}`)
    if (res.ok) setDetail(await res.json())
    setDetailLoading(false)
  }

  async function act(id: string, action: 'approve' | 'reject', reason?: string) {
    setActingId(id)
    const res = await fetch(`/api/purchasing/requests/${id}/approval`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    })
    const data = await res.json()
    setActingId(null)
    if (!res.ok) { alert(data.error ?? 'Failed to update'); return }
    setRejectModal(null)
    setRejectReason('')
    if (detailModal?.id === id) { setDetailModal(null); setDetail(null) }
    setRequests(prev => prev.filter(r => r.id !== id))
  }

  async function actOnQuotation(item: QuotationApprovalItem, action: 'approve' | 'reject', reason?: string) {
    setActingId(item.id)
    const res = await fetch(`/api/purchasing/requests/${item.requestId}/items/${item.id}/quotations/approval`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason, quotationId: action === 'approve' ? chosenQuotation[item.id] : undefined }),
    })
    const data = await res.json()
    setActingId(null)
    if (!res.ok) { alert(data.error ?? 'Failed to update'); return }
    setQuoteRejectModal(null)
    setQuoteRejectReason('')
    setQuotationItems(prev => prev.filter(q => q.id !== item.id))
  }

  async function actOnCrewLeave(r: CrewLeaveApproval, action: 'approve' | 'reject', decisionNote?: string) {
    setActingId(r.id)
    const draft = crewLeaveDrafts[r.id]
    const res = await fetch(`/api/hr/leave-requests/${r.id}/crew-approval`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action, decisionNote,
        ...(action === 'approve' ? {
          needsFreelance: draft?.needsFreelance ?? r.needsFreelance,
          freelanceRecommendations: draft?.freelanceRecommendations ?? r.freelanceRecommendations,
        } : {}),
      }),
    })
    const data = await res.json()
    setActingId(null)
    if (!res.ok) { alert(data.error ?? 'Failed to update'); return }
    setCrewRejectModal(null)
    setCrewRejectNote('')
    setCrewLeaveRequests(prev => prev.filter(x => x.id !== r.id))
  }

  async function actOnBusinessTrip(t: BusinessTripApproval, action: 'approve' | 'reject', decisionNote?: string) {
    setActingId(t.id)
    const res = await fetch(`/api/hr/business-trips/${t.id}/manager-approval`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, decisionNote }),
    })
    const data = await res.json()
    setActingId(null)
    if (!res.ok) { alert(data.error ?? 'Failed to update'); return }
    setTripRejectModal(null)
    setTripRejectNote('')
    setTripDetailModal(null)
    setBusinessTripApprovals(prev => prev.filter(x => x.id !== t.id))
  }

  async function submitReviewRequest() {
    if (!requestReviewModal) return
    setRequestingReview(true)
    const res = await fetch('/api/hr/performance-reviews/mine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: requestReviewModal.id, requestNote: requestReviewNote }),
    })
    const data = await res.json()
    setRequestingReview(false)
    if (!res.ok) { alert(data.error ?? 'Failed to request review'); return }
    setRequestReviewModal(null)
    setRequestReviewNote('')
    load()
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">My Approvals</h2>
        <p className="text-muted-foreground text-sm mt-1">Purchase requests and supplier selections awaiting your approval</p>
      </div>

      {teamReports.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">My Team — Performance Reviews</h3>
          <div className="space-y-2">
            {teamReports.map(m => {
              const latest = teamReviews.filter(r => r.employee.id === m.id)[0]
              const pending = latest?.status === 'REQUESTED'
              return (
                <div key={m.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm">{m.fullName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{m.employeeNumber}{m.department ? ` · ${m.department}` : ''}</p>
                    {latest && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {latest.status === 'REQUESTED' ? `Review requested ${fmtDate(latest.createdAt)}, waiting for HR` : `Last reviewed ${fmtDate(latest.createdAt)}`}
                      </p>
                    )}
                  </div>
                  <button disabled={pending} onClick={() => { setRequestReviewModal(m); setRequestReviewNote('') }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    <Send className="h-3.5 w-3.5" /> {pending ? 'Requested' : 'Request Review'}
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Crew Leave Requests</h3>
      {crewLeaveRequests.length === 0 ? (
        <div className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
          <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No crew leave requests waiting for your approval.
        </div>
      ) : (
        <div className="space-y-3">
          {crewLeaveRequests.map(r => {
            const draft = crewLeaveDrafts[r.id] ?? { needsFreelance: r.needsFreelance, freelanceRecommendations: r.freelanceRecommendations }
            return (
              <div key={r.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{r.employee.fullName} <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.type === 'WFH' ? 'bg-sky-100 text-sky-700' : 'bg-purple-100 text-purple-700'}`}>{r.type === 'WFH' ? 'WFH' : 'Leave'}</span></p>
                    <p className="text-xs text-muted-foreground font-mono">{r.employee.employeeNumber}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 text-right">{fmtDate(r.startDate)} – {fmtDate(r.endDate)}<br />{r.days} day{r.days !== 1 ? 's' : ''}</span>
                </div>
                {r.reason && <p className="text-sm text-muted-foreground">{r.reason}</p>}

                {r.type !== 'WFH' && <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={draft.needsFreelance}
                    onChange={e => setCrewLeaveDrafts(prev => ({ ...prev, [r.id]: { needsFreelance: e.target.checked, freelanceRecommendations: e.target.checked ? draft.freelanceRecommendations : [] } }))} />
                  Needs a freelance replacement for the trips missed?
                </label>}
                {draft.needsFreelance && (
                  <FreelanceRecommendationsField value={draft.freelanceRecommendations}
                    onChange={v => setCrewLeaveDrafts(prev => ({ ...prev, [r.id]: { needsFreelance: true, freelanceRecommendations: v } }))} />
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button disabled={actingId === r.id} onClick={() => actOnCrewLeave(r, 'approve')}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-md transition-colors">
                    <CheckCircle2 className="h-3 w-3" /> Approve
                  </button>
                  <button disabled={actingId === r.id} onClick={() => { setCrewRejectModal(r); setCrewRejectNote('') }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors">
                    <XCircle className="h-3 w-3" /> Reject
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pt-2">Business Trips</h3>
      {businessTripApprovals.length === 0 ? (
        <div className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
          <Plane className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No business trip requests waiting for your approval.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 desktop:grid-cols-3 gap-3">
          {businessTripApprovals.map(t => (
            <button key={t.id} onClick={() => setTripDetailModal(t)}
              className="text-left rounded-lg border p-4 space-y-2 hover:bg-muted/30 hover:border-amber-300 transition-colors">
              <div>
                <p className="font-semibold text-sm">{t.employee.fullName}</p>
                <p className="text-xs text-muted-foreground font-mono">{t.employee.employeeNumber}</p>
              </div>
              <p className="text-sm font-medium">{t.destination}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{t.purpose}</p>
              <p className="text-xs text-muted-foreground">{fmtDate(t.startDate)} – {fmtDate(t.endDate)}</p>
            </button>
          ))}
        </div>
      )}

      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pt-2">Purchase Requests</h3>
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border p-4 space-y-3 animate-pulse">
              <div className="h-3.5 w-28 rounded bg-muted" />
              <div className="h-4 w-44 rounded bg-muted" />
              <div className="h-3.5 w-36 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm border rounded-xl">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No PRs waiting for your approval.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {requests.map(r => (
            <div key={r.id}
              className={`rounded-xl border bg-white flex flex-col transition-shadow hover:shadow-md ${r.isUrgent ? 'border-red-200' : ''}`}>
              <button onClick={() => openDetail(r)} className="flex-1 text-left p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    {r.prNumber}
                    {r.isUrgent && <UrgentBadge />}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtDate(r.createdAt)}</span>
                </div>
                <RequesterLine employee={r.requestedByEmployee} />
                <div className="flex flex-wrap gap-1.5">
                  {r.deliveryLocation && (
                    <MetaChip><MapPin className="h-3 w-3" />{r.deliveryLocation.name}</MetaChip>
                  )}
                  <MetaChip><Package className="h-3 w-3" />{r.itemCount} item{r.itemCount !== 1 ? 's' : ''}</MetaChip>
                  {r.neededByDate && (
                    <MetaChip><CalendarDays className="h-3 w-3" />Need by {fmtDate(r.neededByDate)}</MetaChip>
                  )}
                </div>
              </button>
              <div className="flex items-center gap-2 px-4 py-3 border-t bg-muted/20 rounded-b-xl">
                <button onClick={() => openDetail(r)}
                  className="mr-auto flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900">
                  View items <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  disabled={actingId === r.id}
                  onClick={() => setRejectModal(r)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border bg-white rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors">
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
                <button
                  disabled={actingId === r.id}
                  onClick={() => act(r.id, 'approve')}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pt-2">Supplier Selections</h3>
      {quotationItems.length === 0 ? (
        <div className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
          <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No supplier selections waiting for your approval.
        </div>
      ) : (
        <div className="space-y-3">
          {quotationItems.map(q => {
            const chosenId = chosenQuotation[q.id]
            return (
              <div key={q.id} className="rounded-lg border p-4 space-y-3">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{q.request.prNumber}</p>
                  <p className="font-semibold text-sm mt-0.5">{q.itemName} <span className="text-muted-foreground font-normal">· {q.quantity} {q.unit}</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Submitted by {q.quotationSubmittedBy?.name ?? '—'} · {fmtDate(q.quotationSubmittedAt)}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Pick which quotation to use</p>
                  <div className="grid grid-cols-5 gap-3">
                  {q.quotations.map(quote => {
                    const isChosen = quote.id === chosenId
                    return (
                      <div key={quote.id} className={`border rounded-md overflow-hidden text-xs ${isChosen ? 'border-green-400 bg-green-50' : ''}`}>
                        {quote.fileKey ? (
                          <div className="relative">
                            <FilePreview
                              src={quote.fileKey}
                              alt="Quotation document"
                              onClick={() => setFileLightbox(quote.fileKey)}
                              className="w-full h-20 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                            />
                            <button
                              onClick={() => downloadDataUrl(quote.fileKey!, `${quote.supplierName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-quotation.${extFromDataUrl(quote.fileKey!)}`)}
                              title="Download quotation document"
                              className="absolute top-1 right-1 bg-white/90 hover:bg-white text-foreground rounded-full p-1 shadow transition-colors"
                            >
                              <Download className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="w-full h-20 border-b border-dashed flex items-center justify-center text-[11px] text-muted-foreground/60 italic">No document</div>
                        )}
                        <div className="px-3 py-3 space-y-2.5">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className={`truncate ${isChosen ? 'font-semibold' : ''}`}>{quote.supplierName}</span>
                            <span className="font-medium shrink-0">Rp {new Intl.NumberFormat('id-ID').format(quote.price)}</span>
                          </div>
                          {isChosen ? (
                            <div className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-green-600 rounded-md py-2">
                              <CheckCircle2 className="h-4 w-4" /> Chosen
                            </div>
                          ) : (
                            <button onClick={() => setChosenQuotation(prev => ({ ...prev, [q.id]: quote.id }))}
                              className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md py-2 transition-colors shadow-sm">
                              Use this quote
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  {!chosenId && <p className="text-[11px] text-muted-foreground italic mr-auto">Pick a quotation above first.</p>}
                  <button
                    disabled={actingId === q.id || !chosenId}
                    onClick={() => actOnQuotation(q, 'approve')}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-md transition-colors">
                    <CheckCircle2 className="h-3 w-3" /> Approve
                  </button>
                  <button
                    disabled={actingId === q.id}
                    onClick={() => { setQuoteRejectModal(q); setQuoteRejectReason('') }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors">
                    <XCircle className="h-3 w-3" /> Reject
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {quoteRejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold text-base">Reject supplier for &quot;{quoteRejectModal.itemName}&quot;?</h3>
            </div>
            <div className="px-6 py-4 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Reason (required)</label>
              <textarea
                rows={3}
                autoFocus
                value={quoteRejectReason}
                onChange={e => setQuoteRejectReason(e.target.value)}
                placeholder="Why is this supplier selection being rejected?"
                className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setQuoteRejectModal(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
              <button
                disabled={actingId === quoteRejectModal.id || !quoteRejectReason.trim()}
                onClick={() => actOnQuotation(quoteRejectModal, 'reject', quoteRejectReason)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                Yes, Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {crewRejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold text-base">Reject {crewRejectModal.employee.fullName}&apos;s leave request?</h3>
            </div>
            <div className="px-6 py-4 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
              <textarea rows={3} autoFocus value={crewRejectNote} onChange={e => setCrewRejectNote(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-500" />
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setCrewRejectModal(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
              <button
                disabled={actingId === crewRejectModal.id}
                onClick={() => actOnCrewLeave(crewRejectModal, 'reject', crewRejectNote)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                Yes, Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {tripDetailModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setTripDetailModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-base">{tripDetailModal.employee.fullName}</h3>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{tripDetailModal.employee.employeeNumber}</p>
              </div>
              <button onClick={() => setTripDetailModal(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none shrink-0">×</button>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Destination</p>
                <p className="mt-0.5 flex items-center gap-1.5"><Plane className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{tripDetailModal.destination}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dates</p>
                <p className="mt-0.5">{fmtDate(tripDetailModal.startDate)} – {fmtDate(tripDetailModal.endDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Purpose</p>
                <p className="mt-0.5">{tripDetailModal.purpose}</p>
              </div>
              <p className="text-xs text-muted-foreground border-t pt-2">Requested {fmtDate(tripDetailModal.requestedAt)}</p>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button disabled={actingId === tripDetailModal.id}
                onClick={() => { setTripDetailModal(null); setTripRejectModal(tripDetailModal); setTripRejectNote('') }}
                className="flex items-center gap-1 px-4 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors">
                <XCircle className="h-3.5 w-3.5" /> Reject
              </button>
              <button disabled={actingId === tripDetailModal.id} onClick={() => actOnBusinessTrip(tripDetailModal, 'approve')}
                className="flex items-center gap-1 px-5 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {tripRejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold text-base">Reject {tripRejectModal.employee.fullName}&apos;s business trip request?</h3>
            </div>
            <div className="px-6 py-4 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
              <textarea rows={3} autoFocus value={tripRejectNote} onChange={e => setTripRejectNote(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-500" />
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setTripRejectModal(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
              <button
                disabled={actingId === tripRejectModal.id}
                onClick={() => actOnBusinessTrip(tripRejectModal, 'reject', tripRejectNote)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                Yes, Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {requestReviewModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold text-base">Request performance review — {requestReviewModal.fullName}?</h3>
            </div>
            <div className="px-6 py-4 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Note for HR (optional)</label>
              <textarea rows={3} autoFocus value={requestReviewNote} onChange={e => setRequestReviewNote(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-500" />
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setRequestReviewModal(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
              <button disabled={requestingReview} onClick={submitReviewRequest}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {requestingReview ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="font-semibold text-base">Reject {rejectModal.prNumber}?</h3>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-muted-foreground">
                The requester will be notified that this request was rejected. If it's still needed, they'll need to submit a new PR.
              </p>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Reason (optional, sent to the requester)</label>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Why is this request being rejected?"
                  className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => { setRejectModal(null); setRejectReason('') }} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">Cancel</button>
              <button
                disabled={actingId === rejectModal.id}
                onClick={() => act(rejectModal.id, 'reject', rejectReason)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                Yes, Reject
              </button>
            </div>
          </div>
        </div>
      )}


      {detailModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0 space-y-2">
                <p className="font-mono text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  {detailModal.prNumber}
                  {detailModal.isUrgent && <UrgentBadge />}
                </p>
                <RequesterLine employee={detailModal.requestedByEmployee} sub={`Submitted ${fmtDate(detailModal.createdAt)}`} />
              </div>
              <button onClick={() => { setDetailModal(null); setDetail(null) }} className="p-1 -m-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 pb-5 space-y-4 overflow-y-auto">
              {detailLoading || !detail ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-10 w-full rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : (
                <>
                  <div className="rounded-xl bg-muted/40 p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <InfoField label="Destination">
                      {detail.deliveryLocation ? <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{detail.deliveryLocation.name}</span> : '—'}
                    </InfoField>
                    <InfoField label="Needed By">{detail.neededByDate ? fmtDate(detail.neededByDate) : '—'}</InfoField>
                    {detail.purpose === 'TRIP' && detail.trip && (
                      <div className="col-span-2">
                        <InfoField label="Trip">
                          <span className="font-medium">{tripShortLabel(detail.trip)}</span>
                          <span className="text-muted-foreground"> · {tripDates(detail.trip)}</span>
                          <span className="block text-muted-foreground">{detail.trip.label}</span>
                        </InfoField>
                      </div>
                    )}
                  </div>

                  {detail.isUrgent && detail.urgentReason && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                      <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wide">Why urgent</p>
                      <p className="text-sm text-red-700 mt-0.5">{detail.urgentReason}</p>
                    </div>
                  )}

                  {detail.notes && (
                    <InfoField label="Notes"><span className="whitespace-pre-wrap">{detail.notes}</span></InfoField>
                  )}

                  <div>
                    <div className="flex items-baseline justify-between mb-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Items</p>
                      <p className="text-xs text-muted-foreground">{detail.items.length} item{detail.items.length !== 1 ? 's' : ''}</p>
                    </div>
                    <ul className="rounded-xl border divide-y">
                      {detail.items.map((item, i) => (
                        <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm">{item.itemName}</p>
                            {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                          </div>
                          <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums">
                            {item.quantity} {item.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t bg-muted/20 flex gap-2 shrink-0">
              <button
                disabled={actingId === detailModal.id}
                onClick={() => { setRejectModal(detailModal); setDetailModal(null) }}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium border bg-white rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors">
                <XCircle className="h-4 w-4" /> Reject
              </button>
              <button
                disabled={actingId === detailModal.id}
                onClick={() => act(detailModal.id, 'approve')}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors">
                <CheckCircle2 className="h-4 w-4" /> {actingId === detailModal.id ? 'Approving…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {fileLightbox && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={() => setFileLightbox(null)}>
          <div className="relative inline-block" onClick={e => e.stopPropagation()}>
            {isPdfDataUrl(fileLightbox) ? (
              <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-[90vw] max-w-2xl">
                <embed src={fileLightbox} type="application/pdf" className="w-full h-[75vh]" />
                <div className="p-3 flex justify-center">
                  <a href={fileLightbox} target="_blank" rel="noopener noreferrer" className="text-sm text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2">
                    Open PDF in new tab
                  </a>
                </div>
              </div>
            ) : (
              <img src={fileLightbox} alt="Quotation document" className="block max-w-[90vw] max-h-[85vh] w-auto h-auto rounded-xl shadow-2xl object-contain" />
            )}
            <button onClick={() => setFileLightbox(null)} className="absolute top-3 right-3 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
