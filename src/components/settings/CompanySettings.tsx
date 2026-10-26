'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

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

  const labelClass = 'text-xs font-medium text-muted-foreground mb-1'

  if (loading) return <div className="text-sm text-muted-foreground py-4">Loading…</div>

  return (
    <div className="rounded-xl border bg-card p-5 space-y-5">
      <div>
        <h4 className="font-semibold text-sm">Company Information</h4>
        <p className="text-xs text-muted-foreground mt-0.5">Used on invoices and printed documents</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="company-name" className={labelClass}>Company Name</Label>
          <Input id="company-name" value={data.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Loho Siloina" />
        </div>
        <div>
          <Label htmlFor="company-tagline" className={labelClass}>Tagline</Label>
          <Input id="company-tagline" value={data.tagline} onChange={e => set('tagline', e.target.value)} placeholder="e.g. PREMIUM YACHT EXPERIENCES" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="company-logourl" className={labelClass}>Logo URL</Label>
          <Input id="company-logourl" value={data.logoUrl} onChange={e => set('logoUrl', e.target.value)} placeholder="https://..." />
          {data.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={data.logoUrl} alt="logo preview" className="mt-2 h-10 object-contain" />
          )}
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="company-address" className={labelClass}>Office Address</Label>
          <Textarea id="company-address" rows={2} value={data.address} onChange={e => set('address', e.target.value)} placeholder="Full address" />
        </div>
        <div>
          <Label htmlFor="company-phone" className={labelClass}>Phone / WhatsApp</Label>
          <Input id="company-phone" value={data.phone} onChange={e => set('phone', e.target.value)} placeholder="+62 ..." />
        </div>
        <div>
          <Label htmlFor="company-website" className={labelClass}>Website</Label>
          <Input id="company-website" value={data.website} onChange={e => set('website', e.target.value)} placeholder="www.example.com" />
        </div>
        <div>
          <Label htmlFor="company-email" className={labelClass}>Email</Label>
          <Input id="company-email" value={data.email} onChange={e => set('email', e.target.value)} placeholder="info@example.com" />
        </div>
      </div>

      {/* T&C toggle */}
      <div className="flex items-center justify-between rounded-lg border px-4 py-3">
        <div>
          <p className="text-sm font-medium">Show T&amp;C on Invoice</p>
          <p className="text-xs text-muted-foreground mt-0.5">Append Terms &amp; Conditions pages when printing invoice</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={data.showTnc}
          aria-label="Show T&C on Invoice"
          onClick={() => set('showTnc', !data.showTnc)}
          className={[
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            data.showTnc ? 'bg-primary' : 'bg-input',
          ].join(' ')}
        >
          <span className={[
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out',
            data.showTnc ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')} />
        </button>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
