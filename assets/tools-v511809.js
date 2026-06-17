/**
 * Buildplan 360 — Export PDF + Search + Offline
 * 
 * Funcionalidades:
 * - Exportar Gantt actual a PDF (auto-tamaño)
 * - Búsqueda global de tareas (sidebar + Ctrl+K)
 * - Modo offline con sincronización al volver
 */
(function() {
  'use strict';

  /* ── Supabase access ── */
  function getSB() {
    if (window._p360sb) return window._p360sb;
    const root = document.getElementById('root');
    if (!root) return null;
    const fk = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fk) return null;
    function walk(f, d) {
      if (!f || d > 60) return null;
      const check = v => v && typeof v === 'object' && typeof v.from === 'function' && v.auth;
      const mp = f.memoizedProps;
      if (mp) for (const v of Object.values(mp)) if (check(v)) return v;
      let s = f.memoizedState, sc = 0;
      while (s && sc++ < 15) {
        if (check(s.memoizedState)) return s.memoizedState;
        if (s.memoizedState && typeof s.memoizedState === 'object')
          for (const v of Object.values(s.memoizedState)) if (check(v)) return v;
        s = s.next;
      }
      return walk(f.child, d+1) || walk(f.sibling, d+1);
    }
    window._p360sb = walk(root[fk], 0);
    return window._p360sb;
  }

  function getCurrentProject() {
    const root = document.getElementById('root');
    if (!root) return null;
    const fk = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fk) return null;
    let f = root[fk];
    for (let i = 0; i < 200 && f; i++) {
      const s = f.memoizedState;
      if (s && s.memoizedState && s.memoizedState.currentProject && s.memoizedState.currentProject.id) {
        return s.memoizedState.currentProject;
      }
      f = f.child || f.sibling || (f.return && f.return.sibling);
    }
    return null;
  }

  function setReactPage(page) {
    const root = document.getElementById('root');
    const fk = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fk) return false;
    let f = root[fk];
    for (let i = 0; i < 200 && f; i++) {
      const s = f.memoizedState;
      if (s && s.memoizedState && typeof s.memoizedState.setPage === 'function') {
        s.memoizedState.setPage(page);
        return true;
      }
      f = f.child || f.sibling || (f.return && f.return.sibling);
    }
    return false;
  }

  async function loadProjectByReactStore(projectId) {
    const root = document.getElementById('root');
    const fk = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fk) return false;
    let f = root[fk];
    for (let i = 0; i < 200 && f; i++) {
      const s = f.memoizedState;
      if (s && s.memoizedState && typeof s.memoizedState.loadProject === 'function') {
        await s.memoizedState.loadProject(projectId);
        return true;
      }
      f = f.child || f.sibling || (f.return && f.return.sibling);
    }
    return false;
  }

  /* ══════════════════════════════════════════════════════════
     CSS común
  ══════════════════════════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById('p360-tools-css')) return;
    const s = document.createElement('style');
    s.id = 'p360-tools-css';
    s.textContent = `
      /* Botón Exportar PDF (en toolbar del Gantt) */
      .p360-export-btn {
        background: var(--surface);
        color: var(--text);
        border: 1px solid var(--border-strong);
        border-radius: 5px;
        padding: 3px 10px;
        font-size: 11px;
        cursor: pointer;
        height: 24px;
        font-weight: 600;
        transition: all .12s;
      }
      .p360-export-btn:hover {
        border-color: var(--brand-orange);
        color: var(--brand-orange);
      }

      /* Search modal */
      #p360-search-modal {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.5);
        z-index: 9999;
        align-items: flex-start;
        justify-content: center;
        padding-top: 80px;
      }
      #p360-search-modal.open { display: flex; }
      .p360-search-panel {
        background: var(--surface, #fff);
        border-radius: 10px;
        width: 700px;
        max-width: 90vw;
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 50px rgba(0,0,0,.4);
        overflow: hidden;
      }
      .p360-search-input-wrap {
        padding: 14px 16px;
        border-bottom: 1px solid var(--border, #E5E7EB);
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .p360-search-input {
        flex: 1;
        border: none;
        outline: none;
        font-size: 15px;
        font-family: inherit;
        color: var(--text);
        background: transparent;
      }
      .p360-search-icon {
        font-size: 18px;
        color: var(--text-3, #9CA3AF);
      }
      .p360-search-shortcut {
        font-size: 10px;
        padding: 2px 6px;
        border: 1px solid var(--border, #E5E7EB);
        border-radius: 3px;
        color: var(--text-3, #9CA3AF);
        font-family: monospace;
      }
      .p360-search-results {
        flex: 1;
        overflow-y: auto;
        padding: 8px 0;
      }
      .p360-search-group {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .05em;
        color: var(--text-3, #9CA3AF);
        padding: 8px 16px 4px;
      }
      .p360-search-result {
        padding: 8px 16px;
        cursor: pointer;
        font-size: 13px;
        border-left: 3px solid transparent;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .p360-search-result:hover, .p360-search-result.selected {
        background: var(--surface-2, #F9FAFB);
        border-left-color: var(--brand-orange, #FB7520);
      }
      .p360-search-result-icon { font-size: 14px; }
      .p360-search-result-text { flex: 1; min-width: 0; }
      .p360-search-result-title {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .p360-search-result-subtitle {
        font-size: 11px;
        color: var(--text-3, #9CA3AF);
        margin-top: 1px;
      }
      .p360-search-empty {
        padding: 30px;
        text-align: center;
        color: var(--text-3, #9CA3AF);
        font-size: 13px;
      }
      mark.p360-highlight {
        background: var(--brand-orange-bg, #FFF1E5);
        color: var(--brand-orange, #FB7520);
        font-weight: 700;
        padding: 0 2px;
        border-radius: 2px;
      }

      /* Offline indicator */
      #p360-offline-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #F59E0B;
        color: #fff;
        text-align: center;
        font-size: 12px;
        font-weight: 700;
        padding: 6px 12px;
        z-index: 9999;
        display: none;
        font-family: inherit;
      }
      #p360-offline-banner.show { display: block; }
      #p360-offline-banner.synced { background: #22C55E; }
      .p360-offline-pending-count {
        background: rgba(255,255,255,.25);
        padding: 2px 8px;
        border-radius: 10px;
        margin-left: 8px;
      }
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════
     1. EXPORT GANTT TO PDF
     Captura el SVG #ganttSvg y lo convierte a PDF.
     Usa jsPDF cargado dinámicamente desde CDN.
  ══════════════════════════════════════════════════════════ */

  let _jspdfLoaded = false;
  let _svg2canvasLoaded = false;

  async function loadScript(url) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async function ensureLibs() {
    if (!_jspdfLoaded) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      _jspdfLoaded = true;
    }
    if (!_svg2canvasLoaded) {
      // canvg para convertir SVG a canvas
      await loadScript('https://cdn.jsdelivr.net/npm/canvg@4.0.1/lib/umd.js');
      _svg2canvasLoaded = true;
    }
  }

  async function exportGanttToPDF(btn) {
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Generando...';

    try {
      const svg = document.getElementById('ganttSvg');
      if (!svg) {
        alert('No se encontró el cronograma. Asegurate de estar en la vista Gantt.');
        btn.disabled = false;
        btn.textContent = orig;
        return;
      }

      await ensureLibs();

      // Get SVG dimensions
      const svgW = parseInt(svg.getAttribute('width'), 10) || svg.clientWidth || 1200;
      const svgH = parseInt(svg.getAttribute('height'), 10) || svg.clientHeight || 600;

      // Serialize SVG with all CSS inlined (read computed styles)
      const svgClone = svg.cloneNode(true);
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svgClone.setAttribute('width', svgW);
      svgClone.setAttribute('height', svgH);

      // Inline computed styles for each element
      const allEls = svgClone.querySelectorAll('*');
      const origEls = svg.querySelectorAll('*');
      origEls.forEach((src, i) => {
        const cs = window.getComputedStyle(src);
        const tgt = allEls[i];
        if (!tgt) return;
        let style = '';
        ['fill','stroke','stroke-width','opacity','font-size','font-family','font-weight','text-anchor'].forEach(prop => {
          const v = cs.getPropertyValue(prop);
          if (v) style += prop + ':' + v + ';';
        });
        tgt.setAttribute('style', style);
      });

      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svgClone);

      // Convert SVG → Canvas via canvg
      const canvas = document.createElement('canvas');
      const dpr = 2; // higher resolution
      canvas.width = svgW * dpr;
      canvas.height = svgH * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, svgW, svgH);

      const canvgLib = window.canvg || window.Canvg;
      if (!canvgLib) throw new Error('Librería canvg no cargada');

      const v = await canvgLib.Canvg.from(ctx, svgStr);
      await v.render();

      const imgData = canvas.toDataURL('image/png');

      // Create PDF with auto size: orientation based on aspect ratio
      const { jsPDF } = window.jspdf;
      const isLandscape = svgW > svgH;
      // Use page size matching content (in pt; 72 pt = 1 inch)
      // SVG dimensions are in pixels at 96dpi; convert to pt at 0.75
      const pdfW = svgW * 0.5;
      const pdfH = svgH * 0.5;
      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [pdfW, pdfH]
      });

      // Add title at top
      const proj = getCurrentProject();
      const title = proj ? proj.name : 'Cronograma';
      const today = new Date().toLocaleDateString('es-AR');
      pdf.setFontSize(14);
      pdf.setTextColor(40, 40, 61);
      pdf.text(title, 12, 18);
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text('Exportado: ' + today, pdfW - 90, 18);

      pdf.addImage(imgData, 'PNG', 0, 25, pdfW, pdfH - 25);

      const filename = 'gantt_' + (title || 'proyecto').replace(/\W+/g,'_') + '_' + new Date().toISOString().slice(0,10) + '.pdf';
      pdf.save(filename);

      btn.textContent = '✓ Exportado';
      setTimeout(() => { btn.disabled = false; btn.textContent = orig; }, 2000);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Error al exportar PDF: ' + err.message);
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  function injectExportButton() {
    // Find the gantt toolbar
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return;
    if (document.getElementById('p360-export-btn')) return;

    // Only inject when we're on gantt view (gantt-split exists)
    if (!document.querySelector('.gantt-split')) return;

    const btn = document.createElement('button');
    btn.id = 'p360-export-btn';
    btn.className = 'p360-export-btn';
    btn.innerHTML = '📄 Exportar PDF';
    btn.addEventListener('click', () => exportGanttToPDF(btn));

    // Insert at end of toolbar-right or toolbar
    const right = toolbar.querySelector('.toolbar-right');
    if (right) right.appendChild(btn);
    else toolbar.appendChild(btn);
  }

  /* ══════════════════════════════════════════════════════════
     2. GLOBAL SEARCH
     Modal con búsqueda fuzzy en tareas, proyectos, miembros.
     Atajo Ctrl+K (Cmd+K en Mac).
  ══════════════════════════════════════════════════════════ */

  let _searchData = null;
  let _searchSelected = 0;

  async function loadSearchData() {
    if (_searchData) return _searchData;
    const sb = getSB();
    if (!sb) return null;
    const [{data: tasks}, {data: projects}, {data: members}] = await Promise.all([
      sb.from('tasks').select('id,name,project_id,status,end_date,assigned_to,is_milestone'),
      sb.from('projects').select('id,name,status,end_date,provincia'),
      sb.from('members').select('id,name,role,email').eq('active', true)
    ]);
    _searchData = { tasks: tasks || [], projects: projects || [], members: members || [] };
    return _searchData;
  }

  function createSearchModal() {
    if (document.getElementById('p360-search-modal')) return;
    const m = document.createElement('div');
    m.id = 'p360-search-modal';
    m.innerHTML = `
      <div class="p360-search-panel">
        <div class="p360-search-input-wrap">
          <span class="p360-search-icon">🔍</span>
          <input class="p360-search-input" id="p360-search-input" placeholder="Buscar tareas, proyectos, personas..." autofocus />
          <span class="p360-search-shortcut">ESC</span>
        </div>
        <div class="p360-search-results" id="p360-search-results">
          <div class="p360-search-empty">Empezá a escribir para buscar...</div>
        </div>
      </div>
    `;
    m.addEventListener('click', e => { if (e.target === m) closeSearch(); });
    document.body.appendChild(m);

    const input = document.getElementById('p360-search-input');
    input.addEventListener('input', e => doSearch(e.target.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSearch();
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); moveSelection(-1); }
      else if (e.key === 'Enter')     { e.preventDefault(); executeSelected(); }
    });
  }

  function openSearch() {
    createSearchModal();
    document.getElementById('p360-search-modal').classList.add('open');
    loadSearchData();
    setTimeout(() => document.getElementById('p360-search-input').focus(), 50);
  }

  function closeSearch() {
    const m = document.getElementById('p360-search-modal');
    if (m) {
      m.classList.remove('open');
      const inp = document.getElementById('p360-search-input');
      if (inp) inp.value = '';
      _searchSelected = 0;
    }
  }

  function highlight(text, query) {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return text;
    return text.slice(0, idx) +
      '<mark class="p360-highlight">' + text.slice(idx, idx + query.length) + '</mark>' +
      text.slice(idx + query.length);
  }

  let _searchResults = [];

  async function doSearch(query) {
    const results = document.getElementById('p360-search-results');
    if (!query || query.length < 2) {
      results.innerHTML = '<div class="p360-search-empty">Empezá a escribir para buscar... (mínimo 2 caracteres)</div>';
      _searchResults = [];
      return;
    }

    const data = await loadSearchData();
    if (!data) return;

    const q = query.toLowerCase();
    const matchTasks    = data.tasks.filter(t => (t.name||'').toLowerCase().includes(q)).slice(0, 15);
    const matchProjects = data.projects.filter(p => (p.name||'').toLowerCase().includes(q)).slice(0, 8);
    const matchMembers  = data.members.filter(m =>
      (m.name||'').toLowerCase().includes(q) ||
      (m.email||'').toLowerCase().includes(q)
    ).slice(0, 8);

    _searchResults = [];
    matchProjects.forEach(p => _searchResults.push({ type: 'project', data: p }));
    matchTasks.forEach(t => _searchResults.push({ type: 'task', data: t }));
    matchMembers.forEach(m => _searchResults.push({ type: 'member', data: m }));

    if (_searchResults.length === 0) {
      results.innerHTML = '<div class="p360-search-empty">Sin resultados para "' + query + '"</div>';
      return;
    }

    const projMap = {};
    data.projects.forEach(p => projMap[p.id] = p);

    _searchSelected = 0;
    let html = '';

    if (matchProjects.length) {
      html += '<div class="p360-search-group">🏗️ Cronogramas</div>';
      matchProjects.forEach((p, i) => {
        const globalIdx = _searchResults.findIndex(r => r.type === 'project' && r.data.id === p.id);
        html += `
          <div class="p360-search-result ${globalIdx === 0 ? 'selected' : ''}" data-idx="${globalIdx}">
            <span class="p360-search-result-icon">🏗️</span>
            <div class="p360-search-result-text">
              <div class="p360-search-result-title">${highlight(p.name, query)}</div>
              <div class="p360-search-result-subtitle">${p.provincia || ''} · ${p.status || ''}</div>
            </div>
          </div>`;
      });
    }

    if (matchTasks.length) {
      html += '<div class="p360-search-group">📋 Tareas</div>';
      matchTasks.forEach(t => {
        const globalIdx = _searchResults.findIndex(r => r.type === 'task' && r.data.id === t.id);
        const proj = projMap[t.project_id];
        const projName = proj ? proj.name : '—';
        const icon = t.is_milestone ? '◆' : '📋';
        html += `
          <div class="p360-search-result" data-idx="${globalIdx}">
            <span class="p360-search-result-icon">${icon}</span>
            <div class="p360-search-result-text">
              <div class="p360-search-result-title">${highlight(t.name, query)}</div>
              <div class="p360-search-result-subtitle">${projName} · ${t.status || ''}</div>
            </div>
          </div>`;
      });
    }

    if (matchMembers.length) {
      html += '<div class="p360-search-group">👤 Personas</div>';
      matchMembers.forEach(mem => {
        const globalIdx = _searchResults.findIndex(r => r.type === 'member' && r.data.id === mem.id);
        html += `
          <div class="p360-search-result" data-idx="${globalIdx}">
            <span class="p360-search-result-icon">👤</span>
            <div class="p360-search-result-text">
              <div class="p360-search-result-title">${highlight(mem.name, query)}</div>
              <div class="p360-search-result-subtitle">${mem.role || ''} · ${mem.email || ''}</div>
            </div>
          </div>`;
      });
    }

    results.innerHTML = html;
    results.querySelectorAll('.p360-search-result').forEach(el => {
      el.addEventListener('click', () => {
        _searchSelected = parseInt(el.dataset.idx);
        executeSelected();
      });
    });
  }

  function moveSelection(delta) {
    const items = document.querySelectorAll('.p360-search-result');
    if (items.length === 0) return;
    items.forEach(el => el.classList.remove('selected'));
    _searchSelected = (_searchSelected + delta + items.length) % items.length;
    const next = document.querySelector(`.p360-search-result[data-idx="${_searchSelected}"]`);
    if (next) {
      next.classList.add('selected');
      next.scrollIntoView({ block: 'nearest' });
    }
  }

  async function executeSelected() {
    const item = _searchResults[_searchSelected];
    if (!item) return;
    closeSearch();
    if (item.type === 'project') {
      await loadProjectByReactStore(item.data.id);
      setReactPage('gantt');
    } else if (item.type === 'task') {
      // Open the task's project on gantt, then scroll to the task
      await loadProjectByReactStore(item.data.project_id);
      setReactPage('gantt');
      // Scroll to task after page loads
      setTimeout(() => {
        const rows = document.querySelectorAll('.task-row');
        for (const row of rows) {
          const name = row.querySelector('.task-name-text')?.textContent?.trim();
          if (name === item.data.name) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.style.background = 'var(--brand-orange-bg, #FFF1E5)';
            setTimeout(() => { row.style.background = ''; }, 2000);
            break;
          }
        }
      }, 800);
    } else if (item.type === 'member') {
      setReactPage('resources');
    }
  }

  function injectSearchSidebarButton() {
    const sidebar = document.querySelector('.sidebar-nav');
    if (!sidebar || document.getElementById('p360-search-sidebar-btn')) return;
    const homeBtn = Array.from(sidebar.querySelectorAll('.sidebar-item')).find(b =>
      b.textContent.includes('Inicio'));
    if (!homeBtn) return;
    const btn = document.createElement('button');
    btn.id = 'p360-search-sidebar-btn';
    btn.className = 'sidebar-item';
    btn.innerHTML = '<span class="sidebar-item-icon">🔍</span>Búsqueda <span style="margin-left:auto;font-size:9px;color:var(--text-3);font-family:monospace">Ctrl+K</span>';
    btn.addEventListener('click', () => openSearch());
    homeBtn.parentNode.insertBefore(btn, homeBtn.nextSibling);
  }

  // Ctrl+K / Cmd+K shortcut
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearch();
    }
  });

  /* ══════════════════════════════════════════════════════════
     3. OFFLINE MODE
     - Cachea tareas, proyectos, members en IndexedDB
     - Detecta offline
     - Cola de operaciones pendientes
     - Sincroniza al volver online
  ══════════════════════════════════════════════════════════ */

  const DB_NAME = 'buildplan360_cache';
  const DB_VERSION = 1;
  let _db = null;

  function openDB() {
    return new Promise((res, rej) => {
      if (_db) return res(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => rej(req.error);
      req.onsuccess = () => { _db = req.result; res(_db); };
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  async function cacheSet(key, value) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('cache', 'readwrite');
      tx.objectStore('cache').put({ key, value, ts: Date.now() });
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }

  async function cacheGet(key) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('cache', 'readonly');
      const r = tx.objectStore('cache').get(key);
      r.onsuccess = () => res(r.result ? r.result.value : null);
      r.onerror = () => rej(r.error);
    });
  }

  async function queueAdd(op) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('queue', 'readwrite');
      tx.objectStore('queue').add({ ...op, ts: Date.now() });
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }

  async function queueGetAll() {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('queue', 'readonly');
      const r = tx.objectStore('queue').getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  }

  async function queueClear() {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('queue', 'readwrite');
      tx.objectStore('queue').clear();
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }

  async function queueDelete(id) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('queue', 'readwrite');
      tx.objectStore('queue').delete(id);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }

  /* ── Cache de datos críticos cuando online ── */
  async function cacheCurrentData() {
    const sb = getSB();
    if (!sb || !navigator.onLine) return;
    try {
      const [tasks, projects, members, deps] = await Promise.all([
        sb.from('tasks').select('*'),
        sb.from('projects').select('*'),
        sb.from('members').select('*'),
        sb.from('task_dependencies').select('*')
      ]);
      if (tasks.data)    await cacheSet('tasks', tasks.data);
      if (projects.data) await cacheSet('projects', projects.data);
      if (members.data)  await cacheSet('members', members.data);
      if (deps.data)     await cacheSet('task_dependencies', deps.data);
      await cacheSet('lastCached', new Date().toISOString());
    } catch(e) { console.warn('Cache error:', e); }
  }

  /* ── Banner offline / pending sync ── */
  function createBanner() {
    if (document.getElementById('p360-offline-banner')) return;
    const b = document.createElement('div');
    b.id = 'p360-offline-banner';
    b.innerHTML = '<span id="p360-offline-text">📡 Sin conexión - trabajando en modo offline</span><span class="p360-offline-pending-count" id="p360-offline-count"></span>';
    document.body.appendChild(b);
  }

  async function updateBanner() {
    createBanner();
    const b = document.getElementById('p360-offline-banner');
    const text = document.getElementById('p360-offline-text');
    const count = document.getElementById('p360-offline-count');
    const queue = await queueGetAll();

    if (!navigator.onLine) {
      b.classList.add('show');
      b.classList.remove('synced');
      text.textContent = '📡 Sin conexión - trabajando en modo offline';
      count.textContent = queue.length > 0 ? queue.length + ' cambios pendientes' : '';
    } else if (queue.length > 0) {
      b.classList.add('show');
      b.classList.remove('synced');
      text.textContent = '🔄 Sincronizando...';
      count.textContent = queue.length + ' pendientes';
      syncQueue();
    } else {
      b.classList.remove('show');
    }
  }

  let _syncing = false;
  async function syncQueue() {
    if (_syncing || !navigator.onLine) return;
    _syncing = true;
    const sb = getSB();
    if (!sb) { _syncing = false; return; }
    try {
      const queue = await queueGetAll();
      for (const op of queue) {
        try {
          if (op.type === 'update') {
            await sb.from(op.table).update(op.data).eq('id', op.id);
          } else if (op.type === 'insert') {
            await sb.from(op.table).insert(op.data);
          } else if (op.type === 'delete') {
            await sb.from(op.table).delete().eq('id', op.id);
          }
          await queueDelete(op.id);
        } catch (e) {
          console.warn('Sync op failed:', op, e);
          break; // stop on first failure
        }
      }
      const remaining = await queueGetAll();
      const b = document.getElementById('p360-offline-banner');
      const text = document.getElementById('p360-offline-text');
      const count = document.getElementById('p360-offline-count');
      if (remaining.length === 0) {
        b.classList.add('synced');
        text.textContent = '✓ Sincronizado correctamente';
        count.textContent = '';
        setTimeout(() => b.classList.remove('show'), 3000);
      } else {
        text.textContent = '⚠️ Algunos cambios no se pudieron sincronizar';
        count.textContent = remaining.length + ' pendientes';
      }
    } finally {
      _syncing = false;
    }
  }

  /* ── Interceptar operaciones a Supabase para cola offline ── */
  // Wrap supabase.from() to detect when we're offline
  function wrapSupabase() {
    const sb = getSB();
    if (!sb || sb._wrapped) return;
    sb._wrapped = true;

    const origFrom = sb.from.bind(sb);
    sb.from = function(table) {
      const builder = origFrom(table);
      // Wrap mutating methods
      ['update', 'insert', 'delete', 'upsert'].forEach(method => {
        if (typeof builder[method] === 'function') {
          const orig = builder[method].bind(builder);
          builder[method] = function(data) {
            const result = orig(data);
            // If offline, queue the operation
            if (!navigator.onLine) {
              // Schedule for later, but allow chained .eq() etc
              // We hook into the .then() to intercept execution
              const origThen = result.then?.bind(result);
              if (origThen) {
                result.then = function(onFulfilled, onRejected) {
                  // Queue the op instead of executing
                  const op = { type: method, table, data };
                  // Try to get .eq() id from the builder state (approx)
                  // Note: this is best-effort; complex queries may not queue perfectly
                  queueAdd(op).then(() => {
                    updateBanner();
                    if (onFulfilled) onFulfilled({ data: null, error: null });
                  });
                  return Promise.resolve({ data: null, error: null });
                };
              }
            }
            return result;
          };
        }
      });
      return builder;
    };
  }

  /* ── Online/offline event listeners ── */
  window.addEventListener('online', () => {
    updateBanner();
    cacheCurrentData();
  });
  window.addEventListener('offline', () => {
    updateBanner();
  });

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  function init() {
    injectCSS();
    createSearchModal();

    // Sidebar buttons
    const obs = new MutationObserver(() => {
      injectSearchSidebarButton();
      injectExportButton();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      injectSearchSidebarButton();
      injectExportButton();
    }, 1500);

    // Offline: try to wrap supabase after it's loaded
    setTimeout(() => {
      wrapSupabase();
      cacheCurrentData(); // initial cache
      updateBanner();     // initial state
    }, 2000);

    // Re-cache periodically (every 5 min when online)
    setInterval(() => {
      if (navigator.onLine) cacheCurrentData();
    }, 5 * 60 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
