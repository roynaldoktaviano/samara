// Data panel: shows the ERP datasets (live) and imports the others from CSV/JSON files into this
// browser, exports any dataset back as CSV, downloads empty templates, and backs up / restores the
// imported files as one JSON file. Opens from the bar above the dashboard.
(function () {
  const DS = window.SMI_DATASETS, byId = Object.fromEntries(DS.map((d) => [d.id, d]));
  const IMPORTABLE = DS.filter((d) => !d.erp);
  const BACKUP_APP = 'samara-marketing-dashboard';
  const FLASH_KEY = 'smi-data-flash';
  const $ = (s) => document.querySelector(s);
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k != null)); return e; };
  const fmtTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const today = () => new Date().toISOString().slice(0, 10);

  let records = {}; // imported dataset id -> { id, fileName, importedAt, rows }
  let erp = {}; // ERP dataset id -> { generatedAt, count } or { error }

  // ---------- files in and out
  const download = (name, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = el('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const normalize = window.SMI_NORMALIZE;

  const parseFile = async (file) => {
    const text = (await file.text()).replace(/^﻿/, '');
    if (/\.json$/i.test(file.name)) {
      const j = JSON.parse(text);
      const rows = Array.isArray(j) ? j : j.rows || j.data || j.results;
      if (!Array.isArray(rows)) throw new Error('the JSON is not a list of rows');
      return { rows, columns: [...new Set(rows.flatMap((r) => Object.keys(r).map((k) => k.trim())))] };
    }
    // Excel saves CSV with ";" in locales that use a decimal comma: follow the header row.
    const head = text.split(/\r?\n/, 1)[0];
    const delim = /\.tsv$/i.test(file.name) || (head.includes('\t') && !head.includes(',')) ? '\t' : head.includes(';') && !head.includes(',') ? ';' : ',';
    const rows = d3.dsvFormat(delim).parse(text);
    return { rows, columns: rows.columns.map((c) => c.trim()) };
  };

  const missingCols = (d, columns) => d.columns.filter((c) => !columns.includes(c));

  // A file belongs to the dataset whose columns it has in full (the most specific one wins).
  const matchDataset = (columns) => IMPORTABLE.filter((d) => !missingCols(d, columns).length).sort((a, b) => b.columns.length - a.columns.length)[0];

  const toRecord = (d, file, parsed) => ({ id: d.id, fileName: file.name, importedAt: new Date().toISOString(), rows: normalize(parsed.rows, d) });

  const templateOf = (d) => d3.csvFormat([], d.columns);

  // Minimal ZIP writer (files stored uncompressed), so all templates come as one download.
  const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const zip = (files) => {
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2]].forEach(([at, v, n]) => (n === 4 ? local.setUint32(at, v, true) : local.setUint16(at, v, true)));
      const cen = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [42, offset, 4]].forEach(([at, v, n]) => (n === 4 ? cen.setUint32(at, v, true) : cen.setUint16(at, v, true)));
      parts.push(local, name, data); central.push(cen, name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((s, p) => s + p.byteLength, 0), end = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4]].forEach(([at, v, n]) => (n === 4 ? end.setUint32(at, v, true) : end.setUint16(at, v, true)));
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  };

  const downloadAllTemplates = () => {
    const url = URL.createObjectURL(zip(IMPORTABLE.map((d) => ({ name: d.id + '-template.csv', text: templateOf(d) }))));
    const a = el('a', { href: url, download: 'marketing-dashboard-templates.zip' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const csvOf = (d, rows) => {
    const extra = [...new Set(rows.flatMap(Object.keys))].filter((c) => !d.columns.includes(c));
    return d3.csvFormat(rows, [...d.columns, ...extra]);
  };

  // ---------- actions
  const finish = (msg) => {
    try { sessionStorage.setItem(FLASH_KEY, msg); } catch { /* flash is optional */ }
    location.reload();
  };

  const importFiles = async (files, forced) => {
    const ok = [], errors = [];
    for (const file of files) {
      try {
        const parsed = await parseFile(file);
        const d = forced || matchDataset(parsed.columns);
        if (!d) {
          const near = IMPORTABLE.map((x) => ({ x, miss: missingCols(x, parsed.columns) })).sort((a, b) => a.miss.length - b.miss.length)[0];
          throw new Error('its columns match no dataset (closest: ' + near.x.title + ', missing ' + near.miss.join(', ') + ')');
        }
        const miss = missingCols(d, parsed.columns);
        if (miss.length) throw new Error('missing column' + (miss.length > 1 ? 's ' : ' ') + miss.join(', ') + ' for ' + d.title);
        if (!parsed.rows.length) throw new Error('no data rows: fill in the ' + d.title + ' template before importing');
        ok.push([d, toRecord(d, file, parsed)]);
      } catch (e) {
        errors.push(file.name + ': ' + (e.message || e));
      }
    }
    if (errors.length) { say(errors, 'bad'); return; }
    await window.dashStore.put(ok.map(([, r]) => r));
    ok.sort(([a], [b]) => DS.indexOf(a) - DS.indexOf(b));
    finish('Imported ' + ok.map(([d, r]) => d.title + ' (' + r.rows.length.toLocaleString('en') + ' rows)').join(', ') + '.');
  };

  const exportBackup = () => {
    const list = IMPORTABLE.map((d) => records[d.id]).filter(Boolean);
    download('marketing-dashboard-backup-' + today() + '.json', JSON.stringify({ app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), datasets: list }), 'application/json');
  };

  const restoreBackup = async (file) => {
    try {
      const j = JSON.parse((await file.text()).replace(/^﻿/, ''));
      if (j.app !== BACKUP_APP || !Array.isArray(j.datasets)) throw new Error('this is not a Marketing Dashboard backup file');
      const list = j.datasets.filter((r) => byId[r.id] && !byId[r.id].erp && Array.isArray(r.rows));
      if (!list.length) throw new Error('the backup holds no datasets');
      if (!confirm('Replace the data in this browser with the ' + list.length + ' dataset(s) in ' + file.name + '?')) return;
      await window.dashStore.clear();
      await window.dashStore.put(list.map((r) => ({ id: r.id, fileName: r.fileName || file.name, importedAt: r.importedAt || new Date().toISOString(), rows: normalize(r.rows, byId[r.id]) })));
      finish('Restored ' + list.length + ' dataset(s) from ' + file.name + '.');
    } catch (e) {
      say([file.name + ': ' + (e.message || e)], 'bad');
    }
  };

  const removeAll = async () => {
    if (!confirm('Remove all imported data from this browser? Export a backup first if you need it.')) return;
    await window.dashStore.clear();
    finish('All data removed from this browser.');
  };

  // ---------- panel
  let msgBox = null;
  const say = (lines, tone) => {
    if (!msgBox) return;
    msgBox.className = 'dm-msg ' + tone;
    msgBox.replaceChildren(...[].concat(lines).map((l) => el('div', { textContent: l })));
    msgBox.hidden = false;
  };

  const filePicker = (label, { multiple = false, accept = '.csv,.tsv,.txt,.json', primary = false, onPick }) => {
    const input = el('input', { type: 'file', multiple, accept, hidden: true });
    input.addEventListener('change', () => { const fs = [...input.files]; input.value = ''; if (fs.length) onPick(fs); });
    const btn = el('button', { type: 'button', className: 'btn' + (primary ? ' btn-primary' : ''), textContent: label });
    btn.addEventListener('click', () => input.click());
    return [btn, input];
  };
  const button = (label, onClick, cls = '') => { const b = el('button', { type: 'button', className: 'btn ' + cls, textContent: label }); b.addEventListener('click', onClick); return b; };

  const renderPanel = (box) => {
    const have = IMPORTABLE.filter((d) => records[d.id]).length;
    const head = el('div', { className: 'dm-head' },
      el('div', {}, el('h2', { textContent: 'Data' }),
        el('p', { className: 'sec-note', textContent: 'CRM enquiries and the departure schedule come live from the ERP (Samara Yachting) every time this page opens. The other ' + IMPORTABLE.length + ' are files you import (CSV from Excel or the ad accounts, or JSON); they stay in this browser only and nothing is uploaded. Until one is imported, the figures that need it stay blank. You can pick several files at once; each is matched to its dataset by its columns.' })),
      button('Close', () => $('#dm-dialog').close()));

    const actions = el('div', { className: 'dm-actions' },
      ...filePicker('Import files…', { multiple: true, primary: true, onPick: (fs) => importFiles(fs) }),
      ...filePicker('Restore backup…', { accept: '.json', onPick: ([f]) => restoreBackup(f) }),
      button('Download all templates', downloadAllTemplates),
      have ? button('Export backup', exportBackup) : null,
      have ? button('Remove imported data', removeAll, 'btn-danger') : null,
      el('span', { className: 'dm-count', textContent: have + ' of ' + IMPORTABLE.length + ' files imported' }));

    msgBox = el('div', { className: 'dm-msg', hidden: true });
    msgBox.setAttribute('role', 'status');

    const tbody = el('tbody');
    for (const d of DS) {
      const r = records[d.id], live = erp[d.id], rows = d.erp ? dash.data(d.id).data : r && r.rows;
      const pill = d.erp ? (live && !live.error ? ['ok', 'ERP · live'] : ['bad', 'ERP failed']) : r ? ['ok', 'Imported'] : ['muted', 'Not imported'];
      const acts = el('div', { className: 'dm-row-actions' },
        ...(d.erp ? [] : filePicker(r ? 'Replace' : 'Import', { onPick: ([f]) => importFiles([f], d) })),
        rows && rows.length ? button('Export CSV', () => download(d.id + '-' + today() + '.csv', csvOf(d, rows), 'text/csv')) : null,
        d.erp ? null : button('Template', () => download(d.id + '-template.csv', templateOf(d), 'text/csv')));
      tbody.append(el('tr', {},
        el('td', { className: 'l wrap' }, el('b', { textContent: d.title }), el('div', { className: 'dm-desc', textContent: d.description })),
        el('td', { className: 'l' }, el('span', { className: 'pill ' + pill[0], textContent: pill[1] })),
        el('td', { className: 'l dm-file', textContent: d.erp ? 'Samara Yachting ERP' : r ? r.fileName : '—', title: d.erp ? '' : r ? r.fileName : '' }),
        el('td', { textContent: rows && (d.erp || r) ? rows.length.toLocaleString('en') : '—' }),
        el('td', { className: 'l', textContent: d.erp ? (live && live.generatedAt ? fmtTime(live.generatedAt) : '—') : r ? fmtTime(r.importedAt) : '—' }),
        el('td', { className: 'l' }, acts)));
    }
    const table = el('table', {}, el('thead', {}, el('tr', {},
      el('th', { className: 'l', textContent: 'Dataset' }), el('th', { className: 'l', textContent: 'Source' }), el('th', { className: 'l', textContent: 'File' }),
      el('th', { textContent: 'Rows' }), el('th', { className: 'l', textContent: 'Updated' }), el('th', { className: 'l', textContent: '' }))), tbody);

    box.replaceChildren(head, actions, msgBox, el('div', { className: 'card' }, el('div', { className: 'tbl-wrap dm-tbl' }, table)));
  };

  const openPanel = () => { renderPanel($('#dm-panel')); $('#dm-dialog').showModal(); };

  // ---------- start: the dashboard always shows; the bar says where its data stands
  window.dashReady.then(({ imported, erp: live }) => {
    records = Object.fromEntries(imported.map((r) => [r.id, r]));
    erp = live;
    const failed = Object.entries(live).filter(([, v]) => v.error).map(([id]) => byId[id].title);
    const times = Object.values(live).map((v) => v.generatedAt).filter(Boolean).sort();
    const have = IMPORTABLE.filter((d) => records[d.id]).length;
    $('#dm-bar-text').textContent = (failed.length ? 'Could not load ' + failed.join(' and ') + ' from the ERP' : 'Enquiries and departures live from the ERP · updated ' + fmtTime(times[0]))
      + ' · ' + have + ' of ' + IMPORTABLE.length + ' files imported';
    $('#dm-open').addEventListener('click', openPanel);
    let flash = null;
    try { flash = sessionStorage.getItem(FLASH_KEY); sessionStorage.removeItem(FLASH_KEY); } catch { /* flash is optional */ }
    if (flash) { openPanel(); say([flash], 'ok'); }
  });
})();
