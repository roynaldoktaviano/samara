import { ShieldCheck, ShieldX, ShieldQuestion, Shield } from 'lucide-react'
import { AD_CONSENT_COLOR, AD_CONSENT_LABEL, consentRegionLabel, normalizeAdConsent } from '@/lib/ad-consent'

const ICON = { granted: ShieldCheck, denied: ShieldX, unknown: ShieldQuestion, not_required: Shield } as const

const TITLE = {
  granted: 'Accepted ad cookies on the website banner — may be sent to Google/Meta',
  denied: 'Declined ad cookies — never sent to Google/Meta',
  unknown: 'Consent state unknown',
  not_required: 'No banner shown (outside EU/UK/CH)',
} as const

// Ad-cookie consent of one website inquiry. Renders nothing when the inquiry has no consent data.
export function AdConsentBadge({ consent, region }: { consent?: string | null; region?: string | null }) {
  const c = normalizeAdConsent(consent)
  if (!c) return null
  const Icon = ICON[c]
  const regionLabel = consentRegionLabel(region)
  return (
    <span title={TITLE[c]} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${AD_CONSENT_COLOR[c]}`}>
      <Icon className="h-3 w-3" />
      Ad cookies: {AD_CONSENT_LABEL[c]}{regionLabel ? ` · ${regionLabel}` : ''}
    </span>
  )
}
