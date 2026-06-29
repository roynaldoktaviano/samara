// @ts-nocheck
'use client'
import { useState, useMemo, useEffect } from "react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const BOATS = ["Samara 1","Samara 2","Mischief","Otium"];
const BOAT_COLORS = {
  "Samara 1":{ accent:"#38bdf8", bg:"#38bdf811", border:"#38bdf833" },
  "Samara 2":{ accent:"#34d399", bg:"#34d39911", border:"#34d39933" },
  "Mischief": { accent:"#f472b6", bg:"#f472b611", border:"#f472b633" },
  "Otium":    { accent:"#fb923c", bg:"#fb923c11", border:"#fb923c33" },
};
const BEV_CATEGORIES = ["White Wine","Red Wine","Rosé Wine","Sparkling Wine","Champagne","Liquor","Cocktail","Beer","Soft Drink","Other"];
const CAT_COLORS_BEV = {"White Wine":"#fde68a","Red Wine":"#f87171","Rosé Wine":"#f9a8d4","Sparkling Wine":"#a5f3fc","Champagne":"#fcd34d","Liquor":"#c4b5fd","Beer":"#86efac","Cocktail":"#fb923c","Soft Drink":"#38bdf8","Other":"#94a3b8"};
const FOOD_CATS = [
  {id:"dairy",       label:"Dairy",       icon:"🥛", color:"#60a5fa"},
  {id:"dry-food",    label:"Dry Food",    icon:"🌾", color:"#fbbf24"},
  {id:"frozen",      label:"Frozen Food", icon:"🧊", color:"#67e8f9"},
  {id:"gluten-free", label:"Gluten Free", icon:"🌿", color:"#86efac"},
  {id:"tissue",      label:"Tissue",      icon:"🧻", color:"#c4b5fd"},
  {id:"seasoning",   label:"Seasoning",   icon:"🧂", color:"#fb923c"},
  {id:"sparepart",   label:"Sparepart",   icon:"🔧", color:"#f87171"},
  {id:"other",       label:"Other",       icon:"📦", color:"#94a3b8"},
];
const TAKEN_BY = ["Samara 1","Samara 2","Mischief","Otium","Staff","Lain-lain"];
const SEED_SUPPLIERS = ["Fresh Market Co.","Marine Provisions Ltd.","Island Spirits","General Supplier","Local Market","Other"];
const LOW = 10;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PAY_METHODS = ["Cash","Card","Transfer","Complimentary"];

const DEFAULT_PINS = {"admin":"0000","Samara 1":"1111","Samara 2":"2222","Mischief":"3333","Otium":"4444"};
const PIN_KEY = "samara_pins";
const loadPins = () => { try { const v = localStorage.getItem(PIN_KEY); return v ? JSON.parse(v) : DEFAULT_PINS; } catch { return DEFAULT_PINS; } };
const savePins = (p) => { try { localStorage.setItem(PIN_KEY, JSON.stringify(p)); } catch {} };

let _id = 500;
const uid = () => String(++_id);
const fmt$ = v => `Rp ${Number(v||0).toLocaleString("id-ID",{minimumFractionDigits:0,maximumFractionDigits:0})}`;
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "—";
const today = () => new Date().toISOString().slice(0,10);
const getCat = (id) => FOOD_CATS.find(c=>c.id===id) || FOOD_CATS.find(c=>c.id==="other");

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const KEYS = {
  boxes:"samara_boxes", bevItems:"samara_bevitems", pos:"samara_pos",
  foodLog:"samara_foodlog", bevLog:"samara_bevlog", salesLog:"samara_saleslog",
  openBills:"samara_openbills", suppliers:"samara_suppliers", recipes:"samara_recipes",
};
const lsGet = (k,fb) => { try { const v=sessionStorage.getItem(k); return v?JSON.parse(v):fb; } catch { return fb; } };
const lsSet = (k,v) => { try { sessionStorage.setItem(k,JSON.stringify(v)); if(window.storage) window.storage.set(k,JSON.stringify(v)); } catch {} };

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const SEED_BOXES = [
  {id:"box1",categoryId:"dairy",items:[
    {id:"i1",name:"Whole Milk",unit:"L",stock:40,unitPrice:18000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"i2",name:"Butter",unit:"Kg",stock:8,unitPrice:130000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"i3",name:"Eggs",unit:"Pcs",stock:120,unitPrice:3000,entryDate:"2025-01-01T00:00:00Z"},
  ]},
  {id:"box2",categoryId:"dry-food",items:[
    {id:"i5",name:"Basmati Rice",unit:"Kg",stock:200,unitPrice:20000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"i6",name:"Pasta",unit:"Kg",stock:80,unitPrice:22000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"i7",name:"Flour",unit:"Kg",stock:50,unitPrice:14000,entryDate:"2025-01-01T00:00:00Z"},
  ]},
  {id:"box3",categoryId:"frozen",items:[
    {id:"i9",name:"Chicken Breast",unit:"Kg",stock:30,unitPrice:95000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"i10",name:"Salmon Fillet",unit:"Kg",stock:15,unitPrice:280000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"i11",name:"Beef Tenderloin",unit:"Kg",stock:8,unitPrice:550000,entryDate:"2025-01-01T00:00:00Z"},
  ]},
  {id:"box4",categoryId:"seasoning",items:[
    {id:"i18",name:"Sea Salt",unit:"Kg",stock:5,unitPrice:25000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"i19",name:"Black Pepper",unit:"Kg",stock:3,unitPrice:185000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"i20",name:"Olive Oil",unit:"L",stock:20,unitPrice:85000,entryDate:"2025-01-01T00:00:00Z"},
  ]},
  {id:"box5",categoryId:"sparepart",items:[
    {id:"i22",name:"Oil Filter",unit:"Pcs",stock:12,unitPrice:150000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"i23",name:"V-Belt",unit:"Pcs",stock:8,unitPrice:85000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"i24",name:"Engine Oil",unit:"L",stock:20,unitPrice:95000,entryDate:"2025-01-01T00:00:00Z"},
  ]},
];

const SEED_BEV = {
  "Samara 1":[
    {id:"b1",name:"Dom Pérignon 2015",category:"Champagne",unit:"Btl",stock:12,unitPrice:2700000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"b2",name:"Grey Goose Vodka",category:"Liquor",unit:"Btl",stock:6,unitPrice:700000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"b3",name:"Heineken",category:"Beer",unit:"Can",stock:48,unitPrice:45000,entryDate:"2025-01-01T00:00:00Z"},
  ],
  "Samara 2":[
    {id:"b4",name:"Whispering Angel",category:"Rosé Wine",unit:"Btl",stock:24,unitPrice:430000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"b5",name:"Hendricks Gin",category:"Liquor",unit:"Btl",stock:4,unitPrice:590000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"b6",name:"San Pellegrino",category:"Soft Drink",unit:"Btl",stock:36,unitPrice:30000,entryDate:"2025-01-01T00:00:00Z"},
  ],
  "Mischief":[
    {id:"b7",name:"Clase Azul Tequila",category:"Liquor",unit:"Btl",stock:3,unitPrice:3400000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"b8",name:"Coca-Cola",category:"Soft Drink",unit:"Can",stock:60,unitPrice:25000,entryDate:"2025-01-01T00:00:00Z"},
  ],
  "Otium":[
    {id:"b9",name:"Cristal Champagne",category:"Champagne",unit:"Btl",stock:6,unitPrice:4600000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"b10",name:"Johnnie Walker Blue",category:"Liquor",unit:"Btl",stock:4,unitPrice:2700000,entryDate:"2025-01-01T00:00:00Z"},
    {id:"b11",name:"Fever-Tree Tonic",category:"Soft Drink",unit:"Can",stock:72,unitPrice:30000,entryDate:"2025-01-01T00:00:00Z"},
  ],
};

const SEED_POS = [
  {id:"PO-001",poNumber:"PO-2025-001",type:"food",vessel:"Central Storage",requestedBy:"Chef Marco",date:"2025-01-10T09:00:00Z",status:"approved",approvedAt:"2025-01-11T10:00:00Z",notes:"Monthly restock",items:[{id:"pi1",name:"Basmati Rice",category:"Dry Food",unit:"Kg",qty:100,unitPrice:20000,supplier:"Fresh Market Co."},{id:"pi2",name:"Pasta",category:"Dry Food",unit:"Kg",qty:50,unitPrice:22000,supplier:"Fresh Market Co."}]},
  {id:"PO-002",poNumber:"PO-2025-002",type:"beverages",vessel:"Samara 1",requestedBy:"Steward Ana",date:"2025-01-15T10:00:00Z",status:"approved",approvedAt:"2025-01-15T14:00:00Z",notes:"Charter prep",items:[{id:"pi3",name:"Dom Pérignon",category:"Champagne",unit:"Btl",qty:6,unitPrice:2700000,supplier:"Island Spirits"}]},
  {id:"PO-003",poNumber:"PO-2025-003",type:"food",vessel:"Central Storage",requestedBy:"Chef Marco",date:"2025-03-15T09:00:00Z",status:"approved",approvedAt:"2025-03-16T09:00:00Z",notes:"Quarter end",items:[{id:"pi8",name:"Olive Oil",category:"Seasoning",unit:"L",qty:30,unitPrice:85000,supplier:"Marine Provisions Ltd."},{id:"pi9",name:"Sea Salt",category:"Seasoning",unit:"Kg",qty:15,unitPrice:25000,supplier:"Marine Provisions Ltd."}]},
  {id:"PO-004",poNumber:"PO-2025-004",type:"beverages",vessel:"Otium",requestedBy:"Steward Luis",date:"2025-04-05T10:00:00Z",status:"pending",notes:"VIP charter prep",items:[{id:"pi10",name:"Cristal",category:"Champagne",unit:"Btl",qty:12,unitPrice:4600000,supplier:"Island Spirits"}]},
];

const SEED_FOOD_LOG = [
  {id:"fl1",itemName:"Basmati Rice",unit:"Kg",boxName:"Dry Food",jenis:"In",qty:100,unitPrice:20000,totalValue:2000000,ts:"2025-01-11T08:00:00Z"},
  {id:"fl2",itemName:"Chicken Breast",unit:"Kg",boxName:"Frozen Food",jenis:"Out",qty:15,unitPrice:95000,totalValue:1425000,takenBy:"Samara 1",ts:"2025-02-18T07:00:00Z"},
  {id:"fl3",itemName:"Pasta",unit:"Kg",boxName:"Dry Food",jenis:"Out",qty:20,unitPrice:22000,totalValue:440000,takenBy:"Samara 2",ts:"2025-03-25T08:00:00Z"},
];
const SEED_BEV_LOG = [
  {id:"bvl1",itemName:"Dom Pérignon",unit:"Btl",boat:"Samara 1",jenis:"In",qty:6,ts:"2025-01-15T14:00:00Z"},
  {id:"bvl2",itemName:"Dom Pérignon",unit:"Btl",boat:"Samara 1",jenis:"Out",qty:2,totalValue:5400000,takenBy:"Samara 1",ts:"2025-01-20T20:00:00Z"},
];

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const thS = {padding:"10px 14px",textAlign:"left",fontSize:11,color:"#334155",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",background:"#080c12",borderBottom:"1px solid #1a2030"};
const tdS = {padding:"12px 14px",fontSize:14,color:"#e2e8f0",borderBottom:"1px solid #0f1117"};
const inputStyle = {width:"100%",background:"#080c12",border:"1px solid #1a2030",color:"#e2e8f0",padding:"10px 14px",borderRadius:10,fontSize:14,fontFamily:"'DM Sans',sans-serif",outline:"none",boxSizing:"border-box"};
const btnPrimary = {background:"linear-gradient(135deg,#38bdf8cc,#38bdf8)",color:"#080c12",border:"none",padding:"10px 20px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:14,fontFamily:"'DM Sans',sans-serif"};
const btnAccent  = {background:"#38bdf811",color:"#38bdf8",border:"1px solid #38bdf833",padding:"8px 16px",borderRadius:9,cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"'DM Sans',sans-serif"};
const btnGhost   = {background:"transparent",color:"#475569",border:"1px solid #1a2030",padding:"8px 16px",borderRadius:9,cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"'DM Sans',sans-serif"};

// ─── PDF UTILITIES ────────────────────────────────────────────────────────────
const openPdf = (html,filename) => {
  const blob = new Blob([html],{type:"text/html"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=(filename||"document")+".html";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),5000);
};

const pdfCss = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#111;padding:32px;font-size:13px}h1{font-size:22px;font-weight:700}h2{font-size:14px;font-weight:700;margin:18px 0 8px;padding-bottom:4px;border-bottom:2px solid #e5e7eb}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:14px;border-bottom:3px solid #111}.badge{display:inline-block;background:#fce7f3;color:#be185d;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;margin-left:8px}table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px}thead tr{background:#111;color:#fff}th{padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em}td{padding:7px 10px;border-bottom:1px solid #f3f4f6}.footer{margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;display:flex;justify-content:space-between}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0 20px}.card{background:#f9fafb;border-radius:8px;padding:12px}`;

const generatePOPdf = (po) => {
  const total = po.items.reduce((s,i)=>s+Number(i.qty||0)*Number(i.unitPrice||0),0);
  const rows = po.items.map(item=>{
    const isRej = po.itemDecisions && po.itemDecisions[item.id]==="rejected";
    const sub = Number(item.qty||0)*Number(item.unitPrice||0);
    return `<tr style="${isRej?"opacity:0.4;text-decoration:line-through":""}"><td><strong>${item.name}</strong></td><td>${item.category||""}</td><td>${item.supplier||po.supplier||""}</td><td style="text-align:center">${item.qty} ${item.unit}</td><td style="text-align:right">Rp ${Number(item.unitPrice).toLocaleString("id-ID")}</td><td style="text-align:right;font-weight:600">Rp ${sub.toLocaleString("id-ID")}</td>${po.itemDecisions?"<td style=\"text-align:center;color:"+(isRej?"#dc2626":"#16a34a")+"\">"+(isRej?"✕":"✓")+"</td>":""}</tr>`;
  }).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${po.poNumber}</title><style>${pdfCss}</style></head><body><div class="header"><div><h1>Samara <span style="color:#38bdf8">Yachting</span></h1><div style="font-size:12px;color:#6b7280;margin-top:3px">Purchase Order</div></div><div style="text-align:right"><div style="font-size:22px;font-weight:700">${po.poNumber}</div><div style="font-size:12px;color:#6b7280;margin-top:4px">${(po.status&&po.status.toUpperCase())}</div></div></div><table><thead><tr><th>Vessel</th><th>Supplier</th><th>Requested By</th><th>PO Date</th>${po.deliveryDate?"<th>Delivery</th>":""}<th>Notes</th></tr></thead><tbody><tr><td>${po.vessel}</td><td>${po.supplier||"Various"}</td><td>${po.requestedBy}</td><td>${fmtDate(po.date)}</td>${po.deliveryDate?"<td>"+fmtDate(po.deliveryDate)+"</td>":""}<td>${po.notes||"—"}</td></tr></tbody></table><h2>Line Items</h2><table><thead><tr><th>Item</th><th>Category</th><th>Supplier</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Subtotal</th>${po.itemDecisions?"<th>Status</th>":""}</tr></thead><tbody>${rows}</tbody><tfoot><tr style="background:#f8f9fa;font-weight:700"><td colspan="${po.itemDecisions?5:4}" style="text-align:right">TOTAL</td><td style="text-align:right">Rp ${total.toLocaleString("id-ID")}</td>${po.itemDecisions?"<td></td>":""}</tr></tfoot></table><div class="footer"><span>Samara Yachting</span><span>${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}</span></div></body></html>`;
  openPdf(html,po.poNumber+"-PurchaseOrder");
};

const sendPOEmail = (po) => {
  const total = po.items.reduce((s,i)=>s+Number(i.qty||0)*Number(i.unitPrice||0),0);
  const lines = po.items.map(i=>`  ${i.name} (${i.supplier||""}) - ${i.qty} ${i.unit} @ Rp ${Number(i.unitPrice).toLocaleString("id-ID")} = Rp ${(Number(i.qty)*Number(i.unitPrice)).toLocaleString("id-ID")}`).join("\n");
  const sub = encodeURIComponent(`[${(po.status&&po.status.toUpperCase())}] ${po.poNumber} - Rp ${total.toLocaleString("id-ID")}`);
  const body = encodeURIComponent(`Purchase Order: ${po.poNumber}\nVessel: ${po.vessel}\nRequested By: ${po.requestedBy}\nPO Date: ${fmtDate(po.date)}\n${"─".repeat(30)}\n${lines}\n${"─".repeat(30)}\nTOTAL: Rp ${total.toLocaleString("id-ID")}\n\nSamara Yachting`);
  const a = document.createElement("a");
  a.href=`mailto:?subject=${sub}&body=${body}`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

const generateWithdrawalPdf = ({mode,rows,partyTotals,outEntries,filterYear,totalOut,totalVal}) => {
  const period = filterYear===0?"All Periods":`Year ${filterYear}`;
  const modeLabel = mode==="weekly"?"Weekly":mode==="monthly"?"Monthly":"By Party";
  const PC = {"Samara 1":"#0369a1","Samara 2":"#065f46","Mischief":"#9d174d","Otium":"#92400e","Staff":"#4c1d95","Lain-lain":"#374151"};
  const pIcon = p => (BOATS.includes(p))?"⚓":p==="Staff"?"👤":"📋";
  const cards = TAKEN_BY.map(t=>{
    const d=partyTotals[t]; if(!d||d.qty===0) return "";
    const pct=totalOut>0?Math.round(d.qty/totalOut*100):0;
    return `<div class="card" style="border-left:4px solid ${PC[t]||"#111"}"><div style="font-size:10px;text-transform:uppercase;color:${PC[t]};font-weight:700;margin-bottom:4px">${pIcon(t)} ${t}</div><div style="font-size:18px;font-weight:700">${d.qty.toLocaleString("id-ID")} units</div>${(d.value>0)?"<div style=\"font-size:11px;color:#6b7280\">Rp "+d.value.toLocaleString("id-ID")+"</div>":""}<div style="background:#e5e7eb;height:4px;margin-top:6px;border-radius:2px"><div style="background:${PC[t]};height:4px;border-radius:2px;width:${pct}%"></div></div></div>`;
  }).join("");
  let body = "";
  if(mode==="monthly"||mode==="weekly"){
    const thead = `<tr><th>${mode==="weekly"?"Week":"Month"}</th><th style="text-align:right">Total</th>${TAKEN_BY.map(t=>"<th style=\"text-align:right\">"+t+"</th>").join("")}<th style="text-align:right">Value</th></tr>`;
    const tbody = rows.filter(r=>r.total>0).map(r=>`<tr><td><strong>${r.month||r.label}</strong></td><td style="text-align:right;font-weight:700">${r.total}</td>${TAKEN_BY.map(t=>"<td style=\"text-align:right\">"+(r.byParty[t]>0?r.byParty[t]:"—")+"</td>").join("")}<td style="text-align:right">${(r.value>0)?fmt$(r.value):"—"}</td></tr>`).join("");
    const tfoot = `<tr style="background:#fce7f3;font-weight:700"><td>TOTAL</td><td style="text-align:right">${totalOut}</td>${TAKEN_BY.map(t=>"<td style=\"text-align:right\">"+(((partyTotals[t]||{}).qty||0)>0?(partyTotals[t]||{}).qty:"—")+"</td>").join("")}<td style="text-align:right">${(totalVal>0)?fmt$(totalVal):"—"}</td></tr>`;
    body = `<h2>${modeLabel} Breakdown</h2><table><thead>${thead}</thead><tbody>${tbody}</tbody><tfoot>${tfoot}</tfoot></table>`;
  } else {
    body = TAKEN_BY.map(party=>{
      const items=outEntries.filter(l=>l.takenBy===party); if(!items.length) return "";
      const tot=items.reduce((s,l)=>s+l.qty,0), val=items.reduce((s,l)=>s+(l.totalValue||0),0);
      const trows=items.map(l=>`<tr><td>${fmtDate(l.ts)}</td><td><strong>${l.itemName}</strong></td><td>${l.boxName||l.boat||""}</td><td style="text-align:center">${l.qty} ${l.unit}</td><td style="text-align:right">${l.unitPrice?"Rp "+Number(l.unitPrice).toLocaleString("id-ID"):"—"}</td><td style="text-align:right;font-weight:600">${l.totalValue?"Rp "+Number(l.totalValue).toLocaleString("id-ID"):"—"}</td><td>${l.note||"—"}</td></tr>`).join("");
      return `<h2 style="color:${PC[party]||"#111"};border-left:4px solid ${PC[party]||"#111"};padding-left:8px">${pIcon(party)} ${party} — ${tot} units${val?" · Rp "+val.toLocaleString("id-ID"):""}</h2><table><thead><tr><th>Date</th><th>Item</th><th>Category</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Notes</th></tr></thead><tbody>${trows}</tbody><tfoot><tr style="background:#f3f4f6;font-weight:700"><td colspan="3">TOTAL</td><td style="text-align:center">${tot}</td><td></td><td>${val?"Rp "+val.toLocaleString("id-ID"):"—"}</td><td></td></tr></tfoot></table>`;
    }).join("");
  }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Withdrawal Report — ${modeLabel}</title><style>${pdfCss}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0 20px}.card{background:#f9fafb;border-radius:8px;padding:12px}</style></head><body><div class="header"><div><h1>Samara <span style="color:#be185d">Yachting</span></h1><div style="font-size:12px;color:#6b7280;margin-top:3px">Withdrawal Report <span class="badge">${modeLabel}</span></div><div style="font-size:11px;color:#9ca3af;margin-top:2px">Period: ${period} · ${new Date().toLocaleString("en-GB")}</div></div><div style="text-align:right"><div style="font-size:24px;font-weight:700;color:#be185d">${totalOut.toLocaleString("id-ID")} units</div>${(totalVal>0)?"<div style=\"font-size:14px;font-weight:600\">Rp "+totalVal.toLocaleString("id-ID")+"</div>":""}</div></div><h2>Summary by Party</h2><div class="cards">${cards||"<p>No data.</p>"}</div>${body}<div class="footer"><span>Samara Yachting</span><span>${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}</span></div></body></html>`;
  openPdf(html,"Withdrawal-Report-"+modeLabel.replace(/\s+/g,"-"));
};

const buildReceiptText = (sale) => {
  const lines = (sale.items||[]).map(i=>`  ${i.name} x${i.qty} = Rp ${((i.qty*(i.unitPrice||0)).toLocaleString("id-ID"))}`);
  return `SAMARA YACHTING\n${"─".repeat(28)}\nVessel: ${sale.boat}${sale.guestName?"\nGuest: "+sale.guestName:""}\nDate: ${new Date(sale.closedAt||sale.ts).toLocaleString("en-GB")}\n${"─".repeat(28)}\n${lines.join("\n")}\n${"─".repeat(28)}\nTOTAL: Rp ${(sale.total||0).toLocaleString("id-ID")}\nPayment: ${sale.payMethod||"—"}\n${"─".repeat(28)}\nThank you for sailing with Samara!`;
};

// ─── PIN MANAGEMENT ───────────────────────────────────────────────────────────
function PinSettingsPanel() {
  const [pins, setPins] = useState(loadPins);
  const [editing, setEditing] = useState(null);
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const ROLES = [{key:"admin",label:"Admin",icon:"🔑",color:"#f59e0b"},{key:"Samara 1",label:"Samara 1",icon:"⚓",color:"#38bdf8"},{key:"Samara 2",label:"Samara 2",icon:"⚓",color:"#34d399"},{key:"Mischief",label:"Mischief",icon:"⚓",color:"#f472b6"},{key:"Otium",label:"Otium",icon:"⚓",color:"#fb923c"}];
  const save = () => {
    if(newPin.length<4){setMsg("Minimum 4 digits.");return;}
    if(newPin!==confirm){setMsg("PINs don't match.");return;}
    const up={...pins,[editing]:newPin};
    setPins(up); savePins(up);
    setEditing(null); setNewPin(""); setConfirm("");
    setMsg("✓ PIN updated!"); setTimeout(()=>setMsg(""),3000);
  };
  return (
    <div>
      <div style={{marginBottom:28}}><h1 style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:600}}>🔐 PIN Management</h1><p style={{color:"#475569",fontSize:13,marginTop:4}}>Set login PINs for each vessel and admin</p></div>
      {msg&&<div style={{background:msg.startsWith("✓")?"#14532d":"#7f1d1d",color:msg.startsWith("✓")?"#34d399":"#f87171",padding:"10px 16px",borderRadius:9,marginBottom:16,fontSize:13,fontWeight:600}}>{msg}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {ROLES.map(r=>(
          <div key={r.key} style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:14,padding:"18px 20px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:editing===r.key?16:0}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:10,background:r.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{r.icon}</div>
                <div>
                  <div style={{fontWeight:700,fontSize:15,color:"#e2e8f0"}}>{r.label}</div>
                  <div style={{fontSize:12,color:"#475569",marginTop:2,fontFamily:"'DM Mono',monospace"}}>{"●".repeat((pins[r.key]&&pins[r.key].length)||4)}</div>
                </div>
              </div>
              <button onClick={()=>{setEditing(editing===r.key?null:r.key);setNewPin("");setConfirm("");}} style={{padding:"7px 16px",borderRadius:9,border:"1px solid "+r.color+"44",background:r.color+"11",color:r.color,cursor:"pointer",fontWeight:600,fontSize:12,fontFamily:"'DM Sans',sans-serif"}}>{editing===r.key?"Cancel":"Change PIN"}</button>
            </div>
            {editing===r.key&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><label style={{fontSize:11,color:"#64748b",fontWeight:600,display:"block",marginBottom:5}}>New PIN</label><input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={e=>setNewPin(e.target.value.replace(/[^0-9]/g,""))} placeholder="4–6 digits" style={inputStyle}/></div>
                <div><label style={{fontSize:11,color:"#64748b",fontWeight:600,display:"block",marginBottom:5}}>Confirm</label><input type="password" inputMode="numeric" maxLength={6} value={confirm} onChange={e=>setConfirm(e.target.value.replace(/[^0-9]/g,""))} placeholder="Repeat" style={inputStyle}/></div>
                <div style={{gridColumn:"1/-1"}}><button onClick={save} style={{...btnPrimary,width:"100%",background:"linear-gradient(135deg,"+r.color+"cc,"+r.color+")",color:"#080c12"}}>Save PIN</button></div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{marginTop:20,background:"#0c1018",border:"1px solid #f59e0b33",borderRadius:12,padding:"14px 18px",fontSize:13,color:"#94a3b8"}}>
        <strong style={{color:"#f59e0b"}}>Defaults:</strong> Admin:0000 · Samara 1:1111 · Samara 2:2222 · Mischief:3333 · Otium:4444
      </div>
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [pins] = useState(loadPins);
  const [role, setRole] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const ROLES = [
    {key:"admin",    label:"Admin",    icon:"🔑", color:"#f59e0b", desc:"Full access — all vessels"},
    {key:"Samara 1", label:"Samara 1", icon:"⚓", color:"#38bdf8", desc:"Cashier — Samara 1 only"},
    {key:"Samara 2", label:"Samara 2", icon:"⚓", color:"#34d399", desc:"Cashier — Samara 2 only"},
    {key:"Mischief", label:"Mischief", icon:"⚓", color:"#f472b6", desc:"Cashier — Mischief only"},
    {key:"Otium",    label:"Otium",    icon:"⚓", color:"#fb923c", desc:"Cashier — Otium only"},
  ];
  const sel = ROLES.find(r=>r.key===role);
  const tryLogin = () => {
    if(pin===pins[role]){onLogin(role);}
    else{setError("Wrong PIN. Try again.");setPin("");}
  };
  const dig = d => { if(d==="⌫") setPin(p=>p.slice(0,-1)); else if(pin.length<6) setPin(p=>p+d); };
  return (
    <div style={{minHeight:"100vh",background:"#080c12",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif",padding:24}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600&family=DM+Mono:wght@400&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:32,fontWeight:600,color:"#e2e8f0"}}>Samara</div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#38bdf8",letterSpacing:"0.2em",marginTop:4}}>INVENTORY & CASHIER</div>
        </div>
        {!role ? (
          <div>
            <div style={{fontSize:12,color:"#475569",textAlign:"center",marginBottom:16,fontWeight:600,letterSpacing:"0.08em"}}>SELECT YOUR VESSEL</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {ROLES.map(r=>(
                <button key={r.key} onClick={()=>{setRole(r.key);setPin("");setError("");}} style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:14,padding:"16px 20px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14,fontFamily:"'DM Sans',sans-serif",width:"100%"}}>
                  <div style={{width:44,height:44,borderRadius:12,background:r.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{r.icon}</div>
                  <div><div style={{fontWeight:700,fontSize:15,color:"#e2e8f0"}}>{r.label}</div><div style={{fontSize:12,color:"#475569",marginTop:2}}>{r.desc}</div></div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <button onClick={()=>{setRole(null);setPin("");setError("");}} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:13,marginBottom:20,display:"flex",alignItems:"center",gap:6,fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>← Back</button>
            <div style={{background:"#0c1018",border:"1px solid "+sel.color+"44",borderRadius:16,padding:28}}>
              <div style={{textAlign:"center",marginBottom:24}}>
                <div style={{fontSize:32,marginBottom:8}}>{sel.icon}</div>
                <div style={{fontWeight:700,fontSize:18,color:sel.color}}>{sel.label}</div>
                <div style={{fontSize:12,color:"#475569",marginTop:4}}>{sel.desc}</div>
              </div>
              <div style={{display:"flex",justifyContent:"center",gap:12,marginBottom:24}}>
                {Array.from({length:Math.max(4,pin.length+1)}).map((_,i)=>(
                  <div key={i} style={{width:14,height:14,borderRadius:"50%",background:i<pin.length?sel.color:"#1a2030",border:"2px solid "+(i<pin.length?sel.color:"#2d3748"),transition:"all .2s"}}/>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
                {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d,i)=>(
                  <button key={i} onClick={()=>d&&dig(d)} style={{padding:"16px",borderRadius:12,border:"1px solid #1a2030",background:d?"#0c1018":"transparent",color:d==="⌫"?"#f472b6":"#e2e8f0",fontSize:18,fontWeight:600,cursor:d?"pointer":"default",fontFamily:"'DM Mono',monospace",transition:"all .15s"}}>{d}</button>
                ))}
              </div>
              {error&&<div style={{textAlign:"center",color:"#f87171",fontSize:13,marginBottom:12,fontWeight:600}}>{error}</div>}
              <button onClick={tryLogin} disabled={pin.length<4} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:pin.length>=4?"linear-gradient(135deg,"+sel.color+"cc,"+sel.color+")":"#1a2030",color:pin.length>=4?"#080c12":"#334155",fontWeight:700,fontSize:15,cursor:pin.length>=4?"pointer":"not-allowed",fontFamily:"'DM Sans',sans-serif",transition:"all .2s"}}>Login</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────
const Label = ({children}) => <div style={{fontSize:12,fontWeight:600,color:"#64748b",marginBottom:6,letterSpacing:"0.04em"}}>{children}</div>;
const PageHeader = ({title,subtitle}) => <div style={{marginBottom:24}}><h1 style={{margin:0,fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:600,color:"#e2e8f0"}}>{title}</h1>{subtitle&&<p style={{margin:"5px 0 0",color:"#475569",fontSize:13}}>{subtitle}</p>}</div>;
const SectionLabel = ({children}) => <div style={{fontSize:11,fontWeight:700,color:"#334155",letterSpacing:"0.15em",marginBottom:10,textTransform:"uppercase"}}>{children}</div>;
const CategoryBadge = ({children}) => <span style={{background:"#1a2030",color:"#64748b",padding:"3px 10px",borderRadius:6,fontSize:12,fontWeight:500}}>{children}</span>;
const Toast = ({toast}) => toast?<div style={{position:"fixed",top:20,right:20,zIndex:9999,background:toast.ok?"#0f766e":"#b91c1c",color:"white",padding:"13px 22px",borderRadius:10,boxShadow:"0 12px 40px rgba(0,0,0,.5)",fontWeight:600,fontSize:14,maxWidth:380}}>{toast.msg}</div>:null;

function TogglePair({options,value,onChange,activeColor="#38bdf8"}){
  return <div style={{display:"flex",gap:8}}>{options.map(o=><button key={o.value} onClick={()=>onChange(o.value)} style={{flex:1,padding:"10px",borderRadius:8,cursor:"pointer",border:value===o.value?"2px solid "+activeColor:"1px solid #1a2030",background:value===o.value?activeColor+"18":"#080c12",color:value===o.value?activeColor:"#475569",fontWeight:700,fontFamily:"'DM Sans',sans-serif",fontSize:13}}>{o.label}</button>)}</div>;
}

function ModalShell({title,children,onClose}){
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"#0c1018",borderRadius:16,border:"1px solid #1a2030",padding:28,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,.7)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <h3 style={{margin:0,fontSize:17,fontWeight:700}}>{title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({onCancel,onConfirm,label,color}){
  return <div style={{display:"flex",gap:10}}><button onClick={onCancel} style={{...btnGhost,flex:0.4}}>Cancel</button><button onClick={onConfirm} style={{...btnPrimary,flex:1,background:color?"linear-gradient(135deg,"+color+"cc,"+color+")":"linear-gradient(135deg,#38bdf8cc,#38bdf8)",color:"#080c12"}}>{label}</button></div>;
}

// ─── FOOD STORAGE SECTION ─────────────────────────────────────────────────────
function FoodSection({boxes,onAddItem,onEditItem,onTx,pageTitle,pageSubtitle,filterCat}){
  const [search,setSearch]=useState("");
  const [activeCat,setActiveCat]=useState(null);
  const filtered = boxes.filter(b=>filterCat?b.categoryId===filterCat:b.categoryId!=="sparepart");
  return(
    <div>
      <PageHeader title={pageTitle||"Food Storage"} subtitle={pageSubtitle||"Central storage — organized by category"}/>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {filtered.map(b=>{const cat=getCat(b.categoryId);const sel=activeCat===b.id;return(<button key={b.id} onClick={()=>setActiveCat(sel?null:b.id)} style={{padding:"7px 14px",borderRadius:9,cursor:"pointer",border:sel?"2px solid "+cat.color:"1px solid #1a2030",background:sel?cat.color+"18":"transparent",color:sel?cat.color:"#64748b",fontWeight:600,fontSize:12,fontFamily:"'DM Sans',sans-serif"}}>{cat.icon} {cat.label}</button>);})}
      </div>
      {filtered.filter(b=>!activeCat||b.id===activeCat).map(box=>{
        const cat=getCat(box.categoryId);
        const items=box.items.filter(i=>!search||i.name.toLowerCase().includes(search.toLowerCase()));
        const boxVal=items.reduce((s,i)=>s+(i.stock||0)*(i.unitPrice||0),0);
        return(
          <div key={box.id} style={{marginBottom:20,background:"#0c1018",border:"1px solid #1a2030",borderRadius:14,overflow:"hidden"}}>
            <div style={{background:cat.color+"18",borderBottom:"1px solid "+cat.color+"33",padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:700,color:cat.color,fontSize:15}}>{cat.icon} {cat.label}</span>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#64748b"}}>{fmt$(boxVal)}</span>
                <button onClick={()=>onAddItem(box.id)} style={{...btnAccent,fontSize:11,padding:"4px 12px"}}>+ Add Item</button>
              </div>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Item","Unit","Unit Price","Stock","Value",""].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map(item=>{
                  const val=(item.stock||0)*(item.unitPrice||0);
                  const low=(item.stock||0)<=LOW;
                  return(
                    <tr key={item.id} style={{borderTop:"1px solid #0f1117"}}>
                      <td style={tdS}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          {low&&<span style={{color:"#f59e0b",fontSize:12}}>⚠</span>}
                          <div>
                            <div style={{fontWeight:600}}>{item.name}</div>
                            {item.entryDate&&<div style={{fontSize:11,color:"#334155",fontFamily:"'DM Mono',monospace"}}>{fmtDate(item.entryDate)}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{...tdS,color:"#64748b"}}>{item.unit}</td>
                      <td style={{...tdS,fontFamily:"'DM Mono',monospace",fontSize:13,color:"#94a3b8"}}>{item.unitPrice?`Rp ${Number(item.unitPrice).toLocaleString("id-ID")}`:"—"}</td>
                      <td style={{...tdS,fontFamily:"'DM Mono',monospace",fontWeight:700,color:low?"#f59e0b":"#e2e8f0"}}>{item.stock||0}</td>
                      <td style={{...tdS,fontFamily:"'DM Mono',monospace",fontSize:13,color:"#64748b"}}>{fmt$(val)}</td>
                      <td style={{...tdS}}>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>onTx(item,box.id)} style={{...btnAccent,fontSize:11,padding:"4px 10px"}}>↕</button>
                          <button onClick={()=>onEditItem(item,box.id)} style={{...btnGhost,fontSize:11,padding:"4px 10px"}}>✏</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ─── BEVERAGES + POS SECTION ──────────────────────────────────────────────────
function BevSection({bevItems,salesLog,openBills,setOpenBills,recipes,setRecipes,sessionVessel,isAdmin,onAdd,onTx,onEdit,onSale}){
  const [activeBoat,setActiveBoat]=useState(sessionVessel||BOATS[0]);
  const [mode,setMode]=useState(sessionVessel?"pos":"inventory");
  const [posBoat,setPosBoat]=useState(sessionVessel||BOATS[0]);
  const [cart,setCart]=useState([]);
  const [guestName,setGuestName]=useState("");
  const [payMethod,setPayMethod]=useState("Cash");
  const [search,setSearch]=useState("");
  const [posCat,setPosCat]=useState("All");
  const [receipt,setReceipt]=useState(null);
  const [billsOpen,setBillsOpen]=useState(false);
  const [activeBillId,setActiveBillId]=useState(null);
  const [newBillName,setNewBillName]=useState("");
  const [editingBillName,setEditingBillName]=useState(null);
  const [shareEmail,setShareEmail]=useState("");
  const [shareWa,setShareWa]=useState("");
  const [showRecipes,setShowRecipes]=useState(false);

  const boatItems=bevItems[activeBoat]||[];
  const posItems=bevItems[posBoat]||[];
  const boatBills=(openBills||[]).filter(b=>b.boat===posBoat);
  const activeBill=boatBills.find(b=>b.id===activeBillId)||null;

  const addToCart=item=>setCart(p=>{const ex=p.find(c=>c.id===item.id);if(ex)return p.map(c=>c.id===item.id?{...c,qty:c.qty+1}:c);return[...p,{...item,qty:1}];});
  const chgQty=(id,d)=>setCart(p=>p.map(c=>c.id===id?{...c,qty:Math.max(0,c.qty+d)}:c).filter(c=>c.qty>0));
  const clearCart=()=>{setCart([]);setGuestName("");setPayMethod("Cash");setActiveBillId(null);};
  const cartTotal=cart.reduce((s,c)=>s+c.qty*(c.unitPrice||0),0);

  const filteredPos=posItems.filter(i=>{
    const mc=posCat==="All"||i.category===posCat;
    const ms=!search||i.name.toLowerCase().includes(search.toLowerCase());
    return mc&&ms&&(i.stock||0)>0;
  });

  const newBill=(name)=>{
    const b={id:"bill-"+Date.now(),boat:posBoat,guestName:name||"",entries:[],total:0,createdAt:new Date().toISOString(),status:"open"};
    setOpenBills(p=>[b,...p]);setActiveBillId(b.id);setBillsOpen(false);setNewBillName("");
  };
  const renameBill=(id,name)=>{
    setOpenBills(p=>p.map(b=>b.id===id?{...b,guestName:name}:b));
    setEditingBillName(null);
  };
  const applyRecipes=(items)=>{
    const deductions=[];
    items.forEach(saleItem=>{
      if(saleItem.category!=="Cocktail")return;
      const link=(recipes||[]).find(r=>r.cocktailId===saleItem.id);
      if(!link||!link.spiritId)return;
      deductions.push({itemId:link.spiritId,qty:saleItem.qty,name:link.spiritName});
    });
    return deductions;
  };
  const addToBill=()=>{
    if(!cart.length||!activeBillId)return;
    const si=cart.map(c=>({id:c.id,name:c.name,unit:c.unit,qty:c.qty,unitPrice:c.unitPrice||0,category:c.category}));
    const deductions=applyRecipes(si);
    onSale(si,posBoat,guestName||(activeBill&&activeBill.guestName),"Bill",deductions);
    setOpenBills(p=>p.map(b=>{if(b.id!==activeBillId)return b;const entry={id:"e"+Date.now(),items:si,note:guestName,ts:new Date().toISOString(),subtotal:cartTotal};return{...b,guestName:b.guestName||guestName,entries:[...b.entries,entry],total:(b.total||0)+cartTotal};}));
    clearCart();
  };
  const closeBill=(bill,pm)=>{
    const closed={...bill,status:"closed",payMethod:pm,closedAt:new Date().toISOString()};
    setOpenBills(p=>p.map(b=>b.id===bill.id?closed:b));
    setReceipt({...closed,items:bill.entries.flatMap(e=>e.items),total:bill.total||0,payMethod:pm,isBill:true});
    setBillsOpen(false);
  };
  // Apply cocktail recipe deductions — called alongside normal sale
    const recordSale=()=>{
    if(!cart.length)return;
    const si=cart.map(c=>({id:c.id,name:c.name,unit:c.unit,qty:c.qty,unitPrice:c.unitPrice||0,category:c.category}));
    const deductions=applyRecipes(si);
    onSale(si,posBoat,guestName,payMethod,deductions);
    setReceipt({id:Date.now(),boat:posBoat,items:si,guestName,payMethod,total:cartTotal,ts:new Date().toISOString(),deductions});
    clearCart();
  };
  const sendEmail=sale=>{const txt=buildReceiptText(sale);const sub=encodeURIComponent(`Receipt — Samara ${sale.boat}`);const a=document.createElement("a");a.href=`mailto:${shareEmail||""}?subject=${sub}&body=${encodeURIComponent(txt)}`;document.body.appendChild(a);a.click();document.body.removeChild(a);};
  const sendWa=sale=>{const txt=buildReceiptText(sale);const num=shareWa.replace(/[^0-9]/g,"");const a=document.createElement("a");a.href=`https://wa.me/${num}?text=${encodeURIComponent(txt)}`;a.target="_blank";a.rel="noopener";document.body.appendChild(a);a.click();document.body.removeChild(a);};

  // ── RECEIPT ──
  if(receipt) return(
    <div style={{maxWidth:500,margin:"0 auto"}}>
      <div style={{background:"#0c1018",border:"1px solid #34d39933",borderRadius:16,padding:28}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:36,marginBottom:8}}>✓</div>
          <div style={{fontSize:20,fontWeight:700,color:"#34d399",marginBottom:4}}>{receipt.isBill?"Bill Closed!":"Sale Recorded!"}</div>
          <div style={{color:"#64748b",fontSize:13}}>⚓ {receipt.boat}{receipt.guestName?" · "+receipt.guestName:""}</div>
        </div>
        <div style={{background:"#080c12",borderRadius:12,padding:16,marginBottom:16}}>
          {receipt.items.map((si,i)=>{
            const rec=si.category==="Cocktail"?(recipes||[]).find(r=>r.cocktailId===si.id&&r.spiritId):null;
            return(
              <div key={i} style={{borderBottom:"1px solid #1a2030"}}>
                <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:13}}>
                  <span>{si.name} <span style={{color:"#64748b"}}>×{si.qty}</span></span>
                  <span style={{fontFamily:"'DM Mono',monospace",color:"#94a3b8"}}>{fmt$(si.qty*(si.unitPrice||0))}</span>
                </div>
                {rec&&<div style={{fontSize:11,color:"#fb923c",paddingBottom:6,paddingLeft:8}}>
                  🍹 −{si.qty} {rec.spiritName}
                </div>}
              </div>
            );
          })}
          <div style={{display:"flex",justifyContent:"space-between",paddingTop:12,fontWeight:700,fontSize:18}}>
            <span style={{color:"#94a3b8"}}>TOTAL</span>
            <span style={{fontFamily:"'DM Mono',monospace",color:"#34d399"}}>{fmt$(receipt.total)}</span>
          </div>
          <div style={{fontSize:12,color:"#475569",marginTop:6}}>Payment: {receipt.payMethod}</div>
        </div>
        <div style={{background:"#080c12",borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:"#64748b",letterSpacing:"0.08em",marginBottom:12}}>SEND RECEIPT TO GUEST</div>
          <div style={{marginBottom:10}}>
            <Label>📧 Email</Label>
            <div style={{display:"flex",gap:8}}><input value={shareEmail} onChange={e=>setShareEmail(e.target.value)} placeholder="guest@email.com" type="email" style={{...inputStyle,flex:1,fontSize:13}}/><button onClick={()=>sendEmail(receipt)} style={{...btnGhost,padding:"9px 14px",fontSize:12,whiteSpace:"nowrap"}}>Send</button></div>
          </div>
          <div>
            <Label>💬 WhatsApp</Label>
            <div style={{display:"flex",gap:8}}><input value={shareWa} onChange={e=>setShareWa(e.target.value)} placeholder="+628123456789" type="tel" style={{...inputStyle,flex:1,fontSize:13}}/><button onClick={()=>sendWa(receipt)} style={{background:"#25d36618",border:"1px solid #25d36644",color:"#25d366",padding:"9px 14px",borderRadius:9,cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>Send</button></div>
          </div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>setReceipt(null)} style={{...btnPrimary,flex:1}}>New Order</button>
          <button onClick={()=>{setReceipt(null);setMode("inventory");}} style={{...btnGhost,flex:1}}>Stock View</button>
        </div>
      </div>
    </div>
  );

  // ── COCKTAIL RECIPE MANAGER ──
  const cocktails = posItems.filter(i=>i.category==="Cocktail");
  const spirits   = posItems.filter(i=>i.category==="Liquor"||i.category==="White Wine"||i.category==="Red Wine"||i.category==="Rosé Wine"||i.category==="Sparkling Wine"||i.category==="Champagne"||i.category==="Beer"||i.category==="Soft Drink");

  const linkSpirit=(cocktailId,cocktailName,spiritId,spiritName)=>{
    setRecipes(p=>{
      const filtered=p.filter(r=>r.cocktailId!==cocktailId);
      if(!spiritId)return filtered;
      return[...filtered,{cocktailId,cocktailName,spiritId,spiritName}];
    });
  };

  if(showRecipes) return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <button onClick={()=>setShowRecipes(false)} style={{...btnGhost,fontSize:13,padding:"8px 14px"}}>← Back</button>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:600}}>🍹 Cocktail Recipes</div>
      </div>

      <div style={{marginBottom:20,background:"#fb923c10",border:"1px solid #fb923c33",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#94a3b8"}}>
        <strong style={{color:"#fb923c"}}>How it works:</strong> Each cocktail is linked to one base spirit. Cocktails have their own pre-batched stock. When a cocktail is sold, <strong style={{color:"#e2e8f0"}}>1 unit of the linked spirit is automatically deducted</strong> from inventory.
      </div>

      {/* Vessel selector */}
      {isAdmin&&<div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {BOATS.map(b=>{const c=BOAT_COLORS[b];const sel=posBoat===b;return(<button key={b} onClick={()=>setPosBoat(b)} style={{padding:"8px 18px",borderRadius:9,cursor:"pointer",border:sel?"2px solid "+c.accent:"1px solid #1a2030",background:sel?c.bg:"transparent",color:sel?c.accent:"#64748b",fontWeight:700,fontFamily:"'DM Sans',sans-serif",fontSize:13}}>{b}</button>);})}
      </div>}

      {cocktails.length===0?(
        <div style={{textAlign:"center",padding:48,color:"#334155",background:"#0c1018",borderRadius:14,border:"1px solid #1a2030"}}>
          <div style={{fontSize:36,marginBottom:12}}>🍹</div>
          <div style={{fontWeight:600,marginBottom:6}}>No cocktails on {posBoat} yet</div>
          <div style={{fontSize:12,color:"#475569"}}>Add beverages with category "Cocktail" first</div>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {cocktails.map(cocktail=>{
            const link=(recipes||[]).find(r=>r.cocktailId===cocktail.id);
            const linkedSpirit=link?spirits.find(s=>s.id===link.spiritId):null;
            return(
              <div key={cocktail.id} style={{background:"#0c1018",border:"1px solid "+(link?"#fb923c44":"#1a2030"),borderRadius:14,padding:"18px 20px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:link?12:0}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,color:"#e2e8f0",marginBottom:3}}>🍹 {cocktail.name}</div>
                    <div style={{fontSize:12,color:"#64748b"}}>{fmt$(cocktail.unitPrice||0)} · Stock: <span style={{color:"#e2e8f0",fontWeight:600}}>{cocktail.stock} {cocktail.unit}</span></div>
                  </div>
                  {link?(
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{background:"#fb923c18",border:"1px solid #fb923c44",borderRadius:8,padding:"6px 14px",fontSize:13}}>
                        <span style={{color:"#64748b"}}>deducts 1× </span>
                        <span style={{color:"#fb923c",fontWeight:700}}>{link.spiritName}</span>
                        {linkedSpirit&&<span style={{color:"#475569",fontSize:11}}> (stock: {linkedSpirit.stock})</span>}
                      </div>
                      <button onClick={()=>linkSpirit(cocktail.id,cocktail.name,"","")} style={{background:"#f8717118",border:"none",color:"#f87171",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:700}}>✕</button>
                    </div>
                  ):(
                    <div style={{fontSize:12,color:"#334155",fontStyle:"italic"}}>No spirit linked</div>
                  )}
                </div>

                {/* Spirit selector */}
                <div style={{marginTop:link?8:12}}>
                  <Label>{link?"Change linked spirit":"Link a base spirit"}</Label>
                  <select
                    value={(link&&link.spiritId)||""}
                    onChange={e=>{
                      const it=spirits.find(s=>s.id===e.target.value);
                      if(it) linkSpirit(cocktail.id,cocktail.name,it.id,it.name);
                      else linkSpirit(cocktail.id,cocktail.name,"","");
                    }}
                    style={inputStyle}
                  >
                    <option value="">— No spirit linked —</option>
                    {spirits.map(s=>(
                      <option key={s.id} value={s.id}>{s.name} · {s.category} · stock: {s.stock} {s.unit}</option>
                    ))}
                  </select>
                  <div style={{fontSize:11,color:"#475569",marginTop:5}}>Selling 1 {cocktail.name} will deduct 1 {link?link.spiritName:"(select spirit)"} from stock</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── INVENTORY VIEW ──
  if(mode==="inventory") return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,flexWrap:"wrap",gap:12}}>
        <PageHeader title="Beverages" subtitle="Stock per vessel — all categories"/>
        <div style={{display:"flex",gap:8}}><button onClick={()=>setMode("pos")} style={{...btnPrimary,background:"linear-gradient(135deg,#a78bfacc,#a78bfa)",display:"flex",alignItems:"center",gap:8}}>🧾 Cashier</button><button onClick={()=>setShowRecipes(true)} style={{...btnGhost,fontSize:13,color:"#fb923c",borderColor:"#fb923c33"}}>🍹 Recipes</button></div>
      </div>
      {isAdmin&&<div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>{BOATS.map(b=>{const c=BOAT_COLORS[b];const sel=activeBoat===b;return(<button key={b} onClick={()=>setActiveBoat(b)} style={{padding:"9px 20px",borderRadius:10,cursor:"pointer",border:sel?"2px solid "+c.accent:"1px solid #1a2030",background:sel?c.bg:"transparent",color:sel?c.accent:"#64748b",fontWeight:700,fontFamily:"'DM Sans',sans-serif",fontSize:13}}>{b}</button>);})}</div>}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
        <button onClick={()=>onAdd(activeBoat)} style={{...btnAccent,fontSize:13}}>+ Add Item</button>
      </div>
      {BEV_CATEGORIES.map(cat=>{
        const items=boatItems.filter(i=>i.category===cat);
        if(!items.length)return null;
        const color=CAT_COLORS_BEV[cat]||"#94a3b8";
        const catVal=items.reduce((s,i)=>s+(i.stock||0)*(i.unitPrice||0),0);
        return(
          <div key={cat} style={{marginBottom:20,background:"#0c1018",border:"1px solid #1a2030",borderRadius:14,overflow:"hidden"}}>
            <div style={{background:color+"18",borderBottom:"1px solid "+color+"33",padding:"10px 18px",display:"flex",justifyContent:"space-between"}}>
              <span style={{fontWeight:700,color,fontSize:14}}>{cat}</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#64748b"}}>{fmt$(catVal)}</span>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Item","Unit","Price","Stock","Value",""].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map(item=>{
                  const low=(item.stock||0)<=LOW;
                  return(
                    <tr key={item.id} style={{borderTop:"1px solid #0f1117"}}>
                      <td style={tdS}><div style={{fontWeight:600,display:"flex",alignItems:"center",gap:6}}>{low&&<span style={{color:"#f59e0b",fontSize:12}}>⚠</span>}<div><div>{item.name}</div>{item.entryDate&&<div style={{fontSize:11,color:"#334155",fontFamily:"'DM Mono',monospace"}}>{fmtDate(item.entryDate)}</div>}</div></div></td>
                      <td style={{...tdS,color:"#64748b"}}>{item.unit}</td>
                      <td style={{...tdS,fontFamily:"'DM Mono',monospace",fontSize:13,color:"#94a3b8"}}>{item.unitPrice?`Rp ${Number(item.unitPrice).toLocaleString("id-ID")}`:"—"}</td>
                      <td style={{...tdS,fontFamily:"'DM Mono',monospace",fontWeight:700,color:low?"#f59e0b":"#e2e8f0"}}>{item.stock||0}</td>
                      <td style={{...tdS,fontFamily:"'DM Mono',monospace",fontSize:13,color:"#64748b"}}>{fmt$((item.stock||0)*(item.unitPrice||0))}</td>
                      <td style={{...tdS}}><div style={{display:"flex",gap:6}}><button onClick={()=>onTx(item,activeBoat)} style={{...btnAccent,fontSize:11,padding:"4px 10px"}}>↕</button><button onClick={()=>onEdit(item,activeBoat)} style={{...btnGhost,fontSize:11,padding:"4px 10px"}}>✏</button></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {salesLog&&salesLog.length>0&&(
        <div style={{marginTop:24}}>
          <SectionLabel>Recent Sales</SectionLabel>
          {salesLog.slice(0,5).map(s=>(
            <div key={s.id} style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:12,padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
              <div><div style={{fontWeight:600,fontSize:13}}>⚓ {s.boat}{s.guestName?" · "+s.guestName:""}</div><div style={{fontSize:12,color:"#475569",marginTop:2}}>{(s.items&&s.items.length)} items · {s.payMethod} · {fmtDate(s.ts)}</div></div>
              <div style={{fontFamily:"'DM Mono',monospace",fontWeight:800,fontSize:16,color:"#34d399"}}>{fmt$(s.total)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── POS VIEW ──
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setMode("inventory")} style={{...btnGhost,fontSize:13,padding:"8px 14px"}}>← Stock</button>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:600}}>🧾 Cashier</div>
          <button onClick={()=>setShowRecipes(true)} style={{...btnGhost,fontSize:12,padding:"6px 12px",color:"#fb923c",borderColor:"#fb923c33"}}>🍹 Recipes</button>
        </div>
        {isAdmin?<div style={{display:"flex",gap:6}}>{BOATS.map(b=>{const c=BOAT_COLORS[b];const sel=posBoat===b;return(<button key={b} onClick={()=>{setPosBoat(b);setCart([]);setActiveBillId(null);}} style={{padding:"7px 14px",borderRadius:9,cursor:"pointer",border:sel?"2px solid "+c.accent:"1px solid #1a2030",background:sel?c.bg:"transparent",color:sel?c.accent:"#64748b",fontWeight:700,fontFamily:"'DM Sans',sans-serif",fontSize:12}}>{b}</button>);})}</div>:<div style={{fontSize:14,fontWeight:700,color:(BOAT_COLORS[posBoat]&&BOAT_COLORS[posBoat].accent)||"#38bdf8"}}>⚓ {posBoat}</div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:16,alignItems:"start"}}>
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{...inputStyle,flex:1}}/>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
            {["All",...BEV_CATEGORIES].map(cat=>{const sel=posCat===cat;const color=CAT_COLORS_BEV[cat]||"#64748b";return(<button key={cat} onClick={()=>setPosCat(cat)} style={{padding:"5px 12px",borderRadius:7,cursor:"pointer",border:"none",fontSize:12,fontWeight:600,fontFamily:"'DM Sans',sans-serif",background:sel?(cat==="All"?"#38bdf8":color):"#1a2030",color:sel?"#080c12":"#64748b"}}>{cat}</button>);})}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
            {filteredPos.map(item=>{
              const inCart=cart.find(c=>c.id===item.id);
              const color=CAT_COLORS_BEV[item.category]||"#94a3b8";
              return(
                <button key={item.id} onClick={()=>addToCart(item)} style={{background:inCart?"#34d39915":"#0c1018",border:inCart?"2px solid #34d399":"1px solid #1a2030",borderRadius:12,padding:"14px 12px",cursor:"pointer",textAlign:"left",position:"relative",fontFamily:"'DM Sans',sans-serif"}}>
                  {inCart&&<span style={{position:"absolute",top:8,right:8,background:"#34d399",color:"#080c12",fontSize:11,fontWeight:800,padding:"1px 7px",borderRadius:20}}>{inCart.qty}</span>}
                  <div style={{fontSize:10,color,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{item.category}</div>
                  <div style={{fontWeight:700,fontSize:13,color:"#e2e8f0",marginBottom:6,lineHeight:1.3}}>{item.name}</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#34d399",fontWeight:600}}>{item.unitPrice?`Rp ${Number(item.unitPrice).toLocaleString("id-ID")}`:"—"}</div>
                  <div style={{fontSize:11,color:"#334155",marginTop:4}}>Stock: {item.stock}</div>
                </button>
              );
            })}
            {!filteredPos.length&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:40,color:"#334155"}}><div style={{fontSize:28,marginBottom:8}}>🍾</div>No in-stock items</div>}
          </div>
        </div>
        <div style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:14,padding:18,position:"sticky",top:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:14,color:"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:150}}>
              {activeBill?<span style={{color:"#a78bfa"}}>📋 {activeBill.guestName||"Unnamed"}</span>:"🛒 Order"}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setBillsOpen(v=>!v)} style={{padding:"5px 10px",borderRadius:7,border:"1px solid #a78bfa44",background:"#a78bfa11",color:"#a78bfa",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",position:"relative"}}>
                📋{(boatBills.filter(b=>b.status==="open").length>0)&&<span style={{position:"absolute",top:-5,right:-5,background:"#f59e0b",color:"#080c12",fontSize:10,fontWeight:800,padding:"0 4px",borderRadius:8}}>{boatBills.filter(b=>b.status==="open").length}</span>}
              </button>
              <button onClick={()=>setBillsOpen(v=>!v)} style={{padding:"5px 10px",borderRadius:7,border:"1px solid #34d39944",background:"#34d39911",color:"#34d399",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>📋 Bills</button>
            </div>
          </div>
          {billsOpen&&(
            <div style={{background:"#080c12",borderRadius:12,padding:14,marginBottom:14,border:"1px solid #1a2030"}}>
              <div style={{fontSize:11,color:"#64748b",fontWeight:700,letterSpacing:"0.08em",marginBottom:12}}>OPEN BILLS — {posBoat} ({boatBills.filter(b=>b.status==="open").length}/5)</div>

              {/* Bill tabs — quick switch */}
              {boatBills.filter(b=>b.status==="open").length>0&&(
                <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
                  {boatBills.filter(b=>b.status==="open").map(bill=>(
                    <button key={bill.id} onClick={()=>{setActiveBillId(bill.id);setBillsOpen(false);}} style={{padding:"6px 12px",borderRadius:8,cursor:"pointer",border:activeBillId===bill.id?"2px solid #a78bfa":"1px solid #1a2030",background:activeBillId===bill.id?"#a78bfa18":"#0c1018",color:activeBillId===bill.id?"#a78bfa":"#64748b",fontWeight:700,fontSize:12,fontFamily:"'DM Sans',sans-serif",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {bill.guestName||"Unnamed"} · {fmt$(bill.total||0)}
                    </button>
                  ))}
                </div>
              )}

              {/* Detailed bill list */}
              <div style={{maxHeight:280,overflowY:"auto",display:"flex",flexDirection:"column",gap:8}}>
                {boatBills.filter(b=>b.status==="open").map(bill=>(
                  <div key={bill.id} style={{background:"#0c1018",borderRadius:10,padding:"12px 14px",border:activeBillId===bill.id?"2px solid #a78bfa":"1px solid #1a2030"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      {editingBillName===bill.id?(
                        <div style={{display:"flex",gap:6,flex:1,marginRight:8}}>
                          <input defaultValue={bill.guestName} id={"bn-"+bill.id} style={{...inputStyle,fontSize:12,flex:1,padding:"5px 10px"}} placeholder="Guest name…" autoFocus/>
                          <button onClick={()=>renameBill(bill.id,document.getElementById("bn-"+bill.id).value)} style={{...btnAccent,fontSize:11,padding:"5px 10px",whiteSpace:"nowrap"}}>Save</button>
                        </div>
                      ):(
                        <div style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
                          <div style={{fontWeight:700,fontSize:14,color:"#e2e8f0"}}>{bill.guestName||"Unnamed Guest"}</div>
                          <button onClick={()=>setEditingBillName(bill.id)} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:12,padding:0}}>✏</button>
                        </div>
                      )}
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:16,fontWeight:800,color:"#a78bfa",flexShrink:0}}>{fmt$(bill.total||0)}</div>
                    </div>
                    <div style={{fontSize:11,color:"#475569",marginBottom:10}}>{bill.entries.length} rounds · opened {fmtDate(bill.createdAt)}</div>

                    {/* Itemized summary */}
                    {(bill.entries.length>0)&&(
                      <div style={{background:"#080c12",borderRadius:8,padding:"8px 10px",marginBottom:10,fontSize:12}}>
                        {bill.entries.flatMap(e=>e.items).reduce((acc,i)=>{const ex=acc.find(a=>a.name===i.name);if(ex){ex.qty+=i.qty;ex.val+=i.qty*i.unitPrice;}else acc.push({name:i.name,qty:i.qty,val:i.qty*i.unitPrice});return acc;},[]).map((item,i)=>(
                          <div key={i} style={{display:"flex",justifyContent:"space-between",color:"#64748b",marginBottom:2}}>
                            <span>{item.name} ×{item.qty}</span>
                            <span style={{fontFamily:"'DM Mono',monospace"}}>{fmt$(item.val)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <button onClick={()=>{setActiveBillId(bill.id);setBillsOpen(false);}} style={{flex:1,padding:"7px 10px",borderRadius:8,border:"1px solid #a78bfa44",background:"#a78bfa11",color:"#a78bfa",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",minWidth:80}}>+ Add Items</button>
                      {PAY_METHODS.map(pm=>(<button key={pm} onClick={()=>closeBill(bill,pm)} style={{padding:"7px 8px",borderRadius:8,border:"1px solid #34d39944",background:"#34d39911",color:"#34d399",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>✓{pm}</button>))}
                    </div>
                  </div>
                ))}
                {boatBills.filter(b=>b.status==="open").length===0&&(
                  <div style={{textAlign:"center",padding:16,color:"#334155",fontSize:13}}><div style={{fontSize:24,marginBottom:6}}>📋</div>No open bills yet</div>
                )}
              </div>

              {/* New bill form */}
              {boatBills.filter(b=>b.status==="open").length<5&&(
                <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #1a2030"}}>
                  <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:8}}>OPEN NEW BILL</div>
                  <div style={{display:"flex",gap:8}}>
                    <input value={newBillName} onChange={e=>setNewBillName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&newBill(newBillName)} placeholder="Guest name (e.g. Table 3, Mr. Smith…)" style={{...inputStyle,flex:1,fontSize:12,padding:"8px 12px"}}/>
                    <button onClick={()=>newBill(newBillName)} style={{...btnPrimary,background:"linear-gradient(135deg,#a78bfacc,#a78bfa)",padding:"8px 16px",fontSize:12,whiteSpace:"nowrap",color:"#080c12"}}>Open</button>
                  </div>
                </div>
              )}
              {boatBills.filter(b=>b.status==="open").length>=5&&(
                <div style={{marginTop:10,fontSize:12,color:"#f59e0b",textAlign:"center"}}>Max 5 open bills — close one to open a new bill</div>
              )}
            </div>
          )}
          <div style={{marginBottom:12}}>
            <Label>{activeBill?"Note (optional)":"Guest name (optional)"}</Label>
            <input value={guestName} onChange={e=>setGuestName(e.target.value)} placeholder={activeBill?"e.g. Day 2…":"e.g. VIP Guest…"} style={inputStyle}/>
          </div>
          {cart.length===0?<div style={{textAlign:"center",padding:"24px 0",color:"#334155",fontSize:13}}><div style={{fontSize:24,marginBottom:6}}>🫙</div>Tap items to add</div>:(
            <div style={{maxHeight:240,overflowY:"auto",marginBottom:14}}>
              {cart.map(item=>(
                <div key={item.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #1a2030"}}>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{item.name}</div><div style={{fontSize:11,color:"#34d399",fontFamily:"'DM Mono',monospace"}}>{fmt$(item.qty*(item.unitPrice||0))}</div></div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <button onClick={()=>chgQty(item.id,-1)} style={{width:26,height:26,borderRadius:6,border:"1px solid #1a2030",background:"#080c12",color:"#f472b6",cursor:"pointer",fontWeight:700,fontSize:14,fontFamily:"'DM Sans',sans-serif"}}>−</button>
                    <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:14,minWidth:20,textAlign:"center"}}>{item.qty}</span>
                    <button onClick={()=>chgQty(item.id,+1)} style={{width:26,height:26,borderRadius:6,border:"1px solid #1a2030",background:"#080c12",color:"#34d399",cursor:"pointer",fontWeight:700,fontSize:14,fontFamily:"'DM Sans',sans-serif"}}>+</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {cart.length>0&&(
            <div style={{background:"#080c12",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",fontWeight:800,fontSize:18}}>
                <span style={{color:"#94a3b8"}}>TOTAL</span>
                <span style={{fontFamily:"'DM Mono',monospace",color:"#34d399"}}>{fmt$(cartTotal)}</span>
              </div>
            </div>
          )}
          {!activeBill&&(
            <div style={{marginBottom:12}}>
              <Label>Payment</Label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {PAY_METHODS.map(m=>(<button key={m} onClick={()=>setPayMethod(m)} style={{padding:"8px",borderRadius:8,cursor:"pointer",border:payMethod===m?"2px solid #38bdf8":"1px solid #1a2030",background:payMethod===m?"#38bdf811":"#080c12",color:payMethod===m?"#38bdf8":"#64748b",fontWeight:600,fontSize:12,fontFamily:"'DM Sans',sans-serif"}}>{m}</button>))}
              </div>
            </div>
          )}
          {activeBill?(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button onClick={addToBill} disabled={!cart.length} style={{...btnPrimary,width:"100%",padding:"13px",background:cart.length?"linear-gradient(135deg,#a78bfacc,#a78bfa)":"#1a2030",color:cart.length?"#080c12":"#334155",cursor:cart.length?"pointer":"not-allowed"}}>
                {cart.length?"+ Add to Bill ("+fmt$(cartTotal)+")":"Select items to add"}
              </button>
              <div style={{display:"flex",gap:6}}>{PAY_METHODS.map(pm=>(<button key={pm} onClick={()=>closeBill(activeBill,pm)} style={{flex:1,padding:"8px 4px",borderRadius:9,border:"1px solid #34d39944",background:"#34d39911",color:"#34d399",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>✓{pm}</button>))}</div>
              <button onClick={()=>setActiveBillId(null)} style={{...btnGhost,width:"100%",fontSize:12}}>Exit Bill Mode</button>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button onClick={recordSale} disabled={!cart.length} style={{...btnPrimary,width:"100%",padding:"14px",fontSize:15,background:cart.length?"linear-gradient(135deg,#34d399cc,#34d399)":"#1a2030",color:cart.length?"#080c12":"#334155",cursor:cart.length?"pointer":"not-allowed"}}>{cart.length?"✓ Charge "+fmt$(cartTotal):"Select items"}</button>
              {(cart.length>0)&&<button onClick={clearCart} style={{...btnGhost,width:"100%",fontSize:12,color:"#f87171",borderColor:"#f8717133"}}>Clear</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PURCHASE ORDERS SECTION ──────────────────────────────────────────────────
const PO_STATUS = {
  pending: {label:"Pending Approval",color:"#f59e0b",bg:"#f59e0b18",icon:"◎"},
  approved:{label:"Approved",         color:"#34d399",bg:"#34d39918",icon:"✓"},
  partial: {label:"Partial Approved", color:"#38bdf8",bg:"#38bdf818",icon:"◑"},
  buying:  {label:"Buy Process",      color:"#a78bfa",bg:"#a78bfa18",icon:"🛒"},
  shipped: {label:"In Transit",       color:"#fb923c",bg:"#fb923c18",icon:"🚚"},
  received:{label:"Received",         color:"#22c55e",bg:"#22c55e18",icon:"📦"},
  rejected:{label:"Rejected",         color:"#f87171",bg:"#f8717118",icon:"✕"},
};
const SHIP_METHODS = ["Kapal Cargo","Travel Darat","Pesawat","Kurir","Lainnya"];
const PURCHASE_LOCATIONS = ["Bali","Lokal"];
const LOC_COLOR = {"Bali":"#38bdf8","Lokal":"#06b6d4"};
const LOC_LABEL = {"Bali":"📍 Bali","Lokal":"📍 Lokal Labuan Bajo"};

function POSection({pos,suppliers,onNew,onReview,onBuy,onShip,onReceive,onAddSupplier,onEditSupplier,onDeleteSupplier}){
  const [filter,setFilter]=useState("all");
  const filtered=pos.filter(p=>filter==="all"||p.status===filter);
  const pendingTotal=pos.filter(p=>p.status==="pending").reduce((s,po)=>s+po.items.reduce((a,i)=>a+Number(i.qty||0)*Number(i.unitPrice||0),0),0);
  const inTransitPOs=pos.filter(p=>p.status==="shipped");
  return(
    <div>
      <PageHeader title="Purchase Orders" subtitle="Create, track and approve purchasing requests"/>
      {(pendingTotal>0)&&<div style={{background:"#f59e0b10",border:"1px solid #f59e0b33",borderRadius:10,padding:"12px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:13,color:"#94a3b8"}}>Pending spend awaiting approval</span><span style={{fontFamily:"'DM Mono',monospace",fontWeight:800,fontSize:18,color:"#f59e0b"}}>{fmt$(pendingTotal)}</span></div>}
      {(inTransitPOs.length>0)&&<div style={{background:"#fb923c10",border:"1px solid #fb923c33",borderRadius:10,padding:"12px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:13,color:"#94a3b8"}}>🚚 Shipments currently in transit to Gudang</span><span style={{fontFamily:"'DM Mono',monospace",fontWeight:800,fontSize:18,color:"#fb923c"}}>{inTransitPOs.length} PO{inTransitPOs.length!==1?"s":""}</span></div>}
      <div style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:12,padding:"14px 18px",marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:700,color:"#475569",letterSpacing:"0.1em"}}>🏪 SUPPLIERS</div>
          <button onClick={onAddSupplier} style={{...btnAccent,fontSize:12,padding:"5px 12px"}}>+ Add Supplier</button>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {(suppliers||[]).map(s=>(
            <div key={s} style={{display:"flex",alignItems:"center",gap:4,background:"#1a2030",borderRadius:8,padding:"5px 10px 5px 12px",fontSize:13}}>
              <span style={{color:"#94a3b8"}}>{s}</span>
              <button onClick={()=>onEditSupplier(s)} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:13,padding:"0 2px"}}>✏</button>
              <button onClick={()=>onDeleteSupplier(s)} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:13,padding:"0 2px"}}>✕</button>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {["all","pending","approved","partial","buying","shipped","received","rejected"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{...f===filter?btnPrimary:btnGhost,padding:"7px 16px",fontSize:12,textTransform:"capitalize"}}>
              {f==="all"?"All ("+pos.length+")":((PO_STATUS[f]&&PO_STATUS[f].label)||f)+" ("+pos.filter(p=>p.status===f).length+")"}
            </button>
          ))}
        </div>
        <button onClick={onNew} style={{...btnPrimary,background:"linear-gradient(135deg,#a78bfacc,#a78bfa)"}}>+ New PO</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {filtered.map(po=>{
          const st=PO_STATUS[po.status]||PO_STATUS.pending;
          const total=po.items.reduce((s,i)=>s+Number(i.qty||0)*Number(i.unitPrice||0),0);
          const supplierNames=[...new Set(po.items.map(i=>i.supplier||po.supplier).filter(Boolean))];
          return(
            <div key={po.id} style={{background:"#0c1018",border:"1px solid "+((PO_STATUS[po.status]||PO_STATUS.pending).color)+"33",borderRadius:14,padding:"20px 22px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                    <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:16}}>{po.poNumber}</span>
                    <span style={{background:st.bg,color:st.color,fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700}}>{st.icon} {st.label}</span>
                    <span style={{background:po.type==="food"?"#38bdf811":"#a78bfa11",color:po.type==="food"?"#38bdf8":"#a78bfa",fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:600}}>{po.type==="food"?"🧺 Food":"🍾 Beverages"}</span>
                    <span style={{background:(LOC_COLOR[po.poLocation||"Bali"])+"18",color:LOC_COLOR[po.poLocation||"Bali"],fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:600}}>{LOC_LABEL[po.poLocation||"Bali"]}</span>
                    {po.hasDiscrepancy&&<span style={{background:"#f59e0b18",color:"#f59e0b",fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700}}>⚠ Discrepancy</span>}
                    {po.priceVariance&&<span style={{background:"#f59e0b18",color:"#f59e0b",fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700}}>💰 Price Variance</span>}
                  </div>
                  <div style={{fontSize:14,fontWeight:600,color:"#e2e8f0",marginBottom:4}}>🏪 {supplierNames.join(" · ")||po.supplier||"—"}</div>
                  <div style={{fontSize:13,color:"#94a3b8",marginBottom:4}}>By: {po.requestedBy} · Vessel: {po.vessel}</div>
                  {po.linkedPoNumber&&<div style={{fontSize:12,color:"#64748b",marginBottom:4}}>🔗 Linked to <strong style={{color:"#94a3b8"}}>{po.linkedPoNumber}</strong> (split from same request)</div>}
                  <div style={{fontSize:12,color:"#475569",display:"flex",gap:12,flexWrap:"wrap"}}>
                    <span>📅 {fmtDate(po.date)}</span>
                    {po.deliveryDate&&<span>🚚 {fmtDate(po.deliveryDate)}</span>}
                    {po.notes&&<span style={{fontStyle:"italic"}}>{po.notes}</span>}
                  </div>
                  {(po.status==="approved"||po.status==="partial")&&<div style={{marginTop:8,fontSize:12,color:"#34d399"}}>✓ {po.status==="partial"?"Partially approved":"Approved"} {fmtDate(po.approvedAt)}{po.status==="partial"&&po.itemDecisions&&<span style={{color:"#f87171"}}> · Rejected: {po.items.filter(i=>po.itemDecisions[i.id]==="rejected").map(i=>i.name).join(", ")}</span>}</div>}
                  {po.status==="buying"&&<div style={{marginTop:8,fontSize:12,color:"#a78bfa"}}>🛒 Purchased {fmtDate(po.buyDate)} by {po.buyBy||"—"}{po.buyNote?" · "+po.buyNote:""}</div>}
                  {po.status==="shipped"&&<div style={{marginTop:8,fontSize:12,color:"#fb923c"}}>🚚 Shipped {fmtDate(po.shippedAt)} via {po.shippingMethod||"—"} · {Math.max(0,Math.floor((Date.now()-new Date(po.shippedAt).getTime())/86400000))} day(s) in transit{po.shippingNote?" · "+po.shippingNote:""}</div>}
                  {po.status==="received"&&<div style={{marginTop:8,fontSize:12,color:po.hasDiscrepancy?"#f59e0b":"#22c55e"}}>{po.hasDiscrepancy?"⚠ Received with discrepancy":"✓ Received in full"} — {fmtDate(po.receivedAt)} by {po.receivedBy||"—"}</div>}
                  {po.status==="rejected"&&po.rejectionReason&&<div style={{marginTop:8,background:"#f8717118",border:"1px solid #f8717133",borderRadius:8,padding:"8px 12px",fontSize:13,color:"#f87171"}}>✕ {po.rejectionReason}</div>}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:700,color:po.status==="pending"?"#f59e0b":"#e2e8f0"}}>{fmt$(total)}</div>
                  <div style={{fontSize:12,color:"#475569",marginBottom:10}}>{po.items.length} item{po.items.length!==1?"s":""}</div>
                  {po.status==="pending"&&<button onClick={()=>onReview(po)} style={{...btnPrimary,background:"linear-gradient(135deg,#a78bfacc,#a78bfa)",fontSize:13,padding:"9px 18px",display:"block",marginBottom:8}}>Review & Decide →</button>}
                  {(po.status==="approved"||po.status==="partial")&&<button onClick={()=>onBuy(po)} style={{...btnPrimary,background:"linear-gradient(135deg,#a78bfacc,#a78bfa)",fontSize:13,padding:"9px 18px",display:"block",marginBottom:8}}>🛒 Confirm Purchase</button>}
                  {po.status==="buying"&&(po.poLocation!=="Lokal")&&<button onClick={()=>onShip(po)} style={{...btnPrimary,background:"linear-gradient(135deg,#fb923ccc,#fb923c)",fontSize:13,padding:"9px 18px",display:"block",marginBottom:8}}>🚚 Mark as Shipped</button>}
                  {po.status==="buying"&&(po.poLocation==="Lokal")&&<button onClick={()=>onReceive(po)} style={{...btnPrimary,background:"linear-gradient(135deg,#22c55ecc,#22c55e)",fontSize:13,padding:"9px 18px",display:"block",marginBottom:8}}>📦 Confirm Receipt</button>}
                  {po.status==="shipped"&&<button onClick={()=>onReceive(po)} style={{...btnPrimary,background:"linear-gradient(135deg,#22c55ecc,#22c55e)",fontSize:13,padding:"9px 18px",display:"block",marginBottom:8}}>📦 Confirm Receipt</button>}
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>generatePOPdf(po)} style={{...btnGhost,fontSize:11,padding:"5px 10px"}}>⬇ PDF</button>
                    <button onClick={()=>sendPOEmail(po)} style={{...btnGhost,fontSize:11,padding:"5px 10px"}}>✉ Email</button>
                  </div>
                </div>
              </div>
              <div style={{borderTop:"1px solid #1a2030",paddingTop:12,marginTop:12}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr>{["Item","Category","Supplier","Qty","Unit Price","Subtotal"].map(h=><th key={h} style={{...thS,padding:"6px 10px"}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {po.items.map(item=>{
                      const isRej=po.itemDecisions&&po.itemDecisions[item.id]==="rejected";
                      return(
                        <tr key={item.id} style={{borderTop:"1px solid #0f1117",opacity:isRej?0.5:1}}>
                          <td style={{...tdS,padding:"7px 10px",fontWeight:600,textDecoration:isRej?"line-through":"none"}}>{item.name}</td>
                          <td style={{...tdS,padding:"7px 10px"}}><CategoryBadge>{item.category}</CategoryBadge></td>
                          <td style={{...tdS,padding:"7px 10px",fontSize:13,color:"#94a3b8"}}>{item.supplier||po.supplier||"—"}</td>
                          <td style={{...tdS,padding:"7px 10px",fontFamily:"'DM Mono',monospace",fontSize:13}}>{item.qty} {item.unit}</td>
                          <td style={{...tdS,padding:"7px 10px",fontFamily:"'DM Mono',monospace",fontSize:13,color:"#64748b"}}>Rp {Number(item.unitPrice).toLocaleString("id-ID")}</td>
                          <td style={{...tdS,padding:"7px 10px",fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:700,color:"#38bdf8"}}>{fmt$(Number(item.qty)*Number(item.unitPrice))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {!filtered.length&&<div style={{textAlign:"center",padding:60,color:"#334155",background:"#0c1018",borderRadius:14,border:"1px solid #1a2030"}}><div style={{fontSize:36,marginBottom:12}}>⊡</div>No purchase orders</div>}
      </div>
    </div>
  );
}

// ─── PO NEW MODAL ─────────────────────────────────────────────────────────────
function PONewModal({form,setForm,boxes,bevItems,suppliers,onQuickAddSupplier,onCancel,onSubmit}){
  const [newRow,setNewRow]=useState({name:"",category:"",unit:"",qty:"",unitPrice:"",supplier:"",location:"Bali"});
  const [addingSupplier,setAddingSupplier]=useState(false);
  const [newSupplierName,setNewSupplierName]=useState("");
  const poType=form.poType||"food";
  const cats=poType==="food"?FOOD_CATS.filter(c=>c.id!=="sparepart").map(c=>c.label):BEV_CATEGORIES;
  const existing=poType==="food"?boxes.flatMap(b=>b.items.map(i=>({...i,catLabel:getCat(b.categoryId).label}))):((bevItems[form.vessel]||[]));
  const total=(form.poItems||[]).reduce((s,i)=>s+Number(i.qty||0)*Number(i.unitPrice||0),0);
  const addRow=()=>{
    if(!newRow.name||!newRow.qty||!newRow.unitPrice){return;}
    if(!newRow.supplier){alert("Please select a supplier for this item.");return;}
    setForm(p=>({...p,poItems:[...(p.poItems||[]),{...newRow,id:"r"+Date.now()}]}));
    setNewRow({name:"",category:"",unit:"",qty:"",unitPrice:"",supplier:"",location:newRow.location});
  };
  const rmRow=id=>setForm(p=>({...p,poItems:p.poItems.filter(i=>i.id!==id)}));
  return(
    <div onClick={e=>e.stopPropagation()} style={{background:"#0c1018",borderRadius:16,border:"1px solid #1a2030",padding:28,width:"100%",maxWidth:700,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,.7)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
        <h3 style={{margin:0,fontSize:17,fontWeight:700}}>⊡ New Purchase Order</h3>
        <button onClick={onCancel} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18}}>✕</button>
      </div>
      <div style={{marginBottom:16}}><Label>Order Type</Label><TogglePair options={[{value:"food",label:"🧺 Food Storage"},{value:"beverages",label:"🍾 Beverages"}]} value={poType} onChange={v=>setForm(p=>({...p,poType:v,poItems:[]}))} activeColor={poType==="food"?"#38bdf8":"#a78bfa"}/></div>
      {poType==="beverages"&&<div style={{marginBottom:16}}><Label>Vessel *</Label><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>{BOATS.map(b=>{const c=BOAT_COLORS[b];const sel=form.vessel===b;return(<button key={b} onClick={()=>setForm(p=>({...p,vessel:b,poItems:[]}))} style={{padding:"9px 6px",borderRadius:8,cursor:"pointer",border:sel?"2px solid "+c.accent:"1px solid #1a2030",background:sel?c.bg:"#080c12",color:sel?c.accent:"#475569",fontWeight:600,fontFamily:"'DM Sans',sans-serif",fontSize:12}}>{b}</button>);})}</div></div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        <div><Label>PO Date *</Label><input type="date" value={form.poDate||""} onChange={e=>setForm(p=>({...p,poDate:e.target.value}))} style={inputStyle}/></div>
        <div><Label>Expected Delivery</Label><input type="date" value={form.deliveryDate||""} onChange={e=>setForm(p=>({...p,deliveryDate:e.target.value}))} style={inputStyle}/></div>
      </div>
      <div style={{marginBottom:14}}><Label>Requested By *</Label><input value={form.requestedBy||""} onChange={e=>setForm(p=>({...p,requestedBy:e.target.value}))} placeholder="Your name / role…" style={inputStyle}/></div>
      <div style={{marginBottom:20}}><Label>Notes</Label><input value={form.notes||""} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="e.g. Charter preparation…" style={inputStyle}/></div>
      {(form.poItems||[]).length>0&&(
        <div style={{background:"#080c12",borderRadius:10,border:"1px solid #1a2030",marginBottom:14,overflow:"hidden"}}>
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:"#0c1018",borderBottom:"1px solid #1a2030"}}>
            <span style={{fontSize:11,fontWeight:700,color:"#475569",letterSpacing:"0.08em"}}>ORDER ITEMS</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:700,color:"#38bdf8"}}>Total: {fmt$(total)}</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{["Item","📍","Supplier","Qty","Unit Price","Subtotal",""].map(h=><th key={h} style={{...thS,padding:"8px 12px"}}>{h}</th>)}</tr></thead>
            <tbody>
              {(form.poItems||[]).map(item=>(
                <tr key={item.id} style={{borderTop:"1px solid #1a2030"}}>
                  <td style={{...tdS,padding:"9px 12px",fontSize:13}}><div style={{fontWeight:600}}>{item.name}</div><div style={{fontSize:11,color:"#475569"}}>{item.category}</div></td>
                  <td style={{...tdS,padding:"9px 12px"}}><span style={{background:(LOC_COLOR[item.location||"Bali"])+"18",color:LOC_COLOR[item.location||"Bali"],fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,whiteSpace:"nowrap"}}>{item.location==="Lokal"?"Lokal":"Bali"}</span></td>
                  <td style={{...tdS,padding:"9px 12px",fontSize:13,color:"#94a3b8"}}>{item.supplier}</td>
                  <td style={{...tdS,padding:"9px 12px",fontFamily:"'DM Mono',monospace",fontSize:13}}>{item.qty} {item.unit}</td>
                  <td style={{...tdS,padding:"9px 12px",fontFamily:"'DM Mono',monospace",fontSize:13,color:"#64748b"}}>Rp {Number(item.unitPrice).toLocaleString("id-ID")}</td>
                  <td style={{...tdS,padding:"9px 12px",fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:700,color:"#38bdf8"}}>{fmt$(Number(item.qty)*Number(item.unitPrice))}</td>
                  <td style={{...tdS,padding:"9px 12px"}}><button onClick={()=>rmRow(item.id)} style={{background:"#f8717118",color:"#f87171",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,fontWeight:700}}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{background:"#080c12",border:"1px dashed #2a3040",borderRadius:10,padding:16,marginBottom:20}}>
        <div style={{fontSize:11,color:"#475569",marginBottom:10,fontWeight:700,letterSpacing:"0.1em"}}>+ ADD LINE ITEM</div>
        <div style={{marginBottom:10}}>
          <Label>📍 Purchase Location *</Label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {PURCHASE_LOCATIONS.map(loc=>{
              const sel=newRow.location===loc;
              const c=LOC_COLOR[loc];
              return(<button key={loc} onClick={()=>setNewRow(p=>({...p,location:loc}))} style={{padding:"9px 6px",borderRadius:8,cursor:"pointer",border:sel?"2px solid "+c:"1px solid #1a2030",background:sel?c+"18":"#0c1018",color:sel?c:"#475569",fontWeight:600,fontFamily:"'DM Sans',sans-serif",fontSize:12}}>{LOC_LABEL[loc]}</button>);
            })}
          </div>
          <div style={{fontSize:11,color:"#475569",marginTop:5}}>{newRow.location==="Lokal"?"Bought & delivered same day in Labuan Bajo":"Purchased in Bali, requires shipping to Gudang"}</div>
        </div>
        {(existing.length>0)&&<div style={{marginBottom:10}}><Label>Quick-fill from inventory (optional)</Label><select onChange={e=>{const id=e.target.value;if(!id)return;const it=existing.find(i=>i.id===id);if(it)setNewRow(p=>({...p,name:it.name,unit:it.unit,category:it.catLabel||it.category||"",unitPrice:it.unitPrice||""}));}} value="" style={{...inputStyle,fontSize:12}}><option value="">Select existing item…</option>{existing.map(i=><option key={i.id} value={i.id}>{i.name} · stock:{i.stock} {i.unit}</option>)}</select></div>}
        <div style={{fontSize:11,color:"#475569",marginBottom:12,fontStyle:"italic"}}>💡 New items don't need to exist in inventory yet — they're added automatically once goods are received.</div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,marginBottom:8}}>
          <div><Label>Item Name *</Label><input value={newRow.name} onChange={e=>setNewRow(p=>({...p,name:e.target.value}))} placeholder="Type any item — new or existing…" style={inputStyle}/></div>
          <div><Label>Quantity *</Label><input type="number" min="1" value={newRow.qty} onChange={e=>setNewRow(p=>({...p,qty:e.target.value}))} placeholder="0" style={inputStyle}/></div>
          <div><Label>Unit Price (Rp) *</Label><input type="number" min="0" value={newRow.unitPrice} onChange={e=>setNewRow(p=>({...p,unitPrice:e.target.value}))} placeholder="0" style={inputStyle}/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          <div>
            <Label>Supplier *</Label>
            <select value={newRow.supplier||""} onChange={e=>{
              if(e.target.value==="__new__"){setAddingSupplier(true);return;}
              setNewRow(p=>({...p,supplier:e.target.value}));setAddingSupplier(false);
            }} style={{...inputStyle,borderColor:!newRow.supplier?"#f59e0b33":"#1a2030"}}>
              <option value="">— Select Supplier —</option>
              {(suppliers||SEED_SUPPLIERS).map(s=><option key={s}>{s}</option>)}
              <option value="__new__">+ Add New Supplier…</option>
            </select>
            {addingSupplier&&(
              <div style={{display:"flex",gap:6,marginTop:8}}>
                <input value={newSupplierName} onChange={e=>setNewSupplierName(e.target.value)} placeholder="New supplier name…" autoFocus style={{...inputStyle,flex:1,fontSize:13}}/>
                <button onClick={()=>{
                  const trimmed=newSupplierName.trim();
                  if(!trimmed)return;
                  onQuickAddSupplier(trimmed);
                  setNewRow(p=>({...p,supplier:trimmed}));
                  setNewSupplierName("");setAddingSupplier(false);
                }} style={{...btnAccent,padding:"9px 14px",fontSize:12,whiteSpace:"nowrap"}}>+ Add</button>
                <button onClick={()=>{setAddingSupplier(false);setNewSupplierName("");}} style={{...btnGhost,padding:"9px 10px",fontSize:12}}>✕</button>
              </div>
            )}
          </div>
          <div><Label>Category</Label><select value={newRow.category||cats[0]} onChange={e=>setNewRow(p=>({...p,category:e.target.value}))} style={inputStyle}>{cats.map(c=><option key={c}>{c}</option>)}</select></div>
        </div>
        <div style={{marginBottom:12}}><Label>Unit</Label><input value={newRow.unit} onChange={e=>setNewRow(p=>({...p,unit:e.target.value}))} placeholder="Kg, Btl, Can…" style={inputStyle}/></div>
        <button onClick={addRow} style={{...btnPrimary,width:"100%",padding:"10px",fontSize:13}}>Add to Order</button>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onCancel} style={{...btnGhost,padding:"11px 20px"}}>Cancel</button>
        <button onClick={onSubmit} style={{...btnPrimary,flex:1,background:"linear-gradient(135deg,#a78bfacc,#a78bfa)",color:"#080c12"}}>Submit for Approval →</button>
      </div>
    </div>
  );
}

// ─── PO REVIEW MODAL ──────────────────────────────────────────────────────────
function POBuyModal({po,onCancel,onConfirm}){
  const approvedItems=po.items.filter(i=>!(po.itemDecisions&&po.itemDecisions[i.id]==="rejected"));
  const [prices,setPrices]=useState(()=>{
    const init={};
    approvedItems.forEach(i=>{init[i.id]=String(i.unitPrice);});
    return init;
  });
  const [buyDate,setBuyDate]=useState(today());
  const [buyBy,setBuyBy]=useState("");
  const [note,setNote]=useState("");

  const setPrice=(id,val)=>setPrices(p=>({...p,[id]:val}));
  const hasVariance=approvedItems.some(i=>Number(prices[i.id])!==Number(i.unitPrice));

  const confirm=()=>{
    if(!buyBy.trim()){alert("Please enter who made the purchase.");return;}
    const actualPrices={};
    approvedItems.forEach(i=>{actualPrices[i.id]=Number(prices[i.id])||i.unitPrice;});
    onConfirm(actualPrices,buyDate,buyBy,note);
  };

  return(
    <div onClick={e=>e.stopPropagation()} style={{background:"#0c1018",borderRadius:16,border:"1px solid #1a2030",padding:28,width:"100%",maxWidth:600,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,.7)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <h3 style={{margin:0,fontSize:17,fontWeight:700}}>🛒 Confirm Purchase — {po.poNumber}</h3>
        <button onClick={onCancel} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18}}>✕</button>
      </div>
      <div style={{background:"#a78bfa10",border:"1px solid #a78bfa33",borderRadius:10,padding:"12px 16px",marginBottom:18,fontSize:13,color:"#94a3b8"}}>
        Record the actual purchase in Bali. Prices can be adjusted below if they differ from the original budget.
      </div>

      <div style={{background:"#080c12",borderRadius:10,border:"1px solid #1a2030",marginBottom:16,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:"#0c1018"}}>{["Item","Qty","Budgeted Price","Actual Price"].map(h=><th key={h} style={{...thS,padding:"9px 12px"}}>{h}</th>)}</tr></thead>
          <tbody>
            {approvedItems.map(item=>{
              const variance=Number(prices[item.id])!==Number(item.unitPrice);
              return(
                <tr key={item.id} style={{borderTop:"1px solid #1a2030",background:variance?"#f59e0b08":"transparent"}}>
                  <td style={{...tdS,padding:"10px 12px",fontWeight:600,fontSize:13}}>{item.name}</td>
                  <td style={{...tdS,padding:"10px 12px",fontFamily:"'DM Mono',monospace",fontSize:13,color:"#94a3b8"}}>{item.qty} {item.unit}</td>
                  <td style={{...tdS,padding:"10px 12px",fontFamily:"'DM Mono',monospace",fontSize:13,color:"#64748b"}}>Rp {Number(item.unitPrice).toLocaleString("id-ID")}</td>
                  <td style={{...tdS,padding:"10px 12px"}}>
                    <input type="number" min="0" value={prices[item.id]} onChange={e=>setPrice(item.id,e.target.value)} style={{width:130,padding:"6px 10px",borderRadius:7,border:variance?"1px solid #f59e0b66":"1px solid #1a2030",background:"#0c1018",color:variance?"#f59e0b":"#e2e8f0",fontFamily:"'DM Mono',monospace",fontSize:13}}/>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasVariance&&<div style={{background:"#f59e0b10",border:"1px solid #f59e0b33",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#f59e0b"}}>💰 Actual price differs from budget for one or more items.</div>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div><Label>Purchase Date *</Label><input type="date" value={buyDate} onChange={e=>setBuyDate(e.target.value)} style={inputStyle}/></div>
        <div><Label>Purchased By *</Label><input value={buyBy} onChange={e=>setBuyBy(e.target.value)} placeholder="Nama staff Bali..." style={inputStyle}/></div>
      </div>
      <div style={{marginBottom:20}}>
        <Label>Notes (optional)</Label>
        <input value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. No. struk, nama toko..." style={inputStyle}/>
      </div>

      <div style={{display:"flex",gap:10}}>
        <button onClick={onCancel} style={{...btnGhost,padding:"12px 20px"}}>Cancel</button>
        <button onClick={confirm} style={{flex:1,padding:"13px",borderRadius:10,cursor:"pointer",border:"none",fontWeight:700,fontSize:14,fontFamily:"'DM Sans',sans-serif",background:"linear-gradient(135deg,#a78bfacc,#a78bfa)",color:"#080c12"}}>
          ✓ Confirm Purchase
        </button>
      </div>
    </div>
  );
}

function POShipModal({po,onCancel,onConfirm}){
  const [shipDate,setShipDate]=useState(today());
  const [method,setMethod]=useState(SHIP_METHODS[0]);
  const [note,setNote]=useState("");
  return(
    <ModalShell title={"🚚 Mark as Shipped — "+po.poNumber} onClose={onCancel}>
      <div style={{background:"#fb923c10",border:"1px solid #fb923c33",borderRadius:10,padding:"12px 16px",marginBottom:18,fontSize:13,color:"#94a3b8"}}>
        Goods are leaving Bali for <strong style={{color:"#e2e8f0"}}>{po.vessel}</strong>. This moves the PO to "In Transit".
      </div>
      <div style={{marginBottom:14}}>
        <Label>Ship Date *</Label>
        <input type="date" value={shipDate} onChange={e=>setShipDate(e.target.value)} style={inputStyle}/>
      </div>
      <div style={{marginBottom:14}}>
        <Label>Shipping Method</Label>
        <select value={method} onChange={e=>setMethod(e.target.value)} style={inputStyle}>
          {SHIP_METHODS.map(m=><option key={m}>{m}</option>)}
        </select>
      </div>
      <div style={{marginBottom:20}}>
        <Label>Notes (optional)</Label>
        <input value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. No. AWB, nama supir, nama kapal..." style={inputStyle}/>
      </div>
      <ModalActions onCancel={onCancel} onConfirm={()=>onConfirm(shipDate,method,note)} label="Confirm Shipped" color="#fb923c"/>
    </ModalShell>
  );
}

function POReceiveModal({po,onClose,onConfirm}){
  const approvedItems=po.items.filter(i=>!(po.itemDecisions&&po.itemDecisions[i.id]==="rejected"));
  const [qtys,setQtys]=useState(()=>{
    const init={};
    approvedItems.forEach(i=>{init[i.id]=String(i.qty);});
    return init;
  });
  const [notes,setNotes]=useState({});
  const [receivedAt,setReceivedAt]=useState(today());
  const [receivedBy,setReceivedBy]=useState("");
  const [overallNote,setOverallNote]=useState("");

  const setQty=(id,val)=>setQtys(p=>({...p,[id]:val}));
  const setItemNote=(id,val)=>setNotes(p=>({...p,[id]:val}));
  const hasAnyDiscrepancy=approvedItems.some(i=>Number(qtys[i.id])!==Number(i.qty));

  const confirm=()=>{
    if(!receivedBy.trim()){alert("Please enter who received the goods.");return;}
    const itemReceived={};
    approvedItems.forEach(i=>{
      itemReceived[i.id]={qty:Number(qtys[i.id])||0,name:i.name,note:notes[i.id]||""};
    });
    onConfirm(itemReceived,receivedAt,receivedBy,overallNote);
  };

  return(
    <div onClick={e=>e.stopPropagation()} style={{background:"#0c1018",borderRadius:16,border:"1px solid #1a2030",padding:28,width:"100%",maxWidth:640,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,.7)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <h3 style={{margin:0,fontSize:17,fontWeight:700}}>📦 Confirm Receipt — {po.poNumber}</h3>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18}}>✕</button>
      </div>
      <div style={{fontSize:13,color:"#64748b",marginBottom:18}}>
        Destination: <strong style={{color:"#e2e8f0"}}>{po.vessel}</strong> · Shipped {fmtDate(po.shippedAt)} via {po.shippingMethod||"—"}
      </div>

      <div style={{background:"#080c12",borderRadius:10,border:"1px solid #1a2030",marginBottom:16,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:"#0c1018"}}>{["Item","Ordered","Qty Received","Note"].map(h=><th key={h} style={{...thS,padding:"9px 12px"}}>{h}</th>)}</tr></thead>
          <tbody>
            {approvedItems.map(item=>{
              const mismatch=Number(qtys[item.id])!==Number(item.qty);
              return(
                <tr key={item.id} style={{borderTop:"1px solid #1a2030",background:mismatch?"#f59e0b08":"transparent"}}>
                  <td style={{...tdS,padding:"10px 12px",fontWeight:600,fontSize:13}}>{item.name}</td>
                  <td style={{...tdS,padding:"10px 12px",fontFamily:"'DM Mono',monospace",fontSize:13,color:"#94a3b8"}}>{item.qty} {item.unit}</td>
                  <td style={{...tdS,padding:"10px 12px"}}>
                    <input type="number" min="0" value={qtys[item.id]} onChange={e=>setQty(item.id,e.target.value)} style={{width:80,padding:"6px 10px",borderRadius:7,border:mismatch?"1px solid #f59e0b66":"1px solid #1a2030",background:"#0c1018",color:mismatch?"#f59e0b":"#e2e8f0",fontFamily:"'DM Mono',monospace",fontSize:13}}/>
                  </td>
                  <td style={{...tdS,padding:"10px 12px"}}>
                    {mismatch?<input value={notes[item.id]||""} onChange={e=>setItemNote(item.id,e.target.value)} placeholder="kurang / rusak..." style={{width:"100%",padding:"6px 10px",borderRadius:7,border:"1px solid #1a2030",background:"#0c1018",color:"#e2e8f0",fontSize:12,boxSizing:"border-box"}}/>:<span style={{color:"#334155",fontSize:12}}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasAnyDiscrepancy&&<div style={{background:"#f59e0b10",border:"1px solid #f59e0b33",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#f59e0b"}}>⚠ Some quantities don't match what was ordered — add a note above for each one.</div>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div><Label>Receive Date *</Label><input type="date" value={receivedAt} onChange={e=>setReceivedAt(e.target.value)} style={inputStyle}/></div>
        <div><Label>Received By *</Label><input value={receivedBy} onChange={e=>setReceivedBy(e.target.value)} placeholder="Nama staff gudang..." style={inputStyle}/></div>
      </div>
      <div style={{marginBottom:20}}>
        <Label>Notes (optional)</Label>
        <input value={overallNote} onChange={e=>setOverallNote(e.target.value)} placeholder="Catatan tambahan..." style={inputStyle}/>
      </div>

      <div style={{display:"flex",gap:10}}>
        <button onClick={onClose} style={{...btnGhost,padding:"12px 20px"}}>Cancel</button>
        <button onClick={confirm} style={{flex:1,padding:"13px",borderRadius:10,cursor:"pointer",border:"none",fontWeight:700,fontSize:14,fontFamily:"'DM Sans',sans-serif",background:hasAnyDiscrepancy?"linear-gradient(135deg,#f59e0bcc,#f59e0b)":"linear-gradient(135deg,#22c55ecc,#22c55e)",color:"#080c12"}}>
          {hasAnyDiscrepancy?"⚠ Confirm Receipt (with discrepancy)":"✓ Confirm Receipt — Add to Stock"}
        </button>
      </div>
    </div>
  );
}

function POReviewModal({po,onClose,onApprove,onReject}){
  const [decisions,setDecisions]=useState(()=>Object.fromEntries(po.items.map(i=>[i.id,"approved"])));
  const [rejReasons,setRejReasons]=useState({});
  const [globalNote,setGlobalNote]=useState("");
  const st=PO_STATUS[po.status]||PO_STATUS.pending;
  const approved=po.items.filter(i=>decisions[i.id]==="approved");
  const rejected=po.items.filter(i=>decisions[i.id]==="rejected");
  const approvedTotal=approved.reduce((s,i)=>s+Number(i.qty||0)*Number(i.unitPrice||0),0);
  const rejectedTotal=rejected.reduce((s,i)=>s+Number(i.qty||0)*Number(i.unitPrice||0),0);
  const toggle=id=>setDecisions(p=>({...p,[id]:p[id]==="approved"?"rejected":"approved"}));
  const confirm=()=>{if(!approved.length){onReject(globalNote||"All items rejected.");}else{onApprove(decisions,rejReasons,globalNote);}};
  return(
    <div onClick={e=>e.stopPropagation()} style={{background:"#0c1018",borderRadius:16,border:"1px solid #1a2030",padding:28,width:"100%",maxWidth:620,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,.7)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <h3 style={{margin:0,fontSize:17,fontWeight:700}}>{po.poNumber}</h3>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18}}>✕</button>
      </div>
      <div style={{marginBottom:16,display:"flex",gap:8,flexWrap:"wrap"}}>
        <span style={{background:st.bg,color:st.color,fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:700}}>{st.icon} {st.label}</span>
        <span style={{background:po.type==="food"?"#38bdf811":"#a78bfa11",color:po.type==="food"?"#38bdf8":"#a78bfa",fontSize:12,padding:"4px 12px",borderRadius:20,fontWeight:600}}>{po.type==="food"?"🧺 Food":"🍾 Beverages"}</span>
      </div>
      <div style={{background:"#080c12",borderRadius:10,padding:14,marginBottom:16,fontSize:13}}>
        {[["Vessel",po.vessel],["Supplier(s)",[...new Set(po.items.map(i=>i.supplier||po.supplier).filter(Boolean))].join(", ")||po.supplier],["Requested by",po.requestedBy],["PO Date",fmtDate(po.date)],...(po.deliveryDate?[["Delivery",fmtDate(po.deliveryDate)]]:[]),...(po.notes?[["Notes",po.notes]]:[])].map(([k,v])=>(
          <div key={k} style={{display:"flex",gap:12,padding:"6px 0",borderBottom:"1px solid #1a2030"}}>
            <span style={{color:"#475569",minWidth:110,flexShrink:0}}>{k}</span>
            <span style={{color:"#e2e8f0",fontWeight:500}}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <button onClick={()=>generatePOPdf(po)} style={{flex:1,...btnGhost,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>⬇ Download PDF</button>
        <button onClick={()=>sendPOEmail(po)} style={{flex:1,...btnGhost,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>✉ Send Email</button>
      </div>
      {po.status==="pending"&&<div style={{fontSize:12,color:"#64748b",fontWeight:600,letterSpacing:"0.06em",marginBottom:8}}>REVIEW EACH ITEM</div>}
      <div style={{background:"#080c12",borderRadius:10,border:"1px solid #1a2030",marginBottom:16,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:"#0c1018"}}>{["Item","Supplier","Qty","Unit Price","Subtotal",...(po.status==="pending"?["Decision"]:[])].map(h=><th key={h} style={{...thS,padding:"9px 14px"}}>{h}</th>)}</tr></thead>
          <tbody>
            {po.items.map(item=>{
              const isRej=decisions[item.id]==="rejected";
              const sub=Number(item.qty||0)*Number(item.unitPrice||0);
              return(
                <tr key={item.id} style={{borderTop:"1px solid #1a2030",background:isRej?"#f8717108":"transparent",opacity:isRej?0.6:1}}>
                  <td style={{...tdS,padding:"10px 14px"}}><div style={{fontWeight:600,fontSize:13,textDecoration:isRej?"line-through":"none"}}>{item.name}</div><CategoryBadge>{item.category}</CategoryBadge></td>
                  <td style={{...tdS,padding:"10px 14px",fontSize:13,color:"#94a3b8"}}>{item.supplier||po.supplier||"—"}</td>
                  <td style={{...tdS,padding:"10px 14px",fontFamily:"'DM Mono',monospace",fontSize:13,color:"#94a3b8"}}>{item.qty} {item.unit}</td>
                  <td style={{...tdS,padding:"10px 14px",fontFamily:"'DM Mono',monospace",fontSize:13,color:"#64748b"}}>Rp {Number(item.unitPrice).toLocaleString("id-ID")}</td>
                  <td style={{...tdS,padding:"10px 14px",fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:700,color:isRej?"#64748b":"#38bdf8",textDecoration:isRej?"line-through":"none"}}>{fmt$(sub)}</td>
                  {po.status==="pending"&&<td style={{...tdS,padding:"10px 14px"}}><button onClick={()=>toggle(item.id)} style={{padding:"6px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"'DM Sans',sans-serif",border:"none",background:isRej?"#f8717122":"#34d39922",color:isRej?"#f87171":"#34d399"}}>{isRej?"✕ Rejected":"✓ Approved"}</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {po.status==="pending"&&(
        <>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <div style={{background:"#34d39910",border:"1px solid #34d39933",borderRadius:10,padding:"12px 14px"}}><div style={{fontSize:11,color:"#34d399",fontWeight:700,marginBottom:4}}>✓ APPROVED ({approved.length})</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:16,fontWeight:700,color:"#34d399"}}>{fmt$(approvedTotal)}</div></div>
            <div style={{background:"#f8717110",border:"1px solid #f8717133",borderRadius:10,padding:"12px 14px"}}><div style={{fontSize:11,color:"#f87171",fontWeight:700,marginBottom:4}}>✕ REJECTED ({rejected.length})</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:16,fontWeight:700,color:"#f87171"}}>{fmt$(rejectedTotal)}</div></div>
          </div>
          {rejected.length>0&&rejected.map(item=>(
            <div key={item.id} style={{marginBottom:8}}><Label>Reason for rejecting "{item.name}" (optional)</Label><input value={rejReasons[item.id]||""} onChange={e=>setRejReasons(p=>({...p,[item.id]:e.target.value}))} placeholder="e.g. Over budget…" style={inputStyle}/></div>
          ))}
          <div style={{marginBottom:14}}><Label>Note to staff (optional)</Label><input value={globalNote} onChange={e=>setGlobalNote(e.target.value)} placeholder="e.g. Please resubmit…" style={inputStyle}/></div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={onClose} style={{...btnGhost,padding:"12px 20px"}}>Cancel</button>
            <button onClick={confirm} style={{flex:1,padding:"13px",borderRadius:10,cursor:"pointer",border:"none",fontWeight:700,fontSize:14,fontFamily:"'DM Sans',sans-serif",background:!approved.length?"linear-gradient(135deg,#f87171cc,#f87171)":approved.length<po.items.length?"linear-gradient(135deg,#f59e0bcc,#f59e0b)":"linear-gradient(135deg,#34d399cc,#34d399)",color:"#080c12"}}>
              {!approved.length?"✕ Reject All":approved.length<po.items.length?"◑ Partially Approve ("+approved.length+"/"+po.items.length+")":"✓ Approve All"}
            </button>
          </div>
        </>
      )}
      {po.status!=="pending"&&<button onClick={onClose} style={{...btnGhost,width:"100%",padding:"12px"}}>Close</button>}
    </div>
  );
}

// ─── ANALYTICS + WITHDRAWAL REPORT ───────────────────────────────────────────
function Analytics({pos,foodLog,bevLog,boxes,bevItems}){
  const [view,setView]=useState("monthly");
  const [year,setYear]=useState(new Date().getFullYear());
  const availYears=useMemo(()=>{const ys=new Set(pos.map(p=>new Date(p.date).getFullYear()));[...foodLog,...bevLog].forEach(l=>ys.add(new Date(l.ts).getFullYear()));return[...ys].sort((a,b)=>a-b);},[pos,foodLog,bevLog]);
  const monthlyData=useMemo(()=>{
    const map=MONTHS.map((m,i)=>({month:m,poSpend:0,stockIn:0,stockOut:0,outByParty:Object.fromEntries(TAKEN_BY.map(t=>[t,0]))}));
    pos.filter(p=>(p.status==="approved"||p.status==="partial")&&new Date(p.approvedAt||p.date).getFullYear()===year).forEach(po=>{const m=new Date(po.approvedAt||po.date).getMonth();map[m].poSpend+=po.items.reduce((s,i)=>s+Number(i.qty||0)*Number(i.unitPrice||0),0);});
    [...foodLog,...bevLog].filter(l=>new Date(l.ts).getFullYear()===year).forEach(l=>{const m=new Date(l.ts).getMonth();if(l.jenis==="In")map[m].stockIn+=l.qty;else{map[m].stockOut+=l.qty;if(l.takenBy&&map[m].outByParty[l.takenBy]!==undefined)map[m].outByParty[l.takenBy]+=l.qty;}});
    return map;
  },[pos,foodLog,bevLog,year]);
  const yearlyData=useMemo(()=>{
    const byYear={};availYears.forEach(y=>{byYear[y]={year:String(y),poSpend:0,stockIn:0,stockOut:0};});
    pos.filter(p=>p.status==="approved"||p.status==="partial").forEach(po=>{const y=new Date(po.approvedAt||po.date).getFullYear();if(byYear[y])byYear[y].poSpend+=po.items.reduce((s,i)=>s+Number(i.qty||0)*Number(i.unitPrice||0),0);});
    [...foodLog,...bevLog].forEach(l=>{const y=new Date(l.ts).getFullYear();if(byYear[y]){if(l.jenis==="In")byYear[y].stockIn+=l.qty;else byYear[y].stockOut+=l.qty;}});
    return Object.values(byYear).sort((a,b)=>a.year-b.year);
  },[pos,foodLog,bevLog,availYears]);
  const foodVal=boxes.reduce((s,b)=>s+b.items.reduce((a,i)=>a+(i.stock||0)*(i.unitPrice||0),0),0);
  const bevVal=BOATS.reduce((s,b)=>s+(bevItems[b]||[]).reduce((a,i)=>a+(i.stock||0)*(i.unitPrice||0),0),0);
  const data=view==="monthly"?monthlyData:yearlyData;
  const xKey=view==="monthly"?"month":"year";
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,flexWrap:"wrap",gap:12}}>
        <PageHeader title="Analytics" subtitle="Spending, inventory value and stock trends"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:28}}>
        {[
          {label:"Total Inventory",value:fmt$(foodVal+bevVal),icon:"📦",color:"#38bdf8"},
          {label:"Food Storage",value:fmt$(foodVal),icon:"🧺",color:"#34d399"},
          {label:"Beverages",value:fmt$(bevVal),icon:"🍾",color:"#a78bfa"},
        ].map(k=>(
          <div key={k.label} style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:14,padding:18}}>
            <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>{k.icon} {k.label.toUpperCase()}</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:20,fontWeight:700,color:k.color}}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
        <TogglePair options={[{value:"monthly",label:"Monthly"},{value:"yearly",label:"Yearly"}]} value={view} onChange={setView}/>
        {view==="monthly"&&availYears.map(y=>(<button key={y} onClick={()=>setYear(y)} style={{...y===year?btnPrimary:btnGhost,padding:"7px 14px",fontSize:12}}>{y}</button>))}
      </div>
      <div style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:14,padding:20,marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,color:"#94a3b8",marginBottom:16}}>PO Spend (Approved)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#1a2030"/><XAxis dataKey={xKey} tick={{fill:"#475569",fontSize:11}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#475569",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000000?`Rp ${(v/1000000).toFixed(0)}jt`:v>=1000?`Rp ${(v/1000).toFixed(0)}rb`:`Rp ${v}`}/><Tooltip formatter={v=>[fmt$(v),"PO Spend"]} contentStyle={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:8,color:"#e2e8f0"}}/><Bar dataKey="poSpend" fill="#38bdf8" radius={[4,4,0,0]}/></BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:14,padding:20,marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,color:"#94a3b8",marginBottom:16}}>Stock Movements</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#1a2030"/><XAxis dataKey={xKey} tick={{fill:"#475569",fontSize:11}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#475569",fontSize:11}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:8,color:"#e2e8f0"}}/><Legend/><Bar dataKey="stockIn" name="Stock In" fill="#34d399" radius={[4,4,0,0]}/><Bar dataKey="stockOut" name="Stock Out" fill="#f472b6" radius={[4,4,0,0]}/></BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function WithdrawalReport({foodLog,bevLog}){
  const [repView,setRepView]=useState("monthly");
  const [filterYear,setFilterYear]=useState(0);
  const allYears=useMemo(()=>[...new Set([...foodLog,...bevLog].filter(l=>l.jenis==="Out").map(l=>new Date(l.ts).getFullYear()))].sort((a,b)=>b-a),[foodLog,bevLog]);
  const outEntries=useMemo(()=>[...foodLog,...bevLog].filter(l=>l.jenis==="Out"&&(filterYear===0||new Date(l.ts).getFullYear()===filterYear)).sort((a,b)=>new Date(b.ts)-new Date(a.ts)),[foodLog,bevLog,filterYear]);
  const partyTotals=useMemo(()=>{const t=Object.fromEntries(TAKEN_BY.map(k=>[k,{qty:0,value:0}]));t["Unrecorded"]={qty:0,value:0};outEntries.forEach(l=>{const k=(l.takenBy&&TAKEN_BY.includes(l.takenBy))?l.takenBy:"Unrecorded";t[k].qty+=l.qty;t[k].value+=(l.totalValue||0);});return t;},[outEntries]);
  const monthlyOut=useMemo(()=>MONTHS.map((m,i)=>{const e=outEntries.filter(l=>new Date(l.ts).getMonth()===i);const bp=Object.fromEntries(TAKEN_BY.map(t=>[t,e.filter(l=>l.takenBy===t).reduce((s,l)=>s+l.qty,0)]));return{month:m,total:e.reduce((s,l)=>s+l.qty,0),value:e.reduce((s,l)=>s+(l.totalValue||0),0),byParty:bp};}),[outEntries]);
  const weeklyOut=useMemo(()=>{const w=[];const now=new Date();for(let i=11;i>=0;i--){const s=new Date(now);s.setDate(now.getDate()-i*7-now.getDay());const e=new Date(s);e.setDate(s.getDate()+6);const ents=outEntries.filter(l=>{const d=new Date(l.ts);return d>=s&&d<=e;});const lbl=s.getDate()+"/"+(s.getMonth()+1);const bp=Object.fromEntries(TAKEN_BY.map(t=>[t,ents.filter(l=>l.takenBy===t).reduce((s,l)=>s+l.qty,0)]));w.push({label:lbl,total:ents.reduce((s,l)=>s+l.qty,0),value:ents.reduce((s,l)=>s+(l.totalValue||0),0),byParty:bp});}return w;},[outEntries]);
  const PC={"Samara 1":"#38bdf8","Samara 2":"#34d399","Mischief":"#f472b6","Otium":"#fb923c","Staff":"#a78bfa","Lain-lain":"#94a3b8","Unrecorded":"#475569"};
  const rows=repView==="weekly"?weeklyOut:monthlyOut;
  const totalOut=outEntries.reduce((s,l)=>s+l.qty,0);
  const totalVal=outEntries.reduce((s,l)=>s+(l.totalValue||0),0);
  const pIcon=p=>BOATS.includes(p)?"⚓":p==="Staff"?"👤":"📋";
  return(
    <div>
      <PageHeader title="📤 Withdrawal Report" subtitle="Summary of items withdrawn — by party, monthly & weekly"/>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}>
        <TogglePair options={[{value:"monthly",label:"Monthly"},{value:"weekly",label:"Weekly"}]} value={repView} onChange={setRepView} activeColor="#f472b6"/>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button onClick={()=>generateWithdrawalPdf({mode:"monthly",rows:monthlyOut,partyTotals,outEntries,filterYear,totalOut,totalVal})} style={{...btnGhost,fontSize:11,padding:"6px 12px",color:"#f472b6",borderColor:"#f472b633"}}>⬇ PDF Monthly</button>
          <button onClick={()=>generateWithdrawalPdf({mode:"weekly",rows:weeklyOut,partyTotals,outEntries,filterYear,totalOut,totalVal})} style={{...btnGhost,fontSize:11,padding:"6px 12px",color:"#fb923c",borderColor:"#fb923c33"}}>⬇ PDF Weekly</button>
          <button onClick={()=>generateWithdrawalPdf({mode:"party",rows,partyTotals,outEntries,filterYear,totalOut,totalVal})} style={{...btnGhost,fontSize:11,padding:"6px 12px",color:"#a78bfa",borderColor:"#a78bfa33"}}>⬇ PDF By Party</button>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        <button onClick={()=>setFilterYear(0)} style={{padding:"7px 12px",borderRadius:7,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600,border:"none",background:filterYear===0?"#f472b6":"#1a2030",color:filterYear===0?"#080c12":"#64748b"}}>All</button>
        {allYears.map(y=>(<button key={y} onClick={()=>setFilterYear(y)} style={{padding:"7px 12px",borderRadius:7,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600,border:"none",background:filterYear===y?"#f472b6":"#1a2030",color:filterYear===y?"#080c12":"#64748b"}}>{y}</button>))}
      </div>
      <div style={{display:"flex",gap:14,fontSize:13,marginBottom:20,flexWrap:"wrap"}}>
        <div>Total withdrawals: <strong style={{fontFamily:"'DM Mono',monospace",color:"#f472b6"}}>{totalOut.toLocaleString("id-ID")} units</strong></div>
        {(totalVal>0)&&<div>Total value: <strong style={{fontFamily:"'DM Mono',monospace",color:"#f87171"}}>{fmt$(totalVal)}</strong></div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
        {TAKEN_BY.map(party=>{const d=partyTotals[party];const color=PC[party];const pct=totalOut>0?Math.round(d.qty/totalOut*100):0;return(<div key={party} style={{background:color+"10",border:"1px solid "+color+"33",borderRadius:10,padding:"12px 14px"}}><div style={{fontSize:12,color,fontWeight:700,marginBottom:6}}>{pIcon(party)} {party}</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:18,fontWeight:700,color}}>{d.qty.toLocaleString("id-ID")} units</div>{(d.value>0)&&<div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#64748b",marginTop:2}}>{fmt$(d.value)}</div>}<div style={{marginTop:8,background:"#1a2030",borderRadius:4,height:5}}><div style={{background:color,borderRadius:4,height:5,width:pct+"%",transition:"width .4s"}}/></div><div style={{fontSize:11,color:"#475569",marginTop:4}}>{pct}% of total</div></div>);})}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{background:"#080c12"}}><th style={thS}>{repView==="weekly"?"Week":"Month"}</th><th style={{...thS,textAlign:"right"}}>Total</th>{TAKEN_BY.map(t=><th key={t} style={{...thS,textAlign:"right",color:PC[t]}}>{t}</th>)}<th style={{...thS,textAlign:"right"}}>Value</th></tr></thead>
          <tbody>
            {rows.filter(r=>r.total>0).map((row,i)=>(
              <tr key={i} style={{borderTop:"1px solid #1a2030"}}>
                <td style={{...tdS,fontWeight:600}}>{row.month||row.label}</td>
                <td style={{...tdS,fontFamily:"'DM Mono',monospace",fontWeight:700,color:"#f472b6",textAlign:"right"}}>{row.total.toLocaleString("id-ID")}</td>
                {TAKEN_BY.map(t=><td key={t} style={{...tdS,fontFamily:"'DM Mono',monospace",textAlign:"right",color:row.byParty[t]>0?PC[t]:"#334155"}}>{row.byParty[t]>0?row.byParty[t].toLocaleString("id-ID"):"—"}</td>)}
                <td style={{...tdS,fontFamily:"'DM Mono',monospace",textAlign:"right",color:"#64748b",fontSize:12}}>{(row.value>0)?fmt$(row.value):"—"}</td>
              </tr>
            ))}
            {rows.filter(r=>r.total>0).length===0&&<tr><td colSpan={TAKEN_BY.length+3} style={{textAlign:"center",padding:32,color:"#334155"}}>No withdrawals recorded yet</td></tr>}
          </tbody>
          <tfoot>
            <tr style={{borderTop:"2px solid #f472b633",background:"#f472b608"}}>
              <td style={{...tdS,fontWeight:700,color:"#94a3b8"}}>TOTAL</td>
              <td style={{...tdS,fontFamily:"'DM Mono',monospace",fontWeight:800,color:"#f472b6",textAlign:"right"}}>{totalOut.toLocaleString("id-ID")}</td>
              {TAKEN_BY.map(t=><td key={t} style={{...tdS,fontFamily:"'DM Mono',monospace",fontWeight:700,textAlign:"right",color:PC[t]}}>{(partyTotals[t].qty>0)?partyTotals[t].qty.toLocaleString("id-ID"):"—"}</td>)}
              <td style={{...tdS,fontFamily:"'DM Mono',monospace",fontWeight:700,textAlign:"right",color:"#f87171"}}>{(totalVal>0)?fmt$(totalVal):"—"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {(outEntries.length>0)&&(
        <div style={{marginTop:20}}>
          <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:"0.1em",marginBottom:10}}>RECENT WITHDRAWALS</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {outEntries.slice(0,8).map(l=>{const color=PC[l.takenBy]||"#475569";return(
              <div key={l.id} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 12px",background:"#080c12",borderRadius:8,fontSize:13}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:color,flexShrink:0}}/>
                <div style={{flex:1}}><span style={{fontWeight:600,color:"#e2e8f0"}}>{l.itemName}</span><span style={{color:"#475569"}}> · {l.boxName||l.boat}</span></div>
                {l.takenBy&&<span style={{background:color+"18",color,fontSize:11,padding:"2px 8px",borderRadius:6,fontWeight:600,flexShrink:0}}>{l.takenBy}</span>}
                <span style={{fontFamily:"'DM Mono',monospace",color:"#f472b6",flexShrink:0}}>−{l.qty} {l.unit}</span>
                {(l.totalValue>0)&&<span style={{fontFamily:"'DM Mono',monospace",color:"#64748b",fontSize:11,flexShrink:0}}>{fmt$(l.totalValue)}</span>}
                <span style={{fontFamily:"'DM Mono',monospace",color:"#334155",fontSize:11,flexShrink:0}}>{new Date(l.ts).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</span>
              </div>
            );})}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── SALES REPORT ─────────────────────────────────────────────────────────────
function SalesReport({salesLog, openBills, isAdmin, sessionVessel}) {
  const [viewBoat, setViewBoat] = useState(sessionVessel||BOATS[0]);
  const [viewMode, setViewMode] = useState("daily");  // daily | history | bills
  const [selMonth, setSelMonth] = useState(new Date().getMonth());
  const [selYear,  setSelYear]  = useState(new Date().getFullYear());
  const [selBill,  setSelBill]  = useState(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareWa,    setShareWa]    = useState("");
  const [showRecipes, setShowRecipes] = useState(false);

  const boats = isAdmin ? BOATS : [sessionVessel];

  // Filter sales for selected boat
  const boatSales = (salesLog||[]).filter(s => s.boat === viewBoat);

  // Today's sales
  const todayStr = new Date().toDateString();
  const todaySales = boatSales.filter(s => new Date(s.ts).toDateString() === todayStr);
  const todayTotal = todaySales.reduce((s,sale)=>s+sale.total,0);
  const todayByMethod = PAY_METHODS.reduce((acc,pm)=>{
    acc[pm] = todaySales.filter(s=>s.payMethod===pm).reduce((s,sale)=>s+sale.total,0);
    return acc;
  },{});
  const todayItems = todaySales.flatMap(s=>s.items||[]).reduce((acc,i)=>{
    const ex = acc.find(a=>a.name===i.name);
    if(ex){ex.qty+=i.qty;ex.val+=i.qty*(i.unitPrice||0);}
    else acc.push({name:i.name,qty:i.qty,val:i.qty*(i.unitPrice||0)});
    return acc;
  },[]).sort((a,b)=>b.val-a.val);

  // Monthly sales
  const monthSales = boatSales.filter(s=>{
    const d=new Date(s.ts);
    return d.getMonth()===selMonth && d.getFullYear()===selYear;
  });
  const monthTotal = monthSales.reduce((s,sale)=>s+sale.total,0);

  // Available months
  const availMonths = [...new Set(boatSales.map(s=>{const d=new Date(s.ts);return d.getFullYear()+"-"+String(d.getMonth()).padStart(2,"0");}))].sort().reverse();

  // Closed bills for this boat
  const closedBills = (openBills||[]).filter(b=>b.boat===viewBoat&&b.status==="closed").sort((a,b)=>new Date(b.closedAt)-new Date(a.closedAt));

  // PDF monthly report
  const downloadMonthlyPdf = () => {
    const monthName = new Date(selYear, selMonth).toLocaleString("en-GB",{month:"long",year:"numeric"});
    const byDay = {};
    monthSales.forEach(s=>{
      const d = new Date(s.ts).toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
      if(!byDay[d]) byDay[d]={date:d,sales:[],total:0};
      byDay[d].sales.push(s); byDay[d].total+=s.total;
    });
    const dayRows = Object.values(byDay).map(day=>"<tr style=\"background:#f8f9fa;font-weight:600\"><td colspan=\"3\">"+day.date+"</td><td style=\"text-align:right;font-weight:700\">Rp "+day.total.toLocaleString("id-ID")+"</td></tr>"+day.sales.map(s=>"<tr><td style=\"padding-left:20px\">"+(s.guestName||"—")+"</td><td>"+s.payMethod+"</td><td>"+(s.items||[]).map(i=>i.name+"×"+i.qty).join(", ")+"</td><td style=\"text-align:right\">Rp "+s.total.toLocaleString("id-ID")+"</td></tr>").join("")).join("");
    const byMethod = PAY_METHODS.map(pm=>{const t=monthSales.filter(s=>s.payMethod===pm).reduce((s,sale)=>s+sale.total,0);return t>0?`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6"><span>${pm}</span><span style="font-weight:600">Rp ${t.toLocaleString("id-ID")}</span></div>`:""}).join("");
    const topItems = monthSales.flatMap(s=>s.items||[]).reduce((acc,i)=>{const ex=acc.find(a=>a.name===i.name);if(ex){ex.qty+=i.qty;ex.val+=i.qty*(i.unitPrice||0);}else acc.push({name:i.name,qty:i.qty,val:i.qty*(i.unitPrice||0)});return acc;},[]).sort((a,b)=>b.val-a.val).slice(0,10);
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sales Report — ${viewBoat} — ${monthName}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#111;padding:32px;font-size:13px}h1{font-size:22px;font-weight:700}h2{font-size:14px;font-weight:700;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #e5e7eb}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:14px;border-bottom:3px solid #111}.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}.kpi{background:#f8f9fa;border-radius:8px;padding:14px;border-left:4px solid #38bdf8}.kpi-val{font-size:20px;font-weight:700;margin-top:4px}.kpi-lbl{font-size:10px;text-transform:uppercase;color:#6b7280;letter-spacing:.06em}table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px}th{background:#111;color:#fff;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase}td{padding:7px 10px;border-bottom:1px solid #f3f4f6}.footer{margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;display:flex;justify-content:space-between}</style></head><body> <div class="header"><div><h1>Samara <span style="color:#0369a1">Yachting</span></h1><div style="font-size:12px;color:#6b7280;margin-top:3px">Monthly Sales Report — ⚓ ${viewBoat}</div><div style="font-size:11px;color:#9ca3af;margin-top:2px">${monthName} · Generated: ${new Date().toLocaleString("en-GB")}</div></div><div style="text-align:right"><div style="font-size:26px;font-weight:700;color:#0369a1">Rp ${monthTotal.toLocaleString("id-ID")}</div><div style="font-size:12px;color:#6b7280">${monthSales.length} transactions</div></div></div> <div class="kpi-grid"> <div class="kpi"><div class="kpi-lbl">Total Revenue</div><div class="kpi-val">Rp ${monthTotal.toLocaleString("id-ID")}</div></div> <div class="kpi" style="border-left-color:#34d399"><div class="kpi-lbl">Transactions</div><div class="kpi-val">${monthSales.length}</div></div> <div class="kpi" style="border-left-color:#a78bfa"><div class="kpi-lbl">Avg per Sale</div><div class="kpi-val">Rp ${monthSales.length?Math.round(monthTotal/monthSales.length).toLocaleString("id-ID"):"0"}</div></div> </div> <h2>Payment Breakdown</h2><div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:20px">${byMethod||"<p style='color:#9ca3af'>No data</p>"}</div> <h2>Top Items Sold</h2><table><thead><tr><th>Item</th><th style="text-align:center">Qty Sold</th><th style="text-align:right">Revenue</th></tr></thead><tbody>${topItems.map(i=>"<tr><td><strong>"+i.name+"</strong></td><td style=\"text-align:center\">"+i.qty+"</td><td style=\"text-align:right\">Rp "+i.val.toLocaleString("id-ID")+"</td></tr>").join("")}</tbody></table> <h2>Daily Breakdown</h2><table><thead><tr><th>Date / Guest</th><th>Payment</th><th>Items</th><th style="text-align:right">Amount</th></tr></thead><tbody>${dayRows}</tbody><tfoot><tr style="background:#e0f2fe;font-weight:700"><td colspan="3">TOTAL ${monthName.toUpperCase()}</td><td style="text-align:right">Rp ${monthTotal.toLocaleString("id-ID")}</td></tr></tfoot></table> <div class="footer"><span>Samara Yachting — Confidential</span><span>${viewBoat}</span></div></body></html>`;
    const blob=new Blob([html],{type:"text/html"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="Sales-Report-"+viewBoat.replace(/\s+/g,"-")+"-"+monthName.replace(/\s+/g,"-")+".html";document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),5000);
  };

  const sendReceiptEmail=(sale)=>{const txt=buildReceiptText({...sale,ts:sale.ts,closedAt:sale.closedAt});const sub=encodeURIComponent("Receipt — Samara "+sale.boat);const a=document.createElement("a");a.href=`mailto:${shareEmail||""}?subject=${sub}&body=${encodeURIComponent(txt)}`;document.body.appendChild(a);a.click();document.body.removeChild(a);};
  const sendReceiptWa=(sale)=>{const txt=buildReceiptText({...sale,ts:sale.ts,closedAt:sale.closedAt});const num=shareWa.replace(/[^0-9]/g,"");const a=document.createElement("a");a.href=`https://wa.me/${num}?text=${encodeURIComponent(txt)}`;a.target="_blank";a.rel="noopener";document.body.appendChild(a);a.click();document.body.removeChild(a);};

  return (
    <div>
      <PageHeader title="🧾 Sales & Bills" subtitle="Daily summary, bill history and monthly reports"/>

      {/* Boat selector (admin only) */}
      {isAdmin&&<div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {BOATS.map(b=>{const c=BOAT_COLORS[b];const sel=viewBoat===b;return(<button key={b} onClick={()=>{setViewBoat(b);setSelBill(null);}} style={{padding:"9px 20px",borderRadius:10,cursor:"pointer",border:sel?"2px solid "+c.accent:"1px solid #1a2030",background:sel?c.bg:"transparent",color:sel?c.accent:"#64748b",fontWeight:700,fontFamily:"'DM Sans',sans-serif",fontSize:13}}>{b}</button>);})}
      </div>}

      {/* View mode tabs */}
      <div style={{display:"flex",gap:8,marginBottom:24}}>
        {[{k:"daily",label:"📅 Today"},{ k:"history",label:"📋 Bill History"},{k:"monthly",label:"📊 Monthly Report"}].map(t=>(
          <button key={t.k} onClick={()=>{setViewMode(t.k);setSelBill(null);}} style={{...viewMode===t.k?btnPrimary:btnGhost,fontSize:13,padding:"9px 18px"}}>{t.label}</button>
        ))}
      </div>

      {/* ── TODAY ── */}
      {viewMode==="daily"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
            <div style={{background:"#0c1018",border:"1px solid #34d39933",borderRadius:14,padding:18}}>
              <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>TODAY'S REVENUE</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:800,color:"#34d399"}}>{fmt$(todayTotal)}</div>
              <div style={{fontSize:12,color:"#64748b",marginTop:4}}>{todaySales.length} transactions</div>
            </div>
            {PAY_METHODS.filter(pm=>todayByMethod[pm]>0).map(pm=>(
              <div key={pm} style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:14,padding:18}}>
                <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>{pm.toUpperCase()}</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:18,fontWeight:700,color:"#38bdf8"}}>{fmt$(todayByMethod[pm])}</div>
              </div>
            ))}
          </div>

          {/* Top items today */}
          {todayItems.length>0&&(
            <div style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:14,padding:20,marginBottom:20}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:"#94a3b8"}}>Top Items Today</div>
              {todayItems.map((item,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #0f1117"}}>
                  <div><span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#475569",marginRight:8}}>#{i+1}</span><strong>{item.name}</strong> <span style={{color:"#64748b"}}>×{item.qty}</span></div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:"#34d399"}}>{fmt$(item.val)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Today's transactions */}
          <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#94a3b8"}}>Today's Transactions</div>
          {todaySales.length===0&&<div style={{textAlign:"center",padding:40,color:"#334155",background:"#0c1018",borderRadius:14,border:"1px solid #1a2030"}}><div style={{fontSize:28,marginBottom:8}}>🧾</div>No sales today on {viewBoat}</div>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {todaySales.slice().reverse().map(s=>(
              <div key={s.id} style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:12,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontWeight:600,fontSize:14,marginBottom:4}}>{s.guestName||"—"} <span style={{fontSize:12,color:"#64748b",fontWeight:400}}>· {s.payMethod}</span></div>
                  <div style={{fontSize:12,color:"#64748b"}}>{(s.items||[]).map(i=>i.name+"×"+i.qty).join(" · ")}</div>
                  <div style={{fontSize:11,color:"#334155",marginTop:2,fontFamily:"'DM Mono',monospace"}}>{new Date(s.ts).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</div>
                </div>
                <div style={{fontFamily:"'DM Mono',monospace",fontWeight:800,fontSize:18,color:"#34d399"}}>{fmt$(s.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BILL HISTORY ── */}
      {viewMode==="history"&&(
        <div>
          {selBill?(
            <div>
              <button onClick={()=>setSelBill(null)} style={{...btnGhost,marginBottom:20,fontSize:13}}>← Back to Bills</button>
              <div style={{background:"#0c1018",border:"1px solid #34d39933",borderRadius:16,padding:28,maxWidth:560}}>
                <div style={{marginBottom:20}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:600,marginBottom:4}}>{selBill.guestName||"Unnamed Guest"}</div>
                  <div style={{fontSize:13,color:"#64748b"}}>⚓ {selBill.boat} · Closed {fmtDate(selBill.closedAt)} · {selBill.payMethod}</div>
                </div>

                {/* All rounds */}
                {(selBill.entries||[]).map((entry,i)=>(
                  <div key={entry.id} style={{marginBottom:14}}>
                    <div style={{fontSize:11,color:"#475569",fontWeight:600,marginBottom:6}}>ROUND {i+1} · {new Date(entry.ts).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}{entry.note?" · "+entry.note:""}</div>
                    {entry.items.map((it,j)=>(
                      <div key={j} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #0f1117",fontSize:13}}>
                        <span>{it.name} <span style={{color:"#64748b"}}>×{it.qty}</span></span>
                        <span style={{fontFamily:"'DM Mono',monospace",color:"#94a3b8"}}>{fmt$(it.qty*(it.unitPrice||0))}</span>
                      </div>
                    ))}
                    <div style={{textAlign:"right",fontSize:12,color:"#64748b",marginTop:4}}>Round total: {fmt$(entry.subtotal||0)}</div>
                  </div>
                ))}

                <div style={{borderTop:"2px solid #34d39933",paddingTop:14,display:"flex",justifyContent:"space-between",fontSize:18,fontWeight:800}}>
                  <span style={{color:"#94a3b8"}}>TOTAL</span>
                  <span style={{fontFamily:"'DM Mono',monospace",color:"#34d399"}}>{fmt$(selBill.total||0)}</span>
                </div>

                {/* Resend receipt */}
                <div style={{marginTop:20,background:"#080c12",borderRadius:12,padding:16}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#64748b",marginBottom:12}}>RESEND RECEIPT</div>
                  <div style={{marginBottom:8}}>
                    <Label>📧 Email</Label>
                    <div style={{display:"flex",gap:8}}><input value={shareEmail} onChange={e=>setShareEmail(e.target.value)} placeholder="guest@email.com" type="email" style={{...inputStyle,flex:1,fontSize:12}}/><button onClick={()=>sendReceiptEmail(selBill)} style={{...btnGhost,padding:"8px 12px",fontSize:12,whiteSpace:"nowrap"}}>Send</button></div>
                  </div>
                  <div>
                    <Label>💬 WhatsApp</Label>
                    <div style={{display:"flex",gap:8}}><input value={shareWa} onChange={e=>setShareWa(e.target.value)} placeholder="+628123456789" type="tel" style={{...inputStyle,flex:1,fontSize:12}}/><button onClick={()=>sendReceiptWa(selBill)} style={{background:"#25d36618",border:"1px solid #25d36644",color:"#25d366",padding:"8px 12px",borderRadius:9,cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>Send</button></div>
                  </div>
                </div>
              </div>
            </div>
          ):(
            <div>
              <div style={{fontSize:13,color:"#64748b",marginBottom:16}}>{closedBills.length} closed bill{closedBills.length!==1?"s":""} on {viewBoat}</div>
              {closedBills.length===0&&<div style={{textAlign:"center",padding:40,color:"#334155",background:"#0c1018",borderRadius:14,border:"1px solid #1a2030"}}><div style={{fontSize:28,marginBottom:8}}>📋</div>No closed bills yet</div>}
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {closedBills.map(bill=>(
                  <button key={bill.id} onClick={()=>setSelBill(bill)} style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:12,padding:"16px 20px",cursor:"pointer",textAlign:"left",fontFamily:"'DM Sans',sans-serif",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:15,color:"#e2e8f0",marginBottom:4}}>{bill.guestName||"Unnamed Guest"}</div>
                      <div style={{fontSize:12,color:"#64748b"}}>{(bill.entries&&bill.entries.length)||0} rounds · {bill.payMethod} · Closed {fmtDate(bill.closedAt)}</div>
                      <div style={{fontSize:12,color:"#475569",marginTop:2}}>{(bill.entries&&bill.entries.flatMap)(e=>e.items).reduce((acc,i)=>{const ex=acc.find(a=>a.name===i.name);if(ex)ex.qty+=i.qty;else acc.push({name:i.name,qty:i.qty});return acc;},[]).map(i=>i.name+"×"+i.qty).join(", ")}</div>
                    </div>
                    <div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontWeight:800,fontSize:18,color:"#34d399"}}>{fmt$(bill.total||0)}</div>
                      <div style={{fontSize:11,color:"#64748b",marginTop:4,textAlign:"right"}}>→ View</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MONTHLY REPORT ── */}
      {viewMode==="monthly"&&(
        <div>
          {/* Month selector */}
          <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
            <select value={selMonth+"-"+selYear} onChange={e=>{const[m,y]=e.target.value.split("-");setSelMonth(parseInt(m));setSelYear(parseInt(y));}} style={{...inputStyle,width:"auto",fontSize:13}}>
              {availMonths.map(ym=>{const[y,m]=ym.split("-");return(<option key={ym} value={parseInt(m)+"-"+y}>{new Date(parseInt(y),parseInt(m)).toLocaleString("en-GB",{month:"long",year:"numeric"})}</option>);})}
              {availMonths.length===0&&<option value={selMonth+"-"+selYear}>{new Date(selYear,selMonth).toLocaleString("en-GB",{month:"long",year:"numeric"})}</option>}
            </select>
            <button onClick={downloadMonthlyPdf} style={{...btnPrimary,background:"linear-gradient(135deg,#0369a1cc,#0369a1)",display:"flex",alignItems:"center",gap:6}}>⬇ Download PDF Report</button>
          </div>

          {/* Monthly KPIs */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
            <div style={{background:"#0c1018",border:"1px solid #38bdf833",borderRadius:14,padding:18}}>
              <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>TOTAL REVENUE</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:800,color:"#38bdf8"}}>{fmt$(monthTotal)}</div>
              <div style={{fontSize:12,color:"#64748b",marginTop:4}}>{monthSales.length} transactions</div>
            </div>
            <div style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:14,padding:18}}>
              <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>AVG PER SALE</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:800,color:"#94a3b8"}}>{monthSales.length?fmt$(Math.round(monthTotal/monthSales.length)):"—"}</div>
            </div>
            <div style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:14,padding:18}}>
              <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>PAYMENT SPLIT</div>
              {PAY_METHODS.map(pm=>{const t=monthSales.filter(s=>s.payMethod===pm).reduce((s,sale)=>s+sale.total,0);if(!t)return null;return(<div key={pm} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}><span style={{color:"#64748b"}}>{pm}</span><span style={{fontFamily:"'DM Mono',monospace",color:"#e2e8f0",fontWeight:600}}>{fmt$(t)}</span></div>);})}
            </div>
          </div>

          {/* Top items this month */}
          {monthSales.length>0&&(
            <div style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:14,padding:20,marginBottom:20}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:"#94a3b8"}}>Top Items This Month</div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["Item","Qty Sold","Revenue"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
                <tbody>
                  {monthSales.flatMap(s=>s.items||[]).reduce((acc,i)=>{const ex=acc.find(a=>a.name===i.name);if(ex){ex.qty+=i.qty;ex.val+=i.qty*(i.unitPrice||0);}else acc.push({name:i.name,qty:i.qty,val:i.qty*(i.unitPrice||0)});return acc;},[]).sort((a,b)=>b.val-a.val).map((item,i)=>(
                    <tr key={i} style={{borderTop:"1px solid #0f1117"}}>
                      <td style={{...tdS,fontWeight:600}}>{item.name}</td>
                      <td style={{...tdS,fontFamily:"'DM Mono',monospace",fontSize:13,color:"#94a3b8"}}>{item.qty}</td>
                      <td style={{...tdS,fontFamily:"'DM Mono',monospace",fontWeight:700,color:"#38bdf8"}}>{fmt$(item.val)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {monthSales.length===0&&<div style={{textAlign:"center",padding:40,color:"#334155",background:"#0c1018",borderRadius:14,border:"1px solid #1a2030"}}><div style={{fontSize:28,marginBottom:8}}>📊</div>No sales data for this month on {viewBoat}</div>}
        </div>
      )}
    </div>
  );
}

function ActivityLog({entries}){
  if(!entries.length)return<div style={{textAlign:"center",padding:60,color:"#334155",background:"#0c1018",borderRadius:14,border:"1px solid #1a2030"}}><div style={{fontSize:36,marginBottom:12}}>◎</div>No activity recorded yet</div>;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {entries.map(h=>(
        <div key={h.id} style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:36,height:36,borderRadius:9,flexShrink:0,background:h.jenis==="In"?"#34d39915":"#f472b615",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:h.jenis==="In"?"#34d399":"#f472b6"}}>{h.jenis==="In"?"↑":"↓"}</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,fontSize:14}}>{h.itemName}</div>
            <div style={{fontSize:12,color:"#475569",marginTop:2}}>{h.boxName||h.boat}{h.takenBy?" · ✋ "+h.takenBy:""}{h.note?" · "+h.note:""}</div>
            {h.unitPrice&&<div style={{fontSize:11,color:"#64748b",marginTop:2,fontFamily:"'DM Mono',monospace"}}>Rp {Number(h.unitPrice).toLocaleString("id-ID")} / {h.unit}</div>}
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:15,color:h.jenis==="In"?"#34d399":"#f472b6"}}>{h.jenis==="In"?"+":"−"}{h.qty} {h.unit}</div>
            {(h.totalValue>0)&&<div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:h.jenis==="Out"?"#f87171":"#34d399",marginTop:1}}>{h.jenis==="Out"?"−":"+"}Rp {Number(h.totalValue).toLocaleString("id-ID")}</div>}
            <div style={{fontSize:11,color:"#334155",fontFamily:"'DM Mono',monospace",marginTop:2}}>{fmtDate(h.ts)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function SamaraInventory(){
  const [session, setSession] = useState(null);
  const [section, setSection] = useState("dashboard");
  const [boxes,    setBoxes]    = useState(()=>lsGet(KEYS.boxes,   SEED_BOXES));
  const [bevItems, setBevItems] = useState(()=>lsGet(KEYS.bevItems, SEED_BEV));
  const [pos,      setPOs]      = useState(()=>lsGet(KEYS.pos,      SEED_POS));
  const [foodLog,  setFoodLog]  = useState(()=>lsGet(KEYS.foodLog,  SEED_FOOD_LOG));
  const [bevLog,   setBevLog]   = useState(()=>lsGet(KEYS.bevLog,   SEED_BEV_LOG));
  const [salesLog, setSalesLog] = useState(()=>lsGet(KEYS.salesLog, []));
  const [openBills,setOpenBills]= useState(()=>lsGet(KEYS.openBills,[]));
  const [recipes,setRecipes]= useState(()=>lsGet(KEYS.recipes,[]));
  const [suppliers,setSuppliers]= useState(()=>lsGet(KEYS.suppliers,SEED_SUPPLIERS));
  const [toast,    setToast]    = useState(null);
  const [modal,    setModal]    = useState(null);
  const [mForm,    setMForm]    = useState({});

  const showToast = (msg,ok=true)=>{setToast({msg,ok});setTimeout(()=>setToast(null),3500);};
  const closeModal = ()=>{setModal(null);setMForm({});};

  // Persist
  useEffect(()=>{lsSet(KEYS.boxes,    boxes);},    [boxes]);
  useEffect(()=>{lsSet(KEYS.bevItems, bevItems);}, [bevItems]);
  useEffect(()=>{lsSet(KEYS.pos,      pos);},      [pos]);
  useEffect(()=>{lsSet(KEYS.foodLog,  foodLog);},  [foodLog]);
  useEffect(()=>{lsSet(KEYS.bevLog,   bevLog);},   [bevLog]);
  useEffect(()=>{lsSet(KEYS.salesLog, salesLog);}, [salesLog]);
  useEffect(()=>{lsSet(KEYS.openBills,openBills);}, [openBills]);
  useEffect(()=>{lsSet(KEYS.recipes,recipes);}, [recipes]);
  useEffect(()=>{lsSet(KEYS.suppliers,suppliers);}, [suppliers]);

  // Load from window.storage on mount
  useEffect(()=>{
    if(!window.storage)return;
    Object.entries({[KEYS.boxes]:setBoxes,[KEYS.bevItems]:setBevItems,[KEYS.pos]:setPOs,[KEYS.foodLog]:setFoodLog,[KEYS.bevLog]:setBevLog,[KEYS.salesLog]:setSalesLog,[KEYS.openBills]:setOpenBills,[KEYS.suppliers]:setSuppliers}).forEach(async([k,setter])=>{
      try{const r=await window.storage.get(k);if((r&&r.value)){const p=JSON.parse(r.value);setter(p);sessionStorage.setItem(k,r.value);}}catch{}
    });
  },[]);

  // ── Auth helpers ──
  const addItem = ()=>{
    const{name,unit,unitPrice,entryDate}=mForm;
    if(!name||!unit)return showToast("Fill in all fields.",false);
    if(!entryDate)return showToast("Select an entry date.",false);
    setBoxes(p=>p.map(b=>b.id===modal.boxId?{...b,items:[...b.items,{id:uid(),name,unit,stock:0,unitPrice:parseFloat(unitPrice)||0,entryDate:new Date(entryDate).toISOString()}]}:b));
    showToast(`"${name}" added.`); closeModal();
  };
  const editItem = ()=>{
    const{name,unit,unitPrice}=mForm;
    if(!name||!unit)return showToast("Fill in all fields.",false);
    setBoxes(p=>p.map(b=>b.id===modal.boxId?{...b,items:b.items.map(i=>i.id===modal.item.id?{...i,name,unit,unitPrice:parseFloat(unitPrice)||0}:i)}:b));
    showToast("Item updated."); closeModal();
  };
  const doFoodTx = ()=>{
    const qty=parseInt(mForm.qty);const{jenis,note,txDate,txPrice,takenBy}=mForm;const{boxId,item}=modal;
    if(!qty||qty<=0)return showToast("Quantity must be > 0.",false);
    if(!txDate)return showToast("Select a date.",false);
    if(jenis==="Out"&&!takenBy)return showToast("Please select 'Taken by'.",false);
    if(jenis==="Out"&&item.stock<qty)return showToast(`Insufficient stock. Available: ${item.stock} ${item.unit}`,false);
    const usedPrice=txPrice?parseFloat(txPrice):(item.unitPrice||0);
    const totalValue=qty*usedPrice;
    setBoxes(p=>p.map(b=>b.id===boxId?{...b,items:b.items.map(i=>i.id===item.id?{...i,stock:jenis==="In"?i.stock+qty:i.stock-qty}:i)}:b));
    const box=boxes.find(b=>b.id===boxId);
    const ts=new Date(txDate).toISOString();
    setFoodLog(p=>[{id:uid(),itemName:item.name,unit:item.unit,boxName:getCat((box&&box.categoryId)).label,jenis,qty,unitPrice:usedPrice,totalValue,takenBy:takenBy||null,note:note||"",ts},...p]);
    showToast(`${jenis==="In"?"Stock added":"Taken by "+takenBy} — ${qty} ${item.unit}.`); closeModal();
  };
  const addBevItem = ()=>{
    const{name,category,unit,boat,unitPrice,entryDate}=mForm;
    if(!name||!category||!unit||!boat)return showToast("Fill in all fields.",false);
    if(!entryDate)return showToast("Select an entry date.",false);
    setBevItems(p=>({...p,[boat]:[...(p[boat]||[]),{id:uid(),name,category,unit,stock:0,unitPrice:parseFloat(unitPrice)||0,entryDate:new Date(entryDate).toISOString()}]}));
    showToast(`"${name}" added to ${boat}.`); closeModal();
  };
  const editBevItem = ()=>{
    const{name,category,unit,unitPrice}=mForm;
    if(!name||!category||!unit)return showToast("Fill in all fields.",false);
    setBevItems(p=>({...p,[modal.boat]:p[modal.boat].map(i=>i.id===modal.item.id?{...i,name,category,unit,unitPrice:parseFloat(unitPrice)||0}:i)}));
    showToast("Item updated."); closeModal();
  };
  const doBevTx = ()=>{
    const qty=parseInt(mForm.qty);const{jenis,note,txDate}=mForm;const{boat,item}=modal;
    if(!qty||qty<=0)return showToast("Quantity must be > 0.",false);
    if(!txDate)return showToast("Select a date.",false);
    if(jenis==="Out"&&item.stock<qty)return showToast(`Insufficient stock. Available: ${item.stock} ${item.unit}`,false);
    const ts=new Date(txDate).toISOString();
    setBevItems(p=>({...p,[boat]:p[boat].map(i=>i.id===item.id?{...i,stock:jenis==="In"?i.stock+qty:i.stock-qty}:i)}));
    setBevLog(p=>[{id:uid(),itemName:item.name,unit:item.unit,jenis,qty,boat,note:note||"",ts},...p]);
    showToast(`${jenis==="In"?"Received":"Consumed"} ${qty} ${item.unit} of ${item.name}.`); closeModal();
  };
  const submitPO = ()=>{
    const{poType,vessel,requestedBy,notes,poItems,poDate,deliveryDate}=mForm;
    if(!requestedBy||!poItems||!poItems.length)return showToast("Add at least one item and fill Requested By.",false);
    if(poType==="beverages"&&!vessel)return showToast("Select a vessel.",false);
    if(poItems.some(i=>!i.name||!i.qty||!i.unitPrice||!i.supplier))return showToast("Each item needs name, qty, price and supplier.",false);
    if(!poDate)return showToast("Select a PO date.",false);

    const buildPONumber=(offset)=>{
      const count=pos.length+1+offset;
      return "PO-"+new Date(poDate).getFullYear()+"-"+String(count).padStart(3,"0");
    };
    const primarySupplierOf=(items)=>{
      const counts={};items.forEach(i=>{counts[i.supplier]=(counts[i.supplier]||0)+1;});
      const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
      return (sorted[0]&&sorted[0][0])||"Various";
    };
    const baseVessel=poType==="food"?"Central Storage":vessel;

    const locations=[...new Set(poItems.map(i=>i.location||"Bali"))];

    if(locations.length>1){
      // Mixed locations — auto-split into two linked POs
      const baliItems=poItems.filter(i=>(i.location||"Bali")==="Bali");
      const lokalItems=poItems.filter(i=>i.location==="Lokal");
      const poBali={id:uid(),poNumber:buildPONumber(0),poLocation:"Bali",type:poType||"food",vessel:baseVessel,supplier:primarySupplierOf(baliItems),requestedBy,notes:notes||"",date:new Date(poDate).toISOString(),deliveryDate:deliveryDate?new Date(deliveryDate).toISOString():null,submittedAt:new Date().toISOString(),status:"pending",items:baliItems.map(i=>({...i,id:uid()}))};
      const poLokal={id:uid(),poNumber:buildPONumber(1),poLocation:"Lokal",type:poType||"food",vessel:baseVessel,supplier:primarySupplierOf(lokalItems),requestedBy,notes:notes||"",date:new Date(poDate).toISOString(),deliveryDate:deliveryDate?new Date(deliveryDate).toISOString():null,submittedAt:new Date().toISOString(),status:"pending",items:lokalItems.map(i=>({...i,id:uid()}))};
      poBali.linkedPoNumber=poLokal.poNumber;
      poLokal.linkedPoNumber=poBali.poNumber;
      setPOs(p=>[poBali,poLokal,...p]);
      showToast("Split into "+poBali.poNumber+" (Bali) and "+poLokal.poNumber+" (Lokal)!");
      closeModal();
      return;
    }

    const onlyLocation=locations[0]||"Bali";
    const newPO={id:uid(),poNumber:buildPONumber(0),poLocation:onlyLocation,type:poType||"food",vessel:baseVessel,supplier:primarySupplierOf(poItems),requestedBy,notes:notes||"",date:new Date(poDate).toISOString(),deliveryDate:deliveryDate?new Date(deliveryDate).toISOString():null,submittedAt:new Date().toISOString(),status:"pending",items:poItems.map(i=>({...i,id:uid()}))};
    setPOs(p=>[newPO,...p]);
    showToast(newPO.poNumber+" submitted!"); closeModal();
  };
  const approvePO = (po,reason)=>{
    setPOs(p=>p.map(o=>o.id!==po.id?o:{...o,status:"rejected",rejectionReason:reason,rejectedAt:new Date().toISOString()}));
    showToast(`PO ${po.poNumber} rejected.`); closeModal();
  };
  const decideItemsPO = (po,decisions,rejReasons,globalNote)=>{
    const approved=po.items.filter(i=>decisions[i.id]==="approved");
    const status=po.items.some(i=>decisions[i.id]==="rejected")&&approved.length?"partial":"approved";
    setPOs(p=>p.map(o=>o.id!==po.id?o:{...o,status,approvedAt:new Date().toISOString(),itemDecisions:decisions,itemRejReasons:rejReasons,globalNote:globalNote||""}));
    showToast(`PO ${po.poNumber} ${status==="partial"?"partially approved":"approved"}.`); closeModal();
  };
  const markBought = (po,actualPrices,buyDate,buyBy,note)=>{
    let priceVariance=false;
    const updatedItems=po.items.map(item=>{
      if(actualPrices[item.id]===undefined)return item;
      const actual=Number(actualPrices[item.id]);
      if(actual!==Number(item.unitPrice))priceVariance=true;
      return{...item,actualUnitPrice:actual};
    });
    setPOs(p=>p.map(o=>o.id!==po.id?o:{...o,items:updatedItems,status:"buying",buyDate:new Date(buyDate).toISOString(),buyBy:buyBy||"",buyNote:note||"",priceVariance}));
    showToast(po.poNumber+(priceVariance?" purchase confirmed — price variance noted.":" purchase confirmed!"));
    closeModal();
  };
  const markShipped = (po,shipDate,method,note)=>{
    setPOs(p=>p.map(o=>o.id!==po.id?o:{...o,status:"shipped",shippedAt:new Date(shipDate).toISOString(),shippingMethod:method,shippingNote:note||""}));
    showToast(`${po.poNumber} marked as shipped — in transit to ${po.vessel}.`); closeModal();
  };
  const markReceived = (po,itemReceived,receivedAt,receivedBy,note)=>{
    const approvedItems=po.items.filter(i=>!(po.itemDecisions&&po.itemDecisions[i.id]==="rejected"));
    let hasDiscrepancy=false;
    approvedItems.forEach(item=>{
      const rec=itemReceived[item.id]||{qty:item.qty};
      if(Number(rec.qty)!==Number(item.qty))hasDiscrepancy=true;
    });
    const tsReceived=new Date(receivedAt).toISOString();

    if(po.type==="food"){
      setBoxes(prevBoxes=>{
        let updated=prevBoxes.map(b=>({...b,items:[...b.items]}));
        approvedItems.forEach(item=>{
          const rec=itemReceived[item.id]||{qty:item.qty};
          const qtyReceived=Number(rec.qty)||0;
          if(qtyReceived<=0)return;
          const catObj=FOOD_CATS.find(c=>c.label===item.category)||FOOD_CATS.find(c=>c.id==="other");
          const boxIdx=updated.findIndex(b=>b.categoryId===catObj.id);
          if(boxIdx<0)return;
          const box=updated[boxIdx];
          const exIdx=box.items.findIndex(bi=>bi.name.toLowerCase()===item.name.toLowerCase());
          const effPrice=item.actualUnitPrice!==undefined?item.actualUnitPrice:(item.unitPrice||0);
          if(exIdx>=0){
            box.items[exIdx]={...box.items[exIdx],stock:(box.items[exIdx].stock||0)+qtyReceived,unitPrice:effPrice||box.items[exIdx].unitPrice};
          }else{
            box.items.push({id:uid(),name:item.name,unit:item.unit,stock:qtyReceived,unitPrice:effPrice,entryDate:tsReceived});
          }
        });
        return updated;
      });
      approvedItems.forEach(item=>{
        const rec=itemReceived[item.id]||{qty:item.qty};
        const qtyReceived=Number(rec.qty)||0;
        if(qtyReceived<=0)return;
        const catObj=FOOD_CATS.find(c=>c.label===item.category)||FOOD_CATS.find(c=>c.id==="other");
        const logPrice=item.actualUnitPrice!==undefined?item.actualUnitPrice:(item.unitPrice||0);
        setFoodLog(p=>[{id:uid(),itemName:item.name,unit:item.unit,boxName:catObj.label,jenis:"In",qty:qtyReceived,unitPrice:logPrice,totalValue:qtyReceived*logPrice,note:"PO "+po.poNumber+" arrival"+(rec.note?" — "+rec.note:""),ts:tsReceived},...p]);
      });
    }else{
      setBevItems(prevBev=>{
        const updated={...prevBev};
        const boatItems=updated[po.vessel]?[...updated[po.vessel]]:[];
        approvedItems.forEach(item=>{
          const rec=itemReceived[item.id]||{qty:item.qty};
          const qtyReceived=Number(rec.qty)||0;
          if(qtyReceived<=0)return;
          const exIdx=boatItems.findIndex(bi=>bi.name.toLowerCase()===item.name.toLowerCase());
          const effPriceB=item.actualUnitPrice!==undefined?item.actualUnitPrice:(item.unitPrice||0);
          if(exIdx>=0){
            boatItems[exIdx]={...boatItems[exIdx],stock:(boatItems[exIdx].stock||0)+qtyReceived,unitPrice:effPriceB||boatItems[exIdx].unitPrice};
          }else{
            boatItems.push({id:uid(),name:item.name,category:item.category||"Other",unit:item.unit,stock:qtyReceived,unitPrice:effPriceB,entryDate:tsReceived});
          }
        });
        updated[po.vessel]=boatItems;
        return updated;
      });
      approvedItems.forEach(item=>{
        const rec=itemReceived[item.id]||{qty:item.qty};
        const qtyReceived=Number(rec.qty)||0;
        if(qtyReceived<=0)return;
        const logPriceB=item.actualUnitPrice!==undefined?item.actualUnitPrice:(item.unitPrice||0);
        setBevLog(p=>[{id:uid(),itemName:item.name,unit:item.unit,boat:po.vessel,jenis:"In",qty:qtyReceived,unitPrice:logPriceB,totalValue:qtyReceived*logPriceB,note:"PO "+po.poNumber+" arrival"+(rec.note?" — "+rec.note:""),ts:tsReceived},...p]);
      });
    }

    setPOs(p=>p.map(o=>o.id!==po.id?o:{...o,status:"received",receivedAt:tsReceived,receivedBy:receivedBy||"",itemReceived,hasDiscrepancy,receiveNote:note||""}));
    showToast(hasDiscrepancy?(po.poNumber+" received — discrepancy noted, stock updated."):(po.poNumber+" received — stock added to "+po.vessel+"!"));
    closeModal();
  };
  const addSupplier = ()=>{
    const{supplierName}=mForm;
    if(!(supplierName&&supplierName.trim()))return showToast("Enter a supplier name.",false);
    if(suppliers.includes(supplierName.trim()))return showToast("Already exists.",false);
    setSuppliers(p=>[...p,supplierName.trim()]); showToast(`"${supplierName.trim()}" added.`); closeModal();
  };
  const editSupplier = ()=>{
    const{supplierName,oldSupplier}=mForm;
    if(!(supplierName&&supplierName.trim()))return showToast("Enter a name.",false);
    setSuppliers(p=>p.map(s=>s===oldSupplier?supplierName.trim():s));
    setPOs(p=>p.map(po=>po.supplier===oldSupplier?{...po,supplier:supplierName.trim()}:po));
    showToast("Supplier updated."); closeModal();
  };
  const deleteSupplier = name=>{setSuppliers(p=>p.filter(s=>s!==name));showToast(`"${name}" removed.`);closeModal();};

  const isAdmin = (session&&session.role)==="admin";
  const sessionVessel = (session&&session.vessel)||null;
  const pendingPOs = pos.filter(p=>p.status==="pending").length;

  if(!session) return <LoginScreen onLogin={role=>{const vessel=role==="admin"?null:role;setSession({role,vessel});setSection(role==="admin"?"dashboard":"beverages");}}/>;

  const navItems = isAdmin?[
    {key:"dashboard",  icon:"◈", label:"Dashboard"},
    {key:"food",       icon:"◉", label:"Food Storage"},
    {key:"sparepart",  icon:"🔧", label:"Sparepart"},
    {key:"beverages",  icon:"◆", label:"Beverages"},
    {key:"sales",      icon:"🧾", label:"Sales & Bills"},
    {key:"po",         icon:"⊡", label:"Purchase Orders", badge:pendingPOs},
    {key:"analytics",  icon:"◐", label:"Analytics"},
    {key:"withdrawals",icon:"📤", label:"Withdrawals"},
    {key:"log",        icon:"≡", label:"Activity Log"},
  ]:[
    {key:"beverages",  icon:"◆", label:"Beverages"},
    {key:"sales",      icon:"🧾", label:"Sales & Bills"},
  ];

  // Dashboard stats
  const foodVal=boxes.filter(b=>b.categoryId!=="sparepart").reduce((s,b)=>s+b.items.reduce((a,i)=>a+(i.stock||0)*(i.unitPrice||0),0),0);
  const bevVal=BOATS.reduce((s,b)=>s+(bevItems[b]||[]).reduce((a,i)=>a+(i.stock||0)*(i.unitPrice||0),0),0);
  const pendingVal=pos.filter(p=>p.status==="pending").reduce((s,po)=>s+po.items.reduce((a,i)=>a+Number(i.qty||0)*Number(i.unitPrice||0),0),0);

  return(
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#080c12",minHeight:"100vh",color:"#e2e8f0"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <Toast toast={toast}/>

      {/* MODALS */}
      {modal&&(
        <div onClick={e=>e.target===e.currentTarget&&closeModal()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          {modal.type==="add-item"&&<ModalShell title="Add Item" onClose={closeModal}><div style={{marginBottom:14}}><Label>Item Name</Label><input value={mForm.name||""} onChange={e=>setMForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Cheddar Cheese…" style={inputStyle}/></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}><div><Label>Unit</Label><input value={mForm.unit||""} onChange={e=>setMForm(p=>({...p,unit:e.target.value}))} placeholder="Kg, L, Pcs…" style={inputStyle}/></div><div><Label>Unit Price (Rp)</Label><input type="number" value={mForm.unitPrice||""} onChange={e=>setMForm(p=>({...p,unitPrice:e.target.value}))} placeholder="0" style={inputStyle}/></div></div><div style={{marginBottom:20}}><Label>Entry Date *</Label><input type="date" value={mForm.entryDate||""} onChange={e=>setMForm(p=>({...p,entryDate:e.target.value}))} style={inputStyle}/></div><ModalActions onCancel={closeModal} onConfirm={addItem} label="Add Item"/></ModalShell>}
          {modal.type==="edit-item"&&<ModalShell title={`Edit — ${modal.item.name}`} onClose={closeModal}><div style={{marginBottom:14}}><Label>Item Name</Label><input value={mForm.name||""} onChange={e=>setMForm(p=>({...p,name:e.target.value}))} style={inputStyle}/></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}><div><Label>Unit</Label><input value={mForm.unit||""} onChange={e=>setMForm(p=>({...p,unit:e.target.value}))} style={inputStyle}/></div><div><Label>Unit Price (Rp)</Label><input type="number" value={mForm.unitPrice||""} onChange={e=>setMForm(p=>({...p,unitPrice:e.target.value}))} placeholder="0" style={inputStyle}/></div></div><ModalActions onCancel={closeModal} onConfirm={editItem} label="Save Changes"/></ModalShell>}
          {modal.type==="food-tx"&&(
            <ModalShell title={`${mForm.jenis==="Out"?"📤 Withdrawal":"📥 Add Stock"} — ${modal.item.name}`} onClose={closeModal}>
              <div style={{marginBottom:14}}><Label>Transaction Type</Label><TogglePair options={[{value:"In",label:"↑ Received / Add"},{value:"Out",label:"↓ Withdrawn / Remove"}]} value={mForm.jenis} onChange={v=>setMForm(p=>({...p,jenis:v}))} activeColor={mForm.jenis==="In"?"#34d399":"#f472b6"}/></div>
              <div style={{background:mForm.jenis==="Out"?"#f472b611":"#34d39911",border:"1px solid "+(mForm.jenis==="Out"?"#f472b633":"#34d39933"),borderRadius:9,padding:"10px 14px",marginBottom:14,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:"#94a3b8"}}>Current stock</span><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:18,color:mForm.jenis==="Out"?"#f472b6":"#34d399"}}>{modal.item.stock} {modal.item.unit}</span></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}><div><Label>Date *</Label><input type="date" value={mForm.txDate||""} onChange={e=>setMForm(p=>({...p,txDate:e.target.value}))} style={inputStyle}/></div><div><Label>Quantity ({modal.item.unit})</Label><input type="number" min="1" value={mForm.qty||""} onChange={e=>setMForm(p=>({...p,qty:e.target.value}))} placeholder="0" style={inputStyle}/></div></div>
              <div style={{marginBottom:14}}><Label>Price per {modal.item.unit} (Rp){modal.item.unitPrice?` — default: Rp ${modal.item.unitPrice.toLocaleString("id-ID")}`:""}</Label><input type="number" min="0" value={mForm.txPrice||""} onChange={e=>setMForm(p=>({...p,txPrice:e.target.value}))} placeholder={modal.item.unitPrice?String(modal.item.unitPrice):"Enter price…"} style={inputStyle}/></div>
              {mForm.qty&&(Number(mForm.txPrice)||modal.item.unitPrice)&&<div style={{background:"#38bdf811",border:"1px solid #38bdf833",borderRadius:9,padding:"10px 14px",marginBottom:14,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:"#64748b"}}>Total value</span><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:"#38bdf8"}}>Rp {(parseInt(mForm.qty||0)*(parseFloat(mForm.txPrice)||modal.item.unitPrice||0)).toLocaleString("id-ID")}</span></div>}
              {mForm.jenis==="Out"&&<div style={{marginBottom:14}}><Label>Taken by *</Label><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>{TAKEN_BY.map(t=>{const sel=mForm.takenBy===t;const color=t==="Samara 1"?"#38bdf8":t==="Samara 2"?"#34d399":t==="Mischief"?"#f472b6":t==="Otium"?"#fb923c":t==="Staff"?"#a78bfa":"#94a3b8";return(<button key={t} onClick={()=>setMForm(p=>({...p,takenBy:t}))} style={{padding:"9px 6px",borderRadius:9,cursor:"pointer",border:sel?"2px solid "+color:"1px solid #1a2030",background:sel?color+"18":"#080c12",color:sel?color:"#475569",fontWeight:600,fontFamily:"'DM Sans',sans-serif",fontSize:12}}>{t==="Samara 1"||t==="Samara 2"||t==="Mischief"||t==="Otium"?"⚓ ":t==="Staff"?"👤 ":"📋 "}{t}</button>);})}</div></div>}
              <div style={{marginBottom:20}}><Label>Notes (optional)</Label><input value={mForm.note||""} onChange={e=>setMForm(p=>({...p,note:e.target.value}))} placeholder="e.g. For charter, maintenance…" style={inputStyle}/></div>
              <ModalActions onCancel={closeModal} onConfirm={doFoodTx} label={mForm.jenis==="Out"?"Record Withdrawal":"Record Receipt"} color={mForm.jenis==="In"?"#34d399":"#f472b6"}/>
            </ModalShell>
          )}
          {modal.type==="bev-add"&&<ModalShell title="Add Beverage Item" onClose={closeModal}><div style={{marginBottom:14}}><Label>Vessel</Label><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{BOATS.map(b=>{const c=BOAT_COLORS[b];const sel=mForm.boat===b;return(<button key={b} onClick={()=>setMForm(p=>({...p,boat:b}))} style={{padding:"10px",borderRadius:8,cursor:"pointer",border:sel?"2px solid "+c.accent:"1px solid #1a2030",background:sel?c.bg:"#0c1018",color:sel?c.accent:"#475569",fontWeight:600,fontFamily:"'DM Sans',sans-serif",fontSize:13}}>{b}</button>);})}</div></div><div style={{marginBottom:14}}><Label>Item Name</Label><input value={mForm.name||""} onChange={e=>setMForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Dom Pérignon…" style={inputStyle}/></div><div style={{marginBottom:14}}><Label>Category</Label><select value={mForm.category||BEV_CATEGORIES[0]} onChange={e=>setMForm(p=>({...p,category:e.target.value}))} style={inputStyle}>{BEV_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}><div><Label>Unit</Label><input value={mForm.unit||""} onChange={e=>setMForm(p=>({...p,unit:e.target.value}))} placeholder="Btl, Can…" style={inputStyle}/></div><div><Label>Unit Price (Rp)</Label><input type="number" value={mForm.unitPrice||""} onChange={e=>setMForm(p=>({...p,unitPrice:e.target.value}))} placeholder="0" style={inputStyle}/></div></div><div style={{marginBottom:20}}><Label>Entry Date *</Label><input type="date" value={mForm.entryDate||""} onChange={e=>setMForm(p=>({...p,entryDate:e.target.value}))} style={inputStyle}/></div><ModalActions onCancel={closeModal} onConfirm={addBevItem} label="Add Item"/></ModalShell>}
          {modal.type==="bev-edit"&&<ModalShell title={`Edit — ${modal.item.name}`} onClose={closeModal}><div style={{marginBottom:14}}><Label>Item Name</Label><input value={mForm.name||""} onChange={e=>setMForm(p=>({...p,name:e.target.value}))} style={inputStyle}/></div><div style={{marginBottom:14}}><Label>Category</Label><select value={mForm.category||BEV_CATEGORIES[0]} onChange={e=>setMForm(p=>({...p,category:e.target.value}))} style={inputStyle}>{BEV_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}><div><Label>Unit</Label><input value={mForm.unit||""} onChange={e=>setMForm(p=>({...p,unit:e.target.value}))} style={inputStyle}/></div><div><Label>Unit Price (Rp)</Label><input type="number" value={mForm.unitPrice||""} onChange={e=>setMForm(p=>({...p,unitPrice:e.target.value}))} placeholder="0" style={inputStyle}/></div></div><ModalActions onCancel={closeModal} onConfirm={editBevItem} label="Save Changes"/></ModalShell>}
          {modal.type==="bev-tx"&&<ModalShell title={`${modal.boat} — ${modal.item.name}`} onClose={closeModal}><div style={{marginBottom:14}}><Label>Movement</Label><TogglePair options={[{value:"In",label:"↑ Received"},{value:"Out",label:"↓ Consumed"}]} value={mForm.jenis} onChange={v=>setMForm(p=>({...p,jenis:v}))} activeColor={mForm.jenis==="In"?"#34d399":"#f472b6"}/></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}><div><Label>Date *</Label><input type="date" value={mForm.txDate||""} onChange={e=>setMForm(p=>({...p,txDate:e.target.value}))} style={inputStyle}/></div><div><Label>Quantity ({modal.item.unit}) — Stock: {modal.item.stock}</Label><input type="number" min="1" value={mForm.qty||""} onChange={e=>setMForm(p=>({...p,qty:e.target.value}))} placeholder="0" style={inputStyle}/></div></div><div style={{marginBottom:20}}><Label>Notes (optional)</Label><input value={mForm.note||""} onChange={e=>setMForm(p=>({...p,note:e.target.value}))} placeholder="e.g. Guest consumption…" style={inputStyle}/></div><ModalActions onCancel={closeModal} onConfirm={doBevTx} label="Confirm" color={mForm.jenis==="In"?"#34d399":"#f472b6"}/></ModalShell>}
          {modal.type==="po-new"&&<PONewModal form={mForm} setForm={setMForm} boxes={boxes} bevItems={bevItems} suppliers={suppliers} onCancel={closeModal} onQuickAddSupplier={name=>{if(!suppliers.includes(name)){setSuppliers(p=>[...p,name]);showToast(`"${name}" added as supplier.`);}}} onSubmit={submitPO}/>}
          {modal.type==="po-review"&&<POReviewModal po={modal.po} onClose={closeModal} onApprove={(d,rr,n)=>decideItemsPO(modal.po,d,rr,n)} onReject={r=>approvePO(modal.po,r)}/>}
          {modal.type==="po-buy"&&<POBuyModal po={modal.po} onCancel={closeModal} onConfirm={(actualPrices,buyDate,buyBy,note)=>markBought(modal.po,actualPrices,buyDate,buyBy,note)}/>}
          {modal.type==="po-ship"&&<POShipModal po={modal.po} onCancel={closeModal} onConfirm={(shipDate,method,note)=>markShipped(modal.po,shipDate,method,note)}/>}
          {modal.type==="po-receive"&&<POReceiveModal po={modal.po} onClose={closeModal} onConfirm={(itemReceived,receivedAt,receivedBy,note)=>markReceived(modal.po,itemReceived,receivedAt,receivedBy,note)}/>}
          {modal.type==="add-supplier"&&<ModalShell title="Add Supplier" onClose={closeModal}><div style={{marginBottom:20}}><Label>Supplier Name *</Label><input value={mForm.supplierName||""} onChange={e=>setMForm(p=>({...p,supplierName:e.target.value}))} placeholder="e.g. PT Sumber Makmur…" style={inputStyle} autoFocus/></div><ModalActions onCancel={closeModal} onConfirm={addSupplier} label="Add Supplier"/></ModalShell>}
          {modal.type==="edit-supplier"&&<ModalShell title="Edit Supplier" onClose={closeModal}><div style={{marginBottom:20}}><Label>Supplier Name *</Label><input value={mForm.supplierName||""} onChange={e=>setMForm(p=>({...p,supplierName:e.target.value}))} style={inputStyle} autoFocus/></div><ModalActions onCancel={closeModal} onConfirm={editSupplier} label="Save Changes"/></ModalShell>}
          {modal.type==="delete-supplier"&&<ModalShell title="Remove Supplier" onClose={closeModal}><p style={{color:"#94a3b8",fontSize:14,marginBottom:20}}>Remove <strong style={{color:"#e2e8f0"}}>{mForm.oldSupplier}</strong>?</p><div style={{display:"flex",gap:10}}><button onClick={closeModal} style={{...btnGhost,flex:1}}>Cancel</button><button onClick={()=>deleteSupplier(mForm.oldSupplier)} style={{flex:1,padding:"11px",borderRadius:10,cursor:"pointer",background:"#f87171",border:"none",color:"white",fontWeight:700,fontFamily:"'DM Sans',sans-serif"}}>Remove</button></div></ModalShell>}
        </div>
      )}

      <div style={{display:"flex",minHeight:"100vh"}}>
        {/* SIDEBAR */}
        <div style={{width:230,background:"#0c1018",borderRight:"1px solid #1a2030",display:"flex",flexDirection:"column",padding:"28px 0",position:"fixed",top:0,left:0,height:"100vh",zIndex:50,overflowY:"auto"}}>
          <div style={{padding:"0 24px 20px"}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:600,color:"#e2e8f0"}}>Samara</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#38bdf8",letterSpacing:"0.2em",marginTop:3}}>INVENTORY SYSTEM</div>
          </div>
          <div style={{margin:"0 16px 20px",background:isAdmin?"#f59e0b18":"#38bdf818",border:"1px solid "+(isAdmin?"#f59e0b44":"#38bdf844"),borderRadius:10,padding:"10px 14px"}}>
            <div style={{fontSize:11,color:isAdmin?"#f59e0b":"#38bdf8",fontWeight:700,letterSpacing:"0.08em"}}>{isAdmin?"🔑 ADMIN":"⚓ "+sessionVessel}</div>
            <button onClick={()=>setSession(null)} style={{marginTop:6,fontSize:11,color:"#475569",background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>Log out →</button>
          </div>
          {navItems.map(n=>(
            <button key={n.key} onClick={()=>setSection(n.key)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 24px",background:section===n.key?"#38bdf810":"transparent",borderLeft:section===n.key?"3px solid #38bdf8":"3px solid transparent",border:"none",cursor:"pointer",color:section===n.key?"#38bdf8":"#64748b",fontWeight:600,fontSize:14,fontFamily:"'DM Sans',sans-serif",transition:"all .2s",width:"100%",textAlign:"left"}}>
              <span style={{fontSize:15}}>{n.icon}</span>
              <span style={{flex:1}}>{n.label}</span>
              {(n.badge>0)&&<span style={{background:"#f59e0b",color:"#080c12",fontSize:11,fontWeight:800,padding:"1px 7px",borderRadius:20}}>{n.badge}</span>}
            </button>
          ))}
          <div style={{marginTop:"auto",padding:"20px 24px",borderTop:"1px solid #1a2030"}}>
            <div style={{fontSize:10,color:"#1e4d2b",letterSpacing:"0.1em",marginBottom:8,fontWeight:600,background:"#14532d22",borderRadius:6,padding:"4px 8px"}}>💾 Auto-saved</div>
            {isAdmin&&<button onClick={()=>setSection("pin-settings")} style={{fontSize:11,color:"#475569",background:"none",border:"none",cursor:"pointer",padding:"4px 0",fontFamily:"'DM Sans',sans-serif",fontWeight:600,display:"block"}}>🔐 Manage PINs</button>}
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{marginLeft:230,flex:1,padding:32,maxWidth:"calc(100vw - 230px)"}}>
          {section==="dashboard"&&isAdmin&&(
            <div>
              <PageHeader title="Dashboard" subtitle="Samara Fleet Inventory Overview"/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:28}}>
                {[
                  {label:"Food Storage Value",value:fmt$(foodVal),icon:"🧺",color:"#38bdf8"},
                  {label:"Beverages Value",value:fmt$(bevVal),icon:"🍾",color:"#a78bfa"},
                  {label:"Pending POs",value:pendingPOs+" orders",sub:fmt$(pendingVal),icon:"⊡",color:"#f59e0b"},
                ].map(k=>(
                  <div key={k.label} style={{background:"#0c1018",border:"1px solid #1a2030",borderRadius:14,padding:18}}>
                    <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>{k.icon} {k.label.toUpperCase()}</div>
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:20,fontWeight:700,color:k.color}}>{k.value}</div>
                    {k.sub&&<div style={{fontSize:12,color:"#64748b",marginTop:4}}>{k.sub}</div>}
                  </div>
                ))}
              </div>
              <SectionLabel>Beverages by Vessel</SectionLabel>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14}}>
                {BOATS.map(boat=>{const items=bevItems[boat]||[];const val=items.reduce((s,i)=>s+(i.stock||0)*(i.unitPrice||0),0);const c=BOAT_COLORS[boat];return(<div key={boat} style={{background:"#0c1018",border:"1px solid "+c.border,borderRadius:14,padding:18,cursor:"pointer"}} onClick={()=>setSection("beverages")}><div style={{fontWeight:700,color:c.accent,fontSize:15,marginBottom:8}}>⚓ {boat}</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:18,fontWeight:700,color:c.accent}}>{fmt$(val)}</div><div style={{fontSize:12,color:"#64748b",marginTop:4}}>{items.length} items</div></div>);})}</div>
            </div>
          )}
          {section==="food"&&<FoodSection boxes={boxes} onAddItem={boxId=>{setModal({type:"add-item",boxId});setMForm({entryDate:today()});}} onEditItem={(item,boxId)=>{setModal({type:"edit-item",item,boxId});setMForm({name:item.name,unit:item.unit,unitPrice:item.unitPrice||""});}} onTx={(item,boxId)=>{setModal({type:"food-tx",item,boxId});setMForm({jenis:"In",qty:"",note:"",txDate:today()});}}/>}
          {section==="sparepart"&&<FoodSection boxes={boxes} filterCat="sparepart" pageTitle="🔧 Sparepart" pageSubtitle="Sparepart stock for all vessels" onAddItem={boxId=>{setModal({type:"add-item",boxId});setMForm({entryDate:today()});}} onEditItem={(item,boxId)=>{setModal({type:"edit-item",item,boxId});setMForm({name:item.name,unit:item.unit,unitPrice:item.unitPrice||""});}} onTx={(item,boxId)=>{setModal({type:"food-tx",item,boxId});setMForm({jenis:"In",qty:"",note:"",txDate:today()});}}/>}
          {section==="beverages"&&<BevSection bevItems={bevItems} salesLog={salesLog} openBills={openBills} setOpenBills={setOpenBills} recipes={recipes} setRecipes={setRecipes} sessionVessel={sessionVessel} isAdmin={isAdmin} onAdd={boat=>{setModal({type:"bev-add"});setMForm({category:BEV_CATEGORIES[0],boat,entryDate:today()});}} onTx={(item,boat)=>{setModal({type:"bev-tx",item,boat});setMForm({jenis:"In",qty:"",note:"",txDate:today()});}} onEdit={(item,boat)=>{setModal({type:"bev-edit",item,boat});setMForm({name:item.name,category:item.category,unit:item.unit,unitPrice:item.unitPrice||""});}} onSale={(saleItems,boat,guestName,payMethod,deductions)=>{const ts=new Date().toISOString();setBevItems(p=>{const u={...p};saleItems.forEach(si=>{u[boat]=(u[boat]||[]).map(i=>i.id===si.id?{...i,stock:Math.max(0,i.stock-si.qty)}:i);});if(deductions&&deductions.length){deductions.forEach(d=>{u[boat]=(u[boat]||[]).map(i=>i.id===d.itemId?{...i,stock:Math.max(0,i.stock-d.qty)}:i);});}return u;});saleItems.forEach(si=>{setBevLog(p=>[{id:uid(),itemName:si.name,unit:si.unit,jenis:"Out",qty:si.qty,boat,note:"Sale"+(guestName?" to "+guestName:""),ts,totalValue:si.qty*si.unitPrice},...p]);});const total=saleItems.reduce((s,si)=>s+si.qty*si.unitPrice,0);setSalesLog(p=>[{id:uid(),boat,items:saleItems,guestName:guestName||"",payMethod:payMethod||"Cash",total,ts},...p]);showToast("Sale recorded — "+fmt$(total));}}/>}
          {section==="po"&&isAdmin&&<POSection pos={pos} suppliers={suppliers} onNew={()=>{setModal({type:"po-new"});setMForm({poType:"food",vessel:BOATS[0],requestedBy:"",notes:"",poItems:[],poDate:today(),deliveryDate:""});}} onReview={po=>setModal({type:"po-review",po})} onBuy={po=>setModal({type:"po-buy",po})} onShip={po=>setModal({type:"po-ship",po})} onReceive={po=>setModal({type:"po-receive",po})} onAddSupplier={()=>{setModal({type:"add-supplier"});setMForm({supplierName:""});}} onEditSupplier={s=>{setModal({type:"edit-supplier"});setMForm({supplierName:s,oldSupplier:s});}} onDeleteSupplier={s=>{setModal({type:"delete-supplier"});setMForm({oldSupplier:s});}}/>}
          {section==="analytics"&&isAdmin&&<Analytics pos={pos} foodLog={foodLog} bevLog={bevLog} boxes={boxes} bevItems={bevItems}/>}
          {section==="withdrawals"&&isAdmin&&<WithdrawalReport foodLog={foodLog} bevLog={bevLog}/>}
          {section==="pin-settings"&&isAdmin&&<PinSettingsPanel/>}
          {section==="sales"&&<SalesReport salesLog={salesLog} openBills={openBills} isAdmin={isAdmin} sessionVessel={sessionVessel}/>}
          {(section==="log"||(!isAdmin&&section==="log"))&&<div><PageHeader title="Activity Log" subtitle="All stock movements"/><ActivityLog entries={[...foodLog,...bevLog].sort((a,b)=>new Date(b.ts)-new Date(a.ts))}/></div>}
        </div>
      </div>
    </div>
  );
}


