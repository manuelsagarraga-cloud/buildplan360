/**
 * Buildplan 360 — Patch Fixes v2 (REWRITE seguro)
 *
 * 1. Edición inline: guardar al perder foco (blur / clic afuera)
 * 2. Fila nueva rápida tipo Excel al final del Gantt
 *
 * PERFORMANCE: sin setIntervals ni observers sobre body.
 * Usa un único observer sobre .left-body debounced.
 */
(function () {
  'use strict';

  /* ══ helpers ══════════════════════════════════════════ */
  function getStore() {
    const root = document.getElementById('root');
    if (!root) return null;
    const fk = Object.keys(root).find(k =>
      k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fk) return null;
    function walk(f, d) {
      if (!f || d > 90) return null;
      const s = f.memoizedState;
      if (s && s.memoizedState && typeof s.memoizedState.saveTask === 'function')
        return s.memoizedState;
      return walk(f.child, d + 1) || walk(f.sibling, d + 1);
    }
    return walk(root[fk], 0);
  }

  function showToast(msg, type) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:99999;
      padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;
      color:#fff;background:${type==='error'?'#dc2626':type==='warning'?'#f59e0b':'#10b981'};
      box-shadow:0 4px 20px rgba(0,0,0,.25);pointer-events:none`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s';
      setTimeout(() => t.remove(), 350); }, 2500);
  }

  /* ══ 1. FIX BLUR EN EDICIÓN INLINE ══════════════════ */
  // Cuando el usuario hace clic fuera de una celda en edición,
  // forzamos blur para que patch-v488167 haga commit.
  document.addEventListener('mousedown', e => {
    document.querySelectorAll('.cell-ie input, .cell-ie select').forEach(inp => {
      if (inp !== e.target && !inp.contains(e.target)) {
        setTimeout(() => { try { inp.blur(); } catch (_) {} }, 30);
      }
    });
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.cell-ie input, .cell-ie select').forEach(inp => {
      try { inp.blur(); } catch (_) {}
    });
  }, true);

  /* ══ 2. FILA RÁPIDA TIPO EXCEL ═══════════════════════ */
  const CSS_ID  = 'p360-qa-css';
  const ROW_ID  = 'p360-qa-row';

  function injectCSS() {
    if (document.getElementById(CSS_ID)) return;
    const s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = `
      #${ROW_ID} {
        display: grid;
        grid-template-columns: var(--col-tpl);
        align-items: center;
        min-height: 30px;
        border-top: 2px dashed var(--border,#e2e8f0);
        background: var(--surface,#fff);
        position: sticky;
        bottom: 0;
        z-index: 5;
      }
      #${ROW_ID}:hover { background: var(--surface-2,#f8f9fa); }
      .p360-qa-num {
        display:flex;align-items:center;justify-content:center;
        color:var(--text-3,#aaa);font-size:10px;padding:0 4px;
      }
      .p360-qa-cell {
        display:flex;align-items:center;padding:0 6px;overflow:hidden;grid-column:2;
      }
      .p360-qa-input {
        width:100%;border:none;background:transparent;font-size:12px;
        color:var(--text,#1a1a2e);outline:none;padding:2px 0;font-family:inherit;
      }
      .p360-qa-input::placeholder { color:var(--text-3,#aaa);font-style:italic; }
      .p360-qa-input:focus { border-bottom:1.5px solid var(--brand-orange,#FB7520); }
      .p360-qa-hint {
        font-size:9px;color:var(--text-3,#aaa);white-space:nowrap;
        margin-left:6px;flex-shrink:0;display:none;
      }
      .p360-qa-busy { opacity:.5;pointer-events:none; }
    `;
    document.head.appendChild(s);
  }

  function injectRow() {
    const leftBody = document.querySelector('.left-body');
    if (!leftBody) return;
    // No inyectar si ya existe
    if (leftBody.querySelector('#' + ROW_ID)) return;

    const store = getStore();
    if (!store || !store.canEdit) return;

    // Obtener col-tpl del split padre
    const split = document.querySelector('.gantt-split');
    const colTpl = split
      ? getComputedStyle(split).getPropertyValue('--col-tpl').trim()
      : '';

    const row = document.createElement('div');
    row.id = ROW_ID;
    if (colTpl) row.style.setProperty('--col-tpl', colTpl);

    const numCell = document.createElement('div');
    numCell.className = 'p360-qa-num';
    const count = leftBody.querySelectorAll('.task-row').length;
    numCell.textContent = count + 1;

    const cell = document.createElement('div');
    cell.className = 'p360-qa-cell';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'p360-qa-input';
    input.placeholder = '+ Nueva tarea — escribí y presioná Enter';
    input.autocomplete = 'off';

    const hint = document.createElement('span');
    hint.className = 'p360-qa-hint';
    hint.textContent = '↵ Enter';

    input.addEventListener('focus', () => { hint.style.display = 'inline'; });
    input.addEventListener('blur',  () => { hint.style.display = 'none'; });

    input.addEventListener('keydown', async e => {
      if (e.key === 'Escape') { input.value = ''; input.blur(); return; }
      if (e.key !== 'Enter' && e.key !== 'Tab') return;
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      await createTask(name, row, input, numCell);
    });

    cell.appendChild(input);
    cell.appendChild(hint);
    row.appendChild(numCell);
    row.appendChild(cell);
    leftBody.appendChild(row);
  }

  async function createTask(name, row, input, numCell) {
    const store = getStore();
    if (!store) { showToast('Error: no hay proyecto activo', 'error'); return; }

    row.classList.add('p360-qa-busy');
    input.disabled = true;
    input.placeholder = 'Creando…';

    try {
      const today    = new Date().toISOString().slice(0, 10);
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const data = {
        name, description: null,
        status: 'pending', priority: 'medium',
        start_date: today, end_date: nextWeek,
        is_milestone: false, assigned_to: null, parent_task_id: null,
        progress: 0, task_type_category: null, task_type: null,
        project_obra_type: null, proy_obra_adm: null, demanda_recursos: null,
        duration_mode: 'habiles', bar_color: '#1d4ed8', link_urls: null
      };
      // visibleTasks como contexto de numeración
      const vis = store.tasks || [];
      await store.saveTask(data, null, '', vis);
      showToast(`✓ "${name}" creada`, 'success');
      input.value = '';
    } catch (err) {
      showToast('Error: ' + (err.message || err), 'error');
      input.value = name;
    } finally {
      input.disabled = false;
      input.placeholder = '+ Nueva tarea — escribí y presioná Enter';
      row.classList.remove('p360-qa-busy');
      setTimeout(() => {
        const nb = document.querySelector('.left-body #' + ROW_ID);
        if (nb) {
          const c2 = document.querySelectorAll('.left-body .task-row').length;
          nb.querySelector('.p360-qa-num').textContent = c2 + 1;
          nb.querySelector('.p360-qa-input').focus();
        }
      }, 600);
    }
  }

  /* ══ OBSERVER ÚNICO SOBRE .left-body ════════════════ */
  injectCSS();
  let _lbObs = null;
  let _lbTimer = null;

  function watchLeftBody() {
    const lb = document.querySelector('.left-body');
    if (!lb) return;
    if (_lbObs) return; // ya observando

    injectRow(); // primera vez

    _lbObs = new MutationObserver(() => {
      // Debounce 250ms
      clearTimeout(_lbTimer);
      _lbTimer = setTimeout(injectRow, 250);
    });
    // Solo childList directo del left-body (NO subtree)
    _lbObs.observe(lb, { childList: true });
  }

  // Esperar a que aparezca el left-body sin polling agresivo
  // Usamos un observer sobre #root (un nivel, sin subtree profundo)
  const rootObs = new MutationObserver(() => {
    watchLeftBody();
  });
  const root = document.getElementById('root');
  if (root) rootObs.observe(root, { childList: true, subtree: true });

  // Primer intento
  setTimeout(watchLeftBody, 1200);

})();
