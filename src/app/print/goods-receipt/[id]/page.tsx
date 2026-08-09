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

interface ReceiptItem {
  id: string
  itemName: string
  receivedQty: number
  unitCost: number
  outcome: string
  condition: string
  batch: string | null
  expiryDate: string | null
  notes: string | null
  unit: string | null
}

interface ReceiptDetail {
  id: string
  grNumber: string
  receiverName: string | null
  receivePhotoKey: string | null
  notes: string | null
  receivedAt: string
  items: ReceiptItem[]
  receiver: { name: string | null } | null
  receiverEmployee: { fullName: string } | null
  location: { name: string } | null
  order: { poNumber: string; supplierName: string | null } | null
}

const ACCENT = '#bdac7e'
const OUTCOME_LABEL: Record<string, string> = {
  ACCEPTED: 'Accepted', DAMAGED: 'Damaged', WRONG_ITEM: 'Wrong Item', REJECTED: 'Rejected', BACKORDERED: 'Backordered',
}
const OUTCOME_COLOR: Record<string, string> = {
  ACCEPTED: '#16a34a', DAMAGED: '#dc2626', WRONG_ITEM: '#dc2626', REJECTED: '#dc2626', BACKORDERED: '#b45309',
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

export default function GoodsReceiptPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null)
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const printed = useRef(false)

  useEffect(() => {
    async function load() {
      const [receiptData, companyData] = await Promise.all([
        fetch(`/api/purchasing/receipts/${id}`).then(r => r.ok ? r.json() : null),
        fetch('/api/admin/settings/company').then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      setReceipt(receiptData)
      setCompany(companyData)
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!loading && receipt && !printed.current) {
      printed.current = true
      setTimeout(() => window.print(), 400)
    }
  }, [loading, receipt])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      Loading goods receipt…
    </div>
  )
  if (!receipt) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      Goods receipt not found.
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

  const receivedByName = receipt.receiverName || receipt.receiver?.name || receipt.receiverEmployee?.fullName || '—'
  const total = receipt.items.reduce((s, it) => s + it.receivedQty * it.unitCost, 0)
  const hasExceptions = receipt.items.some(it => it.outcome !== 'ACCEPTED')

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #f3f4f6; }
        @media print {
          @page { margin: 0; size: A4 portrait; }
          html, body { background: white; }
          .so  { display: none !important; }
          .nc  { break-inside: avoid; page-break-inside: avoid; }
        }
        @media screen {
          table.gr { display: block; max-width: 700px; margin: 0 auto; background: white; }
          table.gr > thead, table.gr > tfoot { display: none; }
          table.gr > tbody, table.gr > tbody > tr, table.gr > tbody > tr > td { display: block; }
          body { padding: 24px 0 40px; }
        }
      `}</style>

      <table className="gr" style={{ borderCollapse: 'collapse', width: '100%', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: '#1f2937' }}>
        <thead>
          <tr>
            <td style={{ background: 'white', padding: '11px 32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 8, letterSpacing: 2, color: '#b8a882', textTransform: 'uppercase', fontWeight: 600 }}>
                  {receipt.grNumber}
                </div>
                <img src={co.logoUrl} alt={co.name} style={{ height: 22, objectFit: 'contain', display: 'block' }} />
              </div>
            </td>
          </tr>
        </thead>

        <tfoot>
          <tr>
            <td style={{ background: 'white', padding: '10px 32px 13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#374151', marginBottom: 3 }}>
                    {co.name}
                  </div>
                  <div style={{ fontSize: 8, color: '#9ca3af', lineHeight: 1.6 }}>{co.website}</div>
                </div>
                <div style={{ fontSize: 9, color: '#d1d5db' }}>Generated {fmtDate(new Date().toISOString())}</div>
              </div>
            </td>
          </tr>
        </tfoot>

        <tbody>
          <tr>
            <td>
              <div style={{ maxWidth: 700, margin: '0 auto', background: 'white', display: 'flex', flexDirection: 'column', minHeight: 'calc(297mm - 1.4cm)' }}>

                <div className="so" style={{ backgroundColor: ACCENT, height: 5, flexShrink: 0 }} />

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '14px 22px', borderRight: '1px solid #e5e7eb', minWidth: 190 }}>
                    <img src={co.logoUrl} alt={co.name} style={{ width: 120, objectFit: 'contain' }} />
                    {co.tagline && <div style={{ color: '#9ca3af', fontSize: 8, letterSpacing: 1.5, marginTop: 4 }}>{co.tagline}</div>}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px' }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', letterSpacing: 1, marginBottom: 4 }}>GOODS RECEIPT</div>
                      <div style={{ fontSize: 9, color: '#9ca3af', letterSpacing: 1, marginTop: -2, marginBottom: 4 }}>TANDA TERIMA BARANG</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#374151', fontWeight: 700 }}>{receipt.grNumber}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>Date: {fmtDate(receipt.receivedAt)}</div>
                    </div>
                    <div style={{
                      border: `2px solid ${hasExceptions ? '#dc2626' : ACCENT}`,
                      borderRadius: 6,
                      color: hasExceptions ? '#dc2626' : '#92793f',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      padding: '5px 12px',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>
                      {hasExceptions ? 'With Exceptions' : 'Received'}
                    </div>
                  </div>
                </div>

                {/* Order / Received At */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '14px 22px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
                  <div style={{ paddingRight: 20, borderRight: '1px solid #f3f4f6' }}>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: ACCENT, textTransform: 'uppercase', marginBottom: 7 }}>Purchase Order</div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{receipt.order?.poNumber ?? '—'}</div>
                    {receipt.order?.supplierName && <div style={{ color: '#6b7280', fontSize: 11, marginTop: 3 }}>{receipt.order.supplierName}</div>}
                  </div>
                  <div style={{ paddingLeft: 20 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: ACCENT, textTransform: 'uppercase', marginBottom: 7 }}>Received At</div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{receipt.location?.name ?? '—'}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                      <span style={{ color: '#9ca3af', fontSize: 10, width: 100, flexShrink: 0 }}>Received By</span>
                      <span style={{ color: '#111827', fontSize: 10, fontWeight: 500 }}>{receivedByName}</span>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div style={{ padding: '0 22px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', backgroundColor: '#f9fafb', padding: '6px 10px', borderRadius: '5px 5px 0 0', borderBottom: `2px solid ${ACCENT}`, marginTop: 14 }}>
                    <span style={{ flex: 1, fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Item</span>
                    <span style={{ width: 80, textAlign: 'right', fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Qty</span>
                    <span style={{ width: 90, textAlign: 'right', fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Unit Price</span>
                    <span style={{ width: 100, textAlign: 'right', fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Subtotal</span>
                    <span style={{ width: 90, textAlign: 'right', fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Outcome</span>
                  </div>

                  {receipt.items.map(it => (
                    <div key={it.id} className="nc" style={{ display: 'flex', alignItems: 'center', padding: '9px 10px', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ flex: 1, fontSize: 11, color: '#111827', fontWeight: 500 }}>
                        {it.itemName}
                        {it.batch && <span style={{ marginLeft: 6, fontSize: 9, color: '#9ca3af' }}>· batch {it.batch}</span>}
                        {it.expiryDate && <span style={{ marginLeft: 6, fontSize: 9, color: '#9ca3af' }}>· exp {fmtDate(it.expiryDate)}</span>}
                      </span>
                      <span style={{ width: 80, textAlign: 'right', fontSize: 11, color: '#374151' }}>{it.receivedQty} {it.unit ?? ''}</span>
                      <span style={{ width: 90, textAlign: 'right', fontSize: 11, color: '#374151' }}>Rp {new Intl.NumberFormat('id-ID').format(it.unitCost)}</span>
                      <span style={{ width: 100, textAlign: 'right', fontSize: 11, color: '#111827', fontWeight: 600 }}>Rp {new Intl.NumberFormat('id-ID').format(it.receivedQty * it.unitCost)}</span>
                      <span style={{ width: 90, textAlign: 'right', fontSize: 10, fontWeight: 700, color: OUTCOME_COLOR[it.outcome] ?? '#6b7280' }}>{OUTCOME_LABEL[it.outcome] ?? it.outcome}</span>
                    </div>
                  ))}

                  <div style={{ backgroundColor: '#f9fafb', borderRadius: '0 0 5px 5px', padding: '10px', marginBottom: 14, marginTop: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', border: `1.5px solid ${ACCENT}`, borderRadius: 5, padding: '8px 10px' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: ACCENT, textTransform: 'uppercase' }}>Total Received Value</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Rp {new Intl.NumberFormat('id-ID').format(total)}</div>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {receipt.notes && (
                  <div style={{ margin: '0 22px 12px', padding: '8px 12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, flexShrink: 0 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: '#92400e', textTransform: 'uppercase', marginBottom: 3 }}>Notes</div>
                    <div style={{ fontSize: 10, color: '#78350f' }}>{receipt.notes}</div>
                  </div>
                )}

                {/* Proof photo */}
                {receipt.receivePhotoKey && (
                  <div className="nc" style={{ margin: '0 22px 12px', flexShrink: 0 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Proof of Receipt</div>
                    <img src={receipt.receivePhotoKey} alt="Proof of receipt" style={{ maxHeight: 220, maxWidth: '100%', objectFit: 'contain', borderRadius: 5, border: '1px solid #e5e7eb' }} />
                  </div>
                )}

                {/* Signature */}
                <div className="nc" style={{ display: 'flex', justifyContent: 'space-between', margin: '20px 22px 0', flexShrink: 0 }}>
                  <div style={{ width: 200 }}>
                    <div style={{ borderTop: '1px solid #d1d5db', paddingTop: 6, fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>
                      Received By{receivedByName !== '—' ? ` (${receivedByName})` : ''}
                    </div>
                  </div>
                  <div style={{ width: 200 }}>
                    <div style={{ borderTop: '1px solid #d1d5db', paddingTop: 6, fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>Verified By</div>
                  </div>
                </div>

                <div className="so" style={{ flex: 1 }} />

                <div className="so" style={{ flexShrink: 0 }}>
                  <div style={{ margin: '20px 22px 0', paddingTop: 10, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 500 }}>{co.name}</div>
                      <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>{co.website} · {co.phone}</div>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#d1d5db' }}>{receipt.grNumber}</div>
                  </div>
                  <div style={{ backgroundColor: ACCENT, height: 5 }} />
                </div>

              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  )
}
