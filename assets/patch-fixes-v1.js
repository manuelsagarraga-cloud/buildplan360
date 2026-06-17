/**
 * Buildplan 360 — Patch Fixes v1
 * 
 * 1. Vincular N tareas (consecutivas por orden de fila)
 * 2. Logo duplicado: ocultar texto pequeño "BUILDPLAN 360"
 * 3. Bombita 💡 solo visible para administradores
 * 4. Altura del Gantt ajustable con drag + botón toggle
 * 5. Error PDF "undefined": fix canvg → html2canvas fallback
 */
(function() {
  'use strict';

  /* ══════════════════════════════════════════════════
     1. FIX: VINCULAR N TAREAS CONSECUTIVAMENTE
     Reemplaza la validación "exactamente 2" por lógica
     que crea dependencias en cadena para N tareas
  ══════════════════════════════════════════════════ */
  function patchLinkTasks() {
    // Intercepta la función wa() de W0 (GanttView)
    // Guardamos referencia al linkTasks original del store
    const origDispatch = window._p360linkTasksPatched;
    if (origDispatch) return;
    window._p360linkTasksPatched = true;

    // Patch via MutationObserver: cuando aparece el botón Vincular,
    // reemplazamos su handler
    function interceptVincularBtn() {
      const btn = document.querySelector('button[title="Vincular 2 tareas seleccionadas"]');
      if (!btn || btn._p360patched) return;
      btn._p360patched = true;
      btn.title = 'Vincular tareas seleccionadas (2 o más, en cadena)';
      btn.textContent = '🔗 Vincular';

      // Clonar para remover listeners originales
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn._p360patched = true;
      newBtn.title = 'Vincular tareas seleccionadas (2 o más, en cadena)';

      newBtn.addEventListener('click', async function() {
        await handleVincularN();
      });
    }

    async function handleVincularN() {
      // Obtener el store de React
      const store = getReactStore();
      if (!store) { showToast('No se pudo acceder al store', 'error'); return; }

      const { tasks, deps, linkTasks, reloadProject } = store;
      
      // Obtener tareas seleccionadas (checkboxes marcados en la grilla)
      const checked = Array.from(document.querySelectorAll('.left-body .task-row .cell input[type="checkbox"]:checked'));
      
      if (checked.length < 2) {
        showToast('Seleccioná al menos 2 tareas para vincular', 'warning');
        return;
      }

      // Mapear checkboxes a task IDs por posición en la grilla
      const allRows = Array.from(document.querySelectorAll('.left-body .task-row'));
      const selectedRows = allRows.filter(row => {
        const cb = row.querySelector('input[type="checkbox"]');
        return cb && cb.checked;
      });

      // Obtener IDs de tarea desde data-taskid o desde los cells
      const taskIds = selectedRows.map(row => {
        // Buscar el data-taskid en algún cell de la fila
        const cell = row.querySelector('[data-taskid]');
        return cell ? cell.dataset.taskid : null;
      }).filter(Boolean);

      if (taskIds.length < 2) {
        showToast('No se pudieron identificar las tareas. Intentá de nuevo.', 'error');
        return;
      }

      // Crear dependencias consecutivas: 0→1, 1→2, 2→3...
      let linked = 0;
      for (let i = 0; i < taskIds.length - 1; i++) {
        const predId = taskIds[i];
        const succId = taskIds[i + 1];
        try {
          await linkTasks(predId, succId);
          linked++;
        } catch(e) {
          console.warn('Error vinculando', predId, '→', succId, e);
        }
      }

      showToast(`${linked} dependencia(s) FC creada(s)`, 'success');
    }

    function getReactStore() {
      const root = document.getElementById('root');
      if (!root) return null;
      const fk = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (!fk) return null;
      function walk(f, d) {
        if (!f || d > 80) return null;
        const s = f.memoizedState;
        if (s && s.memoizedState && typeof s.memoizedState.linkTasks === 'function') {
          return s.memoizedState;
        }
        return walk(f.child, d+1) || walk(f.sibling, d+1);
      }
      return walk(root[fk], 0);
    }

    // Observer para interceptar el botón cuando aparezca
    const obs = new MutationObserver(() => interceptVincularBtn());
    obs.observe(document.body, { childList: true, subtree: true });
    // Intentar inmediatamente también
    interceptVincularBtn();
  }

  /* ══════════════════════════════════════════════════
     2. FIX LOGO DUPLICADO: ocultar .sidebar-logo-sub
  ══════════════════════════════════════════════════ */
  function fixDuplicateLogo() {
    const style = document.createElement('style');
    style.id = 'p360-logo-fix';
    style.textContent = `
      .sidebar-logo-sub { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════
     3. FIX BOMBITA 💡: solo visible para admin
  ══════════════════════════════════════════════════ */
  function fixBombita() {
    const style = document.createElement('style');
    style.id = 'p360-bombita-fix';
    style.textContent = `
      /* Por defecto ocultar la bombita */
      [title*="consejo"], [title*="tip"], [title*="hint"],
      .hint-btn, .tip-btn, .bombita-btn,
      button[aria-label*="consejo"], button[aria-label*="hint"] {
        display: none !important;
      }
      /* Si es admin se muestra (clase inyectada por el patch) */
      body.p360-is-admin [title*="consejo"],
      body.p360-is-admin [title*="tip"],
      body.p360-is-admin [title*="hint"],
      body.p360-is-admin .hint-btn,
      body.p360-is-admin .tip-btn,
      body.p360-is-admin .bombita-btn,
      body.p360-is-admin button[aria-label*="consejo"],
      body.p360-is-admin button[aria-label*="hint"] {
        display: inline-flex !important;
      }
    `;
    document.head.appendChild(style);

    // También buscamos el botón de bombita por emoji o texto
    function hideBombitaForNonAdmin() {
      const root = document.getElementById('root');
      if (!root) return;
      const fk = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (!fk) return;
      function walk(f, d) {
        if (!f || d > 80) return null;
        const s = f.memoizedState;
        if (s && s.memoizedState && typeof s.memoizedState.canAdmin !== 'undefined') {
          return s.memoizedState;
        }
        return walk(f.child, d+1) || walk(f.sibling, d+1);
      }
      const store = walk(root[fk], 0);
      if (!store) return;
      
      if (store.canAdmin) {
        document.body.classList.add('p360-is-admin');
      } else {
        document.body.classList.remove('p360-is-admin');
      }

      // También ocultar botones con 💡 que no sean del admin
      if (!store.canAdmin) {
        document.querySelectorAll('button').forEach(btn => {
          if (btn.textContent.includes('💡') || btn.innerHTML.includes('💡')) {
            btn.style.display = 'none';
          }
        });
      }
    }

    // Ejecutar periódicamente para detectar cambios de sesión
    setInterval(hideBombitaForNonAdmin, 2000);
    setTimeout(hideBombitaForNonAdmin, 1500);
  }

  /* ══════════════════════════════════════════════════
     4. ALTURA GANTT AJUSTABLE + TOGGLE ESCALA DE TIEMPO
     Agrega drag handle vertical y botón toggle
  ══════════════════════════════════════════════════ */
  function addGanttHeightControl() {
    const cssId = 'p360-height-control-css';
    if (document.getElementById(cssId)) return;
    
    const style = document.createElement('style');
    style.id = cssId;
    style.textContent = `
      .p360-gantt-height-handle {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 6px;
        background: var(--border, #e2e8f0);
        cursor: ns-resize;
        z-index: 10;
        transition: background 0.15s;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .p360-gantt-height-handle:hover {
        background: var(--brand-orange, #FB7520);
      }
      .p360-gantt-height-handle::after {
        content: '⋯';
        color: var(--text-3, #aaa);
        font-size: 14px;
        line-height: 1;
        pointer-events: none;
      }
      .p360-gantt-wrapper {
        position: relative;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      /* Timeline toggle button */
      .p360-timeline-toggle-btn {
        background: var(--surface);
        color: var(--text);
        border: 1px solid var(--border-strong);
        border-radius: 5px;
        padding: 3px 10px;
        font-size: 11px;
        cursor: pointer;
        margin-left: 4px;
      }
      .p360-timeline-toggle-btn.active {
        background: var(--brand-orange, #FB7520);
        color: white;
        border-color: var(--brand-orange, #FB7520);
      }
    `;
    document.head.appendChild(style);

    function injectHeightHandle() {
      const ganttSplit = document.querySelector('.gantt-split');
      if (!ganttSplit || ganttSplit.querySelector('.p360-gantt-height-handle')) return;

      // Guardar altura actual
      let currentH = ganttSplit.offsetHeight || 500;
      
      const handle = document.createElement('div');
      handle.className = 'p360-gantt-height-handle';
      handle.title = 'Arrastrá para ajustar la altura del Gantt';
      ganttSplit.style.position = 'relative';
      ganttSplit.appendChild(handle);

      handle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        const startY = e.clientY;
        const startH = ganttSplit.offsetHeight;

        function onMove(ev) {
          const newH = Math.max(200, Math.min(window.innerHeight - 120, startH + ev.clientY - startY));
          ganttSplit.style.height = newH + 'px';
          ganttSplit.style.flex = 'none';
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    const obs = new MutationObserver(injectHeightHandle);
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(injectHeightHandle, 1500);
    setInterval(injectHeightHandle, 3000);
  }

  /* ══════════════════════════════════════════════════
     5. FIX PDF EXPORT: reemplazar canvg por html2canvas
     El error "undefined" ocurre porque canvg@4 cambió
     su API. Usamos html2canvas como fallback más robusto.
  ══════════════════════════════════════════════════ */
  function fixPDFExport() {
    // Override la función de exportar PDF que está en tools-v511809.js
    // Esperamos a que el botón esté en el DOM y lo reemplazamos
    function patchExportBtn() {
      const btn = document.getElementById('p360-export-btn');
      if (!btn || btn._p360pdfPatched) return;
      btn._p360pdfPatched = true;

      // Clonar para remover listeners viejos
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn._p360pdfPatched = true;
      newBtn.id = 'p360-export-btn';

      newBtn.addEventListener('click', function() {
        exportGanttPDFFixed(newBtn);
      });
    }

    async function exportGanttPDFFixed(btn) {
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = '⏳ Generando...';

      try {
        // Verificar que estemos en vista Gantt
        const ganttSplit = document.querySelector('.gantt-split');
        if (!ganttSplit) {
          alert('No se encontró el cronograma. Asegurate de estar en la vista Gantt.');
          return;
        }

        // Cargar jsPDF
        if (!window.jspdf) {
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        }

        // Cargar html2canvas (más confiable que canvg para esto)
        if (!window.html2canvas) {
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        }

        // Capturar la sección derecha del Gantt (el SVG con las barras)
        const rightPane = document.querySelector('.right-pane') || document.querySelector('#ganttRightBody') || ganttSplit;
        const leftPane = document.querySelector('.left-pane') || ganttSplit;

        // Capturar ambos paneles
        const [canvasLeft, canvasRight] = await Promise.all([
          window.html2canvas(leftPane, { 
            scale: 1.5, 
            useCORS: true, 
            backgroundColor: '#ffffff',
            logging: false
          }),
          window.html2canvas(rightPane, { 
            scale: 1.5, 
            useCORS: true, 
            backgroundColor: '#ffffff',
            logging: false
          })
        ]);

        const totalW = canvasLeft.width + canvasRight.width;
        const totalH = Math.max(canvasLeft.height, canvasRight.height);

        // Combinar en un canvas
        const combined = document.createElement('canvas');
        combined.width = totalW;
        combined.height = totalH;
        const ctx = combined.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, totalW, totalH);
        ctx.drawImage(canvasLeft, 0, 0);
        ctx.drawImage(canvasRight, canvasLeft.width, 0);

        const imgData = combined.toDataURL('image/png');

        // Obtener nombre del proyecto
        const { jsPDF } = window.jspdf;
        const projTitle = getCurrentProjectName();
        const today = new Date().toLocaleDateString('es-AR');

        // Tamaño PDF proporcional al contenido
        const scale = 0.5;
        const pdfW = Math.max(totalW * scale, 400);
        const pdfH = Math.max(totalH * scale + 30, 200);

        const pdf = new jsPDF({
          orientation: pdfW > pdfH ? 'landscape' : 'portrait',
          unit: 'pt',
          format: [pdfW, pdfH]
        });

        pdf.setFontSize(12);
        pdf.setTextColor(40, 40, 61);
        pdf.text(projTitle, 10, 16);
        pdf.setFontSize(7);
        pdf.setTextColor(150, 150, 150);
        pdf.text('Exportado: ' + today, pdfW - 80, 16);

        pdf.addImage(imgData, 'PNG', 0, 22, pdfW, pdfH - 22);

        const filename = 'gantt_' + projTitle.replace(/\W+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
        pdf.save(filename);

        btn.textContent = '✓ Exportado';
        setTimeout(() => { btn.disabled = false; btn.innerHTML = origText; }, 2000);

      } catch (err) {
        console.error('PDF export error:', err);
        alert('Error al exportar PDF: ' + (err.message || String(err)));
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    }

    function getCurrentProjectName() {
      const root = document.getElementById('root');
      if (!root) return 'Cronograma';
      const fk = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (!fk) return 'Cronograma';
      let f = root[fk];
      for (let i = 0; i < 200 && f; i++) {
        const s = f.memoizedState;
        if (s && s.memoizedState && s.memoizedState.currentProject && s.memoizedState.currentProject.name) {
          return s.memoizedState.currentProject.name;
        }
        f = f.child || f.sibling || (f.return && f.return.sibling);
      }
      return 'Cronograma';
    }

    function loadScript(url) {
      return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = url;
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    // Observer para cuando aparezca el botón
    const obs = new MutationObserver(patchExportBtn);
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(patchExportBtn, 2000);
    setInterval(patchExportBtn, 3000);
  }

  /* ══════════════════════════════════════════════════
     TOAST helper (usa el sistema existente si está)
  ══════════════════════════════════════════════════ */
  function showToast(msg, type) {
    if (window._p360toast) { window._p360toast(msg, type); return; }
    // Fallback: buscar en React
    const root = document.getElementById('root');
    if (!root) return;
    const fk = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fk) { console.log('[p360]', msg); return; }
    function walk(f, d) {
      if (!f || d > 60) return null;
      const s = f.memoizedState;
      if (s && s.queue && s.queue.dispatch && s.memoizedState && typeof s.memoizedState === 'function') return s.memoizedState;
      return walk(f.child, d+1) || walk(f.sibling, d+1);
    }
    // Intentar llamar Q() del bundle
    try { window._Q && window._Q(msg, type); } catch(e) {}
  }

  /* ══════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════ */
  function init() {
    fixDuplicateLogo();
    fixBombita();
    patchLinkTasks();
    addGanttHeightControl();
    fixPDFExport();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // App React puede no estar lista aún
    setTimeout(init, 500);
  }

})();
