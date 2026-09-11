// Renders a document version's plain-text content into the SAME visual chrome as the real
// print pages (src/app/print/invoice/[id]/page.tsx, src/app/print/agent-agreement/[id]/page.tsx):
// navy cover page, navy header/footer bands, Times New Roman body, numbered clauses, rate
// tables. Output is a standalone HTML document meant to be dropped into an <iframe srcDoc>.
//
// Pagination is done by the browser at load time (script at the bottom of the generated HTML),
// not guessed ahead of time — it measures each content block's real rendered height (at the
// same width/padding as a real page body) and packs blocks onto pages up to the actual
// available height of a page body, so pages never overflow or cut content mid-paragraph.

type Block =
  | { type: 'title'; text: string }
  | { type: 'subtitle'; text: string }
  | { type: 'label'; text: string }
  | { type: 'section'; text: string }
  | { type: 'clause'; num: string; text: string }
  | { type: 'subitem'; text: string }
  | { type: 'para'; text: string }
  | { type: 'note'; text: string }
  | { type: 'table'; rows: string[][] }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Runs AFTER esc() — the source text uses a lightweight **bold** convention (same idea as
// markdown) to mark the inline emphasis the real documents render with <strong>, e.g. clause
// lead-ins like "**Deposit:** A non-refundable deposit...". Safe to run post-escape since `**`
// isn't an HTML metacharacter.
function inline(escaped: string): string {
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

function parseContent(raw: string): Block[] {
  const lines = raw.split('\n')
  const blocks: Block[] = []
  let tableBuf: string[][] = []
  let paraBuf: string[] = []
  let seenAny = false

  const flushTable = () => { if (tableBuf.length) { blocks.push({ type: 'table', rows: tableBuf }); tableBuf = [] } }
  const flushPara = () => { if (paraBuf.length) { blocks.push({ type: 'para', text: paraBuf.join(' ') }); paraBuf = [] } }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ')
    const trimmed = line.trim()
    if (!trimmed) { flushTable(); flushPara(); continue }

    if (/^\d+\.\d+\.\s/.test(trimmed)) {
      flushTable(); flushPara()
      const m = trimmed.match(/^(\d+\.\d+)\.\s(.*)$/)
      if (m) blocks.push({ type: 'clause', num: m[1] + '.', text: m[2] })
      seenAny = true
      continue
    }
    if (/^-\s/.test(trimmed)) {
      flushTable(); flushPara()
      blocks.push({ type: 'subitem', text: trimmed.replace(/^-\s*/, '') })
      seenAny = true
      continue
    }
    if (/^\d+\.\s+\S/.test(trimmed) && !/\s{2,}\S/.test(trimmed.replace(/^\d+\.\s+/, ''))) {
      flushTable(); flushPara()
      blocks.push({ type: 'section', text: trimmed })
      seenAny = true
      continue
    }
    // table row: 3+ cells separated by runs of 2+ spaces
    if ((trimmed.match(/\s{2,}/g) ?? []).length >= 2) {
      flushPara()
      tableBuf.push(trimmed.split(/\s{2,}/))
      seenAny = true
      continue
    }
    if (/^\*/.test(trimmed)) {
      flushTable(); flushPara()
      blocks.push({ type: 'note', text: trimmed })
      seenAny = true
      continue
    }
    if (/^\d{4}\s*-\s*v[\d.]+$/i.test(trimmed)) {
      flushTable(); flushPara()
      blocks.push({ type: 'subtitle', text: trimmed })
      seenAny = true
      continue
    }
    if (trimmed === trimmed.toUpperCase() && trimmed.length < 60 && /[A-Z]/.test(trimmed)) {
      flushTable(); flushPara()
      blocks.push({ type: !seenAny ? 'title' : 'label', text: trimmed })
      seenAny = true
      continue
    }
    paraBuf.push(trimmed)
    seenAny = true
  }
  flushTable(); flushPara()
  return blocks
}

function renderTable(rows: string[][]): string {
  if (!rows.length) return ''
  const [head, ...body] = rows
  const theadHtml = `<tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>`
  const tbodyHtml = body.map(r => `<tr>${r.map((c, i) =>
    `<td${c.trim() === 'N/A' ? ' class="na"' : ''}${i === 0 ? ' class="lbl"' : ''}>${esc(c)}</td>`
  ).join('')}</tr>`).join('')
  return `<table class="rate-tbl"><thead>${theadHtml}</thead><tbody>${tbodyHtml}</tbody></table>`
}

// One "unit" = one atomic thing that can be placed on a page without ever being split across a
// page break (a section heading, a whole clause list, a table, one paragraph, ...). Title/
// subtitle blocks are skipped here — that text already appears on the cover page.
function renderUnits(blocks: Block[]): string[] {
  const units: string[] = []
  let i = 0
  while (i < blocks.length) {
    const b = blocks[i]
    if (b.type === 'clause') {
      let group = ''
      while (i < blocks.length && blocks[i].type === 'clause') {
        const c = blocks[i] as Extract<Block, { type: 'clause' }>
        group += `<li><span class="cn">${esc(c.num)}</span><span class="ct">${inline(esc(c.text))}</span></li>`
        i++
      }
      units.push(`<ul class="clauses">${group}</ul>`)
      continue
    }
    if (b.type === 'subitem') {
      let group = ''
      while (i < blocks.length && blocks[i].type === 'subitem') {
        group += `<li>${inline(esc((blocks[i] as Extract<Block, { type: 'subitem' }>).text))}</li>`
        i++
      }
      units.push(`<ul class="sub-list">${group}</ul>`)
      continue
    }
    switch (b.type) {
      case 'title': case 'subtitle': break
      case 'label': units.push(`<div class="preamble-lbl">${esc(b.text)}</div>`); break
      case 'section': units.push(`<div class="sec-h">${esc(b.text)}</div>`); break
      case 'para': units.push(`<p class="body-p">${inline(esc(b.text))}</p>`); break
      case 'note': units.push(`<p class="tbl-note">${inline(esc(b.text))}</p>`); break
      case 'table': units.push(renderTable(b.rows)); break
    }
    i++
  }
  return units
}

const PREVIEW_STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { background: #d0d0d0; font-family: 'Times New Roman', Times, serif; font-size: 10pt; color: #111; }
  .page-wrap { padding: 24px 0 40px; display: flex; flex-direction: column; align-items: center; gap: 20px; }
  .page { width: 210mm; height: 297mm; background: #fff; box-shadow: 0 2px 18px rgba(0,0,0,.22); overflow: hidden; position: relative; display: flex; flex-direction: column; }
  .cover { background-color: #1a3050 !important; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: space-between; color: #fff; padding: 48mm 22mm 18mm; text-align: center; }
  .cover-brand { font-family: 'Times New Roman', serif; font-size: 30pt; font-weight: 300; letter-spacing: 0.3em; color: #fff !important; }
  .cover-rule { width: 52px; height: 1px; background: rgba(255,255,255,.35) !important; margin: 10px auto; }
  .cover-sub { font-size: 8pt; letter-spacing: 0.5em; font-weight: 300; color: rgba(255,255,255,.72) !important; }
  .cover-title h1 { font-size: 22pt; font-weight: 400; letter-spacing: 0.05em; line-height: 1.4; color: #fff !important; }
  .cover-title .v { display: block; font-size: 12pt; letter-spacing: 0.18em; margin-top: 10px; color: rgba(255,255,255,.85) !important; }
  .cover-url { font-size: 8.5pt; color: rgba(255,255,255,.52) !important; letter-spacing: 0.04em; }
  .pg-header { background-color: #1a3050 !important; display: flex; justify-content: space-between; align-items: center; padding: 10px 16mm 11px; flex-shrink: 0; }
  .hdr-brand { font-size: 13pt; letter-spacing: 0.22em; color: #fff !important; }
  .hdr-sub { font-size: 6pt; letter-spacing: 0.4em; font-weight: 300; color: rgba(255,255,255,.72) !important; margin-top: 3px; }
  .hdr-addr { font-family: -apple-system, sans-serif; font-size: 6pt; color: rgba(255,255,255,.72) !important; text-align: right; line-height: 1.6; }
  .pg-body { flex: 1; padding: 9mm 16mm 12mm; overflow: hidden; }
  .pg-footer { background-color: #1a3050 !important; display: grid; grid-template-columns: 1fr auto 1fr; gap: 6mm; padding: 8px 16mm; align-items: center; flex-shrink: 0; }
  .ft-addr, .ft-contact { font-family: -apple-system, sans-serif; font-size: 5.5pt; color: rgba(255,255,255,.72) !important; line-height: 1.65; }
  .ft-addr strong { color: rgba(255,255,255,.9) !important; font-size: 6pt; display: block; }
  .ft-contact { text-align: right; }
  .ft-num { font-family: -apple-system, sans-serif; font-size: 9pt; color: rgba(255,255,255,.9) !important; text-align: center; }
  .doc-title { font-family: Arial, sans-serif; font-size: 13pt; font-weight: 700; text-align: center; letter-spacing: 0.02em; margin-bottom: 4px; }
  .preamble-lbl { font-weight: 700; text-align: center; font-size: 10pt; margin: 10px 0 6px; }
  .body-p { font-size: 10pt; line-height: 1.62; text-align: justify; margin-bottom: 8px; }
  .sec-h { font-weight: 700; font-size: 10pt; margin: 12px 0 5px; }
  .clauses { list-style: none; padding-left: 8mm; margin-bottom: 6px; }
  .clauses li { display: flex; margin-bottom: 4px; font-size: 10pt; line-height: 1.6; text-align: justify; }
  .cn { min-width: 30px; flex-shrink: 0; font-weight: 600; }
  .ct { flex: 1; }
  .sub-list { list-style: disc; padding-left: 14mm; margin: 2px 0 8px; }
  .sub-list li { font-size: 10pt; line-height: 1.6; margin-bottom: 3px; }
  .rate-tbl { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin: 8px 0 10px; }
  .rate-tbl th, .rate-tbl td { border: 0.5pt solid #bbb; padding: 5px 7px; text-align: center; vertical-align: middle; line-height: 1.4; }
  .rate-tbl th { background-color: #f0f0f0 !important; font-weight: 700; font-size: 8pt; }
  .rate-tbl td.lbl { font-weight: 700; text-align: left; }
  .rate-tbl td.na { color: #999; }
  .tbl-note { font-size: 8.5pt; line-height: 1.55; margin-bottom: 4px; color: #444; }
  .unit { overflow: hidden; }
  #measure-wrap { position: absolute; left: -9999px; top: 0; width: 210mm; visibility: hidden; }
  @media print {
    html, body { background: #fff !important; }
    .page-wrap { padding: 0; gap: 0; }
    .page { box-shadow: none; page-break-after: always; break-after: page; }
    .page:last-child { page-break-after: avoid; break-after: avoid; }
  }
`

export function buildPreviewHtml(docTitle: string, versionNumber: number, isActive: boolean, content: string): string {
  const blocks = parseContent(content)
  const units = renderUnits(blocks)

  const coverHtml = `
    <div class="page">
      <div class="cover">
        <div>
          <div class="cover-brand">SAMARA</div>
          <div class="cover-rule"></div>
          <div class="cover-sub">YACHTING</div>
        </div>
        <div class="cover-title">
          <h1>${esc(docTitle.toUpperCase())}<span class="v">v${versionNumber}${isActive ? ' · ACTIVE' : ''}</span></h1>
        </div>
        <div class="cover-url">www.samarayachting.com</div>
      </div>
    </div>`

  const headerHtml = `<div class="pg-header"><div><div class="hdr-brand">SAMARA</div><div class="hdr-sub">YACHTING</div></div><div class="hdr-addr">Bali, Indonesia</div></div>`
  const footerHtml = `<div class="pg-footer"><div class="ft-addr"><strong>Office Address</strong>Jalan Tukad Badung IXB No.9, Renon, Denpasar Selatan, Bali 80234</div><div class="ft-num"></div><div class="ft-contact">www.samarayachting.com<br/>inquiry@samarayachting.com</div></div>`

  const measureHtml = `<div id="measure-wrap"><div id="measure" class="pg-body">${units.map(u => `<div class="unit">${u}</div>`).join('')}</div></div>`

  // Runs inside the iframe once loaded: measures each unit's real rendered height (already at
  // the correct page-body width from #measure-wrap) and a real empty page body's available
  // height, then packs units onto as many pages as needed so nothing overflows or gets clipped.
  const paginateScript = `
    (function () {
      var measure = document.getElementById('measure')
      var units = Array.prototype.slice.call(measure.children)
      var root = document.getElementById('pages-root')
      var tmpl = document.getElementById('page-template')

      function newPage() {
        var node = tmpl.content.firstElementChild.cloneNode(true)
        root.appendChild(node)
        return node
      }

      var page = newPage()
      var body = page.querySelector('.pg-body')
      var budget = body.clientHeight
      var used = 0
      var pageNum = 1
      page.querySelector('.ft-num').textContent = String(pageNum)

      units.forEach(function (u) {
        var h = u.offsetHeight
        if (used > 0 && used + h > budget) {
          page = newPage()
          body = page.querySelector('.pg-body')
          pageNum += 1
          page.querySelector('.ft-num').textContent = String(pageNum)
          used = 0
        }
        body.appendChild(u)
        used += h
      })

      document.getElementById('measure-wrap').remove()
    })()
  `

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${esc(docTitle)}</title><style>${PREVIEW_STYLES}</style></head><body>
    <div class="page-wrap">
      ${coverHtml}
      <div id="pages-root"></div>
    </div>
    ${measureHtml}
    <template id="page-template"><div class="page">${headerHtml}<div class="pg-body"></div>${footerHtml}</div></template>
    <script>${paginateScript}</script>
  </body></html>`
}
