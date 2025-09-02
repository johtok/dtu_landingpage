// Updated: 2025-09-02 11:40 - Added Select All/None buttons
(async function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const by = (k) => (a, b) => (a[k] > b[k]) ? 1 : (a[k] < b[k]) ? -1 : 0;
  
  // Use URLs directly injected from Zola template
  const manifestUrl = window.MANIFEST_URL || '/master-data/manifest.json';
  const dataBaseUrl = window.DATA_BASE_URL || '/master-data';
  console.log('App loaded! Using URLs:', { manifestUrl, dataBaseUrl });

  const cards = $('#cards');
  const stats = $('#stats');
  const q = $('#q');
  const sort = $('#sort');
  const clear = $('#clear');
  const compareBtn = $('#compare');
  const selectToggleBtn = $('#select-toggle');

  // modal elements
  const modal = $('#plot-modal');
  const modalPlot = $('#modal-plot');
  const modalTitle = $('#modal-title');
  const modalFolder = $('#modal-folder');
  const ctrlMetric = $('#ctrl-metric');
  const ctrlNorm = $('#ctrl-norm');
  const ctrlDown = $('#ctrl-down');

  // --- helpers ---
  const fetchJSON = async (url) => {
    console.log('Fetching JSON from:', url);
    const r = await fetch(url);
    console.log('Fetch response:', { url, status: r.status, ok: r.ok });
    if (!r.ok) throw new Error(`GET ${url} ${r.status} ${r.statusText}`);
    const data = await r.json();
    console.log('JSON data received:', data);
    return data;
  };
  const fetchCSV = async (url) => {
    const r = await fetch(url);
    if (!r.ok) return null;
    const text = await r.text();
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const series = [];
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/[,;\t]/).map(x => x.trim());
      const v = Number(parts[parts.length - 1]);
      if (Number.isFinite(v)) series.push(v);
    }
    return { series, last: series.length ? series[series.length - 1] : null };
  };

  const waitPlotly = async () => {
    const until = Date.now() + 5000;
    while (!window.Plotly) {
      if (Date.now() > until) return false;
      await new Promise(r => setTimeout(r, 25));
    }
    return true;
  };

  const drawMini = async (el, y, label) => {
    if (!await waitPlotly()) return;
    const x = y.map((_, i) => i);
    const data = [{ x, y, type: 'scatter', mode: 'lines', name: label }];
    const layout = {
      margin: {l: 20, r: 10, t: 8, b: 20},
      height: 120, showlegend: false,
      xaxis: {visible: false}, yaxis: {visible: false},
    };
    const cfg = {displayModeBar: false, staticPlot: true, responsive: true};
    await Plotly.newPlot(el, data, layout, cfg);
  };

  const openModalSingle = async (title, path, lossSeries, mseSeries) => {
    modalTitle.textContent = title;
    modalFolder.href = path + '/';
    modal.setAttribute('aria-hidden', 'false');
    while (modalPlot.firstChild) modalPlot.removeChild(modalPlot.firstChild);
    const container = document.createElement('div');
    container.style.width = '100%'; container.style.height = '100%';
    modalPlot.appendChild(container);
    if (!await waitPlotly()) return;

    const traces = [];
    if (lossSeries?.length) traces.push({ x: lossSeries.map((_, i) => i), y: lossSeries, type: 'scatter', mode: 'lines', name: 'loss' });
    if (mseSeries?.length)  traces.push({ x: mseSeries.map((_, i) => i), y: mseSeries,  type: 'scatter', mode: 'lines', name: 'mse'  });
    const layout = {
      margin: {l: 50, r: 20, t: 30, b: 40},
      height: 460, xaxis: {title: 'step'}, yaxis: {title: 'value'},
      legend: {orientation: 'h', x: 0, y: 1.1},
    };
    const cfg = {displayModeBar: true, responsive: true};
    await Plotly.newPlot(container, traces, layout, cfg);
  };

  // NEW: comparison helpers
  const normalize = (arr, mode) => {
    if (!arr?.length) return arr;
    if (mode === 'none') return arr;
    if (mode === 'minmax') {
      const min = Math.min(...arr), max = Math.max(...arr);
      if (max === min) return arr.map(() => 0);
      return arr.map(v => (v - min)/(max - min));
    }
    if (mode === 'zscore') {
      const mu = arr.reduce((a,b)=>a+b,0)/arr.length;
      const sd = Math.sqrt(arr.reduce((a,b)=>a+(b-mu)*(b-mu),0)/arr.length) || 1;
      return arr.map(v => (v - mu)/sd);
    }
    return arr;
  };

  const downsample = (arr, target = 1000) => {
    if (!arr?.length) return arr;
    if (ctrlDown?.value === 'none') return arr;
    const maxPts = target; // cap points for speed
    if (arr.length <= maxPts) return arr;
    const stride = Math.ceil(arr.length / maxPts);
    const out = [];
    for (let i = 0; i < arr.length; i += stride) out.push(arr[i]);
    return out;
  };

  const openModalCompare = async (selected, rows) => {
    const metric = ctrlMetric?.value || 'loss';
    const norm = ctrlNorm?.value || 'none';

    modalTitle.textContent = `Compare (${selected.size}) — ${metric}`;
    modalFolder.href = '#';
    modal.setAttribute('aria-hidden', 'false');

    while (modalPlot.firstChild) modalPlot.removeChild(modalPlot.firstChild);
    const container = document.createElement('div');
    container.style.width = '100%'; container.style.height = '100%';
    modalPlot.appendChild(container);
    if (!await waitPlotly()) return;

    const traces = [];
    for (const id of selected.keys()) {
      const r = rows.find(x => x.id === id);
      if (!r) continue;
      const raw = (metric === 'loss') ? r.loss_series : r.mse_series;
      if (!raw?.length) continue;
      const y = downsample(normalize(raw, norm));
      const x = y.map((_, i) => i);
      traces.push({ x, y, type: 'scatter', mode: 'lines', name: `${r.title} (${r.id})` });
    }

    const layout = {
      margin: {l: 50, r: 20, t: 30, b: 40},
      height: 460,
      xaxis: {title: 'step'},
      yaxis: {title: (ctrlNorm?.value === 'none') ? 'value' : `value (${ctrlNorm.value})`},
      legend: {orientation: 'h', x: 0, y: 1.1},
    };
    const cfg = {displayModeBar: true, responsive: true};
    await Plotly.newPlot(container, traces, layout, cfg);
  };

  // close modal
  modal?.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close')) {
      modal.setAttribute('aria-hidden', 'true');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') modal.setAttribute('aria-hidden', 'true');
  });
  // re-render comparison if controls change and comparison is open
  const rerenderIfCompare = () => {
    if (modal.getAttribute('aria-hidden') === 'false' && modalTitle.textContent.startsWith('Compare')) {
      openModalCompare(selected, rows);
    }
  };
  ctrlMetric?.addEventListener('change', rerenderIfCompare);
  ctrlNorm?.addEventListener('change', rerenderIfCompare);
  ctrlDown?.addEventListener('change', rerenderIfCompare);

  // --- auto-generate manifest by scanning directory ---
  console.log('Auto-generating manifest by scanning directory...');
  let expList = [];
  
  try {
    // Try to load existing manifest first to get experiment list
    let existingManifest;
    try {
      existingManifest = await fetchJSON(manifestUrl);
      console.log('Loaded existing manifest with', existingManifest?.experiments?.length || 0, 'experiments');
    } catch (e) {
      console.log('No existing manifest found, scanning for experiments...');
      existingManifest = null;
    }
    
    // Current experiments based on actual folder structure
    const potentialExperiments = [
      'dmd_baseline_20250902_002',
      'linear_model_baseline_20250902_002',
      'neural_ode_baseline_20250902_002',
      'reservoir_computing_20250902_002',
      'sindy_discovery_20250902_001',
      'symbolic_regression_20250902_002'
    ];
    
    // Scan for valid experiments
    for (const expId of potentialExperiments) {
      try {
        // Try to fetch meta.json to verify experiment exists
        const meta = await fetchJSON(`${dataBaseUrl}/${expId}/meta.json`);
        
        // Generate readable titles
        const titleMap = {
          'dmd_baseline_20250902_002': 'Dynamic Mode Decomposition',
          'linear_model_baseline_20250902_002': 'Linear Model Baseline',
          'neural_ode_baseline_20250902_002': 'Neural ODE Baseline',
          'reservoir_computing_20250902_002': 'Reservoir Computing',
          'sindy_discovery_20250902_001': 'SINDy Discovery',
          'symbolic_regression_20250902_002': 'Symbolic Regression'
        };
        
        const title = titleMap[expId] || expId.replace(/_20250902_\d+$/, '').replace(/_/g, ' ');
        
        // Determine type
        const type = title.toLowerCase().includes('baseline') || title.toLowerCase().includes('linear') 
          ? 'parameter_approx' : 'function_approx';
        
        expList.push({
          id: expId,
          title: title,
          type: type,
          paths: {
            meta: `${expId}/meta.json`,
            scalars: `${expId}/scalars.json`,
            params: `${expId}/params.json`,
            mse_ts: `${expId}/mse.csv`,
            loss_ts: `${expId}/loss.csv`
          }
        });
        
        console.log('✓ Found experiment:', expId, '→', title);
      } catch (e) {
        // Experiment doesn't exist, skip silently
        console.log('✗ Skipped missing experiment:', expId);
      }
    }
    
    console.log(`✅ Auto-generated manifest with ${expList.length} experiments`);
    
  } catch (e) {
    stats.textContent = `Failed to scan experiments: ${e.message}`;
    console.error('Manifest generation error:', e);
    return;
  }

  // Experiments are already in the correct format from auto-generation

  // --- hydrate experiments ---
  stats.textContent = 'Loading experiments…';
  const rows = [];
  for (const e of expList) {
    try {
      // Use paths from the auto-generated structure
      const metaUrl = `${dataBaseUrl}/${e.paths.meta}`;
      const scalarsUrl = `${dataBaseUrl}/${e.paths.scalars}`;
      const paramsUrl = `${dataBaseUrl}/${e.paths.params}`;
      const lossUrl = `${dataBaseUrl}/${e.paths.loss_ts}`;
      const mseUrl = `${dataBaseUrl}/${e.paths.mse_ts}`;
      
      const meta = await fetchJSON(metaUrl).catch(()=> ({}));
      const scalars = await fetchJSON(scalarsUrl).catch(()=> ({}));
      const params = await fetchJSON(paramsUrl).catch(()=> ({}));
      const loss = await fetchCSV(lossUrl);
      const mse  = await fetchCSV(mseUrl);

      const title = e.title || meta.title || e.id;
      const tags  = e.tags || meta.tags || [];
      const date  = meta.date || scalars.date || null;
      const tstamp = date ? Date.parse(date) : null;

      rows.push({
        id: e.id, 
        path: `${dataBaseUrl}/${e.id}`, // Construct folder path
        title, tags, date,
        tstamp: Number.isFinite(tstamp) ? tstamp : 0,
        loss_last: loss?.last ?? null, mse_last: mse?.last ?? null,
        loss_series: loss?.series ?? null, mse_series: mse?.series ?? null,
        meta, scalars, params
      });
    } catch (err) {
      console.warn('Failed to load experiment', e, err);
    }
  }

  // selection state
  const selected = new Map(); // id -> true
  
  const updateSelectToggleButton = () => {
    if (!selectToggleBtn) return;
    const visibleCards = $$('.card input[type="checkbox"]');
    const checkedCount = visibleCards.filter(cb => cb.checked).length;
    const allSelected = checkedCount === visibleCards.length && visibleCards.length > 0;
    
    selectToggleBtn.textContent = allSelected ? 'Select None' : 'Select All';
  };
  
  const setSelected = (id, on) => {
    if (on) selected.set(id, true); else selected.delete(id);
    const n = selected.size;
    compareBtn.disabled = n < 2;
    compareBtn.textContent = `Compare (${n})`;
    
    // Update toggle button text when selection changes
    updateSelectToggleButton();
  };

  compareBtn?.addEventListener('click', () => openModalCompare(selected, rows));

  // --- render ---
  const render = () => {
    const qv = (q?.value || '').trim().toLowerCase();
    let data = rows.slice();

    if (qv) {
      data = data.filter(r =>
        r.title.toLowerCase().includes(qv) ||
        (r.tags || []).join(' ').toLowerCase().includes(qv) ||
        (r.id || '').toLowerCase().includes(qv)
      );
    }

    const sortBy = sort?.value || 'recent';
    if (sortBy === 'recent') data.sort((a,b)=> b.tstamp - a.tstamp);
    else if (sortBy === 'alpha') data.sort(by('title'));
    else if (sortBy === 'loss') data.sort((a,b)=> (a.loss_last ?? Infinity) - (b.loss_last ?? Infinity));
    else if (sortBy === 'mse') data.sort((a,b)=> (a.mse_last ?? Infinity) - (b.mse_last ?? Infinity));

    cards.innerHTML = '';
    for (const r of data) {
      const li = document.createElement('li');
      li.className = 'card';
      li.dataset.expId = r.id; // Add experiment ID for selection functions

      const top = document.createElement('div');
      top.className = 'card-top';
      // NEW: selection checkbox
      const left = document.createElement('div');
      left.className = 'card-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.ariaLabel = `Select ${r.title} for comparison`;
      cb.checked = selected.has(r.id);
      cb.addEventListener('change', (e)=> setSelected(r.id, e.target.checked));
      const title = document.createElement('strong');
      title.textContent = r.title;
      left.appendChild(cb); left.appendChild(title);

      const badge = document.createElement('span');
      badge.className = 'badge'; badge.textContent = r.id;

      top.appendChild(left); top.appendChild(badge);
      li.appendChild(top);

      const meta = document.createElement('dl');
      meta.className = 'meta';
      meta.innerHTML = `
        <dt>Date</dt><dd>${r.date || '—'}</dd>
        <dt>Loss</dt><dd>${r.loss_last ?? '—'}</dd>
        <dt>MSE</dt><dd>${r.mse_last ?? '—'}</dd>
      `;
      li.appendChild(meta);

      const tags = document.createElement('div');
      tags.className = 'tags';
      (r.tags || []).forEach(t => {
        const span = document.createElement('span'); span.className='tag'; span.textContent=t; tags.appendChild(span);
      });
      li.appendChild(tags);

      // Mini plot (prefer loss, fallback to mse)
      const miniDiv = document.createElement('div');
      miniDiv.className = 'plot-mini';
      li.appendChild(miniDiv);
      const miniSeries = r.loss_series?.length ? r.loss_series : r.mse_series;
      if (miniSeries?.length) {
        drawMini(miniDiv, downsample(miniSeries, 600), r.loss_series?.length ? 'loss' : 'mse');
      } else {
        miniDiv.textContent = 'No timeseries';
      }

      const footer = document.createElement('div');
      footer.className = 'footerline';
      const link = document.createElement('a');
      link.href = r.path + '/'; link.target = '_blank'; link.rel = 'noopener';
      link.textContent = 'Open folder';
      const openPlot = document.createElement('span');
      openPlot.className = 'link'; openPlot.textContent = 'Open plot';
      openPlot.addEventListener('click', () =>
        openModalSingle(r.title, r.path, r.loss_series, r.mse_series)
      );
      footer.appendChild(link);
      footer.appendChild(document.createTextNode('•'));
      footer.appendChild(openPlot);
      li.appendChild(footer);

      cards.appendChild(li);
    }

    stats.textContent = `${data.length} shown / ${rows.length} total`;
    
    // Update the select toggle button text
    updateSelectToggleButton();
  };

  // Toggle selection function
  const toggleSelection = () => {
    const visibleCards = $$('.card input[type="checkbox"]');
    const checkedCount = visibleCards.filter(cb => cb.checked).length;
    const allSelected = checkedCount === visibleCards.length && visibleCards.length > 0;
    
    visibleCards.forEach(cb => {
      const shouldCheck = !allSelected;
      cb.checked = shouldCheck;
      setSelected(cb.closest('.card').dataset.expId, shouldCheck);
    });
  };

  selectToggleBtn?.addEventListener('click', toggleSelection);
  
  q?.addEventListener('input', render);
  sort?.addEventListener('change', render);
  clear?.addEventListener('click', ()=> { if(q) q.value=''; render(); });

  render();
})();

