'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { terbilang } from '@/lib/terbilang'

interface CompanyInfo {
  name:    string
  logoUrl: string
  tagline: string
  address: string
  phone:   string
  website: string
  email:   string
}

interface EntryDetail {
  id: string
  employeeNumberSnap: string
  fullNameSnap: string
  positionSnap: string | null
  companyNameSnap: string | null
  npwpSnap: string | null
  nikSnap: string | null
  bankNameSnap: string | null
  bankAccountNumberSnap: string | null
  bankAccountNameSnap: string | null
  leaveBalanceSnap: number | null
  joinDateSnap: string | null
  workLocationSnap: string | null
  basicSalary: number
  functionAllowance: number
  mealAllowance: number
  uangLayar: number
  uangLayarTripDays: number | null
  commission: number
  thr: number
  otherIncomeSnap: { id: string; name: string; description: string; amount: number }[]
  bpjsJhtEmployee: number
  bpjsJpEmployee: number
  bpjsKesehatanEmployee: number
  pph21: number
  loanDeduction: number
  grossEarnings: number
  totalDeductions: number
  takeHomePay: number
  payrollPeriod: { year: number; month: number; payDate: string | null }
}

const ACCENT = '#bdac7e'
const NAVY = '#2c3a4f'
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const money = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n))

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

// "Tenure" as of this payroll period's pay date (or the 1st of its month, if no pay date
// is set yet) — not "as of today", so a historical payslip's tenure line stays correct
// even if printed again much later.
function tenureLabel(joinDate: string, asOf: Date): string {
  const start = new Date(joinDate)
  let months = (asOf.getFullYear() - start.getFullYear()) * 12 + (asOf.getMonth() - start.getMonth())
  if (asOf.getDate() < start.getDate()) months -= 1
  months = Math.max(0, months)
  const years = Math.floor(months / 12)
  return `${years} year${years === 1 ? '' : 's'}, ${months % 12} month${months % 12 === 1 ? '' : 's'}`
}

export default function PayslipPrintPage() {
  const { entryId } = useParams<{ entryId: string }>()
  const [entry, setEntry] = useState<EntryDetail | null>(null)
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const printed = useRef(false)

  useEffect(() => {
    async function load() {
      const [entryData, companyData] = await Promise.all([
        fetch(`/api/hr/payroll/entries/${entryId}`).then(r => r.ok ? r.json() : null),
        fetch('/api/admin/settings/company').then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      setEntry(entryData)
      setCompany(companyData)
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [entryId])

  useEffect(() => {
    if (!loading && entry && !printed.current) {
      printed.current = true
      setTimeout(() => window.print(), 400)
    }
  }, [loading, entry])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      Loading payslip…
    </div>
  )
  if (!entry) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      Payslip not found.
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

  const earnings = [
    { label: 'Basic Salary', value: entry.basicSalary },
    { label: 'Function Allowance', value: entry.functionAllowance },
    { label: 'Meal Allowance', value: entry.mealAllowance },
    { label: entry.uangLayarTripDays != null ? `Uang Layar (${entry.uangLayarTripDays} hari trip)` : 'Uang Layar', value: entry.uangLayar },
    { label: 'Commission', value: entry.commission },
    { label: 'THR', value: entry.thr },
    ...(entry.otherIncomeSnap ?? []).map(i => ({ label: i.name, value: i.amount })),
  ].filter(e => e.value !== 0)

  const deductions = [
    { label: 'BPJS Kesehatan', value: entry.bpjsKesehatanEmployee },
    { label: 'BPJS Ketenagakerjaan', value: entry.bpjsJhtEmployee + entry.bpjsJpEmployee },
    { label: 'Tax (PPh21)', value: entry.pph21 },
    { label: 'Loan', value: entry.loanDeduction },
  ].filter(d => d.value !== 0)

  const asOfDate = entry.payrollPeriod.payDate
    ? new Date(entry.payrollPeriod.payDate)
    : new Date(entry.payrollPeriod.year, entry.payrollPeriod.month - 1, 1)

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #f3f4f6; }
        @media print {
          @page { margin: 0; size: A4 portrait; }
          html, body { background: white; }
          .nc  { break-inside: avoid; page-break-inside: avoid; }
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
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                      {entry.payrollPeriod.payDate ? fmtDate(entry.payrollPeriod.payDate) : `${MONTH_NAMES[entry.payrollPeriod.month - 1]} ${entry.payrollPeriod.year}`}
                    </div>
                    <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>Pay Date</div>
                  </div>
                </div>

                {/* Title band */}
                <div style={{ backgroundColor: ACCENT, padding: '12px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: 'white', letterSpacing: 2 }}>PAYSLIP</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{MONTH_NAMES[entry.payrollPeriod.month - 1]} {entry.payrollPeriod.year}</div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>Payroll Period</div>
                  </div>
                </div>

                {/* Employee info grid — Name/Position, Employee ID/Join Date, Work Location/Tenure */}
                <div style={{ padding: '18px 32px 4px' }}>
                  {([
                    ['Name', entry.fullNameSnap, 'Position', entry.positionSnap ?? '—'],
                    ['Employee ID', entry.employeeNumberSnap, 'Join Date', entry.joinDateSnap ? fmtDate(entry.joinDateSnap) : '—'],
                    ['Work Location', entry.workLocationSnap ?? entry.companyNameSnap ?? '—', 'Tenure', entry.joinDateSnap ? tenureLabel(entry.joinDateSnap, asOfDate) : '—'],
                  ] as const).map(([l1, v1, l2, v2], i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 130px 1fr', padding: '5px 0', borderBottom: i < 2 ? '1px solid #f1f5f9' : 'none', fontSize: 10.5 }}>
                      <span style={{ color: '#6b7280' }}>{l1}</span>
                      <span style={{ fontWeight: 600, color: '#111827' }}>{v1}</span>
                      <span style={{ color: '#6b7280' }}>{l2}</span>
                      <span style={{ fontWeight: 600, color: '#111827' }}>{v2}</span>
                    </div>
                  ))}
                </div>

                {/* Compact secondary details not in the reference layout, kept as one small line */}
                <div style={{ padding: '4px 32px 14px', fontSize: 9, color: '#9ca3af' }}>
                  {(entry.npwpSnap || entry.nikSnap) && <span>NPWP/NIK: {entry.npwpSnap || entry.nikSnap} · </span>}
                  <span>Leave Balance: {entry.leaveBalanceSnap ?? 0} days</span>
                  {entry.bankNameSnap && (
                    <span> · Bank: {entry.bankNameSnap}{entry.bankAccountNumberSnap ? ` ${entry.bankAccountNumberSnap}` : ''}{entry.bankAccountNameSnap ? ` (${entry.bankAccountNameSnap})` : ''}</span>
                  )}
                </div>

                {/* Earnings / Deductions — side by side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '0 32px', gap: 20 }}>
                  <div>
                    <div style={{ display: 'flex', backgroundColor: NAVY, padding: '8px 14px' }}>
                      <span style={{ flex: 1, fontSize: 9.5, fontWeight: 700, color: 'white' }}>Earnings</span>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: 'white' }}>Amount</span>
                    </div>
                    {earnings.map((it, i) => (
                      <div key={i} className="nc" style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '1px solid #e5e7eb' }}>
                        <span style={{ fontSize: 10.5, color: '#111827' }}>{it.label}</span>
                        <span style={{ fontSize: 10.5, color: '#374151' }}>{money(it.value)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ display: 'flex', backgroundColor: NAVY, padding: '8px 14px' }}>
                      <span style={{ flex: 1, fontSize: 9.5, fontWeight: 700, color: 'white' }}>Deductions</span>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: 'white' }}>Amount</span>
                    </div>
                    {deductions.length === 0 ? (
                      <div style={{ padding: '7px 14px', fontSize: 10, color: '#9ca3af' }}>No deductions this period.</div>
                    ) : deductions.map((it, i) => (
                      <div key={i} className="nc" style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '1px solid #e5e7eb' }}>
                        <span style={{ fontSize: 10.5, color: '#111827' }}>{it.label}</span>
                        <span style={{ fontSize: 10.5, color: '#374151' }}>{money(it.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total */}
                <div style={{ padding: '16px 32px 20px' }}>
                  <div className="nc" style={{ border: '1px solid #e5e7eb' }}>
                    <div style={{ backgroundColor: NAVY, padding: '8px 14px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'white' }}>TOTAL TAKE-HOME PAY</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '1px solid #e5e7eb' }}>
                      <span style={{ fontSize: 10.5, color: '#6b7280' }}>Amount</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{money(entry.takeHomePay)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 14px' }}>
                      <span style={{ fontSize: 10.5, color: '#6b7280', flexShrink: 0 }}>In Words</span>
                      <span style={{ fontSize: 9.5, fontStyle: 'italic', color: '#374151', textAlign: 'right' }}>{terbilang(entry.takeHomePay)}</span>
                    </div>
                  </div>
                </div>

                {/* Spacer pushes footer to the bottom of the page */}
                <div style={{ flex: 1 }} />

                <div className="nc" style={{ padding: '0 32px 20px' }}>
                  <div style={{ fontSize: 9, color: '#9ca3af', lineHeight: 1.6 }}>
                    This payslip is computer-generated and shows the figures reviewed and approved for this payroll period.
                  </div>
                </div>

                {/* Footer */}
                <div style={{ backgroundColor: ACCENT, padding: '12px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'white' }}>{co.name}</div>
                    <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.85)', marginTop: 1 }}>{co.address}</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 8, color: 'rgba(255,255,255,0.85)' }}>
                    <div>{co.phone}</div>
                    <div>{co.email}</div>
                  </div>
                </div>

              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  )
}
