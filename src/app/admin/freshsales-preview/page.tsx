'use client'

import { useState, useCallback, useEffect } from 'react'

// Temporary, throwaway page — peek at a Freshsales contact view (who's in it, how
// many) before deciding what the real newsletter sync needs. Delete this page (and
// /api/admin/freshsales-preview) once that's decided.

interface ContactRow {
  id: number | string
  display_name?: string
  first_name?: string
  last_name?: string
  email?: string
  owner_id?: number | string | null
  custom_field?: {
    cf_whatsapp_number?: string
    cf_trip_type?: string
    cf_number_of_guests?: string
    cf_details_and_special_requests?: string
    cf_trip_date?: string
    cf_check_out_date?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface OwnerUser {
  id: number | string
  display_name?: string
  email?: string
}

const fmtCfDate = (d?: string) => {
  if (!d) return '—'
  const parsed = new Date(d)
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function FreshsalesPreviewPage() {
  const [page, setPage] = useState(1)
  const [viewId, setViewId] = useState('13000726037')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [owners, setOwners] = useState<Record<string, OwnerUser>>({})
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [raw, setRaw] = useState<unknown>(null)
  const [sort, setSort] = useState<'created_at' | 'updated_at'>('created_at')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/freshsales-preview?page=${page}&view_id=${viewId}&sort=${sort}&sort_type=desc`)
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ? JSON.stringify(data) : `HTTP ${res.status}`)
        setContacts([])
        setMeta(null)
        setRaw(data)
        return
      }
      setRaw(data)
      setMeta(data.meta ?? null)
      const list: ContactRow[] = Array.isArray(data.contacts) ? data.contacts : []
      setContacts(list)
      const userList: OwnerUser[] = Array.isArray(data.users) ? data.users : []
      setOwners(Object.fromEntries(userList.map(u => [String(u.id), u])))
    } catch {
      setError('Failed to reach the preview endpoint')
    } finally {
      setLoading(false)
    }
  }, [page, viewId, sort])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', padding: '24px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Freshsales Contact Preview</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        Halaman sementara — cuma buat lihat isi &amp; jumlah kontak dari sebuah Freshsales view. Hapus setelah selesai dipakai.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13 }}>
          View ID:{' '}
          <input
            value={viewId}
            onChange={e => setViewId(e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 13, width: 160 }}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          Urutkan:{' '}
          <select
            value={sort}
            onChange={e => { setSort(e.target.value as 'created_at' | 'updated_at'); setPage(1) }}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
          >
            <option value="created_at">Terbaru dibuat</option>
            <option value="updated_at">Terbaru diupdate</option>
          </select>
        </label>
        <button
          onClick={() => { setPage(1); load() }}
          style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 12px', fontSize: 13, cursor: 'pointer' }}
        >
          Refresh
        </button>
        <label style={{ fontSize: 13, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={showRaw} onChange={e => setShowRaw(e.target.checked)} />
          Show raw JSON
        </label>
      </div>

      {loading && <p style={{ fontSize: 13, color: '#6b7280' }}>Loading…</p>}
      {error && (
        <pre style={{ background: '#fef2f2', color: '#b91c1c', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto', marginBottom: 16 }}>
          {error}
        </pre>
      )}

      {!loading && !error && (
        <>
          <p style={{ fontSize: 13, marginBottom: 8 }}>
            <strong>{contacts.length}</strong> kontak di halaman ini
            {meta && typeof meta.total === 'number' && <> — total keseluruhan: <strong>{String(meta.total)}</strong></>}
          </p>

          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1500 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left', whiteSpace: 'nowrap' }}>
                <th style={{ padding: '6px 8px' }}>ID</th>
                <th style={{ padding: '6px 8px' }}>Nama</th>
                <th style={{ padding: '6px 8px' }}>Email</th>
                <th style={{ padding: '6px 8px' }}>Sales Owner</th>
                <th style={{ padding: '6px 8px' }}>WhatsApp</th>
                <th style={{ padding: '6px 8px' }}>Trip Type</th>
                <th style={{ padding: '6px 8px' }}>Guests</th>
                <th style={{ padding: '6px 8px' }}>Trip Date</th>
                <th style={{ padding: '6px 8px' }}>Check-out</th>
                <th style={{ padding: '6px 8px' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '6px 8px', color: '#6b7280' }}>{c.id}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{c.display_name ?? (`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || '—')}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{c.email ?? '—'}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{(c.owner_id != null && owners[String(c.owner_id)]?.display_name) ?? '—'}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{c.custom_field?.cf_whatsapp_number ?? '—'}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{c.custom_field?.cf_trip_type ?? '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{c.custom_field?.cf_number_of_guests ?? '—'}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtCfDate(c.custom_field?.cf_trip_date)}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtCfDate(c.custom_field?.cf_check_out_date)}</td>
                  <td style={{ padding: '6px 8px', maxWidth: 420 }}>{c.custom_field?.cf_details_and_special_requests ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 12px', fontSize: 13, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: 13 }}>Halaman {page}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 12px', fontSize: 13, cursor: 'pointer' }}
            >
              Next →
            </button>
          </div>
        </>
      )}

      {showRaw && (
        <pre style={{ marginTop: 20, background: '#f9fafb', padding: 12, borderRadius: 8, fontSize: 11, overflowX: 'auto', maxHeight: 400 }}>
          {JSON.stringify(raw, null, 2)}
        </pre>
      )}
    </div>
  )
}
