'use client'

import { useState, useEffect } from 'react'
import { Building2, FileText } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import LegalDocumentsPanel from './LegalDocumentsPanel'

interface EmpLite { id: string; fullName: string; employeeNumber: string; department: string | null; role: string | null }
interface Cell { location: string; count: number; employees: EmpLite[] }
interface Row { entity: string; cols: Cell[] }
interface EntityLite { id: string; name: string }
interface MatrixData { entityRows: string[]; locationCols: string[]; matrix: Row[]; totalEmployees: number; entities: EntityLite[] }

export default function EntitiesAssignmentsPage({ deepLinkId, onDeepLinkHandled }: { deepLinkId?: string | null; onDeepLinkHandled?: () => void } = {}) {
  const [data, setData] = useState<MatrixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [drill, setDrill] = useState<{ entity: string; cell: Cell } | null>(null)
  const [viewEntity, setViewEntity] = useState<EntityLite | null>(null)

  useEffect(() => {
    fetch('/api/hr/entities-assignments')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Deep-link from a LEGAL_DOC_EXPIRING notification — there's no per-document modal
  // anywhere in the app, so the best landing spot is that document's entity panel.
  useEffect(() => {
    if (!deepLinkId || !data) return
    fetch(`/api/hr/legal-documents/${deepLinkId}`)
      .then(r => r.ok ? r.json() : null)
      .then(doc => {
        const entity = doc?.legalEntityId && data.entities.find(e => e.id === doc.legalEntityId)
        if (entity) setViewEntity(entity)
      })
      .finally(() => onDeepLinkHandled?.())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, data])

  if (loading) return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Entities & Assignments</h2>
        <p className="text-muted-foreground text-sm mt-1">Legal entity vs. operational work location, active employees</p>
      </div>
      <div className="rounded-xl border p-5 animate-pulse h-64" />
    </div>
  )

  if (!data) return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-destructive text-sm">
      Failed to load data.
    </div>
  )

  const { locationCols, matrix, totalEmployees, entities } = data

  if (viewEntity) {
    return <LegalDocumentsPanel owner={{ ...viewEntity, kind: 'legalEntity' }} onBack={() => setViewEntity(null)} backLabel="Entities & Assignments" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Entities & Assignments</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Who&apos;s legally employed under which PT vs. where they&apos;re operationally assigned — {totalEmployees} active employees.
          Click a legal entity to manage its legal/compliance documents.
        </p>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium sticky left-0 bg-muted/50">Legal Entity</th>
              {locationCols.map(loc => (
                <th key={loc} className="text-center px-4 py-3 font-medium whitespace-nowrap">{loc}</th>
              ))}
              <th className="text-center px-4 py-3 font-medium bg-muted/70">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {matrix.map(row => {
              const rowTotal = row.cols.reduce((s, c) => s + c.count, 0)
              if (rowTotal === 0 && row.entity === 'Unassigned') return null
              const entity = entities.find(e => e.name === row.entity)
              return (
                <tr key={row.entity} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium sticky left-0 bg-card">
                    {entity ? (
                      <button onClick={() => setViewEntity(entity)} className="flex items-center gap-1.5 hover:text-primary-strong transition-colors">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {row.entity}
                      </button>
                    ) : row.entity}
                  </td>
                  {row.cols.map(cell => (
                    <td key={cell.location} className="px-4 py-3 text-center">
                      {cell.count > 0 ? (
                        <button onClick={() => setDrill({ entity: row.entity, cell })}
                          aria-label={`${cell.count} employee${cell.count !== 1 ? 's' : ''} — ${row.entity}, ${cell.location}`}
                          className="min-w-8 px-2 py-1 rounded-md font-semibold text-primary-strong bg-primary/10 hover:bg-primary/15 transition-colors">
                          {cell.count}
                        </button>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center font-bold bg-muted/30">{rowTotal}</td>
                </tr>
              )
            })}
            <tr className="bg-muted/50 font-bold">
              <td className="px-4 py-3 sticky left-0 bg-muted/50">Total</td>
              {locationCols.map(loc => {
                const colTotal = matrix.reduce((s, row) => s + (row.cols.find(c => c.location === loc)?.count ?? 0), 0)
                return <td key={loc} className="px-4 py-3 text-center">{colTotal}</td>
              })}
              <td className="px-4 py-3 text-center">{totalEmployees}</td>
            </tr>
          </tbody>
        </table></div>
      </div>

      {/* ── Drill-down modal ── */}
      <Dialog open={!!drill} onOpenChange={o => { if (!o) setDrill(null) }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden" onInteractOutside={e => e.preventDefault()}>
          {drill && (
            <>
              <DialogHeader className="flex-row items-center gap-2 px-6 py-4 pr-12 border-b shrink-0">
                <Building2 className="h-4 w-4 text-primary-strong shrink-0" />
                <div className="text-left">
                  <DialogTitle className="font-bold text-sm">{drill.entity}</DialogTitle>
                  <DialogDescription className="text-xs">{drill.cell.location} · {drill.cell.count} employee{drill.cell.count !== 1 ? 's' : ''}</DialogDescription>
                </div>
              </DialogHeader>
              <div className="overflow-y-auto divide-y">
                {drill.cell.employees.map(e => (
                  <div key={e.id} className="px-6 py-3">
                    <p className="font-medium text-sm">{e.fullName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{e.employeeNumber} {e.department ? `· ${e.department}` : ''} {e.role ? `· ${e.role}` : ''}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
