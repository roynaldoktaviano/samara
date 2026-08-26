'use client'

import { useState, useEffect } from 'react'
import { Anchor, FileText } from 'lucide-react'
import LegalDocumentsPanel from './LegalDocumentsPanel'

interface YachtLite { id: string; name: string; model: string | null }

// HR has no access to the Yachts (fleet management) menu — that stays ADMIN-only — so this
// gives HR its own entry point onto the exact same LegalDocument rows (yachtId-scoped) that
// the Yachts page's own "Documents" action manages. One shared table, two doors in.
export default function BoatDocumentsPage({ deepLinkId, onDeepLinkHandled }: { deepLinkId?: string | null; onDeepLinkHandled?: () => void } = {}) {
  const [yachts, setYachts] = useState<YachtLite[]>([])
  const [loading, setLoading] = useState(true)
  const [viewYacht, setViewYacht] = useState<YachtLite | null>(null)

  useEffect(() => {
    fetch('/api/yachts')
      .then(r => r.ok ? r.json() : [])
      .then((d: { id: string; name: string; model: string | null }[]) => {
        setYachts(Array.isArray(d) ? d.map(y => ({ id: y.id, name: y.name, model: y.model })) : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Deep-link from a LEGAL_DOC_EXPIRING notification for a yacht-owned document —
  // there's no per-document modal, so the best landing spot is that yacht's document list.
  useEffect(() => {
    if (!deepLinkId || yachts.length === 0) return
    fetch(`/api/hr/legal-documents/${deepLinkId}`)
      .then(r => r.ok ? r.json() : null)
      .then(doc => {
        const yacht = doc?.yachtId && yachts.find(y => y.id === doc.yachtId)
        if (yacht) setViewYacht(yacht)
      })
      .finally(() => onDeepLinkHandled?.())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, yachts])

  if (viewYacht) {
    return <LegalDocumentsPanel owner={{ ...viewYacht, kind: 'yacht' }} onBack={() => setViewYacht(null)} backLabel="Boat Documents" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Boat Documents</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Per-vessel compliance documents — registry, safety certificates, permits. Click a boat to manage its documents.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border p-5 animate-pulse h-64" />
      ) : yachts.length === 0 ? (
        <div className="rounded-xl border py-12 text-center text-muted-foreground text-sm">
          <Anchor className="h-8 w-8 mx-auto mb-2 opacity-20" />
          No yachts in the fleet yet.
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden divide-y">
          {yachts.map(y => (
            <button
              key={y.id}
              onClick={() => setViewYacht(y)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <Anchor className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium text-sm">{y.name}</p>
                  {y.model && <p className="text-xs text-muted-foreground">{y.model}</p>}
                </div>
              </div>
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
