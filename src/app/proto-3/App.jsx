import React, { useMemo, useState } from "react";

const COLORS = {
  ink: "#202124",
  muted: "#6f747c",
  border: "#e5e7eb",
  panel: "#ffffff",
  bg: "#f7f8fa",
  blue: "#2563eb",
  green: "#16a46a",
  amber: "#d99218",
  red: "#dc4c4c",
  gold: "#b69a63",
};

const yachtImage =
  "https://images.unsplash.com/photo-1540946485063-a40da27545f8?auto=format&fit=crop&w=1500&q=88";
const reefImage =
  "https://images.unsplash.com/photo-1546026423-cc4642628d2b?auto=format&fit=crop&w=1200&q=88";
const islandImage =
  "https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?auto=format&fit=crop&w=1200&q=88";

const iconPaths = {
  grid: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  target: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z", "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"],
  calendar: ["M5 3v3", "M19 3v3", "M4 7h16", "M4 5h16v16H4z"],
  bolt: ["m13 2-9 12h7l-1 8 9-12h-7z"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  pen: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"],
  send: ["m22 2-7 20-4-9-9-4z", "M22 2 11 13"],
  chart: ["M4 19V9", "M10 19V5", "M16 19v-7", "M22 19V2", "M2 19h22"],
  image: ["M3 5h18v14H3z", "m3 16 5-5 4 4 3-3 6 6", "M16 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"],
  settings: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2 3.46-.08-.03a1.65 1.65 0 0 0-1.9-.22l-.48.28a1.65 1.65 0 0 0-.8 1.52V22h-4v-.11a1.65 1.65 0 0 0-.8-1.52l-.48-.28a1.65 1.65 0 0 0-1.9.22l-.08.03-2-3.46.06-.06A1.65 1.65 0 0 0 5.6 15l-.48-.83a1.65 1.65 0 0 0-1.43-.82H3v-4h.69a1.65 1.65 0 0 0 1.43-.82l.48-.83a1.65 1.65 0 0 0-.27-1.82l-.06-.06 2-3.46.08.03a1.65 1.65 0 0 0 1.9.22l.48-.28a1.65 1.65 0 0 0 .8-1.52V1h4v.11a1.65 1.65 0 0 0 .8 1.52l.48.28a1.65 1.65 0 0 0 1.9-.22l.08-.03 2 3.46-.06.06a1.65 1.65 0 0 0-.33 1.82l.48.83a1.65 1.65 0 0 0 1.43.82H22v4h-.69a1.65 1.65 0 0 0-1.43.82Z"],
  mail: ["M3 5h18v14H3z", "m3 6 9 7 9-7"],
  message: ["M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"],
  meta: ["M7 17c-4 0-2-10 1-10 3 0 6 10 9 10 4 0 3-10 0-10-3 0-6 10-10 10Z"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.35-4.35"],
  globe: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M2 12h20", "M12 2a15.3 15.3 0 0 1 0 20", "M12 2a15.3 15.3 0 0 0 0 20"],
  layers: ["m12 2 9 5-9 5-9-5z", "m3 12 9 5 9-5", "m3 17 9 5 9-5"],
  check: ["m5 12 4 4L19 6"],
  plus: ["M12 5v14", "M5 12h14"],
  arrow: ["m9 18 6-6-6-6"],
  chevron: ["m9 18 6-6-6-6"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  filter: ["M4 5h16", "M7 12h10", "M10 19h4"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M13.7 21a2 2 0 0 1-3.4 0"],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 6v6l4 2"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  comment: ["M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"],
  phone: ["M7 2h10v20H7z", "M11 18h2"],
  link: ["M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"],
  edit: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"],
  external: ["M14 3h7v7", "m10 14 11-11", "M21 14v7H3V3h7"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  spark: ["m12 3 1.3 4.7L18 9l-4.7 1.3L12 15l-1.3-4.7L6 9l4.7-1.3z", "m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z"],
};

function Icon({ name, size = 18, strokeWidth = 1.8, className = "" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(iconPaths[name] || iconPaths.grid).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

const navSections = [
  { label: "MARKETING", items: [
    ["Command Center", "grid", "dashboard"],
    ["Campaigns", "target", "campaigns"],
    ["Content Calendar", "calendar", "calendar"],
    ["Automations", "bolt", "automations"],
    ["Audiences", "users", "audiences"],
  ]},
  { label: "CREATE & PUBLISH", items: [
    ["Content Studio", "pen", "content"],
    ["Publishing Center", "send", "publishing"],
    ["Landing Pages", "globe", "landing"],
    ["Asset Library", "image", "assets"],
  ]},
  { label: "MEASURE", items: [
    ["Performance", "chart", "analytics"],
    ["Reports", "layers", "reports"],
  ]},
];

const campaigns = [
  {
    id: "otium-raja",
    name: "Otium · Raja Ampat 2027",
    brand: "OTIUM",
    status: "Live",
    statusTone: "green",
    objective: "Qualified charter enquiries",
    period: "01 Jul – 30 Nov 2026",
    owner: "Merryl",
    progress: 88,
    budget: "$42,000",
    spent: "$18,420",
    revenue: "$196,000",
    roas: "10.6×",
    leads: 84,
    bookings: 2,
    image: yachtImage,
    channels: ["mail", "message", "meta", "search", "globe", "image"],
  },
  {
    id: "samara-early",
    name: "Samara · 2027 Early Booking",
    brand: "SAMARA",
    status: "In production",
    statusTone: "blue",
    objective: "Open-trip cabin sales",
    period: "15 Aug – 15 Dec 2026",
    owner: "Jay",
    progress: 62,
    budget: "$18,500",
    spent: "$0",
    revenue: "$0",
    roas: "—",
    leads: 0,
    bookings: 0,
    image: islandImage,
    channels: ["mail", "meta", "search", "globe"],
  },
  {
    id: "mischief-crossing",
    name: "Mischief · Komodo to Raja Crossing",
    brand: "MISCHIEF",
    status: "Approval",
    statusTone: "amber",
    objective: "Sell 12-night crossing",
    period: "20 Jul – 30 Sep 2026",
    owner: "Gunwa",
    progress: 47,
    budget: "$9,800",
    spent: "$0",
    revenue: "$0",
    roas: "—",
    leads: 0,
    bookings: 0,
    image: reefImage,
    channels: ["mail", "message", "meta", "image"],
  },
  {
    id: "siloina-agents",
    name: "Siloina · Global Surf Agents",
    brand: "SILOINA",
    status: "Planning",
    statusTone: "gray",
    objective: "New agent relationships",
    period: "01 Sep – 31 Oct 2026",
    owner: "Eirin",
    progress: 24,
    budget: "$6,000",
    spent: "$0",
    revenue: "$0",
    roas: "—",
    leads: 0,
    bookings: 0,
    image: "https://images.unsplash.com/photo-1502680390469-be75c86b636f?auto=format&fit=crop&w=1200&q=85",
    channels: ["mail", "message", "globe"],
  },
];

const channelData = [
  { key: "meta", title: "Meta Ads", subtitle: "3 ad sets · 11 ads", status: "Live", progress: 100, owner: "Jay", due: "Live since 08 Jul", color: "#2776e8", icon: "meta", result: "54 leads", metric: "$188 CPL" },
  { key: "google", title: "Google Search", subtitle: "4 ad groups · 16 ads", status: "Live", progress: 100, owner: "Ray", due: "Live since 10 Jul", color: "#4285f4", icon: "search", result: "19 leads", metric: "$246 CPL" },
  { key: "email", title: "Guest & Lead Email", subtitle: "3 mailings · 8,420 recipients", status: "Live", progress: 100, owner: "Dwi", due: "Next send 24 Jul", color: "#9d6fcb", icon: "mail", result: "41.8% open", metric: "5.7% click" },
  { key: "social", title: "Organic Social", subtitle: "8 posts · 5 Reels · 12 Stories", status: "Publishing", progress: 78, owner: "Osa", due: "3 items this week", color: "#ef4d7a", icon: "image", result: "186k reach", metric: "4.8% engage" },
  { key: "whatsapp", title: "WhatsApp", subtitle: "Agents + warm enquiries", status: "Ready", progress: 92, owner: "Efrinda", due: "Schedule 25 Jul", color: "#20b86a", icon: "message", result: "—", metric: "1 approval" },
  { key: "landing", title: "Landing Page", subtitle: "otiumyacht.com/raja-ampat", status: "Live", progress: 100, owner: "Ray", due: "Updated 18 Jul", color: "#d69a2d", icon: "globe", result: "5.9% convert", metric: "1,425 visits" },
];

const tasks = [
  { title: "Approve Indonesian Reel caption", campaign: "Otium · Raja Ampat 2027", due: "Today", owner: "Fresa", tone: "amber" },
  { title: "Export final Story variants", campaign: "Otium · Raja Ampat 2027", due: "Today", owner: "Gunwa", tone: "red" },
  { title: "Review Samara landing-page offer", campaign: "Samara · Early Booking", due: "Tomorrow", owner: "Merryl", tone: "blue" },
  { title: "Confirm agent audience exclusions", campaign: "Siloina · Global Surf Agents", due: "24 Jul", owner: "Eirin", tone: "gray" },
];

function Badge({ children, tone = "gray" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Button({ children, variant = "default", icon, onClick, className = "", disabled = false }) {
  return (
    <button disabled={disabled} className={`btn btn-${variant} ${className}`} onClick={onClick}>
      {icon && <Icon name={icon} size={16} />}{children}
    </button>
  );
}

function Avatar({ name = "M", size = 30, color = "#155c69" }) {
  const initials = name.split(" ").map(x => x[0]).slice(0, 2).join("");
  return <span className="avatar" style={{ width: size, height: size, background: color }}>{initials}</span>;
}

function Sparkline({ data = [2, 3, 2, 5, 4, 7, 6], color = COLORS.blue, height = 40 }) {
  const max = Math.max(...data), min = Math.min(...data);
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${height - 4 - ((v - min) / Math.max(1, max - min)) * (height - 10)}`).join(" ");
  return (
    <svg className="sparkline" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Donut({ value, color = COLORS.green, size = 58 }) {
  return (
    <div className="donut" style={{ width: size, height: size, background: `conic-gradient(${color} ${value}%, #edf0f3 0)` }}>
      <span>{value}%</span>
    </div>
  );
}

function Sidebar({ page, setPage, collapsed, setCollapsed }) {
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="brand">
        <div className="brand-mark"><span></span><span></span><span></span></div>
        {!collapsed && <div className="brand-word">SAMARA</div>}
      </div>
      <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)} title="Collapse navigation">
        <Icon name="layers" size={16} />
      </button>
      <nav>
        {navSections.map(section => (
          <div className="nav-section" key={section.label}>
            {!collapsed && <div className="nav-label">{section.label}</div>}
            {section.items.map(([label, icon, id]) => (
              <button key={id} title={label} onClick={() => setPage(id)} className={`nav-item ${page === id || (page === "campaign-detail" && id === "campaigns") ? "active" : ""}`}>
                <Icon name={icon} size={17} /><span>{label}</span>
                {!collapsed && id === "publishing" && <em>3</em>}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button className="nav-item" onClick={() => setPage("settings")}><Icon name="settings" size={17} /><span>Settings</span></button>
        {!collapsed && <div className="erp-link">← Back to Samara ERP</div>}
      </div>
    </aside>
  );
}

function Topbar({ role, setRole, searchOpen, setSearchOpen }) {
  return (
    <header className="topbar">
      <div className="topbar-search" onClick={() => setSearchOpen(true)}>
        <Icon name="search" size={16} /><span>Search campaigns, content, audiences...</span><kbd>⌘ K</kbd>
      </div>
      <div className="top-actions">
        <select value={role} onChange={e => setRole(e.target.value)} className="role-select">
          <option>Owner / Director</option>
          <option>Marketing Director</option>
          <option>Marketing Team</option>
        </select>
        <button className="icon-btn"><Icon name="bell" size={18} /><b>4</b></button>
        <div className="user-chip"><Avatar name={role === "Owner / Director" ? "Fresa" : role === "Marketing Director" ? "Merryl" : "Osa"} /><span><small>{role}</small>{role === "Owner / Director" ? "Fresa" : role === "Marketing Director" ? "Merryl" : "Osa"}</span><Icon name="chevron" size={14} /></div>
      </div>
    </header>
  );
}

function StatCard({ label, value, change, sub, tone = "green", data }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-row"><strong>{value}</strong>{change && <Badge tone={tone}>{change}</Badge>}</div>
      <div className="stat-bottom"><span>{sub}</span>{data && <Sparkline data={data} color={tone === "green" ? COLORS.green : tone === "red" ? COLORS.red : COLORS.blue} />}</div>
    </div>
  );
}

function Dashboard({ role, onCreate, openCampaign }) {
  const teamView = role === "Marketing Team";
  return (
    <div className="page-wrap">
      <div className="page-head">
        <div><div className="eyebrow">MARKETING</div><h1>{teamView ? "My Marketing Workspace" : "Marketing Command Center"}</h1><p>{teamView ? "Your priorities, publishing queue and active campaign work." : "Group-wide performance, campaign health and decisions requiring attention."}</p></div>
        <div className="head-actions"><Button variant="outline" icon="calendar">Calendar</Button><Button variant="primary" icon="plus" onClick={onCreate}>New campaign</Button></div>
      </div>

      {!teamView ? (
        <>
          <div className="rangebar"><div><button className="range active">This month</button><button className="range">Quarter</button><button className="range">Year</button></div><span>01–20 July 2026 · All brands</span></div>
          <div className="stats-grid five">
            <StatCard label="ATTRIBUTED REVENUE" value="$284,500" change="+31.4%" sub="vs previous period" data={[2,3,4,5,4,7,9]} />
            <StatCard label="MARKETING SPEND" value="$31,840" change="72%" sub="of $44,300 budget" tone="blue" data={[2,2,3,4,5,6,7]} />
            <StatCard label="GROUP ROAS" value="8.9×" change="+1.7×" sub="target 6.0×" data={[3,4,3,5,6,7,8]} />
            <StatCard label="QUALIFIED LEADS" value="126" change="+18.9%" sub="34% qualification rate" data={[2,5,4,6,4,7,8]} />
            <StatCard label="BOOKINGS" value="4" change="2 pending" sub="$196k confirmed" tone="blue" data={[1,1,2,2,2,3,4]} />
          </div>
        </>
      ) : (
        <div className="team-hero">
          <div><span className="team-date">MONDAY · 20 JULY</span><h2>Good morning, Osa.</h2><p>You have 4 priority items and 3 posts scheduled this week.</p></div>
          <div className="team-progress"><Donut value={73} color={COLORS.blue} size={76}/><div><strong>11 of 15</strong><span>weekly tasks completed</span></div></div>
        </div>
      )}

      <div className="dashboard-grid">
        <section className="card campaigns-panel">
          <div className="card-head"><div><h2>{teamView ? "My active campaigns" : "Campaign portfolio"}</h2><p>{teamView ? "Campaigns with work assigned to you" : "Live and upcoming across all brands"}</p></div><button className="text-btn">View all <Icon name="arrow" size={14}/></button></div>
          <div className="campaign-rows">
            {campaigns.slice(0, teamView ? 3 : 4).map(c => (
              <button className="campaign-row" key={c.id} onClick={() => openCampaign(c)}>
                <div className="campaign-thumb" style={{ backgroundImage: `url(${c.image})` }}><span>{c.brand[0]}</span></div>
                <div className="campaign-main"><div><strong>{c.name}</strong><Badge tone={c.statusTone}>{c.status}</Badge></div><span>{c.objective} · {c.period}</span></div>
                <div className="channel-icons">{c.channels.slice(0,4).map((ch,i)=><span key={i}><Icon name={ch} size={14}/></span>)}</div>
                <div className="progress-cell"><div><span>Progress</span><b>{c.progress}%</b></div><div className="progress"><i style={{width:`${c.progress}%`}} /></div></div>
                {!teamView && <div className="row-metric"><span>ROAS</span><strong>{c.roas}</strong></div>}
                <Icon name="arrow" size={16} className="row-arrow"/>
              </button>
            ))}
          </div>
        </section>

        <section className="card attention-panel">
          <div className="card-head"><div><h2>{teamView ? "My priorities" : "Needs attention"}</h2><p>{teamView ? "Ordered by due date" : "Decisions and performance exceptions"}</p></div><Badge tone="red">4</Badge></div>
          <div className="attention-list">
            {tasks.map((task, i) => (
              <div className="attention-item" key={i}>
                <div className={`attention-dot ${task.tone}`}></div>
                <div><strong>{task.title}</strong><span>{task.campaign}</span></div>
                <div className="attention-who"><Avatar name={task.owner} size={25} color={i===0?"#9b6779":"#5b718e"}/><span>{task.due}</span></div>
              </div>
            ))}
          </div>
          <button className="panel-footer">Open work queue <Icon name="arrow" size={14}/></button>
        </section>

        {!teamView && <PerformancePanel />}
        <section className={`card schedule-panel ${teamView ? "wide" : ""}`}>
          <div className="card-head"><div><h2>Upcoming publishing</h2><p>Next 7 days · all selected brands</p></div><button className="text-btn">Calendar <Icon name="arrow" size={14}/></button></div>
          <div className="schedule-days">
            {[['MON','20','2'],['TUE','21','3'],['WED','22','1'],['THU','23','4'],['FRI','24','2'],['SAT','25','1'],['SUN','26','0']].map((d,i)=><div className={i===0?'today':''} key={d[0]}><span>{d[0]}</span><strong>{d[1]}</strong><em className={d[2]==='0'?'empty':''}>{d[2]}</em></div>)}
          </div>
          <div className="next-publish"><div className="media-mini" style={{backgroundImage:`url(${reefImage})`}}><Icon name="image" size={15}/></div><div><strong>Raja Ampat: A World Beyond</strong><span>Instagram Reel · Otium · Today 18:30 WITA</span></div><Badge tone="blue">Ready</Badge><Button variant="outline" icon="phone">Mobile packet</Button></div>
        </section>
      </div>
    </div>
  );
}

function PerformancePanel() {
  return (
    <section className="card performance-panel">
      <div className="card-head"><div><h2>Revenue & marketing spend</h2><p>Attributed revenue versus spend · last 8 weeks</p></div><select className="small-select"><option>All brands</option><option>Otium</option><option>Samara</option></select></div>
      <div className="chart-summary"><div><i className="legend revenue"></i><span>Revenue</span><strong>$284.5k</strong></div><div><i className="legend spend"></i><span>Spend</span><strong>$31.8k</strong></div></div>
      <svg className="line-chart" viewBox="0 0 760 210" preserveAspectRatio="none">
        {[20,60,100,140,180].map(y=><line key={y} x1="40" y1={y} x2="740" y2={y} stroke="#edf0f3" strokeWidth="1" />)}
        <defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2d69e8" stopOpacity=".18"/><stop offset="1" stopColor="#2d69e8" stopOpacity="0"/></linearGradient></defs>
        <path d="M40 180 C100 170 115 135 175 145 S260 92 325 110 S410 65 470 80 S555 44 610 58 S690 26 740 35 L740 190 L40 190Z" fill="url(#area)" />
        <path d="M40 180 C100 170 115 135 175 145 S260 92 325 110 S410 65 470 80 S555 44 610 58 S690 26 740 35" fill="none" stroke="#2d69e8" strokeWidth="3" />
        <path d="M40 185 C120 178 130 181 205 172 S305 168 370 162 S475 159 540 150 S665 145 740 138" fill="none" stroke="#d99a31" strokeWidth="2" strokeDasharray="6 5" />
        {[40,140,240,340,440,540,640,740].map((x,i)=><text key={x} x={x} y="207" textAnchor={i===0?'start':i===7?'end':'middle'} fill="#8a8f98" fontSize="11">W{i+21}</text>)}
      </svg>
    </section>
  );
}

function CampaignsPage({ onCreate, openCampaign }) {
  const [view, setView] = useState("list");
  const [filter, setFilter] = useState("All");
  const filtered = filter === "All" ? campaigns : campaigns.filter(c => c.status === filter);
  return (
    <div className="page-wrap">
      <div className="page-head"><div><div className="eyebrow">MARKETING</div><h1>Campaigns</h1><p>Plan, coordinate, publish and measure every campaign in one place.</p></div><div className="head-actions"><Button variant="outline" icon="filter">Filters</Button><Button variant="primary" icon="plus" onClick={onCreate}>New campaign</Button></div></div>
      <div className="toolbar-card">
        <div className="tabs compact">{["All","Live","In production","Approval","Planning"].map(x=><button className={filter===x?'active':''} key={x} onClick={()=>setFilter(x)}>{x}{x==='All'&&<em>12</em>}</button>)}</div>
        <div className="view-toggle"><button className={view==='list'?'active':''} onClick={()=>setView('list')}><Icon name="layers" size={16}/></button><button className={view==='grid'?'active':''} onClick={()=>setView('grid')}><Icon name="grid" size={16}/></button></div>
      </div>
      <div className={view==='grid'?'campaign-card-grid':'campaign-table card'}>
        {view==='list' && <div className="table-head"><span>Campaign</span><span>Status</span><span>Channels</span><span>Timeline</span><span>Progress</span><span>Budget</span><span>ROAS</span><span></span></div>}
        {filtered.map(c => view==='grid' ? (
          <button className="campaign-card" key={c.id} onClick={()=>openCampaign(c)}>
            <div className="campaign-cover" style={{backgroundImage:`linear-gradient(180deg,transparent 30%,rgba(8,18,30,.8)),url(${c.image})`}}><Badge tone={c.statusTone}>{c.status}</Badge><div><span>{c.brand}</span><h3>{c.name.replace(`${c.brand[0]+c.brand.slice(1).toLowerCase()} · `,'')}</h3></div></div>
            <div className="campaign-card-body"><p>{c.objective}</p><div className="campaign-meta"><span><Icon name="calendar" size={14}/>{c.period}</span><span><Avatar name={c.owner} size={23}/>{c.owner}</span></div><div className="progress-label"><span>Campaign readiness</span><strong>{c.progress}%</strong></div><div className="progress"><i style={{width:`${c.progress}%`}}/></div><div className="campaign-numbers"><div><span>Budget</span><strong>{c.budget}</strong></div><div><span>Revenue</span><strong>{c.revenue}</strong></div><div><span>ROAS</span><strong>{c.roas}</strong></div></div></div>
          </button>
        ) : (
          <button className="table-row" key={c.id} onClick={()=>openCampaign(c)}>
            <span className="campaign-name-cell"><i style={{backgroundImage:`url(${c.image})`}}></i><span><strong>{c.name}</strong><small>{c.objective}</small></span></span>
            <span><Badge tone={c.statusTone}>{c.status}</Badge></span>
            <span className="channel-icons">{c.channels.map((ch,i)=><i key={i}><Icon name={ch} size={13}/></i>)}</span>
            <span className="date-cell">{c.period}</span>
            <span className="table-progress"><span><i style={{width:`${c.progress}%`}}/></span><b>{c.progress}%</b></span>
            <span>{c.budget}</span><span className="roas-cell">{c.roas}</span><Icon name="more" size={17}/>
          </button>
        ))}
      </div>
    </div>
  );
}

function CampaignDetail({ campaign, back, showLanding, showMobile }) {
  const [tab, setTab] = useState("Overview");
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState([
    { name: "Fresa", text: "The headline is approved. Keep the calmer image for the luxury audience.", time: "Today, 10:42" },
    { name: "Gunwa", text: "Updated the Reel and landing-page hero with the new aerial footage.", time: "Today, 12:18" },
  ]);
  const addComment = () => { if(comment.trim()){setComments([...comments,{name:"You",text:comment,time:"Just now"}]);setComment("");}};
  return (
    <div className="campaign-detail">
      <div className="campaign-hero" style={{backgroundImage:`linear-gradient(90deg,rgba(10,20,30,.88),rgba(10,20,30,.42),rgba(10,20,30,.12)),url(${campaign.image})`}}>
        <div className="hero-top"><button onClick={back}><Icon name="arrow" size={15}/> Back to campaigns</button><div><Button variant="glass" icon="eye">Preview</Button><Button variant="white" icon="edit">Edit campaign</Button></div></div>
        <div className="campaign-title"><div className="brand-chip">OTIUM</div><h1>{campaign.name}</h1><p>A coordinated acquisition campaign positioning Otium as the most private way to explore Raja Ampat.</p><div className="hero-meta"><span><Icon name="calendar" size={15}/>{campaign.period}</span><span><Icon name="users" size={15}/>Luxury travellers · Agents · Past guests</span><span><Icon name="globe" size={15}/>US · UK · Europe · Singapore</span></div></div>
      </div>
      <div className="campaign-tabs">{["Overview","Plan & Brief","Channels","Content & Approval","Publishing","Performance"].map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}{t==='Content & Approval'&&<em>2</em>}</button>)}</div>
      {tab === "Overview" && <CampaignOverview campaign={campaign} setTab={setTab} showLanding={showLanding} />}
      {tab === "Plan & Brief" && <PlanBrief comments={comments} comment={comment} setComment={setComment} addComment={addComment} />}
      {tab === "Channels" && <Channels showLanding={showLanding} showMobile={showMobile} />}
      {tab === "Content & Approval" && <ContentApproval showMobile={showMobile} />}
      {tab === "Publishing" && <PublishingPage embedded showMobile={showMobile} />}
      {tab === "Performance" && <AnalyticsPage embedded />}
    </div>
  );
}

function CampaignOverview({ campaign, setTab, showLanding }) {
  return (
    <div className="detail-body">
      <div className="campaign-kpis">
        {[['SPEND',campaign.spent,'44% of budget','blue'],['QUALIFIED LEADS','73','86% of target','green'],['BOOKINGS',campaign.bookings,'1 proposal pending','green'],['REVENUE',campaign.revenue,'Attributed','green'],['ROAS',campaign.roas,'Target 6.0×','green']].map(x=><div key={x[0]}><span>{x[0]}</span><strong>{x[1]}</strong><small className={x[3]}>{x[2]}</small></div>)}
      </div>
      <div className="detail-grid">
        <section className="card channel-work">
          <div className="card-head"><div><h2>Campaign components</h2><p>Progress and results by channel</p></div><button className="text-btn" onClick={()=>setTab('Channels')}>Manage channels <Icon name="arrow" size={14}/></button></div>
          <div className="channel-list">{channelData.map(ch=><button className="channel-row" key={ch.key} onClick={()=>ch.key==='landing' ? showLanding() : setTab('Channels')}><span className="channel-symbol" style={{color:ch.color,background:`${ch.color}12`}}><Icon name={ch.icon} size={18}/></span><span className="channel-desc"><strong>{ch.title}</strong><small>{ch.subtitle}</small></span><span className="channel-status"><Badge tone={ch.status==='Live'?'green':ch.status==='Ready'?'blue':'amber'}>{ch.status}</Badge><small>{ch.due}</small></span><span className="channel-result"><strong>{ch.result}</strong><small>{ch.metric}</small></span><span className="channel-owner"><Avatar name={ch.owner} size={26}/>{ch.owner}</span><Icon name="arrow" size={15}/></button>)}</div>
        </section>
        <aside className="detail-aside">
          <section className="card readiness-card"><div className="card-head"><div><h2>Campaign readiness</h2><p>All launch requirements</p></div><Donut value={88} color={COLORS.green}/></div><div className="readiness-list">{[['Strategy & brief',100],['Audience & markets',100],['Creative production',82],['Approvals',75],['Tracking & attribution',100]].map(([x,n])=><div key={x}><span>{x}</span><div className="progress"><i style={{width:`${n}%`}}/></div><strong>{n}%</strong></div>)}</div></section>
          <section className="card approval-card"><div className="card-head"><div><h2>Approval needed</h2><p>1 item is waiting</p></div><Badge tone="amber">1</Badge></div><div className="approval-preview" style={{backgroundImage:`url(${reefImage})`}}><span><Icon name="image" size={14}/>Instagram Reel</span></div><strong>Raja Ampat: Beyond the Expected</strong><p>Indonesian caption · revised by Osa</p><div><Button variant="outline">Comment</Button><Button variant="primary" icon="check">Approve</Button></div></section>
        </aside>
      </div>
    </div>
  );
}

function PlanBrief({ comments, comment, setComment, addComment }) {
  return (
    <div className="detail-body"><div className="brief-layout">
      <main>
        <section className="card brief-card"><div className="card-head"><div><h2>Campaign brief</h2><p>Approved commercial and creative direction</p></div><Badge tone="green"><Icon name="check" size={12}/> Approved</Badge></div>
          <div className="brief-grid"><div><label>BUSINESS OBJECTIVE</label><strong>Generate qualified 2027 Raja Ampat private-charter enquiries</strong><p>Prioritise full-vessel bookings of 7–10 nights and convert at least three charters during the campaign window.</p></div><div><label>PRIMARY KPI</label><strong>3 confirmed charters</strong><p>Target attributed revenue: USD 294,000</p></div><div><label>CAMPAIGN PROMISE</label><strong>Raja Ampat, entirely on your terms.</strong><p>Private access, effortless service and a yacht designed for unhurried exploration.</p></div><div><label>OFFER</label><strong>Priority 2027 dates</strong><p>Complimentary private transfer for bookings confirmed before 30 September.</p></div></div>
        </section>
        <section className="card audience-card"><div className="card-head"><div><h2>Audience, markets & languages</h2><p>The targeting foundation shared by all selected channels</p></div><Button variant="outline" icon="edit">Edit</Button></div>
          <div className="audience-columns"><div><label>CORE AUDIENCES</label><span>Past luxury charter guests <em>426</em></span><span>High-intent website visitors <em>1,842</em></span><span>Luxury travel agents <em>618</em></span><span>Lookalike: confirmed guests <em>3.1m</em></span></div><div><label>GEOGRAPHIES</label><span>United States</span><span>United Kingdom</span><span>Switzerland · Germany · France</span><span>Singapore · Hong Kong · Australia</span></div><div><label>LANGUAGES</label><span>English <Badge tone="green">Master</Badge></span><span>German</span><span>French</span><span>Indonesian <small>Organic only</small></span></div></div>
        </section>
        <section className="card message-matrix"><div className="card-head"><div><h2>Message & creative matrix</h2><p>One coherent promise, adapted to the purpose of each channel</p></div><Button variant="outline" icon="edit">Edit matrix</Button></div>
          <div className="matrix-table"><div className="matrix-head"><span>Channel</span><span>Role</span><span>Message angle</span><span>Primary CTA</span></div>{[['Meta Ads','Create desire','The rare privilege of space and privacy','Explore Otium'],['Google Search','Capture intent','Private Raja Ampat yacht charter','Request availability'],['Email','Build confidence','Your private journey, thoughtfully arranged','View 2027 journeys'],['Organic Social','Inspire & prove','Quiet moments beyond the familiar routes','Discover Raja Ampat'],['Landing Page','Convert','The complete experience, itinerary and yacht','Plan your journey']].map((r,i)=><div className="matrix-row" key={i}>{r.map((c,j)=><span key={j}>{j===0&&<Icon name={['meta','search','mail','image','globe'][i]} size={15}/>} {c}</span>)}</div>)}</div>
        </section>
      </main>
      <aside><section className="card comments-card"><div className="card-head"><div><h2>Campaign discussion</h2><p>{comments.length} comments</p></div></div><div className="comments">{comments.map((c,i)=><div className="comment" key={i}><Avatar name={c.name} size={28}/><div><strong>{c.name}<small>{c.time}</small></strong><p>{c.text}</p></div></div>)}</div><div className="comment-box"><textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add a campaign comment..."/><Button variant="primary" icon="send" onClick={addComment}>Send</Button></div></section>
        <section className="card campaign-info"><h2>Campaign information</h2>{[['Owner','Merryl'],['Commercial approval','Marc / Fresa'],['Budget approval','Marc'],['Created','02 July 2026'],['Last updated','Today, 12:18']].map(([a,b])=><div key={a}><span>{a}</span><strong>{b}</strong></div>)}</section></aside>
    </div></div>
  );
}

function Channels({ showLanding, showMobile }) {
  return <div className="detail-body"><div className="section-title"><div><h2>Selected campaign components</h2><p>Each component contains only the setup, production and measurement fields it needs.</p></div><Button variant="primary" icon="plus">Add component</Button></div><div className="channel-card-grid">{channelData.map((ch,i)=><div className="channel-card-large" key={ch.key}><div className="channel-card-top"><span className="channel-symbol large" style={{color:ch.color,background:`${ch.color}12`}}><Icon name={ch.icon} size={22}/></span><div><h3>{ch.title}</h3><p>{ch.subtitle}</p></div><Badge tone={ch.status==='Live'?'green':ch.status==='Ready'?'blue':'amber'}>{ch.status}</Badge><button><Icon name="more" size={17}/></button></div><div className="channel-progress"><div><span>Setup & production</span><strong>{ch.progress}%</strong></div><div className="progress"><i style={{width:`${ch.progress}%`,background:ch.color}}/></div></div><div className="channel-card-meta"><div><span>OWNER</span><strong><Avatar name={ch.owner} size={23}/>{ch.owner}</strong></div><div><span>NEXT ACTION</span><strong>{ch.due}</strong></div></div><div className="channel-card-result"><div><span>CURRENT RESULT</span><strong>{ch.result}</strong><small>{ch.metric}</small></div><Button variant="outline" onClick={()=>ch.key==='landing'?showLanding():ch.key==='social'?showMobile():null}>{ch.key==='landing'?'Open builder':ch.key==='social'?'Publishing packet':'Open workspace'} <Icon name="arrow" size={14}/></Button></div></div>)}</div></div>;
}

function ContentApproval({ showMobile }) {
  const [activeAsset,setActiveAsset]=useState(0);
  const assets=[
    {title:'Beyond the Expected',type:'Instagram Reel',status:'Waiting approval',tone:'amber',image:reefImage,format:'9:16 · 00:24',owner:'Osa'},
    {title:'A World Entirely Your Own',type:'Meta Video Ad',status:'Approved',tone:'green',image:yachtImage,format:'4:5 · 00:15',owner:'Gunwa'},
    {title:'2027 Raja Ampat Journeys',type:'Email hero',status:'Approved',tone:'green',image:islandImage,format:'1200 × 680',owner:'Dwi'},
    {title:'Private Raja Ampat Charter',type:'Google display',status:'Revision',tone:'red',image:reefImage,format:'1:1 · Static',owner:'Gunwa'},
  ];
  const a=assets[activeAsset];
  return <div className="detail-body"><div className="content-layout"><section className="card asset-browser"><div className="card-head"><div><h2>Campaign content</h2><p>24 assets · 18 approved · 2 need attention</p></div><div className="asset-controls"><Button variant="outline" icon="filter">Filter</Button><Button variant="primary" icon="plus">New content</Button></div></div><div className="asset-filter-tabs">{['All 24','Needs approval 2','Approved 18','In production 4'].map((x,i)=><button className={i===0?'active':''} key={x}>{x}</button>)}</div><div className="asset-grid">{assets.map((x,i)=><button className={`asset-tile ${i===activeAsset?'active':''}`} onClick={()=>setActiveAsset(i)} key={x.title}><div style={{backgroundImage:`url(${x.image})`}}><Badge tone={x.tone}>{x.status}</Badge><span>{x.format}</span></div><h3>{x.title}</h3><p>{x.type}</p><span className="asset-owner"><Avatar name={x.owner} size={21}/>{x.owner}</span></button>)}</div></section><aside className="card review-panel"><div className="review-head"><div><span>{a.type}</span><h2>{a.title}</h2></div><button><Icon name="close" size={18}/></button></div><div className="phone-preview"><div className="phone-frame"><div className="phone-bar"></div><div className="phone-media" style={{backgroundImage:`linear-gradient(0deg,rgba(0,0,0,.55),transparent 55%),url(${a.image})`}}><div className="phone-copy"><span>OTIUM</span><strong>RAJA AMPAT</strong><em>Beyond the expected</em></div></div><div className="phone-actions">♡　◯　⌁</div><div className="phone-caption"><strong>otiumyacht</strong> There are places that reward slowing down...</div></div></div><div className="version-line"><span>Version 4 · English</span><button><Icon name="layers" size={14}/> Version history</button></div><div className="review-copy"><label>CAPTION</label><p>There are places that reward slowing down. Raja Ampat, experienced privately aboard Otium—entirely on your terms.</p><button>Show full caption</button></div><div className="review-note"><Avatar name="Fresa" size={27}/><div><strong>Fresa <small>Today, 10:42</small></strong><p>Use the quieter opening shot. It feels more Otium and less like a generic travel Reel.</p></div></div><div className="review-actions"><Button variant="outline" icon="comment">Request changes</Button><Button variant="primary" icon="check">Approve content</Button></div><button className="mobile-link" onClick={showMobile}><Icon name="phone" size={15}/> View mobile publishing packet</button></aside></div></div>;
}

function LandingBuilder({ close, notify }) {
  const [mode,setMode]=useState('Desktop');
  const [blocks,setBlocks]=useState([
    {name:'Hero',on:true},{name:'Campaign introduction',on:true},{name:'Experience highlights',on:true},{name:'Yacht & suites',on:true},{name:'Sample itinerary',on:true},{name:'Guest stories',on:false},{name:'Enquiry form',on:true},{name:'FAQ',on:true}
  ]);
  const toggle=i=>setBlocks(blocks.map((b,j)=>j===i?{...b,on:!b.on}:b));
  return <div className="builder-overlay"><div className="builder-shell"><header><div><button onClick={close}><Icon name="close" size={17}/></button><div><span>LANDING PAGE BUILDER</span><strong>Otium · Raja Ampat 2027</strong></div></div><div className="builder-actions"><span className="saved"><Icon name="check" size={13}/> Saved</span><Button variant="outline" icon="eye">Preview</Button><Button variant="primary" icon="external" onClick={()=>notify('Landing page published to staging')}>Publish changes</Button></div></header><div className="builder-body"><aside className="block-sidebar"><div className="builder-site"><span>Publishing to</span><strong><i>O</i> otiumyacht.com</strong><small>/raja-ampat-private-charter</small></div><h3>PAGE STRUCTURE</h3><div className="block-list">{blocks.map((b,i)=><button className={!b.on?'off':''} key={b.name}><Icon name="layers" size={14}/><span>{b.name}</span><label onClick={(e)=>{e.stopPropagation();toggle(i)}}><input type="checkbox" checked={b.on} readOnly/><i></i></label><Icon name="more" size={14}/></button>)}</div><Button variant="outline" icon="plus" className="add-block">Add approved block</Button><div className="page-settings"><h3>PAGE SETTINGS</h3><button><Icon name="globe" size={15}/>SEO & URL<Icon name="arrow" size={13}/></button><button><Icon name="chart" size={15}/>Tracking & attribution<Icon name="arrow" size={13}/></button><button><Icon name="layers" size={15}/>Languages & variants<Badge tone="blue">3</Badge></button></div></aside><main className="builder-canvas"><div className="canvas-toolbar"><div>{['Desktop','Mobile'].map(x=><button className={mode===x?'active':''} onClick={()=>setMode(x)} key={x}><Icon name={x==='Desktop'?'grid':'phone'} size={14}/>{x}</button>)}</div><span>Draft preview · Otium brand system</span><div><button>75%</button><button><Icon name="more" size={15}/></button></div></div><div className={`webpage-preview ${mode==='Mobile'?'mobile':''}`}><div className="site-nav"><b>OTIUM</b><span>EXPERIENCE　 DESTINATIONS　 THE YACHT　 JOURNAL</span><button>ENQUIRE</button></div>{blocks[0].on&&<section className="web-hero" style={{backgroundImage:`linear-gradient(90deg,rgba(5,18,25,.45),rgba(5,18,25,.05)),url(${yachtImage})`}}><div className="editable-tag">Hero · Click to edit</div><div><span>PRIVATE VOYAGES · 2027</span><h1>Raja Ampat,<br/><em>entirely on your terms.</em></h1><p>A private journey through the world's most extraordinary archipelago, aboard a yacht created for unhurried exploration.</p><button>PLAN YOUR JOURNEY</button></div></section>}{blocks[1].on&&<section className="web-intro"><span>THE LAST PARADISE</span><h2>Some places should never be rushed.</h2><p>Far from fixed itineraries and familiar routes, Otium gives you the freedom to explore Raja Ampat according to the rhythm of your own journey.</p></section>}{blocks[2].on&&<section className="web-highlights"><div style={{backgroundImage:`url(${reefImage})`}}></div><div><span>THE EXPERIENCE</span><h2>Awake somewhere<br/>no one else can reach.</h2><p>Private anchorages, pristine reefs and days shaped around you.</p><a>DISCOVER THE EXPERIENCE →</a></div></section>}{blocks[6].on&&<section className="web-form"><span>BEGIN YOUR JOURNEY</span><h2>Request 2027 availability</h2><div><input placeholder="Your name"/><input placeholder="Email address"/><button>REQUEST A PROPOSAL</button></div></section>}<footer>OTIUM　 ·　 PRIVATE VOYAGES IN INDONESIA</footer></div></main><aside className="property-panel"><div className="property-head"><h3>Hero block</h3><button><Icon name="close" size={15}/></button></div><label>EYEBROW</label><input defaultValue="PRIVATE VOYAGES · 2027"/><label>HEADLINE</label><textarea defaultValue={"Raja Ampat, entirely on your terms."}/><label>SUPPORTING TEXT</label><textarea rows="4" defaultValue={"A private journey through the world's most extraordinary archipelago, aboard a yacht created for unhurried exploration."}/><label>PRIMARY ACTION</label><input defaultValue="Plan your journey"/><label>BACKGROUND MEDIA</label><div className="media-picker" style={{backgroundImage:`url(${yachtImage})`}}><button>Replace</button></div><div className="approval-state"><span><Icon name="check" size={15}/>Block approved</span><small>Fresa · 18 Jul, 16:40</small></div></aside></div></div></div>;
}

function MobilePacket({ close, notify }) {
  const [checked,setChecked]=useState([true,true,false,false]);
  const toggle=i=>setChecked(checked.map((x,j)=>j===i?!x:x));
  return <div className="modal-backdrop"><div className="mobile-packet"><div className="modal-head"><div><span className="modal-kicker">MOBILE PUBLISHING PACKET</span><h2>Raja Ampat: Beyond the Expected</h2><p>Instagram Reel · @otiumyacht · Today, 18:30 WITA</p></div><button onClick={close}><Icon name="close" size={19}/></button></div><div className="packet-body"><div className="packet-media" style={{backgroundImage:`linear-gradient(0deg,rgba(0,0,0,.5),transparent),url(${reefImage})`}}><span>00:24 · 1080 × 1920</span><button><Icon name="arrow" size={15}/>Download final Reel</button></div><div className="packet-details"><div className="packet-ready"><Icon name="check" size={18}/><div><strong>Approved and ready</strong><span>Final version approved by Fresa</span></div></div><label>CAPTION <button onClick={()=>notify('Caption copied')}>Copy</button></label><div className="copy-box">There are places that reward slowing down. Raja Ampat, experienced privately aboard Otium—entirely on your terms.<br/><br/>Discover 2027 private journeys via the link in our bio.</div><label>POSTING INSTRUCTIONS</label><div className="instruction-list">{['Download the final Reel to the publishing iPhone','Copy the approved caption','Add audio: “Ocean Eyes – Instrumental” at 18%','Publish and paste the live post link below'].map((x,i)=><button key={x} onClick={()=>toggle(i)}><span className={checked[i]?'checked':''}>{checked[i]&&<Icon name="check" size={13}/>}</span>{x}</button>)}</div><label>AFTER PUBLISHING</label><div className="link-input"><Icon name="link" size={15}/><input placeholder="Paste Instagram post link"/><button onClick={()=>notify('Post marked as published')}>Confirm live</button></div><p className="tracking-note"><Icon name="chart" size={14}/>Performance will be imported automatically after the live URL is confirmed.</p></div></div></div></div>;
}

function CreateCampaign({ close, finish }) {
  const [step,setStep]=useState(1);
  const [name,setName]=useState('');
  const [brand,setBrand]=useState('Otium');
  const [channels,setChannels]=useState(['Email','Organic Social','Meta Ads','Landing Page']);
  const choices=[['Email','mail'],['WhatsApp','message'],['Organic Social','image'],['Meta Ads','meta'],['Google Ads','search'],['Landing Page','globe'],['Agent Outreach','users'],['Other Activity','plus']];
  const toggle=x=>setChannels(channels.includes(x)?channels.filter(c=>c!==x):[...channels,x]);
  return <div className="modal-backdrop"><div className="create-modal"><div className="modal-head"><div><span className="modal-kicker">NEW CAMPAIGN</span><h2>{step===1?'Define the campaign':step===2?'Choose campaign components':step===3?'Audience & markets':'Review and create'}</h2><p>{step===1?'Start with the commercial purpose. Details can be completed with the team later.':step===2?'Select only the channels and activities this campaign needs.':step===3?'Set the shared targeting foundation for all selected components.':'The system will create the required workspaces, tasks and reporting.'}</p></div><button onClick={close}><Icon name="close" size={19}/></button></div><div className="wizard-steps">{['Campaign','Components','Audience','Create'].map((x,i)=><div className={step>i?'done':step===i+1?'active':''} key={x}><span>{step>i?<Icon name="check" size={13}/>:i+1}</span><b>{x}</b></div>)}</div><div className="wizard-content">{step===1&&<div className="form-grid"><label className="full">Campaign name<input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Otium Raja Ampat 2027"/></label><label>Brand<select value={brand} onChange={e=>setBrand(e.target.value)}><option>Otium</option><option>Samara</option><option>Mischief</option><option>Siloina</option><option>Boutique Yachts</option><option>Bayview</option></select></label><label>Campaign owner<select><option>Merryl</option><option>Jay</option><option>Osa</option><option>Eirin</option></select></label><label>Primary objective<select><option>Generate qualified enquiries</option><option>Sell specific dates</option><option>Build brand awareness</option><option>Agent acquisition</option><option>Guest retention</option></select></label><label>Target result<input placeholder="e.g. 3 confirmed charters"/></label><label>Start date<input type="date" defaultValue="2026-08-01"/></label><label>End date<input type="date" defaultValue="2026-11-30"/></label><label className="full">Short description<textarea placeholder="What should this campaign achieve, and why now?"/></label></div>}{step===2&&<div><div className="component-picker">{choices.map(([x,icon])=><button className={channels.includes(x)?'selected':''} onClick={()=>toggle(x)} key={x}><span><Icon name={icon} size={22}/></span><strong>{x}</strong><small>{x==='Email'?'Mailings and journeys':x==='WhatsApp'?'Broadcasts and follow-up':x==='Organic Social'?'Posts, Stories and Reels':x==='Meta Ads'?'Campaigns, ad sets and ads':x==='Google Ads'?'Search, display and video':x==='Landing Page'?'Build and publish to website':x==='Agent Outreach'?'Personal and bulk outreach':'Events, PR or offline work'}</small><i>{channels.includes(x)&&<Icon name="check" size={14}/>}</i></button>)}</div><div className="selection-note"><Icon name="spark" size={18}/><div><strong>{channels.length} components selected</strong><p>The campaign will receive a shared brief plus dedicated production, approval, publishing and KPI sections for each component.</p></div></div></div>}{step===3&&<div className="audience-form"><div className="form-grid"><label className="full">Audience segments<div className="tag-input"><span>Past luxury guests ×</span><span>High-intent website visitors ×</span><span>Luxury travel agents ×</span><input placeholder="Add audience..."/></div></label><label className="full">Markets<div className="tag-input"><span>United States ×</span><span>United Kingdom ×</span><span>Europe ×</span><span>Singapore ×</span><input placeholder="Add country or region..."/></div></label><label>Master language<select><option>English</option><option>Indonesian</option><option>German</option></select></label><label>Additional languages<div className="tag-input small"><span>German ×</span><span>French ×</span><input placeholder="Add..."/></div></label><label className="full">Exclusions<div className="tag-input"><span>Already booked for 2027 ×</span><span>Unsubscribed contacts ×</span><input placeholder="Add exclusion..."/></div></label></div><div className="audience-estimate"><Icon name="users" size={24}/><div><span>ESTIMATED REACHABLE CRM AUDIENCE</span><strong>4,286 known contacts</strong><small>Advertising audiences are calculated after account sync.</small></div></div></div>}{step===4&&<div className="review-create"><div className="review-brand"><span>{brand[0]}</span><div><small>{brand.toUpperCase()}</small><h3>{name||`${brand} New Campaign`}</h3><p>Qualified enquiries · 01 Aug – 30 Nov 2026</p></div><Badge tone="gray">Draft</Badge></div><div className="review-summary"><div><span>COMPONENTS</span><strong>{channels.length}</strong><small>{channels.join(' · ')}</small></div><div><span>MARKETS</span><strong>4 regions</strong><small>US · UK · Europe · Singapore</small></div><div><span>KNOWN AUDIENCE</span><strong>4,286</strong><small>Before paid-media expansion</small></div></div><div className="generated-list"><h3>What the system will create</h3>{['Shared campaign brief and message matrix',`${channels.length} component workspaces with setup checklists`,'Production tasks assigned from your team rules','Approval gates only where your campaign rules require them','Publishing schedule and performance dashboard'].map(x=><div key={x}><Icon name="check" size={15}/>{x}</div>)}</div></div>}</div><div className="wizard-footer"><Button variant="outline" onClick={()=>step===1?close():setStep(step-1)}>{step===1?'Cancel':'Back'}</Button><span>Step {step} of 4</span><Button variant="primary" onClick={()=>step<4?setStep(step+1):finish(name||`${brand} New Campaign`)} disabled={step===1&&!name.trim()}>{step===4?'Create campaign':'Continue'} {step<4&&<Icon name="arrow" size={14}/>}</Button></div></div></div>;
}

function PublishingPage({ embedded=false, showMobile }) {
  return <div className={embedded?'detail-body':'page-wrap'}>{!embedded&&<div className="page-head"><div><div className="eyebrow">CREATE & PUBLISH</div><h1>Publishing Center</h1><p>Everything approved, packaged and ready for the right channel.</p></div><Button variant="primary" icon="calendar">Schedule content</Button></div>}<div className="publishing-layout"><section className="card week-calendar"><div className="card-head"><div><h2>This week</h2><p>20–26 July · 13 scheduled items</p></div><div className="week-nav"><button>‹</button><button>Today</button><button>›</button></div></div><div className="calendar-grid"><div className="time-col"><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span></div>{['MON 20','TUE 21','WED 22','THU 23','FRI 24','SAT 25','SUN 26'].map((d,i)=><div className={`calendar-day ${i===0?'today':''}`} key={d}><strong>{d}</strong>{i===0&&<button className="cal-item pink" style={{top:150}} onClick={showMobile}>Otium Reel<small>18:30</small></button>}{i===1&&<><button className="cal-item purple" style={{top:45}}>Otium Email<small>10:00</small></button><button className="cal-item blue" style={{top:112}}>Meta refresh<small>15:15</small></button></>}{i===2&&<button className="cal-item green" style={{top:82}}>WA Agents<small>12:30</small></button>}{i===3&&<><button className="cal-item pink" style={{top:35}}>Samara Post<small>09:30</small></button><button className="cal-item yellow" style={{top:145}}>Mischief Story<small>18:00</small></button></>}{i===4&&<button className="cal-item purple" style={{top:70}}>Agent Email<small>12:00</small></button>}</div>)}</div></section><aside className="card ready-queue"><div className="card-head"><div><h2>Ready to publish</h2><p>3 mobile handoffs required</p></div><Badge tone="blue">3</Badge></div>{[['Otium','Raja Ampat: Beyond the Expected','Instagram Reel','Today 18:30',reefImage],['Samara','Seven Days Further','Instagram Carousel','Thu 09:30',islandImage],['Mischief','The Crossing','Instagram Story','Thu 18:00',yachtImage]].map((x,i)=><button className="queue-item" key={x[1]} onClick={showMobile}><i style={{backgroundImage:`url(${x[4]})`}}></i><div><span>{x[0]}</span><strong>{x[1]}</strong><small>{x[2]} · {x[3]}</small></div><Icon name="phone" size={17}/></button>)}</aside></div></div>;
}

function AnalyticsPage({ embedded=false }) {
  const [metric,setMetric]=useState('Revenue');
  return <div className={embedded?'detail-body':'page-wrap'}>{!embedded&&<div className="page-head"><div><div className="eyebrow">MEASURE</div><h1>Marketing Performance</h1><p>From channel activity to qualified leads, bookings and attributable revenue.</p></div><div className="head-actions"><Button variant="outline" icon="calendar">01–20 July</Button><Button variant="primary" icon="layers">Create report</Button></div></div>}<div className="analytics-filter"><select><option>All brands</option><option>Otium</option><option>Samara</option></select><select><option>All campaigns</option><option>Otium · Raja Ampat 2027</option></select><select><option>All channels</option><option>Meta Ads</option><option>Google Ads</option></select><span>Attribution: Data-driven · 90 days</span></div><div className="stats-grid five"><StatCard label="SPEND" value="$31,840" change="72%" sub="of monthly budget" tone="blue"/><StatCard label="REACH" value="1.24m" change="+22.4%" sub="across paid + organic"/><StatCard label="QUALIFIED LEADS" value="126" change="+18.9%" sub="$253 blended CPL"/><StatCard label="BOOKINGS" value="4" change="2 pending" sub="3.2% lead-to-booking" tone="blue"/><StatCard label="ATTRIBUTED REVENUE" value="$284.5k" change="8.9× ROAS" sub="High confidence"/></div><div className="analytics-grid"><section className="card big-chart"><div className="card-head"><div><h2>Performance over time</h2><p>Daily results across the selected scope</p></div><div className="metric-tabs">{['Revenue','Leads','ROAS'].map(x=><button className={metric===x?'active':''} onClick={()=>setMetric(x)} key={x}>{x}</button>)}</div></div><div className="big-chart-value"><strong>{metric==='Revenue'?'$284,500':metric==='Leads'?'126':'8.9×'}</strong><Badge tone="green">+31.4%</Badge><span>vs previous period</span></div><svg viewBox="0 0 850 290" preserveAspectRatio="none">{[35,90,145,200,255].map(y=><line x1="35" x2="830" y1={y} y2={y} stroke="#edf0f3" key={y}/>)}<defs><linearGradient id="analyticsArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2563eb" stopOpacity=".22"/><stop offset="1" stopColor="#2563eb" stopOpacity="0"/></linearGradient></defs><path d="M35 240 C85 235 105 200 150 211 S215 150 265 173 S330 125 380 140 S450 82 500 103 S565 58 620 79 S700 50 745 62 S790 30 830 39 L830 265 L35 265Z" fill="url(#analyticsArea)"/><path d="M35 240 C85 235 105 200 150 211 S215 150 265 173 S330 125 380 140 S450 82 500 103 S565 58 620 79 S700 50 745 62 S790 30 830 39" fill="none" stroke="#2563eb" strokeWidth="3"/>{[35,170,305,440,575,710,830].map((x,i)=><text x={x} y="285" textAnchor={i===0?'start':i===6?'end':'middle'} fill="#8a8f98" fontSize="11" key={x}>{['01 Jul','04 Jul','07 Jul','10 Jul','13 Jul','16 Jul','20 Jul'][i]}</text>)}</svg></section><section className="card attribution-card"><div className="card-head"><div><h2>Attributed revenue</h2><p>By marketing channel</p></div><button><Icon name="more" size={17}/></button></div><div className="attribution-donut"><div className="donut-large"><div></div><span><strong>$284k</strong>Total revenue</span></div><div className="donut-legend">{[['Meta Ads','$126k','44%','#2563eb'],['Google Ads','$84k','30%','#e4a037'],['Email','$49k','17%','#9b6ac7'],['Organic social','$25.5k','9%','#ef5a80']].map(x=><div key={x[0]}><i style={{background:x[3]}}></i><span>{x[0]}</span><strong>{x[1]}</strong><em>{x[2]}</em></div>)}</div></div></section><section className="card channel-table-panel"><div className="card-head"><div><h2>Channel performance</h2><p>Commercial and engagement metrics</p></div><button className="text-btn">Full breakdown <Icon name="arrow" size={14}/></button></div><div className="performance-table"><div className="p-head"><span>Channel</span><span>Spend</span><span>Reach</span><span>Leads</span><span>CPL</span><span>Bookings</span><span>Revenue</span><span>ROAS</span></div>{[['Meta Ads','$14,780','824k','71','$208','2','$126,000','8.5×','meta','#2776e8'],['Google Ads','$9,340','112k','31','$301','1','$84,000','9.0×','search','#4285f4'],['Email','$2,160','42k','18','$120','1','$49,000','22.7×','mail','#9b6ac7'],['Organic Social','$5,560','268k','6','$927','0','$25,500','4.6×','image','#ef4d7a']].map((r,i)=><div className="p-row" key={r[0]}>{r.slice(0,8).map((x,j)=><span key={j} className={j===7?'strong-green':''}>{j===0&&<i style={{color:r[9],background:`${r[9]}12`}}><Icon name={r[8]} size={14}/></i>}{x}</span>)}</div>)}</div></section></div></div>;
}

function PlaceholderPage({ page, onCreate }) {
  const info={calendar:['Content Calendar','See every campaign, mailing, advertisement and social post in one coordinated schedule.','calendar'],automations:['Marketing Automations','Build behavioural, lifecycle and trip-based journeys using live ERP data.','bolt'],audiences:['Audiences & Segments','Create reusable CRM, guest, agent and behavioural audiences for every channel.','users'],content:['Content Studio','Develop, version, comment on and approve campaign content across formats and languages.','pen'],landing:['Landing Pages','Build approved campaign pages and publish them directly to each brand website.','globe'],assets:['Asset Library','One searchable source for approved images, videos, logos and campaign files.','image'],reports:['Marketing Reports','Scheduled management reports, campaign reviews and reusable learnings.','layers'],settings:['Marketing Settings','Brands, integrations, attribution rules, permissions and approval policies.','settings']}[page]||['Marketing','Campaign operations','grid'];
  const cards=page==='automations'?[['Pre-trip guest journey','Active','Runs 14, 7 and 2 days before departure'],['Post-trip follow-up','Active','Feedback, review and return offer'],['Returning website visitor','Draft','High-intent visitor email within 3 hours'],['Guest birthday','Active','Personal birthday message and offer']]:page==='audiences'?[['Past luxury charter guests','426 contacts','Synced 12 min ago'],['Agents & multipliers','1,284 contacts','38 countries'],['High-intent website visitors','1,842 contacts','Last 30 days'],['Open-trip guests','4,612 contacts','All historical guests']]:[['Campaign workspace','Connected','Shared across the marketing process'],['Approval rules','Configured','Routine work uses team autonomy'],['Brand templates','6 active','Otium, Samara, Mischief, Siloina + hotels'],['ERP attribution','Connected','Leads, bookings and revenue']];
  return <div className="page-wrap"><div className="page-head"><div><div className="eyebrow">MARKETING</div><h1>{info[0]}</h1><p>{info[1]}</p></div><Button variant="primary" icon="plus" onClick={onCreate}>Create new</Button></div><div className="placeholder-hero card"><span><Icon name={info[2]} size={30}/></span><div><h2>{info[0]}</h2><p>This module is included in the system structure and shares the same campaign, audience, content and attribution data.</p></div><Badge tone="green">Connected</Badge></div><div className="module-grid">{cards.map((x,i)=><div className="module-card card" key={x[0]}><div><span className={`module-icon mi-${i}`}><Icon name={info[2]} size={18}/></span><Badge tone={x[1]==='Active'||x[1]==='Connected'?'green':x[1]==='Draft'?'gray':'blue'}>{x[1]}</Badge></div><h3>{x[0]}</h3><p>{x[2]}</p><button>Open <Icon name="arrow" size={14}/></button></div>)}</div></div>;
}

function SearchOverlay({ close, openCampaign }) {
  return <div className="search-overlay" onClick={close}><div className="search-modal" onClick={e=>e.stopPropagation()}><div className="search-field"><Icon name="search" size={19}/><input autoFocus placeholder="Search campaigns, content, audiences..."/><kbd>ESC</kbd></div><div className="search-section"><span>RECENT</span>{campaigns.slice(0,3).map(c=><button key={c.id} onClick={()=>{openCampaign(c);close()}}><i style={{backgroundImage:`url(${c.image})`}}></i><div><strong>{c.name}</strong><small>{c.status} · {c.objective}</small></div><Badge tone={c.statusTone}>{c.status}</Badge></button>)}</div><div className="search-hint"><span>↑↓ Navigate</span><span>↵ Open</span><span>Esc Close</span></div></div></div>;
}

export default function App() {
  const [page,setPage]=useState('dashboard');
  const [role,setRole]=useState('Owner / Director');
  const [collapsed,setCollapsed]=useState(false);
  const [campaign,setCampaign]=useState(campaigns[0]);
  const [createOpen,setCreateOpen]=useState(false);
  const [landingOpen,setLandingOpen]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [toast,setToast]=useState('');
  const notify=(text)=>{setToast(text);setTimeout(()=>setToast(''),2600)};
  const openCampaign=c=>{setCampaign(c);setPage('campaign-detail')};
  const finishCampaign=name=>{setCreateOpen(false);notify(`${name} created as a draft`);setPage('campaigns')};
  const content=useMemo(()=>{
    if(page==='dashboard') return <Dashboard role={role} onCreate={()=>setCreateOpen(true)} openCampaign={openCampaign}/>;
    if(page==='campaigns') return <CampaignsPage onCreate={()=>setCreateOpen(true)} openCampaign={openCampaign}/>;
    if(page==='campaign-detail') return <CampaignDetail campaign={campaign} back={()=>setPage('campaigns')} showLanding={()=>setLandingOpen(true)} showMobile={()=>setMobileOpen(true)}/>;
    if(page==='publishing') return <PublishingPage showMobile={()=>setMobileOpen(true)}/>;
    if(page==='analytics') return <AnalyticsPage/>;
    return <PlaceholderPage page={page} onCreate={()=>setCreateOpen(true)}/>;
  },[page,role,campaign]);
  return <div className="app-shell">
    <style>{styles}</style>
    <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed}/>
    <div className="main-shell"><Topbar role={role} setRole={setRole} searchOpen={searchOpen} setSearchOpen={setSearchOpen}/><main>{content}</main></div>
    {createOpen&&<CreateCampaign close={()=>setCreateOpen(false)} finish={finishCampaign}/>} 
    {landingOpen&&<LandingBuilder close={()=>setLandingOpen(false)} notify={notify}/>} 
    {mobileOpen&&<MobilePacket close={()=>setMobileOpen(false)} notify={notify}/>} 
    {searchOpen&&<SearchOverlay close={()=>setSearchOpen(false)} openCampaign={openCampaign}/>} 
    {toast&&<div className="toast"><Icon name="check" size={16}/>{toast}</div>}
  </div>;
}

const styles = `
*{box-sizing:border-box}html,body,#root{margin:0;min-height:100%;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:${COLORS.ink};background:${COLORS.bg}}button,input,select,textarea{font:inherit}button{cursor:pointer}.app-shell{min-height:100vh;display:flex;background:#f7f8fa}.sidebar{position:fixed;inset:0 auto 0 0;width:226px;background:#fff;border-right:1px solid #e3e6e9;z-index:20;display:flex;flex-direction:column;transition:.2s}.sidebar.collapsed{width:68px}.brand{height:74px;display:flex;align-items:center;padding:0 23px;border-bottom:1px solid #eef0f2;gap:13px}.brand-mark{width:31px;height:31px;position:relative;overflow:hidden}.brand-mark span{position:absolute;left:1px;width:28px;height:8px;border:2px solid #c4ae7d;border-radius:50%;transform:rotate(-10deg)}.brand-mark span:nth-child(1){top:4px}.brand-mark span:nth-child(2){top:11px}.brand-mark span:nth-child(3){top:18px}.brand-word{font-family:Georgia,serif;font-size:17px;letter-spacing:5px;font-weight:700}.collapse-btn{position:absolute;right:-13px;top:87px;width:26px;height:26px;border:1px solid #dfe3e7;background:#fff;border-radius:6px;display:grid;place-items:center;color:#6f747b}.sidebar nav{padding:22px 10px;overflow:auto}.nav-section{margin-bottom:24px}.nav-label{font-size:10px;letter-spacing:.08em;color:#969ba3;padding:0 11px;margin-bottom:8px;font-weight:700}.nav-item{width:100%;height:38px;border:0;border-radius:7px;background:transparent;display:flex;align-items:center;gap:11px;padding:0 11px;color:#4d5158;text-align:left;position:relative}.nav-item:hover{background:#f6f7f8}.nav-item.active{background:#f0f2f4;color:#17191c;font-weight:650}.nav-item.active:before{content:"";position:absolute;left:-10px;width:3px;height:22px;border-radius:0 3px 3px 0;background:#b99e68}.nav-item span{font-size:13px;white-space:nowrap}.nav-item em{margin-left:auto;background:#edf3ff;color:#2563eb;font-style:normal;font-size:10px;font-weight:700;border-radius:8px;padding:2px 6px}.collapsed .brand{padding:0 18px}.collapsed .nav-item{justify-content:center;padding:0}.collapsed .nav-item span,.collapsed .nav-label,.collapsed .nav-item em{display:none}.sidebar-bottom{margin-top:auto;padding:12px 10px 20px;border-top:1px solid #edf0f2}.erp-link{font-size:11px;color:#9a9ea4;padding:12px 11px 0}.main-shell{margin-left:226px;width:calc(100% - 226px);transition:.2s}.collapsed+.main-shell{margin-left:68px;width:calc(100% - 68px)}.topbar{height:64px;background:#fff;border-bottom:1px solid #e5e8eb;display:flex;align-items:center;justify-content:space-between;padding:0 28px;position:sticky;top:0;z-index:15}.topbar-search{height:34px;width:min(420px,38vw);border:1px solid #e0e3e7;border-radius:7px;display:flex;align-items:center;gap:9px;padding:0 11px;color:#8b9098;cursor:text}.topbar-search span{font-size:12px;flex:1}.topbar-search kbd{border:1px solid #e2e5e8;background:#f8f9fa;border-radius:4px;font-size:10px;padding:2px 5px}.top-actions,.user-chip,.head-actions,.btn,.stat-row,.stat-bottom,.card-head,.campaign-row,.channel-icons,.rangebar,.team-progress,.attention-item,.attention-who,.next-publish,.hero-top,.hero-top>div,.hero-meta,.channel-row,.channel-owner,.channel-card-top,.channel-card-meta,.channel-card-result,.asset-controls,.asset-owner,.review-note,.review-actions,.mobile-link,.builder-shell header,.builder-shell header>div,.builder-actions,.site-nav,.modal-head,.packet-ready,.link-input,.wizard-footer,.review-brand,.placeholder-hero,.module-card>div,.search-section button,.search-hint{display:flex;align-items:center}.top-actions{gap:14px}.role-select,.small-select{border:1px solid #e0e3e7;border-radius:6px;background:#fff;color:#555b63;height:32px;padding:0 28px 0 10px;font-size:11px}.icon-btn{border:0;background:transparent;position:relative;color:#60656c}.icon-btn b{position:absolute;right:-4px;top:-5px;background:#ef4444;color:#fff;border:2px solid white;width:16px;height:16px;border-radius:50%;font-size:8px;display:grid;place-items:center}.user-chip{gap:8px}.user-chip>span{display:flex;flex-direction:column;font-size:12px;font-weight:650;line-height:1.2}.user-chip small{font-size:9px;color:#9b77d0;font-weight:700}.avatar{border-radius:50%;color:#fff;display:inline-grid;place-items:center;font-size:10px;font-weight:700;flex:none}.page-wrap,.detail-body{padding:28px 30px 46px;max-width:1720px;margin:0 auto}.page-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px}.eyebrow,.modal-kicker{font-size:10px;letter-spacing:.12em;font-weight:750;color:#9b7c43;margin-bottom:6px}.page-head h1{font-size:27px;margin:0 0 6px;letter-spacing:-.03em}.page-head p{margin:0;color:#767b83;font-size:13px}.head-actions{gap:9px}.btn{border:1px solid #dfe3e7;border-radius:6px;height:35px;padding:0 13px;gap:7px;font-size:12px;font-weight:650;justify-content:center}.btn-default,.btn-outline{background:#fff;color:#444950}.btn-primary{background:#22262b;border-color:#22262b;color:#fff}.btn-primary:hover{background:#0d0f11}.btn-glass{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.3);color:#fff}.btn-white{background:#fff;color:#222;border-color:#fff}.btn:disabled{opacity:.4;cursor:not-allowed}.rangebar{height:42px;justify-content:space-between;border-bottom:1px solid #e3e6e9;margin-bottom:15px}.rangebar>div{display:flex;gap:18px}.range{border:0;background:none;padding:0 0 11px;color:#7c8189;font-size:11px}.range.active{color:#202327;font-weight:700;border-bottom:2px solid #202327}.rangebar>span{font-size:11px;color:#8b9097}.stats-grid{display:grid;gap:12px;margin-bottom:15px}.stats-grid.five{grid-template-columns:repeat(5,1fr)}.stat-card,.card,.toolbar-card,.campaign-card,.channel-card-large{background:#fff;border:1px solid #e2e5e8;border-radius:10px;box-shadow:0 1px 2px rgba(16,24,40,.035)}.stat-card{padding:17px 18px;min-height:118px}.stat-label{font-size:9px;color:#8b9098;letter-spacing:.08em;font-weight:750}.stat-row{justify-content:space-between;margin-top:10px}.stat-row strong{font-size:24px;letter-spacing:-.03em}.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:99px;font-size:9px;font-weight:700;white-space:nowrap}.badge-green{color:#087b4c;background:#e6f7ee}.badge-blue{color:#2864d7;background:#eaf1ff}.badge-amber{color:#996313;background:#fff2d8}.badge-red{color:#bd3c3c;background:#fdecec}.badge-gray{color:#626872;background:#eef0f2}.stat-bottom{height:34px;margin-top:5px;justify-content:space-between}.stat-bottom>span{font-size:10px;color:#92969d}.sparkline{width:65px;height:32px;overflow:visible}.dashboard-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(320px,.85fr);gap:14px}.campaigns-panel,.performance-panel{min-width:0}.card-head{min-height:68px;padding:0 18px;justify-content:space-between;border-bottom:1px solid #edf0f2}.card-head h2{font-size:14px;margin:0 0 4px}.card-head p{font-size:10px;color:#8b9097;margin:0}.text-btn{border:0;background:none;color:#2764d9;font-size:10px;font-weight:650;display:flex;gap:4px;align-items:center}.campaign-row{width:100%;min-height:68px;border:0;border-bottom:1px solid #eef0f2;background:#fff;text-align:left;padding:9px 15px;gap:12px}.campaign-row:hover{background:#fafbfc}.campaign-thumb{width:45px;height:45px;border-radius:6px;background-size:cover;background-position:center;display:grid;place-items:center;position:relative;overflow:hidden}.campaign-thumb:after{content:"";position:absolute;inset:0;background:rgba(10,20,30,.23)}.campaign-thumb span{position:relative;z-index:1;color:#fff;font-family:Georgia;font-weight:700}.campaign-main{min-width:0;flex:1}.campaign-main>div{display:flex;align-items:center;gap:7px}.campaign-main strong{font-size:11px}.campaign-main>span{font-size:9px;color:#858a91;display:block;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.channel-icons{gap:4px}.channel-icons>span,.channel-icons>i{width:23px;height:23px;border:1px solid #e5e7ea;border-radius:50%;display:grid;place-items:center;color:#686d75;font-style:normal;background:#fff}.progress-cell{width:115px}.progress-cell>div:first-child,.progress-label,.channel-progress>div:first-child{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}.progress-cell span,.progress-label span,.channel-progress span{font-size:8px;color:#8a8f96}.progress-cell b,.progress-label strong,.channel-progress strong{font-size:9px}.progress{height:4px;background:#edf0f2;border-radius:4px;overflow:hidden}.progress i{height:100%;display:block;background:#21a36a;border-radius:4px}.row-metric{width:48px;text-align:right}.row-metric span{font-size:8px;color:#8c9198;display:block}.row-metric strong{font-size:12px}.row-arrow{transform:rotate(90deg);color:#a0a4aa}.attention-panel{min-width:0}.attention-list{padding:0 16px}.attention-item{min-height:63px;border-bottom:1px solid #eef0f2;gap:10px}.attention-dot{width:7px;height:7px;border-radius:50%;flex:none}.attention-dot.amber{background:#daa03a}.attention-dot.red{background:#df5555}.attention-dot.blue{background:#3f75dc}.attention-dot.gray{background:#9298a0}.attention-item>div:nth-child(2){min-width:0;flex:1}.attention-item strong{font-size:10px;display:block;margin-bottom:4px}.attention-item span{font-size:9px;color:#8a8f96;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}.attention-who{gap:6px;margin-left:auto}.panel-footer{height:42px;width:100%;border:0;background:#fff;color:#2764d9;font-size:10px;font-weight:650;display:flex;align-items:center;justify-content:center;gap:4px}.performance-panel{grid-column:1/2}.chart-summary{display:flex;gap:25px;padding:13px 22px 0}.chart-summary>div{display:grid;grid-template-columns:10px auto;gap:2px 7px}.chart-summary .legend{width:8px;height:8px;border-radius:2px;grid-row:1/3;margin-top:3px}.legend.revenue{background:#2d69e8}.legend.spend{background:#d99a31}.chart-summary span{font-size:8px;color:#92969d}.chart-summary strong{font-size:11px}.line-chart{width:100%;height:205px;padding:0 16px 9px}.schedule-panel{grid-column:2/3}.schedule-panel.wide{grid-column:1/3}.schedule-days{display:grid;grid-template-columns:repeat(7,1fr);padding:18px 14px 12px;gap:5px}.schedule-days>div{display:flex;flex-direction:column;align-items:center;border-radius:7px;padding:7px 3px;gap:4px}.schedule-days>div.today{background:#f0f4fd}.schedule-days span{font-size:8px;color:#91969d}.schedule-days strong{font-size:13px}.schedule-days em{font-style:normal;width:17px;height:17px;border-radius:50%;background:#2563eb;color:#fff;font-size:8px;display:grid;place-items:center}.schedule-days em.empty{background:#edf0f2;color:#9ca1a8}.next-publish{margin:0 14px 15px;background:#f8f9fa;border:1px solid #ebedef;border-radius:8px;padding:8px;gap:9px}.media-mini{width:42px;height:42px;background-size:cover;background-position:center;border-radius:5px;color:#fff;display:grid;place-items:center}.next-publish>div:nth-child(2){flex:1;min-width:0}.next-publish strong{font-size:10px;display:block}.next-publish span{font-size:8px;color:#858a92}.next-publish .btn{font-size:9px;height:29px;padding:0 8px}.team-hero{background:linear-gradient(105deg,#182330,#233d50);color:#fff;border-radius:11px;margin-bottom:15px;padding:22px 25px;display:flex;align-items:center;justify-content:space-between}.team-date{font-size:9px;letter-spacing:.1em;color:#b8c4ce}.team-hero h2{margin:5px 0;font-size:22px}.team-hero p{margin:0;color:#c9d1d8;font-size:11px}.team-progress{gap:12px}.team-progress>div:last-child{display:flex;flex-direction:column}.team-progress strong{font-size:15px}.team-progress span{font-size:9px;color:#c6cfd6}.donut{border-radius:50%;display:grid;place-items:center;position:relative}.donut:after{content:"";position:absolute;inset:7px;background:#fff;border-radius:50%}.team-progress .donut:after{background:#213747}.donut span{font-size:10px;font-weight:700;position:relative;z-index:1}.toolbar-card{height:54px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;padding:0 12px}.tabs.compact{display:flex;align-self:stretch}.tabs.compact button{border:0;background:none;padding:0 14px;color:#747a82;font-size:11px;position:relative}.tabs.compact button.active{color:#202327;font-weight:700}.tabs.compact button.active:after{content:"";position:absolute;left:14px;right:14px;bottom:0;height:2px;background:#24272b}.tabs em{font-style:normal;background:#eff1f3;font-size:8px;padding:2px 6px;border-radius:8px;margin-left:5px}.view-toggle{display:flex;border:1px solid #dfe3e6;border-radius:6px;overflow:hidden}.view-toggle button{width:32px;height:29px;border:0;border-right:1px solid #e1e4e7;background:#fff;color:#888d94}.view-toggle button:last-child{border:0}.view-toggle button.active{background:#f0f2f4;color:#222}.campaign-table{overflow:hidden}.table-head,.table-row{display:grid;grid-template-columns:minmax(270px,2fr) 105px 150px 155px 135px 90px 70px 30px;align-items:center;gap:8px;padding:0 15px}.table-head{height:40px;background:#f9fafb;border-bottom:1px solid #e6e8eb;color:#858a92;font-size:8px;letter-spacing:.05em;text-transform:uppercase;font-weight:700}.table-row{width:100%;min-height:69px;background:#fff;border:0;border-bottom:1px solid #eceef0;text-align:left;color:#4f545c;font-size:10px}.table-row:hover{background:#fafbfc}.campaign-name-cell{display:flex;align-items:center;gap:10px}.campaign-name-cell>i{width:42px;height:42px;border-radius:6px;background-size:cover;background-position:center}.campaign-name-cell>span{display:flex;flex-direction:column;min-width:0}.campaign-name-cell strong{font-size:11px;color:#24272b;margin-bottom:3px}.campaign-name-cell small{font-size:9px;color:#8a8f96}.date-cell{color:#777d85}.table-progress{display:flex;align-items:center;gap:7px}.table-progress>span{height:4px;width:80px;background:#edf0f2;border-radius:4px}.table-progress i{height:100%;background:#24a26b;display:block}.table-progress b{font-size:9px}.roas-cell{font-weight:700;color:#168458}.campaign-card-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.campaign-card{text-align:left;overflow:hidden;padding:0}.campaign-cover{height:165px;background-size:cover;background-position:center;position:relative;padding:14px;display:flex;align-items:flex-start;justify-content:flex-end}.campaign-cover>div{position:absolute;left:17px;bottom:15px;color:white}.campaign-cover>div span{font-size:9px;letter-spacing:.15em}.campaign-cover h3{font-size:17px;margin:4px 0 0}.campaign-card-body{padding:15px}.campaign-card-body>p{font-size:10px;color:#727780;margin:0 0 13px}.campaign-meta{display:flex;justify-content:space-between;border-bottom:1px solid #eceef0;padding-bottom:12px}.campaign-meta span{font-size:9px;color:#777d85;display:flex;align-items:center;gap:5px}.progress-label{margin-top:13px}.campaign-numbers{display:grid;grid-template-columns:repeat(3,1fr);margin-top:14px;border-top:1px solid #eceef0;padding-top:12px}.campaign-numbers>div{display:flex;flex-direction:column}.campaign-numbers span{font-size:8px;color:#8d9299}.campaign-numbers strong{font-size:11px;margin-top:3px}.campaign-hero{height:265px;background-size:cover;background-position:center;position:relative;color:#fff;padding:22px 32px}.hero-top{justify-content:space-between}.hero-top>button{border:0;background:none;color:#fff;font-size:10px;display:flex;gap:6px;align-items:center}.hero-top>button svg{transform:rotate(-90deg)}.hero-top>div{gap:8px}.campaign-title{position:absolute;left:34px;bottom:28px}.brand-chip{font-size:9px;letter-spacing:.16em;color:#e8d9ba}.campaign-title h1{margin:6px 0 5px;font-size:28px}.campaign-title>p{margin:0 0 15px;color:#e3e8ec;font-size:11px}.hero-meta{gap:20px}.hero-meta span{font-size:9px;display:flex;gap:6px;align-items:center}.campaign-tabs{height:55px;background:#fff;border-bottom:1px solid #e3e6e8;padding:0 30px;display:flex;gap:24px;position:sticky;top:64px;z-index:10}.campaign-tabs button{border:0;background:none;color:#6f747c;font-size:11px;position:relative;padding:0}.campaign-tabs button.active{color:#222;font-weight:700}.campaign-tabs button.active:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#b39a69}.campaign-tabs em{font-style:normal;background:#fff0d4;color:#936115;padding:2px 5px;border-radius:8px;font-size:8px;margin-left:5px}.campaign-kpis{display:grid;grid-template-columns:repeat(5,1fr);background:#fff;border:1px solid #e2e5e8;border-radius:10px;margin-bottom:14px}.campaign-kpis>div{padding:16px 19px;border-right:1px solid #e8eaed;display:flex;flex-direction:column}.campaign-kpis>div:last-child{border:0}.campaign-kpis span{font-size:8px;color:#8b9097;letter-spacing:.06em}.campaign-kpis strong{font-size:20px;margin:7px 0 3px}.campaign-kpis small{font-size:8px}.campaign-kpis small.green{color:#168458}.campaign-kpis small.blue{color:#2563eb}.detail-grid{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(290px,.7fr);gap:14px}.channel-list{padding:0 14px}.channel-row{width:100%;border:0;border-bottom:1px solid #eceef0;background:#fff;min-height:68px;padding:8px 4px;gap:10px;text-align:left}.channel-symbol{width:36px;height:36px;border-radius:7px;display:grid;place-items:center;flex:none}.channel-symbol.large{width:45px;height:45px}.channel-desc{width:26%;display:flex;flex-direction:column}.channel-desc strong,.channel-owner{font-size:10px}.channel-desc small,.channel-status small,.channel-result small{font-size:8px;color:#888e95;margin-top:4px}.channel-status{width:19%;display:flex;flex-direction:column;align-items:flex-start}.channel-result{width:15%;display:flex;flex-direction:column}.channel-result strong{font-size:10px}.channel-owner{gap:5px;flex:1}.channel-row>svg{transform:rotate(90deg);color:#a2a6ac}.detail-aside{display:flex;flex-direction:column;gap:14px}.readiness-list{padding:13px 18px}.readiness-list>div{display:grid;grid-template-columns:115px 1fr 30px;align-items:center;gap:8px;min-height:30px}.readiness-list span{font-size:9px}.readiness-list strong{font-size:8px;text-align:right}.approval-card{padding-bottom:14px}.approval-preview{height:125px;margin:14px;background-size:cover;background-position:center;border-radius:7px;position:relative}.approval-preview span{position:absolute;left:7px;top:7px;background:rgba(0,0,0,.6);color:#fff;border-radius:4px;padding:4px 7px;font-size:8px;display:flex;gap:4px}.approval-card>strong,.approval-card>p{display:block;margin-left:14px}.approval-card>strong{font-size:11px}.approval-card>p{font-size:8px;color:#858b93}.approval-card>div:last-child{display:flex;gap:7px;margin:12px 14px 0}.approval-card .btn{flex:1;font-size:9px;height:30px}.brief-layout{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(270px,.65fr);gap:14px}.brief-layout main,.brief-layout aside{display:flex;flex-direction:column;gap:14px}.brief-card,.audience-card,.message-matrix{padding-bottom:18px}.brief-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:20px;padding:19px}.brief-grid>div{border-left:2px solid #d3bc8b;padding-left:13px}.brief-grid label,.audience-columns label,.review-copy label,.packet-details label,.form-grid label,.property-panel>label{font-size:8px;letter-spacing:.07em;color:#8a8f96;font-weight:700;display:block;margin-bottom:7px}.brief-grid strong{font-size:11px;line-height:1.5}.brief-grid p{font-size:9px;color:#777d85;line-height:1.55;margin:5px 0 0}.audience-columns{display:grid;grid-template-columns:repeat(3,1fr);padding:18px;gap:16px}.audience-columns>div{display:flex;flex-direction:column}.audience-columns span{font-size:9px;border-bottom:1px solid #eceef0;padding:7px 0;display:flex;align-items:center;gap:5px}.audience-columns em{font-style:normal;color:#858a91;margin-left:auto}.audience-columns small{font-size:8px;color:#8c9299;margin-left:auto}.matrix-table{margin:13px 18px 0;border:1px solid #e7e9ec;border-radius:7px;overflow:hidden}.matrix-head,.matrix-row{display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:8px;padding:0 12px;align-items:center}.matrix-head{height:33px;background:#f7f8fa;font-size:8px;font-weight:700;color:#888d94}.matrix-row{min-height:43px;border-top:1px solid #eceef0;font-size:9px}.matrix-row span{display:flex;gap:5px;align-items:center}.comments-card{padding-bottom:12px}.comments{padding:5px 14px}.comment{display:flex;gap:8px;padding:11px 0;border-bottom:1px solid #eceef0}.comment>div{flex:1}.comment strong{font-size:9px;display:flex;justify-content:space-between}.comment small{font-size:7px;color:#9a9fa5;font-weight:400}.comment p{font-size:9px;line-height:1.5;color:#5f646c;margin:5px 0 0}.comment-box{padding:10px 14px}.comment-box textarea{width:100%;height:60px;border:1px solid #dfe2e6;border-radius:6px;padding:8px;font-size:9px;resize:none}.comment-box .btn{height:29px;font-size:9px;margin-left:auto;margin-top:6px}.campaign-info{padding:15px}.campaign-info h2{font-size:12px;margin:0 0 8px}.campaign-info>div{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eceef0}.campaign-info span{font-size:8px;color:#8b9097}.campaign-info strong{font-size:9px}.section-title{display:flex;justify-content:space-between;align-items:end;margin-bottom:14px}.section-title h2{font-size:16px;margin:0 0 4px}.section-title p{font-size:10px;color:#7d828a;margin:0}.channel-card-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}.channel-card-large{padding:15px}.channel-card-top{gap:10px}.channel-card-top>div:nth-child(2){flex:1}.channel-card-top h3{font-size:12px;margin:0 0 4px}.channel-card-top p{font-size:8px;color:#868c94;margin:0}.channel-card-top>button{border:0;background:none;color:#8d9299}.channel-progress{padding:16px 0 14px}.channel-card-meta{border-top:1px solid #eceef0;border-bottom:1px solid #eceef0;padding:11px 0;display:grid;grid-template-columns:1fr 1.5fr;gap:10px}.channel-card-meta>div{display:flex;flex-direction:column;gap:5px}.channel-card-meta span,.channel-card-result span{font-size:7px;color:#8b9097;letter-spacing:.05em}.channel-card-meta strong{font-size:9px;display:flex;align-items:center;gap:5px}.channel-card-result{padding-top:12px;justify-content:space-between}.channel-card-result>div{display:grid;grid-template-columns:auto auto;gap:2px 8px}.channel-card-result span{grid-column:1/3}.channel-card-result strong{font-size:12px}.channel-card-result small{font-size:8px;color:#81868e}.channel-card-result .btn{height:29px;font-size:9px}.content-layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(320px,.65fr);gap:14px}.asset-filter-tabs{height:42px;border-bottom:1px solid #eceef0;padding:0 15px;display:flex;gap:15px}.asset-filter-tabs button{border:0;background:none;font-size:9px;color:#747a82;position:relative}.asset-filter-tabs button.active{font-weight:700;color:#222}.asset-filter-tabs button.active:after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:#222}.asset-grid{padding:14px;display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.asset-tile{border:1px solid #e4e7ea;background:#fff;border-radius:8px;padding:0 0 11px;text-align:left;overflow:hidden}.asset-tile.active{border-color:#2a67dd;box-shadow:0 0 0 2px #e4ecff}.asset-tile>div{height:120px;background-size:cover;background-position:center;position:relative}.asset-tile>div>.badge{position:absolute;top:7px;left:7px}.asset-tile>div>span{position:absolute;right:7px;bottom:7px;background:rgba(0,0,0,.62);color:#fff;font-size:7px;padding:3px 5px;border-radius:3px}.asset-tile h3{font-size:10px;margin:10px 10px 3px}.asset-tile p{font-size:8px;color:#858a91;margin:0 10px 8px}.asset-owner{gap:5px;font-size:8px;color:#747a82;margin:0 10px}.review-panel{overflow:hidden}.review-head{height:65px;padding:0 15px;border-bottom:1px solid #eceef0;display:flex;align-items:center;justify-content:space-between}.review-head span{font-size:8px;color:#888d94}.review-head h2{font-size:13px;margin:3px 0 0}.review-head button,.property-head button{border:0;background:none;color:#858a92}.phone-preview{background:#eef0f2;padding:18px;display:grid;place-items:center}.phone-frame{width:184px;background:#fff;border:5px solid #1d2024;border-radius:19px;overflow:hidden;box-shadow:0 7px 20px rgba(0,0,0,.16)}.phone-bar{height:14px;position:relative}.phone-bar:after{content:"";position:absolute;width:48px;height:5px;border-radius:5px;background:#1d2024;top:2px;left:50%;transform:translateX(-50%)}.phone-media{height:235px;background-size:cover;background-position:center;position:relative}.phone-copy{position:absolute;left:13px;bottom:16px;color:#fff}.phone-copy span{font-size:6px;letter-spacing:.2em;display:block}.phone-copy strong{font-family:Georgia;font-size:20px;display:block;margin-top:2px}.phone-copy em{font-family:Georgia;font-size:10px}.phone-actions{font-size:13px;padding:7px}.phone-caption{font-size:6px;line-height:1.4;padding:0 7px 9px}.version-line{display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #eceef0}.version-line span,.version-line button{font-size:8px}.version-line button{border:0;background:none;color:#2965d6;display:flex;gap:4px}.review-copy{padding:12px 14px;border-bottom:1px solid #eceef0}.review-copy p{font-size:9px;line-height:1.5}.review-copy button{border:0;background:none;color:#2864d7;font-size:8px;padding:0}.review-note{padding:12px 14px;gap:8px;background:#fffaf0}.review-note>div{flex:1}.review-note strong{font-size:8px;display:flex;justify-content:space-between}.review-note small{font-size:7px;color:#999}.review-note p{font-size:8px;line-height:1.4;margin:4px 0}.review-actions{gap:7px;padding:12px 14px}.review-actions .btn{flex:1;font-size:9px}.mobile-link{width:100%;height:35px;border:0;border-top:1px solid #eceef0;background:#fff;color:#2864d7;justify-content:center;gap:5px;font-size:8px}.builder-overlay{position:fixed;inset:0;background:#eef0f2;z-index:80}.builder-shell{height:100vh;display:flex;flex-direction:column}.builder-shell>header{height:62px;background:#fff;border-bottom:1px solid #dfe3e7;padding:0 15px;justify-content:space-between}.builder-shell header>div:first-child{gap:10px}.builder-shell header>div:first-child>button{border:0;background:#f0f2f4;border-radius:5px;width:30px;height:30px;display:grid;place-items:center}.builder-shell header span{font-size:8px;color:#8a8f96;display:block}.builder-shell header strong{font-size:12px}.builder-actions{gap:8px}.saved{color:#158457!important;display:flex!important;align-items:center;gap:3px!important;margin-right:8px}.builder-body{display:grid;grid-template-columns:230px minmax(0,1fr) 270px;min-height:0;flex:1}.block-sidebar,.property-panel{background:#fff;overflow:auto}.block-sidebar{border-right:1px solid #dfe3e7;padding:13px}.property-panel{border-left:1px solid #dfe3e7;padding:0 15px 20px}.builder-site{background:#f7f8fa;border:1px solid #e2e5e8;border-radius:7px;padding:10px;margin-bottom:18px}.builder-site>span,.builder-site small{font-size:8px;color:#8d9299;display:block}.builder-site strong{font-size:10px;display:flex;align-items:center;gap:5px;margin:5px 0}.builder-site i{width:22px;height:22px;background:#213544;color:#fff;border-radius:50%;display:grid;place-items:center;font-family:Georgia}.block-sidebar h3,.page-settings h3{font-size:8px;color:#8a8f96;letter-spacing:.07em;margin:0 0 8px}.block-list{display:flex;flex-direction:column;gap:4px}.block-list>button{height:35px;border:1px solid #e3e6e9;background:#fff;border-radius:5px;display:flex;align-items:center;gap:7px;padding:0 8px;color:#4f555d;text-align:left}.block-list>button.off{opacity:.48}.block-list>button>span{font-size:9px;flex:1}.block-list label{position:relative;width:25px;height:14px}.block-list input{display:none}.block-list label i{position:absolute;inset:0;background:#d8dce0;border-radius:8px}.block-list label i:after{content:"";position:absolute;width:10px;height:10px;border-radius:50%;background:#fff;left:2px;top:2px;transition:.15s}.block-list input:checked+i{background:#22a36b}.block-list input:checked+i:after{left:13px}.add-block{width:100%;font-size:9px;margin:9px 0 18px}.page-settings button{width:100%;height:35px;border:0;border-bottom:1px solid #eceef0;background:#fff;display:flex;align-items:center;gap:7px;text-align:left;font-size:9px}.page-settings button svg:last-child,.page-settings button .badge{margin-left:auto}.builder-canvas{overflow:auto;background:#e8eaed}.canvas-toolbar{height:47px;background:#f8f9fa;border-bottom:1px solid #dfe3e7;display:flex;align-items:center;justify-content:space-between;padding:0 15px;position:sticky;top:0;z-index:3}.canvas-toolbar>div{display:flex}.canvas-toolbar button{height:27px;border:1px solid #dfe2e5;background:#fff;padding:0 8px;font-size:8px;display:flex;align-items:center;gap:4px}.canvas-toolbar button.active{background:#e9eef8;color:#245fcf}.canvas-toolbar>span{font-size:8px;color:#888d94}.webpage-preview{width:min(960px,90%);margin:22px auto;background:#fff;box-shadow:0 5px 20px rgba(23,32,43,.13);transition:.25s}.webpage-preview.mobile{width:390px}.site-nav{height:51px;padding:0 22px;justify-content:space-between}.site-nav b{font-family:Georgia;letter-spacing:.22em;font-size:13px}.site-nav span{font-size:6px;letter-spacing:.08em}.site-nav button{border:0;background:#233844;color:#fff;font-size:6px;padding:8px 13px}.web-hero{height:475px;background-size:cover;background-position:center;position:relative;color:#fff}.web-hero>div:last-child{position:absolute;left:8%;top:25%;max-width:480px}.web-hero span,.web-intro>span,.web-highlights span,.web-form>span{font-size:7px;letter-spacing:.2em}.web-hero h1{font-family:Georgia;font-size:42px;line-height:1.03;margin:10px 0}.web-hero h1 em{font-weight:400}.web-hero p{font-family:Georgia;font-size:11px;line-height:1.6;max-width:390px}.web-hero button,.web-form button{border:0;background:#c5a86e;color:#fff;font-size:6px;letter-spacing:.1em;padding:11px 15px;margin-top:12px}.editable-tag{position:absolute;top:8px!important;left:8px!important;background:#2864d7;color:#fff;font-size:7px;padding:5px 8px;border-radius:3px}.web-intro{text-align:center;padding:60px 16%;}.web-intro h2,.web-highlights h2,.web-form h2{font-family:Georgia;font-size:27px;font-weight:400;margin:10px 0}.web-intro p,.web-highlights p{font-family:Georgia;color:#667078;font-size:10px;line-height:1.7}.web-highlights{display:grid;grid-template-columns:1.1fr 1fr;min-height:300px;background:#f2f0eb}.web-highlights>div:first-child{background-size:cover;background-position:center}.web-highlights>div:last-child{padding:60px 45px}.web-highlights a{font-size:7px;letter-spacing:.08em}.web-form{text-align:center;background:#1d303c;color:#fff;padding:45px}.web-form>div{display:flex;justify-content:center;gap:5px}.web-form input{height:33px;background:transparent;border:0;border-bottom:1px solid #91a0aa;color:#fff;font-size:8px;padding:0 6px;width:150px}.web-form button{margin:0}.webpage-preview footer{height:45px;display:grid;place-items:center;background:#14242e;color:#82939d;font-size:6px;letter-spacing:.13em}.mobile .site-nav span{display:none}.mobile .web-hero{height:500px}.mobile .web-hero>div:last-child{left:7%;right:7%}.mobile .web-hero h1{font-size:35px}.mobile .web-intro{padding:50px 10%}.mobile .web-highlights{grid-template-columns:1fr}.mobile .web-highlights>div:first-child{height:230px}.mobile .web-form>div{flex-direction:column}.mobile .web-form input{width:100%}.property-head{height:52px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eceef0;margin:0 -15px 15px;padding:0 15px}.property-head h3{font-size:11px}.property-panel>input,.property-panel>textarea{width:100%;border:1px solid #dfe2e6;border-radius:5px;padding:8px;font-size:9px;margin-bottom:13px;resize:none}.media-picker{height:110px;background-size:cover;background-position:center;border-radius:6px;position:relative}.media-picker button{position:absolute;right:6px;bottom:6px;background:#fff;border:0;border-radius:4px;font-size:8px;padding:6px 9px}.approval-state{background:#eaf8f1;padding:9px;border-radius:6px;margin-top:13px}.approval-state span{font-size:8px!important;color:#157b50;display:flex!important;align-items:center;gap:4px}.approval-state small{font-size:7px;color:#6e8c7e}.modal-backdrop{position:fixed;inset:0;background:rgba(17,24,32,.56);backdrop-filter:blur(2px);z-index:70;display:grid;place-items:center;padding:20px}.mobile-packet,.create-modal{background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.23);overflow:hidden}.mobile-packet{width:min(860px,96vw)}.modal-head{min-height:86px;padding:17px 21px;border-bottom:1px solid #e6e8eb;justify-content:space-between}.modal-head h2{margin:3px 0;font-size:17px}.modal-head p{margin:0;font-size:9px;color:#80858d}.modal-head>button{border:0;background:#f1f3f4;border-radius:50%;width:30px;height:30px;display:grid;place-items:center}.packet-body{display:grid;grid-template-columns:330px 1fr}.packet-media{min-height:490px;background-size:cover;background-position:center;position:relative}.packet-media>span{position:absolute;top:12px;left:12px;background:rgba(0,0,0,.58);color:#fff;border-radius:4px;padding:4px 7px;font-size:8px}.packet-media>button{position:absolute;left:18px;right:18px;bottom:18px;height:38px;border:0;border-radius:6px;background:#fff;color:#222;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:5px}.packet-details{padding:18px}.packet-ready{background:#eaf8f1;border-radius:7px;padding:10px;color:#157e51;gap:8px;margin-bottom:15px}.packet-ready>div{display:flex;flex-direction:column}.packet-ready strong{font-size:10px}.packet-ready span{font-size:8px}.packet-details label{display:flex;justify-content:space-between}.packet-details label button{border:0;background:none;color:#2563eb;font-size:8px}.copy-box{border:1px solid #e1e4e7;background:#f9fafb;border-radius:6px;padding:9px;font-size:9px;line-height:1.5;margin-bottom:14px}.instruction-list{display:flex;flex-direction:column;margin-bottom:15px}.instruction-list button{min-height:32px;border:0;border-bottom:1px solid #eceef0;background:#fff;text-align:left;font-size:9px;display:flex;align-items:center;gap:8px}.instruction-list button>span{width:17px;height:17px;border:1px solid #ccd1d6;border-radius:4px;display:grid;place-items:center}.instruction-list button>span.checked{background:#1ba36a;color:#fff;border-color:#1ba36a}.link-input{border:1px solid #dfe2e6;border-radius:6px;height:37px;padding-left:9px;color:#8b9097}.link-input input{border:0;outline:0;flex:1;font-size:9px;padding:0 8px}.link-input button{align-self:stretch;border:0;background:#23272c;color:#fff;font-size:8px;padding:0 10px}.tracking-note{font-size:8px;color:#80858c;display:flex;gap:5px;align-items:center}.create-modal{width:min(820px,95vw)}.wizard-steps{height:56px;background:#f8f9fa;border-bottom:1px solid #e4e7e9;display:flex;align-items:center;justify-content:center;gap:0}.wizard-steps>div{display:flex;align-items:center;min-width:150px;position:relative}.wizard-steps>div:not(:last-child):after{content:"";height:1px;background:#d9dde1;width:45px;margin:0 12px}.wizard-steps span{width:22px;height:22px;border:1px solid #cbd0d5;border-radius:50%;display:grid;place-items:center;font-size:9px;color:#7d828a}.wizard-steps b{font-size:9px;color:#8a8f96;margin-left:6px}.wizard-steps .active span{background:#22262b;border-color:#22262b;color:#fff}.wizard-steps .active b{color:#222}.wizard-steps .done span{background:#1ba36a;border-color:#1ba36a;color:#fff}.wizard-content{min-height:390px;max-height:58vh;overflow:auto;padding:22px 27px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.form-grid .full{grid-column:1/3}.form-grid label{color:#5f656c;font-size:9px;letter-spacing:0}.form-grid input,.form-grid select,.form-grid textarea{display:block;width:100%;margin-top:6px;border:1px solid #dce0e4;border-radius:6px;height:38px;padding:0 10px;font-size:10px;color:#333;background:#fff}.form-grid textarea{height:70px;padding:10px;resize:none}.component-picker{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.component-picker>button{height:128px;border:1px solid #dfe3e7;border-radius:8px;background:#fff;text-align:left;padding:12px;position:relative}.component-picker>button.selected{border-color:#2b65d6;background:#f5f8ff;box-shadow:0 0 0 1px #2b65d6}.component-picker>button>span{width:36px;height:36px;border-radius:7px;background:#eff1f3;display:grid;place-items:center;color:#596068}.component-picker strong{font-size:10px;display:block;margin:9px 0 4px}.component-picker small{font-size:8px;color:#858a91;line-height:1.4}.component-picker>button>i{position:absolute;right:9px;top:9px;width:18px;height:18px;border:1px solid #d3d7db;border-radius:50%;display:grid;place-items:center;color:#fff}.component-picker>button.selected>i{background:#2462d4;border-color:#2462d4}.selection-note{margin-top:14px;background:#fff8eb;border:1px solid #f1dfb9;border-radius:7px;padding:11px;display:flex;gap:9px;color:#9b6b18}.selection-note strong{font-size:9px}.selection-note p{font-size:8px;color:#806f53;margin:3px 0 0}.tag-input{min-height:40px;border:1px solid #dce0e4;border-radius:6px;margin-top:6px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:5px}.tag-input span{font-size:8px;background:#eef2f9;color:#355a91;border-radius:4px;padding:5px 6px}.tag-input input{border:0!important;height:26px!important;margin:0!important;min-width:100px;flex:1}.audience-estimate{margin-top:16px;border:1px solid #e1e4e7;border-radius:7px;padding:13px;display:flex;align-items:center;gap:11px}.audience-estimate>div{display:flex;flex-direction:column}.audience-estimate span{font-size:7px;color:#8b9097;letter-spacing:.06em}.audience-estimate strong{font-size:13px;margin:3px 0}.audience-estimate small{font-size:8px;color:#858b92}.review-create{max-width:650px;margin:0 auto}.review-brand{border:1px solid #e1e4e7;border-radius:8px;padding:13px;gap:11px}.review-brand>span{width:45px;height:45px;border-radius:50%;background:#243946;color:#fff;font-family:Georgia;display:grid;place-items:center}.review-brand>div{flex:1}.review-brand small{font-size:7px;letter-spacing:.15em;color:#9b7d45}.review-brand h3{font-size:14px;margin:3px 0}.review-brand p{font-size:8px;color:#858a91;margin:0}.review-summary{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #e1e4e7;border-radius:8px;margin-top:10px}.review-summary>div{padding:12px;border-right:1px solid #eceef0;display:flex;flex-direction:column}.review-summary>div:last-child{border:0}.review-summary span{font-size:7px;color:#8a8f96}.review-summary strong{font-size:15px;margin:5px 0}.review-summary small{font-size:7px;color:#7e848c;line-height:1.4}.generated-list{margin-top:15px}.generated-list h3{font-size:10px}.generated-list>div{min-height:31px;border-bottom:1px solid #eceef0;display:flex;align-items:center;gap:7px;font-size:9px}.generated-list>div svg{color:#17a066}.wizard-footer{height:62px;border-top:1px solid #e3e6e9;padding:0 22px;justify-content:space-between}.wizard-footer>span{font-size:8px;color:#8b9097}.publishing-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,.6fr);gap:14px}.week-calendar{overflow:hidden}.week-nav{display:flex}.week-nav button{border:1px solid #dfe3e6;background:#fff;height:27px;font-size:8px}.calendar-grid{display:grid;grid-template-columns:42px repeat(7,1fr);height:270px;padding:0 8px 12px}.time-col{padding-top:32px;display:flex;flex-direction:column;justify-content:space-around}.time-col span{font-size:7px;color:#9a9fa6}.calendar-day{position:relative;border-left:1px solid #eceef0;background:repeating-linear-gradient(to bottom,transparent 0,transparent 58px,#f0f2f4 59px,#f0f2f4 60px)}.calendar-day>strong{height:30px;display:grid;place-items:center;font-size:7px;color:#81868e}.calendar-day.today>strong{color:#2563eb}.cal-item{position:absolute;left:4px;right:4px;border:0;border-radius:4px;text-align:left;padding:5px;font-size:8px;font-weight:650;min-height:40px}.cal-item small{display:block;font-size:7px;margin-top:3px;font-weight:400}.cal-item.pink{background:#fdeaf0;color:#a43c60}.cal-item.purple{background:#f2eafd;color:#7546a7}.cal-item.blue{background:#eaf1ff;color:#285fbd}.cal-item.green{background:#e8f7ef;color:#15794f}.cal-item.yellow{background:#fff2d9;color:#946217}.ready-queue{align-self:start}.queue-item{width:100%;min-height:76px;border:0;border-bottom:1px solid #eceef0;background:#fff;padding:9px 14px;display:flex;align-items:center;gap:9px;text-align:left}.queue-item>i{width:49px;height:49px;border-radius:6px;background-size:cover;background-position:center}.queue-item>div{flex:1;display:flex;flex-direction:column}.queue-item>div span{font-size:7px;letter-spacing:.09em;color:#9b7c43}.queue-item strong{font-size:9px;margin:3px 0}.queue-item small{font-size:7px;color:#878c93}.analytics-filter{height:47px;background:#fff;border:1px solid #e2e5e8;border-radius:8px;margin-bottom:12px;display:flex;align-items:center;padding:0 10px;gap:7px}.analytics-filter select{border:1px solid #dfe2e5;border-radius:5px;height:29px;font-size:8px;padding:0 25px 0 8px}.analytics-filter span{margin-left:auto;font-size:8px;color:#858a92}.analytics-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(290px,.6fr);gap:14px}.big-chart-value{padding:14px 20px 0;display:flex;align-items:center;gap:8px}.big-chart-value>strong{font-size:22px}.big-chart-value>span{font-size:8px;color:#888d94}.metric-tabs{display:flex;border:1px solid #dfe2e6;border-radius:5px;overflow:hidden}.metric-tabs button{height:27px;border:0;border-right:1px solid #e0e3e6;background:#fff;font-size:8px;padding:0 8px}.metric-tabs button:last-child{border:0}.metric-tabs button.active{background:#eef2fa;color:#255dc7}.big-chart svg{height:270px;width:100%;padding:0 13px}.attribution-donut{padding:18px}.donut-large{width:145px;height:145px;border-radius:50%;background:conic-gradient(#2563eb 0 44%,#e4a037 44% 74%,#9b6ac7 74% 91%,#ef5a80 91%);margin:0 auto 20px;position:relative;display:grid;place-items:center}.donut-large>div{position:absolute;inset:26px;background:#fff;border-radius:50%}.donut-large>span{position:relative;z-index:1;text-align:center;font-size:8px;color:#858a92}.donut-large strong{font-size:17px;display:block;color:#25282c}.donut-legend>div{display:grid;grid-template-columns:8px 1fr auto 28px;align-items:center;gap:6px;min-height:27px;border-bottom:1px solid #eceef0}.donut-legend i{width:7px;height:7px;border-radius:2px}.donut-legend span,.donut-legend strong,.donut-legend em{font-size:8px}.donut-legend em{font-style:normal;color:#8b9097;text-align:right}.channel-table-panel{grid-column:1/3}.performance-table{overflow-x:auto}.p-head,.p-row{display:grid;grid-template-columns:1.5fr repeat(7,1fr);align-items:center;min-width:760px;padding:0 17px}.p-head{height:34px;background:#f8f9fa;color:#878c93;font-size:7px;letter-spacing:.05em}.p-row{height:49px;border-top:1px solid #eceef0;font-size:9px}.p-row span:first-child{display:flex;align-items:center;gap:7px;font-weight:650}.p-row span:first-child i{width:26px;height:26px;border-radius:5px;display:grid;place-items:center}.strong-green{font-weight:700;color:#158457}.placeholder-hero{min-height:95px;padding:15px 20px;gap:13px}.placeholder-hero>span{width:48px;height:48px;border-radius:9px;background:#edf2fb;color:#2563eb;display:grid;place-items:center}.placeholder-hero>div{flex:1}.placeholder-hero h2{font-size:14px;margin:0 0 5px}.placeholder-hero p{font-size:9px;color:#7e848b;margin:0}.module-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px}.module-card{padding:14px}.module-card>div{justify-content:space-between}.module-icon{width:34px;height:34px;border-radius:7px;background:#edf2fb;color:#2563eb;display:grid;place-items:center}.mi-1{background:#eaf8f1;color:#169461}.mi-2{background:#fff3dc;color:#a26b14}.mi-3{background:#f3ebfa;color:#8553b5}.module-card h3{font-size:11px;margin:14px 0 5px}.module-card p{font-size:8px;color:#838890;min-height:27px}.module-card>button{border:0;background:none;color:#2864d7;font-size:8px;padding:8px 0 0;display:flex;align-items:center;gap:4px}.search-overlay{position:fixed;inset:0;background:rgba(16,22,29,.45);backdrop-filter:blur(2px);z-index:90;display:flex;justify-content:center;padding-top:11vh}.search-modal{width:min(650px,90vw);height:max-content;background:#fff;border-radius:11px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden}.search-field{height:59px;border-bottom:1px solid #e3e6e9;display:flex;align-items:center;gap:10px;padding:0 16px;color:#7b8088}.search-field input{flex:1;border:0;outline:0;font-size:13px}.search-field kbd{font-size:8px;border:1px solid #dfe3e6;border-radius:4px;padding:3px 5px}.search-section{padding:13px}.search-section>span{font-size:7px;color:#92979e;letter-spacing:.08em}.search-section button{width:100%;border:0;background:#fff;border-radius:6px;padding:7px;gap:9px;text-align:left}.search-section button:hover{background:#f6f8fa}.search-section button>i{width:38px;height:38px;border-radius:5px;background-size:cover;background-position:center}.search-section button>div{flex:1;display:flex;flex-direction:column}.search-section strong{font-size:10px}.search-section small{font-size:8px;color:#858a91;margin-top:3px}.search-hint{height:36px;background:#f7f8fa;border-top:1px solid #e4e7e9;gap:15px;padding:0 14px}.search-hint span{font-size:7px;color:#92979e}.toast{position:fixed;right:24px;bottom:24px;background:#20252a;color:#fff;padding:11px 15px;border-radius:7px;box-shadow:0 8px 28px rgba(0,0,0,.22);z-index:120;font-size:10px;display:flex;align-items:center;gap:7px}
@media(max-width:1250px){.stats-grid.five{grid-template-columns:repeat(3,1fr)}.stats-grid.five .stat-card:nth-child(n+4){grid-column:span 1}.campaign-card-grid,.channel-card-grid{grid-template-columns:repeat(2,1fr)}.table-head,.table-row{grid-template-columns:minmax(240px,2fr) 100px 120px 140px 120px 75px 55px 25px}.channel-icons{display:none}.builder-body{grid-template-columns:210px minmax(0,1fr)}.property-panel{display:none}.module-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:900px){.sidebar{width:68px}.sidebar .brand{padding:0 18px}.sidebar .brand-word,.sidebar .nav-item span,.sidebar .nav-label,.sidebar .nav-item em,.erp-link{display:none}.sidebar .nav-item{justify-content:center;padding:0}.main-shell,.collapsed+.main-shell{margin-left:68px;width:calc(100% - 68px)}.topbar-search{display:none}.topbar{justify-content:flex-end}.dashboard-grid,.detail-grid,.brief-layout,.content-layout,.publishing-layout,.analytics-grid{grid-template-columns:1fr}.performance-panel,.schedule-panel,.schedule-panel.wide,.channel-table-panel{grid-column:1}.page-wrap,.detail-body{padding:22px 17px}.stats-grid.five{grid-template-columns:repeat(2,1fr)}.campaign-card-grid,.channel-card-grid{grid-template-columns:1fr}.campaign-kpis{grid-template-columns:repeat(3,1fr)}.table-head{display:none}.table-row{grid-template-columns:1fr 90px 30px}.table-row>span:nth-child(n+3):not(:last-child){display:none}.campaign-tabs{overflow-x:auto;gap:18px;padding:0 18px}.campaign-tabs button{white-space:nowrap}.builder-body{grid-template-columns:190px minmax(0,1fr)}.webpage-preview{width:95%}.component-picker{grid-template-columns:repeat(2,1fr)}.wizard-steps>div{min-width:auto}.wizard-steps b{display:none}.packet-body{grid-template-columns:1fr}.packet-media{min-height:280px}.module-grid{grid-template-columns:1fr 1fr}}
`;
