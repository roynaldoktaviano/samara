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

interface OfferLetterData {
  fullName: string
  position: string | null
  location: string | null
  expectedSalary: number | null
  readyJoinDate: string | null
  offerLetterNumber: string
  offerLetterIssuedAt: string
}

const ACCENT = '#bdac7e'

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

const fmtMoney = (n: number) =>
  n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

export default function OfferingLetterPrintPage() {
  const { candidateId } = useParams<{ candidateId: string }>()
  const [data, setData] = useState<OfferLetterData | null>(null)
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const printed = useRef(false)

  useEffect(() => {
    async function load() {
      const [res, companyData] = await Promise.all([
        fetch(`/api/hr/candidates/${candidateId}/offer-letter`),
        fetch('/api/admin/settings/company').then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      if (res.ok) setData(await res.json())
      else setError((await res.json().catch(() => null))?.error ?? 'Failed to load offering letter.')
      setCompany(companyData)
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [candidateId])

  useEffect(() => {
    if (!loading && data && !printed.current) {
      printed.current = true
      setTimeout(() => window.print(), 400)
    }
  }, [loading, data])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      Loading offering letter…
    </div>
  )
  if (!data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      {error ?? 'Offering letter not found.'}
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
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'white', letterSpacing: 2 }}>OFFERING LETTER</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>No. {data.offerLetterNumber}</div>
                </div>

                {/* Body */}
                <div style={{ padding: '28px 40px', fontSize: 11, lineHeight: 1.9, color: '#1f2937', flex: 1 }}>
                  <p>Dear {data.fullName},</p>
                  <p style={{ marginTop: 10 }}>
                    Following the selection process you have completed with us, we are pleased to extend the following
                    offer of employment on behalf of {co.name}:
                  </p>

                  <div style={{ margin: '18px 0' }}>
                    {([
                      ['Name', data.fullName],
                      ['Position Offered', data.position ?? '—'],
                      ['Placement', data.location ?? '—'],
                      ['Offered Salary', data.expectedSalary != null ? `${fmtMoney(data.expectedSalary)} / month` : 'To be agreed upon'],
                      ['Estimated Start Date', data.readyJoinDate ? fmtDate(data.readyJoinDate) : 'To be agreed upon'],
                    ] as const).map(([label, value], i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '220px 10px 1fr', padding: '3px 0' }}>
                        <span style={{ color: '#4b5563' }}>{label}</span>
                        <span style={{ color: '#4b5563' }}>:</span>
                        <span style={{ fontWeight: 600, color: '#111827' }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  <p>
                    This offer remains valid for 7 (seven) calendar days from the date this letter is issued. Please
                    confirm your acceptance to our Human Resources team no later than that date.
                  </p>
                  <p style={{ marginTop: 14 }}>
                    Further terms regarding your rights and obligations during your employment will be set out in a
                    separate employment agreement once this offer is accepted.
                  </p>
                  <p style={{ marginTop: 14 }}>
                    We look forward to your positive response and hope to welcome you to our team soon.
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 40 }}>
                    <div style={{ textAlign: 'center', width: 220 }}>
                      <div>Denpasar, {fmtDate(data.offerLetterIssuedAt)}</div>
                      <div style={{ fontWeight: 700, marginTop: 2 }}>{co.name}</div>
                      <div style={{ height: 70 }} />
                      <div style={{ fontWeight: 700, borderTop: '1px solid #1f2937', paddingTop: 4 }}>Human Resources</div>
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
