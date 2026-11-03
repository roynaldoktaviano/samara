// Shared helpers: formatting, tables, charts, tooltips.
(function () {
  const S = (window.SMI = {});
  const nf = d3.format(',');
  S.num = (x) => (x == null || !isFinite(x) ? '—' : nf(Math.round(x)));
  S.usd = (x) => (x == null || !isFinite(x) ? '—' : Math.abs(x) >= 10000 ? '$' + Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(x) : '$' + nf(Math.round(x)));
  S.usd2 = (x) => (x == null || !isFinite(x) ? '—' : '$' + d3.format(',.2f')(x));
  S.usdFull = (x) => (x == null || !isFinite(x) ? '—' : '$' + nf(Math.round(x)));
  S.pct = (x) => (x == null || !isFinite(x) ? '—' : d3.format('.1%')(x));
  S.x = (x) => (x == null || !isFinite(x) ? '—' : d3.format('.1f')(x));
  S.date = (x) => (x ? d3.utcFormat('%-d %b %Y')(new Date(x + 'T00:00:00Z')) : '—');
  S.signed = (x) => (x == null || !isFinite(x) ? null : (x > 0 ? '+' : x < 0 ? '−' : '±') + d3.format('.0%')(Math.abs(x)));
  S.days = (x) => (x == null || !isFinite(x) ? '—' : nf(Math.round(x)) + ' d');
  S.enc = (v) => String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
  S.monLbl = (m) => d3.utcFormat('%b %Y')(new Date(m + '-01T00:00:00Z'));
  S.MOY = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  S.rows = (id) => { const d = dash.data(id); return d.status === 'ok' ? d.data : null; };
  S.state = (id) => dash.data(id).status;

  S.fail = (el, id) => {
    const st = dash.data(id).status;
    if (st === 'error' || st === 'connect' || st === 'declined' || st === 'missing') {
      el.classList.remove('dash-skeleton');
      const d = document.createElement('div'); d.className = 'failed'; d.textContent = 'Failed to load';
      el.replaceChildren(d); return true;
    }
    return false;
  };

  // Table: cols [{f, fmt, cls, render(row) -> node|string}]
  S.table = (tbl, rows, cols, opts = {}) => {
    const tb = tbl.tBodies[0];
    const key = tbl.dataset.rowKey;
    const sortState = (tbl._sort = tbl._sort || opts.sort || null);
    let rr = rows.slice();
    if (sortState) {
      const { f, dir } = sortState;
      rr.sort((a, b) => { const x = a[f], y = b[f]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * dir; });
    }
    const frag = document.createDocumentFragment();
    for (const r of rr) {
      const tr = document.createElement('tr');
      if (key) tr.dataset.key = r[key];
      if (opts.onClick) { tr.className = 'click'; tr.tabIndex = 0; }
      if (opts.selected && opts.selected === r[key]) tr.classList.add('sel');
      for (const c of cols) {
        const td = document.createElement('td');
        if (c.cls) td.className = c.cls;
        if (c.render) { const v = c.render(r); if (v instanceof Node) td.append(v); else td.textContent = v; }
        else td.textContent = c.fmt ? c.fmt(r[c.f]) : r[c.f] == null ? '—' : r[c.f];
        tr.append(td);
      }
      frag.append(tr);
    }
    tb.replaceChildren(frag);
    if (opts.onClick && !tbl._clickBound) {
      tbl._clickBound = true;
      const go = (e) => { const tr = e.target.closest('tr[data-key]'); if (tr) opts.onClick(tr.dataset.key); };
      tb.addEventListener('click', go);
      tb.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e); });
    }
    if (!tbl._sortBound && opts.sortable !== false) {
      tbl._sortBound = true;
      tbl.tHead.querySelectorAll('th[data-field]').forEach((th) => {
        const label = th.textContent; const b = document.createElement('button'); b.type = 'button'; b.textContent = label; th.replaceChildren(b);
        b.addEventListener('click', () => {
          const f = th.dataset.field, cur = tbl._sort;
          tbl._sort = { f, dir: cur && cur.f === f ? -cur.dir : -1 };
          tbl.tHead.querySelectorAll('th').forEach((x) => x.removeAttribute('aria-sort'));
          th.setAttribute('aria-sort', tbl._sort.dir === 1 ? 'ascending' : 'descending');
          if (tbl._redraw) tbl._redraw();
        });
      });
    }
  };

  S.pill = (text) => {
    const s = document.createElement('span');
    const t = String(text);
    s.className = 'pill ' + (/Behind|but behind|down|below|Both|Gap: start|Over budget/.test(t) ? 'bad' : /Watch|open|Early|Gap: plan|Fills anyway|Committed|Ahead of plan/.test(t) ? 'warn' : /Peak|Healthy|On track|On plan|In line|Ahead|^Covered$|Fills on|Sold out|Paid/.test(t) ? 'ok' : 'muted');
    s.textContent = t; return s;
  };

  // Tooltip
  S.tip = (box) => {
    let t = box.querySelector('.tt');
    if (!t) { t = document.createElement('div'); t.className = 'tt'; t.hidden = true; box.append(t); }
    return {
      show(ev, head, lines) {
        t.replaceChildren();
        const h = document.createElement('div'); h.className = 'h'; h.textContent = head; t.append(h);
        for (const [label, val, color] of lines) {
          const d = document.createElement('div');
          if (color) { const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = color; d.append(sw); }
          d.append(label + ': ' + val); t.append(d);
        }
        t.hidden = false;
        const r = box.getBoundingClientRect(), [mx, my] = [ev.clientX - r.left, ev.clientY - r.top];
        const w = t.offsetWidth, hgt = t.offsetHeight;
        t.style.left = Math.max(0, Math.min(r.width - w, mx + 12)) + 'px';
        t.style.top = Math.max(0, my - hgt - 10) + 'px';
      },
      hide() { t.hidden = true; },
    };
  };

  const measure = (svg, texts) => {
    const g = svg.append('g'); let w = 0;
    for (const s of texts) { const n = g.append('text').attr('font-size', 11).text(s).node(); w = Math.max(w, n.getComputedTextLength()); }
    g.remove(); return w;
  };

  // Bar chart. opts: {x, y, xfmt, yfmt, label, color(d), ref, tipLines(d), height, tickEvery, tickMarks:[{field,label}]}
  S.bars = (box, data, o) => {
    box.classList.remove('dash-skeleton');
    const W = box.clientWidth; if (!W) return;
    const H = o.height || 220;
    d3.select(box).selectAll('svg').remove();
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const maxY = d3.max(data, (d) => Math.max(d[o.y] || 0, ...(o.tickMarks || []).map((t) => d[t.field] || 0), o.ref || 0)) || 1;
    const y = d3.scaleLinear([0, maxY * 1.08], [H - 22, 8]).nice();
    const ticks = y.ticks(4);
    const ml = Math.ceil(measure(svg, ticks.map(o.yfmt))) + 10;
    const x = d3.scaleBand(data.map((d) => d[o.x]), [ml, W - 4]).padding(0.22);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', ml).attr('x2', W).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', ml - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text(o.yfmt);
    const bw = Math.min(32, x.bandwidth());
    const off = (x.bandwidth() - bw) / 2;
    svg.append('g').selectAll('rect').data(data).join('rect')
      .attr('x', (d) => x(d[o.x]) + off).attr('width', bw).attr('y', (d) => y(d[o.y] || 0)).attr('height', (d) => Math.max(0, y(0) - y(d[o.y] || 0))).attr('rx', Math.min(4, bw / 2))
      .attr('fill', (d) => (o.color ? o.color(d) : dash.colors[0]));
    for (const t of o.tickMarks || []) {
      svg.append('g').selectAll('line').data(data.filter((d) => d[t.field] != null)).join('line')
        .attr('x1', (d) => x(d[o.x]) + off - 2).attr('x2', (d) => x(d[o.x]) + off + bw + 2).attr('y1', (d) => y(d[t.field])).attr('y2', (d) => y(d[t.field]))
        .attr('stroke', 'var(--color-fg)').attr('stroke-width', 2);
    }
    if (o.ref != null) svg.append('line').attr('x1', ml).attr('x2', W).attr('y1', y(o.ref)).attr('y2', y(o.ref)).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 3');
    // x labels, thinned to fit
    const labels = data.map((d) => (o.xfmt ? o.xfmt(d[o.x]) : d[o.x]));
    const lw = measure(svg, labels) + 8;
    const every = Math.max(1, Math.ceil(lw / x.step()));
    svg.append('g').selectAll('text').data(data.filter((d, i) => i % every === 0)).join('text')
      .attr('x', (d) => x(d[o.x]) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => (o.xfmt ? o.xfmt(d[o.x]) : d[o.x]));
    svg.append('line').attr('x1', ml).attr('x2', W).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-axis)');
    const tip = S.tip(box);
    svg.append('g').selectAll('rect').data(data).join('rect').attr('x', (d) => x(d[o.x])).attr('width', x.step()).attr('y', 0).attr('height', H - 22).attr('fill', 'transparent')
      .on('mousemove', (ev, d) => tip.show(ev, o.xfmt ? o.xfmt(d[o.x]) : d[o.x], o.tipLines(d))).on('mouseleave', tip.hide);
  };

  // Line chart. opts: {x (string), xfmt, series:[{f, label, color}], yfmt, ref, height}
  S.lines = (box, data, o) => {
    box.classList.remove('dash-skeleton');
    const W = box.clientWidth; if (!W) return;
    const H = o.height || 220;
    d3.select(box).selectAll('svg').remove();
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const vals = data.flatMap((d) => o.series.map((s) => d[s.f])).filter((v) => v != null);
    const y = d3.scaleLinear([o.min != null ? o.min : 0, (d3.max(vals) || 1) * 1.1], [H - 22, 8]).nice();
    const ticks = y.ticks(4);
    const ml = Math.ceil(measure(svg, ticks.map(o.yfmt))) + 10;
    const endW = o.endLabels ? Math.ceil(measure(svg, o.series.map((s) => s.label))) + 10 : 6;
    const x = d3.scalePoint(data.map((d) => d[o.x]), [ml + 4, W - endW]);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', ml).attr('x2', W - endW).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', ml - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text(o.yfmt);
    o.series.forEach((s, i) => {
      const line = d3.line().defined((d) => d[s.f] != null).x((d) => x(d[o.x])).y((d) => y(d[s.f]));
      svg.append('path').datum(data).attr('d', line).attr('fill', 'none').attr('stroke', s.color || dash.colors[i]).attr('stroke-width', 2)
        .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('stroke-dasharray', s.dash || null);
    });
    const labels = data.map((d) => (o.xfmt ? o.xfmt(d[o.x]) : d[o.x]));
    const lw = measure(svg, labels) + 10;
    const step = data.length > 1 ? (x(data[1][o.x]) - x(data[0][o.x])) : W;
    const every = Math.max(1, Math.ceil(lw / step));
    svg.append('g').selectAll('text').data(data.filter((d, i) => i % every === 0)).join('text').attr('x', (d) => x(d[o.x])).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => (o.xfmt ? o.xfmt(d[o.x]) : d[o.x]));
    svg.append('line').attr('x1', ml).attr('x2', W - endW).attr('y1', y(y.domain()[0])).attr('y2', y(y.domain()[0])).attr('stroke', 'var(--cds-chart-axis)');
    if (o.endLabels) {
      const last = data[data.length - 1]; const pos = o.series.map((s) => ({ s, y: y(last[s.f] ?? 0) })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < pos.length; i++) if (pos[i].y - pos[i - 1].y < 13) pos[i].y = pos[i - 1].y + 13;
      pos.forEach((p, i) => svg.append('text').attr('x', W - endW + 6).attr('y', p.y + 4).attr('fill', p.s.color || dash.colors[o.series.indexOf(p.s)]).text(p.s.label));
    }
    const tip = S.tip(box);
    const dot = svg.append('g');
    svg.append('rect').attr('x', ml).attr('width', W - ml).attr('y', 0).attr('height', H - 22).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx] = d3.pointer(ev); let best = data[0], bd = Infinity;
        for (const d of data) { const dd = Math.abs(x(d[o.x]) - mx); if (dd < bd) { bd = dd; best = d; } }
        dot.selectAll('*').remove();
        o.series.forEach((s, i) => { if (best[s.f] != null) dot.append('circle').attr('cx', x(best[o.x])).attr('cy', y(best[s.f])).attr('r', 4).attr('fill', s.color || dash.colors[i]); });
        tip.show(ev, o.xfmt ? o.xfmt(best[o.x]) : best[o.x], o.series.map((s, i) => [s.label, o.yfmt(best[s.f]), o.series.length > 1 ? s.color || dash.colors[i] : null]));
      })
      .on('mouseleave', () => { dot.selectAll('*').remove(); tip.hide(); });
  };

  // Range chart: rows [{label, lo, mid, hi}]
  S.ranges = (box, data, o) => {
    box.classList.remove('dash-skeleton');
    const W = box.clientWidth; if (!W) return;
    const rowH = 24, H = data.length * rowH + 28;
    d3.select(box).selectAll('svg').remove();
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const ml = Math.ceil(measure(svg, data.map((d) => d.label))) + 12;
    const x = d3.scaleLinear([0, (d3.max(data, (d) => d.hi) || 1) * 1.05], [ml, W - 12]).nice();
    const ticks = x.ticks(Math.max(2, Math.floor((W - ml) / 70)));
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', H - 20).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => d + ' d');
    const g = svg.append('g').selectAll('g').data(data).join('g').attr('transform', (d, i) => `translate(0,${i * rowH + 4})`);
    g.append('text').attr('x', ml - 8).attr('y', rowH / 2 + 2).attr('text-anchor', 'end').text((d) => d.label).attr('fill', (d) => (d.strong ? 'var(--color-fg)' : null));
    g.append('rect').attr('x', (d) => x(d.lo)).attr('width', (d) => Math.max(2, x(d.hi) - x(d.lo))).attr('y', rowH / 2 - 6).attr('height', 10).attr('rx', 4).attr('fill', (d) => (d.strong ? dash.colors[0] : 'var(--cds-chart-muted)'));
    g.append('circle').attr('cx', (d) => x(d.mid)).attr('cy', rowH / 2 - 1).attr('r', 4).attr('fill', 'var(--color-fg)');
    const tip = S.tip(box);
    g.append('rect').attr('x', 0).attr('width', W).attr('height', rowH).attr('fill', 'transparent')
      .on('mousemove', (ev, d) => tip.show(ev, d.label, [['Median', d.mid + ' days'], ['Middle half', d.lo + '–' + d.hi + ' days']])).on('mouseleave', tip.hide);
  };

  // Funnel: steps [{label, n, field, cost, costLabel}], mark attrs
  S.funnel = (el, steps, mark) => {
    el.replaceChildren();
    const max = steps[0].n || 1;
    let worst = -1, wv = 2;
    for (let i = 1; i < steps.length; i++) { const r = steps[i - 1].n ? steps[i].n / steps[i - 1].n : 1; if (r < wv) { wv = r; worst = i; } }
    steps.forEach((s, i) => {
      const row = document.createElement('div'); row.className = 'fstep';
      const lab = document.createElement('div'); lab.textContent = s.label;
      const bar = document.createElement('div'); bar.className = 'fbar';
      const fill = document.createElement('i'); fill.style.width = Math.max(0.5, (s.n / max) * 100) + '%'; fill.style.setProperty('--fill', i === steps.length - 1 ? dash.colors[0] : 'var(--cds-chart-muted)');
      const txt = document.createElement('span');
      const n = document.createElement('b'); n.textContent = S.num(s.n); mark(n, s.field);
      txt.append(n);
      if (s.costField) { const c = document.createElement('span'); c.style.position = 'static'; c.style.color = 'var(--color-fg-muted)'; c.append(' · ' + s.costLabel + ' '); const cv = document.createElement('span'); cv.style.position = 'static'; cv.textContent = s.costFmt(s.cost); mark(cv, s.costField); c.append(cv); txt.append(c); }
      bar.append(fill, txt); row.append(lab, bar); el.append(row);
      if (i < steps.length - 1) {
        const nx = steps[i + 1]; const d = document.createElement('div'); d.className = 'fdrop' + (i + 1 === worst ? ' worst' : '');
        const r = s.n ? nx.n / s.n : 0;
        const pv = document.createElement('span'); pv.textContent = S.pct(nx.rate != null ? nx.rate : r); if (nx.rateField) mark(pv, nx.rateField);
        d.append('↓ ', pv, ' continue' + (nx.rateLabel ? ' (' + nx.rateLabel + ')' : '') + ', ' + S.num(s.n - nx.n) + ' drop out');
        const dr = document.createElement('div'); dr.className = 'fstep'; dr.append(document.createElement('div'), d); el.append(dr);
      }
    });
  };
})();

