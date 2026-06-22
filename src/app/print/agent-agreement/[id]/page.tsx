'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

interface AgentData {
  id: string
  name: string
  country: string | null
  address: string | null
  email: string | null
  commissionOpenTrip: number
  commissionPrivateCharter: number
}

async function renderPdfPages(url: string): Promise<string[]> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return []
    const buf = await resp.arrayBuffer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjsLib = (await import('pdfjs-dist')) as any
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
    const images: string[] = []
    for (let p = 1; p <= pdf.numPages; p++) {
      const page     = await pdf.getPage(p)
      const viewport = page.getViewport({ scale: 2 })
      const canvas   = document.createElement('canvas')
      canvas.width   = viewport.width
      canvas.height  = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      images.push(canvas.toDataURL('image/jpeg', 0.92))
    }
    return images
  } catch { return [] }
}

function formatDate(d: Date) {
  const day = d.getDate()
  const suffix = [11,12,13].includes(day) ? 'th'
    : day % 10 === 1 ? 'st'
    : day % 10 === 2 ? 'nd'
    : day % 10 === 3 ? 'rd' : 'th'
  return `${day}${suffix} ${d.toLocaleString('en-US',{month:'short'})} ${d.getFullYear()}`
}

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&display=swap');

  @page { size: A4; margin: 0; }

  *, *::before, *::after {
    box-sizing: border-box; margin: 0; padding: 0;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  html, body {
    background: #d0d0d0;
    font-family: 'Times New Roman', Times, serif;
    font-size: 10pt;
    color: #111;
  }

  /* ── Controls (screen only) ── */
  .controls {
    position: fixed; top: 0; left: 0; right: 0; z-index: 999;
    background: #fff; border-bottom: 1px solid #ddd;
    padding: 9px 20px; display: flex; align-items: center; gap: 12px;
    font-family: -apple-system,sans-serif; font-size: 13px;
  }
  .controls label { font-weight: 600; }
  .controls input {
    border: 1px solid #ccc; border-radius: 4px; padding: 4px 8px;
    font-size: 13px; width: 185px;
  }
  .controls button {
    background: #1a3050; color: #fff; border: none; border-radius: 4px;
    padding: 5px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .controls .hint { color: #aaa; font-size: 11px; }

  /* ── Page wrapper ── */
  .page-wrap {
    padding-top: 56px;
    display: flex; flex-direction: column; align-items: center; gap: 20px;
    padding-bottom: 40px;
  }

  /* ── Every page is exactly A4 ── */
  .page {
    width: 210mm;
    height: 297mm;
    background: #fff;
    box-shadow: 0 2px 18px rgba(0,0,0,.22);
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  /* ══════ COVER ══════ */
  .cover {
    background-color: #1a3050 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    color: #fff;
    padding: 48mm 22mm 18mm;
  }
  .cover-top { margin-bottom: auto; text-align: center; }
  .cover-brand {
    font-family: 'Cormorant Garamond', 'Palatino Linotype', serif;
    font-size: 38pt; font-weight: 300; letter-spacing: 0.28em;
    color: #fff !important; line-height: 1;
  }
  .cover-rule {
    width: 52px; height: 1px;
    background: rgba(255,255,255,.35) !important;
    margin: 8px auto;
  }
  .cover-sub {
    font-family: -apple-system,'Helvetica Neue',sans-serif;
    font-size: 7.5pt; letter-spacing: 0.52em; font-weight: 300;
    color: rgba(255,255,255,.72) !important; margin-top: 2px;
  }
  .cover-title { text-align: center; margin-bottom: 56mm; }
  .cover-title h1 {
    font-family: 'Cormorant Garamond', 'Palatino Linotype', serif;
    font-size: 28pt; font-weight: 400; letter-spacing: 0.05em;
    line-height: 1.38; color: #fff !important;
  }
  .cover-url {
    font-family: -apple-system,sans-serif; font-size: 8.5pt;
    color: rgba(255,255,255,.52) !important; letter-spacing: 0.04em;
  }

  /* ══════ CONTENT PAGES ══════ */
  /* ─ HEADER band ─ */
  .pg-header {
    background-color: #1a3050 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 16mm 11px;
    flex-shrink: 0;
  }
  .hdr-logo .brand {
    font-family: 'Cormorant Garamond','Palatino Linotype',serif;
    font-size: 17pt; font-weight: 400; letter-spacing: 0.22em;
    color: #fff !important; line-height: 1;
  }
  .hdr-logo .sub {
    font-family: -apple-system,'Helvetica Neue',sans-serif;
    font-size: 6pt; letter-spacing: 0.44em; font-weight: 300;
    color: rgba(255,255,255,.72) !important; margin-top: 3px;
  }
  .hdr-addr {
    font-family: -apple-system,'Helvetica Neue',sans-serif;
    font-size: 6pt; color: rgba(255,255,255,.72) !important;
    text-align: right; line-height: 1.6;
  }

  /* ─ BODY area ─ */
  .pg-body {
    flex: 1;
    padding: 9mm 16mm 6mm;
    overflow: hidden;
    display: flex; flex-direction: column;
  }

  /* ─ FOOTER band ─ */
  .pg-footer {
    background-color: #1a3050 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 6mm;
    padding: 8px 16mm;
    align-items: center;
    flex-shrink: 0;
  }
  .ft-addr {
    font-family: -apple-system,'Helvetica Neue',sans-serif;
    font-size: 5.5pt; color: rgba(255,255,255,.72) !important;
    line-height: 1.65;
  }
  .ft-addr strong { color: rgba(255,255,255,.9) !important; font-size: 6pt; display: block; }
  .ft-num {
    font-family: -apple-system,'Helvetica Neue',sans-serif;
    font-size: 9pt; color: rgba(255,255,255,.9) !important;
    text-align: center; font-weight: 400;
  }
  .ft-contact {
    font-family: -apple-system,'Helvetica Neue',sans-serif;
    font-size: 5.5pt; color: rgba(255,255,255,.72) !important;
    text-align: right; line-height: 1.65;
  }

  /* ─ Typography ─ */
  .doc-title {
    font-family: 'Helvetica Neue',Arial,sans-serif;
    font-size: 12pt; font-weight: 700; text-align: center;
    margin-bottom: 9px; letter-spacing: 0.01em;
  }
  .intro { font-size: 10pt; line-height: 1.62; text-align: justify; margin-bottom: 10px; }

  .parties { display: flex; gap: 0; margin: 8px 0 14px; }
  .party { flex: 1; }
  .party + .party { padding-left: 12mm; }
  .party-lbl { font-weight: 700; font-size: 10pt; text-align: center; display: block; margin-bottom: 6px; }
  .party-body { font-size: 9.5pt; line-height: 1.55; text-align: center; }

  .ftbl { width: 100%; border-collapse: collapse; }
  .ftbl td { padding: 3px 0 1px; vertical-align: bottom; }
  .ftbl .fl { font-weight: 700; font-size: 9.5pt; white-space: nowrap; padding-right: 3px; width: 1px; }
  .ftbl .fc { width: 1px; padding-right: 3px; font-size: 9.5pt; }
  .ftbl .fv { border-bottom: 0.5pt solid #222; padding-bottom: 1px; font-size: 9.5pt; min-width: 90px; }

  .preamble-lbl { font-weight: 700; text-align: center; font-size: 10pt; margin: 10px 0 6px; }
  .body-p { font-size: 10pt; line-height: 1.62; text-align: justify; margin-bottom: 8px; }
  .sec-h { font-weight: 700; font-size: 10pt; margin: 11px 0 5px; }

  .clauses { list-style: none; padding-left: 8mm; }
  .clauses li { display: flex; margin-bottom: 4px; font-size: 10pt; line-height: 1.6; text-align: justify; }
  .cn { min-width: 26px; flex-shrink: 0; }
  .ct { flex: 1; }

  /* Signatures */
  .sig-date { text-align: center; margin: 14px 0 20px; font-size: 10pt; }
  .sig-date .sline { display: inline-block; border-bottom: 0.5pt solid #222; min-width: 150px; margin-left: 3px; }

  /* Signature grid — 2 cols, 3 explicit rows so lines stay level */
  .sig-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto minmax(28px, auto) minmax(70px, auto);
    column-gap: 14mm;
  }
  /* row 1: labels */
  .sg-lbl {
    font-weight: 700; text-align: center;
    font-size: 10pt; padding-bottom: 10px;
  }
  /* row 2: body content */
  .sg-body { font-size: 9.5pt; line-height: 1.6; text-align: center; }
  .sg-name-row {
    display: flex; align-items: flex-end; gap: 4px;
    font-size: 9.5pt; padding-bottom: 2px;
  }
  .sg-name-row .sfl { font-weight: 700; white-space: nowrap; }
  .sg-name-row .sfv {
    flex: 1; border-bottom: 0.5pt solid #222;
    padding-bottom: 2px; min-width: 0;
  }
  /* row 3: signature lines — align-self end keeps both underlines level */
  .sg-sig-left {
    align-self: end;
    border-bottom: 0.5pt solid #222;
    height: 1px;
    margin-bottom: 2px;
  }
  .sg-sig-right {
    align-self: end;
    display: flex; align-items: flex-end; gap: 4px;
    font-size: 9.5pt;
  }
  .sg-sig-right .sfl { font-weight: 700; white-space: nowrap; }
  .sg-sig-right .sfv {
    flex: 1; border-bottom: 0.5pt solid #222;
    padding-bottom: 2px; min-width: 0;
  }

  /* Print */
  /* ── Rate tables (C&P) ── */
  .rate-tbl {
    width: 100%; border-collapse: collapse;
    font-size: 9pt; margin: 8px 0 14px;
  }
  .rate-tbl th, .rate-tbl td {
    border: 0.5pt solid #bbb;
    padding: 5px 7px;
    text-align: center;
    vertical-align: middle;
    line-height: 1.4;
  }
  .rate-tbl th {
    background-color: #f0f0f0 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    font-weight: 700; font-size: 8.5pt;
  }
  .rate-tbl td:first-child { font-weight: 700; text-align: left; }
  .rate-tbl td { font-size: 9pt; }
  .rate-tbl .na { color: #999; }
  .tbl-note { font-size: 8.5pt; line-height: 1.55; margin-bottom: 6px; }

  /* bullet sub-list inside clauses */
  .sub-list { list-style: disc; padding-left: 10mm; margin: 4px 0 4px; }
  .sub-list li { font-size: 10pt; line-height: 1.6; margin-bottom: 3px; display: list-item; }

  /* ── TnC image pages ── */
  .tnc-page { width: 210mm; height: 297mm; overflow: hidden; }
  .tnc-page img { width: 100%; height: 100%; object-fit: contain; display: block; }

  @media print {
    html,body { background: #fff !important; }
    .controls { display: none !important; }
    .page-wrap { padding-top: 0; gap: 0; padding-bottom: 0; }
    .page { box-shadow: none; page-break-after: always; break-after: page; }
    .page:last-child { page-break-after: avoid; break-after: avoid; }
    .cover,
    .pg-header,
    .pg-footer {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
  }
`

function Header() {
  return (
    <div className="pg-header">
      <div className="hdr-logo">
        <div className="brand">SAMARA</div>
        <div className="sub">YACHTING</div>
      </div>
    </div>
  )
}

function Footer({ n }: { n: number }) {
  return (
    <div className="pg-footer">
      <div className="ft-addr">
        <strong>Office Address</strong>
        Jalan Tukad Badung IXB No.9, Renon,<br />
        Denpasar Selatan, Kota Denpasar,<br />
        Bali 80234<br /><br />
        Phone/WhatsApp<br />
        +62 859-5495-1085
      </div>
      <div className="ft-num">{n}</div>
      <div className="ft-contact">
        www.samarayachting.com<br />
        inquiry@samarayachting.com<br />
        @samara.liveaboard<br />
        @otiumyacht<br />
        @mischief.voyage
      </div>
    </div>
  )
}

export default function AgentAgreementPrint() {
  const { id } = useParams<{ id: string }>()
  const sp = useSearchParams()
  const [agent, setAgent] = useState<AgentData | null>(null)
  const [signDate, setSignDate] = useState(formatDate(new Date()))
  const [loading, setLoading] = useState(true)
  const [tncPages, setTncPages] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const [d, tncImages] = await Promise.all([
        fetch(`/api/agents/${id}`).then(r => r.json()),
        renderPdfPages('/api/public/tnc-pdf'),
      ])
      setAgent(d)
      if (tncImages.length) setTncPages(tncImages)
      setLoading(false)
      const today = new Date()
      const dd = String(today.getDate()).padStart(2,'0')
      const mm = String(today.getMonth()+1).padStart(2,'0')
      const yyyy = today.getFullYear()
      const safeName = (d.name as string).replace(/[^a-zA-Z0-9]/g, '_')
      document.title = `${safeName}_Contract_${dd}-${mm}-${yyyy}`
    }
    load().catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    const d = sp.get('date'); if (d) setSignDate(d)
  }, [sp])

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'sans-serif',color:'#888'}}>Loading…</div>
  if (!agent)  return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontFamily:'sans-serif',color:'#c00'}}>Agent not found.</div>

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      {/* Screen controls */}
      <div className="controls">
        <label>Signed date:</label>
        <input value={signDate} onChange={e => setSignDate(e.target.value)} placeholder="15th Dec 2025" />
        <button onClick={() => window.print()}>🖨 Print / Save as PDF</button>
        <span className="hint">Print dialog: Margins → None · Background graphics → ✓ ON</span>
      </div>

      <div className="page-wrap">

        {/* ══ PAGE 1 — COVER ══ */}
        <div className="page">
          <div className="cover">
            <div className="cover-top">
              <div className="cover-brand">SAMARA</div>
              <div className="cover-rule" />
              <div className="cover-sub">YACHTING</div>
            </div>
            <div className="cover-title">
              <h1>AGENT AGREEMENT<br />SAMARA YACHTING</h1>
            </div>
            <div className="cover-url">www.samarayachting.com</div>
          </div>
        </div>

        {/* ══ PAGE 2 — Parties + Preamble + §1 ══ */}
        <div className="page">
          <Header />
          <div className="pg-body">
            <div className="doc-title">AGENT AGREEMENT</div>

            <p className="intro">
              This Agent Contract ("Contract") is made and entered into as of the date of the last
              signature below ("Effective Date"), by and between
            </p>

            <div className="parties">
              <div className="party">
                <span className="party-lbl">Principal:</span>
                <div className="party-body">Samara Yachting<br />and its appointed Subsidiaries</div>
              </div>
              <div className="party">
                <span className="party-lbl">Travel Agent:</span>
                <table className="ftbl">
                  <tbody>
                    <tr><td className="fl">Name</td><td className="fc">:</td><td className="fv">{agent.name}</td></tr>
                    <tr><td className="fl">Address</td><td className="fc">:</td><td className="fv">{agent.address || ''}</td></tr>
                    <tr><td className="fl">E-Mail</td><td className="fc">:</td><td className="fv">{agent.email || ''}</td></tr>
                    <tr><td className="fl">Country</td><td className="fc">:</td><td className="fv">{agent.country || ''}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="preamble-lbl">PREAMBLE:</div>
            <p className="body-p">
              This Agent Agreement (the "Contract") is entered into between the Principal and the Travel Agent to
              establish a mutual understanding and formalize the business relationship between the Parties. The
              purpose of this Contract is to define the terms and conditions under which the Travel Agent will
              promote and sell yacht charters offered by Samara Yachting, representing the Principal in a
              professional and ethical manner, while ensuring consistent service quality and adherence to the
              Principal's policies, rates, and terms as outlined in the annexes to this Agreement. Both Parties
              commit to working collaboratively to achieve shared goals and deliver exceptional experiences to clients.
            </p>

            <div className="sec-h">1. Scope of Services</div>
            <p className="body-p">The Travel Agent is appointed by the Principal to:</p>
            <ul className="clauses">
              <li><span className="cn">1.1.</span><span className="ct">Promote and sell yacht charters offered by the Principal and its subsidiaries.</span></li>
              <li><span className="cn">1.2.</span><span className="ct">Represent the Principal in a professional and ethical manner in all dealings with clients.</span></li>
              <li><span className="cn">1.3.</span><span className="ct">Comply with the Principal's latest Client Terms and Conditions Annex (T&amp;C) and ensure clients are informed of these terms.</span></li>
            </ul>
            <p className="body-p" style={{marginTop:7}}>
              Yacht charters offered by the Principal and its subsidiaries, including Open Trips (FIT), and Private
              Charters, as defined in the Commission and Payment Annex (C&amp;P)
            </p>
          </div>
          <Footer n={1} />
        </div>

        {/* ══ PAGE 3 — §2–§5 ══ */}
        <div className="page">
          <Header />
          <div className="pg-body">
            <div className="sec-h">2. Agent Responsibilities</div>
            <p className="body-p">As a Travel Agent under this agreement, you are responsible for:</p>
            <ul className="clauses">
              <li><span className="cn">2.1.</span><span className="ct">Managing all communication with the client throughout the entire booking process.</span></li>
              <li><span className="cn">2.2.</span><span className="ct">Ensuring that guest information is submitted to the Principal no later than 14 days prior to departure, and presented in the format specified by the Principal. Organizing additional logistics not covered by the cruise, including but not limited to flights, accommodations, visas, medical clearances, and local transportation.</span></li>
              <li><span className="cn">2.3.</span><span className="ct">Providing clients with comprehensive and transparent information regarding the cruise itinerary, related costs, transport arrangements, and all other relevant details to support informed decision-making.</span></li>
              <li><span className="cn">2.4.</span><span className="ct">Promptly notifying the Principal of any changes or updates to the booking to ensure smooth coordination and operational efficiency.</span></li>
            </ul>

            <div className="sec-h">3. Commission and Payment Terms for Agencies</div>
            <ul className="clauses">
              <li><span className="cn">3.1.</span><span className="ct">Commission details and payment terms are outlined in the Principal's Commissions and Payment Terms for Travel Agent (C&amp;P), which are maintained as a separate annex.</span></li>
              <li><span className="cn">3.2.</span><span className="ct">The Travel Agent is responsible for ensuring compliance with these terms.</span></li>
              <li><span className="cn">3.3.</span><span className="ct">Commissions are not payable for bookings canceled by the client unless otherwise specified in writing.</span></li>
              <li><span className="cn">3.4.</span><span className="ct">All Payments must be made to the bank account specified by the Principal in the corresponding invoice or communication.</span></li>
            </ul>

            <div className="sec-h">4. Reporting and Accountability</div>
            <ul className="clauses">
              <li><span className="cn">4.1.</span><span className="ct">The Travel Agent shall provide sales reports to the Principal upon request</span></li>
            </ul>
            <div className="sec-h">Confidentiality:</div>
            <ul className="clauses">
              <li><span className="cn">4.2.</span><span className="ct">The Travel Agent agrees to keep confidential all proprietary information, including but not limited to pricing structures, client information, and operational details.</span></li>
              <li><span className="cn">4.3.</span><span className="ct">This obligation shall survive the termination of this Contract.</span></li>
            </ul>

            <div className="sec-h">5. Commission and Payment Terms for Agencies</div>
            <ul className="clauses">
              <li><span className="cn">5.1.</span><span className="ct">The Travel Agency agrees to communicate the Principal's Client Terms and Conditions Annex (T&amp;C) to all clients at the time of booking and ensure clients acknowledge and accept these terms.</span></li>
              <li><span className="cn">5.2.</span><span className="ct">The Travel Agent shall not modify or waive any part of the Principal's T&amp;C without prior written consent from the Principal</span></li>
              <li><span className="cn">5.3.</span><span className="ct">The Travel Agent must adhere to the Principal's cancellation and refund policies as outlined in the Client Terms and Conditions.</span></li>
            </ul>
          </div>
          <Footer n={2} />
        </div>

        {/* ══ PAGE 4 — §6–§9 + Signatures ══ */}
        <div className="page">
          <Header />
          <div className="pg-body">
            <div className="sec-h">6. Term and Termination</div>
            <ul className="clauses">
              <li><span className="cn">6.1.</span><span className="ct">This Contract is valid for a year and renews every year if not terminated 30 days before the roll-over date.</span></li>
              <li><span className="cn">6.2.</span><span className="ct">The C&amp;P and the T&amp;C Annex can be renewed by the Principal at any time. Always the latest version is valid.</span></li>
              <li><span className="cn">6.3.</span><span className="ct">Either Party has the right to terminate this contract with 30 days' written notice.</span></li>
              <li><span className="cn">6.4.</span><span className="ct">The Principal reserves the right to terminate this Contract immediately for cause, including but not limited to breaches of this Contract or unethical conduct.</span></li>
            </ul>

            <div className="sec-h">7. Legal Clauses</div>
            <ul className="clauses">
              <li><span className="cn">7.1.</span><span className="ct"><strong>Independent Contractor:</strong> The Travel Agent acts as an independent contractor and not as an employee of the Principal.</span></li>
              <li><span className="cn">7.2.</span><span className="ct"><strong>Liability:</strong> The Travel Agent is solely responsible for any claims arising from their actions or representations.</span></li>
              <li><span className="cn">7.3.</span><span className="ct"><strong>Governing Law:</strong> This Contract is governed by the laws of the Republic of Indonesia.</span></li>
              <li><span className="cn">7.4.</span><span className="ct"><strong>Dispute Resolution:</strong> Any disputes arising from this Contract shall be resolved through mediation or arbitration in Bali, Indonesia.</span></li>
            </ul>

            <div className="sec-h">8. Miscellaneous</div>
            <ul className="clauses">
              <li><span className="cn">8.1.</span><span className="ct"><strong>Force Majeure:</strong> Neither Party shall be held liable for delays or failures due to events beyond their reasonable control, such as natural disasters or government restrictions.</span></li>
              <li><span className="cn">8.2.</span><span className="ct"><strong>Amendments:</strong> Any amendments to this Contract must be made in writing and signed by both Parties.</span></li>
              <li><span className="cn">8.3.</span><span className="ct"><strong>Entire Agreement:</strong> This Contract constitutes the entire agreement between the Parties and supersedes any prior agreements.</span></li>
            </ul>

            <div className="sec-h">9. Signatures</div>

            <div className="sig-date">
              Signed in Bali on the&nbsp;:&nbsp;<span className="sline">&nbsp;{signDate}&nbsp;</span>
            </div>

            <div className="sig-grid">
              {/* Row 1 — labels */}
              <div className="sg-lbl">Principal:</div>
              <div className="sg-lbl">Travel Agent:</div>

              {/* Row 2 — body */}
              <div className="sg-body">
                Samara Yachting<br />and its appointed Subsidiaries
              </div>
              <div className="sg-name-row">
                <span className="sfl">Name&nbsp;:</span>
                <span className="sfv">&nbsp;{agent.name}</span>
              </div>

              {/* Row 3 — signature lines (always same height) */}
              <div className="sg-sig-left" />
              <div className="sg-sig-right">
                <span className="sfl">Signature&nbsp;:</span>
                <span className="sfv">&nbsp;</span>
              </div>
            </div>
          </div>
          <Footer n={3} />
        </div>

        {/* ══════════════════════════════════════════
             C & P  DOCUMENT
            ══════════════════════════════════════════ */}

        {/* ══ C&P PAGE 1 — COVER ══ */}
        <div className="page">
          <div className="cover">
            <div className="cover-top">
              <div className="cover-brand">SAMARA</div>
              <div className="cover-rule" />
              <div className="cover-sub">YACHTING</div>
            </div>
            <div className="cover-title">
              <h1>COMMISSION AND<br />PAYMENT TERMS (C&amp;P)<br />
                <span style={{fontSize:'22pt',letterSpacing:'0.18em'}}>2026</span>
              </h1>
            </div>
            <div className="cover-url">www.samarayachting.com</div>
          </div>
        </div>

        {/* ══ C&P PAGE 2 — Preamble + §1 + §2 ══ */}
        <div className="page">
          <Header />
          <div className="pg-body">
            <div className="preamble-lbl">PREAMBLE:</div>
            <p className="body-p">
              These Commission and Payment Terms ("C&amp;P") are an integral part of the Travel Agency
              Agreement (the "Agreement") entered into between <strong>Samara Yachting</strong> (the "Principal") and the{' '}
              <strong>Agency</strong>. The most recent version of the C&amp;P of the actual Year shall apply at all times. In case of
              conflict, the provisions of the main Agreement shall take precedence.
            </p>

            <div className="sec-h">1. Nightly Rates Samara 1 Open Trip</div>
            <table className="rate-tbl">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>3 Days 2 Nights</th>
                  <th>4 Days 3 Nights</th>
                  <th>5 Days 4 Nights</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Room Kelor (2 pax)</td><td>US$ 1&apos;855</td><td>US$ 2&apos;780</td><td>US$ 3&apos;710</td></tr>
                <tr><td>Room Kanawa (2 pax)</td><td>US$ 1&apos;855</td><td>US$ 2&apos;780</td><td>US$ 3&apos;710</td></tr>
                <tr><td>Room Padar (2 pax)</td><td>US$ 1&apos;855</td><td>US$ 2&apos;780</td><td>US$ 3&apos;710</td></tr>
                <tr><td>Room Rica (2 pax)</td><td>US$ 1&apos;690</td><td>US$ 2&apos;540</td><td>US$ 3&apos;385</td></tr>
                <tr><td>Room Komodo (2 pax)</td><td>US$ 1&apos;690</td><td>US$ 2&apos;540</td><td>US$ 3&apos;385</td></tr>
                <tr><td>Extra Bed room Komodo and Rinca</td><td>US$ 770</td><td>US$ 1&apos;155</td><td>US$ 1&apos;540</td></tr>
              </tbody>
            </table>

            <div className="sec-h">2. Nightly Rates Private Charter</div>
            <table className="rate-tbl">
              <thead>
                <tr>
                  <th>Boat</th>
                  <th>Komodo</th>
                  <th>Komodo – Sumbawa</th>
                  <th>Maumere – Alor</th>
                  <th>Spice Island</th>
                  <th>Raja Ampat</th>
                  <th>PAX</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Samara I</td><td>US$ 4&apos;600</td>
                  <td className="na">N/A</td><td className="na">N/A</td><td className="na">N/A</td><td className="na">N/A</td>
                  <td>10 adults + 2 extra bed available</td>
                </tr>
                <tr>
                  <td>Samara II</td><td>US$ 4&apos;500</td>
                  <td className="na">N/A</td><td className="na">N/A</td><td className="na">N/A</td><td className="na">N/A</td>
                  <td>8 adults + 2 extra bed available</td>
                </tr>
                <tr>
                  <td>Mischief</td><td>US$ 8&apos;000</td><td>US$ 8&apos;500</td><td>US$ 9&apos;500</td><td>US$ 9&apos;500</td><td>US$ 9&apos;500</td>
                  <td>6 adults + 1 extra bed available</td>
                </tr>
                <tr>
                  <td>Samara Otium</td><td>US$ 14&apos;000</td><td>US$ 14&apos;000</td><td>US$ 14&apos;000</td><td>US$ 14&apos;000</td><td>US$ 14&apos;000</td>
                  <td>12 adults + 2 extra bed available</td>
                </tr>
              </tbody>
            </table>
            <p className="tbl-note">* If the charter starts from a location other than the scheduled base, a relocation fee of 50% of the nightly rate per night will apply. This fee is not commissionable</p>
            <p className="tbl-note">** Rates are Subject to 12% VAT</p>
          </div>
          <Footer n={1} />
        </div>

        {/* ══ C&P PAGE 3 — §3 §4 §5 ══ */}
        <div className="page">
          <Header />
          <div className="pg-body">
            <div className="sec-h">3. Commission Structure</div>
            <ul className="clauses">
              <li><span className="cn">3.1.</span><span className="ct"><strong>Open Trip:</strong> The Agency is entitled to a commission of <strong>{agent.commissionOpenTrip}%</strong> on the total charter price for each successful <strong>Open Trip</strong> booking.</span></li>
              <li><span className="cn">3.2.</span><span className="ct"><strong>Private Charter:</strong> The Agency is entitled to a commission of <strong>{agent.commissionPrivateCharter}%</strong> on the total charter price for each successful <strong>Private Charter</strong> booking.</span></li>
              <li><span className="cn">3.3.</span><span className="ct"><strong>Net Basis:</strong> Commission is calculated on the <strong>net booking value</strong>, excluding government taxes, port fees, and any APA (Advance Provisioning Allowance) if applicable.</span></li>
              <li><span className="cn">3.4.</span><span className="ct"><strong>Performance-Based or Exceptional Adjustments:</strong> Higher commissions may apply based on sales volume, prepayment agreements, or other specific conditions. These must be confirmed <strong>in writing</strong> and approved by the Principal on a <strong>case-by-case basis.</strong></span></li>
            </ul>

            <div className="sec-h">4. Payment Terms</div>
            <ul className="clauses">
              <li>
                <span className="cn">4.1.</span>
                <span className="ct">
                  <strong>Payments Collected by the Agent:</strong> Payments are structured as follows:
                  <ul className="sub-list">
                    <li><strong>30% Down Payment (DP):</strong> Must be transferred in full to the Principal <strong>without deduction</strong> within the stipulated deadline.</li>
                    <li><strong>70% Balance Payment:</strong> The Agency may deduct the agreed commission from the balance before transferring the remainder to the Principal.</li>
                  </ul>
                </span>
              </li>
              <li><span className="cn">4.2.</span><span className="ct"><strong>Payment Schedule:</strong> Payments must follow the schedule outlined in the Annex Terms and Conditions (T&amp;C) and the Agent Agreement. Agents must ensure timely payments in accordance with the Payment Schedule outlined in the T&amp;C to avoid penalties or cancellations or forfeiture of commissions.</span></li>
              <li><span className="cn">4.3.</span><span className="ct"><strong>Exceptions:</strong> Any deviation from the above payment handling must be agreed upon in writing on a case-by-case basis.</span></li>
              <li><span className="cn">4.4.</span><span className="ct"><strong>Payment Method:</strong> Payments must be made via <strong>bank transfer or credit card</strong>, in <strong>USD or IDR</strong>, to the account specified by the Principal.</span></li>
              <li><span className="cn">4.5.</span><span className="ct">Credit card payments are subject to a <strong>3% processing fee</strong>.</span></li>
              <li><span className="cn">4.6.</span><span className="ct">All transfer fees are the responsibility of the Agency or the client.</span></li>
            </ul>

            <div className="sec-h">5. Commission and Payment Terms for Agencies</div>
            <ul className="clauses">
              <li><span className="cn">5.1.</span><span className="ct"><strong>Cancellations:</strong> Commissions are not payable for bookings canceled by the client unless explicitly stated in writing otherwise.</span></li>
              <li><span className="cn">5.2.</span><span className="ct"><strong>Refunds:</strong> If a refund is issued to the client, any paid commission shall be adjusted or reclaimed proportionately. Proportional adjustments will be calculated based on the percentage of the charter value refunded to the client, excluding non-refundable amounts.</span></li>
              <li><span className="cn">5.3.</span><span className="ct"><strong>Force Majeure:</strong> In cases where a booking is canceled due to force majeure events (e.g., natural disasters, government restrictions, or other unforeseen circumstances), commissions will not be payable unless otherwise specified in writing. For commissions on payments already made by the client, any commission amounts previously paid to the Agency will be subject to adjustment or reclamation proportionately if refunds are issued. The Principal may offer alternative arrangements or rescheduling options at its discretion.</span></li>
            </ul>
          </div>
          <Footer n={2} />
        </div>

        {/* ══ C&P PAGE 4 — §6 §7 §8 + closing + date + signature ══ */}
        <div className="page">
          <Header />
          <div className="pg-body">
            <div className="sec-h">6. Reporting and Records</div>
            <ul className="clauses">
              <li><span className="cn">6.1.</span><span className="ct">Agencies must maintain accurate records of bookings and transactions for verification purposes. The Principal reserves the right to request booking records or audit financial details related to commissions.</span></li>
            </ul>

            <div className="sec-h">7. Non-Circumvention</div>
            <ul className="clauses">
              <li><span className="cn">7.1.</span><span className="ct">The Agency agrees not to bypass the Principal by engaging directly with clients for services that compete with the Principal's offerings without prior written consent.</span></li>
            </ul>

            <div className="sec-h">8. Miscellaneous</div>
            <ul className="clauses">
              <li><span className="cn">8.1.</span><span className="ct">Any disputes regarding commissions must be raised in writing within 30 days of the payment date.</span></li>
              <li><span className="cn">8.2.</span><span className="ct"><strong>Governing Law:</strong> This Contract is governed by the laws of the Republic of Indonesia.</span></li>
              <li><span className="cn">8.3.</span><span className="ct"><strong>Dispute Resolution:</strong> Any disputes arising from this Contract shall be resolved through mediation or arbitration in Bali, Indonesia.</span></li>
            </ul>

            <p className="body-p" style={{marginTop:14}}>
              For updates or clarifications, please refer to the latest Travel Agency Agreement or contact Samara
              Yachting via info@Samarayachting.com directly.
            </p>

            <div style={{marginTop:28, marginBottom:24, fontSize:'10pt'}}>
              Bali, Date&nbsp;:&nbsp;<span style={{borderBottom:'0.5pt solid #222', display:'inline-block', minWidth:130, marginLeft:3}}>&nbsp;{signDate}&nbsp;</span>
            </div>

            <div style={{textAlign:'center', maxWidth:180}}>
              <div style={{fontWeight:700, fontSize:'10pt', marginBottom:10}}>Principal:</div>
              <div style={{fontSize:'9.5pt', lineHeight:1.6}}>Samara Yachting<br />and its appointed Subsidiaries</div>
              <div style={{borderBottom:'0.5pt solid #222', marginTop:52, height:1}} />
            </div>
          </div>
          <Footer n={3} />
        </div>

      </div>

      {/* TnC pages — rendered as full-page images from admin-uploaded PDF */}
      {tncPages.map((src, i) => (
        <div key={i} className="page tnc-page">
          <img src={src} alt="" />
        </div>
      ))}
    </>
  )
}
