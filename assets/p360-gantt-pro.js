/**
 * Buildplan 360 — Gantt Pro v1
 *
 * Punto 1: Drag barra completa (mover fechas)
 * Punto 2: Resize barra por extremo derecho (cambiar duración)
 * Punto 3: Botón "Ir a hoy" en toolbar del Gantt
 * Punto 9: Exportar PDF — (ya cubierto por p360-patch-suite.js)
 * Punto 19: Tipos de dependencia CC (SS) y FF
 * Punto 7 (nueva): Tab entre celdas del grilla
 */
(function () {
  'use strict';

  /* ═══════════════════════════ STORE ACCESS ═════════════════════════════ */
  function getStore() {
    const root = document.getElementById('root');
    if (!root) return null;
    const fk = Object.keys(root).find(k =>
      k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fk) return null;
    let f = root[fk];
    for (let i = 0; i < 300 && f; i++) {
      const s = f.memoizedState;
      if (s && s.memoizedState && typeof s.memoizedState.saveTask === 'function')
        return s.memoizedState;
      f = f.child || f.sibling || (f.return && f.return.sibling);
    }
    return null;
  }

  /* ═══════════════════════════ TOAST ════════════════════════════════════ */
  function toast(msg, type) {
    const bg = type === 'error' ? '#dc2626' : type === 'warning' ? '#f59e0b' : '#10b981';
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:99999;
      padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;
      color:#fff;background:${bg};box-shadow:0 4px 20px rgba(0,0,0,.25);pointer-events:none`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0';
      setTimeout(() => el.remove(), 350); }, 2500);
  }

  /* ═══════════════════════════ DATE UTILS ═══════════════════════════════ */
  function parseDate(s) {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  function toISODate(d) {
    return d.toISOString().slice(0, 10);
  }
  function addDays(d, n) {
    return new Date(d.getTime() + n * 86400000);
  }
  function diffDays(a, b) {
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PUNTO 3 — BOTÓN "IR A HOY"
  ═══════════════════════════════════════════════════════════════════════ */
  function injectGoToToday() {
    // Buscar la toolbar del Gantt
    const toolbar = document.querySelector('.gantt-toolbar, .toolbar-gantt, [class*="toolbar"]');
    if (!toolbar || toolbar.querySelector('.p360-goto-today')) return;

    // También buscar el botón de "Semana" o "Escala de tiempo" para insertar cerca
    const scaleBtn = document.querySelector('button[class*="scale"], button[class*="Scale"]') ||
      toolbar.querySelector('button');
    if (!scaleBtn) return;

    const btn = document.createElement('button');
    btn.className = 'p360-goto-today';
    btn.textContent = '📅 Hoy';
    btn.title = 'Ir a la fecha de hoy en el Gantt';
    btn.style.cssText = `
      padding: 4px 12px; border-radius: 5px; font-size: 12px; font-weight: 600;
      border: 1px solid var(--border-strong, #ddd); background: var(--surface, #fff);
      color: var(--text, #1a1a2e); cursor: pointer; margin-left: 4px;
      display: inline-flex; align-items: center; gap: 4px;
    `;

    btn.addEventListener('mouseover', () => { btn.style.background = 'var(--brand-orange, #FB7520)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--brand-orange, #FB7520)'; });
    btn.addEventListener('mouseout',  () => { btn.style.background = 'var(--surface, #fff)'; btn.style.color = 'var(--text, #1a1a2e)'; btn.style.borderColor = 'var(--border-strong, #ddd)'; });

    btn.addEventListener('click', scrollToToday);

    scaleBtn.parentNode.insertBefore(btn, scaleBtn.nextSibling);
  }

  function scrollToToday() {
    // El SVG del Gantt tiene una línea roja de "hoy" — la buscamos o calculamos la posición
    const todayLine = document.querySelector('.today-line, [class*="today"]');
    const rightBody = document.querySelector('.right-body, #ganttRightBody');
    const headerSvg = document.querySelector('#ganttSvg, #ganttHeaderSvg');

    if (todayLine && rightBody) {
      // Obtener X de la línea de hoy
      const x = parseFloat(todayLine.getAttribute('x1') || todayLine.getAttribute('x') || '0');
      const container = rightBody;
      const containerW = container.clientWidth;
      container.scrollLeft = Math.max(0, x - containerW / 2);
      // Sincronizar header si existe
      const headerWrap = document.querySelector('.right-header-wrap');
      if (headerWrap) headerWrap.scrollLeft = container.scrollLeft;
      return;
    }

    // Fallback: calcular posición por fecha
    if (!headerSvg || !rightBody) return;
    const svgW = parseFloat(headerSvg.getAttribute('width') || '0');
    if (!svgW) return;

    const store = getStore();
    if (!store) return;
    const tasks = store.tasks || [];
    if (!tasks.length) return;

    // Encontrar rango del Gantt
    let minDate = tasks[0].start_date, maxDate = tasks[0].end_date;
    tasks.forEach(t => {
      if (t.start_date < minDate) minDate = t.start_date;
      if (t.end_date > maxDate) maxDate = t.end_date;
    });

    const today = toISODate(new Date());
    if (today < minDate || today > maxDate) {
      toast('La fecha de hoy está fuera del rango del proyecto', 'warning');
      return;
    }

    const totalDays = diffDays(parseDate(minDate), parseDate(maxDate)) + 1;
    const dayOffset = diffDays(parseDate(minDate), parseDate(today));
    const pct = dayOffset / totalDays;
    const todayX = svgW * pct;
    const containerW = rightBody.clientWidth;
    rightBody.scrollLeft = Math.max(0, todayX - containerW / 2);

    const headerWrap = document.querySelector('.right-header-wrap');
    if (headerWrap) headerWrap.scrollLeft = rightBody.scrollLeft;

    toast('📅 Posicionado en hoy', 'success');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PUNTOS 1 y 2 — DRAG BARRAS + RESIZE
     Inyecta listeners sobre el SVG del Gantt.
     Las barras tienen clase .bar-clickable y data-taskId.
  ═══════════════════════════════════════════════════════════════════════ */
  let _dragState = null;

  function enableGanttDrag() {
    const svg = document.getElementById('ganttSvg');
    if (!svg || svg._p360drag) return;
    svg._p360drag = true;

    // Necesitamos el ancho del SVG y el rango de fechas para convertir px → días
    function getGanttMeta() {
      const store = getStore();
      if (!store) return null;
      const tasks = store.tasks || [];
      if (!tasks.length) return null;
      const proj = store.currentProject || {};
      let minDate = tasks[0].start_date, maxDate = tasks[0].end_date;
      tasks.forEach(t => {
        if (t.start_date < minDate) minDate = t.start_date;
        if (t.end_date > maxDate) maxDate = t.end_date;
      });
      if (proj.start_date && proj.start_date < minDate) minDate = proj.start_date;
      if (proj.end_date && proj.end_date > maxDate) maxDate = proj.end_date;
      const svgW = parseFloat(svg.getAttribute('width') || '0');
      const totalDays = diffDays(parseDate(minDate), parseDate(maxDate)) + 1;
      const pxPerDay = svgW / totalDays;
      return { minDate, maxDate, totalDays, pxPerDay };
    }

    function pxToDays(px, meta) {
      return Math.round(px / meta.pxPerDay);
    }

    // Obtener SVG-relative X de un evento de mouse
    function getSVGX(e) {
      const rect = svg.getBoundingClientRect();
      return e.clientX - rect.left;
    }

    svg.addEventListener('mousedown', e => {
      if (!getStore()?.canEdit) return;

      // Buscar si el click fue en una barra
      const bar = e.target.closest('.bar-clickable');
      if (!bar) return;

      const taskId = bar.dataset.taskId;
      if (!taskId) return;

      const store = getStore();
      if (!store) return;
      const task = (store.tasks || []).find(t => t.id === taskId);
      if (!task) return;

      const meta = getGanttMeta();
      if (!meta) return;

      const startX = getSVGX(e);
      const barRect = bar.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const barRightX = barRect.right - svgRect.left;
      const barLeftX  = barRect.left  - svgRect.left;

      // Detectar si el click fue cerca del borde derecho (resize) — últimos 8px
      const isResize = (barRightX - (e.clientX - svgRect.left)) < 8;

      _dragState = {
        taskId, task: { ...task },
        startX, startDate: task.start_date, endDate: task.end_date,
        meta, isResize,
        barEl: bar,
        origCursor: document.body.style.cursor,
      };

      document.body.style.cursor = isResize ? 'ew-resize' : 'grabbing';
      document.body.style.userSelect = 'none';

      // Visual feedback
      bar.style.opacity = '0.75';
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!_dragState) return;
      const { startX, meta, isResize, barEl, task } = _dragState;
      const svg = document.getElementById('ganttSvg');
      if (!svg) return;
      const svgRect = svg.getBoundingClientRect();
      const currentX = e.clientX - svgRect.left;
      const deltaPx = currentX - startX;
      const deltaDays = pxToDays(deltaPx, meta);

      if (isResize) {
        // Solo cambiar end_date
        const newEnd = addDays(parseDate(task.end_date), deltaDays);
        const newEndStr = toISODate(newEnd);
        if (newEndStr > task.start_date) {
          _dragState.previewEnd = newEndStr;
          showDragTooltip(e, `Fin: ${formatDate(newEndStr)}`);
        }
      } else {
        // Mover toda la barra
        const newStart = addDays(parseDate(task.start_date), deltaDays);
        const newEnd   = addDays(parseDate(task.end_date),   deltaDays);
        _dragState.previewStart = toISODate(newStart);
        _dragState.previewEnd   = toISODate(newEnd);
        showDragTooltip(e, `${formatDate(_dragState.previewStart)} → ${formatDate(_dragState.previewEnd)}`);
      }
    });

    document.addEventListener('mouseup', async e => {
      if (!_dragState) return;
      const state = { ..._dragState };
      _dragState = null;

      document.body.style.cursor = state.origCursor;
      document.body.style.userSelect = '';
      if (state.barEl) state.barEl.style.opacity = '';
      hideDragTooltip();

      const store = getStore();
      if (!store || !store.canEdit) return;

      const task = state.task;
      let newStart = state.previewStart || task.start_date;
      let newEnd   = state.previewEnd   || task.end_date;

      // No hacer nada si no cambió
      if (newStart === task.start_date && newEnd === task.end_date) return;

      // Si es solo resize, mantener start_date
      if (state.isResize) newStart = task.start_date;

      // Guardar
      try {
        await store.saveTask({ start_date: newStart, end_date: newEnd }, task.id, undefined, store.tasks || []);
        toast(`✓ Tarea actualizada`, 'success');
      } catch (err) {
        toast('Error al guardar: ' + (err.message || err), 'error');
      }
    });

    // Cursor resize en hover
    svg.addEventListener('mousemove', e => {
      const bar = e.target.closest('.bar-clickable');
      if (!bar) { svg.style.cursor = ''; return; }
      const barRect = bar.getBoundingClientRect();
      const nearRight = (barRect.right - e.clientX) < 10;
      svg.style.cursor = nearRight ? 'ew-resize' : 'grab';
    });
    svg.addEventListener('mouseleave', () => { svg.style.cursor = ''; });
  }

  /* Tooltip flotante durante drag */
  let _tt = null;
  function showDragTooltip(e, text) {
    if (!_tt) {
      _tt = document.createElement('div');
      _tt.style.cssText = `position:fixed;z-index:99999;background:#1a1a2e;color:#fff;
        padding:4px 10px;border-radius:5px;font-size:12px;font-weight:600;
        pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap`;
      document.body.appendChild(_tt);
    }
    _tt.textContent = text;
    _tt.style.left = (e.clientX + 12) + 'px';
    _tt.style.top  = (e.clientY - 28) + 'px';
    _tt.style.display = 'block';
  }
  function hideDragTooltip() {
    if (_tt) { _tt.style.display = 'none'; }
  }
  function formatDate(s) {
    if (!s) return '';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PUNTO 19 — TIPOS DE DEPENDENCIA CC (SS) y FF
     En el modal de tarea, el campo PRED. acepta "3FC", "3CC", "3FF"
     El store ya soporta start_to_start y finish_to_finish.
     Solo necesitamos asegurarnos de que la UI muestre las opciones.
  ═══════════════════════════════════════════════════════════════════════ */
  function patchDepsHint() {
    // Buscar el campo de predecesoras en el modal de tarea y actualizar el placeholder/hint
    const obs = new MutationObserver(() => {
      const modal = document.querySelector('.modal, [class*="task-modal"], [class*="TaskModal"]');
      if (!modal) return;

      const predInputs = modal.querySelectorAll('input[placeholder*="FC"], input[placeholder*="pred"]');
      predInputs.forEach(inp => {
        if (inp._p360deps) return;
        inp._p360deps = true;
        inp.placeholder = 'Ej: 3FC;5CC;6FF';
        inp.title = 'FC = Fin a Comienzo, CC = Comienzo a Comienzo, FF = Fin a Fin';

        // Agregar hint debajo del input si no existe
        if (!inp.nextElementSibling?.classList?.contains('p360-dep-hint')) {
          const hint = document.createElement('div');
          hint.className = 'p360-dep-hint';
          hint.style.cssText = 'font-size:11px;color:var(--text-3,#aaa);margin-top:3px;';
          hint.innerHTML = '<b>FC</b> Fin→Comienzo &nbsp; <b>CC</b> Comienzo→Comienzo &nbsp; <b>FF</b> Fin→Fin &nbsp; <b>CF</b> Comienzo→Fin';
          inp.parentNode.insertBefore(hint, inp.nextSibling);
        }
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PUNTO 7 — TAB ENTRE CELDAS DE LA GRILLA
     Al presionar Tab dentro de .cell-ie input, pasar a la siguiente celda editable.
  ═══════════════════════════════════════════════════════════════════════ */
  function enableGridTab() {
    if (window._p360tabEnabled) return;
    window._p360tabEnabled = true;

    document.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const active = document.activeElement;
      if (!active || !active.closest('.cell-ie')) return;

      e.preventDefault();

      // Encontrar todas las celdas de esa fila
      const row = active.closest('.task-row, [class*="task-row"]');
      if (!row) return;

      const allRows = Array.from(document.querySelectorAll('.task-row, [class*="task-row"]'));
      const rowIdx  = allRows.indexOf(row);

      // Si Shift+Tab: celda anterior; Tab: siguiente
      const forward = !e.shiftKey;

      // Primero intentar siguiente celda en la misma fila
      const cells = Array.from(row.querySelectorAll('.cell-ie'));
      const activeCell = active.closest('.cell-ie');
      const cellIdx = cells.indexOf(activeCell);

      const nextCellIdx = forward ? cellIdx + 1 : cellIdx - 1;

      if (nextCellIdx >= 0 && nextCellIdx < cells.length) {
        // Simular click en la celda para abrirla
        cells[nextCellIdx].click();
        setTimeout(() => {
          const inp = cells[nextCellIdx].querySelector('input, select');
          if (inp) inp.focus();
        }, 50);
      } else {
        // Pasar a la siguiente fila
        const nextRowIdx = forward ? rowIdx + 1 : rowIdx - 1;
        if (nextRowIdx >= 0 && nextRowIdx < allRows.length) {
          // Commit la celda actual primero
          active.blur();
          setTimeout(() => {
            const nextRow = allRows[nextRowIdx];
            const firstCell = nextRow.querySelector('.cell-ie');
            if (firstCell) {
              firstCell.click();
              setTimeout(() => {
                const inp = firstCell.querySelector('input, select');
                if (inp) inp.focus();
              }, 50);
            }
          }, 80);
        }
      }
    }, true);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CSS extra para drag visual
  ═══════════════════════════════════════════════════════════════════════ */
  const style = document.createElement('style');
  style.id = 'p360-gantt-pro-css';
  style.textContent = `
    #ganttSvg .bar-clickable { cursor: grab; transition: opacity .15s; }
    #ganttSvg .bar-clickable:hover { filter: brightness(1.08); }

    .p360-goto-today { transition: background .15s, color .15s; }

    /* Borde resize visible al hover */
    #ganttSvg .bar-clickable::after { content: ''; }
  `;
  document.head.appendChild(style);

  /* ═══════════════════════════════════════════════════════════════════════
     ORCHESTRATOR — observer único y debounced
  ═══════════════════════════════════════════════════════════════════════ */
  let _initDone = false;
  let _timer = null;

  function onDomChange() {
    injectGoToToday();
    enableGanttDrag();
    if (!_initDone) {
      patchDepsHint();
      enableGridTab();
      _initDone = true;
    }
    // Desconectar observer del body una vez que el toolbar esté listo
    if (document.querySelector('.p360-goto-today') && document.getElementById('ganttSvg')?._p360drag) {
      mainObs.disconnect();
    }
  }

  const mainObs = new MutationObserver(() => {
    clearTimeout(_timer);
    _timer = setTimeout(onDomChange, 350);
  });
  mainObs.observe(document.body, { childList: true, subtree: true });

  // Desconectar de todas formas a los 60s
  setTimeout(() => mainObs.disconnect(), 60000);

  // Primer intento
  setTimeout(onDomChange, 1000);

  // Re-habilitar drag cuando React re-renderiza el SVG (el SVG se re-crea)
  const svgObs = new MutationObserver(() => {
    const svg = document.getElementById('ganttSvg');
    if (svg && !svg._p360drag) enableGanttDrag();
  });
  const ganttBody = () => document.querySelector('.right-body, #ganttRightBody');
  setTimeout(() => {
    const gb = ganttBody();
    if (gb) svgObs.observe(gb, { childList: true, subtree: false });
  }, 2000);

})();
