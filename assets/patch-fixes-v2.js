/**
 * Buildplan 360 — Patch Fixes v2
 *
 * 1. Fix columna link_urls en schema cache (ya agregada en DB)
 * 2. Edición inline: guardar con Enter O al perder foco (blur)
 *    — en celdas de texto libre (tableros, nivel, rubro, contratista)
 *    — ya funcionaba así; acá nos aseguramos de que TODAS las celdas
 *    — cierren y guarden también cuando el usuario hace clic fuera
 * 3. Fila nueva al final del Gantt para crear tarea rápida tipo Excel
 */
(function() {
  'use strict';

  /* ══════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════ */
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

  function getStore() {
    const root = document.getElementById('root');
    if (!root) return null;
    const fk = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fk) return null;
    function walk(f, d) {
      if (!f || d > 80) return null;
      const s = f.memoizedState;
      if (s && s.memoizedState && typeof s.memoizedState.saveTask === 'function') return s.memoizedState;
      return walk(f.child, d+1) || walk(f.sibling, d+1);
    }
    return walk(root[fk], 0);
  }

  function showToast(msg, type) {
    // Usa el sistema Q() del bundle si está disponible en window
    try {
      const root = document.getElementById('root');
      const fk = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      function walk(f, d) {
        if (!f || d > 80) return null;
        const s = f.memoizedState;
        if (s && s.memoizedState && Array.isArray(s.memoizedState) && s.queue && s.queue.dispatch) return s.queue.dispatch;
        return walk(f.child, d+1) || walk(f.sibling, d+1);
      }
    } catch(e) {}
    // Fallback visual simple
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:99999;
      padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;
      color:#fff;background:${type==='error'?'#dc2626':type==='warning'?'#f59e0b':'#10b981'};
      box-shadow:0 4px 20px rgba(0,0,0,.25);transition:opacity .3s`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(), 300); }, 2500);
  }

  /* ══════════════════════════════════════════════════
     1. PATCH INLINE EDIT: asegurar blur = commit en TODAS
        las celdas (tableros, nivel, rubro, contratista, nombre)
        El problema original: a veces el onblur no dispara
        porque React re-renderiza el DOM. Acá usamos
        document-level mousedown para detectar "clic afuera".
  ══════════════════════════════════════════════════ */
  function patchInlineEditBlur() {
    // Escuchar mousedown a nivel documento; si hay un input activo
    // de edición inline y el clic es fuera, forzar commit
    document.addEventListener('mousedown', function(e) {
      const activeInputs = document.querySelectorAll('.cell-ie input, .cell-ie select');
      activeInputs.forEach(inp => {
        if (!inp.contains(e.target) && inp !== e.target) {
          // Forzar blur para que el onblur del patch-v488167 dispare commit
          setTimeout(() => {
            try { inp.blur(); } catch(err) {}
          }, 50);
        }
      });
    }, true);

    // Interceptar también el Escape global para cerrar inputs abiertos
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        const activeInputs = document.querySelectorAll('.cell-ie input, .cell-ie select');
        activeInputs.forEach(inp => {
          try { inp.blur(); } catch(err) {}
        });
      }
    }, true);
  }

  /* ══════════════════════════════════════════════════
     2. FILA NUEVA RÁPIDA TIPO EXCEL
        Agrega una fila "+ Nueva tarea" al final de la
        grilla del Gantt. Al tipear el nombre y presionar
        Enter (o Tab) crea la tarea inmediatamente.
  ══════════════════════════════════════════════════ */
  const QUICK_ROW_ID = 'p360-quick-add-row';

  function injectQuickAddStyles() {
    if (document.getElementById('p360-quick-add-css')) return;
    const style = document.createElement('style');
    style.id = 'p360-quick-add-css';
    style.textContent = `
      .p360-quick-add-row {
        display: grid;
        grid-template-columns: var(--col-tpl);
        align-items: center;
        min-height: 32px;
        border-bottom: 1px solid var(--border, #e2e8f0);
        padding: 0;
        background: var(--surface, #fff);
        position: sticky;
        bottom: 0;
        z-index: 5;
      }
      .p360-quick-add-row:hover {
        background: var(--surface-2, #f8f9fa);
      }
      .p360-quick-add-num {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-3, #aaa);
        font-size: 10px;
        padding: 0 4px;
      }
      .p360-quick-add-cell {
        display: flex;
        align-items: center;
        padding: 0 6px;
        overflow: hidden;
      }
      .p360-quick-add-input {
        width: 100%;
        border: none;
        background: transparent;
        font-size: 12px;
        color: var(--text, #1a1a2e);
        outline: none;
        padding: 2px 0;
        font-family: inherit;
      }
      .p360-quick-add-input::placeholder {
        color: var(--text-3, #aaa);
        font-style: italic;
      }
      .p360-quick-add-input:focus {
        border-bottom: 1.5px solid var(--brand-orange, #FB7520);
      }
      .p360-quick-add-input:focus::placeholder {
        opacity: 0.4;
      }
      .p360-quick-add-hint {
        font-size: 9px;
        color: var(--text-3, #aaa);
        white-space: nowrap;
        margin-left: 6px;
        flex-shrink: 0;
      }
      .p360-quick-creating {
        opacity: 0.5;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function injectQuickAddRow() {
    // Solo en vista Gantt con left-body visible
    const leftBody = document.querySelector('.left-body');
    if (!leftBody) return;
    if (leftBody.querySelector('#' + QUICK_ROW_ID)) return;

    const store = getStore();
    if (!store || !store.canEdit) return; // Solo para editores/admins

    // Obtener colTpl y número de tareas visibles
    const ganttSplit = document.querySelector('.gantt-split');
    const colTpl = ganttSplit ? getComputedStyle(ganttSplit).getPropertyValue('--col-tpl') : '';
    const taskCount = leftBody.querySelectorAll('.task-row').length;

    const row = document.createElement('div');
    row.id = QUICK_ROW_ID;
    row.className = 'p360-quick-add-row';
    if (colTpl) row.style.setProperty('--col-tpl', colTpl);

    // Celda #
    const numCell = document.createElement('div');
    numCell.className = 'p360-quick-add-num';
    numCell.textContent = taskCount + 1;

    // Celda nombre (la más importante)
    const nameCell = document.createElement('div');
    nameCell.className = 'p360-quick-add-cell';
    nameCell.style.gridColumn = 'span 1';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'p360-quick-add-input';
    input.placeholder = '+ Nueva tarea (Enter para crear)';
    input.autocomplete = 'off';

    const hint = document.createElement('span');
    hint.className = 'p360-quick-add-hint';
    hint.textContent = '↵ Enter';
    hint.style.display = 'none';

    input.addEventListener('focus', () => { hint.style.display = 'inline'; });
    input.addEventListener('blur', () => { hint.style.display = 'none'; });
    input.addEventListener('input', () => {
      hint.style.display = input.value.trim() ? 'inline' : 'none';
    });

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') {
        input.value = '';
        input.blur();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const name = input.value.trim();
        if (!name) return;
        await createQuickTask(name, row, input, numCell);
      }
    });

    nameCell.appendChild(input);
    nameCell.appendChild(hint);

    row.appendChild(numCell);
    row.appendChild(nameCell);

    leftBody.appendChild(row);
  }

  async function createQuickTask(name, row, input, numCell) {
    const store = getStore();
    if (!store) { showToast('No se pudo acceder al proyecto', 'error'); return; }

    row.classList.add('p360-quick-creating');
    input.disabled = true;
    input.placeholder = 'Creando...';

    try {
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7*86400000).toISOString().split('T')[0];

      const taskData = {
        name: name,
        description: null,
        status: 'pending',
        priority: 'medium',
        start_date: today,
        end_date: nextWeek,
        is_milestone: false,
        assigned_to: null,
        parent_task_id: null,
        progress: 0,
        task_type_category: null,
        task_type: null,
        project_obra_type: null,
        proy_obra_adm: null,
        demanda_recursos: null,
        duration_mode: 'habiles',
        bar_color: '#1d4ed8',
        link_urls: null
      };

      // Usar saveTask del store (null = nueva tarea, '' = sin predecesoras)
      await store.saveTask(taskData, null, '', store.tasks ? store.tasks.filter(t=>!t._isSummary) : []);

      showToast(`✓ "${name}" creada`, 'success');

      // Limpiar y actualizar contador
      input.value = '';
      input.disabled = false;
      input.placeholder = '+ Nueva tarea (Enter para crear)';
      row.classList.remove('p360-quick-creating');

      // Actualizar número de fila
      const newCount = document.querySelectorAll('.left-body .task-row').length;
      numCell.textContent = newCount + 1;

      // Mantener foco para seguir creando tareas
      setTimeout(() => input.focus(), 100);

    } catch(err) {
      console.error('Quick create error:', err);
      showToast('Error al crear: ' + (err.message || err), 'error');
      input.disabled = false;
      input.value = name;
      input.placeholder = '+ Nueva tarea (Enter para crear)';
      row.classList.remove('p360-quick-creating');
    }
  }

  /* ══════════════════════════════════════════════════
     OBSERVER: re-inyectar la fila cuando el DOM cambie
     (React re-renderiza y la elimina al crear una tarea)
  ══════════════════════════════════════════════════ */
  let _quickAddTimer = null;
  function scheduleQuickAddInject() {
    clearTimeout(_quickAddTimer);
    _quickAddTimer = setTimeout(() => {
      injectQuickAddRow();
      // Actualizar --col-tpl si cambió
      const row = document.getElementById(QUICK_ROW_ID);
      if (row) {
        const ganttSplit = document.querySelector('.gantt-split');
        const colTpl = ganttSplit ? getComputedStyle(ganttSplit).getPropertyValue('--col-tpl') : '';
        if (colTpl) row.style.setProperty('--col-tpl', colTpl);
        // Actualizar número
        const numCell = row.querySelector('.p360-quick-add-num');
        if (numCell) {
          const count = document.querySelectorAll('.left-body .task-row').length;
          numCell.textContent = count + 1;
        }
      }
    }, 400);
  }

  const quickAddObs = new MutationObserver(scheduleQuickAddInject);

  function startQuickAddObserver() {
    const leftBody = document.querySelector('.left-body');
    if (leftBody && !leftBody._p360observed) {
      leftBody._p360observed = true;
      quickAddObs.observe(leftBody, { childList: true, subtree: false });
    }
    // También observar cambios de tab (gantt ↔ lista)
    const ganttContainer = document.querySelector('.gantt-split');
    if (!ganttContainer) return;
    if (!ganttContainer._p360tabObs) {
      ganttContainer._p360tabObs = true;
      new MutationObserver(scheduleQuickAddInject).observe(ganttContainer, { childList: true, subtree: true });
    }
  }

  /* ══════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════ */
  function init() {
    injectQuickAddStyles();
    patchInlineEditBlur();

    // Polling para inyectar la fila cuando aparezca el Gantt
    let attempts = 0;
    const tryInject = () => {
      injectQuickAddRow();
      startQuickAddObserver();
      attempts++;
      if (attempts < 30) setTimeout(tryInject, 1000);
    };
    setTimeout(tryInject, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }

})();
