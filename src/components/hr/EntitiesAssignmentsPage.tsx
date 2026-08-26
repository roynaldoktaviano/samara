'use client'

import { useState, useEffect } from 'react'
import { Building2, X, FileText } from 'lucide-react'
import LegalDocumentsPanel from './LegalDocumentsPanel'

interface EmpLite { id: string; fullName: string; employeeNumber: string; department: string | null; role: string | null }
interface Cell { location: string; count: number; employees: EmpLite[] }
interface Row { entity: string; cols: Cell[] }
interface EntityLite { id: string; name: string }
interface MatrixData { entityRows: string[]; locationCols: string[]; matrix: Row[]; totalEmployees: number; entities: EntityLite[] }

export default function EntitiesAssignmentsPage() {
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
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-600 text-sm">
      Failed to load data.
    </div>
  )

  const { locationCols, matrix, totalEmployees, entities } = data

  if (viewEntity) {
    return <LegalDocumentsPanel entity={viewEntity} onBack={() => setViewEntity(null)} />
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
                  <td className="px-4 py-3 font-medium sticky left-0 bg-white">
                    {entity ? (
                      <button onClick={() => setViewEntity(entity)} className="flex items-center gap-1.5 hover:text-amber-700 transition-colors">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {row.entity}
                      </button>
                    ) : row.entity}
                  </td>
                  {row.cols.map(cell => (
                    <td key={cell.location} className="px-4 py-3 text-center">
                      {cell.count > 0 ? (
                        <button onClick={() => setDrill({ entity: row.entity, cell })}
                          className="min-w-8 px-2 py-1 rounded-md font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors">
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
      {drill && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-amber-600" />
                <div>
                  <h3 className="font-bold text-sm">{drill.entity}</h3>
                  <p className="text-xs text-muted-foreground">{drill.cell.location} · {drill.cell.count} employee{drill.cell.count !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button onClick={() => setDrill(null)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto divide-y">
              {drill.cell.employees.map(e => (
                <div key={e.id} className="px-6 py-3">
                  <p className="font-medium text-sm">{e.fullName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{e.employeeNumber} {e.department ? `· ${e.department}` : ''} {e.role ? `· ${e.role}` : ''}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
