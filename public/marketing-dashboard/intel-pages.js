// Drawing for the sections added with the 11-module architecture. pages.js calls these from its render.
(function () {
  const S = window.SMI;
  const $ = (s) => document.querySelector(s);
  const mk = (el, src, field, where) => { el.dataset.source = src; if (field) el.dataset.field = field; if (where) el.dataset.where = where; return el; };
  const span = (text, src, field, where) => { const s = document.createElement('span'); s.textContent = text; if (src) mk(s, src, field, where); return s; };
  const asOf = () => { const e = S.rows('enriched'); return e && e.length ? e[0].as_of : ''; };
  const curYear = () => (asOf() || '2026').slice(0, 4);
  const inPeriod = (d, per) => {
    if (per === 'All') return true;
    if (/^\d{4}$/.test(per)) return d.startsWith(per);
    const a = asOf(); if (!a) return true;
    const start = new Date(Date.parse(a + 'T00:00:00Z') - ((per === 'L90' ? 90 : 30) - 1) * 864e5).toISOString().slice(0, 10);
    return d >= start && d <= a;
  };
  const xx = (v) => (v == null || !isFinite(v) ? '—' : S.x(v) + '×');
  const pc = (cls, text) => { const s = document.createElement('span'); s.className = 'pill ' + cls; s.textContent = text; return s; };
  const SEV = { High: 'bad', Medium: 'warn', Info: 'muted' };
  const yn = (v) => { const s = document.createElement('span'); s.className = v === 'Yes' ? 'yn-yes' : 'yn-no'; s.textContent = v === 'Yes' ? '✓ Yes' : '– No'; return s; };
  // fill every marked figure inside a box from one row
  const fill = (box, src, row, key, fmts) => {
    box.querySelectorAll('[data-source="' + src + '"]').forEach((el) => {
      el.dataset.where = 'key=' + S.enc(key); el.classList.remove('dash-skeleton');
      const f = el.dataset.field; el.textContent = row ? (fmts[f] || S.num)(row[f]) : '—';
    });
  };
  const fails = (box, id) => { if (!S.rows(id)) { box.querySelectorAll('[data-source="' + id + '"]').forEach((el) => { el.classList.remove('dash-skeleton'); el.textContent = '—'; }); return true; } return false; };
  const rate = (label, ...nodes) => { const d = document.createElement('div'); d.className = 'rate'; const b = document.createElement('b'); b.append(...nodes); d.append(label, b); return d; };
  const CF = { revenue: S.usd, bookings: S.num, avg_value: S.usd, util_cabin: S.pct, cabins_sold: S.num, cabins: S.num, util_yacht: S.pct, revpan: S.usdFull, revpacn: S.usd2, at_risk: S.usd, unsold_value: S.usd,
    margin: S.usd, margin_pct: S.pct, cabin_nights: S.num, cabin_nights_sold: S.num, departures: S.num, ahead: S.num, cancelled_value: S.usd, cancel_rate: S.pct, discount: S.usd, discount_rate: S.pct, commission: S.usd };

  // ---------- overview additions
  const overview = (p) => {
    const com = S.rows('commercial'), box = $('#comm-kpis');
    const Y = /^\d{4}$/.test(p.year) ? p.year : curYear();
    $('#h-commercial').textContent = 'Commercial performance: ' + Y + ' departures';
    if (!fails(box, 'commercial')) { const k = [p.brand, p.dest, p.vtype, Y].join('|'); fill(box, 'commercial', com.find((r) => r.key === k), k, CF); }
    // forward look
    const fc = S.rows('forecast'), fw = $('#fwd');
    if (!fc) S.fail(fw, 'forecast');
    else {
      fw.replaceChildren();
      for (const h of [30, 60, 90]) {
        const r = fc.find((x) => x.key === p.brand + '|' + h); if (!r) continue;
        const w = 'key=' + S.enc(r.key), d = document.createElement('div');
        const big = document.createElement('b'); big.className = 'big'; mk(big, 'forecast', 'f_bookings', w); big.textContent = S.num(r.f_bookings);
        const line = (...n) => { const x = document.createElement('div'); x.append(...n); return x; };
        const bold = (t, f) => { const b = document.createElement('b'); b.textContent = t; return mk(b, 'forecast', f, w); };
        d.append(line('Next ' + h + ' days'), big,
          line('bookings expected (', span(S.num(r.f_low), 'forecast', 'f_low', w), '–', span(S.num(r.f_high), 'forecast', 'f_high', w), '), about ', bold(S.usd(r.f_value), 'f_value'), '. Same days last year: ', span(S.num(r.ly_bookings), 'forecast', 'ly_bookings', w), '; trend ', span(xx(r.trend), 'forecast', 'trend', w), '.'),
          line(bold(S.num(r.departures), 'departures'), ' departures leave in this window with ', bold(S.num(r.unsold), 'unsold'), ' unsold cabins; ', bold(S.num(r.at_risk), 'at_risk'), ' behind pace or without marketing.'));
        fw.append(d);
      }
    }
    // watch
    const wt = S.rows('watch'), tbl = $('#t-watch');
    const lists = { 'Rising demand': $('#fwd-rise'), 'Declining enquiries': $('#fwd-fall'), Campaign: $('#fwd-camp') };
    if (!wt) { S.fail(tbl.parentElement, 'watch'); return; }
    const mine = wt.filter((r) => p.brand === 'All' || r.brand === p.brand || r.brand === 'All');
    for (const [area, ul] of Object.entries(lists)) {
      const rs = mine.filter((r) => r.area === area).slice(0, 5); ul.replaceChildren();
      ul.dataset.source = 'watch';
      if (!rs.length) { const li = document.createElement('li'); li.textContent = 'Nothing above the threshold.'; ul.append(li); }
      for (const r of rs) { const li = document.createElement('li'); li.append(span(r.observation, 'watch', 'observation', 'key=' + S.enc(r.key))); ul.append(li); }
    }
    tbl._redraw = () => overview(p);
    S.table(tbl, mine.filter((r) => !lists[r.area]), [{ f: 'area', cls: 'l' }, { f: 'observation', cls: 'wrap' }, { f: 'severity', cls: 'l', render: (r) => pc(SEV[r.severity] || 'muted', r.severity) }, { f: 'look', cls: 'l hide-narrow' }], { sort: null });
    if (!tbl.tBodies[0].children.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 4; td.className = 'l'; td.textContent = 'No observations above the thresholds for this selection.'; tr.append(td); tbl.tBodies[0].append(tr); }
  };

  // ---------- revenue & commercial
  $('#rev-year').addEventListener('change', () => revenue(dashP()));
  const dashP = () => { const p = dash.params(); return { brand: p.brand || 'All', dest: p.dest || 'All', vtype: p.vtype || 'All', year: p.year || 'All' }; };
  const revenue = (p) => {
    const com = S.rows('commercial'), sel = $('#rev-year'), box = $('#rev-kpis');
    if (!com) { fails(box, 'commercial'); S.fail($('#c-revdest'), 'commercial'); S.fail($('#t-rev').parentElement, 'commercial'); return; }
    if (!sel.options.length) { const ys = [...new Set(com.map((r) => r.year))].filter((y) => y !== 'All').sort(); sel.replaceChildren(new Option('All years', 'All'), ...ys.map((y) => new Option(y, y))); sel.value = ys.includes(curYear()) ? curYear() : 'All'; }
    const Y = sel.value, k = [p.brand, p.dest, p.vtype, Y].join('|');
    fill(box, 'commercial', com.find((r) => r.key === k), k, CF);
    const byDest = com.filter((r) => r.brand === p.brand && r.vtype === p.vtype && r.year === Y && r.dest !== 'All' && (p.dest === 'All' || r.dest === p.dest)).sort((a, b) => b.revenue - a.revenue);
    S.bars($('#c-revdest'), byDest, { x: 'dest', y: 'revenue', yfmt: (v) => '$' + d3.format('~s')(v),
      tipLines: (d) => [['Booking value', S.usd(d.revenue)], ['Utilisation', S.pct(d.util_cabin)], ['Departures', S.num(d.departures)], ['Value at risk', S.usd(d.at_risk)]] });
    const t = $('#t-rev'); t._redraw = () => revenue(p);
    S.table(t, com.filter((r) => r.year === Y && r.vtype === p.vtype && r.brand !== 'All' && r.dest !== 'All' && (p.brand === 'All' || r.brand === p.brand) && (p.dest === 'All' || r.dest === p.dest)), [
      { f: 'brand', cls: 'l' }, { f: 'dest', cls: 'l' }, { f: 'departures', fmt: S.num }, { f: 'cabins_sold', fmt: S.num }, { f: 'util_cabin', fmt: S.pct }, { f: 'revenue', fmt: S.usd }, { f: 'avg_value', fmt: S.usd },
      { f: 'margin_pct', fmt: S.pct }, { f: 'revpacn', fmt: S.usd2 }, { f: 'revpan', fmt: S.usdFull }, { f: 'discount_rate', fmt: S.pct }, { f: 'cancel_rate', fmt: S.pct }, { f: 'at_risk', fmt: S.usd }], { sort: { f: 'revenue', dir: -1 } });
    const cube = S.rows('cube'), ta = $('#t-acq');
    if (!cube) { S.fail(ta.parentElement, 'cube'); return; }
    const per = cube.some((r) => r.period === Y) ? Y : 'All';
    $('#acq-note').textContent = 'Enquiries made in ' + (per === 'All' ? '2024 to date' : per) + (per !== Y && Y !== 'All' ? ' (no enquiries for ' + Y + ' yet)' : '') + ', with the full marketing cost. Enquiry-based, so it does not line up exactly with the departure-year figures above.';
    ta._redraw = () => revenue(p);
    S.table(ta, cube.filter((r) => r.dest === 'All' && r.vtype === 'All' && r.period === per && (p.brand === 'All' || r.brand === p.brand || r.brand === 'All')), [
      { f: 'brand', cls: 'l', render: (r) => (r.brand === 'All' ? 'All brands' : r.brand) }, { f: 'spend', fmt: S.usd }, { f: 'qualified', fmt: S.num }, { f: 'cpql', fmt: S.usd2 }, { f: 'bookings', fmt: S.num }, { f: 'cac', fmt: S.usdFull },
      { f: 'revenue', fmt: S.usd }, { f: 'roas', fmt: xx }, { f: 'mkt_revenue', fmt: S.usd }, { f: 'margin_roi', fmt: xx }], { sort: null });
  };

  // ---------- inventory risk
  const risk = (p) => {
    const sum = S.rows('risk_sum'), rows = S.rows('risk'), box = $('#risk-kpis'), k = p.brand + '|' + p.dest;
    if (!fails(box, 'risk_sum')) fill(box, 'risk_sum', sum.find((r) => r.key === k), k, {});
    const t = $('#t-risk');
    if (!rows) { S.fail(t.parentElement, 'risk'); return; }
    t._redraw = () => risk(p);
    S.table(t, rows.filter((r) => r.unsold > 0 && (p.brand === 'All' || r.brand === p.brand) && (p.dest === 'All' || r.dest === p.dest)), [
      { f: 'departure', cls: 'l', render: (r) => S.date(r.departure) }, { f: 'brand', cls: 'l' }, { f: 'dest', cls: 'l' }, { f: 'unsold', fmt: S.num }, { f: 'days_out', fmt: S.num }, { f: 'risk_points', fmt: S.num },
      { f: 'risk_band', cls: 'l', render: (r) => pc(r.risk_band === 'High' ? 'bad' : r.risk_band === 'Medium' ? 'warn' : 'ok', r.risk_band) }, { f: 'coverage_score', fmt: S.num },
      { f: 'cov_paid', cls: 'l', render: (r) => yn(r.cov_paid) }, { f: 'cov_content', cls: 'l', render: (r) => yn(r.cov_content) }, { f: 'cov_markets', cls: 'l', render: (r) => yn(r.cov_markets) },
      { f: 'cov_agents', cls: 'l', render: (r) => yn(r.cov_agents) }, { f: 'cov_audience', cls: 'l', render: (r) => yn(r.cov_audience) }, { f: 'reasons', cls: 'wrap' }], { sort: { f: 'risk_points', dir: -1 } });
  };

  // ---------- spend additions
  const spend = (p) => {
    const rows = S.rows('spend_split'), ids = ['#t-spgroup', '#t-spdest', '#t-spobj'];
    if (!rows) { ids.forEach((i) => S.fail($(i).parentElement, 'spend_split')); return; }
    const pick = (kind) => rows.filter((r) => r.kind === kind && r.brand === p.brand && r.period === p.year);
    const g = $('#t-spgroup'); g._redraw = () => spend(p);
    const order = ['Paid media', 'Brand & content', 'PR & partnerships', 'Digital infrastructure'];
    S.table(g, pick('group').sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)), [{ f: 'label', cls: 'l' }, { f: 'cost', fmt: S.usd }, { f: 'share', fmt: S.pct }, { f: 'committed', fmt: S.usd }, { f: 'comped_value', fmt: S.usd }], { sort: null });
    const cols = [{ f: 'label', cls: 'l' }, { f: 'cost', fmt: S.usd }, { f: 'qualified', fmt: S.num }, { f: 'cpql', fmt: S.usdFull }, { f: 'bookings', fmt: S.num }, { f: 'cac', fmt: S.usdFull }, { f: 'value', fmt: S.usd }, { f: 'roas', fmt: xx }];
    for (const [id, kind] of [['#t-spdest', 'dest'], ['#t-spobj', 'objective']]) { const t = $(id); t._redraw = () => spend(p); S.table(t, pick(kind), cols, { sort: { f: 'cost', dir: -1 } }); }
  };

  // ---------- markets additions
  $('#mo-period').addEventListener('change', () => markets(dashP()));
  $('#win-dest').addEventListener('change', () => markets(dashP()));
  const markets = (p) => {
    const mo = S.rows('market_opp'), t = $('#t-mo');
    if (!mo) S.fail(t.parentElement, 'market_opp');
    else { t._redraw = () => markets(p); const per = $('#mo-period').value;
      S.table(t, mo.filter((r) => r.brand === p.brand && r.period === per), [{ f: 'group', cls: 'l' }, { f: 'spend', fmt: S.usd }, { f: 'spend_share', fmt: S.pct }, { f: 'value', fmt: S.usd }, { f: 'value_share', fmt: S.pct },
        { f: 'opp_index', render: (r) => { const s = document.createElement('span'); s.textContent = S.x(r.opp_index); if (r.opp_index >= 1.2) s.style.color = 'var(--color-ok)'; else if (r.opp_index != null && r.opp_index < 0.8) s.style.color = 'var(--color-bad)'; return s; } },
        { f: 'value_per_usd', fmt: S.usdFull }, { f: 'cac', fmt: S.usdFull }, { f: 'avg_value', fmt: S.usd }, { f: 'l2b', fmt: S.pct }], { sort: { f: 'opp_index', dir: -1 } }); }
    const w = S.rows('windows'), tw = $('#t-win'), sel = $('#win-dest');
    if (!w) { S.fail(tw.parentElement, 'windows'); return; }
    if (!sel.options.length) { const ds = [...new Set(w.map((r) => r.dest))].filter((d) => d !== 'All').sort(); sel.replaceChildren(new Option('All destinations', 'All'), ...ds.map((d) => new Option(d, d))); }
    const grp = (g) => (g === 'All markets' ? 0 : 1);
    tw._redraw = () => markets(p);
    S.table(tw, w.filter((r) => r.brand === p.brand && r.dest === sel.value).sort((a, b) => grp(a.group) - grp(b.group) || (a.group < b.group ? -1 : a.group > b.group ? 1 : a.vtype < b.vtype ? -1 : 1)), [
      { f: 'group', cls: 'l' }, { f: 'vtype', cls: 'l' }, { f: 'bookings', fmt: S.num }, { f: 'e2d_p25', fmt: S.days }, { f: 'e2d_median', fmt: S.days }, { f: 'e2d_p75', fmt: S.days }, { f: 'book_lt_median', fmt: S.days }], { sort: null });
  };

  // ---------- seasonality: marketing timing
  const season = (p) => {
    const rows = S.rows('timing'), t = $('#t-timing');
    if (!rows) { S.fail(t.parentElement, 'timing'); return; }
    t._redraw = () => season(p);
    const st = (s) => pc(/^Late/.test(s) ? 'bad' : /within/.test(s) ? 'warn' : /Running|Sold out/.test(s) ? 'ok' : 'muted', s);
    S.table(t, rows.filter((r) => r.dest === p.dest), [{ f: 'moy', cls: 'l', render: (r) => S.MOY[r.moy - 1] }, { f: 'bookings', fmt: S.num }, { f: 'e2d_median', fmt: S.days }, { f: 'e2d_p75', fmt: S.days },
      { f: 'peak_booking_moy', cls: 'l', render: (r) => S.MOY[r.peak_booking_moy - 1] }, { f: 'start_days', fmt: S.days }, { f: 'next_dep_month', cls: 'l', render: (r) => (r.next_dep_month ? S.monLbl(r.next_dep_month) : '—') },
      { f: 'unsold', fmt: S.num }, { f: 'start_by', cls: 'l', render: (r) => S.date(r.start_by) }, { f: 'status', cls: 'l', render: (r) => st(r.status) }], { sort: null });
  };

  // ---------- sales: pipeline and bottlenecks
  $('#st-period').addEventListener('change', () => sales(dashP()));
  const sales = (p) => {
    const rows = S.rows('stages'), fe = $('#st-funnel'), rt = $('#st-rates'), bn = $('#bn');
    if (!rows) { [fe, rt, bn].forEach((e) => S.fail(e, 'stages')); return; }
    const r = rows.find((x) => x.key === p.brand + '|' + $('#st-period').value);
    if (!r) { fe.textContent = 'No enquiries in this period.'; rt.replaceChildren(); bn.replaceChildren(); return; }
    const w = 'key=' + S.enc(r.key), c = (f, fmt) => span(fmt(r[f]), 'stages', f, w);
    S.funnel(fe, [
      { label: 'Enquiries', n: r.leads, field: 'leads' },
      { label: 'Qualified leads', n: r.qualified, field: 'qualified', rate: r.l2q, rateField: 'l2q', rateLabel: 'qualified' },
      { label: 'Active conversations', n: r.replied, field: 'replied', rate: r.q2r, rateField: 'q2r' },
      { label: 'Proposals sent', n: r.proposals, field: 'proposals', rate: r.r2p, rateField: 'r2p' },
      { label: 'Confirmed bookings', n: r.bookings, field: 'bookings', rate: r.p2b, rateField: 'p2b', rateLabel: 'of decided proposals' },
    ], (el, f) => mk(el, 'stages', f, w));
    rt.replaceChildren(rate('Enquiry to proposal', c('days_e2p', S.days), ' median'), rate('Proposal to booking', c('days_p2b', S.days), ' median'), rate('First reply to qualified leads', c('reply_median', S.x), ' h median'),
      rate('Answered within an hour', c('reply_1h', S.pct)), rate('Open proposals', c('open_proposals', S.num)), rate('Expected value of open proposals', c('open_value', S.usd)));
    const col = (title, note, ...items) => { const d = document.createElement('div'); d.className = 'tgt'; const h = document.createElement('h4'); h.textContent = title; const n = document.createElement('div'); n.className = 'line'; n.textContent = note; const g = document.createElement('div'); g.className = 'rates'; g.append(...items); d.append(h, n, g); return d; };
    bn.replaceChildren(
      col('Shows up in marketing', 'Leads that never qualify point to targeting, audiences or promises that do not match the product.', rate('Enquiries not qualified', c('unqualified_share', S.pct)), rate('Lead to qualified', c('l2q', S.pct))),
      col('Shows up in the sales process', 'Slow replies and proposals, and qualified guests who go quiet.', rate('Median first reply', c('reply_median', S.x), ' h'), rate('Within an hour', c('reply_1h', S.pct)), rate('Enquiry to proposal', c('days_e2p', S.days)), rate('Lost: guest went quiet or lacked information', c('lost_sales', S.num))),
      col('Commercial constraints', 'Price, availability, product fit and competitors: for Sales and Revenue to weigh, not marketing alone.', rate('Lost: price, dates, fit, competitor', c('lost_commercial', S.num)), rate('Lost: postponed', c('lost_timing', S.num)), rate('Lost: reason unknown', c('lost_unknown', S.num)), rate('Qualified leads lost', c('lost_qualified', S.num))));
  };

  // ---------- journey: attribution and retention
  $('#ret-year').addEventListener('change', () => journey(dashP()));
  const journey = (p) => {
    const at = S.rows('attribution'), box = $('#att-kpis'), ta = $('#t-assist');
    if (!at) { fails(box, 'attribution'); S.fail(ta.parentElement, 'attribution'); }
    else {
      const k = 'sum|' + p.brand; fill(box, 'attribution', at.find((r) => r.key === k), k, { known_share: S.pct, single_share: S.pct, assisted_share: S.pct, high_share: S.pct, medium_share: S.pct, low_share: S.pct, low_value: S.usd, bookings: S.num });
      ta._redraw = () => journey(p);
      S.table(ta, at.filter((r) => r.kind === 'channel' && r.brand === p.brand), [{ f: 'channel', cls: 'l' }, { f: 'first', fmt: S.num }, { f: 'enquiry', fmt: S.num }, { f: 'assists', fmt: S.num }, { f: 'assist_value', fmt: S.usd }], { sort: { f: 'assists', dir: -1 } });
    }
    const rt = S.rows('retention'), tr = $('#t-ret');
    if (!rt) { S.fail(tr.parentElement, 'retention'); return; }
    tr._redraw = () => journey(p);
    const ord = { New: 0, Repeat: 1, Referred: 2 };
    S.table(tr, rt.filter((r) => r.brand === p.brand && r.year === $('#ret-year').value).sort((a, b) => ord[a.guest] - ord[b.guest]), [{ f: 'guest', cls: 'l' }, { f: 'bookings', fmt: S.num }, { f: 'share_bookings', fmt: S.pct }, { f: 'value', fmt: S.usd },
      { f: 'share_value', fmt: S.pct }, { f: 'avg_value', fmt: S.usd }, { f: 'cac', fmt: S.usdFull }], { sort: null });
  };

  // ---------- B2B & partnerships
  const b2b = (p) => {
    const rows = S.rows('b2b'), box = $('#b2b-kpis'), ids = ['#t-route', '#t-b2bmkt', '#t-b2bdest', '#t-b2bact'];
    if (!rows) { fails(box, 'b2b'); ids.forEach((i) => S.fail($(i).parentElement, 'b2b')); return; }
    const k = ['route', p.brand, p.year, 'Agent'].join('|');
    fill(box, 'b2b', rows.find((r) => r.key === k), k, { leads: S.num, l2b: S.pct, bookings: S.num, share_bookings: S.pct, value: S.usd, share_value: S.pct, avg_value: S.usd, cycle_median: S.num, commission: S.usd, commission_rate: S.pct });
    const pick = (kind) => rows.filter((r) => r.kind === kind && r.brand === p.brand && r.period === p.year);
    const T = (id, data, cols, sort) => { const t = $(id); t._redraw = () => b2b(p); S.table(t, data, cols, { sort }); };
    T('#t-route', pick('route'), [{ f: 'label', cls: 'l' }, { f: 'leads', fmt: S.num }, { f: 'bookings', fmt: S.num }, { f: 'l2b', fmt: S.pct }, { f: 'p2b', fmt: S.pct }, { f: 'value', fmt: S.usd }, { f: 'share_value', fmt: S.pct },
      { f: 'avg_value', fmt: S.usd }, { f: 'commission', fmt: S.usd }, { f: 'cycle_median', fmt: S.days }, { f: 'cancel_rate', fmt: S.pct }], null);
    T('#t-b2bmkt', pick('market'), [{ f: 'label', cls: 'l' }, { f: 'leads', fmt: S.num }, { f: 'bookings', fmt: S.num }, { f: 'l2b', fmt: S.pct }, { f: 'value', fmt: S.usd }, { f: 'avg_value', fmt: S.usd }], { f: 'value', dir: -1 });
    T('#t-b2bdest', pick('dest'), [{ f: 'label', cls: 'l' }, { f: 'bookings', fmt: S.num }, { f: 'share_agent', fmt: S.pct }, { f: 'share_all', fmt: S.pct }, { f: 'value', fmt: S.usd }], { f: 'bookings', dir: -1 });
    T('#t-b2bact', rows.filter((r) => r.kind === 'activity' && (p.brand === 'All' || r.brand === p.brand || r.brand === 'All brands') && inPeriod(r.date, p.year)), [
      { f: 'date', cls: 'l', render: (r) => S.date(r.date) }, { f: 'category', cls: 'l' }, { f: 'label', cls: 'l' }, { f: 'brand', cls: 'l hide-narrow' }, { f: 'destination', cls: 'l hide-narrow' }, { f: 'cost', fmt: S.usdFull },
      { f: 'leads_before', fmt: S.num }, { f: 'leads_after', fmt: S.num }, { f: 'lift', render: (r) => (r.lift == null ? '—' : S.signed(r.lift)) }, { f: 'bookings_after', fmt: S.num }, { f: 'value_after', fmt: S.usd }, { f: 'window', cls: 'l' }], { f: 'date', dir: -1 });
  };


  // ---------- decisions: the front door
  const TABNAME = { overview: 'Executive overview', revenue: 'Revenue & commercial', inventory: 'Inventory & coverage', spend: 'Marketing spend', campaigns: 'Campaign performance', markets: 'Markets & lead time',
    sales: 'Sales & conversion', journey: 'Guest journey & retention', b2b: 'B2B & partnerships', planner: 'Budget planner & forecasting', season: 'Seasonality & demand', govern: 'Definitions & roadmap', decisions: 'Decisions' };
  const EF = { num: S.num, usd: S.usdFull, pct: S.pct, x: (v) => (v == null ? '—' : S.x(v) + '×'), h: (v) => (v == null ? '—' : S.x(v) + ' h') };
  const go = (tab) => { if (S.show) { S.show(tab); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
  const CONF = { High: 'ok', Medium: 'warn', Low: 'bad' };
  const decCard = (el, r, more) => {
    const w = 'key=' + S.enc(r.key);
    el.replaceChildren(); el.classList.add('card', 'dec');
    const head = document.createElement('div'); head.className = 'dec-head';
    const n = document.createElement('span'); n.className = 'dec-n'; n.textContent = r.n ? String(r.n) : '◷';
    const h = document.createElement('h3'); h.append(span(r.question, 'decisions', 'question', w));
    head.append(n, h, mk(pc(CONF[r.confidence] || 'muted', r.confidence + ' confidence'), 'decisions', 'confidence', w));
    const v = document.createElement('p'); v.className = 'verdict'; v.append(span(r.answer, 'decisions', 'answer', w));
    const ev = document.createElement('div'); ev.className = 'ev';
    for (const i of [1, 2, 3]) {
      if (!r['e' + i + '_label']) continue;
      const d = document.createElement('div'), f = EF[r['e' + i + '_fmt']] || S.num, b = document.createElement('b');
      b.append(span(f(r['e' + i]), 'decisions', 'e' + i, w));
      d.append(span(r['e' + i + '_label'], 'decisions', 'e' + i + '_label', w), b);
      if (r['e' + i + '_base'] != null) d.append(document.createTextNode('usually '), span(f(r['e' + i + '_base']), 'decisions', 'e' + i + '_base', w));
      ev.append(d);
    }
    el.append(head, v, ev);
    const m = document.createElement('p'); m.className = 'meta';
    const st = (t) => { const x = document.createElement('strong'); x.textContent = t; return x; };
    m.append(st('Why this confidence: '), span(r.confidence_why, 'decisions', 'confidence_why', w));
    if (r.change) m.append(' ', st('What would change the answer: '), span(r.change, 'decisions', 'change', w));
    el.append(m);
    if (more) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'See the detail in ' + TABNAME[r.look] + ' →'; b.addEventListener('click', () => go(r.look)); el.append(b); }
  };
  const decisions = (p) => {
    const rows = S.rows('decisions'), top = $('#dec-0'), list = $('#dec-list');
    if (!rows) { S.fail(top, 'decisions'); S.fail(list, 'decisions'); return; }
    const mine = rows.filter((r) => r.brand === p.brand).sort((a, b) => a.n - b.n);
    const c = mine.find((r) => r.n === 0);
    if (c) decCard(top, c, true); else top.textContent = 'No data for this brand.';
    list.replaceChildren(...mine.filter((r) => r.n > 0).map((r) => { const d = document.createElement('div'); decCard(d, r, true); return d; }));
  };

  // ---------- the question each tab answers, with its decision's answer on top
  const QS = {
    overview: ['How are we doing against target, and what needs attention first?', 0],
    revenue: ['Is the inventory earning what it should, and where is revenue at risk?', 1],
    inventory: ['Which departures need marketing now, and which will fill without it?', 1],
    spend: ['Where is the money going, and what is each kind of spend returning?', 2],
    campaigns: ['Which campaigns are earning their budget, and at which stage do the others fall short?', 2],
    planner: ['What would a given budget buy for a departure, and is it enough in time?', 2],
    season: ['When do guests travel, when do they decide, and when must each campaign start?', 4],
    markets: ['Which markets book how far ahead, and which return more than their share of spend?', 5],
    sales: ['When we fall short, is it marketing, the sales process, or price and product?', 3],
    journey: ['Which guests and journeys are worth most, and how far can we trust the attribution?', null],
    b2b: ['What do agents and partnerships bring, and where would more investment pay?', 5],
  };
  const banner = (tab, p) => {
    const sec = document.getElementById(tab), q = QS[tab]; if (!sec || !q) return;
    let bar = sec.querySelector(':scope > .qbar');
    if (!bar) { bar = document.createElement('div'); bar.className = 'qbar'; sec.prepend(bar); }
    const qq = document.createElement('span'); qq.className = 'qq'; qq.textContent = 'This tab answers';
    const qt = document.createElement('span'); qt.className = 'qt'; qt.textContent = q[0];
    bar.replaceChildren(qq, qt);
    const rows = S.rows('decisions');
    if (q[1] == null) { const a = document.createElement('p'); a.className = 'qa'; a.textContent = 'It feeds decisions 2 (where the next dollar goes) and 5 (which markets deserve more).'; bar.append(a); }
    else if (rows) {
      const r = rows.find((x) => x.key === p.brand + '|' + q[1]);
      if (r) { const a = document.createElement('p'); a.className = 'qa'; a.append(r.n ? 'Decision ' + r.n + ': ' : 'Last 30 days: ', span(r.answer, 'decisions', 'answer', 'key=' + S.enc(r.key)), ' ', mk(pc(CONF[r.confidence] || 'muted', r.confidence + ' confidence'), 'decisions', 'confidence', 'key=' + S.enc(r.key)));
        bar.append(a); }
    }
    const b = document.createElement('button'); b.type = 'button'; b.className = 'qlink'; b.textContent = 'All five decisions'; b.addEventListener('click', () => go('decisions')); bar.append(b);
  };

  window.SMIX = { overview, revenue, risk, spend, markets, season, sales, journey, b2b, decisions, banner };
})();
