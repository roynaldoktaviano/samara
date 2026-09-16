'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'

interface CompanyInfo {
  name:    string
  logoUrl: string
  tagline: string
  address: string
  phone:   string
  website: string
  email:   string
}

interface AssignmentLetterData {
  destination: string
  purpose: string
  remark: string | null
  startDate: string
  endDate: string
  employee: {
    fullName: string
    employeeNumber: string
    position: string | null
    department: string | null
  }
  issuer: { name: string | null; title: string | null } | null
  assignmentLetterNumber: string
  assignmentLetterIssuedAt: string
}

const ACCENT = '#bdac7e'

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

export default function BusinessTripAssignmentLetterPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<AssignmentLetterData | null>(null)
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const printed = useRef(false)

  useEffect(() => {
    async function load() {
      const [res, companyData] = await Promise.all([
        fetch(`/api/hr/business-trips/${id}/assignment-letter`),
        fetch('/api/admin/settings/company').then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      if (res.ok) setData(await res.json())
      else setError((await res.json().catch(() => null))?.error ?? 'Failed to load assignment letter.')
      setCompany(companyData)
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!loading && data && !printed.current) {
      printed.current = true
      setTimeout(() => window.print(), 400)
    }
  }, [loading, data])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      Loading assignment letter…
    </div>
  )
  if (!data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      {error ?? 'Assignment letter not found.'}
    </div>
  )

  const co = company ?? {
    name:    'Samara Yachting',
    logoUrl: 'https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png',
    tagline: 'PREMIUM YACHT EXPERIENCES',
    address: 'Jalan Tukad Badung IXB No.9, Renon, Denpasar Selatan, Kota Denpasar, Bali 80234',
    phone:   '+62 859-5495-1085',
    website: 'samaraliveaboard.com',
    email:   'inquiry@samaraliveaboard.com',
  }

  const days = Math.max(0, Math.round((new Date(data.endDate).getTime() - new Date(data.startDate).getTime()) / 86400000) + 1)
  const issuerName = data.issuer?.name ?? null
  const issuerTitle = data.issuer?.title ?? 'Human Resources'

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #f3f4f6; }
        @media print {
          @page { margin: 0; size: A4 portrait; }
          html, body { background: white; }
        }
        @media screen {
          table.slip { display: block; max-width: 700px; margin: 0 auto; background: white; }
          table.slip > tbody, table.slip > tbody > tr, table.slip > tbody > tr > td { display: block; }
          body { padding: 24px 0 40px; }
        }
      `}</style>

      <table className="slip" style={{ borderCollapse: 'collapse', width: '100%', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: '#1f2937' }}>
        <tbody>
          <tr>
            <td>
              <div style={{ background: 'white', display: 'flex', flexDirection: 'column', minHeight: '297mm' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '24px 32px 16px' }}>
                  <div>
                    <img src={co.logoUrl} alt={co.name} style={{ width: 120, objectFit: 'contain' }} />
                    {co.tagline && <div style={{ color: '#9ca3af', fontSize: 8, letterSpacing: 1.5, marginTop: 6 }}>{co.tagline}</div>}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 8, color: '#9ca3af', lineHeight: 1.6 }}>
                    <div>{co.address}</div>
                    <div>{co.phone} · {co.email}</div>
                  </div>
                </div>

                {/* Title band */}
                <div style={{ backgroundColor: ACCENT, padding: '14px 32px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'white', letterSpacing: 2 }}>BUSINESS TRIP ASSIGNMENT LETTER</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>No. {data.assignmentLetterNumber}</div>
                </div>

                {/* Body */}
                <div style={{ padding: '28px 40px', fontSize: 11, lineHeight: 1.9, color: '#1f2937', flex: 1 }}>
                  <div style={{ margin: '0 0 18px' }}>
                    {([
                      ['Subject', 'Business Trip Assignment'],
                      ['Attachment', '—'],
                    ] as const).map(([label, value], i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 10px 1fr', padding: '2px 0' }}>
                        <span style={{ color: '#4b5563' }}>{label}</span>
                        <span style={{ color: '#4b5563' }}>:</span>
                        <span style={{ fontWeight: 600, color: '#111827' }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  <p>The undersigned:</p>
                  <div style={{ margin: '10px 0 18px' }}>
                    {([
                      ['Name', issuerName ?? '—'],
                      ['Position', issuerTitle],
                    ] as const).map(([label, value], i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 10px 1fr', padding: '2px 0' }}>
                        <span style={{ color: '#4b5563' }}>{label}</span>
                        <span style={{ color: '#4b5563' }}>:</span>
                        <span style={{ fontWeight: 600, color: '#111827' }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  <p>hereby assigns the following employee:</p>
                  <div style={{ margin: '10px 0 18px' }}>
                    {([
                      ['Name', data.employee.fullName],
                      ['Position', data.employee.position ?? '—'],
                      ['Employee ID', data.employee.employeeNumber],
                      ['Department', data.employee.department ?? '—'],
                    ] as const).map(([label, value], i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 10px 1fr', padding: '2px 0' }}>
                        <span style={{ color: '#4b5563' }}>{label}</span>
                        <span style={{ color: '#4b5563' }}>:</span>
                        <span style={{ fontWeight: 600, color: '#111827' }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  <p>to undertake an official business trip with the following details:</p>
                  <div style={{ margin: '10px 0 18px' }}>
                    {([
                      ['Destination', data.destination],
                      ['Purpose', data.purpose],
                      ['Period', `${fmtDate(data.startDate)} – ${fmtDate(data.endDate)} (${days} day${days !== 1 ? 's' : ''})`],
                      ...(data.remark ? [['Remark', data.remark] as const] : []),
                    ] as const).map(([label, value], i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 10px 1fr', padding: '2px 0' }}>
                        <span style={{ color: '#4b5563' }}>{label}</span>
                        <span style={{ color: '#4b5563' }}>:</span>
                        <span style={{ fontWeight: 600, color: '#111827' }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  <p>
                    This letter is issued for official purposes and shall be used accordingly by all parties concerned.
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 40 }}>
                    <div style={{ textAlign: 'center', width: 220 }}>
                      <div>Denpasar, {fmtDate(data.assignmentLetterIssuedAt)}</div>
                      <div style={{ fontWeight: 700, marginTop: 2 }}>{co.name}</div>
                      <div style={{ height: 70 }} />
                      <div style={{ fontWeight: 700, borderTop: '1px solid #1f2937', paddingTop: 4 }}>{issuerName ?? issuerTitle}</div>
                      {issuerName && <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>{issuerTitle}</div>}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ backgroundColor: ACCENT, padding: '10px 32px', textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.9)' }}>{co.name} — {co.website}</div>
                </div>

              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  )
}
