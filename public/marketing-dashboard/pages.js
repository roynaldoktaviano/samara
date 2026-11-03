// Page logic: tabs, filters and each section's drawing.
(function () {
  const S = window.SMI;
  const $ = (s) => document.querySelector(s);
  const TAB_FILTERS = { decisions: ['brand'], overview: ['brand', 'dest', 'vtype', 'year'], revenue: ['brand', 'dest', 'vtype'], inventory: ['brand', 'dest'], spend: ['brand', 'year'], campaigns: ['brand', 'dest', 'year'], planner: [], markets: ['brand'], season: ['brand', 'dest', 'vtype'], sales: ['brand'], journey: ['brand'], b2b: ['brand', 'year'], govern: [] };
  const PERIODS = [['All', '2024 to date'], ['2024', '2024'], ['2025', '2025'], ['2026', '2026 to date'], ['L90', 'Last 90 days'], ['L30', 'Last 30 days']];
  const CMP = { 2025: '2024', 2026: 'the same months of 2025', L90: 'the same 90 days last year', L30: 'the same 30 days last year' };
  const asOfDate = () => { const e = S.rows('enriched'); return e && e.length ? e[0].as_of : ''; };
  const backDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') - (n - 1) * 864e5).toISOString().slice(0, 10);
  // does a YYYY-MM month or YYYY-MM-DD date fall in the selected period?
  const inPeriod = (x, per) => {
    if (per === 'All') return true;
    if (/^\d{4}$/.test(per)) return x.startsWith(per);
    const a = asOfDate(); if (!a) return true;
    const start = backDays(a, per === 'L90' ? 90 : 30);
    return x.length === 7 ? x >= start.slice(0, 7) && x <= a.slice(0, 7) : x >= start && x <= a;
  };
  let tab = 'decisions';
  const mk = (el, src, field, where) => { el.dataset.source = src; if (field) el.dataset.field = field; if (where) el.dataset.where = where; return el; };
  const span = (text, src, field, where) => { const s = document.createElement('span'); s.textContent = text; if (src) mk(s, src, field, where); return s; };
  const P = () => { const p = dash.params(); return { brand: p.brand || 'All', dest: p.dest || 'All', vtype: p.vtype || 'All', year: p.year || 'All' }; };
  const ALL = 'slice=All|All|All|All';
  document.querySelectorAll('#kpis [data-source=cube]').forEach((el) => (el.dataset.where = ALL));

  // ---------- tabs
  const showTab = (t, push = true) => {
    if (!TAB_FILTERS[t]) return;
    tab = t;
    document.querySelectorAll('.smi-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    document.querySelectorAll('.page').forEach((p) => (p.hidden = p.id !== t));
    const fs = TAB_FILTERS[t];
    $('#filters').hidden = !fs.length;
    document.querySelectorAll('#filters [data-f]').forEach((l) => (l.hidden = !fs.includes(l.dataset.f)));
    if (push) dash.setLink(t);
    render();
  };
  document.querySelectorAll('.smi-tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ---------- filters
  const fsel = { brand: $('#f-brand'), dest: $('#f-dest'), vtype: $('#f-vtype'), year: $('#f-year') };
  let filtersBuilt = false;
  const buildFilters = (cube) => {
    if (filtersBuilt) return; filtersBuilt = true;
    const parts = [new Set(), new Set(), new Set(), new Set()];
    for (const r of cube) r.slice.split('|').forEach((v, i) => v !== 'All' && parts[i].add(v));
    const lbl = { brand: 'All brands', dest: 'All destinations', vtype: 'All voyage types' };
    ['brand', 'dest', 'vtype', 'year'].forEach((k, i) => {
      if (k === 'year') fsel[k].replaceChildren(...PERIODS.map(([v, t]) => new Option(t, v)));
      else fsel[k].replaceChildren(new Option(lbl[k], 'All'), ...[...parts[i]].sort().map((v) => new Option(v, v)));
      fsel[k].addEventListener('change', () => dash.setParams({ [k]: fsel[k].value }));
    });
  };
  $('#f-reset').addEventListener('click', () => dash.resetParams());

  // ---------- header
  const drawHeader = () => {
    const health = S.rows('health'), en = S.rows('enriched'), yr = S.rows('yearly');
    const tk = $('#takeaway');
    if (en && en.length) $('#asof').textContent = 'Leads to ' + en[0].as_of;
    if (!yr || !health) { if (S.state('yearly') === 'error') { tk.classList.remove('dash-skeleton'); tk.textContent = 'Data failed to load.'; } return; }
    const Y = (en && en.length ? en[0].as_of : '2026').slice(0, 4);
    const a = yr.find((r) => r.key === 'All|' + Y); if (!a) return;
    const w = 'key=' + S.enc(a.key);
    tk.replaceChildren(span(Y, 'yearly', 'year', w), ' departures have ', span(S.usd(a.rev_booked), 'yearly', 'rev_booked', w), ' booked, ', span(S.pct(a.rev_pct), 'yearly', 'rev_pct', w), ' of the ',
      span(S.usd(a.rev_target), 'yearly', 'rev_target', w), ' target. A year ago, ', span(S.pct(a.usual_pct), 'yearly', 'usual_pct', w), ' of the previous year\'s departures were already booked. Marketing has spent ',
      span(S.usd(a.spent), 'yearly', 'spent', w), ' of its ', span(S.usd(a.budget), 'yearly', 'budget', w), ' budget. ');
    const recent = health.filter((r) => r.brand === 'All' && r.flag === 'Marketing on plan, sales conversion down').slice(-1)[0];
    if (recent) {
      const hw = 'key=' + S.enc(recent.key);
      tk.append('In ', span(recent.month, 'health', 'month', hw), ' marketing delivered ', span(S.num(recent.qualified), 'health', 'qualified', hw), ' qualified leads against a plan of ',
        span(S.num(recent.plan_qualified), 'health', 'plan_qualified', hw), ', but proposal-to-booking fell to ', span(S.pct(recent.p2b), 'health', 'p2b', hw), ' from ',
        span(S.pct(recent.p2b_baseline), 'health', 'p2b_baseline', hw), ' and median first reply was ', span(S.x(recent.reply_median), 'health', 'reply_median', hw), ' hours: worth reviewing with sales.');
    }
  };

  // ---------- overview
  const KFMT = { bookings: S.num, cabins: S.num, revenue: S.usd, avg_value: S.usd, margin: S.usd, margin_roi: S.x, spend: S.usd, ad_spend: S.usd, other_spend: S.usd, roas: S.x, cpl: S.usd2, cpql: S.usd2, cac: S.usdFull, p2b: S.pct, qualified: S.num, l2b: S.pct, mkt_revenue: S.usd, mkt_share: S.pct, mkt_roas: S.x };
  const GOOD = { bookings: 1, revenue: 1, margin: 1, spend: 0, cpl: -1, cac: -1, qualified: 1 };
  // delta lines under the six headline figures
  document.querySelectorAll('#kpis .kpi > b[data-field]').forEach((b) => { const f = b.dataset.field; if (!(f in GOOD)) return; const d = document.createElement('span'); d.className = 'delta'; d.dataset.for = f; b.parentElement.append(d); });
  const drawTargets = () => {
    const box = $('#targets'), yr = S.rows('yearly');
    if (!yr) { S.fail(box, 'yearly'); return; }
    const b = P().brand, Y = Number((asOfDate() || '2026').slice(0, 4));
    box.replaceChildren();
    const line = (...n) => { const d = document.createElement('div'); d.className = 'line'; d.append(...n); return d; };
    const bold = (text, f, w) => { const e = document.createElement('b'); e.textContent = text; return mk(e, 'yearly', f, w); };
    const prog = (pct, tick, bad) => { const o = document.createElement('div'); o.className = 'prog'; const i = document.createElement('i'); i.style.width = Math.min(100, (pct || 0) * 100) + '%';
      i.style.setProperty('--fill', bad ? 'var(--cds-chart-status-critical)' : dash.colors[0]); o.append(i);
      if (tick != null) { const u = document.createElement('u'); u.style.left = Math.min(100, tick * 100) + '%'; o.append(u); } return o; };
    for (const y of [Y, Y + 1]) {
      const r = yr.find((x) => x.key === b + '|' + y); if (!r) continue;
      const w = 'key=' + S.enc(r.key), col = document.createElement('div'); col.className = 'tgt';
      const ratio = r.usual_pct ? r.rev_pct / r.usual_pct : null;
      const st = ratio == null ? null : ratio < 0.9 ? 'Behind last year’s pace' : ratio > 1.05 ? 'Ahead of last year’s pace' : 'On track';
      const h = document.createElement('h4'); h.append(span(String(y), 'yearly', 'year', w), ' departures'); if (st) h.append(S.pill(st));
      const big = document.createElement('div'); big.className = 'big'; big.append(span(S.usd(r.rev_booked), 'yearly', 'rev_booked', w));
      col.append(h, big, line('booked of ', bold(S.usd(r.rev_target), 'rev_target', w), ' target'), prog(r.rev_pct, r.usual_pct, ratio != null && ratio < 0.9));
      col.append(line(bold(S.pct(r.rev_pct), 'rev_pct', w), ' of target · last year ', bold(S.pct(r.usual_pct), 'usual_pct', w), ' was booked by this date · ', bold(S.usd(r.rev_gap), 'rev_gap', w), ' still to book'));
      col.append(line('New guests through marketing: ', bold(S.usd(r.rev_marketing), 'rev_marketing', w), ' (', span(S.pct(r.mkt_share), 'yearly', 'mkt_share', w), ' of booked) · cabins ', bold(S.num(r.cabins_sold), 'cabins_sold', w), ' of ', span(S.num(r.cabins_target), 'yearly', 'cabins_target', w), ' target · cancelled ', span(S.usd(r.rev_cancelled), 'yearly', 'rev_cancelled', w)));
      const hr = document.createElement('hr'); hr.className = 'tgt-sep'; col.append(hr);
      if (r.spent > 0) {
        const over = r.budget_to_date && r.spent > r.budget_to_date * 1.05;
        col.append(line('Marketing budget: spent ', bold(S.usd(r.spent), 'spent', w), ' of ', bold(S.usd(r.budget), 'budget', w), ' (', span(S.pct(r.spent_pct), 'yearly', 'spent_pct', w), '); plan to date ', span(S.usd(r.budget_to_date), 'yearly', 'budget_to_date', w)),
          prog(r.spent_pct, r.budget ? r.budget_to_date / r.budget : null, over),
          line('Ads ', span(S.usd(r.ads), 'yearly', 'ads', w), ' · other ', span(S.usd(r.other), 'yearly', 'other', w), ' · committed ', span(S.usd(r.committed), 'yearly', 'committed', w), ' · marketing cost ', bold(S.pct(r.cost_ratio), 'cost_ratio', w), ' of revenue booked in ' + y));
      } else col.append(line('Marketing budget: ', bold(S.usd(r.budget), 'budget', w), ' for ' + y + '; ', span(S.usd(r.committed), 'yearly', 'committed', w), ' already committed.'));
      box.append(col);
    }
  };
  const drawOverview = () => {
    drawTargets();
    const p = P(), slice = [p.brand, p.dest, p.vtype, p.year].join('|'), w = 'slice=' + S.enc(slice);
    const cube = S.rows('cube');
    document.querySelectorAll('#kpis [data-source=cube]:not(.delta)').forEach((el) => { el.dataset.where = w; });
    $('#cmp-label').textContent = CMP[p.year] || 'the period before, where there is one';
    if (cube) {
      const r = cube.find((x) => x.slice === slice);
      document.querySelectorAll('#kpis [data-source=cube]:not(.delta)').forEach((el) => { el.classList.remove('dash-skeleton'); el.textContent = r ? KFMT[el.dataset.field](r[el.dataset.field]) : '—'; });
      document.querySelectorAll('#kpis .delta').forEach((d) => {
        const f = d.dataset.for, v = r ? r['d_' + f] : null;
        d.className = 'delta'; d.replaceChildren(); delete d.dataset.source;
        if (v == null) return;
        mk(d, 'cube', 'd_' + f, w); d.textContent = S.signed(v) + ' vs ' + CMP[p.year];
        if (GOOD[f] && Math.abs(v) >= 0.02) d.classList.add(v * GOOD[f] > 0 ? 'good' : 'bad');
      });
      const q = $('#quality'), g = $('#guests');
      const rate = (label, ...nodes) => { const d = document.createElement('div'); d.className = 'rate'; const b = document.createElement('b'); b.append(...nodes); d.append(label, b); return d; };
      const c = (f, fmt) => span(fmt(r[f]), 'cube', f, w);
      if (r) {
        q.replaceChildren(rate('Cancelled bookings', c('cancelled', S.num), ' · ', c('cancel_rate', S.pct)), rate('Value cancelled', c('cancelled_value', S.usd)), rate('Refunded', c('refunds', S.usd)),
          rate('Discounts given', c('discount', S.usd)), rate('Discount off list price', c('discount_rate', S.pct)), rate('Agent commission', c('commission', S.usd)), rate('Price per cabin-night', c('price_cn', S.usdFull)));
        g.replaceChildren(rate('New guests', c('new_b', S.num), ' · ', c('new_v', S.usd)), rate('Repeat guests', c('repeat_b', S.num), ' · ', c('repeat_v', S.usd)),
          rate('Referred by a guest', c('referral_b', S.num), ' · ', c('referral_v', S.usd)), rate('Share of bookings returning or referred', c('returning_share', S.pct)));
      } else { q.textContent = 'No enquiries match these filters.'; g.replaceChildren(); }
      const fe = $('#funnel');
      if (r) {
        S.funnel(fe, [
          { label: 'Enquiries', n: r.leads, field: 'leads', cost: r.cpl, costField: 'cpl', costLabel: 'CPL', costFmt: S.usd2 },
          { label: 'Qualified leads', n: r.qualified, field: 'qualified', rate: r.l2q, rateField: 'l2q', rateLabel: 'qualified by sales', cost: r.cpql, costField: 'cpql', costLabel: 'per qualified', costFmt: S.usd2 },
          { label: 'Active conversations', n: r.replied, field: 'replied', rate: r.q2r, rateField: 'q2r', rateLabel: 'replied to us' },
          { label: 'Proposals sent', n: r.proposals, field: 'proposals', rate: r.r2p, rateField: 'r2p', cost: r.cpp, costField: 'cpp', costLabel: 'per proposal', costFmt: S.usd2 },
          { label: 'Bookings', n: r.bookings, field: 'bookings', rate: r.p2b, rateField: 'p2b', rateLabel: 'P2B', cost: r.cac, costField: 'cac', costLabel: 'CAC', costFmt: S.usdFull },
        ], (el, f) => mk(el, 'cube', f, w));
      } else fe.textContent = 'No enquiries match these filters.';
    } else S.fail($('#funnel'), 'cube');
    const ch = S.rows('channels'), tbl = $('#t-channels');
    if (ch) {
      tbl._redraw = drawOverview;
      S.table(tbl, ch.filter((x) => x.slice === slice), [
        { f: 'channel', cls: 'l' }, { f: 'leads', fmt: S.num }, { f: 'spend', fmt: S.usd }, { f: 'cpl', fmt: S.usd2 }, { f: 'bookings', fmt: S.num },
        { f: 'share', fmt: S.pct }, { f: 'cac', fmt: S.usdFull }, { f: 'revenue', fmt: S.usd }, { f: 'margin', fmt: S.usd }, { f: 'roas', fmt: (v) => (v == null ? '—' : S.x(v) + '×') }], { sort: { f: 'bookings', dir: -1 } });
    }
    const mo = S.rows('monthly'), s3 = [p.brand, p.dest, p.vtype].join('|');
    for (const id of ['#c-leads', '#c-cpl']) if (!mo && S.fail($(id), 'monthly')) return;
    if (!mo) return;
    const rows = mo.filter((r) => r.slice === s3 && inPeriod(r.month, p.year));
    S.bars($('#c-leads'), rows, { x: 'month', y: 'leads', xfmt: (m) => d3.utcFormat("%b '%y")(new Date(m + '-01T00:00:00Z')), yfmt: d3.format(','),
      tipLines: (d) => [['Leads', S.num(d.leads)], ['Qualified', S.num(d.qualified)], ['Bookings', S.num(d.bookings)], ['Spend', S.usd(d.spend)]] });
    S.lines($('#c-cpl'), rows, { x: 'month', xfmt: (m) => d3.utcFormat("%b '%y")(new Date(m + '-01T00:00:00Z')), series: [{ f: 'cpl', label: 'CPL' }], yfmt: (v) => '$' + d3.format(',.0f')(v) });
  };

  // ---------- campaigns
  let selCamp = null;
  $('#c-search').addEventListener('input', () => drawCampaigns());
  const drawCampaigns = () => {
    const rows = S.rows('campaigns'), tbl = $('#t-campaigns');
    if (!rows) { S.fail(tbl.parentElement, 'campaigns'); return; }
    const p = P(), q = $('#c-search').value.trim().toLowerCase();
    const rr = rows.filter((r) => (p.brand === 'All' || r.brand === p.brand) && (p.dest === 'All' || r.dest === p.dest) && (/^\d{4}$/.test(p.year) ? r.year === p.year : inPeriod(r.last, p.year)) && (!q || r.campaign.toLowerCase().includes(q)));
    tbl._redraw = drawCampaigns;
    const view = $('#c-view').value; tbl.classList.remove('only-d', 'only-a', 'only-c'); if (view) tbl.classList.add('only-' + view);
    S.table(tbl, rr, [
      { f: 'campaign', cls: 'l' }, { f: 'spend', fmt: S.usd }, { f: 'impressions', fmt: (v) => (v ? S.num(v) : '—'), cls: 'hide-narrow g-d' }, { f: 'clicks', fmt: (v) => (v ? S.num(v) : '—'), cls: 'hide-narrow g-d' }, { f: 'ctr', fmt: S.pct, cls: 'hide-narrow g-d' }, { f: 'cpc', fmt: S.usd2, cls: 'hide-narrow g-d' },
      { f: 'leads', fmt: S.num, cls: 'g-a' }, { f: 'cpl', fmt: S.usd2, cls: 'g-a' }, { f: 'qualified', fmt: S.num, cls: 'g-a' }, { f: 'cpql', fmt: S.usd2, cls: 'g-a' }, { f: 'proposals', fmt: S.num, cls: 'g-a' },
      { f: 'bookings', fmt: S.num, cls: 'g-c' }, { f: 'p2b', fmt: S.pct, cls: 'g-c' }, { f: 'cac', fmt: S.usdFull, cls: 'g-c' }, { f: 'revenue', fmt: S.usd, cls: 'g-c' }, { f: 'roas', fmt: (v) => (v == null ? '—' : S.x(v) + '×'), cls: 'g-c' }, { f: 'margin', fmt: S.usd, cls: 'g-c' },
      { f: 'share_year', fmt: S.pct, cls: 'g-c' }, { f: 'share_month', fmt: S.pct, cls: 'g-c' }, { f: 'diagnosis', cls: 'wrap' }],
      { sort: { f: 'spend', dir: -1 }, selected: selCamp, onClick: (k) => { selCamp = k; drawCampaigns(); } });
    drawCompare(rows, rr);
    const c = rows.find((r) => r.campaign === selCamp);
    const t = $('#camp-title'), sub = $('#camp-sub'), fe = $('#camp-funnel');
    if (!c) { fe.replaceChildren(); return; }
    const w = 'campaign=' + S.enc(c.campaign);
    t.textContent = c.campaign;
    sub.replaceChildren(span(c.channel, 'campaigns', 'channel', w), ' · ', span(c.ctype, 'campaigns', 'ctype', w), ' · ', span(c.first, 'campaigns', 'first', w), ' to ', span(c.last, 'campaigns', 'last', w));
    if (c.impressions) sub.append(' · CTR ', span(S.pct(c.ctr), 'campaigns', 'ctr', w), ', CPC ', span(S.usd2(c.cpc), 'campaigns', 'cpc', w), ', clicks to lead ', span(S.pct(c.click_to_lead), 'campaigns', 'click_to_lead', w));
    sub.append(' · median first reply ', span(S.x(c.reply_median), 'campaigns', 'reply_median', w), ' h. Best month ', span(c.top_month || '—', 'campaigns', 'top_month', w), ', share of year ', span(c.share_year_label, 'campaigns', 'share_year_label', w), '. What to check: ', span(c.diagnosis, 'campaigns', 'diagnosis', w));
    S.funnel(fe, [
      { label: 'Enquiries', n: c.leads, field: 'leads', cost: c.cpl, costField: c.cpl != null ? 'cpl' : null, costLabel: 'CPL', costFmt: S.usd2 },
      { label: 'Qualified leads', n: c.qualified, field: 'qualified', rate: c.l2q, rateField: 'l2q', cost: c.cpql, costField: c.cpql != null ? 'cpql' : null, costLabel: 'per qualified', costFmt: S.usd2 },
      { label: 'Active conversations', n: c.replied, field: 'replied', rate: c.q2r, rateField: c.q2r != null ? 'q2r' : null },
      { label: 'Proposals sent', n: c.proposals, field: 'proposals' },
      { label: 'Bookings', n: c.bookings, field: 'bookings', rate: c.p2b, rateField: c.p2b != null ? 'p2b' : null, rateLabel: 'P2B', cost: c.cac, costField: c.cac != null ? 'cac' : null, costLabel: 'CAC', costFmt: S.usdFull },
    ], (el, f) => mk(el, 'campaigns', f, w));
  };

  // campaign comparison: two campaigns side by side, every cell cited to its row
  $('#c-view').addEventListener('change', () => drawCampaigns());
  $('#cmp-a').addEventListener('change', () => drawCampaigns());
  $('#cmp-b').addEventListener('change', () => drawCampaigns());
  const drawCompare = (rows, shown) => {
    const A = $('#cmp-a'), B = $('#cmp-b');
    const list = (shown.length >= 2 ? shown : rows).slice().sort((x, y) => (y.spend || 0) - (x.spend || 0)).map((r) => r.campaign);
    const keep = (sel, i) => { const v = sel.value; sel.replaceChildren(...list.map((n) => new Option(n, n))); sel.value = list.includes(v) ? v : list[i] || list[0] || ''; };
    keep(A, 0); keep(B, 1);
    const a = rows.find((r) => r.campaign === A.value), b = rows.find((r) => r.campaign === B.value);
    $('#cmp-ha').textContent = a ? a.campaign : 'A'; $('#cmp-hb').textContent = b ? b.campaign : 'B';
    const xx = (v) => (v == null ? '—' : S.x(v) + '×');
    const M = [['Perspective: delivery'], ['Spend', 'spend', S.usd], ['Impressions', 'impressions', S.num], ['Clicks', 'clicks', S.num], ['CTR', 'ctr', S.pct], ['CPC', 'cpc', S.usd2],
      ['Perspective: acquisition'], ['Leads', 'leads', S.num], ['CPL', 'cpl', S.usd2], ['Qualified', 'qualified', S.num], ['Lead to qualified', 'l2q', S.pct], ['Cost per qualified', 'cpql', S.usd2], ['Median first reply (h)', 'reply_median', S.x],
      ['Perspective: commercial'], ['Proposals', 'proposals', S.num], ['Bookings', 'bookings', S.num], ['P2B', 'p2b', S.pct], ['CAC', 'cac', S.usdFull], ['Booking value', 'revenue', S.usd], ['ROAS', 'roas', xx], ['Margin', 'margin', S.usd], ['Share of year', 'share_year', S.pct],
      ['Context'], ['Channel', 'channel', String], ['Brand', 'brand', String], ['Main destination', 'dest', String], ['Ran', 'first', String], ['Diagnosis', 'diagnosis', String]];
    const tb = $('#t-cmp').tBodies[0]; tb.replaceChildren();
    for (const [label, f, fmt] of M) {
      const tr = document.createElement('tr'), th = document.createElement('td'); th.className = 'l'; tr.append(th);
      if (!f) { const s = document.createElement('b'); s.textContent = label.replace('Perspective: ', ''); th.append(s); tr.append(document.createElement('td'), document.createElement('td')); tb.append(tr); continue; }
      th.textContent = label;
      for (const r of [a, b]) { const td = document.createElement('td'); if (f === 'diagnosis') td.className = 'wrap';
        if (r) { const v = f === 'first' ? r.first + ' to ' + r.last : fmt(r[f]); td.append(f === 'first' ? v : span(v == null ? '—' : v, 'campaigns', f, 'campaign=' + S.enc(r.campaign))); } else td.textContent = '—'; tr.append(td); }
      tb.append(tr);
    }
  };

  // ---------- planner
  const GROUPS = ['All', 'Australia & NZ', 'Singapore', 'Hong Kong', 'Malaysia & Indonesia', 'USA', 'Europe'];
  const pl = { brand: null, month: null, group: 'All', budget: 2000, cabins: null, days: null, meta: null };
  const win = (d) => (d <= 30 ? '≤30 days' : d <= 60 ? '31–60 days' : d <= 120 ? '61–120 days' : d <= 240 ? '121–240 days' : '240+ days');
  let plBuilt = false;
  const plInputs = () => {
    pl.brand = $('#pl-brand').value; pl.group = $('#pl-group').value;
    pl.budget = Number($('#pl-budget').value) || 0; pl.cabins = Number($('#pl-cabins').value) || 0;
    pl.days = Number($('#pl-days').value) || pl.days; pl.meta = Number($('#pl-meta').value) || null;
  };
  const fillMonths = (pace) => {
    const ms = pace.filter((r) => r.brand === pl.brand);
    $('#pl-month').replaceChildren(...ms.map((r) => new Option(S.monLbl(r.dep_month) + ' · ' + r.cabins_left + ' of ' + r.cabins_total + ' cabins left', r.dep_month)));
    if (!ms.find((r) => r.dep_month === pl.month)) pl.month = (ms.find((r) => r.status.startsWith('Behind')) || ms[0] || {}).dep_month;
    $('#pl-month').value = pl.month;
    const row = ms.find((r) => r.dep_month === pl.month);
    if (row) { pl.days = row.days_out; pl.cabins = Math.max(1, row.cabins_left); $('#pl-days').value = pl.days; $('#pl-cabins').value = pl.cabins; }
  };
  const buildPlanner = (pace) => {
    if (plBuilt) return; plBuilt = true;
    const brands = [...new Set(pace.map((r) => r.brand))].filter((b) => b !== 'All');
    $('#pl-brand').replaceChildren(...brands.map((b) => new Option(b, b)));
    pl.brand = brands[0]; $('#pl-brand').value = pl.brand;
    $('#pl-group').replaceChildren(...GROUPS.map((g) => new Option(g === 'All' ? 'All markets' : g, g)));
    fillMonths(pace);
    $('#pl-brand').addEventListener('change', () => { plInputs(); fillMonths(S.rows('pace')); drawPlanner(); });
    $('#pl-month').addEventListener('change', () => { pl.month = $('#pl-month').value; fillMonths(S.rows('pace')); plInputs(); drawPlanner(); });
    ['#pl-group', '#pl-budget', '#pl-cabins', '#pl-days', '#pl-meta'].forEach((s) => $(s).addEventListener('input', () => { plInputs(); drawPlanner(); }));
  };
  const drawPlanner = () => {
    const pace = S.rows('pace'), rates = S.rows('rates'), season = S.rows('season'), lm = S.rows('lastminute'), mkts = S.rows('markets'), speed = S.rows('speed');
    if (!pace || !rates || !season) { ['pace', 'rates', 'season'].some((id) => S.fail($('#pl-context'), id)); return; }
    buildPlanner(pace);
    const pr = pace.find((r) => r.brand === pl.brand && r.dep_month === pl.month);
    const days = pl.days || (pr && pr.days_out) || 60, w0 = win(days);
    // context
    const ctx = $('#pl-context');
    if (pr) {
      const pw = 'key=' + S.enc(pr.key);
      ctx.replaceChildren(span(pl.brand, 'pace', 'brand', pw), ', ', span(S.monLbl(pr.dep_month), 'pace', 'dep_month', pw), ' departures: ', span(S.num(pr.cabins_sold), 'pace', 'cabins_sold', pw), ' of ',
        span(S.num(pr.cabins_total), 'pace', 'cabins_total', pw), ' cabins sold, ', span(S.num(pr.warm_conversations), 'pace', 'warm_conversations', pw), ' warm conversations (',
        span(S.num(pr.open_proposals), 'pace', 'open_proposals', pw), ' with a proposal). Status: ');
      ctx.append(mk(S.pill(pr.status), 'pace', 'status', pw), '.');
      if (pl.cabins > pr.cabins_left) ctx.append(' You asked for ' + pl.cabins + ' cabins but only ' + pr.cabins_left + ' are unsold: check inventory before promising more.');
    }
    // rates with fallback for thin segments
    const find = (b, g) => rates.find((r) => r.key === [b, g, w0].join('|'));
    const tries = [[pl.brand, pl.group], ['All', pl.group], [pl.brand, 'All'], ['All', 'All']];
    let R = null, used = null;
    for (const [b, g] of tries) { const r = find(b, g); if (r && r.paid_leads >= 40 && r.bookings >= 3) { R = r; used = [b, g]; break; } }
    if (!R) { R = find('All', 'All'); used = ['All', 'All']; }
    const exact = find(pl.brand, pl.group);
    const rw = 'key=' + S.enc(R.key);
    const asOf = (S.rows('enriched') || [{}])[0].as_of || '';
    const moy = Number(asOf.slice(5, 7)) || 1;
    const sRow = season.find((r) => r.slice === (used[0] === 'All' ? 'All' : pl.brand) + '|All|All' && r.moy === moy);
    const idx = (sRow && sRow.cpl_index) || 1;
    const eff = days <= 90 ? days / 2 - 3 : days - 45;
    const cf = eff > 120 ? null : eff > 60 ? 'close_90' : eff > 45 ? 'close_60' : eff > 30 ? 'close_45' : eff > 14 ? 'close_30' : 'close_14';
    const close = cf ? R[cf] ?? 1 : 1;
    $('#pl-rates-note').replaceChildren('Segment used: ' + (used[0] === 'All' ? 'all brands' : used[0]) + ', ' + (used[1] === 'All' ? 'all markets' : used[1]) + ', enquiries ' + w0 + ' before departure.' +
      (used[0] !== pl.brand || used[1] !== pl.group ? ' The exact segment had ' + (exact ? exact.paid_leads + ' paid leads and ' + exact.bookings + ' bookings' : 'no history') + ', too few to rely on, so the planner widened it.' : '') +
      ' CPLs are adjusted for launching in ' + S.MOY[moy - 1] + '.');
    const rate = (label, nodes) => { const d = document.createElement('div'); d.className = 'rate'; const b = document.createElement('b'); b.append(...nodes); d.append(label, b); return d; };
    const rs = (f, fmt) => span(fmt(R[f]), 'rates', f, rw);
    const sw = sRow ? 'key=' + S.enc(sRow.key) : null;
    $('#pl-rates').replaceChildren(
      rate('CPL low · typical · high', [rs('cpl_low', S.usd2), ' · ', rs('cpl', S.usd2), ' · ', rs('cpl_high', S.usd2)]),
      rate('Launch-month CPL index', [sRow ? span(S.x(idx), 'season', 'cpl_index', sw) : '1.0']),
      rate('Lead → qualified', [rs('l2q', S.pct)]), rate('Qualified → proposal', [rs('q2p', S.pct)]), rate('Proposal → booking', [rs('p2b', S.pct)]),
      rate('Cabins per booking', [rs('cabins_per_booking', S.x)]), rate('Value per booking', [rs('value', S.usd)]), rate('Margin per booking', [rs('margin', S.usd)]),
      rate('Median days to close', [rs('cycle_median', S.num)]), rate(cf ? 'Close within ' + cf.slice(6) + ' days' : 'Close in time', [cf ? rs(cf, S.pct) : '100%']),
      rate('Past bookings · leads in segment', [rs('bookings', S.num), ' · ', rs('leads', S.num)]));
    // scenarios
    const sc = [['Optimistic', R.cpl_low ?? R.cpl, 1.1], ['Base', R.cpl, 1], ['Conservative', R.cpl_high ?? R.cpl, 0.8]].map(([name, cpl, m]) => {
      const c = cpl * idx, leads = pl.budget / c, qual = leads * R.l2q, prop = qual * (R.q2p || 0), conv = (R.p2b || 0) * m * close, book = prop * conv;
      return { name, cpl: c, leads, qual, prop, book, conv, cabins: book * (R.cabins_per_booking || 1), cac: book ? pl.budget / book : null, value: book * (R.value || 0), margin: book * (R.margin || 0) };
    });
    const tr = (cells) => { const r = document.createElement('tr'); cells.forEach((c, i) => { const td = document.createElement('td'); if (!i) td.className = 'l'; td.textContent = c; r.append(td); }); return r; };
    const one = (x) => (x == null || !isFinite(x) ? '—' : x < 10 ? d3.format('.1f')(x) : S.num(x));
    $('#t-scen').tBodies[0].replaceChildren(...sc.map((s) => tr([s.name, S.usd2(s.cpl), S.num(s.leads), S.num(s.qual), S.num(s.prop), one(s.book), one(s.cabins), S.usdFull(s.cac), S.usd(s.value), S.usd(s.margin)])));
    const need = pl.cabins / (R.cabins_per_booking || 1);
    const tg = sc.map((s) => { const prop = s.conv ? need / s.conv : Infinity, qual = R.q2p ? prop / R.q2p : Infinity, leads = R.l2q ? qual / R.l2q : Infinity; return { ...s, need, nprop: prop, nqual: qual, nleads: leads, budget: leads * s.cpl }; });
    $('#pl-target-note').textContent = pl.cabins + ' cabins ÷ ' + S.x(R.cabins_per_booking) + ' cabins per booking ≈ ' + one(need) + ' bookings. A private charter books the whole yacht in one booking; cabin charters average 1–2 cabins, so the mix changes this a lot.';
    $('#t-target').tBodies[0].replaceChildren(...tg.map((s) => tr([s.name, one(s.need), S.num(s.nprop), S.num(s.nqual), S.num(s.nleads), S.usdFull(s.budget)])));
    // sensitivity: the base case at other budgets, with slightly dearer leads as spend grows and cabins capped at what is unsold
    const cap = pr ? pr.cabins_left : Infinity;
    const at = (bud, cpl, m) => { const c = cpl * idx * Math.pow(Math.max(bud, 1) / Math.max(pl.budget, 1), 0.2), leads = bud / c, book = leads * R.l2q * (R.q2p || 0) * (R.p2b || 0) * m * close;
      const cab = Math.min(cap, book * (R.cabins_per_booking || 1)), bk = Math.min(book, cab / (R.cabins_per_booking || 1)); return { c, leads, book: bk, cab, value: bk * (R.value || 0) }; };
    const b0 = at(pl.budget, R.cpl, 1);
    $('#t-sens').tBodies[0].replaceChildren(...[-0.5, -0.2, 0, 0.2, 0.5].map((d) => {
      const bud = pl.budget * (1 + d), x = at(bud, R.cpl, 1), lo = at(bud, R.cpl_high ?? R.cpl, 0.8), hi = at(bud, R.cpl_low ?? R.cpl, 1.1);
      const extra = d && x.book !== b0.book ? (bud - pl.budget) / (x.book - b0.book) : null;
      return tr([d ? (d > 0 ? '+' : '−') + Math.round(Math.abs(d) * 100) + '%' : 'Your budget', S.usdFull(bud), S.usd2(x.c), S.num(x.leads), one(x.book), one(lo.book) + '–' + one(hi.book), one(x.cab) + (x.cab >= cap ? ' (all unsold)' : ''), S.usd(x.value), extra == null || !isFinite(extra) ? '—' : S.usdFull(extra)]);
    }));
    // verdict
    const base = sc[1], bt = tg[1], v = $('#pl-verdict');
    v.replaceChildren();
    const strong = (t) => { const s = document.createElement('strong'); s.textContent = t; return s; };
    const ok = base.book >= need * 0.95, thin = R.bookings < 8 || (exact && exact.bookings < 3);
    v.append(strong(ok ? 'Budget covers the base case. ' : 'Budget falls short in the base case. '),
      'At $' + d3.format(',')(pl.budget) + ' history points to about ' + one(base.book) + ' bookings (' + one(sc[2].book) + '–' + one(sc[0].book) + ') against the ' + one(need) + ' needed; the base case needs about ' + S.usdFull(bt.budget) + ' (' + S.usdFull(tg[0].budget) + '–' + S.usdFull(tg[2].budget) + '). ');
    if (cf) v.append('With ' + days + ' days to go, ', span(S.pct(R[cf]), 'rates', cf, rw), ' of past bookings in this segment closed fast enough, which is already in these numbers. ');
    if (thin) v.append(strong('Evidence is thin: '), 'only ', span(S.num((exact || R).bookings), 'rates', 'bookings', 'key=' + S.enc((exact || R).key)), ' past bookings match this exact brand, market and window. Treat the spend as a test and watch the first week. ');
    if (pl.meta) { const mcpl = pl.budget / pl.meta; v.append('Meta estimates ' + d3.format(',')(pl.meta) + ' leads (CPL ' + S.usd2(mcpl) + ') against our base of ' + S.num(base.leads) + ' (CPL ' + S.usd2(base.cpl) + '): ' + (pl.meta > sc[0].leads ? 'more optimistic than our best months, so ask how they reach it.' : pl.meta < sc[2].leads ? 'below our weakest months; check targeting and placements.' : 'within our historical range.')); }
    // tactics
    const ol = $('#pl-tactics'); ol.replaceChildren();
    const li = (...n) => { const l = document.createElement('li'); l.append(...n); ol.append(l); };
    if (pr && pr.warm_conversations) {
      const pw = 'key=' + S.enc(pr.key);
      li('Work the ', span(S.num(pr.warm_conversations), 'pace', 'warm_conversations', pw), ' warm conversations for this month first, ', span(S.num(pr.open_proposals), 'pace', 'open_proposals', pw), ' of them with a proposal already. A personal follow-up costs nothing; at a ', span(S.pct(R.p2b), 'rates', 'p2b', rw), ' close rate that is about ' + one(pr.open_proposals * R.p2b) + ' bookings before any spend. If needed, a time-limited extra discount for these leads only.');
    }
    if (lm && days <= 75) {
      const l = lm.filter((r) => r.brand === 'All' && r.proposals >= 20).sort((a, b) => b.p2b - a.p2b);
      if (l.length > 1) { const best = l[0], worst = l[l.length - 1];
        li('Use ', span(best.cta, 'lastminute', 'cta', 'key=' + S.enc(best.key)), ' as the call to action. Last-minute ' + best.cta + ' leads closed at ', span(S.pct(best.p2b), 'lastminute', 'p2b', 'key=' + S.enc(best.key)), ' with CAC ', span(S.usdFull(best.cac), 'lastminute', 'cac', 'key=' + S.enc(best.key)), ', against ', span(S.pct(worst.p2b), 'lastminute', 'p2b', 'key=' + S.enc(worst.key)), ' for ' + worst.cta + '.'); }
    }
    if (mkts) {
      const near = mkts.filter((r) => r.brand === 'All' && r.leads >= 150 && !r.segment.includes('·') && r.segment !== 'All markets' && r.segment !== 'Other' && r.segment !== 'Europe (all)').sort((a, b) => a.e2d_median - b.e2d_median).slice(0, 3);
      if (days <= 120 && near.length) {
        const n = [];
        near.forEach((r, i) => { const w = 'key=' + S.enc(r.key); n.push(span(r.segment, 'markets', 'segment', w), ' (median ', span(S.num(r.e2d_median), 'markets', 'e2d_median', w), ' days, CPL ', span(S.usd2(r.cpl), 'markets', 'cpl', w), ')'); if (i < near.length - 1) n.push(', '); });
        li('Target the markets that book closest to departure: ', ...n, '.');
      }
      const eu = mkts.find((r) => r.key === 'All|Europe (all)'), sg = mkts.find((r) => r.key === 'All|Singapore · European expats');
      if (eu && sg && days <= 90) li('Europe-based guests enquire a median ', span(S.num(eu.e2d_median), 'markets', 'e2d_median', 'key=' + S.enc(eu.key)), ' days ahead, so a short window rarely suits them. European expats in Singapore enquire ', span(S.num(sg.e2d_median), 'markets', 'e2d_median', 'key=' + S.enc(sg.key)), ' days ahead: target Europeans living in Asia rather than flying in.');
    }
    if (speed) { const f = speed.find((r) => r.key === 'All|Under 1 h'), s = speed.find((r) => r.key === 'All|8–24 h');
      if (f && s) li('Agree a one-hour reply rule with sales for this campaign: leads answered within an hour booked at ', span(S.pct(f.booking_rate), 'speed', 'booking_rate', 'key=' + S.enc(f.key)), ', against ', span(S.pct(s.booking_rate), 'speed', 'booking_rate', 'key=' + S.enc(s.key)), ' when the reply took 8–24 hours.'); }
    if (cf && close < 0.6) li('Time is the constraint, not budget. Put a deadline on the offer (for example an upgrade or discount valid 7 days) to pull decisions forward, and retarget past enquiries for this destination before prospecting new audiences.');
    else li('Retarget website visitors and past enquiries for this destination before prospecting: they already know the yacht, so they close faster.');
  };

  // ---------- pace
  const drawPace = () => {
    const rows = S.rows('pace'), tbl = $('#t-pace');
    if (!rows) { S.fail(tbl.parentElement, 'pace'); return; }
    const p = P();
    const rr = rows.filter((r) => (p.brand === 'All' ? r.brand !== 'All' : r.brand === p.brand));
    tbl._redraw = drawPace;
    S.table(tbl, rr, [
      { f: 'dep_month', cls: 'l' }, { f: 'brand', cls: 'l' }, { f: 'cabins_sold', fmt: S.num }, { f: 'cabins_total', fmt: S.num },
      { f: 'occupancy', cls: 'l', render: (r) => { const s = document.createElement('span'); const o = document.createElement('span'); o.className = 'occ'; const i = document.createElement('i'); i.style.width = r.occupancy * 100 + '%';
          i.style.setProperty('--fill', r.status.startsWith('Behind') ? 'var(--cds-chart-status-critical)' : dash.colors[0]); o.append(i);
          if (r.expected_now != null) { const u = document.createElement('u'); u.style.left = Math.min(100, (r.expected_now / r.cabins_total) * 100) + '%'; o.append(u); }
          s.append(o, ' ' + S.pct(r.occupancy)); return s; } },
      { f: 'expected_now', fmt: S.x }, { f: 'hist_final_occ', fmt: S.pct }, { f: 'projected_final', fmt: S.num }, { f: 'warm_conversations', fmt: S.num }, { f: 'push_by' },
      { f: 'status', cls: 'l', render: (r) => S.pill(r.status) }], { sort: null });
  };

  // ---------- markets
  const drawMarkets = () => {
    const rows = S.rows('markets'), tbl = $('#t-markets');
    if (!rows) { S.fail(tbl.parentElement, 'markets'); S.fail($('#c-e2d'), 'markets'); return; }
    const p = P(), b = p.brand;
    const mine = rows.filter((r) => r.brand === b);
    const order = (r) => (r.segment === 'All markets' ? 0 : r.segment.includes('·') ? 3 : r.segment === 'Europe (all)' ? 2 : 1);
    const rr = mine.slice().sort((x, y) => order(x) - order(y) || y.leads - x.leads);
    tbl._redraw = drawMarkets;
    S.table(tbl, rr, [{ f: 'segment', cls: 'l' }, { f: 'leads', fmt: S.num }, { f: 'cpl', fmt: S.usd2 }, { f: 'cac', fmt: S.usdFull }, { f: 'p2b', fmt: S.pct },
      { f: 'e2d_median', fmt: S.days }, { f: 'book_lt_median', fmt: S.days }, { f: 'cycle_median', fmt: S.days }, { f: 'lm_share', fmt: S.pct }, { f: 'lm_bookings', fmt: S.num }, { f: 'start_days', fmt: S.days }]);
    const ch = mine.filter((r) => !r.segment.includes('·') && r.leads >= 30).sort((x, y) => x.e2d_median - y.e2d_median)
      .map((r) => ({ label: r.segment, lo: r.e2d_p25, mid: r.e2d_median, hi: r.e2d_p75, strong: r.segment === 'All markets' || r.segment === 'Europe (all)' }));
    S.ranges($('#c-e2d'), ch, {});
    const lm = S.rows('lastminute');
    if (lm) { const t = $('#t-lm'); t._redraw = drawMarkets; S.table(t, lm.filter((r) => r.brand === b), [{ f: 'cta', cls: 'l' }, { f: 'leads', fmt: S.num }, { f: 'cpl', fmt: S.usd2 }, { f: 'l2q', fmt: S.pct }, { f: 'p2b', fmt: S.pct }, { f: 'bookings', fmt: S.num }, { f: 'cac', fmt: S.usdFull }, { f: 'cycle_median', fmt: S.days }], { sort: { f: 'p2b', dir: -1 } }); }
    const eu = $('#t-eu'); eu._redraw = drawMarkets;
    const segs = ['Europe (all)', 'United Kingdom', 'Germany', 'France', 'Switzerland', 'Italy', 'Singapore · European expats', 'Hong Kong · European expats', 'Singapore · locals & others'];
    S.table(eu, segs.map((s) => mine.find((r) => r.segment === s)).filter(Boolean), [{ f: 'segment', cls: 'l' }, { f: 'leads', fmt: S.num }, { f: 'e2d_median', fmt: S.days }, { f: 'lm_bookings', fmt: S.num }, { f: 'cac', fmt: S.usdFull }]);
  };

  // ---------- season
  const drawSeason = () => {
    const rows = S.rows('season');
    if (!rows) { ['#c-cplidx', '#c-seasleads', '#c-seasbook', '#c-seasdep'].forEach((s) => S.fail($(s), 'season')); return; }
    const p = P(), rr = rows.filter((r) => r.slice === [p.brand, p.dest, p.vtype].join('|')).sort((a, b) => a.moy - b.moy);
    const xf = (m) => S.MOY[m - 1];
    S.bars($('#c-cplidx'), rr, { x: 'moy', y: 'cpl_index', xfmt: xf, yfmt: d3.format('.1f'), ref: 1, color: (d) => (d.cpl_index > 1.05 ? dash.colors[0] : 'var(--cds-chart-muted)'), tipLines: (d) => [['CPL index', S.x(d.cpl_index)], ['CPL', S.usd2(d.cpl)]] });
    S.bars($('#c-seasleads'), rr, { x: 'moy', y: 'avg_leads', xfmt: xf, yfmt: d3.format(','), tipLines: (d) => [['Average leads', S.num(d.avg_leads)]] });
    S.bars($('#c-seasbook'), rr, { x: 'moy', y: 'bookings_made', xfmt: xf, yfmt: d3.format(','), tipLines: (d) => [['Bookings made, 2024–2026', S.num(d.bookings_made)]] });
    const top = rr.map((r) => r.cabins_departing).sort((a, b) => b - a)[2];
    S.bars($('#c-seasdep'), rr, { x: 'moy', y: 'cabins_departing', xfmt: xf, yfmt: d3.format(','), color: (d) => (d.cabins_departing >= top ? dash.colors[0] : 'var(--cds-chart-muted)'), tipLines: (d) => [['Cabins departing, 2024–2027', S.num(d.cabins_departing)], ['Bookings', S.num(d.departures_booked)]] });
  };

  // ---------- sales
  const drawSales = () => {
    const rows = S.rows('health');
    if (!rows) { ['#c-plan', '#c-p2b'].forEach((s) => S.fail($(s), 'health')); return; }
    const p = P(), rr = rows.filter((r) => r.brand === p.brand && r.month >= '2025-01');
    const xf = (m) => d3.utcFormat("%b '%y")(new Date(m + '-01T00:00:00Z'));
    S.bars($('#c-plan'), rr, { x: 'month', y: 'qualified', xfmt: xf, yfmt: d3.format(','), tickMarks: [{ field: 'plan_qualified' }],
      color: (d) => (d.plan_qualified && d.qualified < d.plan_qualified * 0.9 ? 'var(--cds-chart-status-critical)' : dash.colors[0]), tipLines: (d) => [['Qualified', S.num(d.qualified)], ['Plan', S.num(d.plan_qualified)]] });
    S.lines($('#c-p2b'), rr, { x: 'month', xfmt: xf, endLabels: true, series: [{ f: 'p2b', label: 'P2B', color: dash.colors[0] }, { f: 'p2b_baseline', label: 'Previous 12 mo', color: 'var(--cds-chart-muted)', dash: '4 3' }], yfmt: d3.format('.0%') });
    const t = $('#t-health'); t._redraw = drawSales;
    S.table(t, rows.filter((r) => r.brand === p.brand && r.month >= '2025-01').reverse(), [{ f: 'month', cls: 'l' }, { f: 'qualified', fmt: S.num }, { f: 'plan_qualified', fmt: S.num }, { f: 'proposals', fmt: S.num }, { f: 'booked', fmt: S.num },
      { f: 'lost', fmt: S.num }, { f: 'open', fmt: S.num }, { f: 'p2b', fmt: S.pct }, { f: 'p2b_baseline', fmt: S.pct }, { f: 'reply_median', fmt: S.x }, { f: 'flag', cls: 'l', render: (r) => (r.flag ? S.pill(r.flag) : '') }]);
    const sp = S.rows('speed');
    if (sp) S.bars($('#c-speed'), sp.filter((r) => r.brand === p.brand), { x: 'bucket', y: 'booking_rate', yfmt: d3.format('.0%'), color: (d) => (d.order >= 3 ? 'var(--cds-chart-status-critical)' : dash.colors[0]),
      tipLines: (d) => [['Booked', S.pct(d.booking_rate)], ['Lost to another yacht', S.pct(d.competitor_rate)], ['Qualified leads', S.num(d.qualified)]] });
    else S.fail($('#c-speed'), 'speed');
    const lost = S.rows('lost');
    if (lost) { const tl = $('#t-lost'); tl._redraw = drawSales; S.table(tl, lost.filter((r) => r.brand === p.brand), [{ f: 'reason', cls: 'l' }, { f: 'group', cls: 'l', render: (r) => S.pill(r.group) }, { f: 'lost', fmt: S.num }, { f: 'share', fmt: S.pct }], { sort: { f: 'lost', dir: -1 } }); }
  };

  // ---------- journey
  $('#j-seg').addEventListener('change', () => drawJourney());
  const drawJourney = () => {
    const all = S.rows('journey'); if (!all) { ['#t-jmetric', '#t-jpage', '#t-jpath'].forEach((s) => S.fail($(s).parentElement, 'journey')); return; }
    const sel = $('#j-seg'), segs = [...new Set(all.map((r) => r.seg))];
    if (sel.options.length !== segs.length) { const v = sel.value; sel.replaceChildren(...segs.map((x) => new Option(x, x))); sel.value = segs.includes(v) ? v : 'All guests'; }
    const seg = sel.value || 'All guests', rows = all.filter((r) => r.seg === seg);
    const sz = rows.find((r) => r.kind === 'size'), js = $('#j-size');
    if (sz) { const w = 'key=' + S.enc(sz.key); js.replaceChildren('Comparing ', span(S.num(sz.booked), 'journey', 'booked', w), ' bookings with ', span(S.num(sz.not_booked), 'journey', 'not_booked', w), ' qualified leads who did not book.' + (sz.booked < 30 ? ' Small sample: read with care.' : '')); }
    const set = (id, kind, cols, sort) => { const t = $(id); t._redraw = drawJourney; S.table(t, rows.filter((r) => r.kind === kind), cols, sort); };
    set('#t-jmetric', 'metric', [{ f: 'label', cls: 'l' }, { f: 'booked', fmt: S.x }, { f: 'not_booked', fmt: S.x }, { f: 'ratio', fmt: (v) => S.x(v) + '×' }]);
    set('#t-jpage', 'page', [{ f: 'label', cls: 'l' }, { f: 'booked', fmt: S.pct }, { f: 'not_booked', fmt: S.pct }, { f: 'ratio', fmt: (v) => S.x(v) + '×' }], { sort: { f: 'ratio', dir: -1 } });
    set('#t-jpath', 'path', [{ f: 'label', cls: 'l' }, { f: 'booked', fmt: S.num }, { f: 'ratio', fmt: S.usd }], { sort: { f: 'booked', dir: -1 } });
  };

  // ---------- inventory & coverage
  let selTrip = null;
  $('#cov-search').addEventListener('input', () => drawInventory());
  $('#cov-status').addEventListener('change', () => drawInventory());
  const drawInventory = () => {
    const rows = S.rows('coverage'), sum = S.rows('coverage_sum'), tbl = $('#t-cover'), ul = $('#cov-alerts');
    const p = P(), sk = 'key=' + S.enc(p.brand + '|' + p.dest);
    document.querySelectorAll('#cov-kpis [data-source=coverage_sum]').forEach((el) => { el.dataset.where = sk; });
    if (sum) { const r = sum.find((x) => x.key === p.brand + '|' + p.dest);
      document.querySelectorAll('#cov-kpis [data-source=coverage_sum]').forEach((el) => { el.classList.remove('dash-skeleton'); el.textContent = r ? S.num(r[el.dataset.field]) : '—'; }); }
    if (!rows) { S.fail(tbl.parentElement, 'coverage'); S.fail(ul, 'coverage'); return; }
    const mine = rows.filter((r) => (p.brand === 'All' || r.brand === p.brand) && (p.dest === 'All' || r.dest === p.dest));
    // alerts
    ul.replaceChildren();
    const li = (cls, ...n) => { const l = document.createElement('li'); if (cls) l.className = cls; l.append(...n); ul.append(l); };
    const tw = (r) => 'trip_id=' + S.enc(r.trip_id);
    const name = (r) => [span(r.brand, 'coverage', 'brand', tw(r)), ' · ', span(r.dest, 'coverage', 'dest', tw(r)), ' · ', span(S.date(r.departure), 'coverage', 'departure', tw(r))];
    for (const r of mine.filter((x) => x.status === 'Gap: start now').slice(0, 5)) li('', ...name(r), ': no activity aimed at it, ', span(S.num(r.unsold), 'coverage', 'unsold', tw(r)), ' cabins unsold and the booking window has started.');
    for (const r of mine.filter((x) => x.status === 'Covered but behind').slice(0, 5)) li('', ...name(r), ': ', span(S.num(r.sold), 'coverage', 'sold', tw(r)), ' of ', span(S.num(r.cabins), 'coverage', 'cabins', tw(r)), ' sold where past years had ', span(S.x(r.expected_now), 'coverage', 'expected_now', tw(r)), ' by now, with ', span(S.num(r.n_cover), 'coverage', 'n_cover', tw(r)), ' activities aimed at it. Check the campaign and work the ', span(S.num(r.warm), 'coverage', 'warm', tw(r)), ' warm conversations.');
    for (const r of mine.filter((x) => x.status === 'Gap: plan campaign').slice(0, 5)) li('warn', ...name(r), ': nothing aimed at it yet. Have activity live by ', span(S.date(r.live_by), 'coverage', 'live_by', tw(r)), '.');
    const fa = mine.filter((x) => x.status.startsWith('Fills anyway'));
    if (fa.length) { const g = new Map(); for (const r of fa) { const k = r.dest + '|' + r.dep_month; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
      const n = ['High season and on pace, yet paid campaigns still aim at: '];
      [...g.values()].slice(0, 6).forEach((arr, i, all) => { const r = arr[0]; n.push(span(r.dest, 'coverage', 'dest', tw(r)), ' ', span(S.monLbl(r.dep_month), 'coverage', 'dep_month', tw(r)), ' (' + arr.length + ' departure' + (arr.length > 1 ? 's' : '') + ')'); if (i < all.length - 1) n.push(', '); });
      n.push('. Consider moving that budget to the gaps above.'); li('warn', ...n); }
    if (!ul.children.length) li('ok', 'Every upcoming departure has activity aimed at it and is on pace.');
    // table
    const q = $('#cov-search').value.trim().toLowerCase(), stf = $('#cov-status').value;
    const rr = mine.filter((r) => (!stf || (stf === 'Covered' ? r.status === 'Covered' : r.status.startsWith(stf))) && (!q || [r.brand, r.dest, r.vtype, r.status, r.covered_by, r.departure].join(' ').toLowerCase().includes(q)));
    tbl._redraw = drawInventory;
    S.table(tbl, rr, [
      { f: 'departure', cls: 'l', render: (r) => S.date(r.departure) }, { f: 'brand', cls: 'l' }, { f: 'dest', cls: 'l' }, { f: 'vtype', cls: 'l hide-narrow' }, { f: 'sold', fmt: S.num }, { f: 'cabins', fmt: S.num },
      { f: 'occupancy', cls: 'l', render: (r) => { const s = document.createElement('span'); const o = document.createElement('span'); o.className = 'occ'; const i = document.createElement('i'); i.style.width = r.occupancy * 100 + '%';
          i.style.setProperty('--fill', r.status === 'Covered but behind' || r.status === 'Gap: start now' ? 'var(--cds-chart-status-critical)' : dash.colors[0]); o.append(i);
          if (r.expected_now != null) { const u = document.createElement('u'); u.style.left = Math.min(100, (r.expected_now / r.cabins) * 100) + '%'; o.append(u); }
          s.append(o, ' ' + S.pct(r.occupancy)); return s; } },
      { f: 'hist', fmt: S.pct }, { f: 'warm', fmt: S.num }, { f: 'n_cover', fmt: S.num }, { f: 'live_by', render: (r) => S.date(r.live_by) }, { f: 'status', cls: 'l', render: (r) => S.pill(r.status) }],
      { sort: null, selected: selTrip, onClick: (k) => { selTrip = k; drawInventory(); } });
    const r = rows.find((x) => x.trip_id === selTrip), list = $('#cov-list');
    if (!r) { list.replaceChildren(); return; }
    const w = tw(r);
    $('#cov-title').replaceChildren(...name(r));
    $('#cov-sub').replaceChildren(span(r.vtype, 'coverage', 'vtype', w), ', ', span(S.num(r.nights), 'coverage', 'nights', w), ' nights, ', span(S.num(r.days_out), 'coverage', 'days_out', w), ' days away. ', mk(S.pill(r.status), 'coverage', 'status', w), ' ', span(r.action, 'coverage', 'action', w));
    list.dataset.source = 'coverage';
    const names = r.covered_by ? r.covered_by.split('; ') : [];
    list.replaceChildren(...(names.length ? names : ['No campaign, press or influencer activity is aimed at this departure.']).map((t) => { const l = document.createElement('li'); l.textContent = t; return l; }));
  };

  // ---------- marketing spend
  $('#sp-search').addEventListener('input', () => drawSpend());
  $('#bud-year').addEventListener('change', () => drawSpend());
  const usedBar = (r) => { const s = document.createElement('span'); const o = document.createElement('span'); o.className = 'occ'; const i = document.createElement('i');
    i.style.width = Math.min(100, (r.used_pct || 0) * 100) + '%'; i.style.setProperty('--fill', r.status === 'Over budget' ? 'var(--cds-chart-status-critical)' : dash.colors[0]); o.append(i);
    if (r.plan_pct != null) { const u = document.createElement('u'); u.style.left = Math.min(100, r.plan_pct * 100) + '%'; o.append(u); }
    s.append(o, ' ' + S.pct(r.used_pct)); return s; };
  const drawBudget = () => {
    const bv = S.rows('budget_view'), p = P(), sel = $('#bud-year');
    if (!bv) { S.fail($('#t-budcat').parentElement, 'budget_view'); return; }
    const years = [...new Set(bv.map((r) => r.year))].sort();
    if (!sel.options.length) { sel.replaceChildren(...years.map((y) => new Option(y, y))); sel.value = years.includes((asOfDate() || '').slice(0, 4)) ? asOfDate().slice(0, 4) : years[years.length - 1]; }
    const y = sel.value, tk = p.brand + '|' + y + '|Total', kw = 'key=' + S.enc(tk);
    $('#bud-title').textContent = 'Marketing budget ' + y + ': ' + (p.brand === 'All' ? 'all brands' : p.brand);
    const t = bv.find((r) => r.key === tk);
    const xx = (v) => (v == null ? '—' : S.x(v) + '×');
    const F = { budget: S.usd, budget_to_date: S.usd, spent: S.usd, committed: S.usd, left: S.usd, used_pct: S.pct, revenue: S.usd, bookings: S.num, roas: xx, margin_roas: xx, cac: S.usdFull, cpl: S.usd2 };
    document.querySelectorAll('#bud-kpis [data-source=budget_view]').forEach((el) => { el.dataset.where = kw; el.classList.remove('dash-skeleton'); el.textContent = t ? F[el.dataset.field](t[el.dataset.field]) : '—';
      el.style.color = el.dataset.field === 'left' && t && t.left < 0 ? 'var(--color-bad)' : ''; });
    const ct = $('#t-budcat'); ct._redraw = drawBudget;
    S.table(ct, bv.filter((r) => r.brand === p.brand && r.year === y), [{ f: 'category', cls: 'l' }, { f: 'budget', fmt: S.usdFull }, { f: 'alloc_share', fmt: S.pct }, { f: 'spent', fmt: S.usdFull }, { f: 'committed', fmt: S.usdFull },
      { f: 'left', fmt: S.usdFull }, { f: 'used_pct', cls: 'l', render: usedBar }, { f: 'status', cls: 'l', render: (r) => S.pill(r.status) },
      { f: 'leads', fmt: S.num }, { f: 'bookings', fmt: S.num }, { f: 'revenue', fmt: S.usd }, { f: 'roas', fmt: xx }, { f: 'margin_roas', fmt: xx }, { f: 'cac', fmt: S.usdFull }], { sort: null });
    const bt = $('#t-budbrand'); bt._redraw = drawBudget;
    S.table(bt, bv.filter((r) => r.category === 'Total' && r.year === y), [{ f: 'brand', cls: 'l', render: (r) => (r.brand === 'All' ? 'All brands' : r.brand) }, { f: 'budget', fmt: S.usd }, { f: 'spent', fmt: S.usd },
      { f: 'committed', fmt: S.usd }, { f: 'left', fmt: S.usd }, { f: 'used_pct', cls: 'l', render: usedBar }, { f: 'status', cls: 'l', render: (r) => S.pill(r.status) },
      { f: 'bookings', fmt: S.num }, { f: 'revenue', fmt: S.usd }, { f: 'roas', fmt: xx }, { f: 'margin_roas', fmt: xx }, { f: 'cac', fmt: S.usdFull }],
      { sort: null, selected: tk, onClick: (k) => dash.setParams({ brand: k.split('|')[0] }) });
  };
  $('#sp-cat').addEventListener('change', () => drawSpend());
  const drawSpend = () => {
    drawBudget();
    const ss = S.rows('spendsum'), led = S.rows('ledger');
    const p = P(), tk = 'tot|' + p.brand + '|' + p.year, kw = 'key=' + S.enc(tk);
    document.querySelectorAll('#sp-kpis [data-source=spendsum]').forEach((el) => { el.dataset.where = kw; });
    if (!ss) { S.fail($('#c-spend'), 'spendsum'); S.fail($('#t-spendcat').parentElement, 'spendsum'); }
    else {
      const t = ss.find((x) => x.key === tk);
      document.querySelectorAll('#sp-kpis [data-source=spendsum]').forEach((el) => { el.classList.remove('dash-skeleton'); el.textContent = t ? S.usd(t[el.dataset.field]) : '—'; });
      const a = asOfDate().slice(0, 7);
      const months = ss.filter((x) => x.kind === 'month' && x.brand === p.brand && (/^\d{4}$/.test(p.year) ? x.month.startsWith(p.year) : p.year === 'All' ? x.month >= '2025-01' && x.month <= '2027-12' : x.month > (() => { const d = new Date(a + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 6); return d.toISOString().slice(0, 7); })() && x.month <= a))
        .map((x) => ({ ...x, shown: x.future ? x.committed : x.total + x.committed }));
      S.bars($('#c-spend'), months, { x: 'month', y: 'shown', xfmt: (m) => d3.utcFormat("%b '%y")(new Date(m + '-01T00:00:00Z')), yfmt: (v) => '$' + d3.format('~s')(v), tickMarks: [{ field: 'budget' }],
        color: (d) => (d.future ? 'var(--cds-chart-muted)' : d.budget && d.total > d.budget * 1.1 ? 'var(--cds-chart-status-critical)' : dash.colors[0]),
        tipLines: (d) => [['Ads', S.usdFull(d.ads)], ['Other costs', S.usdFull(d.other)], ['Committed', S.usdFull(d.committed)], ['Budget', S.usdFull(d.budget)]] });
      const lg = $('#sp-legend'); lg.replaceChildren();
      for (const [c, t] of [[dash.colors[0], 'Paid'], ['var(--cds-chart-status-critical)', 'Paid, over budget by 10%+'], ['var(--cds-chart-muted)', 'Committed, future'], ['var(--color-fg)', 'Budget (tick)']]) { const s = document.createElement('span'); const i = document.createElement('i'); i.style.background = c; s.append(i, t); lg.append(s); }
      const ct = $('#t-spendcat'); ct._redraw = drawSpend;
      S.table(ct, ss.filter((x) => x.kind === 'cat' && x.brand === p.brand && x.period === p.year), [{ f: 'category', cls: 'l' }, { f: 'cost', fmt: S.usd }, { f: 'share', fmt: S.pct }, { f: 'comped_value', fmt: S.usd }, { f: 'committed', fmt: S.usd },
        { f: 'leads', fmt: S.num }, { f: 'bookings', fmt: S.num }, { f: 'revenue', fmt: S.usd }, { f: 'cost_per_booking', fmt: S.usdFull }], { sort: { f: 'cost', dir: -1 } });
    }
    const lt = $('#t-ledger');
    if (!led) { S.fail(lt.parentElement, 'ledger'); return; }
    const q = $('#sp-search').value.trim().toLowerCase(), cat = $('#sp-cat').value;
    const rr = led.filter((r) => (p.brand === 'All' || r.brand === p.brand || r.brand === 'All brands') && (p.year === 'All' || (/^\d{4}$/.test(p.year) ? r.year === p.year : inPeriod(r.date, p.year)))
      && (!cat || r.category === cat) && (!q || [r.category, r.partner, r.description, r.brand, r.destination, r.activity].join(' ').toLowerCase().includes(q)));
    lt._redraw = drawSpend;
    S.table(lt, rr, [{ f: 'date', cls: 'l' }, { f: 'category', cls: 'l' }, { f: 'partner', cls: 'l' }, { f: 'description', cls: 'wrap' }, { f: 'brand', cls: 'l hide-narrow' }, { f: 'destination', cls: 'l hide-narrow' },
      { f: 'cash', fmt: S.usdFull }, { f: 'operational', fmt: S.usdFull }, { f: 'cabins_comped', fmt: S.num }, { f: 'comped_value', fmt: S.usdFull }, { f: 'total', fmt: S.usdFull },
      { f: 'bookings', fmt: S.num }, { f: 'revenue', fmt: S.usd }, { f: 'status', cls: 'l', render: (r) => S.pill(r.status) }], { sort: { f: 'date', dir: -1 } });
  };

  // ---------- render
  const X = window.SMIX;
  const DRAW = { overview: () => { drawOverview(); X.overview(P()); }, revenue: () => X.revenue(P()), inventory: () => { drawInventory(); X.risk(P()); drawPace(); }, spend: () => { drawSpend(); X.spend(P()); },
    campaigns: drawCampaigns, planner: drawPlanner, markets: () => { drawMarkets(); X.markets(P()); }, season: () => { drawSeason(); X.season(P()); }, sales: () => { X.sales(P()); drawSales(); },
    journey: () => { drawJourney(); X.journey(P()); }, b2b: () => X.b2b(P()), govern: () => {}, decisions: () => X.decisions(P()) };
  function render() {
    const cube = S.rows('cube');
    if (cube) buildFilters(cube);
    const p = P(); for (const k in fsel) if (fsel[k].options.length) fsel[k].value = p[k];
    drawHeader();
    DRAW[tab]();
    X.banner(tab, P());
  }
  S.show = (t) => showTab(t);
  // charts inside a collapsed section have no width until opened: draw them on opening
  document.querySelectorAll('.smi details.more').forEach((d) => d.addEventListener('toggle', () => { if (d.open) render(); }));
  dash.onData(render);
  const start = location.hash.slice(1) === 'pace' ? 'inventory' : location.hash.slice(1);
  showTab(TAB_FILTERS[start] ? start : 'decisions', false);
})();

