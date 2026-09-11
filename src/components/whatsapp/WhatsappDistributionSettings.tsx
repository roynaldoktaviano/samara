'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Save, Shuffle, Percent, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WHATSAPP_BRANDS, WHATSAPP_BRAND_LABELS, type WhatsappBrand } from '@/lib/whatsapp-brands'

type Method = 'ROUND_ROBIN' | 'PERCENTAGE'

interface SalesUser { id: string; name: string | null; email: string }
interface Participant { userId: string; percentage: number }

export default function WhatsappDistributionSettings() {
  const [brand, setBrand] = useState<WhatsappBrand>(WHATSAPP_BRANDS[0])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([])
  const [method, setMethod] = useState<Method>('ROUND_ROBIN')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [percentages, setPercentages] = useState<Record<string, number>>({})

  const load = useCallback(async (forBrand: WhatsappBrand) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/distribution?brand=${forBrand}`)
      if (res.ok) {
        const data: { method: Method; salesUsers: SalesUser[]; participants: Participant[] } = await res.json()
        setSalesUsers(data.salesUsers)
        setMethod(data.method)
        setSelected(new Set(data.participants.map(p => p.userId)))
        setPercentages(Object.fromEntries(data.participants.map(p => [p.userId, p.percentage])))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(brand) }, [brand, load])

  function toggleUser(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedList = useMemo(() => salesUsers.filter(u => selected.has(u.id)), [salesUsers, selected])
  const totalPercentage = useMemo(
    () => selectedList.reduce((sum, u) => sum + (percentages[u.id] ?? 0), 0),
    [selectedList, percentages],
  )

  const isPercentageValid = method !== 'PERCENTAGE' || totalPercentage === 100
  const canSave = selected.size > 0 && isPercentageValid

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      const res = await fetch('/api/whatsapp/distribution', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          method,
          participants: selectedList.map(u => ({ userId: u.id, percentage: percentages[u.id] ?? 0 })),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save')
      }
      toast.success(`WhatsApp distribution saved for ${WHATSAPP_BRAND_LABELS[brand]}`)
      await load(brand)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <MessageCircle className="h-5 w-5" /> WhatsApp Distribution
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Choose which sales reps get new WhatsApp chats for each brand's number, and how they're split. A number
          that has messaged before always stays with the same sales rep — this only applies to brand-new numbers.
        </p>
      </div>

      <Tabs value={brand} onValueChange={v => setBrand(v as WhatsappBrand)}>
        <TabsList>
          {WHATSAPP_BRANDS.map(b => (
            <TabsTrigger key={b} value={b}>{WHATSAPP_BRAND_LABELS[b]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribution Method — {WHATSAPP_BRAND_LABELS[brand]}</CardTitle>
              <CardDescription>Pick one.</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup value={method} onValueChange={v => setMethod(v as Method)} className="space-y-3">
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="ROUND_ROBIN" id="method-rr" className="mt-0.5" />
                  <div>
                    <Label htmlFor="method-rr" className="font-medium cursor-pointer flex items-center gap-1.5">
                      <Shuffle className="h-3.5 w-3.5" /> Round Robin
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">New chats are handed out evenly, taking turns among the sales reps selected below.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="PERCENTAGE" id="method-pct" className="mt-0.5" />
                  <div>
                    <Label htmlFor="method-pct" className="font-medium cursor-pointer flex items-center gap-1.5">
                      <Percent className="h-3.5 w-3.5" /> Percentage
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Set a fixed percentage share for each sales rep — the total must add up to 100%.</p>
                  </div>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sales in Rotation</CardTitle>
              <CardDescription>
                {method === 'PERCENTAGE' ? 'Check a sales rep, then set their percentage share.' : 'Check the sales reps who should get chats.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {salesUsers.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No users with the Sales role yet.</p>
              )}
              {salesUsers.map(u => {
                const isChecked = selected.has(u.id)
                return (
                  <div key={u.id} className={cn('flex items-center gap-3 rounded-md px-2 py-2', isChecked && 'bg-muted/40')}>
                    <Checkbox id={`sales-${u.id}`} checked={isChecked} onCheckedChange={() => toggleUser(u.id)} />
                    <Label htmlFor={`sales-${u.id}`} className="flex-1 cursor-pointer font-normal">
                      <span className="font-medium">{u.name ?? u.email}</span>
                      <span className="text-xs text-muted-foreground ml-1.5">{u.email}</span>
                    </Label>
                    {method === 'PERCENTAGE' && isChecked && (
                      <div className="relative w-24 shrink-0">
                        <Input
                          type="number" min={0} max={100} step={1}
                          className="pl-2 pr-6 h-8 text-sm text-right"
                          value={percentages[u.id] ?? 0}
                          onChange={e => setPercentages(prev => ({ ...prev, [u.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                        />
                        <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                      </div>
                    )}
                  </div>
                )
              })}

              {method === 'PERCENTAGE' && selected.size > 0 && (
                <p className={cn('text-sm font-medium pt-2 text-right', totalPercentage === 100 ? 'text-emerald-600' : 'text-destructive')}>
                  Total: {totalPercentage}% {totalPercentage !== 100 && `(must be 100%)`}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={save} disabled={!canSave || saving}>
              <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Saving…' : `Save ${WHATSAPP_BRAND_LABELS[brand]}`}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
