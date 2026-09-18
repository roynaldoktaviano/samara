export const LEAD_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'OPPORTUNITY', 'CLOSED_WON', 'CLOSED_LOST'] as const
export type LeadStage = typeof LEAD_STAGES[number]

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  UNQUALIFIED: 'Unqualified',
  OPPORTUNITY: 'Opportunity',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
}

export const LEAD_STAGE_COLOR: Record<LeadStage, string> = {
  NEW: 'bg-gray-100 text-gray-700',
  CONTACTED: 'bg-blue-100 text-blue-700',
  QUALIFIED: 'bg-teal-100 text-teal-700',
  UNQUALIFIED: 'bg-muted text-muted-foreground',
  OPPORTUNITY: 'bg-amber-100 text-amber-700',
  CLOSED_WON: 'bg-green-100 text-green-700',
  CLOSED_LOST: 'bg-red-100 text-red-700',
}

// Which stages a lead in a given stage can be moved to next. Sales always moves
// forward except UNQUALIFIED, which the user wants reversible back to CONTACTED
// if the prospect turns out to be relevant again.
export const LEAD_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  NEW: ['CONTACTED'],
  CONTACTED: ['QUALIFIED', 'UNQUALIFIED'],
  QUALIFIED: ['OPPORTUNITY', 'UNQUALIFIED'],
  UNQUALIFIED: ['CONTACTED'],
  OPPORTUNITY: ['CLOSED_WON', 'CLOSED_LOST'],
  CLOSED_WON: [],
  CLOSED_LOST: [],
}

export function canTransition(from: LeadStage, to: LeadStage): boolean {
  return LEAD_TRANSITIONS[from]?.includes(to) ?? false
}

export function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === 'string' && (LEAD_STAGES as readonly string[]).includes(value)
}

interface QualificationSubject {
  productInterest?: string | null
  destinationId?: string | null
  nationality?: string | null
  travelStartDate?: Date | null
  travelEndDate?: Date | null
  travelSeason?: string | null
  guestCount?: number | null
  leadQuality?: string | null
}

// Fields the user requires before a lead can become QUALIFIED. Budget is
// intentionally excluded — it's "if obtained", never a blocker.
const QUALIFICATION_FIELD_LABELS: Record<string, string> = {
  productInterest: 'Yacht / Product Interest',
  destination: 'Destination',
  nationality: 'Country',
  travelDates: 'Travel Dates / Season',
  guestCount: 'Number of Guests',
  leadQuality: 'Lead Quality',
}

export function getMissingQualificationFields(lead: QualificationSubject): string[] {
  const missing: string[] = []
  if (!lead.productInterest?.trim()) missing.push(QUALIFICATION_FIELD_LABELS.productInterest)
  if (!lead.destinationId) missing.push(QUALIFICATION_FIELD_LABELS.destination)
  if (!lead.nationality?.trim()) missing.push(QUALIFICATION_FIELD_LABELS.nationality)
  if (!((lead.travelStartDate && lead.travelEndDate) || lead.travelSeason?.trim())) missing.push(QUALIFICATION_FIELD_LABELS.travelDates)
  if (!lead.guestCount || lead.guestCount <= 0) missing.push(QUALIFICATION_FIELD_LABELS.guestCount)
  if (!lead.leadQuality) missing.push(QUALIFICATION_FIELD_LABELS.leadQuality)
  return missing
}
