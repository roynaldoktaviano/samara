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

interface PaklaringData {
  employeeNumber: string
  fullName: string
  nikPassport: string | null
  placeOfBirth: string | null
  birthDate: string | null
  position: string | null
  department: string | null
  location: string | null
  joinDate: string | null
  resignedAt: string
  resignStatus: string | null
  paklaringNumber: string
  paklaringIssuedAt: string
}

const ACCENT = '#bdac7e'
const NAVY = '#2c3a4f'

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

const RESIGN_STATUS_TEXT: Record<string, string> = {
  RESIGNED: 'mengundurkan diri (resign)',
  TERMINATED: 'diberhentikan',
  CONTRACT_ENDED: 'berakhir masa kontraknya',
  OTHER: 'mengakhiri hubungan kerja',
}

export default function PaklaringPrintPage() {
  const { employeeId } = useParams<{ employeeId: string }>()
  const [data, setData] = useState<PaklaringData | null>(null)
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const printed = useRef(false)

  useEffect(() => {
    async function load() {
      const [res, companyData] = await Promise.all([
        fetch(`/api/hr/separations/${employeeId}/paklaring`),
        fetch('/api/admin/settings/company').then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      if (res.ok) setData(await res.json())
      else setError((await res.json().catch(() => null))?.error ?? 'Failed to load paklaring.')
      setCompany(companyData)
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [employeeId])

  useEffect(() => {
    if (!loading && data && !printed.current) {
      printed.current = true
      setTimeout(() => window.print(), 400)
    }
  }, [loading, data])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      Loading paklaring…
    </div>
  )
  if (!data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      {error ?? 'Paklaring not found.'}
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

  const resignPhrase = RESIGN_STATUS_TEXT[data.resignStatus ?? ''] ?? 'mengakhiri hubungan kerja'

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
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'white', letterSpacing: 2 }}>SURAT KETERANGAN KERJA</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.9)', marginTop: 2, letterSpacing: 1 }}>( PAKLARING )</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>No. {data.paklaringNumber}</div>
                </div>

                {/* Body */}
                <div style={{ padding: '28px 40px', fontSize: 11, lineHeight: 1.9, color: '#1f2937', flex: 1 }}>
                  <p>Yang bertanda tangan di bawah ini, manajemen {co.name}, dengan ini menerangkan bahwa:</p>

                  <div style={{ margin: '18px 0' }}>
                    {([
                      ['Nama', data.fullName],
                      ['No. Induk Karyawan', data.employeeNumber],
                      ['NIK / No. Identitas', data.nikPassport ?? '—'],
                      ['Tempat, Tanggal Lahir', `${data.placeOfBirth ?? '—'}${data.birthDate ? `, ${fmtDate(data.birthDate)}` : ''}`],
                      ['Jabatan Terakhir', data.position ?? '—'],
                      ['Departemen / Penempatan', [data.department, data.location].filter(Boolean).join(' — ') || '—'],
                      ['Tanggal Bergabung', data.joinDate ? fmtDate(data.joinDate) : '—'],
                      ['Tanggal Berakhir Bekerja', fmtDate(data.resignedAt)],
                    ] as const).map(([label, value], i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '190px 10px 1fr', padding: '3px 0' }}>
                        <span style={{ color: '#4b5563' }}>{label}</span>
                        <span style={{ color: '#4b5563' }}>:</span>
                        <span style={{ fontWeight: 600, color: '#111827' }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  <p>
                    Yang bersangkutan benar merupakan karyawan {co.name} sejak tanggal{' '}
                    <strong>{data.joinDate ? fmtDate(data.joinDate) : '—'}</strong> sampai dengan tanggal{' '}
                    <strong>{fmtDate(data.resignedAt)}</strong>, dan telah {resignPhrase} secara baik-baik sesuai dengan
                    prosedur yang berlaku di perusahaan.
                  </p>
                  <p style={{ marginTop: 14 }}>
                    Selama masa kerjanya, yang bersangkutan telah menunjukkan dedikasi dan kinerja yang baik dalam
                    menjalankan tugas dan tanggung jawabnya.
                  </p>
                  <p style={{ marginTop: 14 }}>
                    Demikian surat keterangan kerja ini dibuat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 40 }}>
                    <div style={{ textAlign: 'center', width: 220 }}>
                      <div>Denpasar, {fmtDate(data.paklaringIssuedAt)}</div>
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
