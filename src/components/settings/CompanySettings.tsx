'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface CompanyInfo {
  name:    string
  logoUrl: string
  tagline: string
  address: string
  phone:   string
  website: string
  email:   string
  showTnc: boolean
}

const EMPTY: CompanyInfo = {
  name: '', logoUrl: '', tagline: '', address: '', phone: '', website: '', email: '', showTnc: true,
}

export default function CompanySettings() {
  const [data,    setData]    = useState<CompanyInfo>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    fetch('/api/admin/settings/company')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const set = (k: keyof CompanyInfo, v: string | boolean) =>
    setData(prev => ({ ...prev, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      toast.success('Company info saved')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const fieldClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'
  const labelClass = 'block text-xs font-medium text-muted-foreground mb-1'

  if (loading) return <div className="text-sm text-muted-foreground py-4">Loading…</div>

  return (
    <div className="rounded-xl border bg-card p-5 space-y-5">
      <div>
        <h4 className="font-semibold text-sm">Company Information</h4>
        <p className="text-xs text-muted-foreground mt-0.5">Used on invoices and printed documents</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Company Name</label>
          <input className={fieldClass} value={data.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Loho Siloina" />
        </div>
        <div>
          <label className={labelClass}>Tagline</label>
          <input className={fieldClass} value={data.tagline} onChange={e => set('tagline', e.target.value)} placeholder="e.g. PREMIUM YACHT EXPERIENCES" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Logo URL</label>
          <input className={fieldClass} value={data.logoUrl} onChange={e => set('logoUrl', e.target.value)} placeholder="https://..." />
          {data.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={data.logoUrl} alt="logo preview" className="mt-2 h-10 object-contain" />
          )}
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Office Address</label>
          <textarea className={fieldClass} rows={2} value={data.address} onChange={e => set('address', e.target.value)} placeholder="Full address" />
        </div>
        <div>
          <label className={labelClass}>Phone / WhatsApp</label>
          <input className={fieldClass} value={data.phone} onChange={e => set('phone', e.target.value)} placeholder="+62 ..." />
        </div>
        <div>
          <label className={labelClass}>Website</label>
          <input className={fieldClass} value={data.website} onChange={e => set('website', e.target.value)} placeholder="www.example.com" />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input className={fieldClass} value={data.email} onChange={e => set('email', e.target.value)} placeholder="info@example.com" />
        </div>
      </div>

      {/* T&C toggle */}
      <div className="flex items-center justify-between rounded-lg border px-4 py-3">
        <div>
          <p className="text-sm font-medium">Show T&amp;C on Invoice</p>
          <p className="text-xs text-muted-foreground mt-0.5">Append Terms &amp; Conditions pages when printing invoice</p>
        </div>
        <button
          onClick={() => set('showTnc', !data.showTnc)}
          className={[
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none',
            data.showTnc ? 'bg-primary' : 'bg-input',
          ].join(' ')}
        >
          <span className={[
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
            data.showTnc ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')} />
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
