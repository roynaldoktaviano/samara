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

interface SupplierDetail {
  name: string
  locations: { city: string; address: string }[]
  contact: string | null
  phone: string | null
  email: string | null
}

interface OrderItem {
  itemName: string
  orderedQty: number
  unitCost: number
  unit: string | null
}

interface OrderDetail {
  id: string
  poNumber: string
  status: string
  supplierName: string | null
  supplier: SupplierDetail | null
  deliveryLocation: { name: string; type: string; address: string | null } | null
  notes: string | null
  orderedAt: string
  expectedAt: string | null
  createdAt: string
  requestedByName: string | null
  request: { prNumber: string } | null
  items: OrderItem[]
}

const ACCENT = '#bdac7e'

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

export default function PurchaseOrderPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const printed = useRef(false)

  useEffect(() => {
    async function load() {
      const [orderData, companyData] = await Promise.all([
        fetch(`/api/purchasing/orders/${id}`).then(r => r.json()),
        fetch('/api/admin/settings/company').then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      setOrder(orderData)
      setCompany(companyData)
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!loading && order && !printed.current) {
      printed.current = true
      setTimeout(() => window.print(), 400)
    }
  }, [loading, order])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      Loading purchase order…
    </div>
  )
  if (!order) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontSize: 14 }}>
      Purchase order not found.
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

  const supplierLoc = order.supplier?.locations?.[0] ?? null
  const total = order.items.reduce((s, it) => s + it.orderedQty * it.unitCost, 0)

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
          table.po { display: block; max-width: 700px; margin: 0 auto; background: white; }
          table.po > tbody, table.po > tbody > tr, table.po > tbody > tr > td { display: block; }
          body { padding: 24px 0 40px; }
        }
      `}</style>

      <table className="po" style={{ borderCollapse: 'collapse', width: '100%', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: '#1f2937' }}>
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
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{fmtDate(order.orderedAt ?? order.createdAt)}</div>
                    <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>Purchase Order Date</div>
                  </div>
                </div>

                {/* Title band */}
                <div style={{ backgroundColor: ACCENT, padding: '12px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: 'white', letterSpacing: 2 }}>PURCHASE ORDER</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>#{order.poNumber}</div>
                    {order.request?.prNumber && (
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>PR Reference: {order.request.prNumber}</div>
                    )}
                  </div>
                </div>
                {order.status === 'CANCELLED' && (
                  <div style={{ padding: '6px 32px', backgroundColor: '#fee2e2', textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#dc2626' }}>
                    VOID — THIS ORDER HAS BEEN CANCELLED
                  </div>
                )}

                {/* Vendor / Ship To */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '16px 32px', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#111827', marginBottom: 6 }}>VENDOR</div>
                    <div style={{ fontSize: 10, color: '#4b5563', lineHeight: 1.7 }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{order.supplierName ?? order.supplier?.name ?? '—'}</div>
                      {order.supplier?.contact && <div>{order.supplier.contact}</div>}
                      {order.supplier?.phone && <div>{order.supplier.phone}</div>}
                      {order.supplier?.email && <div>{order.supplier.email}</div>}
                      {supplierLoc?.address && <div>{supplierLoc.address}{supplierLoc.city ? `, ${supplierLoc.city}` : ''}</div>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#111827', marginBottom: 6 }}>SHIP TO</div>
                    <div style={{ fontSize: 10, color: '#4b5563', lineHeight: 1.7 }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{order.deliveryLocation?.name ?? '—'}</div>
                      {order.deliveryLocation?.address ? (
                        <div>{order.deliveryLocation.address}</div>
                      ) : (
                        <>
                          <div>{co.name}</div>
                          <div>{co.address}</div>
                        </>
                      )}
                      <div>{co.phone}</div>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div>
                  <div style={{ display: 'flex', backgroundColor: ACCENT, padding: '8px 32px' }}>
                    <span style={{ flex: 1, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: 'white', textTransform: 'uppercase' }}>Item Description</span>
                    <span style={{ width: 80, textAlign: 'right', fontSize: 9, fontWeight: 700, letterSpacing: 1, color: 'white', textTransform: 'uppercase' }}>Qty</span>
                    <span style={{ width: 100, textAlign: 'right', fontSize: 9, fontWeight: 700, letterSpacing: 1, color: 'white', textTransform: 'uppercase' }}>Unit Price</span>
                    <span style={{ width: 110, textAlign: 'right', fontSize: 9, fontWeight: 700, letterSpacing: 1, color: 'white', textTransform: 'uppercase' }}>Total</span>
                  </div>

                  {order.items.map((it, i) => (
                    <div key={i} className="nc" style={{ display: 'flex', alignItems: 'center', padding: '8px 32px', borderBottom: '1px solid #e5e7eb' }}>
                      <span style={{ flex: 1, fontSize: 11, color: '#111827', fontWeight: 600 }}>{it.itemName}</span>
                      <span style={{ width: 80, textAlign: 'right', fontSize: 11, color: '#374151' }}>{it.orderedQty} {it.unit ?? ''}</span>
                      <span style={{ width: 100, textAlign: 'right', fontSize: 11, color: '#374151' }}>Rp {new Intl.NumberFormat('id-ID').format(it.unitCost)}</span>
                      <span style={{ width: 110, textAlign: 'right', fontSize: 11, color: '#111827', fontWeight: 600 }}>Rp {new Intl.NumberFormat('id-ID').format(it.orderedQty * it.unitCost)}</span>
                    </div>
                  ))}

                  <div style={{ padding: '0 32px' }}>
                    <div style={{ marginTop: 10, marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={{ width: 260 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 4px' }}>
                          <span style={{ fontSize: 10, color: '#92793f', fontWeight: 600 }}>SUBTOTAL</span>
                          <span style={{ fontSize: 10, color: '#374151', fontWeight: 500 }}>Rp {new Intl.NumberFormat('id-ID').format(total)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: ACCENT, padding: '10px 12px', marginTop: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'white', textTransform: 'uppercase' }}>Total</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: 'white' }}>Rp {new Intl.NumberFormat('id-ID').format(total)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Spacer pushes Remarks + Footer to the bottom of the page */}
                <div style={{ flex: 1 }} />

                {/* Remarks */}
                <div className="nc" style={{ padding: '0 32px 20px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#111827', marginBottom: 5 }}>Remarks / Instructions</div>
                  <div style={{ fontSize: 9, color: '#6b7280', lineHeight: 1.6 }}>
                    {order.notes || 'Please review quantities and prices carefully. Report any discrepancies within 3 days of order confirmation.'}
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
