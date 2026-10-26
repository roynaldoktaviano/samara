'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Download, CheckCircle2, XCircle, RotateCcw, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface LeadContact {
  id: string
  freshsalesContactId: string
  name: string
  email: string | null
  whatsapp: string | null
  jobTitle: string | null
  salesOwnerName: string | null
}
interface AgentLead {
  id: string
  name: string
  status: 'NEW' | 'PROMOTED' | 'DISCARDED'
  createdAt: string
  promotedAt: string | null
  promotedAgent: { id: string; name: string } | null
  promotedBy: { name: string } | null
  contacts: LeadContact[]
}

const STATUS_LABEL: Record<string, string> = { NEW: 'New', PROMOTED: 'Promoted', DISCARDED: 'Discarded' }
const STATUS_TONE: Record<string, StatusTone> = { NEW: 'warning', PROMOTED: 'success', DISCARDED: 'neutral' }

export default function AgentLeadsPage() {
  const [leads, setLeads] = useState<AgentLead[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'ALL' | 'NEW' | 'PROMOTED' | 'DISCARDED'>('NEW')

  const [viewId, setViewId] = useState('113000008394')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)

  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/agents/leads')
    if (res.ok) setLeads(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function runImport() {
    setImporting(true); setImportResult(null)
    try {
      const res = await fetch('/api/agents/leads/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewId }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error ?? 'Import failed'); return }
      setImportResult(`Fetched ${data.totalFetched} contacts → ${data.groupsFound} leads (${data.leadsCreated} new, ${data.leadsUpdated} updated, ${data.leadsSkipped} skipped already-reviewed) · ${data.contactsUpserted} contacts saved.`)
      toast.success('Import complete')
      load()
    } catch {
      toast.error('Failed to reach the import endpoint')
    } finally {
      setImporting(false)
    }
  }

  async function promote(lead: AgentLead) {
    setBusyId(lead.id)
    try {
      const res = await fetch(`/api/agents/leads/${lead.id}/promote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error ?? 'Failed to promote'); return }
      toast.success(data.reusedExistingAgent ? `Added to existing agent "${data.agent.name}"` : `Agent "${data.agent.name}" created`)
      load()
    } finally {
      setBusyId(null)
    }
  }

  async function setStatus(lead: AgentLead, status: 'NEW' | 'DISCARDED') {
    setBusyId(lead.id)
    try {
      const res = await fetch(`/api/agents/leads/${lead.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error ?? 'Failed'); return }
      load()
    } finally {
      setBusyId(null)
    }
  }

  const filtered = filter === 'ALL' ? leads : leads.filter(l => l.status === filter)
  const counts = {
    NEW: leads.filter(l => l.status === 'NEW').length,
    PROMOTED: leads.filter(l => l.status === 'PROMOTED').length,
    DISCARDED: leads.filter(l => l.status === 'DISCARDED').length,
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary-strong" />
        <div>
          <h1 className="text-xl font-semibold">Agent Leads</h1>
          <p className="text-sm text-muted-foreground">Staging area for agent contacts pulled from Freshsales — review before they become real Agents.</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Import from Freshsales</h3>
        <p className="text-xs text-muted-foreground">
          Pulls every contact from the given Freshsales view, groups contacts that share the exact same name into one lead
          (e.g. one company with two different emails), and adds them here as <strong>New</strong> — nothing touches the real Agent list yet.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="agent-leads-view-id" className="shrink-0">View ID</Label>
          <Input
            id="agent-leads-view-id"
            value={viewId}
            onChange={e => setViewId(e.target.value)}
            className="w-48"
          />
          <Button onClick={runImport} loading={importing} className="font-semibold">
            {importing ? 'Importing…' : <><Download className="size-3.5" /> Import Now</>}
          </Button>
        </div>
        {importResult && <p className="text-xs text-success bg-success/10 border border-success/30 rounded-md px-3 py-2">{importResult}</p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {([
          ['NEW', `New${counts.NEW ? ` (${counts.NEW})` : ''}`],
          ['PROMOTED', `Promoted${counts.PROMOTED ? ` (${counts.PROMOTED})` : ''}`],
          ['DISCARDED', `Discarded${counts.DISCARDED ? ` (${counts.DISCARDED})` : ''}`],
          ['ALL', 'All'],
        ] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {loading ? (
          [...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />)
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border bg-card py-12 text-center text-sm text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No {filter !== 'ALL' ? STATUS_LABEL[filter].toLowerCase() : ''} agent leads yet.
          </div>
        ) : filtered.map(lead => (
          <div key={lead.id} className="rounded-xl border bg-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-muted/20 border-b">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="font-medium text-sm">{lead.name}</span>
                <StatusBadge tone={STATUS_TONE[lead.status]}>{STATUS_LABEL[lead.status]}</StatusBadge>
                <span className="text-xs text-muted-foreground">{lead.contacts.length} contact{lead.contacts.length > 1 ? 's' : ''}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {lead.status === 'PROMOTED' && lead.promotedAgent && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> {lead.promotedAgent.name}{lead.promotedBy?.name && ` · by ${lead.promotedBy.name}`}
                  </span>
                )}
                {lead.status === 'NEW' && (
                  <>
                    <Button variant="success-soft" size="sm" disabled={busyId === lead.id} onClick={() => promote(lead)}
                      className="text-xs font-semibold">
                      <CheckCircle2 className="size-3.5" /> Promote to Agent
                    </Button>
                    <Button variant="destructive-soft" size="sm" disabled={busyId === lead.id} onClick={() => setStatus(lead, 'DISCARDED')}
                      className="text-xs">
                      <XCircle className="size-3.5" /> Discard
                    </Button>
                  </>
                )}
                {lead.status === 'DISCARDED' && (
                  <Button variant="outline" size="sm" disabled={busyId === lead.id} onClick={() => setStatus(lead, 'NEW')}
                    className="text-xs text-muted-foreground hover:text-foreground">
                    <RotateCcw className="size-3.5" /> Restore
                  </Button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-1.5 font-medium">Name</th>
                  <th className="text-left px-4 py-1.5 font-medium">Email</th>
                  <th className="text-left px-4 py-1.5 font-medium">WhatsApp</th>
                  <th className="text-left px-4 py-1.5 font-medium">Job Title</th>
                  <th className="text-left px-4 py-1.5 font-medium">Sales Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lead.contacts.map(c => (
                  <tr key={c.id}>
                    <td className="px-4 py-1.5">{c.name}</td>
                    <td className="px-4 py-1.5 text-muted-foreground">{c.email ?? '—'}</td>
                    <td className="px-4 py-1.5 text-muted-foreground">{c.whatsapp ?? '—'}</td>
                    <td className="px-4 py-1.5 text-muted-foreground">{c.jobTitle ?? '—'}</td>
                    <td className="px-4 py-1.5 text-muted-foreground">{c.salesOwnerName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        ))}
      </div>
    </div>
  )
}
