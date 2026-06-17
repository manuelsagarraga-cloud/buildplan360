/**
 * Buildplan 360 — Patch Fixes v1 (REWRITE seguro)
 *
 * 1. Vincular N tareas consecutivamente
 * 2. Logo duplicado: ocultar texto pequeño
 * 3. Bombita solo visible para admin
 * 4. Altura del Gantt ajustable con drag handle
 *
 * PERFORMANCE: un único MutationObserver debounced sobre document.body
 * en lugar de múltiples observers + setIntervals.
 */
(function () {
  'use strict';

  /* ══ 1. LOGO DUPLICADO ══════════════════════════════ */
  (function fixLogo() {
    const s = document.createElement('style');
    s.textContent = '.sidebar-logo-sub{display:none!important}';
    document.head.appendChild(s);
  })();

  /* ══ 2. BOMBITA SOLO ADMIN ═══════════════════════════ */
  (function fixBombita() {
    const s = document.createElement('style');
    s.textContent = `
      .p360-hint-btn{display:none!important}
      body.p360-admin .p360-hint-btn{display:inline-flex!important}
    `;
    document.head.appendChild(s);
  })();

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

  /* ══ 3. VINCULAR N TAREAS ════════════════════════════ */
  function patchVincularBtn() {
    const btn = document.querySelector(
      'button[title="Vincular 2 tareas seleccionadas"]');
    if (!btn || btn._p360vp) return;
    btn._p360vp = true;

    const nb = btn.cloneNode(true);
    btn.parentNode.replaceChild(nb, btn);
    nb._p360vp = true;
    nb.title = 'Vincular tareas seleccionadas (2 o más, en cadena)';

    nb.addEventListener('click', async () => {
      const store = getStore();
      if (!store) return;

      const rows  = Array.from(document.querySelectorAll('.left-body .task-row'));
      const selRows = rows.filter(r => {
        const cb = r.querySelector('input[type="checkbox"]');
        return cb && cb.checked;
      });

      if (selRows.length < 2) {
        showToast('Seleccioná al menos 2 tareas para vincular', 'warning');
        return;
      }

      const ids = selRows.map(r => {
        const c = r.querySelector('[data-taskid]');
        return c ? c.dataset.taskid : null;
      }).filter(Boolean);

      if (ids.length < 2) {
        showToast('No se pudieron identificar las tareas', 'error');
        return;
      }

      let linked = 0;
      for (let i = 0; i < ids.length - 1; i++) {
        try { await store.linkTasks(ids[i], ids[i + 1]); linked++; }
        catch (e) { console.warn('link error', e); }
      }
      showToast(`${linked} dependencia(s) FC creada(s)`, 'success');
    });
  }

  /* ══ 4. DRAG HANDLE ALTURA GANTT ════════════════════ */
  function injectHeightHandle() {
    const gs = document.querySelector('.gantt-split');
    if (!gs || gs.querySelector('.p360-h-handle')) return;

    const handle = document.createElement('div');
    handle.className = 'p360-h-handle';
    handle.title = 'Arrastrá para ajustar la altura';
    handle.style.cssText = `
      position:absolute;bottom:0;left:0;right:0;height:6px;
      background:var(--border,#e2e8f0);cursor:ns-resize;z-index:10;
      display:flex;align-items:center;justify-content:center;
    `;
    handle.innerHTML = '<span style="color:#aaa;font-size:12px;line-height:1;pointer-events:none">⋯</span>';

    gs.style.position = 'relative';
    gs.appendChild(handle);

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = gs.offsetHeight;
      const onMove = ev => {
        const h = Math.max(200, Math.min(window.innerHeight - 100, startH + ev.clientY - startY));
        gs.style.height = h + 'px';
        gs.style.flex = 'none';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  /* ══ TOAST ═══════════════════════════════════════════ */
  function showToast(msg, type) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:99999;
      padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;
      color:#fff;background:${type==='error'?'#dc2626':type==='warning'?'#f59e0b':'#10b981'};
      box-shadow:0 4px 20px rgba(0,0,0,.25);pointer-events:none;
      animation:p360fadeIn .2s ease`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s';
      setTimeout(() => t.remove(), 350); }, 2500);
  }

  /* ══ UN ÚNICO OBSERVER DEBOUNCED ════════════════════ */
  let _timer = null;
  let _adminChecked = false;

  function onDomChange() {
    // Vincular botón
    patchVincularBtn();
    // Handle de altura
    injectHeightHandle();
    // Verificar admin (solo una vez por sesión)
    if (!_adminChecked) {
      const store = getStore();
      if (store) {
        _adminChecked = true;
        if (store.canAdmin) document.body.classList.add('p360-admin');
        // Re-verificar si cambia la sesión
        setInterval(() => {
          const s = getStore();
          if (!s) return;
          document.body.classList.toggle('p360-admin', !!s.canAdmin);
          // Ocultar 💡 si no es admin
          if (!s.canAdmin) {
            document.querySelectorAll('button').forEach(b => {
              if (b.innerHTML.includes('💡') && !b._p360bombita) {
                b._p360bombita = true;
                b.style.display = 'none';
              }
            });
          }
        }, 5000); // cada 5s es suficiente
      }
    }
  }

  // Debounce: no ejecutar más de una vez cada 300ms
  function debounced() {
    clearTimeout(_timer);
    _timer = setTimeout(onDomChange, 300);
  }

  // Disconnectamos el observer una vez que el botón y el handle estén listos,
  // para no mantenerlo activo indefinidamente.
  let _obsActive = true;
  const obs = new MutationObserver(debounced);
  obs.observe(document.body, { childList: true, subtree: true });

  // Desconectar después de 30s (la app ya estará estable) o cuando todo esté listo
  setTimeout(() => {
    if (_obsActive) { obs.disconnect(); _obsActive = false; }
  }, 30000);

  // CSS handle
  const s = document.createElement('style');
  s.textContent = `
    .p360-h-handle:hover { background: var(--brand-orange,#FB7520) !important; }
  `;
  document.head.appendChild(s);

  // Primera ejecución
  setTimeout(onDomChange, 800);

})();
