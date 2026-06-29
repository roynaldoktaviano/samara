'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Download } from 'lucide-react'

interface VesselSummary { qty: number; value: number }
interface PeriodRow {
  label: string
  total: number
  value: number
  byVessel: Record<string, number>
}
interface DetailRow {
  transferId: string
  transferNumber: string
  date: string
  fromLocation: string
  toLocation: string
  itemName: string
  category: string | null
  receivedQty: number
  unitCost: number
  totalValue: number
  receivedBy: string | null
}
interface WithdrawalData {
  years: number[]
  vessels: string[]
  byVessel: Record<string, VesselSummary>
  monthly: PeriodRow[]
  weekly: PeriodRow[]
  detailByVessel: Record<string, DetailRow[]>
  totalQty: number
  totalValue: number
  rowCount: number
}

const fmtMoney = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n))
const fmtNum   = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))
const fmtDate  = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

type Tab = 'monthly' | 'weekly' | 'by-vessel'

function exportHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename + '.html'
  document.body.appendChild(a); a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function buildPdf(data: WithdrawalData, tab: Tab, year: number | null) {
  const period = year ? `Year ${year}` : 'All Periods'
  const modeLabel = tab === 'monthly' ? 'Monthly' : tab === 'weekly' ? 'Weekly' : 'By Vessel'

  const css = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#111;padding:32px;font-size:12px}
h1{font-size:20px;font-weight:700}h2{font-size:13px;font-weight:700;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #e5e7eb}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:14px;border-bottom:3px solid #111}
.badge{display:inline-block;background:#fce7f3;color:#be185d;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;margin-left:8px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin:10px 0 20px}
.card{background:#f9fafb;border-radius:8px;padding:12px;border-left:4px solid #be185d}
table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px}
thead tr{background:#111;color:#fff}th{padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
td{padding:6px 10px;border-bottom:1px solid #f3f4f6}.total-row{background:#fdf2f8;font-weight:700}
.footer{margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}`

  const summaryCards = data.vessels.map(v => {
    const s = data.byVessel[v]
    if (!s || s.qty === 0) return ''
    const pct = data.totalQty > 0 ? Math.round(s.qty / data.totalQty * 100) : 0
    return `<div class="card"><div style="font-size:10px;font-weight:700;color:#be185d;text-transform:uppercase;margin-bottom:4px">⚓ ${v}</div>
<div style="font-size:16px;font-weight:700">${fmtNum(s.qty)} units</div>
${s.value > 0 ? `<div style="font-size:10px;color:#6b7280">${fmtMoney(s.value)}</div>` : ''}
<div style="background:#e5e7eb;height:3px;margin-top:6px;border-radius:2px"><div style="background:#be185d;height:3px;border-radius:2px;width:${pct}%"></div></div>
<div style="font-size:9px;color:#9ca3af;margin-top:2px">${pct}% of total</div></div>`
  }).join('')

  let body = ''

  if (tab === 'monthly' || tab === 'weekly') {
    const periods = tab === 'monthly' ? data.monthly : data.weekly
    const header = `<tr><th>${tab === 'monthly' ? 'Month' : 'Week'}</th><th style="text-align:right">Total Units</th>
${data.vessels.map(v => `<th style="text-align:right">${v}</th>`).join('')}
${data.totalValue > 0 ? '<th style="text-align:right">Est. Value</th>' : ''}</tr>`
    const bodyRows = periods.filter(p => p.total > 0).map(p => `<tr>
<td><strong>${p.label}</strong></td>
<td style="text-align:right;font-weight:700">${fmtNum(p.total)}</td>
${data.vessels.map(v => `<td style="text-align:right">${(p.byVessel[v] ?? 0) > 0 ? fmtNum(p.byVessel[v]) : '—'}</td>`).join('')}
${data.totalValue > 0 ? `<td style="text-align:right">${p.value > 0 ? fmtMoney(p.value) : '—'}</td>` : ''}
</tr>`).join('')
    const totalRow = `<tr class="total-row"><td>TOTAL</td><td style="text-align:right">${fmtNum(data.totalQty)}</td>
${data.vessels.map(v => `<td style="text-align:right">${(data.byVessel[v]?.qty ?? 0) > 0 ? fmtNum(data.byVessel[v].qty) : '—'}</td>`).join('')}
${data.totalValue > 0 ? `<td style="text-align:right">${fmtMoney(data.totalValue)}</td>` : ''}
</tr>`
    body = `<h2>${modeLabel} Breakdown</h2><table><thead>${header}</thead><tbody>${bodyRows}${totalRow}</tbody></table>`
  } else {
    body = data.vessels.map(v => {
      const items = data.detailByVessel[v]
      if (!items?.length) return ''
      const totQty = items.reduce((s, r) => s + r.receivedQty, 0)
      const totVal = items.reduce((s, r) => s + r.totalValue, 0)
      const rows = items.map(r => `<tr>
<td>${fmtDate(r.date)}</td><td>${r.transferNumber}</td>
<td><strong>${r.itemName}</strong></td><td>${r.category ?? '—'}</td>
<td>${r.fromLocation}</td>
<td style="text-align:center">${fmtNum(r.receivedQty)}</td>
${totVal > 0 ? `<td style="text-align:right">${r.unitCost > 0 ? fmtMoney(r.totalValue) : '—'}</td>` : ''}
<td>${r.receivedBy ?? '—'}</td></tr>`).join('')
      return `<h2 style="color:#be185d">⚓ ${v} — ${fmtNum(totQty)} units${totVal > 0 ? ' · ' + fmtMoney(totVal) : ''}</h2>
<table><thead><tr><th>Date</th><th>Transfer #</th><th>Item</th><th>Category</th><th>From</th><th style="text-align:center">Qty</th>
${totVal > 0 ? '<th style="text-align:right">Value</th>' : ''}<th>Received By</th></tr></thead><tbody>${rows}
<tr class="total-row"><td colspan="5">TOTAL ${v}</td><td style="text-align:center">${fmtNum(totQty)}</td>
${totVal > 0 ? `<td style="text-align:right">${fmtMoney(totVal)}</td>` : ''}<td></td></tr></tbody></table>`
    }).join('')
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Withdrawal Report — ${modeLabel}</title><style>${css}</style></head><body>
<div class="header">
  <div><h1>Samara <span style="color:#be185d">Yachting</span></h1>
  <div style="font-size:11px;color:#6b7280;margin-top:3px">Withdrawal Report <span class="badge">${modeLabel}</span></div>
  <div style="font-size:10px;color:#9ca3af;margin-top:2px">Period: ${period} · ${new Date().toLocaleString('en-GB')}</div></div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:700;color:#be185d">${fmtNum(data.totalQty)} units</div>
    ${data.totalValue > 0 ? `<div style="font-size:13px;font-weight:600">${fmtMoney(data.totalValue)}</div>` : ''}
  </div>
</div>
<h2>Summary by Vessel</h2>
<div class="cards">${summaryCards || '<p>No data.</p>'}</div>
${body}
<div class="footer"><span>Samara Yachting</span><span>${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span></div>
</body></html>`

  exportHtml(html, `Withdrawal-${modeLabel.replace(/\s+/g, '-')}-${year ?? 'All'}`)
}

export default function WithdrawalsPage() {
  const [data, setData]     = useState<WithdrawalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]       = useState<Tab>('monthly')
  const [year, setYear]     = useState<number | null>(null)

  const load = useCallback(async (y: number | null) => {
    setLoading(true)
    const url = '/api/purchasing/reports/withdrawals' + (y ? `?year=${y}` : '')
    const res = await fetch(url)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    load(year)
  }, [load, year])

  const TABS: { key: Tab; label: string }[] = [
    { key: 'monthly',   label: 'Monthly' },
    { key: 'weekly',    label: 'Weekly' },
    { key: 'by-vessel', label: 'By Vessel' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Withdrawal Report</h2>
          <p className="text-muted-foreground text-sm mt-1">Items transferred from warehouse to each vessel</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Year filter */}
          {data && data.years.length > 0 && (
            <select
              className="h-9 border rounded-md px-3 text-sm bg-background focus:ring-1 outline-none"
              value={year ?? ''}
              onChange={e => setYear(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">All Years</option>
              {data.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          <button
            onClick={() => data && buildPdf(data, tab, year)}
            disabled={!data || data.rowCount === 0}
            className="flex items-center gap-1.5 h-9 px-3 text-sm border rounded-md bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Export PDF
          </button>
          <button
            onClick={() => load(year)}
            className="flex items-center gap-1.5 h-9 px-3 text-sm border rounded-md text-muted-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl border bg-muted/30" />)}
          </div>
          <div className="h-64 rounded-xl border bg-muted/30" />
        </div>
      ) : !data || data.rowCount === 0 ? (
        <div className="rounded-xl border border-dashed p-16 text-center text-muted-foreground">
          <p className="text-2xl mb-3">📤</p>
          <p className="font-medium text-foreground">No withdrawal data yet</p>
          <p className="text-sm mt-1">
            Data appears once stock transfers from warehouse to a vessel are marked as Received.
          </p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total Withdrawn</p>
              <p className="text-2xl font-bold mt-1">{fmtNum(data.totalQty)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">units</p>
            </div>
            {data.totalValue > 0 && (
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">Est. Total Value</p>
                <p className="text-2xl font-bold mt-1">{fmtMoney(data.totalValue)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">based on standard cost</p>
              </div>
            )}
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Active Vessels</p>
              <p className="text-2xl font-bold mt-1">{data.vessels.filter(v => (data.byVessel[v]?.qty ?? 0) > 0).length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">vessels received stock</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Transfer Records</p>
              <p className="text-2xl font-bold mt-1">{data.rowCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">line items</p>
            </div>
          </div>

          {/* Per-vessel summary bar */}
          {data.vessels.length > 0 && (
            <div className="rounded-xl border p-5 space-y-3">
              <h3 className="text-sm font-semibold">By Vessel</h3>
              {data.vessels.map(v => {
                const s = data.byVessel[v]
                if (!s || s.qty === 0) return null
                const pct = data.totalQty > 0 ? (s.qty / data.totalQty) * 100 : 0
                return (
                  <div key={v} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-28 shrink-0 truncate">⚓ {v}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-2 rounded-full bg-rose-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-semibold w-20 text-right shrink-0">{fmtNum(s.qty)}</span>
                    {s.value > 0 && <span className="text-xs text-muted-foreground w-32 text-right shrink-0">{fmtMoney(s.value)}</span>}
                  </div>
                )
              })}
            </div>
          )}

          {/* Tabs */}
          <div className="rounded-xl border overflow-hidden">
            <div className="flex border-b bg-muted/30">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                    tab === t.key
                      ? 'border-rose-500 text-rose-700 bg-white'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              {/* Monthly / Weekly table */}
              {(tab === 'monthly' || tab === 'weekly') && (() => {
                const periods = tab === 'monthly' ? data.monthly : data.weekly
                const active  = periods.filter(p => p.total > 0)
                if (active.length === 0) return (
                  <p className="text-center py-12 text-muted-foreground text-sm">No data for this period.</p>
                )
                return (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-left px-5 py-3 font-medium">{tab === 'monthly' ? 'Bulan' : 'Minggu'}</th>
                        <th className="text-right px-5 py-3 font-medium">Total</th>
                        {data.vessels.map(v => (
                          <th key={v} className="text-right px-4 py-3 font-medium">{v}</th>
                        ))}
                        {data.totalValue > 0 && <th className="text-right px-5 py-3 font-medium">Est. Value</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {active.map((p, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="px-5 py-3 font-medium">{p.label}</td>
                          <td className="px-5 py-3 text-right font-semibold tabular-nums">{fmtNum(p.total)}</td>
                          {data.vessels.map(v => (
                            <td key={v} className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                              {(p.byVessel[v] ?? 0) > 0 ? fmtNum(p.byVessel[v]) : '—'}
                            </td>
                          ))}
                          {data.totalValue > 0 && (
                            <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                              {p.value > 0 ? fmtMoney(p.value) : '—'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30 border-t text-sm font-semibold">
                      <tr>
                        <td className="px-5 py-3">TOTAL</td>
                        <td className="px-5 py-3 text-right tabular-nums">{fmtNum(data.totalQty)}</td>
                        {data.vessels.map(v => (
                          <td key={v} className="px-4 py-3 text-right tabular-nums">
                            {(data.byVessel[v]?.qty ?? 0) > 0 ? fmtNum(data.byVessel[v].qty) : '—'}
                          </td>
                        ))}
                        {data.totalValue > 0 && (
                          <td className="px-5 py-3 text-right tabular-nums">{fmtMoney(data.totalValue)}</td>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                )
              })()}

              {/* By Vessel tab */}
              {tab === 'by-vessel' && (
                <div className="divide-y">
                  {data.vessels.map(v => {
                    const items = data.detailByVessel[v]
                    if (!items?.length) return null
                    const totQty = items.reduce((s, r) => s + r.receivedQty, 0)
                    const totVal = items.reduce((s, r) => s + r.totalValue, 0)
                    return (
                      <div key={v}>
                        <div className="flex items-center justify-between px-5 py-3 bg-muted/20 border-b">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">⚓ {v}</span>
                            <span className="text-xs text-muted-foreground">{items.length} records</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="font-semibold tabular-nums">{fmtNum(totQty)} units</span>
                            {totVal > 0 && <span className="text-muted-foreground">{fmtMoney(totVal)}</span>}
                          </div>
                        </div>
                        <table className="w-full text-sm">
                          <thead className="bg-muted/10 text-xs text-muted-foreground">
                            <tr>
                              <th className="text-left px-5 py-2.5 font-medium">Date</th>
                              <th className="text-left px-5 py-2.5 font-medium">Transfer #</th>
                              <th className="text-left px-5 py-2.5 font-medium">Item</th>
                              <th className="text-left px-4 py-2.5 font-medium">Category</th>
                              <th className="text-left px-4 py-2.5 font-medium">From</th>
                              <th className="text-right px-5 py-2.5 font-medium">Qty</th>
                              {totVal > 0 && <th className="text-right px-5 py-2.5 font-medium">Value</th>}
                              <th className="text-left px-4 py-2.5 font-medium">Received By</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {items.map((r, i) => (
                              <tr key={i} className="hover:bg-muted/20">
                                <td className="px-5 py-2.5 text-muted-foreground whitespace-nowrap text-xs">{fmtDate(r.date)}</td>
                                <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{r.transferNumber}</td>
                                <td className="px-5 py-2.5 font-medium">{r.itemName}</td>
                                <td className="px-4 py-2.5 text-muted-foreground text-xs">{r.category ?? '—'}</td>
                                <td className="px-4 py-2.5 text-muted-foreground text-xs">{r.fromLocation}</td>
                                <td className="px-5 py-2.5 text-right tabular-nums font-medium">{fmtNum(r.receivedQty)}</td>
                                {totVal > 0 && (
                                  <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                                    {r.totalValue > 0 ? fmtMoney(r.totalValue) : '—'}
                                  </td>
                                )}
                                <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.receivedBy ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-muted/20 border-t text-sm font-semibold">
                            <tr>
                              <td colSpan={5} className="px-5 py-2.5 text-muted-foreground">Total {v}</td>
                              <td className="px-5 py-2.5 text-right tabular-nums">{fmtNum(totQty)}</td>
                              {totVal > 0 && <td className="px-5 py-2.5 text-right tabular-nums">{fmtMoney(totVal)}</td>}
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )
                  })}
                  {data.vessels.every(v => !data.detailByVessel[v]?.length) && (
                    <p className="text-center py-12 text-muted-foreground text-sm">No data.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
