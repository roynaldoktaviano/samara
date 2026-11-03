// Stand-in for the claude.ai Dashboard runtime (the global `dash`), so the page scripts
// (calc.js, intel.js, decide.js, ui.js, intel-pages.js, pages.js) run here unchanged.
// Datasets come from files the viewer imported, kept in this browser's IndexedDB (see data-manager.js).
(function () {
  const DATASETS = Object.fromEntries(window.SMI_DATASETS.map((d) => [d.id, d]));
  const DEFAULT_PARAMS = { brand: 'All', dest: 'All', vtype: 'All', year: 'All' };

  // ---------- browser store: one record per dataset { id, fileName, importedAt, rows }
  const DB_NAME = 'samara-marketing-dashboard', STORE = 'datasets';
  let dbP = null;
  const db = () => (dbP = dbP || new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const tx = (mode, fn) => db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode), out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Storage aborted'));
  }));
  window.dashStore = {
    all: () => tx('readonly', (s) => s.getAll()),
    put: (records) => tx('readwrite', (s) => records.forEach((r) => s.put(r))),
    remove: (id) => tx('readwrite', (s) => s.delete(id)),
    clear: () => tx('readwrite', (s) => s.clear()),
  };

  const sources = {}; // dataset id -> { status, data, message }
  const calcs = {}; // calc id -> { inputs, fn }
  const results = {}; // calc id -> computed state
  const listeners = [];
  let params = { ...DEFAULT_PARAMS };

  const state = (status, data, message) => ({ status, data: data || [], rows: data || [], columns: data && data.length ? Object.keys(data[0]) : [], meta: [], message: message || '', refreshing: false });

  for (const id in DATASETS) sources[id] = state('loading');

  // ERP datasets load live on every visit; a failed one is an error, not empty data.
  const loadErp = (d) => fetch('/api/public/marketing-dashboard/' + d.id)
    .then((res) => { if (!res.ok) throw new Error(res.status + ' ' + res.statusText); return res.json(); })
    .then((j) => { sources[d.id] = state('ok', window.SMI_NORMALIZE(j.rows, d)); return { generatedAt: j.generatedAt, count: j.rows.length }; })
    .catch((e) => { console.error('[dash] ERP dataset ' + d.id + ' failed', e); sources[d.id] = state('error', null, 'Could not load from the ERP'); return { error: String(e.message || e) }; });

  // Imported datasets come from this browser; one not imported yet counts as empty, so the
  // dashboard still draws and only the figures that need it stay blank.
  const loadImported = () => window.dashStore.all()
    .then((records) => {
      const byId = Object.fromEntries(records.map((r) => [r.id, r]));
      for (const d of window.SMI_DATASETS) if (!d.erp) sources[d.id] = state('ok', byId[d.id] ? byId[d.id].rows : []);
      return records;
    })
    .catch((e) => {
      console.error('[dash] browser storage unavailable', e);
      for (const d of window.SMI_DATASETS) if (!d.erp) sources[d.id] = state('ok', []);
      return [];
    });

  const erpList = window.SMI_DATASETS.filter((d) => d.erp);
  window.dashReady = Promise.all([loadImported(), ...erpList.map(loadErp)])
    .then(([imported, ...erp]) => ({ imported, erp: Object.fromEntries(erpList.map((d, i) => [d.id, erp[i]])) }))
    .finally(() => notify());

  const compute = (id) => {
    if (results[id]) return results[id];
    const c = calcs[id];
    const ins = c.inputs.map((i) => dash.data(i));
    const bad = ins.find((d) => d.status !== 'ok');
    if (bad) return bad.status === 'loading' ? state('loading') : state('error', null, 'An input is missing');
    try {
      results[id] = state('ok', c.fn(...ins.map((d) => d.data)));
    } catch (e) {
      console.error('[dash] calc ' + id + ' failed', e);
      results[id] = state('error', null, String(e.message || e));
    }
    return results[id];
  };

  // Skeleton placeholders are cleared once their source has loaded or the page has filled them.
  const clearSkeletons = () => {
    document.querySelectorAll('#dash-root .dash-skeleton').forEach((el) => {
      const ids = (el.dataset.source || '').split(/\s+/).filter(Boolean);
      const loaded = ids.length && ids.every((i) => dash.data(i).status === 'ok');
      const filled = el.children.length > 0 || !['', '—'].includes(el.textContent.trim());
      if (loaded || filled) el.classList.remove('dash-skeleton');
    });
  };

  let queued = false;
  const notify = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      for (const fn of listeners) { try { fn(); } catch (e) { console.error('[dash] render failed', e); } }
      clearSkeletons();
    });
  };

  window.dash = {
    colors: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => 'var(--cds-chart-categorical-' + i + ')'),
    data(id) {
      if (sources[id]) return sources[id];
      if (calcs[id]) return compute(id);
      return state('missing', null, 'No dataset or calc named ' + id);
    },
    calc(id, def) { calcs[id] = { inputs: def.inputs || [], fn: def.fn }; },
    loader() {},
    onData(fn) { listeners.push(fn); fn(); clearSkeletons(); },
    refresh() {},
    params: () => ({ ...params }),
    setParams(p) { params = { ...params, ...p }; notify(); },
    resetParams() { params = { ...DEFAULT_PARAMS }; notify(); },
    setLink(name) { history.replaceState(null, '', '#' + name); },
  };

  // Charts are sized from their container: redraw when the page width changes.
  let lastWidth = 0;
  new ResizeObserver(([e]) => {
    const w = Math.round(e.contentRect.width);
    if (lastWidth && w !== lastWidth) notify();
    lastWidth = w;
  }).observe(document.getElementById('dash-root'));
})();
