// Updated: 2025-09-02 12:05 - Added refresh manifest button with debug controls
(async function () {
  try {
  // Debug flag - set to false for production
  const DEBUG = window.location.search.includes('debug') || window.location.hostname === 'localhost';
  
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const by = (k) => (a, b) => (a[k] > b[k]) ? 1 : (a[k] < b[k]) ? -1 : 0;
  
  // Use URLs directly injected from Zola template
  const manifestUrl = window.MANIFEST_URL || '/master-data/manifest.json';
  const dataBaseUrl = window.DATA_BASE_URL || '/master-data';
  
  if (DEBUG) {
    console.log('🐛 Debug mode enabled');
    console.log('App loaded! Using URLs:', { manifestUrl, dataBaseUrl });
  }

  const cards = $('#cards');
  const stats = $('#stats');
  const q = $('#q');
  const sort = $('#sort');
  const clear = $('#clear');
  const compareBtn = $('#compare');
  const selectToggleBtn = $('#select-toggle');
  const refreshManifestBtn = $('#refresh-manifest');

  // modal elements
  const modal = $('#plot-modal');
  const modalPlot = $('#modal-plot');
  const modalTitle = $('#modal-title');
  const modalFolder = $('#modal-folder');
  const ctrlNorm = $('#ctrl-norm');
  const ctrlDown = $('#ctrl-down');
  
  // Data type toggles
  const showLoss = $('#show-loss');
  const showMse = $('#show-mse');
  const showAccuracy = $('#show-accuracy');
  const showPredComplex = $('#show-pred-complex');
  const showPredPink = $('#show-pred-pink');
  const showSpec = $('#show-spec');

  // --- helpers with conditional timing ---
  const fetchJSON = async (url) => {
    const start = DEBUG ? performance.now() : 0;
    if (DEBUG) console.log('Fetching JSON from:', url);
    const r = await fetch(url);
    const fetchTime = DEBUG ? performance.now() - start : 0;
    if (DEBUG) console.log('Fetch response:', { url, status: r.status, ok: r.ok, fetchTime: `${fetchTime.toFixed(1)}ms` });
    if (!r.ok) throw new Error(`GET ${url} ${r.status} ${r.statusText}`);
    const parseStart = DEBUG ? performance.now() : 0;
    const data = await r.json();
    const parseTime = DEBUG ? performance.now() - parseStart : 0;
    if (DEBUG) console.log('JSON parsed:', { url, parseTime: `${parseTime.toFixed(1)}ms`, totalTime: `${(fetchTime + parseTime).toFixed(1)}ms` });
    return data;
  };
  const fetchCSV = async (url) => {
    const start = DEBUG ? performance.now() : 0;
    const r = await fetch(url);
    if (!r.ok) return null;
    const fetchTime = DEBUG ? performance.now() - start : 0;
    
    const parseStart = DEBUG ? performance.now() : 0;
    const text = await r.text();
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const series = [];
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/[,;\t]/).map(x => x.trim());
      const v = Number(parts[parts.length - 1]);
      if (Number.isFinite(v)) series.push(v);
    }
    const parseTime = DEBUG ? performance.now() - parseStart : 0;
    const totalTime = fetchTime + parseTime;
    
    if (DEBUG && totalTime > 50) { // Only log slow requests in debug mode
      console.log('CSV loaded:', { 
        url, 
        lines: lines.length,
        fetchTime: `${fetchTime.toFixed(1)}ms`, 
        parseTime: `${parseTime.toFixed(1)}ms`,
        totalTime: `${totalTime.toFixed(1)}ms`
      });
    }
    
    return { series, last: series.length ? series[series.length - 1] : null };
  };

  // Dynamic manifest generation
  const generateManifest = async () => {
    if (DEBUG) console.log('🔄 Generating fresh manifest...');
    stats.textContent = 'Scanning for experiments...';
    
    const experiments = [];
    const discoveredExperiments = new Set();
    
    // Try common experiment patterns
    const commonExpPrefixes = [
      'linear_model_baseline_',
      'neural_ode_baseline_', 
      'dmd_baseline_',
      'sindy_discovery_',
      'reservoir_computing_',
      'nonlinear_model_baseline_',
      'reference_nonlinear_model_',
      'symbolic_regression_',
      'test_experiment_'
    ];
    
    // Batch HEAD requests for efficiency
    const checkBatch = async (expIds) => {
      const promises = expIds.map(async (expId) => {
        try {
          const metaUrl = `${dataBaseUrl}/${expId}/meta.json`;
          const response = await fetch(metaUrl, { method: 'HEAD' });
          return response.ok ? expId : null;
        } catch {
          return null;
        }
      });
      
      const results = await Promise.all(promises);
      return results.filter(id => id !== null);
    };
    
    // Check experiments in batches
    for (const prefix of commonExpPrefixes) {
      const batch = [];
      for (let i = 1; i <= 20; i++) {
        batch.push(`${prefix}20250902_${i.toString().padStart(3, '0')}`);
      }
      
      const foundIds = await checkBatch(batch);
      foundIds.forEach(id => discoveredExperiments.add(id));
    }
    
    // Extract data for discovered experiments
    for (const expId of discoveredExperiments) {
      try {
        const metaUrl = `${dataBaseUrl}/${expId}/meta.json`;
        const scalarsUrl = `${dataBaseUrl}/${expId}/scalars.json`;
        
        const meta = await fetchJSON(metaUrl).catch(() => ({}));
        const scalars = await fetchJSON(scalarsUrl).catch(() => ({}));
        
        if (!meta && !scalars) continue; // No valid data
        
        // Determine available files by testing existence
        const fileChecks = [
          { key: 'meta', file: 'meta.json' },
          { key: 'params', file: 'params.json' },
          { key: 'scalars', file: 'scalars.json' },
          { key: 'loss_ts', file: 'loss.csv' },
          { key: 'mse_ts', file: 'mse.csv' },
          { key: 'pred_complex_ts', file: 'pred_complex.csv' },
          { key: 'pred_pink_ts', file: 'pred_pink.csv' },
          { key: 'spec_complex', file: 'spec_complex.csv' },
          { key: 'spec_pink', file: 'spec_pink.csv' }
        ];
        
        const paths = {};
        const pathChecks = fileChecks.map(async ({key, file}) => {
          try {
            const response = await fetch(`${dataBaseUrl}/${expId}/${file}`, { method: 'HEAD' });
            if (response.ok) {
              paths[key] = `${expId}/${file}`;
            }
          } catch (e) {
            // File doesn't exist, skip
          }
        });
        
        await Promise.all(pathChecks);
        
        experiments.push({
          id: expId,
          title: meta.title || expId,
          type: meta.type || 'function_approx',
          paths: paths
        });
        
        if (DEBUG) console.log(`+ ${expId}: Added to manifest`);
      } catch (e) {
        console.warn(`Failed to process ${expId}:`, e);
      }
    }
    
    if (DEBUG) console.log(`✅ Generated manifest with ${experiments.length} experiments`);
    return { experiments, version: 1 };
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

  // Lazy load additional data for an experiment
  const lazyLoadExperimentData = async (expData) => {
    if (!expData._lazyPaths) return;
    
    const lazyStart = DEBUG ? performance.now() : 0;
    if (DEBUG) console.log(`🔄 Lazy loading additional data for ${expData.id}...`);
    
    // Only load data that hasn't been loaded yet
    const toLoad = [];
    if (!expData.pred_complex_series && showPredComplex?.checked) {
      toLoad.push(fetchCSV(expData._lazyPaths.predComplex).then(data => ({ key: 'pred_complex_series', data: data?.series })));
    }
    if (!expData.pred_pink_series && showPredPink?.checked) {
      toLoad.push(fetchCSV(expData._lazyPaths.predPink).then(data => ({ key: 'pred_pink_series', data: data?.series })));
    }
    if (!expData.spec_complex_series && showSpec?.checked) {
      toLoad.push(fetchCSV(expData._lazyPaths.specComplex).then(data => ({ key: 'spec_complex_series', data: data?.series })));
    }
    if (!expData.spec_pink_series && showSpec?.checked) {
      toLoad.push(fetchCSV(expData._lazyPaths.specPink).then(data => ({ key: 'spec_pink_series', data: data?.series })));
    }
    
    if (toLoad.length > 0) {
      const results = await Promise.all(toLoad);
      for (const {key, data} of results) {
        expData[key] = data;
      }
      
      const lazyTime = DEBUG ? performance.now() - lazyStart : 0;
      if (DEBUG) console.log(`💾 Lazy loaded ${toLoad.length} datasets for ${expData.id} in ${lazyTime.toFixed(1)}ms`);
    }
  };

  const openModalSingle = async (expData) => {
    modalTitle.textContent = expData.title;
    modalFolder.href = expData.path + '/';
    modal.setAttribute('aria-hidden', 'false');
    while (modalPlot.firstChild) modalPlot.removeChild(modalPlot.firstChild);
    const container = document.createElement('div');
    container.style.width = '100%'; container.style.height = '100%';
    modalPlot.appendChild(container);
    if (!await waitPlotly()) return;

    // Lazy load additional data if needed
    await lazyLoadExperimentData(expData);

    const traces = [];
    const norm = ctrlNorm?.value || 'none';
    
    // Add different data series based on toggles
    if (showLoss?.checked && expData.loss_series?.length) {
      const y = downsample(normalize(expData.loss_series, norm));
      const x = y.map((_, i) => i);
      traces.push({ x, y, type: 'scatter', mode: 'lines', name: 'Loss', line: { color: '#ff9800' } });
    }
    
    if (showMse?.checked && expData.mse_series?.length) {
      const y = downsample(normalize(expData.mse_series, norm));
      const x = y.map((_, i) => i);
      traces.push({ x, y, type: 'scatter', mode: 'lines', name: 'MSE', line: { color: '#2196f3' } });
    }
    
    if (showAccuracy?.checked && expData.accuracy_series?.length) {
      const y = downsample(normalize(expData.accuracy_series, norm));
      const x = y.map((_, i) => i);
      traces.push({ x, y, type: 'scatter', mode: 'lines', name: 'Accuracy', line: { color: '#4caf50' } });
    }
    
    if (showPredComplex?.checked && expData.pred_complex_series?.length) {
      const y = downsample(normalize(expData.pred_complex_series, norm));
      const x = y.map((_, i) => i);
      traces.push({ x, y, type: 'scatter', mode: 'lines', name: 'Complex Response', line: { color: '#f44336' } });
    }
    
    if (showPredPink?.checked && expData.pred_pink_series?.length) {
      const y = downsample(normalize(expData.pred_pink_series, norm));
      const x = y.map((_, i) => i);
      traces.push({ x, y, type: 'scatter', mode: 'lines', name: 'Pink Noise Response', line: { color: '#9c27b0' } });
    }

    const layout = {
      margin: {l: 50, r: 20, t: 30, b: 40},
      height: 600, 
      xaxis: {title: 'step/time'}, 
      yaxis: {title: (ctrlNorm?.value === 'none') ? 'value' : `value (${ctrlNorm.value})`},
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
    const norm = ctrlNorm?.value || 'none';

    modalTitle.textContent = `Compare (${selected.size}) experiments`;
    modalFolder.href = '#';
    modal.setAttribute('aria-hidden', 'false');

    while (modalPlot.firstChild) modalPlot.removeChild(modalPlot.firstChild);
    const container = document.createElement('div');
    container.style.width = '100%'; container.style.height = '100%';
    modalPlot.appendChild(container);
    if (!await waitPlotly()) return;

    // Lazy load additional data for all selected experiments in parallel
    const selectedRows = Array.from(selected.keys()).map(id => rows.find(x => x.id === id)).filter(Boolean);
    await Promise.all(selectedRows.map(r => lazyLoadExperimentData(r)));

    const traces = [];
    const colors = ['#ff9800', '#2196f3', '#4caf50', '#f44336', '#9c27b0', '#ff5722', '#607d8b', '#795548'];
    let colorIndex = 0;
    
    for (const id of selected.keys()) {
      const r = rows.find(x => x.id === id);
      if (!r) continue;
      
      const baseColor = colors[colorIndex % colors.length];
      const expName = `${r.title} (${r.id})`;
      colorIndex++;
      
      // Add different data series based on toggles
      if (showLoss?.checked && r.loss_series?.length) {
        const y = downsample(normalize(r.loss_series, norm));
        const x = y.map((_, i) => i);
        traces.push({ 
          x, y, type: 'scatter', mode: 'lines', 
          name: `${expName} - Loss`,
          line: { color: baseColor, dash: 'solid' }
        });
      }
      
      if (showMse?.checked && r.mse_series?.length) {
        const y = downsample(normalize(r.mse_series, norm));
        const x = y.map((_, i) => i);
        traces.push({ 
          x, y, type: 'scatter', mode: 'lines', 
          name: `${expName} - MSE`,
          line: { color: baseColor, dash: 'dot' }
        });
      }
      
      if (showAccuracy?.checked && r.accuracy_series?.length) {
        const y = downsample(normalize(r.accuracy_series, norm));
        const x = y.map((_, i) => i);
        traces.push({ 
          x, y, type: 'scatter', mode: 'lines', 
          name: `${expName} - Accuracy`,
          line: { color: baseColor, dash: 'dash' }
        });
      }
      
      if (showPredComplex?.checked && r.pred_complex_series?.length) {
        const y = downsample(normalize(r.pred_complex_series, norm));
        const x = y.map((_, i) => i);
        traces.push({ 
          x, y, type: 'scatter', mode: 'lines', 
          name: `${expName} - Complex Response`,
          line: { color: baseColor, dash: 'dashdot' }
        });
      }
      
      if (showPredPink?.checked && r.pred_pink_series?.length) {
        const y = downsample(normalize(r.pred_pink_series, norm));
        const x = y.map((_, i) => i);
        traces.push({ 
          x, y, type: 'scatter', mode: 'lines', 
          name: `${expName} - Pink Noise Response`,
          line: { color: baseColor, dash: 'longdash' }
        });
      }
    }

    const layout = {
      margin: {l: 50, r: 20, t: 30, b: 40},
      height: 600,
      xaxis: {title: 'step/time'},
      yaxis: {title: (ctrlNorm?.value === 'none') ? 'value' : `value (${ctrlNorm.value})`},
      legend: {orientation: 'v', x: 1.02, y: 1},
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
  
  // Add event listeners for all controls
  ctrlNorm?.addEventListener('change', rerenderIfCompare);
  ctrlDown?.addEventListener('change', rerenderIfCompare);
  showLoss?.addEventListener('change', rerenderIfCompare);
  showMse?.addEventListener('change', rerenderIfCompare);
  showAccuracy?.addEventListener('change', rerenderIfCompare);
  showPredComplex?.addEventListener('change', rerenderIfCompare);
  showPredPink?.addEventListener('change', rerenderIfCompare);
  showSpec?.addEventListener('change', rerenderIfCompare);

  // --- load manifest or generate dynamically ---
  const loadStart = DEBUG ? performance.now() : 0;
  if (DEBUG) console.log('Loading manifest...');
  stats.textContent = 'Loading manifest...';
  let manifest;
  let useGeneratedManifest = false;
  
  try {
    manifest = await fetchJSON(manifestUrl);
    if (DEBUG) console.log('✅ Loaded manifest with', manifest?.experiments?.length || 0, 'experiments');
  } catch (e) {
    if (DEBUG) console.log('No manifest found, generating dynamically...');
    useGeneratedManifest = true;
    manifest = await generateManifest();
    if (DEBUG) console.log('✅ Generated manifest with', manifest?.experiments?.length || 0, 'experiments');
  }
  
  const manifestTime = DEBUG ? performance.now() - loadStart : 0;
  if (DEBUG) console.log(`⏱️ Manifest loading took: ${manifestTime.toFixed(1)}ms`);
  
  let expList = Array.isArray(manifest) ? manifest : 
               Array.isArray(manifest.experiments) ? manifest.experiments : [];

  // Deduplicate experiments (same ID can appear multiple times in manifest)
  const expMap = new Map();
  for (const exp of expList) {
    if (!expMap.has(exp.id)) {
      expMap.set(exp.id, exp);
    } else {
      // Merge paths if experiment appears multiple times
      const existing = expMap.get(exp.id);
      existing.paths = { ...existing.paths, ...exp.paths };
    }
  }
  expList = Array.from(expMap.values());
  
  if (DEBUG) console.log(`📋 Deduplicated to ${expList.length} unique experiments`);

  // --- hydrate experiments ---
  const hydrateStart = DEBUG ? performance.now() : 0;
  stats.textContent = 'Loading experiments…';
  const rows = [];
  
  if (DEBUG) console.log(`🔄 Starting hydration of ${expList.length} experiments`);
  
  for (let i = 0; i < expList.length; i++) {
    const e = expList[i];
    const expStart = DEBUG ? performance.now() : 0;
    
    try {
      if (DEBUG) stats.textContent = `Loading experiments… (${i+1}/${expList.length})`;
      
      // Handle both old and new manifest formats
      let metaUrl, scalarsUrl, paramsUrl, lossUrl, mseUrl;
      
      if (e.paths) {
        // New format with explicit paths
        metaUrl = `${dataBaseUrl}/${e.paths.meta}`;
        scalarsUrl = `${dataBaseUrl}/${e.paths.scalars}`;
        paramsUrl = `${dataBaseUrl}/${e.paths.params}`;
        lossUrl = `${dataBaseUrl}/${e.paths.loss_ts}`;
        mseUrl = `${dataBaseUrl}/${e.paths.mse_ts}`;
      } else {
        // Old format - construct paths
        metaUrl = `${dataBaseUrl}/${e.id}/meta.json`;
        scalarsUrl = `${dataBaseUrl}/${e.id}/scalars.json`;
        paramsUrl = `${dataBaseUrl}/${e.id}/params.json`;
        lossUrl = `${dataBaseUrl}/${e.id}/loss.csv`;
        mseUrl = `${dataBaseUrl}/${e.id}/mse.csv`;
      }
      
      const fetchStart = DEBUG ? performance.now() : 0;
      
      // Load only essential data for initial display (JSON files + basic timeseries)
      const [meta, scalars, params, loss, mse] = await Promise.all([
        fetchJSON(metaUrl).catch(()=> ({})),
        fetchJSON(scalarsUrl).catch(()=> ({})),
        fetchJSON(paramsUrl).catch(()=> ({})),
        fetchCSV(lossUrl),
        fetchCSV(mseUrl)
      ]);
      
      const coreTime = DEBUG ? performance.now() - fetchStart : 0;
      
      // Don't load large CSV files initially - lazy load them when needed for plotting
      // This saves significant time since pred_* and spec_* files are much larger
      
      // Extract accuracy timeseries (we'll need to create this from max_accuracy if it's not a series)
      const accuracy = scalars.accuracy_series || (scalars.max_accuracy ? [scalars.max_accuracy] : null);

      const title = e.title || meta.title || e.id;
      const tags  = e.tags || meta.tags || [];
      const date  = meta.date || scalars.date || null;
      const tstamp = date ? Date.parse(date) : null;

      rows.push({
        id: e.id, 
        path: `${dataBaseUrl}/${e.id}`, // Construct folder path
        title, tags, date,
        tstamp: Number.isFinite(tstamp) ? tstamp : 0,
        loss_last: loss?.last ?? null, 
        mse_last: mse?.last ?? null,
        loss_series: loss?.series ?? null, 
        mse_series: mse?.series ?? null,
        accuracy_series: accuracy,
        // Lazy-loaded properties (loaded on demand)
        pred_complex_series: null,
        pred_pink_series: null,
        spec_complex_series: null,
        spec_pink_series: null,
        meta, scalars, params,
        // Store paths for lazy loading
        _lazyPaths: {
          predComplex: `${dataBaseUrl}/${e.id}/pred_complex.csv`,
          predPink: `${dataBaseUrl}/${e.id}/pred_pink.csv`,
          specComplex: `${dataBaseUrl}/${e.id}/spec_complex.csv`,
          specPink: `${dataBaseUrl}/${e.id}/spec_pink.csv`
        }
      });
      
      const expTime = DEBUG ? performance.now() - expStart : 0;
      if (DEBUG) {
        console.log(`✅ Loaded experiment ${i+1}/${expList.length}: ${e.id} (${title}) - ${expTime.toFixed(1)}ms (core data only)`);
      }
    } catch (err) {
      if (DEBUG) console.warn('Failed to load experiment', e, err);
    }
  }
  
  const hydrateTime = DEBUG ? performance.now() - hydrateStart : 0;
  if (DEBUG) {
    console.log(`⏱️ Total hydration took: ${hydrateTime.toFixed(1)}ms for ${rows.length} experiments`);
    console.log(`📊 Performance Summary:`);
    console.log(`  - Manifest load: ${manifestTime.toFixed(1)}ms`);
    console.log(`  - Experiment hydration: ${hydrateTime.toFixed(1)}ms`);
    console.log(`  - Average per experiment: ${(hydrateTime/rows.length).toFixed(1)}ms`);
    
    // Show debug info in the UI
    if (DEBUG && rows.length > 0) {
      const debugInfo = document.createElement('div');
      debugInfo.style.cssText = 'position:fixed;top:10px;right:10px;background:#333;color:#fff;padding:10px;border-radius:5px;font-size:12px;z-index:1000;';
      debugInfo.innerHTML = `
        <strong>🐛 Debug Info</strong><br>
        Manifest: ${manifestTime.toFixed(1)}ms<br>
        Hydration: ${hydrateTime.toFixed(1)}ms<br>
        Avg/exp: ${(hydrateTime/rows.length).toFixed(1)}ms<br>
        <small>Add ?debug to URL</small>
      `;
      document.body.appendChild(debugInfo);
      setTimeout(() => debugInfo.remove(), 10000); // Auto-remove after 10s
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
      openPlot.addEventListener('click', () => openModalSingle(r));
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
  
  // Refresh Manifest button - regenerates the experiment list
  refreshManifestBtn?.addEventListener('click', async () => {
    if (DEBUG) console.log('🔄 Refresh manifest requested');
    const refreshStart = DEBUG ? performance.now() : 0;
    stats.textContent = 'Regenerating manifest...';
    
    try {
      // Generate fresh manifest
      const newManifest = await generateManifest();
      
      // Clear current data
      rows.length = 0;
      selected.clear();
      
      // Reload with new experiments
      const newExpList = newManifest.experiments || [];
      stats.textContent = 'Loading fresh experiment data...';
      
      if (DEBUG) console.log(`🔄 Rehydrating ${newExpList.length} experiments after refresh`);
      
      for (let i = 0; i < newExpList.length; i++) {
        const e = newExpList[i];
        try {
          if (DEBUG) stats.textContent = `Loading fresh data… (${i+1}/${newExpList.length})`;
          
          // Handle both old and new manifest formats
          let metaUrl, scalarsUrl, paramsUrl, lossUrl, mseUrl;
          
          if (e.paths) {
            // New format with explicit paths
            metaUrl = `${dataBaseUrl}/${e.paths.meta}`;
            scalarsUrl = `${dataBaseUrl}/${e.paths.scalars}`;
            paramsUrl = `${dataBaseUrl}/${e.paths.params}`;
            lossUrl = `${dataBaseUrl}/${e.paths.loss_ts}`;
            mseUrl = `${dataBaseUrl}/${e.paths.mse_ts}`;
          } else {
            // Old format - construct paths
            metaUrl = `${dataBaseUrl}/${e.id}/meta.json`;
            scalarsUrl = `${dataBaseUrl}/${e.id}/scalars.json`;
            paramsUrl = `${dataBaseUrl}/${e.id}/params.json`;
            lossUrl = `${dataBaseUrl}/${e.id}/loss.csv`;
            mseUrl = `${dataBaseUrl}/${e.id}/mse.csv`;
          }
          
          // Load core data in parallel
          const [meta, scalars, params, loss, mse] = await Promise.all([
            fetchJSON(metaUrl).catch(()=> ({})),
            fetchJSON(scalarsUrl).catch(()=> ({})),
            fetchJSON(paramsUrl).catch(()=> ({})),
            fetchCSV(lossUrl),
            fetchCSV(mseUrl)
          ]);
          
          // Load additional data types in parallel
          const [predComplex, predPink, specComplex, specPink] = await Promise.all([
            fetchCSV(`${dataBaseUrl}/${e.id}/pred_complex.csv`),
            fetchCSV(`${dataBaseUrl}/${e.id}/pred_pink.csv`),
            fetchCSV(`${dataBaseUrl}/${e.id}/spec_complex.csv`),
            fetchCSV(`${dataBaseUrl}/${e.id}/spec_pink.csv`)
          ]);
          
          // Extract accuracy timeseries
          const accuracy = scalars.accuracy_series || (scalars.max_accuracy ? [scalars.max_accuracy] : null);

          const title = e.title || meta.title || e.id;
          const tags  = e.tags || meta.tags || [];
          const date  = meta.date || scalars.date || null;
          const tstamp = date ? Date.parse(date) : null;

          rows.push({
            id: e.id, 
            path: `${dataBaseUrl}/${e.id}`,
            title, tags, date,
            tstamp: Number.isFinite(tstamp) ? tstamp : 0,
            loss_last: loss?.last ?? null, 
            mse_last: mse?.last ?? null,
            loss_series: loss?.series ?? null, 
            mse_series: mse?.series ?? null,
            accuracy_series: accuracy,
            pred_complex_series: predComplex?.series ?? null,
            pred_pink_series: predPink?.series ?? null,
            spec_complex_series: specComplex?.series ?? null,
            spec_pink_series: specPink?.series ?? null,
            meta, scalars, params
          });
          
        } catch (err) {
          if (DEBUG) console.warn('Failed to load experiment', e, err);
        }
      }
      
      render();
      const refreshTime = DEBUG ? performance.now() - refreshStart : 0;
      if (DEBUG) console.log(`⏱️ Full refresh took: ${refreshTime.toFixed(1)}ms`);
      stats.textContent = `✅ Refreshed! Found ${rows.length} experiments`;
      
    } catch (error) {
      stats.textContent = `Refresh failed: ${error.message}`;
      console.error('Refresh error:', error);
    }
  });
  
  q?.addEventListener('input', render);
  sort?.addEventListener('change', render);
  clear?.addEventListener('click', ()=> { if(q) q.value=''; render(); });

  render();
  
  } catch (error) {
    console.error('App initialization error:', error);
    const stats = document.getElementById('stats');
    if (stats) stats.textContent = `App error: ${error.message}`;
  }
})();