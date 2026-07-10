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
  deliveryLocation: { name: string; type: string } | null
  notes: string | null
  orderedAt: string
  expectedAt: string | null
  createdAt: string
  requestedByName: string | null
  request: { prNumber: string } | null
  items: OrderItem[]
}

const ACCENT = '#bdac7e'
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', ORDERED: 'Ordered', IN_TRANSIT: 'In Transit',
  PARTIALLY_RECEIVED: 'Partially Received', RECEIVED: 'Received', CANCELLED: 'Cancelled',
}

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
          .so  { display: none !important; }
          .nc  { break-inside: avoid; page-break-inside: avoid; }
        }
        @media screen {
          table.po { display: block; max-width: 700px; margin: 0 auto; background: white; }
          table.po > thead, table.po > tfoot { display: none; }
          table.po > tbody, table.po > tbody > tr, table.po > tbody > tr > td { display: block; }
          body { padding: 24px 0 40px; }
        }
      `}</style>

      <table className="po" style={{ borderCollapse: 'collapse', width: '100%', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", fontSize: 11, color: '#1f2937' }}>
        <thead>
          <tr>
            <td style={{ background: 'white', padding: '11px 32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 8, letterSpacing: 2, color: '#b8a882', textTransform: 'uppercase', fontWeight: 600 }}>
                  {order.poNumber}
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
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', letterSpacing: 1, marginBottom: 4 }}>PURCHASE ORDER</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#374151', fontWeight: 700 }}>{order.poNumber}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>Date: {fmtDate(order.orderedAt ?? order.createdAt)}</div>
                    </div>
                    <div style={{
                      border: `2px solid ${order.status === 'CANCELLED' ? '#dc2626' : ACCENT}`,
                      borderRadius: 6,
                      color: order.status === 'CANCELLED' ? '#dc2626' : '#92793f',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      padding: '5px 12px',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>
                      {STATUS_LABEL[order.status] ?? order.status}
                    </div>
                  </div>
                </div>

                {/* Vendor / Ship To */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '14px 22px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
                  <div style={{ paddingRight: 20, borderRight: '1px solid #f3f4f6' }}>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: ACCENT, textTransform: 'uppercase', marginBottom: 7 }}>Vendor</div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{order.supplierName ?? order.supplier?.name ?? '—'}</div>
                    {order.supplier?.contact && <div style={{ color: '#6b7280', fontSize: 11, marginTop: 3 }}>{order.supplier.contact}</div>}
                    {order.supplier?.phone && <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{order.supplier.phone}</div>}
                    {order.supplier?.email && <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{order.supplier.email}</div>}
                    {supplierLoc?.address && <div style={{ color: '#6b7280', fontSize: 11, marginTop: 3 }}>{supplierLoc.address}{supplierLoc.city ? `, ${supplierLoc.city}` : ''}</div>}
                  </div>
                  <div style={{ paddingLeft: 20 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: ACCENT, textTransform: 'uppercase', marginBottom: 7 }}>Ship To</div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{order.deliveryLocation?.name ?? '—'}</div>
                    <div style={{ color: '#6b7280', fontSize: 11, marginTop: 3 }}>{co.address}</div>
                    {([
                      ...(order.expectedAt ? [['Expected Delivery', fmtDate(order.expectedAt)]] : []),
                      ...(order.request?.prNumber ? [['PR Reference', order.request.prNumber]] : []),
                      ...(order.requestedByName ? [['Requested By', order.requestedByName]] : []),
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                        <span style={{ color: '#9ca3af', fontSize: 10, width: 100, flexShrink: 0 }}>{k}</span>
                        <span style={{ color: '#111827', fontSize: 10, fontWeight: 500 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Items */}
                <div style={{ padding: '0 22px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', backgroundColor: '#f9fafb', padding: '6px 10px', borderRadius: '5px 5px 0 0', borderBottom: `2px solid ${ACCENT}`, marginTop: 14 }}>
                    <span style={{ flex: 1, fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Item</span>
                    <span style={{ width: 90, textAlign: 'right', fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Qty</span>
                    <span style={{ width: 110, textAlign: 'right', fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Unit Price</span>
                    <span style={{ width: 120, textAlign: 'right', fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280', textTransform: 'uppercase' }}>Subtotal</span>
                  </div>

                  {order.items.map((it, i) => (
                    <div key={i} className="nc" style={{ display: 'flex', alignItems: 'center', padding: '9px 10px', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ flex: 1, fontSize: 11, color: '#111827', fontWeight: 500 }}>{it.itemName}</span>
                      <span style={{ width: 90, textAlign: 'right', fontSize: 11, color: '#374151' }}>{it.orderedQty} {it.unit ?? ''}</span>
                      <span style={{ width: 110, textAlign: 'right', fontSize: 11, color: '#374151' }}>Rp {new Intl.NumberFormat('id-ID').format(it.unitCost)}</span>
                      <span style={{ width: 120, textAlign: 'right', fontSize: 11, color: '#111827', fontWeight: 600 }}>Rp {new Intl.NumberFormat('id-ID').format(it.orderedQty * it.unitCost)}</span>
                    </div>
                  ))}

                  <div style={{ backgroundColor: '#f9fafb', borderRadius: '0 0 5px 5px', padding: '10px', marginBottom: 14, marginTop: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', border: `1.5px solid ${ACCENT}`, borderRadius: 5, padding: '8px 10px' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: ACCENT, textTransform: 'uppercase' }}>Total</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Rp {new Intl.NumberFormat('id-ID').format(total)}</div>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {order.notes && (
                  <div style={{ margin: '0 22px 12px', padding: '8px 12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, flexShrink: 0 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: '#92400e', textTransform: 'uppercase', marginBottom: 3 }}>Notes</div>
                    <div style={{ fontSize: 10, color: '#78350f' }}>{order.notes}</div>
                  </div>
                )}

                {/* Signature */}
                <div className="nc" style={{ display: 'flex', justifyContent: 'space-between', margin: '20px 22px 0', flexShrink: 0 }}>
                  <div style={{ width: 200 }}>
                    <div style={{ borderTop: '1px solid #d1d5db', paddingTop: 6, fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>Authorized Signature</div>
                  </div>
                  <div style={{ width: 200 }}>
                    <div style={{ borderTop: '1px solid #d1d5db', paddingTop: 6, fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>Vendor Acknowledgement</div>
                  </div>
                </div>

                <div className="so" style={{ flex: 1 }} />

                <div className="so" style={{ flexShrink: 0 }}>
                  <div style={{ margin: '20px 22px 0', paddingTop: 10, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 500 }}>{co.name}</div>
                      <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>{co.website} · {co.phone}</div>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#d1d5db' }}>{order.poNumber}</div>
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
