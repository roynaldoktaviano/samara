// Samara Marketing Intelligence — the decision layer: five recurring decisions answered from the analysis tabs.

dash.calc('decisions', {
  title: 'Decision answers',
  description: 'For each brand, a one-paragraph answer to five recurring decisions, the three figures behind it (with the usual level where there is one), a confidence level and why, and what would change the answer. 1: which departures need marketing now and which fill anyway (inventory risk and coverage). 2: where the next dollar should go and where to spend less (market return index and cost per booking by channel you can buy, so not direct, referral or organic; latest year). 3: whether a shortfall shows up in marketing, the sales process or commercial constraints (last 90 days against all history). 4: when campaigns must start (marketing timing). 5: which markets and agents deserve more investment (market return index, agent results, partnership before/after). Plus what changed in the last 30 days against the same days last year. Confidence: High with 30+ underlying bookings (or 150+ qualified leads), Medium with 10+ (50+), otherwise Low.',
  inputs: ['risk', 'coverage', 'market_opp', 'channels', 'stages', 'timing', 'b2b', 'cube', 'watch'],
  fn: (risk, coverage, market_opp, channels, stages, timing, b2b, cube, watch) => {
    const usd = (x) => (x == null || !isFinite(x) ? '—' : Math.abs(x) >= 10000 ? '$' + (Math.abs(x) >= 1e6 ? (x / 1e6).toFixed(1) + 'M' : Math.round(x / 1000) + 'K') : '$' + Math.round(x).toLocaleString('en'));
    const pct = (x) => (x == null || !isFinite(x) ? '—' : Math.round(x * 100) + '%');
    const sgn = (x) => (x == null || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '−') + Math.round(Math.abs(x) * 100) + '%');
    const day = (d) => new Date(d + 'T00:00:00Z').toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    const mon = (m) => new Date(m + '-01T00:00:00Z').toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    const conf = (n, hi, mid) => (n >= hi ? 'High' : n >= mid ? 'Medium' : 'Low');
    const list = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
    const years = [...new Set(market_opp.map((r) => r.period))].filter((p) => /^\d{4}$/.test(p)).sort(), Y = years[years.length - 1] || 'All';
    const brands = ['All', ...new Set(risk.map((r) => r.brand))];
    const rows = [];
    const ev = (o, i, label, v, fmt, base) => { o['e' + i + '_label'] = label; o['e' + i] = v == null || !isFinite(v) ? null : Math.round(v * 1000) / 1000; o['e' + i + '_fmt'] = fmt; o['e' + i + '_base'] = base == null || !isFinite(base) ? null : Math.round(base * 1000) / 1000; };
    for (const b of brands) {
      const mine = (r) => b === 'All' || r.brand === b;
      // 1. departures
      const rk = risk.filter((r) => r.unsold > 0 && mine(r));
      const high = rk.filter((r) => r.risk_band === 'High').sort((x, y) => y.risk_points - x.risk_points || x.days_out - y.days_out), med = rk.filter((r) => r.risk_band === 'Medium');
      const cv = coverage.filter(mine), fills = cv.filter((r) => r.status.indexOf('Fills anyway') === 0), withHist = cv.length ? cv.filter((r) => r.hist != null).length / cv.length : 0;
      const d1 = { key: b + '|1', brand: b, n: 1, id: 'departures', look: 'inventory', question: 'Which departures need marketing now, and which will fill without it?' };
      d1.answer = (high.length ? high.length + (high.length > 1 ? ' departures need' : ' departure needs') + ' marketing now: ' + list(high.slice(0, 3).map((r) => r.brand + ' · ' + r.dest + ' ' + day(r.departure) + ' (' + r.unsold + ' unsold, ' + r.days_out + ' days)')) + '.' : 'No departure is at high risk right now.')
        + (med.length ? ' ' + med.length + ' more ' + (med.length > 1 ? 'are' : 'is') + ' at medium risk: watch pace.' : '')
        + (fills.length ? ' ' + fills.length + ' high-season ' + (fills.length > 1 ? 'departures are' : 'departure is') + ' on pace yet still ' + (fills.length > 1 ? 'have' : 'has') + ' paid campaigns aimed at ' + (fills.length > 1 ? 'them' : 'it') + ': that budget could move to the departures above.' : ' No paid campaign is aimed at a departure that would fill anyway.');
      ev(d1, 1, 'High-risk departures', high.length, 'num'); ev(d1, 2, 'Unsold cabins on them', high.reduce((s, r) => s + r.unsold, 0), 'num'); ev(d1, 3, 'Fill anyway, still paid for', fills.length, 'num');
      d1.confidence = withHist >= 0.9 ? 'High' : withHist >= 0.6 ? 'Medium' : 'Low';
      d1.confidence_why = pct(withHist) + ' of upcoming departures have past years of the same destination and month to compare against.';
      d1.change = 'Bookings landing on these dates, holds or blocked cabins from operations (not in the data yet), or a campaign going live (watch the coverage score).';
      rows.push(d1);
      // 2. next dollar
      const mo = market_opp.filter((r) => r.brand === b && r.period === Y && r.spend > 0);
      const okM = mo.filter((r) => r.bookings >= 5).sort((x, y) => y.opp_index - x.opp_index), best = okM[0];
      const worst = mo.filter((r) => r.spend_share >= 0.08 && r.opp_index != null && r.opp_index < 0.8).sort((x, y) => x.opp_index - y.opp_index)[0];
      const ch = channels.filter((r) => r.slice === [b, 'All', 'All', Y].join('|') && r.spend > 0 && r.bookings >= 3 && r.cac != null && !/direct|referr|organic/i.test(r.channel)).sort((x, y) => x.cac - y.cac);
      const cheap = ch[0], dear = ch.length > 1 ? ch[ch.length - 1] : null;
      const d2 = { key: b + '|2', brand: b, n: 2, id: 'budget', look: 'spend', question: 'Where should the next dollar go, and where should we spend less?' };
      d2.answer = (best ? 'Next dollar: ' + best.group + ' returns ' + best.opp_index.toFixed(1) + '× its share of spend (' + usd(best.value_per_usd) + ' of bookings per $1 in ' + Y + ')' : 'No market has enough bookings in ' + Y + ' to rank')
        + (cheap ? ', and ' + cheap.channel + ' wins bookings cheapest at ' + usd(cheap.cac) + ' each.' : '.')
        + (worst ? ' Spend less: ' + worst.group + ' takes ' + pct(worst.spend_share) + ' of marketing cost for ' + pct(worst.value_share) + ' of booking value' : '')
        + (dear && dear.cac > (cheap ? cheap.cac * 2 : Infinity) ? (worst ? ', and ' : ' Spend less: ') + dear.channel + ' costs ' + usd(dear.cac) + ' per booking.' : worst ? '.' : '')
        + (high.length ? ' Before spreading new money, fund the ' + high.length + ' high-risk ' + (high.length > 1 ? 'departures' : 'departure') + ' in decision 1.' : '');
      ev(d2, 1, 'Best market return index', best ? best.opp_index : null, 'x'); ev(d2, 2, 'Cheapest cost per booking', cheap ? cheap.cac : null, 'usd'); ev(d2, 3, 'Dearest cost per booking', dear ? dear.cac : null, 'usd');
      const n2 = Math.min(best ? best.bookings : 0, cheap ? cheap.bookings : 0);
      d2.confidence = conf(n2, 30, 10); d2.confidence_why = 'The top market and channel rest on ' + (best ? best.bookings : 0) + ' and ' + (cheap ? cheap.bookings : 0) + ' bookings in ' + Y + '.';
      d2.change = 'These are average returns; the next dollar usually returns less. Test +20% for four weeks in the best market before moving larger sums, and check inventory is there to sell.';
      rows.push(d2);
      // 3. where a shortfall shows up
      const cur = stages.find((r) => r.key === b + '|L90'), base = stages.find((r) => r.key === b + '|All');
      const d3 = { key: b + '|3', brand: b, n: 3, id: 'shortfall', look: 'sales', question: 'When we fall short, is it marketing, the sales process, or price and product?' };
      if (cur && base) {
        const drop = (c, bb) => (c != null && bb ? 1 - c / bb : 0);
        const cands = [['marketing', 'lead-to-qualified', cur.l2q, base.l2q, drop(cur.l2q, base.l2q), pct], ['the sales process', 'qualified leads still in conversation', cur.q2r, base.q2r, drop(cur.q2r, base.q2r), pct],
          ['the sales process', 'conversations reaching a proposal', cur.r2p, base.r2p, drop(cur.r2p, base.r2p), pct], ['the sales process', 'median first reply', cur.reply_median, base.reply_median, cur.reply_median ? 1 - base.reply_median / cur.reply_median : 0, (x) => (x == null ? '—' : x.toFixed(1) + ' h')],
          ['commercial constraints', 'proposal-to-booking', cur.p2b, base.p2b, drop(cur.p2b, base.p2b), pct]].sort((x, y) => y[4] - x[4]);
        const w = cands[0], lostTop = [['commercial constraints (price, dates, fit, competitors)', cur.lost_commercial], ['sales follow-up (guests going quiet)', cur.lost_sales], ['guest timing (postponed)', cur.lost_timing], ['unknown reasons', cur.lost_unknown]].sort((x, y) => y[1] - x[1])[0];
        d3.answer = (w[4] >= 0.1 ? 'Over the last 90 days the biggest slip shows up in ' + w[0] + ': ' + w[1] + ' is ' + w[5](w[2]) + ' against ' + w[5](w[3]) + ' across all history.' : 'Over the last 90 days no stage is clearly below its usual level (none more than 10% worse).')
          + (cur.lost_qualified ? ' Of ' + cur.lost_qualified + ' qualified leads lost, most went to ' + lostTop[0] + '.' : '')
          + (cur.open_proposals ? ' ' + cur.open_proposals + ' proposals are still open, worth about ' + usd(cur.open_value) + ' at the usual close rate.' : '');
        ev(d3, 1, 'Lead to qualified (marketing)', cur.l2q, 'pct', base.l2q); ev(d3, 2, 'Median first reply, hours (sales)', cur.reply_median, 'h', base.reply_median); ev(d3, 3, 'Proposal to booking (commercial)', cur.p2b, 'pct', base.p2b);
        d3.confidence = conf(cur.qualified, 150, 50); d3.confidence_why = cur.qualified + ' qualified leads in the last 90 days; recent proposals still open pull the 90-day proposal-to-booking rate down until they close.';
      } else { d3.answer = 'Not enough enquiries in the last 90 days to judge.'; d3.confidence = 'Low'; d3.confidence_why = 'No recent enquiries.'; }
      d3.change = 'Lost reasons recorded as Unknown hide commercial causes; a negotiation stage in the CRM would separate price talks from silence. Re-check in a month as open proposals resolve.';
      rows.push(d3);
      // 4. campaign start dates (all yachts: timing is by destination)
      const tm = timing.filter((r) => r.dest !== 'All');
      const late = tm.filter((r) => r.status.indexOf('Late') === 0).sort((x, y) => (x.start_by < y.start_by ? -1 : 1)), soon = tm.filter((r) => r.status === 'Start within 45 days').sort((x, y) => (x.start_by < y.start_by ? -1 : 1));
      const d4 = { key: b + '|4', brand: b, n: 4, id: 'timing', look: 'season', question: 'When do campaigns need to start for each season?' };
      d4.answer = (late.length ? late.length + ' departure ' + (late.length > 1 ? 'months are' : 'month is') + ' past the start date with unsold cabins and nothing aimed at ' + (late.length > 1 ? 'them' : 'it') + ': ' + list(late.slice(0, 3).map((r) => r.dest + ' ' + mon(r.next_dep_month) + ' (should have started ' + day(r.start_by) + ')')) + '.' : 'No departure month is late.')
        + (soon.length ? ' Start next: ' + list(soon.slice(0, 3).map((r) => r.dest + ' ' + mon(r.next_dep_month) + ' by ' + day(r.start_by))) + '.' : ' Nothing else needs to start in the next 45 days.')
        + (b !== 'All' ? ' (Dates are by destination, for all yachts.)' : '');
      ev(d4, 1, 'Late to start', late.length, 'num'); ev(d4, 2, 'Start within 45 days', soon.length, 'num'); ev(d4, 3, 'Unsold cabins in late months', late.reduce((s, r) => s + r.unsold, 0), 'num');
      const used = [...late.slice(0, 3), ...soon.slice(0, 3)];
      d4.confidence = conf(used.length ? Math.min(...used.map((r) => r.bookings)) : 0, 30, 10); d4.confidence_why = used.length ? 'Start dates rest on ' + Math.min(...used.map((r) => r.bookings)) + ' to ' + Math.max(...used.map((r) => r.bookings)) + ' past bookings per destination and month.' : 'Nothing to time right now.';
      d4.change = 'Start dates come from how far ahead past guests enquired; a shift toward markets that plan earlier (Europe) moves them earlier.';
      rows.push(d4);
      // 5. markets and agents
      const ag = b2b.find((r) => r.key === ['route', b, Y, 'Agent'].join('|')), dr = b2b.find((r) => r.key === ['route', b, Y, 'Direct'].join('|'));
      const under = b2b.filter((r) => r.kind === 'dest' && r.brand === b && r.period === Y && r.share_all != null && r.share_agent != null && r.share_agent < r.share_all * 0.7).sort((x, y) => x.share_agent / x.share_all - y.share_agent / y.share_all)[0];
      const act = b2b.filter((r) => r.kind === 'activity' && (b === 'All' || r.brand === b || r.brand === 'All brands') && r.window === 'Complete' && r.leads_before >= 5 && r.lift != null).sort((x, y) => y.lift - x.lift)[0];
      const d5 = { key: b + '|5', brand: b, n: 5, id: 'markets', look: 'b2b', question: 'Which markets and agents deserve more investment?' };
      d5.answer = (okM.length ? 'Markets: ' + list(okM.filter((r) => r.opp_index >= 1.1).slice(0, 2).map((r) => r.group + ' (index ' + r.opp_index.toFixed(1) + ')')) + (okM.some((r) => r.opp_index >= 1.1) ? ' return more than their share of spend.' : 'none clearly out-returns its share of spend.') : 'Markets: too few bookings to rank.')
        + (ag && ag.bookings ? ' Agents bring ' + pct(ag.share_value) + ' of booking value at ' + usd(ag.avg_value) + ' per booking' + (dr && dr.avg_value ? ' (direct ' + usd(dr.avg_value) + ')' : '') + ' and close ' + pct(ag.l2b) + ' of enquiries' + (dr ? ' (direct ' + pct(dr.l2b) + ')' : '') + '.' : ' No agent bookings in ' + Y + '.')
        + (under ? ' Agents under-sell ' + under.label + ' (' + pct(under.share_agent) + ' of agent bookings against ' + pct(under.share_all) + ' overall): a candidate for a fam trip.' : '')
        + (act ? ' Strongest recent partnership: ' + act.label + ' (' + act.category + ', ' + day(act.date) + '), agent enquiries ' + sgn(act.lift) + ' in the six months after.' : '');
      ev(d5, 1, 'Best market return index', best ? best.opp_index : null, 'x'); ev(d5, 2, 'Agent share of value', ag ? ag.share_value : null, 'pct'); ev(d5, 3, 'Agent average booking', ag ? ag.avg_value : null, 'usd', dr ? dr.avg_value : null);
      d5.confidence = conf(ag ? ag.bookings : 0, 30, 10); d5.confidence_why = (ag ? ag.bookings : 0) + ' agent bookings in ' + Y + '; agency names and countries are not in the data, and before-and-after results are pointers, not proof.';
      d5.change = 'Market size, competition and access are not in the data. Recording the agency on each enquiry would show which agents to invest in, not only which countries.';
      rows.push(d5);
      // what changed
      const c = cube.find((r) => r.slice === [b, 'All', 'All', 'L30'].join('|')), hi = watch.filter((r) => r.severity === 'High' && (b === 'All' || r.brand === b || r.brand === 'All')).length;
      const d0 = { key: b + '|0', brand: b, n: 0, id: 'changed', look: 'overview', question: 'What changed in the last 30 days?' };
      d0.answer = c ? 'Against the same 30 days last year: enquiries ' + sgn(c.d_leads) + ', qualified leads ' + sgn(c.d_qualified) + ', marketing cost ' + sgn(c.d_spend) + ', cost per lead ' + sgn(c.d_cpl) + '. Bookings from these enquiries are still coming in, so judge them later. ' + (hi ? hi + ' high-priority ' + (hi > 1 ? 'observations' : 'observation') + ' in Performance Watch.' : 'Nothing high-priority in Performance Watch.') : 'No enquiries in the last 30 days.';
      ev(d0, 1, 'Enquiries, last 30 days', c ? c.leads : null, 'num', null); ev(d0, 2, 'Qualified leads', c ? c.qualified : null, 'num', null); ev(d0, 3, 'High-priority observations', hi, 'num', null);
      d0.confidence = c ? conf(c.qualified, 150, 50) : 'Low'; d0.confidence_why = c ? c.qualified + ' qualified leads in the last 30 days.' : 'No recent enquiries.';
      d0.change = '';
      rows.push(d0);
    }
    return rows;
  },
});
