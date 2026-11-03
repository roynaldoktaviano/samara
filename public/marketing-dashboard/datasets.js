// The seven datasets the dashboard reads. `erp` ones load live from the ERP on every visit
// (/api/public/marketing-dashboard/<id>, Samara Yachting); the rest are imported as a CSV (or JSON)
// file whose header row names exactly these columns, and count as empty until imported.
// `numeric` columns are stored as numbers (the calcs expect them that way).
window.SMI_DATASETS = [
  { id: 'leads', erp: true, title: 'CRM enquiries', description: 'Every Freshsales deal since 2020 with its ERP inquiry (trip date, UTM) and, once won, its ERP booking.',
    columns: ['lead_id', 'enquiry_date', 'departure_date', 'brand', 'destination', 'voyage_type', 'channel', 'campaign', 'campaign_type', 'cta', 'country', 'nationality', 'qualified', 'replied', 'proposal', 'proposal_date', 'status', 'booking_date', 'lost_reason', 'first_reply_hours', 'cabins', 'booking_value_usd', 'contribution_margin_usd', 'trip_id', 'web_sessions', 'site_minutes', 'social_touches', 'email_opens', 'whatsapp_msgs', 'first_touch', 'top_page', 'guest_type', 'cancel_date', 'refund_usd', 'discount_usd', 'commission_usd'] },
  { id: 'spend', title: 'Ad spend', description: 'Meta and Google spend, impressions and clicks per month, campaign and country.',
    columns: ['month', 'campaign', 'channel', 'brand', 'destination', 'campaign_type', 'country', 'spend_usd', 'impressions', 'clicks'] },
  { id: 'costs', title: 'Marketing spend record', description: 'PR, influencers, content, events, agent fam trips and agency fees: cash, operational cost and cabins given away.',
    columns: ['cost_id', 'date', 'category', 'partner', 'description', 'activity_id', 'brand', 'destination', 'trip_id', 'cash_usd', 'operational_usd', 'cabins_comped', 'status'] },
  { id: 'trips', erp: true, title: 'Departure schedule', description: 'ERP open trips and private-charter bookings per yacht, with destination, nights and cabins.',
    columns: ['trip_id', 'brand', 'destination', 'voyage_type', 'departure_date', 'nights', 'cabins'], numeric: ['nights', 'cabins'] },
  { id: 'calendar', title: 'Marketing calendar', description: 'Campaigns, press and influencer activity with the departures they sell, when they run and their status.',
    columns: ['activity_id', 'name', 'channel', 'kind', 'brand', 'destination', 'dep_from', 'dep_to', 'live_from', 'live_to', 'planned_budget_usd', 'status'], numeric: ['planned_budget_usd'] },
  { id: 'targets', title: 'Targets', description: 'Monthly revenue, cabin and qualified-lead targets per brand.',
    columns: ['month', 'brand', 'revenue_target_usd', 'cabins_target', 'qualified_target'] },
  { id: 'budget', title: 'Marketing budget', description: 'Monthly marketing budget per brand and category.',
    columns: ['month', 'brand', 'category', 'budget_usd'] },
];

// Rows as the calcs expect them, whatever their source: text, empty cells as null,
// `numeric` columns as numbers.
window.SMI_NORMALIZE = (rows, d) => rows.map((r) => {
  const o = {};
  for (const [k, v] of Object.entries(r)) {
    const key = k.trim();
    if (v == null || String(v).trim() === '') o[key] = null;
    else if (d.numeric && d.numeric.includes(key)) { const n = Number(String(v).trim()); o[key] = Number.isFinite(n) ? n : null; }
    else o[key] = String(v);
  }
  return o;
});
