'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { RupiahInput } from '@/components/ui/rupiah-input'
import { X, Check, Mail, Megaphone, Search, MessageCircle, ImageIcon, Globe, Users2, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { CHANNEL_LABELS, type CampaignChannelType } from './campaignTypes'
import { useMarketingTeam, ownerOptionNames } from '@/components/marketing/shared/useMarketingTeam'

const CHANNEL_ICONS: Record<CampaignChannelType, React.ElementType> = {
  EMAIL: Mail, META_ADS: Megaphone, GOOGLE_ADS: Search, WHATSAPP: MessageCircle,
  ORGANIC_SOCIAL: ImageIcon, LANDING_PAGE: Globe, AGENT_OUTREACH: Users2, OTHER: Layers,
}

// Visual language mirrors proto-3's CreateCampaign modal (src/app/proto-3/App.jsx) as closely
// as Tailwind utilities allow: dark near-black primary action (not this app's gold accent),
// tiny dense type, a 4-circle wizard-steps bar, and a 2-column form-grid. Scoped to this one
// dialog only — every other Campaign/Content Studio surface keeps the app's usual gold accent.
const STEPS = ['Campaign', 'Components', 'Audience', 'Create'] as const
const CHANNEL_TYPES = Object.keys(CHANNEL_LABELS) as CampaignChannelType[]

const CHANNEL_HINTS: Record<CampaignChannelType, string> = {
  EMAIL: 'Mailings and journeys',
  META_ADS: 'Campaigns, ad sets and ads',
  GOOGLE_ADS: 'Search, display and video',
  WHATSAPP: 'Broadcasts and follow-up',
  ORGANIC_SOCIAL: 'Posts, Stories and Reels',
  LANDING_PAGE: 'Build and publish to website',
  AGENT_OUTREACH: 'Personal and bulk outreach',
  OTHER: 'Events, PR or offline work',
}

function label(text: string) {
  return <label className="block text-[9px] text-[#5f656c] mb-1.5">{text}</label>
}

function inputCls() {
  return 'block w-full h-[38px] rounded-md border border-[#dce0e4] px-2.5 text-[11px] text-[#2a2d31] bg-white focus:outline-none focus:ring-1 focus:ring-[#22262b]'
}

function TagField({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState('')
  const add = () => { if (input.trim()) { onChange([...values, input.trim()]); setInput('') } }
  return (
    <div className="min-h-10 border border-[#dce0e4] rounded-md flex items-center gap-1.5 flex-wrap p-1.5">
      {values.map((v, i) => (
        <span key={i} className="text-[9px] bg-[#eef2f9] text-[#355a91] rounded px-1.5 py-1 inline-flex items-center gap-1">
          {v}
          <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))}><X className="h-2.5 w-2.5" /></button>
        </span>
      ))}
      <input
        value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        onBlur={add} placeholder={placeholder}
        className="flex-1 min-w-[100px] h-[26px] text-[11px] border-0 focus:outline-none"
      />
    </div>
  )
}

export default function CampaignHubEditor({ open, onOpenChange, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: string) => void
}) {
  const { data: session } = useSession()
  const team = useMarketingTeam()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [objective, setObjective] = useState('')
  const [targetResult, setTargetResult] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [plannedBudget, setPlannedBudget] = useState('')
  const [channelTypes, setChannelTypes] = useState<CampaignChannelType[]>(['EMAIL'])
  const [audienceSegments, setAudienceSegments] = useState<string[]>([])
  const [markets, setMarkets] = useState<string[]>([])
  const [masterLanguage, setMasterLanguage] = useState('English')
  const [additionalLanguages, setAdditionalLanguages] = useState<string[]>([])
  const [exclusions, setExclusions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const toggleChannel = (t: CampaignChannelType) => setChannelTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const reset = () => {
    setStep(1); setName(''); setBrand(''); setObjective(''); setTargetResult(''); setOwnerName('')
    setStartDate(''); setEndDate(''); setPlannedBudget(''); setChannelTypes(['EMAIL'])
    setAudienceSegments([]); setMarkets([]); setMasterLanguage('English'); setAdditionalLanguages([]); setExclusions([])
  }

  const close = () => { if (!saving) { onOpenChange(false); reset() } }

  const submit = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/marketing/campaign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, brand: brand || null, objective: objective || null, targetResult: targetResult || null,
          ownerName: ownerName || session?.user?.name || session?.user?.email || null,
          startDate: startDate || null, endDate: endDate || null,
          plannedBudget: plannedBudget ? Number(plannedBudget) : null,
          channelTypes, audienceSegments, markets, masterLanguage, additionalLanguages, exclusions,
        }),
      })
      if (!res.ok) { toast.error((await res.json().catch(() => null))?.error ?? 'Failed to create campaign'); return }
      const campaign = await res.json()
      toast.success('Campaign created')
      onOpenChange(false)
      reset()
      onCreated(campaign.id)
    } finally {
      setSaving(false)
    }
  }

  const stepTitle = step === 1 ? 'Define the campaign' : step === 2 ? 'Choose campaign components' : step === 3 ? 'Audience & markets' : 'Review and create'
  const stepDesc = step === 1 ? 'Start with the commercial purpose. Details can be completed with the team later.'
    : step === 2 ? 'Select only the channels and activities this campaign needs.'
    : step === 3 ? 'Set the shared targeting foundation for all selected components.'
    : 'The system will create the required workspaces and content queue.'

  return (
    <Dialog open={open} onOpenChange={o => !o && close()}>
      <DialogContent showCloseButton={false} className="p-0 gap-0 rounded-xl overflow-hidden border-0 shadow-[0_20px_60px_rgba(0,0,0,.23)] w-[min(820px,95vw)] sm:max-w-[820px]">
        {/* Modal head */}
        <div className="min-h-[86px] flex items-center justify-between px-[21px] py-[17px] border-b border-[#e6e8eb]">
          <div>
            <div className="text-[10px] tracking-[.12em] font-bold text-[#9b7c43] mb-1.5">NEW CAMPAIGN</div>
            <DialogTitle className="text-[17px] font-semibold text-[#1c1e21] m-0">{stepTitle}</DialogTitle>
            <DialogDescription className="text-[9px] text-[#80858d] m-0 mt-1">{stepDesc}</DialogDescription>
          </div>
          <button onClick={close} className="h-[30px] w-[30px] rounded-full bg-[#f1f3f4] grid place-items-center text-[#5b6067] shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Wizard steps */}
        <div className="h-14 bg-[#f8f9fa] border-b border-[#e4e7e9] flex items-center justify-center">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center min-w-[130px] sm:min-w-[150px] relative">
              <span className={`h-[22px] w-[22px] rounded-full border grid place-items-center text-[9px] shrink-0 ${
                step > i + 1 ? 'bg-[#1ba36a] border-[#1ba36a] text-white' : step === i + 1 ? 'bg-[#22262b] border-[#22262b] text-white' : 'border-[#cbd0d5] text-[#7d828a]'
              }`}>
                {step > i + 1 ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <b className={`text-[9px] ml-1.5 font-normal hidden sm:inline ${step === i + 1 ? 'text-[#222] font-medium' : 'text-[#8a8f96]'}`}>{s}</b>
              {i < STEPS.length - 1 && <span className="h-px w-[30px] sm:w-[45px] bg-[#d9dde1] mx-2 sm:mx-3" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="min-h-[390px] max-h-[58vh] overflow-y-auto px-[22px] sm:px-[27px] py-[22px]">
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                {label('CAMPAIGN NAME')}
                <input className={inputCls()} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Otium Raja Ampat 2027" autoFocus />
              </div>
              <div>
                {label('BRAND')}
                <input className={inputCls()} value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Otium" />
              </div>
              <div>
                {label('CAMPAIGN OWNER')}
                <select className={inputCls()} value={ownerName} onChange={e => setOwnerName(e.target.value)}>
                  <option value="">{session?.user?.name ?? 'Unassigned'}</option>
                  {ownerOptionNames(team, null).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                {label('PRIMARY OBJECTIVE')}
                <input className={inputCls()} value={objective} onChange={e => setObjective(e.target.value)} placeholder="e.g. Generate qualified enquiries" />
              </div>
              <div>
                {label('TARGET RESULT')}
                <input className={inputCls()} value={targetResult} onChange={e => setTargetResult(e.target.value)} placeholder="e.g. 3 confirmed charters" />
              </div>
              <div>
                {label('START DATE')}
                <input type="date" className={inputCls()} value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                {label('END DATE')}
                <input type="date" className={inputCls()} value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                {label('PLANNED BUDGET (OPTIONAL)')}
                <RupiahInput value={plannedBudget} onChange={setPlannedBudget} className="h-[38px] text-[11px] rounded-md border-[#dce0e4] focus:ring-[#22262b]" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {CHANNEL_TYPES.map(t => {
                  const selected = channelTypes.includes(t)
                  const Icon = CHANNEL_ICONS[t]
                  return (
                    <button
                      key={t} type="button" onClick={() => toggleChannel(t)}
                      className={`h-32 rounded-lg border p-3 text-left relative transition-colors ${selected ? 'border-[#2b65d6] bg-[#f5f8ff] ring-1 ring-[#2b65d6]' : 'border-[#dfe3e7] bg-white hover:bg-[#fafbfc]'}`}
                    >
                      <span className="h-9 w-9 rounded-md bg-[#eff1f3] grid place-items-center text-[#596068]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <strong className="text-[10px] block mt-2.5 mb-1 text-[#1c1e21]">{CHANNEL_LABELS[t]}</strong>
                      <small className="text-[8px] text-[#858a91] leading-snug block">{CHANNEL_HINTS[t]}</small>
                      <span className={`absolute right-2 top-2 h-[18px] w-[18px] rounded-full border grid place-items-center ${selected ? 'bg-[#2462d4] border-[#2462d4] text-white' : 'border-[#d3d7db] text-white'}`}>
                        {selected && <Check className="h-2.5 w-2.5" />}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-3.5 bg-[#fff8eb] border border-[#f1dfb9] rounded-lg p-2.5 flex gap-2 text-[#9b6b18]">
                <div>
                  <strong className="text-[9px] block">{channelTypes.length} component{channelTypes.length === 1 ? '' : 's'} selected</strong>
                  <p className="text-[8px] text-[#806f53] mt-0.5 m-0">The campaign will get a shared brief plus a dedicated workspace and content queue for each component.</p>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                {label('AUDIENCE SEGMENTS')}
                <TagField values={audienceSegments} onChange={setAudienceSegments} placeholder="Add audience..." />
              </div>
              <div className="sm:col-span-2">
                {label('MARKETS')}
                <TagField values={markets} onChange={setMarkets} placeholder="Add country or region..." />
              </div>
              <div>
                {label('MASTER LANGUAGE')}
                <input className={inputCls()} value={masterLanguage} onChange={e => setMasterLanguage(e.target.value)} />
              </div>
              <div>
                {label('ADDITIONAL LANGUAGES')}
                <TagField values={additionalLanguages} onChange={setAdditionalLanguages} placeholder="Add..." />
              </div>
              <div className="sm:col-span-2">
                {label('EXCLUSIONS')}
                <TagField values={exclusions} onChange={setExclusions} placeholder="Add exclusion..." />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="max-w-[560px] mx-auto">
              <div className="border border-[#e1e4e7] rounded-lg p-3.5 flex items-center gap-3">
                <span className="h-[45px] w-[45px] rounded-full bg-[#243946] text-white grid place-items-center font-semibold shrink-0">{(brand || name || 'C')[0].toUpperCase()}</span>
                <div className="flex-1 min-w-0">
                  <small className="text-[7px] tracking-[.15em] text-[#9b7d45] block">{(brand || 'CAMPAIGN').toUpperCase()}</small>
                  <h3 className="text-[14px] font-semibold m-0 my-0.5 truncate">{name || `${brand || 'New'} Campaign`}</h3>
                  <p className="text-[8px] text-[#858a91] m-0">{objective || 'No objective set'} {startDate && `· ${startDate} – ${endDate || '…'}`}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 border border-[#e1e4e7] rounded-lg mt-2.5">
                <div className="p-3 border-r border-[#eceef0]">
                  <span className="text-[7px] text-[#8a8f96] block">COMPONENTS</span>
                  <strong className="text-[15px] block my-1">{channelTypes.length}</strong>
                  <small className="text-[7px] text-[#7e848c] leading-snug">{channelTypes.map(t => CHANNEL_LABELS[t]).join(' · ') || 'None'}</small>
                </div>
                <div className="p-3 border-r border-[#eceef0]">
                  <span className="text-[7px] text-[#8a8f96] block">MARKETS</span>
                  <strong className="text-[15px] block my-1">{markets.length || '—'}</strong>
                  <small className="text-[7px] text-[#7e848c] leading-snug">{markets.join(' · ') || 'Not set'}</small>
                </div>
                <div className="p-3">
                  <span className="text-[7px] text-[#8a8f96] block">AUDIENCE SEGMENTS</span>
                  <strong className="text-[15px] block my-1">{audienceSegments.length || '—'}</strong>
                  <small className="text-[7px] text-[#7e848c] leading-snug">{audienceSegments.join(' · ') || 'Not set'}</small>
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-[10px] font-semibold mb-1">What the system will create</h3>
                {[
                  'A shared campaign brief and discussion thread',
                  `${channelTypes.length} component workspace${channelTypes.length === 1 ? '' : 's'} with its own status tracking`,
                  'A content queue scoped to this campaign in Content Studio',
                  'A budget rollup across every component',
                ].map(x => (
                  <div key={x} className="min-h-[31px] border-b border-[#eceef0] flex items-center gap-1.5 text-[9px] text-[#3a3d41]">
                    <Check className="h-3 w-3 text-[#17a066] shrink-0" /> {x}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-[62px] border-t border-[#e3e6e9] px-[22px] flex items-center justify-between">
          <button
            onClick={() => step === 1 ? close() : setStep(step - 1)}
            className="h-[35px] px-3.5 rounded-md border border-[#dfe3e7] bg-white text-[#444950] text-[11px] font-semibold"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          <span className="text-[8px] text-[#8b9097]">Step {step} of 4</span>
          <button
            onClick={() => step < 4 ? setStep(step + 1) : submit()}
            disabled={(step === 1 && !name.trim()) || saving}
            className="h-[35px] px-3.5 rounded-md bg-[#22262b] hover:bg-[#0d0f11] text-white text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {step === 4 ? (saving ? 'Creating...' : 'Create campaign') : 'Continue'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
