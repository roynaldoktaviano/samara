// Samara Marketing Intelligence — calculations. Every figure on the page comes from one of these.

dash.calc('enriched', {
  title: 'Leads with full marketing cost and timing',
  description: 'Each enquiry with its share of ad spend (by month, campaign and country) and of other marketing costs (PR, influencers, content, events, fees: see the method below), plus lead times, guest type, cancellations, discounts and the periods it falls in.',
  inputs: ['leads', 'spend', 'costs', 'trips', 'calendar'],
  fn: (leadsIn, spend, costs, trips, calendar) => {
    // empty cells arrive as null: treat them as empty text
    const leads = leadsIn.map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v == null ? '' : v])));
    // Other costs are spread over the enquiries they could have brought:
    // an activity with its own leads (an influencer or press piece) over those leads;
    // the performance agency fee over that month's Meta and Google leads;
    // the PR retainer over press leads in the next 6 months; events and agent fam trips over agent leads in the next 6 months;
    // content shoots over all of that brand's leads in the next 12 months. Anything left over goes to that month's leads.
    const t = (s) => (s ? Date.parse(s + 'T00:00:00Z') : NaN);
    const DAY = 864e5;
    const key = (m, c, k) => m + '|' + c + '|' + k;
    const addM = (m, k) => { const d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 7); };
    const cnt = new Map();
    for (const l of leads) { const k = key(l.enquiry_date.slice(0, 7), l.campaign, l.country); cnt.set(k, (cnt.get(k) || 0) + 1); }
    const cost = new Map();
    for (const s of spend) { const k = key(s.month, s.campaign, s.country); cost.set(k, (cost.get(k) || 0) + Number(s.spend_usd)); }
    const asOf = leads.reduce((m, l) => (l.enquiry_date > m ? l.enquiry_date : m), '');
    const now = t(asOf), ly = new Date(now); ly.setUTCFullYear(ly.getUTCFullYear() - 1);
    const lyS = ly.toISOString().slice(0, 10), lyStart = lyS.slice(0, 4) + '-01-01';
    const back = (ms, d) => new Date(ms - (d - 1) * DAY).toISOString().slice(0, 10);
    const tripN = new Map(trips.map((x) => [x.trip_id, Number(x.nights)]));
    const names = new Map(calendar.map((a) => [a.activity_id, a.name]));
    const win = (d) => (d <= 30 ? '≤30 days' : d <= 60 ? '31–60 days' : d <= 120 ? '61–120 days' : d <= 240 ? '121–240 days' : '240+ days');
    const group = (c) => ({ Australia: 'Australia & NZ', 'New Zealand': 'Australia & NZ', Singapore: 'Singapore', 'Hong Kong': 'Hong Kong', Malaysia: 'Malaysia & Indonesia', Indonesia: 'Malaysia & Indonesia', 'United States': 'USA', 'United Kingdom': 'Europe', Germany: 'Europe', France: 'Europe', Switzerland: 'Europe', Italy: 'Europe', 'The Netherlands': 'Europe', Netherlands: 'Europe', Spain: 'Europe', Belgium: 'Europe', Austria: 'Europe', Sweden: 'Europe', Denmark: 'Europe', Norway: 'Europe', Finland: 'Europe', Ireland: 'Europe', Portugal: 'Europe', Poland: 'Europe', 'Czech Republic': 'Europe', Luxembourg: 'Europe', Greece: 'Europe' }[c] || 'Other');
    // other-cost allocation
    const other = new Map(), byMonth = new Map(), byCamp = new Map();
    for (const l of leads) {
      const m = l.enquiry_date.slice(0, 7);
      if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m).push(l);
      if (!byCamp.has(l.campaign)) byCamp.set(l.campaign, []); byCamp.get(l.campaign).push(l);
    }
    const inMonths = (m0, n, ok) => { const out = []; for (let i = 0; i < n; i++) for (const l of byMonth.get(addM(m0, i)) || []) if (ok(l)) out.push(l); return out; };
    for (const c of costs) {
      if (c.status !== 'Paid') continue;
      const amt = Number(c.cash_usd) + Number(c.operational_usd), m = c.date.slice(0, 7);
      const bOk = (l) => c.brand === 'All brands' || l.brand === c.brand;
      let pool = [];
      const own = c.activity_id && names.has(String(c.activity_id)) ? byCamp.get(names.get(String(c.activity_id))) || [] : [];
      if (own.length) pool = own;
      else if (c.category === 'Agency fees') pool = inMonths(m, 1, (l) => l.channel === 'Meta Ads' || l.channel === 'Google Ads');
      else if (c.category === 'PR') pool = inMonths(m, 6, (l) => l.channel === 'PR / press' && bOk(l));
      else if (c.category === 'Event / trade show' || c.category === 'Agent fam trip') pool = inMonths(m, 6, (l) => l.channel === 'Agent / B2B' && bOk(l));
      else if (c.category === 'Content production') pool = inMonths(m, 12, bOk);
      if (!pool.length) pool = inMonths(m, 1, bOk);
      if (!pool.length) pool = inMonths(m, 1, () => true);
      for (const l of pool) other.set(l.lead_id, (other.get(l.lead_id) || 0) + amt / pool.length);
    }
    return leads.map((l) => {
      const k = key(l.enquiry_date.slice(0, 7), l.campaign, l.country);
      const e = t(l.enquiry_date), d = t(l.departure_date), b = t(l.booking_date);
      // departure and first reply can be unknown (ERP leads): keep them null, not NaN or 0
      const e2d = l.departure_date ? Math.round((d - e) / DAY) : null;
      const booked = l.status === 'Booked' ? 1 : 0, cancelled = l.status === 'Cancelled' ? 1 : 0;
      const ad = cost.has(k) ? cost.get(k) / cnt.get(k) : 0, oc = other.get(l.lead_id) || 0;
      const en = l.enquiry_date, periods = [en.slice(0, 4)];
      if (en >= back(now, 90)) periods.push('L90');
      if (en >= back(now, 30)) periods.push('L30');
      if (en >= lyStart && en <= lyS) periods.push('YTD-LY');
      if (en >= back(ly.getTime(), 90) && en <= lyS) periods.push('L90-LY');
      if (en >= back(ly.getTime(), 30) && en <= lyS) periods.push('L30-LY');
      const nights = tripN.get(l.trip_id) || 0, cabins = Number(l.cabins);
      return {
        id: l.lead_id, enquiry: l.enquiry_date, month: l.enquiry_date.slice(0, 7), year: l.enquiry_date.slice(0, 4), moy: Number(l.enquiry_date.slice(5, 7)), periods,
        departure: l.departure_date, dep_month: l.departure_date.slice(0, 7), proposal_month: l.proposal_date.slice(0, 7), booking_month: l.booking_date.slice(0, 7), booking_date: l.booking_date,
        brand: l.brand, dest: l.destination, vtype: l.voyage_type, channel: l.channel, campaign: l.campaign, ctype: l.campaign_type, cta: l.cta,
        country: l.country, group: group(l.country), nationality: l.nationality, guest_type: l.guest_type,
        q: Number(l.qualified), r: Number(l.replied), p: Number(l.proposal), b: booked, c: cancelled, status: l.status, lost_reason: l.lost_reason, cancel_date: l.cancel_date,
        reply_h: l.first_reply_hours === '' ? null : Number(l.first_reply_hours), cabins: booked ? cabins : 0, value: booked ? Number(l.booking_value_usd) : 0, margin: booked ? Number(l.contribution_margin_usd) : 0, cvalue: cancelled ? Number(l.booking_value_usd) : 0,
        refund: Number(l.refund_usd), discount: Number(l.discount_usd), commission: Number(l.commission_usd), nights, cabin_nights: booked ? cabins * nights : 0,
        cost: ad, other: oc, tcost: ad + oc,
        e2d, window: e2d == null ? 'Unknown' : win(e2d), cycle: booked && l.booking_date ? Math.round((b - e) / DAY) : null, book_lt: booked && e2d != null && l.booking_date ? Math.round((d - b) / DAY) : null,
        sessions: Number(l.web_sessions), minutes: Number(l.site_minutes), social: Number(l.social_touches), email: Number(l.email_opens), whatsapp: Number(l.whatsapp_msgs),
        first_touch: l.first_touch, top_page: l.top_page, trip_id: l.trip_id, as_of: asOf,
        proposal_date: l.proposal_date, cancel_month: l.cancel_date ? l.cancel_date.slice(0, 7) : '',
        // agent-led enquiries against direct ones; marketing-attributed = came in through a marketing channel (not an agent, not direct or a referral)
        route: /agent|b2b/i.test(l.channel) ? 'Agent' : 'Direct', mkt: /agent|b2b|direct|referr/i.test(l.channel) ? 0 : 1,
      };
    });
  },
});

dash.calc('cube', {
  title: 'Funnel by brand, destination, voyage and period',
  description: 'Full marketing cost (ads plus other costs), funnel counts, unit costs, guest type, cancellations, discounts and commission for every combination of brand, destination, voyage type and enquiry period, with the change against the comparison period.',
  inputs: ['enriched'],
  fn: (enriched) => {
    const m = new Map();
    const r2 = (x) => (isFinite(x) ? Math.round(x * 100) / 100 : null);
    const r4 = (x) => (isFinite(x) ? Math.round(x * 10000) / 10000 : null);
    for (const l of enriched) {
      for (const b of ['All', l.brand]) for (const d of ['All', l.dest]) for (const v of ['All', l.vtype]) for (const y of ['All', ...l.periods]) {
        const k = [b, d, v, y].join('|');
        let a = m.get(k);
        if (!a) m.set(k, (a = { slice: k, brand: b, dest: d, vtype: v, period: y, spend: 0, ad_spend: 0, other_spend: 0, leads: 0, qualified: 0, replied: 0, proposals: 0, bookings: 0, cabins: 0, revenue: 0, margin: 0, open: 0,
          cancelled: 0, cancelled_value: 0, refunds: 0, discount: 0, commission: 0, cabin_nights: 0, new_b: 0, repeat_b: 0, referral_b: 0, new_v: 0, repeat_v: 0, referral_v: 0, mkt_bookings: 0, mkt_revenue: 0, reply: [] }));
        if (l.b && l.mkt) { a.mkt_bookings++; a.mkt_revenue += l.value; }
        a.spend += l.tcost; a.ad_spend += l.cost; a.other_spend += l.other; a.leads++; a.qualified += l.q; a.replied += l.r; a.proposals += l.p; a.bookings += l.b;
        a.cabins += l.cabins * l.b; a.revenue += l.value * l.b; a.margin += l.margin * l.b; a.open += l.status === 'Open' ? 1 : 0;
        a.cancelled += l.c; a.cancelled_value += l.cvalue; a.refunds += l.refund * l.c;
        if (l.b) { a.discount += l.discount; a.commission += l.commission; a.cabin_nights += l.cabin_nights; const g = l.guest_type === 'Repeat' ? 'repeat' : l.guest_type === 'Referral' ? 'referral' : 'new'; a[g + '_b']++; a[g + '_v'] += l.value; }
        if (l.q && l.reply_h != null) a.reply.push(l.reply_h);
      }
    }
    const PREV = { 2025: '2024', 2026: 'YTD-LY', L90: 'L90-LY', L30: 'L30-LY' };
    const rows = [...m.values()].map((a) => {
      const rs = a.reply.sort((x, y) => x - y);
      const out = { ...a, spend: r2(a.spend), ad_spend: r2(a.ad_spend), other_spend: r2(a.other_spend), revenue: r2(a.revenue), margin: r2(a.margin), cancelled_value: r2(a.cancelled_value), refunds: r2(a.refunds),
        mkt_revenue: r2(a.mkt_revenue), mkt_share: r4(a.mkt_revenue / a.revenue), mkt_roas: r2(a.mkt_revenue / a.spend),
        cpl: r2(a.spend / a.leads), cpql: r2(a.spend / a.qualified), cpp: r2(a.spend / a.proposals), cac: r2(a.spend / a.bookings),
        l2q: r4(a.qualified / a.leads), q2r: r4(a.replied / a.qualified), r2p: r4(a.proposals / a.replied), p2b: r4(a.bookings / a.proposals), l2b: r4(a.bookings / a.leads),
        roas: r2(a.revenue / a.spend), margin_roi: r2(a.margin / a.spend), avg_value: r2(a.revenue / a.bookings), cabins_per_booking: r2(a.cabins / a.bookings),
        cancel_rate: r4(a.cancelled / (a.bookings + a.cancelled)), discount_rate: r4(a.discount / (a.revenue + a.discount)), price_cn: r2(a.revenue / a.cabin_nights),
        returning_share: r4((a.repeat_b + a.referral_b) / a.bookings), repeat_cac: 0,
        reply_median: rs.length ? rs[Math.floor(rs.length / 2)] : null };
      delete out.reply;
      return out;
    });
    const by = new Map(rows.map((r) => [r.slice, r]));
    const ch = (x, y) => (x != null && y ? Math.round((x / y - 1) * 1000) / 1000 : null);
    return rows.map((r) => {
      const pp = PREV[r.period], p = pp ? by.get([r.brand, r.dest, r.vtype, pp].join('|')) : null;
      const o = { ...r };
      for (const f of ['leads', 'bookings', 'revenue', 'margin', 'spend', 'cpl', 'cac', 'qualified']) o['d_' + f] = p ? ch(r[f], p[f]) : null;
      return o;
    });
  },
});

dash.calc('channels', {
  title: 'Bookings by channel',
  description: 'Where each booking came from (Meta, Google, organic, email, PR, influencers, direct and referrals, agents), with full marketing cost and revenue, for every brand, destination, voyage type and period.',
  inputs: ['enriched'],
  fn: (enriched) => {
    const m = new Map(), tot = new Map();
    for (const l of enriched) for (const b of ['All', l.brand]) for (const d of ['All', l.dest]) for (const v of ['All', l.vtype]) for (const y of ['All', ...l.periods]) {
      const s = [b, d, v, y].join('|'), k = s + '|' + l.channel;
      let a = m.get(k);
      if (!a) m.set(k, (a = { key: k, slice: s, channel: l.channel, spend: 0, ad_spend: 0, leads: 0, qualified: 0, bookings: 0, revenue: 0, margin: 0 }));
      a.spend += l.tcost; a.ad_spend += l.cost; a.leads++; a.qualified += l.q; a.bookings += l.b; a.revenue += l.value * l.b; a.margin += l.margin * l.b;
      tot.set(s, (tot.get(s) || 0) + l.b);
    }
    const r2 = (x) => (isFinite(x) ? Math.round(x * 100) / 100 : null);
    return [...m.values()].map((a) => ({ ...a, spend: r2(a.spend), ad_spend: r2(a.ad_spend), revenue: r2(a.revenue), margin: r2(a.margin),
      cpl: a.spend ? r2(a.spend / a.leads) : null, cac: a.spend && a.bookings ? r2(a.spend / a.bookings) : null, roas: a.spend >= 1 ? r2(a.revenue / a.spend) : null,
      l2b: r2((a.bookings / a.leads) * 10000) / 10000, share: tot.get(a.slice) ? Math.round((a.bookings / tot.get(a.slice)) * 10000) / 10000 : 0 }));
  },
});

dash.calc('monthly', {
  title: 'Monthly leads, cost and bookings',
  description: 'Per enquiry month: spend, leads, CPL, qualified leads and the bookings those leads became, by brand, destination and voyage type.',
  inputs: ['enriched'],
  fn: (enriched) => {
    const m = new Map();
    for (const l of enriched) for (const b of ['All', l.brand]) for (const d of ['All', l.dest]) for (const v of ['All', l.vtype]) {
      const s = [b, d, v].join('|'), k = s + '|' + l.month;
      let a = m.get(k);
      if (!a) m.set(k, (a = { key: k, slice: s, month: l.month, spend: 0, leads: 0, qualified: 0, proposals: 0, bookings: 0, revenue: 0 }));
      a.spend += l.cost; a.leads++; a.qualified += l.q; a.proposals += l.p; a.bookings += l.b; a.revenue += l.value;
    }
    return [...m.values()].sort((a, b) => (a.month < b.month ? -1 : 1)).map((a) => ({ ...a, spend: Math.round(a.spend * 100) / 100, revenue: Math.round(a.revenue),
      cpl: a.leads && a.spend ? Math.round((a.spend / a.leads) * 100) / 100 : null }));
  },
});

dash.calc('season', {
  title: 'Seasonality by calendar month',
  description: 'For each calendar month: average leads, CPL and its index against the yearly average (1.00 = average), bookings made, and departures booked, across 2024–2026.',
  inputs: ['enriched'],
  fn: (enriched) => {
    const m = new Map();
    const get = (s, moy) => { const k = s + '|' + moy; let a = m.get(k); if (!a) m.set(k, (a = { key: k, slice: s, moy, spend: 0, leads: 0, paid_leads: 0, bookings_made: 0, departures: 0, dep_cabins: 0, months: new Set() })); return a; };
    for (const l of enriched) for (const b of ['All', l.brand]) for (const d of ['All', l.dest]) for (const v of ['All', l.vtype]) {
      const s = [b, d, v].join('|');
      const a = get(s, l.moy); a.spend += l.cost; a.leads++; if (l.cost > 0) a.paid_leads++; a.months.add(l.month);
      if (l.b) { get(s, Number(l.booking_month.slice(5, 7))).bookings_made++; if (l.dep_month) { const dd = get(s, Number(l.dep_month.slice(5, 7))); dd.departures++; dd.dep_cabins += l.cabins; } }
    }
    const rows = [...m.values()];
    const avg = new Map();
    for (const a of rows) { const v = avg.get(a.slice) || { s: 0, n: 0 }; v.s += a.spend; v.n += a.paid_leads; avg.set(a.slice, v); }
    return rows.map((a) => {
      const yrs = Math.max(1, a.months.size), base = avg.get(a.slice), cpl = a.paid_leads ? a.spend / a.paid_leads : null;
      return { key: a.key, slice: a.slice, moy: a.moy, avg_leads: Math.round(a.leads / yrs), cpl: cpl == null ? null : Math.round(cpl * 100) / 100,
        cpl_index: cpl == null || !base.n ? null : Math.round((cpl / (base.s / base.n)) * 100) / 100,
        bookings_made: a.bookings_made, departures_booked: a.departures, cabins_departing: a.dep_cabins };
    }).sort((a, b) => a.moy - b.moy);
  },
});

dash.calc('campaigns', {
  title: 'Campaign results and diagnosis',
  description: 'Each campaign, press piece and influencer from first click or article to booking, with full cost (ads plus its share of other marketing costs), its share of revenue for its best month and its year, and the funnel stage where it trails its channel\'s median.',
  inputs: ['enriched', 'spend'],
  fn: (enriched, spend) => {
    const m = new Map(), revM = new Map(), revY = new Map();
    const get = (c) => { let a = m.get(c); if (!a) m.set(c, (a = { campaign: c, channel: '', ctype: '', brand: '', dest: new Map(), years: new Map(), impressions: 0, clicks: 0, spend: 0, ad: 0, leads: 0, qualified: 0, replied: 0, proposals: 0, bookings: 0, open: 0, lost: 0, cabins: 0, revenue: 0, margin: 0, reply: [], bm: new Map(), first: '9999', last: '' })); return a; };
    for (const s of spend) { const a = get(s.campaign); a.impressions += Number(s.impressions); a.clicks += Number(s.clicks); }
    for (const l of enriched) {
      const a = get(l.campaign);
      a.channel = l.channel; a.ctype = l.ctype; a.brand = a.brand && a.brand !== l.brand ? 'Mixed' : l.brand;
      a.dest.set(l.dest, (a.dest.get(l.dest) || 0) + 1); a.years.set(l.year, (a.years.get(l.year) || 0) + 1);
      a.spend += l.tcost; a.ad += l.cost; a.leads++; a.qualified += l.q; a.replied += l.r; a.proposals += l.p; a.bookings += l.b; a.cabins += l.cabins;
      a.revenue += l.value; a.margin += l.margin; a.open += l.status === 'Open' ? 1 : 0; a.lost += l.status === 'Lost' ? 1 : 0;
      if (l.q && l.reply_h != null) a.reply.push(l.reply_h);
      if (l.month < a.first) a.first = l.month; if (l.month > a.last) a.last = l.month;
      if (l.b) { a.bm.set(l.booking_month, (a.bm.get(l.booking_month) || 0) + l.value); revM.set(l.booking_month, (revM.get(l.booking_month) || 0) + l.value); revY.set(l.booking_month.slice(0, 4), (revY.get(l.booking_month.slice(0, 4)) || 0) + l.value); }
    }
    const top = (mp) => [...mp.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || '';
    const r2 = (x) => (isFinite(x) ? Math.round(x * 100) / 100 : null), r4 = (x) => (isFinite(x) ? Math.round(x * 10000) / 10000 : null);
    const rows = [...m.values()].map((a) => {
      const rs = a.reply.sort((x, y) => x - y), tm = top(a.bm), yr = tm ? tm.slice(0, 4) : top(a.years);
      return { campaign: a.campaign, channel: a.channel, ctype: a.ctype, brand: a.brand, dest: top(a.dest), year: top(a.years), first: a.first, last: a.last,
        impressions: a.impressions, clicks: a.clicks, ctr: a.impressions ? r4(a.clicks / a.impressions) : null, cpc: a.clicks ? r2(a.ad / a.clicks) : null, click_to_lead: a.clicks ? r4(a.leads / a.clicks) : null,
        spend: r2(a.spend), leads: a.leads, qualified: a.qualified, replied: a.replied, proposals: a.proposals, bookings: a.bookings, open: a.open, lost: a.lost, cabins: a.cabins,
        revenue: r2(a.revenue), margin: r2(a.margin), cpl: a.spend ? r2(a.spend / a.leads) : null, cpql: a.spend && a.qualified ? r2(a.spend / a.qualified) : null,
        cac: a.spend && a.bookings ? r2(a.spend / a.bookings) : null, l2q: r4(a.qualified / a.leads), q2r: a.qualified ? r4(a.replied / a.qualified) : null,
        p2b: a.proposals ? r4(a.bookings / a.proposals) : null, roas: a.spend ? r2(a.revenue / a.spend) : null, reply_median: rs.length ? rs[Math.floor(rs.length / 2)] : null,
        top_month: tm, share_month: tm ? r4(a.bm.get(tm) / revM.get(tm)) : 0, share_year: yr && revY.get(yr) ? r4(a.revenue / revY.get(yr)) : 0, share_year_label: yr };
    });
    // diagnosis against channel medians
    const med = (arr) => { const s = arr.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
    const bench = new Map();
    for (const ch of new Set(rows.map((r) => r.channel))) {
      const rr = rows.filter((r) => r.channel === ch && r.leads >= 15);
      bench.set(ch, Object.fromEntries(['ctr', 'cpc', 'click_to_lead', 'cpl', 'l2q', 'q2r', 'p2b', 'reply_median'].map((k) => [k, med(rr.map((r) => r[k]))])));
    }
    return rows.map((r) => {
      const b = bench.get(r.channel), notes = [];
      if (r.leads < 15) notes.push('Too few leads to judge');
      else {
        if (b.ctr && r.ctr != null && r.ctr < b.ctr * 0.8) notes.push('Low click-through: creative or targeting');
        if (b.cpc && r.cpc != null && r.cpc > b.cpc * 1.25) notes.push('Expensive clicks: competitive audience or bid');
        if (b.click_to_lead && r.click_to_lead != null && r.click_to_lead < b.click_to_lead * 0.8) notes.push('Weak landing page or form conversion');
        if (b.l2q && r.l2q < b.l2q * 0.8) notes.push('Low lead quality: targeting or form too easy');
        if (b.q2r && r.q2r != null && r.q2r < b.q2r * 0.85) notes.push('Qualified leads not replying: follow-up');
        if (b.reply_median && r.reply_median != null && r.reply_median > Math.max(3, b.reply_median * 1.5)) notes.push('Slow first reply');
        if (b.p2b && r.p2b != null && r.proposals >= 8 && r.p2b < b.p2b * 0.75) notes.push('Proposals not closing: sales or price');
      }
      return { ...r, diagnosis: notes.length ? notes.join('; ') : 'In line with channel' };
    });
  },
});

dash.calc('markets', {
  title: 'Booking behaviour by market',
  description: 'For each country of residence (Singapore and Hong Kong also split into locals and European expats): cost, conversion, how far ahead they enquire and book, and when to start campaigning.',
  inputs: ['enriched'],
  fn: (enriched) => {
    const m = new Map();
    const q = (s, p) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null);
    const add = (k, brand, seg, l) => {
      let a = m.get(k);
      if (!a) m.set(k, (a = { key: k, brand, segment: seg, spend: 0, paid: 0, leads: 0, proposals: 0, bookings: 0, revenue: 0, e2d: [], blt: [], cyc: [], known: 0, lm_leads: 0, lm_bookings: 0 }));
      a.spend += l.cost; a.paid += l.cost > 0 ? 1 : 0; a.leads++; a.proposals += l.p; a.bookings += l.b; a.revenue += l.value;
      if (l.e2d != null) { a.e2d.push(l.e2d); a.known++; if (l.e2d <= 60) { a.lm_leads++; a.lm_bookings += l.b; } }
      if (l.b && l.book_lt != null) a.blt.push(l.book_lt);
      if (l.b && l.cycle != null) a.cyc.push(l.cycle);
    };
    for (const l of enriched) for (const b of ['All', l.brand]) {
      add(b + '|All markets', b, 'All markets', l);
      add(b + '|' + l.country, b, l.country, l);
      if (l.group === 'Europe') add(b + '|Europe (all)', b, 'Europe (all)', l);
      if (l.country === 'Singapore' || l.country === 'Hong Kong') add(b + '|' + l.country + ' · ' + (l.nationality === 'European expat' ? 'European expats' : 'locals & others'), b, l.country + ' · ' + (l.nationality === 'European expat' ? 'European expats' : 'locals & others'), l);
    }
    const r2 = (x) => (isFinite(x) ? Math.round(x * 100) / 100 : null);
    return [...m.values()].map((a) => {
      const e = a.e2d.sort((x, y) => x - y), bl = a.blt.sort((x, y) => x - y), c = a.cyc.sort((x, y) => x - y);
      const p75 = q(e, 0.75);
      return { key: a.key, brand: a.brand, segment: a.segment, leads: a.leads, bookings: a.bookings, revenue: Math.round(a.revenue),
        cpl: a.paid ? r2(a.spend / a.paid) : null, cac: a.bookings ? r2(a.spend / a.bookings) : null,
        p2b: a.proposals ? Math.round((a.bookings / a.proposals) * 10000) / 10000 : null, l2b: Math.round((a.bookings / a.leads) * 10000) / 10000,
        e2d_p25: q(e, 0.25), e2d_median: q(e, 0.5), e2d_p75: p75, book_lt_median: q(bl, 0.5), cycle_median: q(c, 0.5),
        lm_share: a.known ? Math.round((a.lm_leads / a.known) * 10000) / 10000 : null, lm_bookings: a.lm_bookings,
        start_days: p75 == null ? null : Math.ceil((p75 + 14) / 7) * 7 };
    });
  },
});

dash.calc('lastminute', {
  title: 'Last-minute enquiries by call to action',
  description: 'Enquiries for a departure 60 days away or less, by how they contacted us (WhatsApp, landing page, instant form…), with cost and conversion.',
  inputs: ['enriched'],
  fn: (enriched) => {
    const m = new Map();
    for (const l of enriched) {
      if (l.e2d == null || l.e2d > 60 || !['Meta Ads', 'Google Ads'].includes(l.channel)) continue;
      for (const b of ['All', l.brand]) {
        const k = b + '|' + l.cta;
        let a = m.get(k);
        if (!a) m.set(k, (a = { key: k, brand: b, cta: l.cta, spend: 0, leads: 0, qualified: 0, proposals: 0, bookings: 0, revenue: 0, cyc: [] }));
        a.spend += l.cost; a.leads++; a.qualified += l.q; a.proposals += l.p; a.bookings += l.b; a.revenue += l.value; if (l.b) a.cyc.push(l.cycle);
      }
    }
    const r2 = (x) => (isFinite(x) ? Math.round(x * 100) / 100 : null), r4 = (x) => (isFinite(x) ? Math.round(x * 10000) / 10000 : null);
    return [...m.values()].map((a) => { const c = a.cyc.sort((x, y) => x - y);
      return { key: a.key, brand: a.brand, cta: a.cta, spend: r2(a.spend), leads: a.leads, qualified: a.qualified, proposals: a.proposals, bookings: a.bookings, revenue: Math.round(a.revenue),
        cpl: r2(a.spend / a.leads), cac: a.bookings ? r2(a.spend / a.bookings) : null, l2q: r4(a.qualified / a.leads), p2b: a.proposals ? r4(a.bookings / a.proposals) : null,
        l2b: r4(a.bookings / a.leads), cycle_median: c.length ? c[Math.floor(c.length / 2)] : null }; });
  },
});

dash.calc('rates', {
  title: 'Planner rates by brand, market and booking window',
  description: 'Historical CPL range, conversion at each funnel stage, cabins per booking, value, margin and how quickly bookings close, for each brand, market group and enquiry-to-departure window. Paid leads only for CPL.',
  inputs: ['enriched'],
  fn: (enriched) => {
    const m = new Map();
    for (const l of enriched) for (const b of ['All', l.brand]) for (const g of ['All', l.group]) for (const w of ['All', l.window]) {
      const k = [b, g, w].join('|');
      let a = m.get(k);
      if (!a) m.set(k, (a = { key: k, brand: b, group: g, window: w, leads: 0, paid: 0, spend: 0, qualified: 0, proposals: 0, bookings: 0, cabins: 0, revenue: 0, margin: 0, cyc: [], mon: new Map() }));
      a.leads++; a.qualified += l.q; a.proposals += l.p; a.bookings += l.b; a.cabins += l.cabins; a.revenue += l.value; a.margin += l.margin;
      if (l.cost > 0) { a.paid++; a.spend += l.cost; const v = a.mon.get(l.month) || [0, 0]; v[0] += l.cost; v[1]++; a.mon.set(l.month, v); }
      if (l.b) a.cyc.push(l.cycle);
    }
    const r2 = (x) => (isFinite(x) ? Math.round(x * 100) / 100 : null), r4 = (x) => (isFinite(x) ? Math.round(x * 10000) / 10000 : null);
    return [...m.values()].map((a) => {
      const mc = [...a.mon.values()].filter((v) => v[1] >= 3).map((v) => v[0] / v[1]).sort((x, y) => x - y);
      const pct = (p) => (mc.length ? mc[Math.min(mc.length - 1, Math.floor(p * mc.length))] : null);
      const c = a.cyc, within = (d) => (c.length ? r4(c.filter((x) => x <= d).length / c.length) : null);
      const cs = [...c].sort((x, y) => x - y);
      return { key: a.key, brand: a.brand, group: a.group, window: a.window, leads: a.leads, paid_leads: a.paid, bookings: a.bookings,
        cpl: a.paid ? r2(a.spend / a.paid) : null, cpl_low: r2(pct(0.25)), cpl_high: r2(pct(0.75)),
        l2q: r4(a.qualified / a.leads), q2p: a.qualified ? r4(a.proposals / a.qualified) : null, p2b: a.proposals ? r4(a.bookings / a.proposals) : null,
        cabins_per_booking: a.bookings ? r2(a.cabins / a.bookings) : null, value: a.bookings ? Math.round(a.revenue / a.bookings) : null, margin: a.bookings ? Math.round(a.margin / a.bookings) : null,
        cycle_median: cs.length ? cs[Math.floor(cs.length / 2)] : null, close_14: within(14), close_30: within(30), close_45: within(45), close_60: within(60), close_90: within(90) };
    });
  },
});

dash.calc('pace', {
  title: 'Booking pace for upcoming departures',
  description: 'For each brand and departure month ahead: cabins sold against where past departures of the same month stood at the same number of days out, warm conversations, and the date a campaign should be live.',
  inputs: ['enriched', 'trips'],
  fn: (enriched, trips) => {
    const DAY = 864e5, t = (s) => Date.parse(s + 'T00:00:00Z');
    const asOf = enriched.reduce((m, l) => (l.enquiry > m ? l.enquiry : m), '');
    const now = t(asOf);
    const brands = ['All', ...new Set(trips.map((x) => x.brand))];
    // capacity per brand x departure month
    const cap = new Map();
    for (const x of trips) for (const b of ['All', x.brand]) { const k = b + '|' + x.departure_date.slice(0, 7); cap.set(k, (cap.get(k) || 0) + Number(x.cabins)); }
    // past departures: final occupancy by calendar month, and booking curve (share of cabins booked >= d days out)
    const sold = new Map(), lts = new Map(), warm = new Map(), warmP = new Map(), mkts = new Map();
    for (const l of enriched) {
      if (!l.dep_month) continue;
      for (const b of ['All', l.brand]) {
        const k = b + '|' + l.dep_month;
        if (l.b) { sold.set(k, (sold.get(k) || 0) + l.cabins); if (l.departure < asOf && l.book_lt != null) { const a = lts.get(b) || []; for (let i = 0; i < l.cabins; i++) a.push(l.book_lt); lts.set(b, a); } }
        if (l.status === 'Open' || (l.status === 'No reply' && (now - t(l.enquiry)) / DAY <= 45)) { warm.set(k, (warm.get(k) || 0) + 1); if (l.p) warmP.set(k, (warmP.get(k) || 0) + 1); }
      }
      if (l.departure < asOf) { const a = mkts.get(l.brand) || []; a.push(l.e2d); mkts.set(l.brand, a); const z = mkts.get('All') || []; z.push(l.e2d); mkts.set('All', z); }
    }
    const occ = new Map();
    for (const [k, c] of cap) { const [b, mo] = k.split('|'); if (mo + '-28' >= asOf || mo < '2024-03') continue; const key = b + '|' + mo.slice(5); const v = occ.get(key) || [0, 0]; v[0] += sold.get(k) || 0; v[1] += c; occ.set(key, v); }
    const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
    const rows = [];
    for (const b of brands) {
      const curve = (lts.get(b) || []).sort((x, y) => x - y), n = curve.length;
      const e = (mkts.get(b) || []).sort((x, y) => x - y), p75 = e.length ? e[Math.floor(e.length * 0.75)] : 150;
      for (let i = 1; i <= 14; i++) {
        const d = new Date(now); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + i);
        const mo = d.toISOString().slice(0, 7), k = b + '|' + mo, total = cap.get(k) || 0;
        if (!total) continue;
        const mid = t(mo + '-15'), daysOut = Math.round((mid - now) / DAY);
        const bookedBy = n ? curve.filter((x) => x >= daysOut).length / n : 0; // share of final cabins usually sold by now
        const o = occ.get(b + '|' + mo.slice(5)); const hist = o && o[1] ? o[0] / o[1] : null;
        const s = sold.get(k) || 0, expected = hist == null ? null : total * hist * bookedBy;
        const paceIdx = expected ? s / expected : null;
        const projected = hist == null ? null : Math.min(total, s + total * hist * (1 - bookedBy));
        const pushBy = mid - p75 * DAY;
        let status = 'On track';
        const short = expected == null ? 0 : expected - s;
        if (paceIdx != null && paceIdx < 0.7 && short >= 2) status = 'Behind: push now';
        else if (paceIdx != null && paceIdx < 0.9 && short >= 1) status = 'Watch';
        if (status === 'On track' && hist != null && hist >= 0.7) status = 'Peak: fills naturally';
        if (status === 'On track' && pushBy > now && bookedBy < 0.25) status = 'Early: plan campaign';
        rows.push({ key: k, brand: b, dep_month: mo, days_out: daysOut, cabins_total: total, cabins_sold: s, cabins_left: total - s,
          occupancy: Math.round((s / total) * 1000) / 1000, hist_final_occ: hist == null ? null : Math.round(hist * 1000) / 1000,
          expected_now: expected == null ? null : Math.round(expected * 10) / 10, pace_index: paceIdx == null ? null : Math.round(paceIdx * 100) / 100,
          projected_final: projected == null ? null : Math.round(projected), projected_gap: projected == null ? null : Math.max(0, Math.round(total * Math.min(1, (hist || 0) + 0.15) - projected)),
          warm_conversations: warm.get(k) || 0, open_proposals: warmP.get(k) || 0, push_by: fmt(pushBy), status });
      }
    }
    return rows;
  },
});

dash.calc('speed', {
  title: 'Reply speed and booking',
  description: 'Qualified leads grouped by how many hours our first reply took, with the share that booked and the share lost to another yacht.',
  inputs: ['enriched'],
  fn: (enriched) => {
    const buckets = ['Under 1 h', '1–3 h', '3–8 h', '8–24 h', 'Over 24 h'];
    const bk = (h) => (h < 1 ? 0 : h < 3 ? 1 : h < 8 ? 2 : h < 24 ? 3 : 4);
    const m = new Map();
    for (const l of enriched) { if (!l.q || l.status === 'Open' || l.reply_h == null) continue;
      for (const b of ['All', l.brand]) { const k = b + '|' + buckets[bk(l.reply_h)];
        let a = m.get(k); if (!a) m.set(k, (a = { key: k, brand: b, bucket: buckets[bk(l.reply_h)], order: bk(l.reply_h), qualified: 0, bookings: 0, lost_competitor: 0, lost: 0 }));
        a.qualified++; a.bookings += l.b; a.lost += l.status === 'Lost' || l.status === 'No reply' ? 1 : 0; a.lost_competitor += l.lost_reason === 'Booked another yacht' ? 1 : 0; } }
    return [...m.values()].sort((a, b) => a.order - b.order).map((a) => ({ ...a, booking_rate: Math.round((a.bookings / a.qualified) * 10000) / 10000, competitor_rate: Math.round((a.lost_competitor / a.qualified) * 10000) / 10000 }));
  },
});

dash.calc('health', {
  title: 'Marketing delivery vs sales conversion by month',
  description: 'Qualified leads per month against the qualified-lead target in the targets file, proposal-to-booking rate of proposals sent that month against the 12 months before, and median reply time.',
  inputs: ['enriched', 'targets'],
  fn: (enriched, targets) => {
    const tq = new Map();
    for (const x of targets) { if (x.qualified_target === '' || x.qualified_target == null) continue; const v = Number(x.qualified_target); for (const b of ['All', x.brand]) tq.set(b + '|' + x.month, (tq.get(b + '|' + x.month) || 0) + v); }
    const m = new Map();
    const get = (b, mo) => { const k = b + '|' + mo; let a = m.get(k); if (!a) m.set(k, (a = { key: k, brand: b, month: mo, qualified: 0, proposals: 0, booked: 0, lost: 0, open: 0, reply: [] })); return a; };
    for (const l of enriched) for (const b of ['All', l.brand]) {
      const a = get(b, l.month); a.qualified += l.q; if (l.q && l.reply_h != null) a.reply.push(l.reply_h);
      if (l.p) { const p = get(b, l.proposal_month); p.proposals++; if (l.b) p.booked++; else if (l.status === 'Open') p.open++; else p.lost++; }
    }
    const rows = [...m.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
    const by = new Map(rows.map((r) => [r.key, r]));
    const prev = (mo, k) => { const d = new Date(mo + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - k); return d.toISOString().slice(0, 7); };
    return rows.map((r) => {
      let pb = 0, pp = 0;
      for (let i = 1; i <= 12; i++) { const x = by.get(r.brand + '|' + prev(r.month, i)); if (x) { pb += x.booked; pp += x.booked + x.lost; } }
      const resolved = r.booked + r.lost, rs = r.reply.sort((x, y) => x - y);
      const p2b = resolved ? r.booked / resolved : null, base = pp ? pb / pp : null, plan = tq.has(r.key) ? Math.round(tq.get(r.key)) : null;
      const maturing = r.proposals ? r.open / r.proposals > 0.3 : false;
      let flag = '';
      if (plan && p2b != null && base && !maturing) {
        const mk = r.qualified >= plan * 0.9, sl = p2b < base * 0.8;
        flag = mk && sl ? 'Marketing on plan, sales conversion down' : !mk && sl ? 'Both below' : !mk ? 'Lead volume below plan' : 'Healthy';
      } else if (maturing) flag = 'Proposals still open';
      return { key: r.key, brand: r.brand, month: r.month, qualified: r.qualified, plan_qualified: plan, proposals: r.proposals, booked: r.booked, lost: r.lost, open: r.open,
        p2b: p2b == null ? null : Math.round(p2b * 10000) / 10000, p2b_baseline: base == null ? null : Math.round(base * 10000) / 10000,
        reply_median: rs.length ? rs[Math.floor(rs.length / 2)] : null, flag };
    });
  },
});

dash.calc('journey', {
  title: 'Guest journey before enquiry and booking',
  description: 'Average website sessions, minutes on site, social, email and WhatsApp touches for leads who booked against qualified leads who did not, the page each spent most time on, and first-touch-to-enquiry paths, for all guests and for each segment: brand, voyage type, new or returning guest, direct or agent, and market.',
  inputs: ['enriched'],
  fn: (enriched) => {
    const fields = [['sessions', 'Website sessions'], ['minutes', 'Minutes on website'], ['social', 'Social media touches'], ['email', 'Emails opened'], ['whatsapp', 'WhatsApp messages']];
    const done = enriched.filter((l) => l.status !== 'Open');
    const segs = new Map();
    for (const l of done) {
      const gt = l.guest_type === 'Repeat' || l.guest_type === 'Referral' ? 'Returning or referred' : 'New';
      for (const s of ['All guests', 'Brand: ' + l.brand, 'Voyage: ' + l.vtype, 'Guest: ' + gt, 'Route: ' + l.route, 'Market: ' + l.group]) { if (!segs.has(s)) segs.set(s, []); segs.get(s).push(l); }
    }
    const avg = (arr, f) => arr.reduce((s, l) => s + l[f], 0) / Math.max(1, arr.length);
    const rows = [];
    for (const [seg, ls] of segs) {
      const bk = ls.filter((l) => l.b), nb = ls.filter((l) => !l.b && l.q);
      rows.push({ key: seg + '|size', seg, kind: 'size', label: 'Leads compared', booked: bk.length, not_booked: nb.length, ratio: null });
      for (const [f, label] of fields) { const a = avg(bk, f), b = avg(nb, f); rows.push({ key: seg + '|metric|' + f, seg, kind: 'metric', label, booked: Math.round(a * 10) / 10, not_booked: Math.round(b * 10) / 10, ratio: b ? Math.round((a / b) * 100) / 100 : null }); }
      for (const p of new Set(ls.map((l) => l.top_page))) { const a = bk.filter((l) => l.top_page === p).length / Math.max(1, bk.length), b = nb.filter((l) => l.top_page === p).length / Math.max(1, nb.length);
        rows.push({ key: seg + '|page|' + p, seg, kind: 'page', label: p, booked: Math.round(a * 1000) / 1000, not_booked: Math.round(b * 1000) / 1000, ratio: b ? Math.round((a / b) * 100) / 100 : null }); }
      const paths = new Map();
      for (const l of bk) { const k = (l.first_touch || 'Unknown') + ' → ' + l.channel; const v = paths.get(k) || [0, 0]; v[0]++; v[1] += l.value; paths.set(k, v); }
      for (const [k, v] of paths) rows.push({ key: seg + '|path|' + k, seg, kind: 'path', label: k, booked: v[0], not_booked: null, ratio: Math.round(v[1]) });
    }
    return rows;
  },
});

dash.calc('lost', {
  title: 'Why qualified leads were lost',
  description: 'Reasons sales recorded for lost qualified leads, by brand, each placed where the problem shows up: a commercial constraint (price, dates, yacht or destination fit, a competitor), sales follow-up (the guest stopped replying, not enough information), the guest\'s own timing (postponed), or unknown. A blank reason counts as unknown rather than being guessed.',
  inputs: ['enriched'],
  fn: (enriched) => {
    const GROUP = (r) => (/price|budget|unavailable|dates|another yacht|competitor|unsuitable|mismatch|size/i.test(r) ? 'Commercial constraint' : /no response|information|follow/i.test(r) ? 'Sales follow-up' : /postpon/i.test(r) ? 'Guest timing' : 'Unknown');
    const m = new Map(), tot = new Map();
    for (const l of enriched) { if (l.status !== 'Lost') continue; const reason = l.lost_reason || 'Unknown reason';
      for (const b of ['All', l.brand]) { const k = b + '|' + reason; m.set(k, (m.get(k) || 0) + 1); tot.set(b, (tot.get(b) || 0) + 1); } }
    return [...m.entries()].map(([k, n]) => { const [brand, reason] = k.split('|'); return { key: k, brand, reason, group: GROUP(reason), lost: n, share: Math.round((n / tot.get(brand)) * 10000) / 10000 }; }).sort((a, b) => b.lost - a.lost);
  },
});

dash.calc('yearly', {
  title: 'Revenue and budget against targets',
  description: 'For each brand and departure year: revenue target, revenue already booked (cancellations excluded), how much of the year was usually booked by this date, revenue from new guests through marketing channels, marketing budget (from the budget file) and what was spent. Shared costs are split between brands by their share of ad spend that month.',
  inputs: ['enriched', 'targets', 'spend', 'costs', 'budget'],
  fn: (enriched, targets, spend, costs, budget) => {
    const asOf = enriched.reduce((m, l) => (l.enquiry > m ? l.enquiry : m), '');
    const lyDate = String(Number(asOf.slice(0, 4)) - 1) + asOf.slice(4);
    const brands = [...new Set(targets.map((x) => x.brand))];
    const adM = new Map();
    for (const s of spend) { for (const b of ['All', s.brand]) adM.set(b + '|' + s.month, (adM.get(b + '|' + s.month) || 0) + Number(s.spend_usd)); }
    let adAll = 0; const adB = new Map();
    for (const s of spend) { adAll += Number(s.spend_usd); adB.set(s.brand, (adB.get(s.brand) || 0) + Number(s.spend_usd)); }
    const share = (b, m) => (b === 'All' ? 1 : adM.get('All|' + m) ? (adM.get(b + '|' + m) || 0) / adM.get('All|' + m) : (adB.get(b) || 0) / adAll);
    const rows = [];
    for (const Y of ['2025', '2026', '2027']) for (const b of ['All', ...brands]) {
      const tg = targets.filter((x) => x.month.startsWith(Y) && (b === 'All' || x.brand === b));
      const sum = (arr, f) => arr.reduce((s, x) => s + Number(x[f] || 0), 0);
      const mine = enriched.filter((l) => b === 'All' || l.brand === b);
      const dep = mine.filter((l) => l.b && l.departure.startsWith(Y));
      const prev = mine.filter((l) => l.b && l.departure.startsWith(String(Number(Y) - 1)));
      const prevAll = prev.reduce((s, l) => s + l.value, 0), prevEarly = prev.filter((l) => l.booking_date <= lyDate).reduce((s, l) => s + l.value, 0);
      const usual = prevAll ? prevEarly / prevAll : null;
      const revT = sum(tg, 'revenue_target_usd'), rev = dep.reduce((s, l) => s + l.value, 0);
      const mkt = dep.filter((l) => l.channel !== 'Agent / B2B' && l.guest_type === 'New').reduce((s, l) => s + l.value, 0);
      const canc = mine.filter((l) => l.c && l.departure.startsWith(Y)).reduce((s, l) => s + l.cvalue, 0);
      const bookedInYear = mine.filter((l) => l.b && l.booking_date.startsWith(Y)).reduce((s, l) => s + l.value, 0);
      let spent = 0, committed = 0, ads = 0;
      for (const s of spend) if (s.month.startsWith(Y) && (b === 'All' || s.brand === b)) { spent += Number(s.spend_usd); ads += Number(s.spend_usd); }
      for (const c of costs) {
        if (!c.date.startsWith(Y)) continue;
        const amt = (Number(c.cash_usd) + Number(c.operational_usd)) * (c.brand === 'All brands' ? share(b, c.date.slice(0, 7)) : b === 'All' || c.brand === b ? 1 : 0);
        if (c.status === 'Paid') spent += amt; else committed += amt;
      }
      const bg = budget.filter((x) => x.month.startsWith(Y) && (b === 'All' || x.brand === b));
      const budgetY = sum(bg, 'budget_usd'), budgetToDate = sum(bg.filter((x) => x.month <= asOf.slice(0, 7)), 'budget_usd');
      const r = (x) => Math.round(x);
      rows.push({ key: b + '|' + Y, brand: b, year: Y, rev_target: r(revT), rev_booked: r(rev), rev_pct: revT ? Math.round((rev / revT) * 1000) / 1000 : null,
        usual_pct: usual == null ? null : Math.round(usual * 1000) / 1000, expected_now: usual == null ? null : r(revT * usual), rev_gap: r(revT - rev),
        rev_marketing: r(mkt), mkt_share: rev ? Math.round((mkt / rev) * 1000) / 1000 : null, rev_cancelled: r(canc),
        cabins_target: r(sum(tg, 'cabins_target')), cabins_sold: dep.reduce((s, l) => s + l.cabins, 0),
        budget: r(budgetY), budget_to_date: r(budgetToDate), spent: r(spent), ads: r(ads), other: r(spent - ads), committed: r(committed),
        spent_pct: budgetY ? Math.round((spent / budgetY) * 1000) / 1000 : null, booked_in_year: r(bookedInYear),
        cost_ratio: bookedInYear ? Math.round((spent / bookedInYear) * 1000) / 1000 : null, as_of: asOf });
    }
    return rows;
  },
});

dash.calc('coverage', {
  title: 'Inventory coverage by departure',
  description: 'Every departure in the next 15 months: cabins sold, where past departures of the same destination and month stood at this many days out, how full they usually end, warm conversations, which campaigns, press and influencer activity aim at it, and whether it needs marketing.',
  inputs: ['enriched', 'trips', 'calendar'],
  fn: (enriched, trips, calendar) => {
    const DAY = 864e5, t = (s) => Date.parse(s + 'T00:00:00Z');
    const asOf = enriched.reduce((m, l) => (l.enquiry > m ? l.enquiry : m), ''), now = t(asOf);
    const sold = new Map();
    for (const l of enriched) if (l.b) sold.set(l.trip_id, (sold.get(l.trip_id) || 0) + l.cabins);
    const occ = new Map();
    for (const x of trips) { if (x.departure_date >= asOf) continue; const k = x.destination + '|' + x.departure_date.slice(5, 7); const v = occ.get(k) || [0, 0]; v[0] += Math.min(Number(x.cabins), sold.get(x.trip_id) || 0); v[1] += Number(x.cabins); occ.set(k, v); }
    const curve = new Map(), e2d = new Map();
    for (const l of enriched) {
      if (!l.departure || l.departure >= asOf) continue;
      if (l.b && l.book_lt != null) { const a = curve.get(l.dest) || []; for (let i = 0; i < l.cabins; i++) a.push(l.book_lt); curve.set(l.dest, a); }
      const z = e2d.get(l.dest) || []; z.push(l.e2d); e2d.set(l.dest, z);
    }
    for (const a of [...curve.values(), ...e2d.values()]) a.sort((x, y) => x - y);
    // warm conversations: open enquiries, or recent ones still waiting, matched to the nearest departure of the same yacht and destination (within 21 days)
    const tripsBy = new Map();
    for (const x of trips) { const k = x.brand + '|' + x.destination; if (!tripsBy.has(k)) tripsBy.set(k, []); tripsBy.get(k).push(x); }
    const warm = new Map();
    for (const l of enriched) {
      if (!(l.status === 'Open' || (l.status === 'No reply' && (now - t(l.enquiry)) / DAY <= 45)) || l.departure < asOf) continue;
      let best = null, bd = 22;
      for (const x of tripsBy.get(l.brand + '|' + l.dest) || []) { const dd = Math.abs(t(x.departure_date) - t(l.departure)) / DAY; if (dd < bd) { bd = dd; best = x; } }
      if (best) warm.set(best.trip_id, (warm.get(best.trip_id) || 0) + 1);
    }
    const acts = calendar.filter((a) => a.kind !== 'Always-on' && a.kind !== 'Retainer' && a.destination !== 'All' && (a.status === 'Live' || a.status === 'Planned'));
    const horizon = new Date(now); horizon.setUTCMonth(horizon.getUTCMonth() + 15);
    const hz = horizon.toISOString().slice(0, 10);
    // high season: destination-months whose departures usually end in the top quarter for fullness, and at least 60% full
    const hv = [...occ.values()].filter((v) => v[1]).map((v) => v[0] / v[1]).sort((x, y) => x - y);
    const peak = Math.max(0.6, hv.length ? hv[Math.floor(hv.length * 0.75)] : 0.7);
    // pace of all yachts for the same destination and month: high season fills when the group as a whole is on pace
    const grp = new Map();
    for (const x of trips) {
      if (x.departure_date <= asOf || x.departure_date > hz) continue;
      const k = x.destination + '|' + x.departure_date.slice(0, 7), o = occ.get(x.destination + '|' + x.departure_date.slice(5, 7)), hist = o && o[1] ? o[0] / o[1] : 0;
      const daysOut = Math.round((t(x.departure_date) - now) / DAY), c = curve.get(x.destination) || [], bb = c.length ? c.filter((v) => v >= daysOut).length / c.length : 0;
      const g = grp.get(k) || [0, 0]; g[0] += Math.min(Number(x.cabins), sold.get(x.trip_id) || 0); g[1] += Number(x.cabins) * hist * bb; grp.set(k, g);
    }
    const rows = [];
    for (const x of trips) {
      if (x.departure_date <= asOf || x.departure_date > hz) continue;
      const cab = Number(x.cabins), s = Math.min(cab, sold.get(x.trip_id) || 0), mo = x.departure_date.slice(0, 7);
      const o = occ.get(x.destination + '|' + mo.slice(5)), hist = o && o[1] ? o[0] / o[1] : null;
      const daysOut = Math.round((t(x.departure_date) - now) / DAY);
      const c = curve.get(x.destination) || [], bookedBy = c.length ? c.filter((v) => v >= daysOut).length / c.length : 0;
      const expected = hist == null ? null : cab * hist * bookedBy;
      const projected = hist == null ? s : Math.min(cab, s + cab * hist * (1 - bookedBy));
      const ee = e2d.get(x.destination) || [], p75 = ee.length ? ee[Math.floor(ee.length * 0.75)] : 150;
      const liveBy = new Date(t(x.departure_date) - p75 * DAY).toISOString().slice(0, 10);
      const cov = acts.filter((a) => (a.brand === 'All brands' || a.brand === x.brand) && (a.destination === 'All' || a.destination === x.destination) && a.dep_from <= mo && mo <= a.dep_to);
      const paid = cov.filter((a) => a.kind === 'Paid campaign');
      const g = grp.get(x.destination + '|' + mo), natural = hist != null && hist >= peak && (!g || !g[1] || g[0] >= g[1] * 0.85);
      const behind = expected != null && s < expected * 0.7 && expected - s >= 1;
      let status, action;
      if (s >= cab) { status = 'Sold out'; action = paid.length ? 'Sold out: stop campaigns aimed at this date.' : 'Nothing to do.'; }
      else if (natural) { status = paid.length ? 'Fills anyway: review spend' : 'Fills on its own'; action = paid.length ? 'High season, usually ends ' + Math.round(hist * 100) + '% full, and this month is on pace: paid campaigns here could move to a gap.' : 'High season and on pace: no campaign needed; keep an eye on pace.'; }
      else if (cov.length) { status = behind ? 'Covered but behind' : 'Covered'; action = behind ? 'Activity is aimed here but sales trail past years: check the campaign and work warm leads.' : 'On pace with activity aimed at it.'; }
      else if (asOf >= liveBy) { status = 'Gap: start now'; action = 'No activity aimed here and the main booking window has started.'; }
      else { status = 'Gap: plan campaign'; action = 'No activity aimed here yet: have one live by ' + liveBy + '.'; }
      rows.push({ trip_id: x.trip_id, brand: x.brand, dest: x.destination, vtype: x.voyage_type, departure: x.departure_date, dep_month: mo, nights: Number(x.nights), days_out: daysOut,
        cabins: cab, sold: s, unsold: cab - s, occupancy: Math.round((s / cab) * 1000) / 1000, hist: hist == null ? null : Math.round(hist * 1000) / 1000,
        expected_now: expected == null ? null : Math.round(expected * 10) / 10, projected: Math.round(projected * 10) / 10, warm: warm.get(x.trip_id) || 0,
        live_by: liveBy, n_cover: cov.length, n_paid: paid.length, covered_by: cov.map((a) => a.name).join('; '), cover_ids: cov.map((a) => a.activity_id).join(' '), status, action });
    }
    return rows.sort((a, b) => (a.departure < b.departure ? -1 : a.departure > b.departure ? 1 : a.brand < b.brand ? -1 : 1));
  },
});

dash.calc('ledger', {
  title: 'Marketing spend record',
  description: 'Every non-ad marketing cost with its cash and operational cost, the value of cabins given away (average price per cabin for that destination and voyage type, times the chance it would have sold), and the enquiries, bookings and revenue its activity brought.',
  inputs: ['costs', 'enriched', 'trips', 'calendar'],
  fn: (costs, enriched, trips, calendar) => {
    const asOf = enriched.reduce((m, l) => (l.enquiry > m ? l.enquiry : m), '');
    const trip = new Map(trips.map((x) => [x.trip_id, x]));
    const names = new Map(calendar.map((a) => [a.activity_id, a.name]));
    const sold = new Map(), price = new Map(), att = new Map();
    for (const l of enriched) {
      if (l.b) { sold.set(l.trip_id, (sold.get(l.trip_id) || 0) + l.cabins); const k = l.dest + '|' + l.vtype; const v = price.get(k) || [0, 0]; v[0] += l.value; v[1] += l.cabins; price.set(k, v); }
      const a = att.get(l.campaign) || { leads: 0, bookings: 0, revenue: 0 }; a.leads++; a.bookings += l.b; a.revenue += l.value; att.set(l.campaign, a);
    }
    const occ = new Map();
    for (const x of trips) { if (x.departure_date >= asOf) continue; const k = x.destination + '|' + x.departure_date.slice(5, 7); const v = occ.get(k) || [0, 0]; v[0] += Math.min(Number(x.cabins), sold.get(x.trip_id) || 0); v[1] += Number(x.cabins); occ.set(k, v); }
    return costs.map((c) => {
      const x = trip.get(c.trip_id), comp = Number(c.cabins_comped) || 0;
      let cv = 0, chance = null;
      if (x && comp) {
        const p = price.get(x.destination + '|' + x.voyage_type), per = p && p[1] ? p[0] / p[1] : 0;
        if (x.departure_date < asOf) chance = Math.min(1, (sold.get(x.trip_id) || 0) / Math.max(1, Number(x.cabins) - comp));
        else { const o = occ.get(x.destination + '|' + x.departure_date.slice(5, 7)); chance = o && o[1] ? o[0] / o[1] : 0.6; }
        cv = comp * per * chance;
      }
      const name = names.get(c.activity_id) || '', a = att.get(name);
      const cash = Number(c.cash_usd), op = Number(c.operational_usd);
      return { cost_id: c.cost_id, date: c.date, year: c.date.slice(0, 4), month: c.date.slice(0, 7), category: c.category, partner: c.partner, description: c.description, brand: c.brand, destination: c.destination,
        activity: name, trip_id: c.trip_id, departure: x ? x.departure_date : '', cash, operational: op, total: Math.round((cash + op) * 100) / 100, cabins_comped: comp,
        comped_value: Math.round(cv), sell_chance: chance == null ? null : Math.round(chance * 100) / 100, status: c.status,
        leads: a ? a.leads : null, bookings: a ? a.bookings : null, revenue: a ? Math.round(a.revenue) : null,
        cost_per_booking: a && a.bookings ? Math.round((cash + op + cv) / a.bookings) : null };
    });
  },
});

dash.calc('spendsum', {
  title: 'Marketing spend by category and month',
  description: 'All marketing spend (Meta, Google and every cost in the spend record) by category and by month, against the monthly budget in the budget file, for each brand and period. Costs count in the month they were paid; shared costs are split between brands by their share of ad spend that month.',
  inputs: ['ledger', 'spend', 'enriched', 'budget'],
  fn: (ledger, spend, enriched, budget) => {
    const DAY = 864e5, t = (s) => Date.parse(s + 'T00:00:00Z');
    const asOf = enriched.reduce((m, l) => (l.enquiry > m ? l.enquiry : m), ''), now = t(asOf);
    const per = (d) => { const p = ['All', d.slice(0, 4)]; const x = t(d.length === 7 ? d + '-15' : d); if (x <= now && x > now - 90 * DAY) p.push('L90'); if (x <= now && x > now - 30 * DAY) p.push('L30'); return p; };
    const brands = [...new Set(budget.map((x) => x.brand))];
    const adM = new Map(); let adAll = 0; const adB = new Map();
    for (const s of spend) { const v = Number(s.spend_usd); adAll += v; adB.set(s.brand, (adB.get(s.brand) || 0) + v); for (const b of ['All', s.brand]) adM.set(b + '|' + s.month, (adM.get(b + '|' + s.month) || 0) + v); }
    const share = (b, m) => (b === 'All' ? 1 : adM.get('All|' + m) ? (adM.get(b + '|' + m) || 0) / adM.get('All|' + m) : (adB.get(b) || 0) / adAll);
    const cat = new Map(), mon = new Map();
    const addC = (b, p, c, f, v) => { const k = b + '|' + p + '|' + c; let a = cat.get(k); if (!a) cat.set(k, (a = { key: k, kind: 'cat', brand: b, period: p, category: c, cost: 0, committed: 0, comped_value: 0, leads: null, bookings: null, revenue: null })); a[f] += v; };
    const addM = (b, m, f, v) => { const k = b + '|' + m; let a = mon.get(k); if (!a) mon.set(k, (a = { key: k, kind: 'month', brand: b, month: m, ads: 0, other: 0, committed: 0, budget: 0 })); a[f] += v; };
    for (const s of spend) for (const b of ['All', s.brand]) { const v = Number(s.spend_usd); for (const p of per(s.month)) addC(b, p, s.channel, 'cost', v); addM(b, s.month, 'ads', v); }
    for (const c of ledger) for (const b of ['All', ...brands]) {
      const w = c.brand === 'All brands' ? share(b, c.month) : b === 'All' || c.brand === b ? 1 : 0;
      if (!w) continue;
      for (const p of per(c.date)) { addC(b, p, c.category, c.status === 'Paid' ? 'cost' : 'committed', c.total * w); addC(b, p, c.category, 'comped_value', c.comped_value * w); }
      addM(b, c.month, c.status === 'Paid' ? 'other' : 'committed', c.total * w);
    }
    for (const x of budget) for (const b of ['All', x.brand]) addM(b, x.month, 'budget', Number(x.budget_usd));
    const CH = { 'Meta Ads': 'Meta Ads', 'Google Ads': 'Google Ads', Influencer: 'Influencer', PR: 'PR / press' };
    const res = new Map();
    for (const l of enriched) { const c = Object.keys(CH).find((k) => CH[k] === l.channel); if (!c) continue; for (const b of ['All', l.brand]) for (const p of ['All', l.year, ...l.periods.filter((x) => x === 'L90' || x === 'L30')]) { const k = b + '|' + p + '|' + c; const v = res.get(k) || [0, 0, 0]; v[0]++; v[1] += l.b; v[2] += l.value; res.set(k, v); } }
    const r = (x) => Math.round(x);
    const cats = [...cat.values()].map((a) => { const v = res.get(a.key); return { ...a, cost: r(a.cost), committed: r(a.committed), comped_value: r(a.comped_value),
      leads: v ? v[0] : null, bookings: v ? v[1] : null, revenue: v ? r(v[2]) : null, cost_per_booking: v && v[1] ? r((a.cost + a.comped_value) / v[1]) : null }; });
    const tot = new Map(); for (const a of cats) tot.set(a.brand + '|' + a.period, (tot.get(a.brand + '|' + a.period) || 0) + a.cost);
    for (const a of cats) a.share = tot.get(a.brand + '|' + a.period) ? Math.round((a.cost / tot.get(a.brand + '|' + a.period)) * 1000) / 1000 : 0;
    const months = [...mon.values()].map((a) => ({ ...a, ads: r(a.ads), other: r(a.other), committed: r(a.committed), budget: r(a.budget), total: r(a.ads + a.other), future: a.month > asOf.slice(0, 7) }))
      .sort((a, b) => (a.month < b.month ? -1 : 1));
    const tots = new Map();
    for (const a of cats) { const k = 'tot|' + a.brand + '|' + a.period; let t2 = tots.get(k); if (!t2) tots.set(k, (t2 = { key: k, kind: 'tot', brand: a.brand, period: a.period, cost: 0, ads: 0, other: 0, comped_value: 0, committed: 0 }));
      t2.cost += a.cost; t2.comped_value += a.comped_value; t2.committed += a.committed; if (a.category === 'Meta Ads' || a.category === 'Google Ads') t2.ads += a.cost; else t2.other += a.cost; }
    return [...cats, ...months, ...tots.values()];
  },
});

dash.calc('coverage_sum', {
  title: 'Inventory coverage totals',
  description: 'Counts of upcoming departures by coverage status, and unsold cabins, for each brand and destination.',
  inputs: ['coverage'],
  fn: (coverage) => {
    const m = new Map();
    for (const r of coverage) for (const b of ['All', r.brand]) for (const d of ['All', r.dest]) {
      const k = b + '|' + d; let a = m.get(k);
      if (!a) m.set(k, (a = { key: k, brand: b, dest: d, departures: 0, cabins: 0, unsold: 0, gaps: 0, behind: 0, fills_anyway: 0, fills_own: 0, sold_out: 0, covered: 0 }));
      a.departures++; a.cabins += r.cabins; a.unsold += r.unsold;
      if (r.status.startsWith('Gap')) a.gaps++; else if (r.status === 'Covered but behind') a.behind++; else if (r.status.startsWith('Fills anyway')) a.fills_anyway++;
      else if (r.status === 'Fills on its own') a.fills_own++; else if (r.status === 'Sold out') a.sold_out++; else a.covered++;
    }
    return [...m.values()];
  },
});

dash.calc('budget_view', {
  title: 'Marketing budget against spend',
  description: 'For each brand, year and category (Meta, Google, PR, influencers, content, events, agent trips, agency fees): the budget, the share of the year\'s budget it was given, the budget planned to date, what was paid and committed (from Marketing spend by category and month), and what is left. Returns use enquiries from that year: ROAS is booking value ÷ spend paid in the year, CAC is spend ÷ bookings, margin return is contribution margin ÷ spend. Meta, Google, PR and influencers are matched to their own channel\'s enquiries; the Total row uses every enquiry and all spend (a blended return). Content, events, agent trips and fees have no channel of their own, so they show no return.',
  inputs: ['budget', 'spendsum', 'enriched'],
  fn: (budget, spendsum, enriched) => {
    const asOf = enriched.reduce((m, l) => (l.enquiry > m ? l.enquiry : m), ''), am = asOf.slice(0, 7);
    const brands = [...new Set(budget.map((x) => x.brand))], years = [...new Set(budget.map((x) => x.month.slice(0, 4)))].sort();
    const cats = ['Meta Ads', 'Google Ads', 'PR', 'Influencer', 'Content production', 'Event / trade show', 'Agent fam trip', 'Agency fees'];
    const bud = new Map();
    for (const x of budget) for (const b of ['All', x.brand]) for (const c of [x.category, 'Total']) {
      const k = b + '|' + x.month.slice(0, 4) + '|' + c, v = bud.get(k) || [0, 0]; v[0] += Number(x.budget_usd); if (x.month <= am) v[1] += Number(x.budget_usd); bud.set(k, v);
    }
    const sp = new Map();
    for (const r of spendsum) if (r.kind === 'cat' && /^\d{4}$/.test(r.period)) for (const c of [r.category, 'Total']) {
      const k = r.brand + '|' + r.period + '|' + c, v = sp.get(k) || [0, 0]; v[0] += r.cost; v[1] += r.committed; sp.set(k, v);
    }
    const CH = { 'Meta Ads': 'Meta Ads', 'Google Ads': 'Google Ads', 'PR / press': 'PR', Influencer: 'Influencer' };
    const res = new Map();
    for (const l of enriched) for (const b of ['All', l.brand]) for (const c of ['Total', ...(CH[l.channel] ? [CH[l.channel]] : [])]) {
      const k = b + '|' + l.year + '|' + c, v = res.get(k) || { leads: 0, bookings: 0, revenue: 0, margin: 0 };
      v.leads++; v.bookings += l.b; v.revenue += l.value; v.margin += l.margin; res.set(k, v);
    }
    const rows = [];
    for (const y of years) for (const b of ['All', ...brands]) {
      const tot = (bud.get(b + '|' + y + '|Total') || [0])[0];
      for (const c of [...cats, 'Total']) {
        const k = b + '|' + y + '|' + c, bb = bud.get(k) || [0, 0], ss = sp.get(k) || [0, 0];
        const budget_ = Math.round(bb[0]), toDate = Math.round(bb[1]), spent = Math.round(ss[0]), committed = Math.round(ss[1]);
        let status = 'On plan';
        if (spent + committed > budget_ * 1.0001 && budget_ > 0) status = 'Over budget';
        else if (spent + committed > 0 && !budget_) status = 'Over budget';
        else if (toDate > 0 && spent > toDate * 1.1) status = 'Ahead of plan';
        else if (toDate > 0 && spent < toDate * 0.8) status = 'Under plan';
        else if (!toDate && !spent) status = y > am.slice(0, 4) ? 'Not started' : 'On plan';
        rows.push({ key: k, brand: b, year: y, category: c, budget: budget_, alloc_share: tot ? Math.round((bb[0] / tot) * 1000) / 1000 : null, budget_to_date: toDate,
          spent, committed, left: budget_ - spent - committed, used_pct: budget_ ? Math.round((spent / budget_) * 1000) / 1000 : null,
          plan_pct: budget_ ? Math.round((toDate / budget_) * 1000) / 1000 : null, vs_plan: spent - toDate, status,
          ...(() => { const v = res.get(k); if (!v) return { leads: null, bookings: null, revenue: null, margin: null, roas: null, margin_roas: null, cac: null, cpl: null };
            const r2 = (x) => Math.round(x * 100) / 100;
            return { leads: v.leads, bookings: v.bookings, revenue: Math.round(v.revenue), margin: Math.round(v.margin), roas: spent ? r2(v.revenue / spent) : null,
              margin_roas: spent ? r2(v.margin / spent) : null, cac: v.bookings && spent ? Math.round(spent / v.bookings) : null, cpl: v.leads && spent ? r2(spent / v.leads) : null }; })() });
      }
    }
    return rows;
  },
});
