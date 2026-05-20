'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Briefcase, Plus, Search, Pencil, UserX, UserCheck,
  Loader2, Phone, Mail, Building2, Percent, RotateCw,
} from 'lucide-react'

interface AgentRecord {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  commission: number
  isActive: boolean
  createdAt: string
  _count: { bookings: number }
}

const EMPTY_FORM = { name: '', email: '', phone: '', company: '', commission: '0' }
const ACCENT = '#bdac7e'

export default function Agents() {
  const { data: session } = useSession()
  const userRole = (session?.user as { role?: string })?.role ?? ''
  const isAdmin = userRole === 'ADMIN'

  const [agents,  setAgents]  = useState<AgentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing,   setEditing]   = useState<AgentRecord | null>(null)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)

  const [confirmAgent, setConfirmAgent] = useState<AgentRecord | null>(null)
  const [toggling,     setToggling]     = useState(false)

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agents?all=true')
      if (res.ok) setAgents(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setSheetOpen(true)
  }

  const openEdit = (a: AgentRecord) => {
    setEditing(a)
    setForm({
      name:       a.name,
      email:      a.email      ?? '',
      phone:      a.phone      ?? '',
      company:    a.company    ?? '',
      commission: String(a.commission),
    })
    setSheetOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const url    = editing ? `/api/agents/${editing.id}` : '/api/agents'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:       form.name.trim(),
          email:      form.email.trim()   || null,
          phone:      form.phone.trim()   || null,
          company:    form.company.trim() || null,
          commission: parseFloat(form.commission) || 0,
        }),
      })
      if (res.ok) { await fetchAgents(); setSheetOpen(false) }
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleToggleActive = async () => {
    if (!confirmAgent) return
    setToggling(true)
    try {
      const res = await fetch(`/api/agents/${confirmAgent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: confirmAgent.name, isActive: !confirmAgent.isActive }),
      })
      if (res.ok) { await fetchAgents(); setConfirmAgent(null) }
    } catch (e) { console.error(e) }
    finally { setToggling(false) }
  }

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.company ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (a.email   ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const activeCount = agents.filter(a => a.isActive).length

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-bold tracking-tight">Agents</h3>
            <button onClick={() => fetchAgents()} title="Refresh" className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
              <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-muted-foreground text-sm">
            {loading ? '…' : `${activeCount} agen aktif`}
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={openCreate}
            style={{ backgroundColor: ACCENT, color: 'white' }}
            className="hover:opacity-90"
          >
            <Plus className="h-4 w-4 mr-2" /> Tambah Agent
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Cari nama, perusahaan, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Daftar Agent
            {!loading && (
              <span className="ml-2 font-normal text-muted-foreground text-sm">
                ({filtered.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{search ? 'Tidak ada agent ditemukan' : 'Belum ada agent'}</p>
              {isAdmin && !search && (
                <Button onClick={openCreate} variant="outline" size="sm" className="mt-3">
                  <Plus className="h-4 w-4 mr-1" /> Tambah Agent Pertama
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Agent</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Kontak</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-center">Komisi</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-center">Bookings</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-center">Status</th>
                    {isAdmin && <th className="pb-3 font-medium text-muted-foreground text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(a => (
                    <tr key={a.id} className="hover:bg-muted/30 transition-colors">

                      {/* Avatar + name */}
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-white text-sm font-bold uppercase"
                            style={{ backgroundColor: a.isActive ? ACCENT : '#9ca3af' }}
                          >
                            {a.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold">{a.name}</div>
                            {a.company && <div className="text-xs text-muted-foreground">{a.company}</div>}
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3 pr-4">
                        <div className="space-y-0.5">
                          {a.email && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3 shrink-0" /> {a.email}
                            </div>
                          )}
                          {a.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3 shrink-0" /> {a.phone}
                            </div>
                          )}
                          {!a.email && !a.phone && <span className="text-xs text-muted-foreground/40">—</span>}
                        </div>
                      </td>

                      {/* Commission */}
                      <td className="py-3 pr-4 text-center">
                        <span className="font-semibold" style={{ color: ACCENT }}>{a.commission}%</span>
                      </td>

                      {/* Booking count */}
                      <td className="py-3 pr-4 text-center text-muted-foreground">
                        {a._count.bookings}
                      </td>

                      {/* Status badge */}
                      <td className="py-3 pr-4 text-center">
                        <Badge variant="outline" className={
                          a.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-gray-50 text-gray-500 border-gray-200'
                        }>
                          {a.isActive ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </td>

                      {/* Actions — admin only */}
                      {isAdmin && (
                        <td className="py-3 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => openEdit(a)}
                            >
                              <Pencil className="h-3 w-3 mr-1" /> Edit
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className={`h-7 px-2 text-xs ${a.isActive
                                ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                                : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                              }`}
                              onClick={() => setConfirmAgent(a)}
                            >
                              {a.isActive
                                ? <><UserX    className="h-3 w-3 mr-1" /> Nonaktifkan</>
                                : <><UserCheck className="h-3 w-3 mr-1" /> Aktifkan</>
                              }
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create / Edit Sheet (admin only) ── */}
      {isAdmin && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="sm:max-w-md flex flex-col gap-0 p-0">
            {/* Colored header */}
            <SheetHeader className="p-6 border-b" style={{ background: `linear-gradient(135deg, ${ACCENT}18, transparent)` }}>
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: ACCENT }}>
                  <Briefcase className="h-5 w-5 text-white" />
                </div>
                <div>
                  <SheetTitle>{editing ? 'Edit Agent' : 'Tambah Agent Baru'}</SheetTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {editing ? editing.name : 'Lengkapi data agent'}
                  </p>
                </div>
              </div>
            </SheetHeader>

            {/* Form */}
            <div className="flex-1 p-6 space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <Label>Nama <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Nama lengkap agent"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Perusahaan / Travel Agent</Label>
                <div className="relative">
                  <Building2 className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Nama perusahaan"
                    value={form.company}
                    onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      className="pl-9"
                      placeholder="email@..."
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Telepon</Label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="+62…"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Komisi (%)</Label>
                <div className="relative">
                  <Percent className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number" min="0" max="100" step="0.5"
                    className="pl-9"
                    value={form.commission}
                    onChange={e => setForm(f => ({ ...f, commission: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t flex gap-2">
              <Button variant="outline" onClick={() => setSheetOpen(false)} className="flex-1">
                Batal
              </Button>
              <Button
                disabled={!form.name.trim() || saving}
                onClick={handleSave}
                className="flex-1 hover:opacity-90"
                style={{ backgroundColor: ACCENT, color: 'white' }}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editing ? 'Simpan Perubahan' : 'Tambah Agent'}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* ── Confirm toggle active/inactive ── */}
      <AlertDialog open={!!confirmAgent} onOpenChange={v => !v && setConfirmAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAgent?.isActive ? 'Nonaktifkan Agent?' : 'Aktifkan Agent?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAgent?.isActive
                ? `${confirmAgent.name} tidak akan muncul sebagai pilihan di booking baru. Booking yang sudah ada tidak terpengaruh.`
                : `${confirmAgent?.name} akan aktif kembali dan bisa dipilih pada booking baru.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={toggling}
              onClick={handleToggleActive}
              className={confirmAgent?.isActive
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
            >
              {toggling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {confirmAgent?.isActive ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
