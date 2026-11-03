// Samara Marketing Intelligence — commercial, forward-looking, partnership and customer calculations added with the 11-module architecture.

dash.calc('commercial', {
  title: 'Revenue and utilisation by departure',
  description: 'For each brand, destination, voyage type and departure year: scheduled yacht-nights and cabin-nights, what was sold, booking value, margin, discounts, commission and cancellations, cabin utilisation, yacht-night utilisation and revenue per available yacht-night for private charters, revenue per available cabin-night for shared voyages, and the value of cabins on departures ahead that are projected to stay unsold. Available nights are scheduled departure nights, not every calendar night.',
  inputs: ['enriched', 'trips', 'coverage'],
  fn: (enriched, trips, coverage) => {
    const asOf = enriched.reduce((m, l) => (l.enquiry > m ? l.enquiry : m), '');
    const trip = new Map(trips.map((x) => [x.trip_id, x]));
    const isPrivate = (v) => /private/i.test(v);
    const sold = new Map(), price = new Map();
    for (const l of enriched) {
      if (!l.b) continue;
      if (trip.has(l.trip_id)) sold.set(l.trip_id, (sold.get(l.trip_id) || 0) + l.cabins);
      if (l.cabins) { const k = l.dest + '|' + l.vtype, v = price.get(k) || [0, 0]; v[0] += l.value; v[1] += l.cabins; price.set(k, v); }
    }
    const proj = new Map(coverage.map((r) => [r.trip_id, r.projected]));
    const m = new Map();
    const get = (b, d, v, y) => { const k = [b, d, v, y].join('|'); let a = m.get(k);
      if (!a) m.set(k, (a = { key: k, brand: b, dest: d, vtype: v, year: y, departures: 0, ahead: 0, yacht_nights: 0, priv_nights: 0, priv_nights_sold: 0, cabin_nights: 0, shared_cn: 0, cabin_nights_sold: 0, cabins: 0, cabins_sold: 0,
        bookings: 0, revenue: 0, priv_rev: 0, shared_rev: 0, margin: 0, discount: 0, commission: 0, cancelled: 0, cancelled_value: 0, unsold_value: 0, at_risk: 0 })); return a; };
    const each = (x, fn) => { for (const b of ['All', x.brand]) for (const d of ['All', x.destination]) for (const v of ['All', x.voyage_type]) for (const y of ['All', x.departure_date.slice(0, 4)]) fn(get(b, d, v, y)); };
    for (const x of trips) {
      const cab = Number(x.cabins), n = Number(x.nights), s = Math.min(cab, sold.get(x.trip_id) || 0), ahead = x.departure_date > asOf, pr = isPrivate(x.voyage_type);
      const pp = price.get(x.destination + '|' + x.voyage_type), per = pp && pp[1] ? pp[0] / pp[1] : 0;
      const projUnsold = ahead && proj.has(x.trip_id) ? Math.max(0, cab - proj.get(x.trip_id)) : 0;
      each(x, (a) => {
        a.departures++; a.yacht_nights += n; a.cabin_nights += cab * n; a.cabin_nights_sold += s * n; a.cabins += cab; a.cabins_sold += s;
        if (pr) { a.priv_nights += n; if (s > 0) a.priv_nights_sold += n; } else a.shared_cn += cab * n;
        if (ahead) { a.ahead++; a.unsold_value += (cab - s) * per; a.at_risk += projUnsold * per; }
      });
    }
    for (const l of enriched) {
      const x = trip.get(l.trip_id); if (!x || !(l.b || l.c)) continue;
      const pr = isPrivate(x.voyage_type);
      each(x, (a) => {
        if (l.b) { a.bookings++; a.revenue += l.value; a.margin += l.margin; a.discount += l.discount; a.commission += l.commission; if (pr) a.priv_rev += l.value; else a.shared_rev += l.value; }
        else { a.cancelled++; a.cancelled_value += l.cvalue; }
      });
    }
    const r = (x) => (isFinite(x) ? Math.round(x) : null), r2 = (x) => (isFinite(x) ? Math.round(x * 100) / 100 : null), r3 = (x) => (isFinite(x) ? Math.round(x * 1000) / 1000 : null);
    return [...m.values()].map((a) => ({
      key: a.key, brand: a.brand, dest: a.dest, vtype: a.vtype, year: a.year, departures: a.departures, ahead: a.ahead, cabins: a.cabins, cabins_sold: a.cabins_sold, bookings: a.bookings,
      yacht_nights: a.yacht_nights, cabin_nights: a.cabin_nights, cabin_nights_sold: a.cabin_nights_sold,
      revenue: r(a.revenue), margin: r(a.margin), margin_pct: r3(a.margin / a.revenue), discount: r(a.discount), discount_rate: r3(a.discount / (a.revenue + a.discount)), commission: r(a.commission),
      cancelled: a.cancelled, cancelled_value: r(a.cancelled_value), cancel_rate: r3(a.cancelled / (a.bookings + a.cancelled)), avg_value: r(a.revenue / a.bookings),
      util_cabin: r3(a.cabin_nights_sold / a.cabin_nights), util_yacht: a.priv_nights ? r3(a.priv_nights_sold / a.priv_nights) : null,
      revpan: a.priv_nights ? r(a.priv_rev / a.priv_nights) : null, revpacn: a.shared_cn ? r2(a.shared_rev / a.shared_cn) : null,
      unsold_value: r(a.unsold_value), at_risk: r(a.at_risk),
    }));
  },
});

dash.calc('forecast', {
  title: 'Bookings forecast, next 30/60/90 days',
  description: 'Bookings likely to be confirmed in the next 30, 60 and 90 days: what was confirmed in the same days a year earlier, scaled by how confirmations have run against a year earlier lately (the last 90 days for the central figure; the last 30 and 180 days set the range). With the departures in each window, their unsold cabins, and how many are behind or have no marketing aimed at them. A trend estimate, not a promise.',
  inputs: ['enriched', 'coverage'],
  fn: (enriched, coverage) => {
    const DAY = 864e5, t = (s) => Date.parse(s + 'T00:00:00Z');
    const asOf = enriched.reduce((m, l) => (l.enquiry > m ? l.enquiry : m), ''), now = t(asOf), ly = now - 365 * DAY;
    const rows = [];
    for (const b of ['All', ...new Set(enriched.map((l) => l.brand))]) {
      const bk = enriched.filter((l) => l.b && l.booking_date && (b === 'All' || l.brand === b)).map((l) => ({ t: t(l.booking_date), v: l.value }));
      const inW = (a, z) => bk.filter((x) => x.t > a && x.t <= z);
      const ratio = (d) => { const cur = inW(now - d * DAY, now).length, prev = inW(ly - d * DAY, ly).length; return prev >= 3 ? cur / prev : null; };
      const r90 = ratio(90), rs = [ratio(30), r90, ratio(180)].filter((x) => x != null), c = r90 != null ? r90 : 1;
      const lo = rs.length ? Math.min(...rs) : 1, hi = rs.length ? Math.max(...rs) : 1;
      for (const h of [30, 60, 90]) {
        const base = inW(ly, ly + h * DAY), n = base.length, v = base.reduce((s, x) => s + x.v, 0);
        const deps = coverage.filter((r) => (b === 'All' || r.brand === b) && r.days_out > 0 && r.days_out <= h);
        rows.push({ key: b + '|' + h, brand: b, horizon: h, ly_bookings: n, ly_value: Math.round(v), trend: Math.round(c * 100) / 100,
          f_bookings: Math.round(n * c), f_low: Math.round(n * lo), f_high: Math.round(n * hi), f_value: Math.round(v * c),
          departures: deps.length, unsold: deps.reduce((s, r) => s + r.unsold, 0),
          at_risk: deps.filter((r) => r.unsold > 0 && (r.status === 'Gap: start now' || r.status === 'Covered but behind' || r.status === 'Gap: plan campaign')).length });
      }
    }
    return rows;
  },
});

dash.calc('watch', {
  title: 'Performance watch',
  description: 'Rule-based observations, each with the figure behind it and the threshold that raised it: yachts behind past years\' booking pace, paid channels whose cost per qualified lead rose 15%+ on a year earlier, departures within 75 days with 2+ unsold cabins and no activity or behind pace, brands whose proposal-to-booking rate fell 15%+, live campaigns costing 40%+ more per qualified lead than their channel, slower first replies, markets with 25%+ more enquiries and destinations with 20%+ fewer (last 90 days against the same 90 days a year earlier, 20+ leads). Observations to investigate, not instructions.',
  inputs: ['enriched', 'pace', 'coverage', 'calendar'],
  fn: (enriched, pace, coverage, calendar) => {
    const DAY = 864e5, t = (s) => Date.parse(s + 'T00:00:00Z');
    const asOf = enriched.reduce((m, l) => (l.enquiry > m ? l.enquiry : m), ''), now = t(asOf);
    const pc = (x) => (x >= 0 ? '+' : '−') + Math.round(Math.abs(x) * 100) + '%', usd = (x) => '$' + Math.round(x).toLocaleString('en'), mon = (m) => new Date(m + '-01T00:00:00Z').toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    const cur = (l) => t(l.enquiry) > now - 90 * DAY, prev = (l) => { const x = t(l.enquiry); return x > now - 455 * DAY && x <= now - 365 * DAY; };
    const out = [];
    const add = (area, subject, brand, severity, observation, look) => out.push({ key: area + '|' + subject, area, subject, brand, severity, observation, look });
    // booking pace
    for (const r of pace) if (r.brand !== 'All' && r.status === 'Behind: push now')
      add('Booking pace', r.brand + ' ' + r.dep_month, r.brand, 'High', r.brand + ', ' + mon(r.dep_month) + ' departures: ' + r.cabins_sold + ' of ' + r.cabins_total + ' cabins sold, where past years had about ' + Math.round(r.expected_now) + ' by this point.', 'Inventory & coverage');
    // acquisition cost on paid channels
    for (const ch of ['Meta Ads', 'Google Ads']) {
      const a = enriched.filter((l) => l.channel === ch && cur(l)), b = enriched.filter((l) => l.channel === ch && prev(l));
      const qa = a.reduce((s, l) => s + l.q, 0), qb = b.reduce((s, l) => s + l.q, 0), sa = a.reduce((s, l) => s + l.tcost, 0), sb = b.reduce((s, l) => s + l.tcost, 0);
      if (qa >= 20 && qb >= 20 && sb > 0) { const x = sa / qa, y = sb / qb, d = x / y - 1;
        if (d >= 0.15) add('Acquisition cost', ch, 'All', d >= 0.3 ? 'High' : 'Medium', ch + ' cost per qualified lead is ' + usd(x) + ' over the last 90 days against ' + usd(y) + ' a year earlier (' + pc(d) + ').', 'Campaigns'); }
    }
    // inventory close at hand
    for (const r of coverage) if (r.days_out <= 75 && r.unsold >= 2 && (r.status === 'Gap: start now' || r.status === 'Covered but behind'))
      add('Inventory', r.trip_id, r.brand, 'High', r.brand + ' · ' + r.dest + ', ' + r.departure + ': ' + r.unsold + ' of ' + r.cabins + ' cabins unsold, ' + r.days_out + ' days to departure, ' + r.warm + ' warm conversations' + (r.n_cover ? '.' : ', no marketing aimed at it.'), 'Inventory & coverage');
    // proposal-to-booking by brand: proposals sent 2-7 months ago against the 12 months before
    const addM = (m, k) => { const d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 7); };
    const am = asOf.slice(0, 7), r0 = addM(am, -7), r1 = addM(am, -2), b0 = addM(am, -19);
    for (const br of new Set(enriched.map((l) => l.brand))) {
      const ps = enriched.filter((l) => l.brand === br && l.p && l.status !== 'Open' && l.proposal_month);
      const rc = ps.filter((l) => l.proposal_month >= r0 && l.proposal_month <= r1), bs = ps.filter((l) => l.proposal_month >= b0 && l.proposal_month < r0);
      if (rc.length >= 25 && bs.length >= 25) { const x = rc.filter((l) => l.b).length / rc.length, y = bs.filter((l) => l.b).length / bs.length;
        if (x < y * 0.85) add('Conversion', br, br, x < y * 0.75 ? 'High' : 'Medium', br + ' proposal-to-booking is ' + Math.round(x * 100) + '% for proposals sent ' + mon(r0) + '–' + mon(r1) + ', against ' + Math.round(y * 100) + '% in the 12 months before.', 'Sales & conversion'); }
    }
    // live campaigns trailing their channel
    const live = new Set(calendar.filter((a) => a.status === 'Live').map((a) => a.name));
    const recent = enriched.filter((l) => t(l.enquiry) > now - 60 * DAY && l.tcost > 0);
    const byCamp = new Map(), byCh = new Map();
    for (const l of recent) { const a = byCamp.get(l.campaign) || { ch: l.channel, brand: l.brand, q: 0, s: 0, n: 0 }; a.q += l.q; a.s += l.tcost; a.n++; byCamp.set(l.campaign, a); const c = byCh.get(l.channel) || { q: 0, s: 0 }; c.q += l.q; c.s += l.tcost; byCh.set(l.channel, c); }
    for (const [name, a] of byCamp) { if (!live.has(name) || a.n < 15 || !a.q) continue; const c = byCh.get(a.ch), x = a.s / a.q, y = c.q ? c.s / c.q : null;
      if (y && x > y * 1.4) add('Campaign', name, a.brand, 'Medium', name + ' (live): ' + usd(x) + ' per qualified lead over the last 60 days against ' + usd(y) + ' for ' + a.ch + ' overall: at risk of missing its cost target.', 'Campaigns'); }
    // first reply speed
    const med = (arr) => { const s = arr.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
    const rq = enriched.filter((l) => l.q && l.reply_h != null);
    const ra = med(rq.filter((l) => t(l.enquiry) > now - 30 * DAY).map((l) => l.reply_h)), rb = med(rq.filter((l) => t(l.enquiry) <= now - 30 * DAY && t(l.enquiry) > now - 120 * DAY).map((l) => l.reply_h));
    if (ra != null && rb != null && ra > rb * 1.5 && ra - rb >= 1) add('Response', 'reply', 'All', 'Medium', 'Median first reply to qualified leads is ' + ra.toFixed(1) + ' h over the last 30 days against ' + rb.toFixed(1) + ' h in the 90 days before.', 'Sales & conversion');
    // demand shifts
    const shift = (keyFn) => { const m = new Map(); for (const l of enriched) { const k = keyFn(l); if (!k) continue; const v = m.get(k) || [0, 0]; if (cur(l)) v[0]++; else if (prev(l)) v[1]++; m.set(k, v); } return m; };
    for (const [c, [x, y]] of shift((l) => l.country)) if (y >= 20 && x / y - 1 >= 0.25) add('Rising demand', c, 'All', 'Info', c + ': ' + x + ' enquiries in the last 90 days against ' + y + ' a year earlier (' + pc(x / y - 1) + ').', 'Markets & lead time');
    for (const [k, [x, y]] of shift((l) => l.brand + ' · ' + l.dest)) if (y >= 20 && x / y - 1 <= -0.2) add('Declining enquiries', k, k.split(' · ')[0], 'Medium', k + ': ' + x + ' enquiries in the last 90 days against ' + y + ' a year earlier (' + pc(x / y - 1) + ').', 'Revenue & commercial');
    const rank = { High: 0, Medium: 1, Info: 2 };
    return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  },
});

dash.calc('risk', {
  title: 'Inventory risk and coverage score',
  description: 'For every departure ahead, a coverage score out of 100 from five checks worth 20 each: a paid campaign aimed at it; the destination featured in live or planned press, influencer or content activity; that campaign buying ads in one of the two countries that book this destination most; an agent fam trip or trade show for the destination in the last 12 months or next 3; and qualified enquiries for this yacht and destination in the last 60 days at least matching what is needed to reach the usual fill. Then a risk index out of 10 from fixed points: 2 if 60 days or less away (1 if 120), 2 if half or more unsold (1 if a quarter), 2 if sold is under 70% of where past years stood (1 if under 90%), 1 inside the main booking window, 1 if warm conversations are under half the unsold cabins, 1 if coverage is under 50, 1 if no booking in the last 30 days. 6+ is high, 3–5 medium.',
  inputs: ['coverage', 'enriched', 'calendar', 'spend', 'costs'],
  fn: (coverage, enriched, calendar, spend, costs) => {
    const DAY = 864e5, t = (s) => Date.parse(s + 'T00:00:00Z');
    const asOf = enriched.reduce((m, l) => (l.enquiry > m ? l.enquiry : m), ''), now = t(asOf);
    const mk = new Map(), q60 = new Map(), qb = new Map(), cpb = new Map(), rec = new Map();
    for (const l of enriched) {
      const k = l.brand + '|' + l.dest;
      if (l.b) { const c = mk.get(l.dest) || new Map(); c.set(l.country, (c.get(l.country) || 0) + 1); mk.set(l.dest, c); const v = cpb.get(l.dest) || [0, 0]; v[0] += l.cabins; v[1]++; cpb.set(l.dest, v);
        if (l.booking_date && t(l.booking_date) > now - 30 * DAY) rec.set(l.trip_id, (rec.get(l.trip_id) || 0) + 1); }
      if (l.q && t(l.enquiry) > now - 60 * DAY) q60.set(k, (q60.get(k) || 0) + 1);
      if (l.q && l.status !== 'Open') { const v = qb.get(l.dest) || [0, 0]; v[0] += l.b; v[1]++; qb.set(l.dest, v); }
    }
    const top2 = (d) => [...(mk.get(d) || new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]);
    const campC = new Map(); for (const s of spend) { if (!campC.has(s.campaign)) campC.set(s.campaign, new Set()); campC.get(s.campaign).add(s.country); }
    const act = calendar.filter((a) => a.status === 'Live' || a.status === 'Planned');
    const agents = costs.filter((c) => /agent fam|event|trade/i.test(c.category) && t(c.date) > now - 365 * DAY && t(c.date) <= now + 90 * DAY);
    const yes = (b) => (b ? 'Yes' : 'No');
    return coverage.map((r) => {
      const paid = r.n_paid > 0;
      const content = act.some((a) => !/paid|always/i.test(a.kind) && (a.brand === 'All brands' || a.brand === r.brand) && a.destination === r.dest);
      const names = r.covered_by ? r.covered_by.split('; ') : [], tops = top2(r.dest);
      const markets = paid && names.some((n) => tops.some((c) => campC.has(n) && campC.get(n).has(c)));
      const agentOk = agents.some((c) => (c.brand === 'All brands' || c.brand === r.brand) && (!c.destination || /^all/i.test(c.destination) || c.destination === r.dest));
      const v = cpb.get(r.dest), perB = v && v[1] ? v[0] / v[1] : 1, qv = qb.get(r.dest), q2b = qv && qv[1] ? qv[0] / qv[1] : 0.1;
      const needB = Math.max(0, (r.hist == null ? 0.7 : r.hist) * r.cabins - r.sold) / Math.max(0.5, perB), needQ = Math.ceil(needB / Math.max(0.02, q2b));
      const have = q60.get(r.brand + '|' + r.dest) || 0, audience = have >= needQ;
      const score = 20 * [paid, content, markets, agentOk, audience].filter(Boolean).length;
      const why = []; let pts = 0;
      const pt = (n, txt) => { pts += n; why.push(txt + ' (+' + n + ')'); };
      if (r.unsold > 0) {
        if (r.days_out <= 60) pt(2, r.days_out + ' days away'); else if (r.days_out <= 120) pt(1, r.days_out + ' days away');
        const us = r.unsold / r.cabins; if (us >= 0.5) pt(2, Math.round(us * 100) + '% unsold'); else if (us >= 0.25) pt(1, Math.round(us * 100) + '% unsold');
        if (r.expected_now != null && r.expected_now >= 1) { if (r.sold < r.expected_now * 0.7) pt(2, 'well behind past pace'); else if (r.sold < r.expected_now * 0.9) pt(1, 'slightly behind past pace'); }
        if (asOf >= r.live_by) pt(1, 'inside the booking window');
        if (r.warm < r.unsold / 2) pt(1, 'few warm conversations');
        if (score < 50) pt(1, 'coverage ' + score);
        if (!rec.get(r.trip_id)) pt(1, 'no booking in 30 days');
      }
      return { trip_id: r.trip_id, brand: r.brand, dest: r.dest, vtype: r.vtype, departure: r.departure, dep_month: r.dep_month, days_out: r.days_out, cabins: r.cabins, sold: r.sold, unsold: r.unsold, status: r.status,
        cov_paid: yes(paid), cov_content: yes(content), cov_markets: yes(markets), cov_agents: yes(agentOk), cov_audience: yes(audience), q60: have, q_needed: needQ, top_markets: tops.join(', '),
        coverage_score: score, risk_points: pts, risk_band: r.unsold === 0 ? 'None' : pts >= 6 ? 'High' : pts >= 3 ? 'Medium' : 'Low', reasons: why.length ? why.join('; ') : 'Sold out' };
    });
  },
});

dash.calc('risk_sum', {
  title: 'Inventory risk totals',
  description: 'Departures ahead by risk band, average coverage score and unsold cabins on high-risk departures, for each brand and destination.',
  inputs: ['risk'],
  fn: (risk) => {
    const m = new Map();
    for (const r of risk) for (const b of ['All', r.brand]) for (const d of ['All', r.dest]) {
      const k = b + '|' + d; let a = m.get(k);
      if (!a) m.set(k, (a = { key: k, brand: b, dest: d, n: 0, high: 0, medium: 0, low: 0, cov: 0, high_unsold: 0 }));
      a.n++; a.cov += r.coverage_score; if (r.risk_band === 'High') { a.high++; a.high_unsold += r.unsold; } else if (r.risk_band === 'Medium') a.medium++; else a.low++;
    }
    return [...m.values()].map((a) => ({ key: a.key, brand: a.brand, dest: a.dest, departures: a.n, high: a.high, medium: a.medium, low: a.low, high_unsold: a.high_unsold, avg_coverage: Math.round(a.cov / a.n) }));
  },
});

dash.calc('b2b', {
  title: 'Agent and partnership results',
  description: 'Agent-led enquiries (channel Agent / B2B) against direct ones, agent results by guest country and by destination, and every agent fam trip, trade show or event with its cost and the agent enquiries, bookings and value for that brand (and destination, where it had one) in the 6 months before and after. Guest country is where the guest lives; the agency\'s own country is not in the data yet.',
  inputs: ['enriched', 'costs'],
  fn: (enriched, costs) => {
    const DAY = 864e5, t = (s) => Date.parse(s + 'T00:00:00Z');
    const asOf = enriched.reduce((m, l) => (l.enquiry > m ? l.enquiry : m), ''), now = t(asOf);
    const per = (l) => ['All', ...l.periods.filter((p) => /^\d{4}$|^L90$|^L30$/.test(p))];
    const m = new Map();
    const get = (kind, b, p, k2, extra) => { const k = [kind, b, p, k2].join('|'); let a = m.get(k);
      if (!a) m.set(k, (a = { key: k, kind, brand: b, period: p, label: k2, leads: 0, qualified: 0, proposals: 0, bookings: 0, value: 0, margin: 0, commission: 0, cancelled: 0, cyc: [], ...extra })); return a; };
    const tot = new Map();
    for (const l of enriched) for (const b of ['All', l.brand]) for (const p of per(l)) {
      const add = (a) => { a.leads++; a.qualified += l.q; a.proposals += l.p; a.bookings += l.b; a.value += l.value; a.margin += l.margin; a.cancelled += l.c; if (l.b) { a.commission += l.commission; a.cyc.push(l.cycle); } };
      add(get('route', b, p, l.route));
      if (l.b) { const k = b + '|' + p; const v = tot.get(k) || { b: 0, v: 0, d: new Map() }; v.b++; v.v += l.value; v.d.set(l.dest, (v.d.get(l.dest) || 0) + 1); tot.set(k, v); }
      if (l.route === 'Agent') { add(get('market', b, p, l.country)); add(get('dest', b, p, l.dest)); }
    }
    const r = (x) => (isFinite(x) ? Math.round(x) : null), r3 = (x) => (isFinite(x) ? Math.round(x * 1000) / 1000 : null);
    const rows = [...m.values()].map((a) => { const c = a.cyc.sort((x, y) => x - y), T = tot.get(a.brand + '|' + a.period) || { b: 0, v: 0, d: new Map() };
      const o = { key: a.key, kind: a.kind, brand: a.brand, period: a.period, label: a.label, leads: a.leads, qualified: a.qualified, bookings: a.bookings, value: r(a.value), margin: r(a.margin), commission: r(a.commission),
        l2b: r3(a.bookings / a.leads), p2b: a.proposals ? r3(a.bookings / a.proposals) : null, avg_value: a.bookings ? r(a.value / a.bookings) : null, commission_rate: a.value ? r3(a.commission / (a.value)) : null,
        cancel_rate: r3(a.cancelled / (a.bookings + a.cancelled)), cycle_median: c.length ? c[Math.floor(c.length / 2)] : null, share_value: T.v ? r3(a.value / T.v) : null, share_bookings: T.b ? r3(a.bookings / T.b) : null };
      if (a.kind === 'dest') o.share_all = T.b ? r3((T.d.get(a.label) || 0) / T.b) : null;
      return o; });
    // destination rows: share of agent bookings, beside that destination's share of all bookings
    const agentB = new Map(rows.filter((o) => o.kind === 'route' && o.label === 'Agent').map((o) => [o.brand + '|' + o.period, o.bookings]));
    for (const o of rows) if (o.kind === 'dest') o.share_agent = agentB.get(o.brand + '|' + o.period) ? r3(o.bookings / agentB.get(o.brand + '|' + o.period)) : null;
    // partnership activity: 6 months before and after, agent leads for that brand (and destination)
    const ag = enriched.filter((l) => l.route === 'Agent');
    for (const c of costs) {
      if (!/agent fam|event|trade/i.test(c.category)) continue;
      const d = t(c.date), fit = (l) => (c.brand === 'All brands' || l.brand === c.brand) && (!c.destination || /^all/i.test(c.destination) || l.dest === c.destination);
      const win = (a, z) => { const ls = ag.filter((l) => fit(l) && t(l.enquiry) > a && t(l.enquiry) <= z); return [ls.length, ls.filter((l) => l.b).length, ls.reduce((s, l) => s + l.value, 0)]; };
      const [lb, bb, vb] = win(d - 182 * DAY, d), [la, ba, va] = win(d, Math.min(now, d + 182 * DAY));
      const cost = Number(c.cash_usd) + Number(c.operational_usd), done = d + 182 * DAY <= now;
      rows.push({ key: 'activity|' + c.cost_id, kind: 'activity', brand: c.brand, period: c.date.slice(0, 4), label: c.partner, date: c.date, category: c.category, description: c.description, destination: c.destination, status: c.status,
        cost: r(cost), cabins_comped: Number(c.cabins_comped) || 0, leads_before: lb, leads_after: la, bookings_before: bb, bookings_after: ba, value_before: r(vb), value_after: r(va),
        lift: lb ? r3(la / lb - 1) : null, window: d > now ? 'Not yet held' : done ? 'Complete' : 'Still running (' + Math.round((now - d) / DAY) + ' of 182 days)' });
    }
    return rows;
  },
});

dash.calc('timing', {
  title: 'When to start marketing each departure',
  description: 'For each destination and departure month: how far ahead past booked guests enquired (median and the 75th percentile), the month most of those bookings were confirmed, a start date for marketing (75th percentile plus 21 days to prepare a campaign, before the next departure that month), the unsold cabins on those departures and whether activity is aimed at them yet.',
  inputs: ['enriched', 'coverage'],
  fn: (enriched, coverage) => {
    const DAY = 864e5, t = (s) => Date.parse(s + 'T00:00:00Z');
    const asOf = enriched.reduce((m, l) => (l.enquiry > m ? l.enquiry : m), ''), now = t(asOf);
    const m = new Map();
    for (const l of enriched) { if (!l.b || !l.departure || l.departure >= asOf) continue; const moy = Number(l.dep_month.slice(5, 7));
      for (const d of ['All', l.dest]) { const k = d + '|' + moy; const a = m.get(k) || { dest: d, moy, e2d: [], bm: new Map(), cabins: 0, years: new Set() }; a.e2d.push(l.e2d); a.cabins += l.cabins; a.years.add(l.dep_month.slice(0, 4)); const bm = Number(l.booking_month.slice(5, 7)); a.bm.set(bm, (a.bm.get(bm) || 0) + 1); m.set(k, a); } }
    const rows = [];
    for (const [k, a] of m) {
      const e = a.e2d.sort((x, y) => x - y), q = (p) => e[Math.min(e.length - 1, Math.floor(p * e.length))];
      const p75 = q(0.75), start = Math.ceil((p75 + 21) / 7) * 7, peak = [...a.bm.entries()].sort((x, y) => y[1] - x[1])[0][0];
      const fut = coverage.filter((r) => (a.dest === 'All' || r.dest === a.dest) && Number(r.dep_month.slice(5, 7)) === a.moy).sort((x, y) => (x.departure < y.departure ? -1 : 1));
      const next = fut.length ? fut[0].dep_month : null, nextRows = fut.filter((r) => r.dep_month === next);
      const startBy = next ? new Date(t(next + '-01') - start * DAY).toISOString().slice(0, 10) : null;
      const covered = nextRows.filter((r) => r.n_cover > 0).length, unsold = nextRows.reduce((s, r) => s + r.unsold, 0);
      let status = 'No departure scheduled';
      if (next) status = unsold === 0 ? 'Sold out' : startBy <= asOf ? (covered ? 'Running' : 'Late: should be live') : t(startBy) - now <= 45 * DAY ? 'Start within 45 days' : 'Later';
      rows.push({ key: k, dest: a.dest, moy: a.moy, bookings: e.length, cabins_per_year: Math.round(a.cabins / Math.max(1, a.years.size)), e2d_median: q(0.5), e2d_p75: p75, peak_booking_moy: peak, start_days: start,
        next_dep_month: next, departures: nextRows.length, unsold, covered, start_by: startBy, status });
    }
    return rows.sort((a, b) => (a.dest < b.dest ? -1 : a.dest > b.dest ? 1 : a.moy - b.moy));
  },
});

dash.calc('market_opp', {
  title: 'Market demand vs marketing investment',
  description: 'For each market group and brand: the share of all marketing cost spent on its enquiries against the share of booking value it produced, booking value per marketing dollar, cost per booking, average booking value and conversion. An index above 1 means the market returns more than its share of spend: a lead to investigate (market size, access and competition are not in the data).',
  inputs: ['enriched'],
  fn: (enriched) => {
    const per = (l) => ['All', ...l.periods.filter((p) => /^\d{4}$|^L90$/.test(p))];
    const m = new Map(), tot = new Map();
    for (const l of enriched) for (const b of ['All', l.brand]) for (const p of per(l)) {
      const k = [b, p, l.group].join('|'); const a = m.get(k) || { key: k, brand: b, period: p, group: l.group, spend: 0, leads: 0, qualified: 0, bookings: 0, value: 0, margin: 0 };
      a.spend += l.tcost; a.leads++; a.qualified += l.q; a.bookings += l.b; a.value += l.value; a.margin += l.margin; m.set(k, a);
      const T = tot.get(b + '|' + p) || [0, 0]; T[0] += l.tcost; T[1] += l.value; tot.set(b + '|' + p, T);
    }
    const r3 = (x) => (isFinite(x) ? Math.round(x * 1000) / 1000 : null), r2 = (x) => (isFinite(x) ? Math.round(x * 100) / 100 : null);
    return [...m.values()].map((a) => { const T = tot.get(a.brand + '|' + a.period), ss = T[0] ? a.spend / T[0] : null, vs = T[1] ? a.value / T[1] : null;
      return { key: a.key, brand: a.brand, period: a.period, group: a.group, leads: a.leads, bookings: a.bookings, spend: Math.round(a.spend), value: Math.round(a.value),
        spend_share: r3(ss), value_share: r3(vs), opp_index: ss ? r2(vs / ss) : null, value_per_usd: a.spend ? r2(a.value / a.spend) : null,
        cac: a.bookings && a.spend ? Math.round(a.spend / a.bookings) : null, avg_value: a.bookings ? Math.round(a.value / a.bookings) : null, l2b: r3(a.bookings / a.leads) }; });
  },
});

dash.calc('windows', {
  title: 'Booking windows by market, voyage type and destination',
  description: 'For booked guests, days between enquiry and departure (25th, 50th and 75th percentile) and between booking and departure, split by brand, destination, market group and voyage type, so private charters and shared voyages are never averaged together.',
  inputs: ['enriched'],
  fn: (enriched) => {
    const m = new Map();
    for (const l of enriched) { if (!l.b || l.e2d == null) continue;
      for (const b of ['All', l.brand]) for (const d of ['All', l.dest]) for (const g of ['All markets', l.group]) {
        const k = [b, d, g, l.vtype].join('|'); const a = m.get(k) || { key: k, brand: b, dest: d, group: g, vtype: l.vtype, e: [], bl: [] }; a.e.push(l.e2d); a.bl.push(l.book_lt); m.set(k, a); } }
    const q = (s, p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return [...m.values()].map((a) => { const e = a.e.sort((x, y) => x - y), bl = a.bl.sort((x, y) => x - y);
      return { key: a.key, brand: a.brand, dest: a.dest, group: a.group, vtype: a.vtype, bookings: e.length, e2d_p25: q(e, 0.25), e2d_median: q(e, 0.5), e2d_p75: q(e, 0.75), book_lt_median: q(bl, 0.5) }; });
  },
});

dash.calc('stages', {
  title: 'Sales pipeline: stages, timing and bottlenecks',
  description: 'For each brand and enquiry period: enquiries, qualified leads, active conversations, proposals and bookings with the conversion between each, median days from enquiry to proposal and from proposal to booking, median first reply and share answered within an hour, open proposals and their expected value (open proposals × proposal-to-booking rate × average booking value), and lost qualified leads split by where the problem shows up. Negotiation is not a separate CRM stage yet.',
  inputs: ['enriched', 'lost'],
  fn: (enriched, lost) => {
    const DAY = 864e5, t = (s) => Date.parse(s + 'T00:00:00Z');
    const per = (l) => ['All', ...l.periods.filter((p) => /^\d{4}$|^L90$|^L30$/.test(p))];
    const grp = new Map(lost.map((x) => [x.reason, x.group]));
    const m = new Map();
    for (const l of enriched) for (const b of ['All', l.brand]) for (const p of per(l)) {
      const k = b + '|' + p; let a = m.get(k);
      if (!a) m.set(k, (a = { key: k, brand: b, period: p, leads: 0, qualified: 0, replied: 0, proposals: 0, bookings: 0, value: 0, open_p: 0, lost_q: 0, unq: 0, e2p: [], p2b: [], reply: [], fast: 0, lg: { 'Commercial constraint': 0, 'Sales follow-up': 0, 'Guest timing': 0, Unknown: 0 } }));
      a.leads++; a.qualified += l.q; a.replied += l.r; a.proposals += l.p; a.bookings += l.b; a.value += l.value; if (!l.q && l.status !== 'Open') a.unq++;
      if (l.p && l.status === 'Open') a.open_p++;
      if (l.q && l.reply_h != null) { a.reply.push(l.reply_h); if (l.reply_h < 1) a.fast++; }
      if (l.p && l.proposal_date) a.e2p.push(Math.round((t(l.proposal_date) - t(l.enquiry)) / DAY));
      if (l.b && l.proposal_date && l.booking_date) a.p2b.push(Math.round((t(l.booking_date) - t(l.proposal_date)) / DAY));
      if (l.q && l.status === 'Lost') { a.lost_q++; a.lg[grp.get(l.lost_reason || 'Unknown reason') || 'Unknown']++; }
    }
    const med = (s) => { s.sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
    const r3 = (x) => (isFinite(x) ? Math.round(x * 1000) / 1000 : null);
    return [...m.values()].map((a) => { const p2b = a.proposals - a.open_p ? a.bookings / (a.proposals - a.open_p) : null, avg = a.bookings ? a.value / a.bookings : 0;
      return { key: a.key, brand: a.brand, period: a.period, leads: a.leads, qualified: a.qualified, replied: a.replied, proposals: a.proposals, bookings: a.bookings,
        l2q: r3(a.qualified / a.leads), q2r: a.qualified ? r3(a.replied / a.qualified) : null, r2p: a.replied ? r3(a.proposals / a.replied) : null, p2b: r3(p2b),
        unqualified_share: r3(a.unq / a.leads), days_e2p: med(a.e2p), days_p2b: med(a.p2b), reply_median: med(a.reply), reply_1h: a.reply.length ? r3(a.fast / a.reply.length) : null,
        open_proposals: a.open_p, open_value: p2b == null ? null : Math.round(a.open_p * p2b * avg), lost_qualified: a.lost_q,
        lost_commercial: a.lg['Commercial constraint'], lost_sales: a.lg['Sales follow-up'], lost_timing: a.lg['Guest timing'], lost_unknown: a.lg.Unknown }; });
  },
});

dash.calc('retention', {
  title: 'Guest retention and value',
  description: 'Bookings, booking value, average value and marketing cost per booking for new, repeat and referred guests, by brand and enquiry year, and the share of each year\'s bookings from returning or referred guests. True lifetime value and cross-brand moves (a Samara guest later chartering Otium) need one guest ID across brands, which the sample data does not have.',
  inputs: ['enriched'],
  fn: (enriched) => {
    const m = new Map(), tot = new Map();
    for (const l of enriched) { if (!l.b) continue; const g = l.guest_type === 'Repeat' ? 'Repeat' : l.guest_type === 'Referral' ? 'Referred' : 'New';
      for (const b of ['All', l.brand]) for (const y of ['All', l.year]) { const k = [b, y, g].join('|'); const a = m.get(k) || { key: k, brand: b, year: y, guest: g, bookings: 0, value: 0, margin: 0, cost: 0 }; a.bookings++; a.value += l.value; a.margin += l.margin; m.set(k, a);
        const T = tot.get(b + '|' + y) || { b: 0, v: 0 }; T.b++; T.v += l.value; tot.set(b + '|' + y, T); } }
    // marketing cost of each guest type's enquiries, booked or not
    const cost = new Map();
    for (const l of enriched) { const g = l.guest_type === 'Repeat' ? 'Repeat' : l.guest_type === 'Referral' ? 'Referred' : 'New'; for (const b of ['All', l.brand]) for (const y of ['All', l.year]) { const k = [b, y, g].join('|'); cost.set(k, (cost.get(k) || 0) + l.tcost); } }
    const r3 = (x) => (isFinite(x) ? Math.round(x * 1000) / 1000 : null);
    return [...m.values()].map((a) => { const T = tot.get(a.brand + '|' + a.year), c = cost.get(a.key) || 0;
      return { key: a.key, brand: a.brand, year: a.year, guest: a.guest, bookings: a.bookings, value: Math.round(a.value), margin: Math.round(a.margin), avg_value: Math.round(a.value / a.bookings),
        cac: Math.round(c / a.bookings), share_bookings: r3(a.bookings / T.b), share_value: r3(a.value / T.v) }; });
  },
});

dash.calc('attribution', {
  title: 'Attribution confidence',
  description: 'For booked guests: whether a first touch was recorded, whether the first touch and the enquiry channel were the same (single-touch) or different (assisted), and a confidence tier. High: enquiry came from a click-tracked ad (Meta Ads, Google Ads) and the first touch is recorded. Medium: first touch recorded, but the enquiry channel is self-reported or entered by hand (press, influencer, agent, referral, direct, organic). Low: first touch unknown. Also how often each channel was the first touch for a booking that enquired through another channel (assists).',
  inputs: ['enriched'],
  fn: (enriched) => {
    const known = (x) => x && !/unknown|^none$|^n\/a$/i.test(x);
    const m = new Map(), as = new Map();
    for (const l of enriched) { if (!l.b) continue;
      const tier = !known(l.first_touch) ? 'Low' : /meta|google/i.test(l.channel) ? 'High' : 'Medium';
      for (const b of ['All', l.brand]) {
        const a = m.get(b) || { key: 'sum|' + b, kind: 'sum', brand: b, bookings: 0, value: 0, known: 0, single: 0, assisted: 0, High: 0, Medium: 0, Low: 0, vHigh: 0, vMedium: 0, vLow: 0 };
        a.bookings++; a.value += l.value; a[tier]++; a['v' + tier] += l.value; if (known(l.first_touch)) { a.known++; if (l.first_touch === l.channel) a.single++; else a.assisted++; } m.set(b, a);
        if (known(l.first_touch)) { for (const [ch, f] of [[l.first_touch, 'first'], [l.channel, 'enquiry']]) { const k = b + '|' + ch; const c = as.get(k) || { key: 'ch|' + k, kind: 'channel', brand: b, channel: ch, first: 0, enquiry: 0, assists: 0, assist_value: 0 }; c[f]++; as.set(k, c); }
          if (l.first_touch !== l.channel) { const c = as.get(b + '|' + l.first_touch); c.assists++; c.assist_value += l.value; } }
      } }
    const r3 = (x) => (isFinite(x) ? Math.round(x * 1000) / 1000 : null);
    return [...[...m.values()].map((a) => ({ key: a.key, kind: a.kind, brand: a.brand, bookings: a.bookings, value: Math.round(a.value), known_share: r3(a.known / a.bookings), single_share: r3(a.single / a.bookings), assisted_share: r3(a.assisted / a.bookings),
      high: a.High, medium: a.Medium, low: a.Low, high_share: r3(a.High / a.bookings), medium_share: r3(a.Medium / a.bookings), low_share: r3(a.Low / a.bookings), low_value: Math.round(a.vLow) })),
      ...[...as.values()].map((c) => ({ ...c, assist_value: Math.round(c.assist_value) }))];
  },
});

dash.calc('spend_split', {
  title: 'Spend by investment type, destination and objective',
  description: 'Marketing spend grouped four ways. By investment type: paid media (Meta, Google and the performance agency fee: judged on CAC and ROAS), brand and content (content production: judged over 6–12 months), PR and partnerships (press, influencers, events, agent fam trips: judged on reach, agent pipeline and assisted bookings, not only direct enquiries) and digital infrastructure (website, analytics, tools: not in the spend record yet). By destination and by campaign objective, using each enquiry\'s share of the full marketing cost, with the qualified leads, bookings and value those enquiries produced.',
  inputs: ['spendsum', 'enriched'],
  fn: (spendsum, enriched) => {
    const G = { 'Meta Ads': 'Paid media', 'Google Ads': 'Paid media', 'Agency fees': 'Paid media', 'Content production': 'Brand & content', PR: 'PR & partnerships', Influencer: 'PR & partnerships', 'Event / trade show': 'PR & partnerships', 'Agent fam trip': 'PR & partnerships' };
    const rows = new Map(), tot = new Map();
    for (const r of spendsum) { if (r.kind !== 'cat') continue; const g = G[r.category] || 'Digital infrastructure', k = ['group', r.brand, r.period, g].join('|');
      const a = rows.get(k) || { key: k, kind: 'group', brand: r.brand, period: r.period, label: g, cost: 0, committed: 0, comped_value: 0 }; a.cost += r.cost; a.committed += r.committed; a.comped_value += r.comped_value; rows.set(k, a);
      tot.set(r.brand + '|' + r.period, (tot.get(r.brand + '|' + r.period) || 0) + r.cost); }
    for (const b of new Set(spendsum.filter((r) => r.kind === 'cat').map((r) => r.brand))) for (const p of new Set(spendsum.filter((r) => r.kind === 'cat').map((r) => r.period))) {
      const k = ['group', b, p, 'Digital infrastructure'].join('|'); if (!rows.has(k)) rows.set(k, { key: k, kind: 'group', brand: b, period: p, label: 'Digital infrastructure', cost: null, committed: null, comped_value: null }); }
    const per = (l) => ['All', ...l.periods.filter((p) => /^\d{4}$|^L90$|^L30$/.test(p))];
    for (const l of enriched) for (const b of ['All', l.brand]) for (const p of per(l)) for (const [kind, lab] of [['dest', l.dest], ['objective', l.ctype || 'No campaign']]) {
      const k = [kind, b, p, lab].join('|'); const a = rows.get(k) || { key: k, kind, brand: b, period: p, label: lab, cost: 0, leads: 0, qualified: 0, bookings: 0, value: 0 };
      a.cost += l.tcost; a.leads++; a.qualified += l.q; a.bookings += l.b; a.value += l.value; rows.set(k, a); }
    const r = (x) => (x == null ? null : Math.round(x));
    return [...rows.values()].map((a) => { const T = tot.get(a.brand + '|' + a.period) || 0;
      return a.kind === 'group' ? { ...a, cost: r(a.cost), committed: r(a.committed), comped_value: r(a.comped_value), share: a.cost != null && T ? Math.round((a.cost / T) * 1000) / 1000 : null }
        : { ...a, cost: r(a.cost), value: r(a.value), cpql: a.qualified && a.cost ? r(a.cost / a.qualified) : null, cac: a.bookings && a.cost ? r(a.cost / a.bookings) : null, roas: a.cost >= 1 ? Math.round((a.value / a.cost) * 100) / 100 : null }; });
  },
});
