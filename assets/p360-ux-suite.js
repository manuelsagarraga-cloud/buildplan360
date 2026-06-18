/**
 * Buildplan 360 — UX Suite v1
 *
 * Punto 1 — Grilla editable tipo Excel (doble click en CUALQUIER celda)
 * Punto 2 — Crear tarea directo en la fila vacía al final (mejorado)
 * Punto 3 — Tab/Enter entre celdas
 * Punto 7 — Tipos de dependencia FC/CC/FF/CF en la celda PRED
 * Punto 9 — Botón "Hoy" en toolbar
 * Punto 19 — PDF ya en p360-patch-suite.js (no duplicar)
 */
(function () {
  'use strict';

  /* ─── store ─── */
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

  /* ─── toast ─── */
  function toast(msg, type) {
    const bg = type === 'error' ? '#dc2626' : type === 'warning' ? '#f59e0b' : '#10b981';
    const el = Object.assign(document.createElement('div'), {
      textContent: msg,
      style: `position:fixed;bottom:24px;right:24px;z-index:99999;padding:10px 18px;
        border-radius:8px;font-size:13px;font-weight:600;color:#fff;background:${bg};
        box-shadow:0 4px 20px rgba(0,0,0,.25);pointer-events:none`
    });
    document.body.appendChild(el);
    setTimeout(() => { el.style.cssText += ';transition:opacity .3s;opacity:0'; setTimeout(() => el.remove(), 350); }, 2500);
  }

  /* ─── date utils ─── */
  const toISO = d => d.toISOString().slice(0, 10);
  const parseISO = s => { if (!s) return null; const [y,m,d] = s.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)); };
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
  const diffDays = (a, b) => Math.round((b - a) / 86400000);
  const fmtDate = s => { if (!s) return ''; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };

  /* ══════════════════════════════════════════════════════════════════
     PUNTO 9 — BOTÓN "HOY"
  ══════════════════════════════════════════════════════════════════ */
  function injectTodayBtn() {
    if (document.getElementById('p360-today-btn')) return;

    // Buscar toolbar del Gantt — buscar el select de escala (Semana/Mes/etc.)
    const scaleSelect = document.querySelector('.toolbar select, .gantt-toolbar select, select.filter-select');
    if (!scaleSelect) return;

    const btn = document.createElement('button');
    btn.id = 'p360-today-btn';
    btn.textContent = '📅 Hoy';
    btn.title = 'Centrar la vista en la fecha de hoy';
    btn.className = 'btn';
    btn.style.marginLeft = '4px';

    btn.addEventListener('click', () => {
      // Buscar línea roja del hoy en el SVG
      const svg = document.getElementById('ganttSvg');
      const rightBody = document.getElementById('ganttRightBody') || document.querySelector('.right-body');
      if (!svg || !rightBody) { toast('Abrí un proyecto primero', 'warning'); return; }

      // La línea de hoy suele ser un <line> o <path> con clase today-line
      // o color rojo (#FF3366) en el SVG
      let todayX = null;

      // Intento 1: buscar elemento con clase
      const todayEl = svg.querySelector('.today-line, [class*="today"]');
      if (todayEl) {
        todayX = parseFloat(todayEl.getAttribute('x1') || todayEl.getAttribute('x') || '0');
      }

      // Intento 2: calcular por fecha
      if (todayX === null) {
        const store = getStore();
        if (!store) return;
        const tasks = store.tasks || [];
        if (!tasks.length) return;
        const proj = store.currentProject || {};
        let minD = tasks[0].start_date, maxD = tasks[0].end_date;
        tasks.forEach(t => { if (t.start_date < minD) minD = t.start_date; if (t.end_date > maxD) maxD = t.end_date; });
        if (proj.start_date < minD) minD = proj.start_date;
        if (proj.end_date > maxD) maxD = proj.end_date;
        const today = toISO(new Date());
        if (today < minD || today > maxD) { toast('Hoy está fuera del rango del proyecto', 'warning'); return; }
        const svgW = parseFloat(svg.getAttribute('width') || '0');
        const totalDays = diffDays(parseISO(minD), parseISO(maxD)) + 1;
        todayX = svgW * (diffDays(parseISO(minD), parseISO(today)) / totalDays);
      }

      const containerW = rightBody.clientWidth;
      rightBody.scrollLeft = Math.max(0, todayX - containerW / 2);
      const headerWrap = document.querySelector('.right-header-wrap');
      if (headerWrap) headerWrap.scrollLeft = rightBody.scrollLeft;
      toast('📅 Hoy', 'success');
    });

    // Insertar antes del select de escala
    scaleSelect.parentNode.insertBefore(btn, scaleSelect);
  }

  /* ══════════════════════════════════════════════════════════════════
     PUNTO 7 — TIPOS DE DEPENDENCIA FC/CC/FF/CF
     Mejora la celda PRED para mostrar info y acepta todos los tipos
  ══════════════════════════════════════════════════════════════════ */
  function patchPredCell() {
    // La celda PRED ya tiene _p360inlineEdit para "predecessors"
    // Solo necesitamos asegurarnos de que el placeholder y el hint sean correctos
    // Esto ya está en patch-v488167.js pero con placeholder "Ej: 3FC;5CC"
    // Actualizamos el hint del modal de tarea para CC/FF/CF
    const modal = document.querySelector('.modal');
    if (!modal || modal._p360depPatched) return;
    modal._p360depPatched = true;

    const predInputs = Array.from(modal.querySelectorAll('input')).filter(
      inp => inp.placeholder && inp.placeholder.includes('FC'));
    predInputs.forEach(inp => {
      inp.placeholder = 'Ej: 3FC;5CC;7FF;9CF+2d';
      if (!inp.nextElementSibling || !inp.nextElementSibling.classList.contains('p360-dep-legend')) {
        const leg = document.createElement('div');
        leg.className = 'p360-dep-legend';
        leg.style.cssText = 'font-size:11px;color:var(--text-3,#aaa);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap';
        leg.innerHTML = `
          <span><b style="color:#575756">FC</b> Fin→Comienzo</span>
          <span><b style="color:#3366FF">CC</b> Comienzo→Comienzo</span>
          <span><b style="color:#33CC99">FF</b> Fin→Fin</span>
          <span><b style="color:#FB7520">CF</b> Comienzo→Fin</span>
          <span style="color:var(--text-3)">  +Nd = lag en días</span>
        `;
        inp.parentNode.insertBefore(leg, inp.nextSibling);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     PUNTOS 1, 2, 3 — GRILLA TIPO EXCEL
     1. Navegación con Tab/Shift+Tab y Enter entre celdas
     2. Click simple sobre celda no-editing activa el editor
     3. Fila "+" al final para crear tarea rápida con Tab navegable
  ══════════════════════════════════════════════════════════════════ */

  /* ── 3. Tab/Enter entre celdas editables ── */
  let _tabEnabled = false;
  function enableCellNavigation() {
    if (_tabEnabled) return;
    _tabEnabled = true;

    // Los campos editables tienen clase .cell-ie
    // Al presionar Tab: avanzar al siguiente; Shift+Tab: retroceder
    // Al presionar Enter en un texto: guardar y bajar una fila al mismo campo
    document.addEventListener('keydown', e => {
      const active = document.activeElement;
      if (!active) return;
      const cell = active.closest('.cell-ie');
      if (!cell) return;

      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && cell.dataset.field !== 'predecessors')) {
        e.preventDefault();
        e.stopPropagation();

        const forward = !(e.shiftKey && e.key === 'Tab');

        // Commit primero (blur del input actual)
        try { active.blur(); } catch (_) {}

        setTimeout(() => {
          const row = cell.closest('.task-row');
          if (!row) return;

          if (e.key === 'Enter') {
            // Enter: misma columna, fila siguiente
            const allRows = Array.from(document.querySelectorAll('.left-body .task-row'));
            const rIdx = allRows.indexOf(row);
            const field = cell.dataset.field;
            const nextRow = allRows[rIdx + 1];
            if (nextRow) {
              const nextCell = nextRow.querySelector(`.cell-ie[data-field="${field}"]`);
              if (nextCell) {
                nextCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                setTimeout(() => nextCell.querySelector('input,select')?.focus(), 60);
              }
            }
          } else {
            // Tab: siguiente celda en la misma fila
            const allCells = Array.from(row.querySelectorAll('.cell-ie'));
            const cIdx = allCells.indexOf(cell);
            const nextCell = allCells[forward ? cIdx + 1 : cIdx - 1];
            if (nextCell) {
              nextCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
              setTimeout(() => nextCell.querySelector('input,select')?.focus(), 60);
            } else {
              // Pasar a la siguiente/anterior fila
              const allRows = Array.from(document.querySelectorAll('.left-body .task-row'));
              const rIdx = allRows.indexOf(row);
              const nextRow = allRows[rIdx + (forward ? 1 : -1)];
              if (nextRow) {
                const targetCells = Array.from(nextRow.querySelectorAll('.cell-ie'));
                const targetCell = forward ? targetCells[0] : targetCells[targetCells.length - 1];
                if (targetCell) {
                  try { active.blur(); } catch (_) {}
                  setTimeout(() => {
                    targetCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                    setTimeout(() => targetCell.querySelector('input,select')?.focus(), 60);
                  }, 50);
                }
              }
            }
          }
        }, 60);
      }

      // Escape: cerrar
      if (e.key === 'Escape') {
        try { active.blur(); } catch (_) {}
      }
    }, true);
  }

  /* ── 1. Single click activa edición (no doble click) ── */
  let _clickNavEnabled = false;
  function enableSingleClickEdit() {
    if (_clickNavEnabled) return;
    _clickNavEnabled = true;

    // Usamos delegación — click sobre .cell-ie que no esté editando
    document.addEventListener('click', e => {
      const cell = e.target.closest('.cell-ie');
      if (!cell || cell._editing) return;

      // No activar si el click fue sobre un link, botón, o elemento interno que ya manejó
      if (e.target.closest('a,button,input,select')) return;

      const store = getStore();
      if (!store?.canEdit) return;

      // Activar el editor igual que doble click
      // El handler onDoubleClick ya está en React, lo disparamos artificialmente
      // Solo si la celda no tiene un input activo
      if (!cell.querySelector('input,select')) {
        // Pequeño delay para distinguir de doble-click (que también lo activa)
        clearTimeout(cell._clickTimer);
        cell._clickTimer = setTimeout(() => {
          if (!cell._editing && !cell.querySelector('input,select')) {
            cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            setTimeout(() => cell.querySelector('input,select')?.focus(), 40);
          }
        }, 180);
      }
    }, true);

    // Si llega un dblclick, cancelar el timer del click simple
    document.addEventListener('dblclick', e => {
      const cell = e.target.closest('.cell-ie');
      if (cell) clearTimeout(cell._clickTimer);
    }, true);
  }

  /* ── 2. Fila rápida de creación al final ── */
  const QUICK_ROW_ID = 'p360-quick-row';

  function injectQuickRow() {
    const lb = document.querySelector('.left-body');
    if (!lb || lb.querySelector('#' + QUICK_ROW_ID)) return;
    const store = getStore();
    if (!store?.canEdit) return;

    // Obtener --col-tpl del split
    const split = document.querySelector('.gantt-split');
    const colTpl = split ? getComputedStyle(split).getPropertyValue('--col-tpl').trim() : '';
    const count = lb.querySelectorAll('.task-row').length;

    const row = document.createElement('div');
    row.id = QUICK_ROW_ID;
    row.style.cssText = `
      display:grid;grid-template-columns:${colTpl || 'auto 1fr'};
      align-items:center;min-height:30px;
      border-top:2px dashed var(--border,#e5e7eb);
      background:var(--surface,#fff);position:sticky;bottom:0;z-index:5;
    `;
    if (colTpl) row.style.gridTemplateColumns = colTpl;

    // Celda #
    const num = document.createElement('div');
    num.style.cssText = 'display:flex;align-items:center;justify-content:center;color:var(--text-3,#aaa);font-size:10px;padding:0 4px;';
    num.textContent = count + 1;

    // Celda nombre (col 2 del grid)
    const nameCell = document.createElement('div');
    nameCell.style.cssText = 'display:flex;align-items:center;padding:0 8px;overflow:hidden;grid-column:2;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '+ Nueva tarea  (Enter para crear, Tab para campos)';
    input.autocomplete = 'off';
    input.style.cssText = `
      width:100%;border:none;background:transparent;font-size:12px;
      color:var(--text,#1a1a2e);outline:none;padding:2px 0;font-family:inherit;
    `;
    input.addEventListener('focus', () => { input.style.borderBottom = '1.5px solid var(--brand-orange,#FB7520)'; });
    input.addEventListener('blur',  () => { input.style.borderBottom = ''; });

    input.addEventListener('keydown', async ev => {
      if (ev.key === 'Escape') { input.value = ''; input.blur(); return; }
      if (ev.key !== 'Enter' && ev.key !== 'Tab') return;
      ev.preventDefault();
      const name = input.value.trim();
      if (!name) { if (ev.key === 'Tab') input.blur(); return; }
      await createQuickTask(name, row, input, num);
    });

    nameCell.appendChild(input);
    row.appendChild(num);
    row.appendChild(nameCell);
    lb.appendChild(row);
  }

  async function createQuickTask(name, row, input, numEl) {
    const store = getStore();
    if (!store) { toast('Sin proyecto activo', 'error'); return; }
    row.style.opacity = '0.5'; row.style.pointerEvents = 'none';
    input.disabled = true; input.placeholder = 'Creando…';
    try {
      const today = toISO(new Date());
      const next7 = toISO(addDays(new Date(), 7));
      await store.saveTask({
        name, description: null, status: 'pending', priority: 'medium',
        start_date: today, end_date: next7, is_milestone: false,
        assigned_to: null, parent_task_id: null, progress: 0,
        task_type_category: null, task_type: null, project_obra_type: null,
        proy_obra_adm: null, demanda_recursos: null,
        duration_mode: 'habiles', bar_color: '#1d4ed8', link_urls: null
      }, null, '', store.tasks || []);
      toast(`✓ "${name}" creada`, 'success');
      input.value = '';
    } catch (err) {
      toast('Error: ' + (err.message || err), 'error');
    } finally {
      row.style.opacity = ''; row.style.pointerEvents = '';
      input.disabled = false; input.placeholder = '+ Nueva tarea  (Enter para crear, Tab para campos)';
      setTimeout(() => {
        const qr = document.querySelector('.left-body #' + QUICK_ROW_ID);
        if (qr) {
          const nc = document.querySelectorAll('.left-body .task-row').length;
          qr.querySelector('div').textContent = nc + 1;
          qr.querySelector('input').focus();
        }
      }, 600);
    }
  }

  /* ── Blur = commit al hacer clic fuera ── */
  document.addEventListener('mousedown', ev => {
    document.querySelectorAll('.cell-ie input, .cell-ie select').forEach(inp => {
      if (inp !== ev.target && !inp.contains(ev.target)) {
        setTimeout(() => { try { inp.blur(); } catch (_) {} }, 30);
      }
    });
  }, true);

  /* ══════════════════════════════════════════════════════════════════
     CSS
  ══════════════════════════════════════════════════════════════════ */
  const style = document.createElement('style');
  style.id = 'p360-ux-css';
  style.textContent = `
    /* Celda seleccionable al hover */
    .cell-ie:hover:not([data-editing]) {
      background: var(--surface-2, rgba(251,117,32,.04)) !important;
      cursor: cell;
    }
    /* Focus ring cuando está editando */
    .cell-ie:has(input:focus), .cell-ie:has(select:focus) {
      box-shadow: inset 0 0 0 1.5px var(--brand-orange, #FB7520);
      border-radius: 3px;
    }
    /* Leyenda de dependencias en el modal */
    .p360-dep-legend b { font-family: 'JetBrains Mono', monospace; font-size: 11px; }
    /* Fila rápida */
    #${QUICK_ROW_ID}:hover { background: var(--surface-2, #f8f9fa) !important; }
  `;
  document.head.appendChild(style);

  /* ══════════════════════════════════════════════════════════════════
     OBSERVER ÚNICO — debounced, se auto-desconecta
  ══════════════════════════════════════════════════════════════════ */
  let _lbObs = null, _lbTimer = null, _initDone = false, _mainDone = false;

  function onDomChange() {
    // Punto 9 — botón Hoy
    injectTodayBtn();

    // Punto 7 — hint en modal de tarea
    patchPredCell();

    // Puntos 1, 2, 3 — navegación y fila rápida
    if (!_initDone) {
      enableCellNavigation();
      enableSingleClickEdit();
      _initDone = true;
    }

    // Fila rápida — observar left-body
    if (!_lbObs) {
      const lb = document.querySelector('.left-body');
      if (lb) {
        injectQuickRow();
        _lbObs = new MutationObserver(() => {
          clearTimeout(_lbTimer);
          _lbTimer = setTimeout(injectQuickRow, 300);
        });
        _lbObs.observe(lb, { childList: true });
      }
    }

    // ¿Todo listo?
    if (document.getElementById('p360-today-btn') && _lbObs && _initDone && !_mainDone) {
      _mainDone = true;
      mainObs.disconnect();
    }
  }

  let _mainTimer = null;
  const mainObs = new MutationObserver(() => {
    clearTimeout(_mainTimer);
    _mainTimer = setTimeout(onDomChange, 300);
  });
  mainObs.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => mainObs.disconnect(), 60000);
  setTimeout(onDomChange, 900);

})();
