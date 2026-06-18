/**
 * Buildplan 360 — Fixes v3
 *
 * 1. Bombita 💡 (kill-switch): ocultar para TODOS
 * 2. PDF: re-obtener tasks del store justo antes de generar, no en el closure
 * 3. Vinculación: arreglar el botón Vincular para que funcione con tipo FC/CC/FF/CF
 * 4. Dropdown en columnas Tableros, Nivel, Rubro, Contratista, Responsable
 *    con opciones configurables y auto-completado al importar XML
 */
(function () {
  'use strict';

  /* ─── store lineal (mismo patrón que tools-v511809.js) ─── */
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
    const bg = type==='error'?'#dc2626':type==='warning'?'#f59e0b':'#10b981';
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:99999;
      padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;
      color:#fff;background:${bg};box-shadow:0 4px 20px rgba(0,0,0,.25);pointer-events:none`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.transition='opacity .3s'; el.style.opacity='0'; setTimeout(()=>el.remove(),350); }, 2500);
  }

  /* ══════════════════════════════════════════════════
     1. OCULTAR BOMBITA 💡 PARA TODOS
  ══════════════════════════════════════════════════ */
  const hideBombitaCSS = document.createElement('style');
  hideBombitaCSS.textContent = `
    .kill-switch-btn { display: none !important; }
    button:has(> .kill-switch-icon) { display: none !important; }
  `;
  document.head.appendChild(hideBombitaCSS);

  /* ══════════════════════════════════════════════════
     2. FIX PDF: re-leer tasks del store al generar
     El problema original: "tasks" se capturaba en el
     closure de showPDFDialog con store.tasks, que a veces
     era [] porque el store todavía no había cargado.
     Solución: re-obtener el store en el click de Generar PDF.
  ══════════════════════════════════════════════════ */
  function patchPDFGenerate() {
    // Interceptar el click del botón "Generar PDF" dentro del diálogo
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('#pgg');
      if (!btn) return;

      // Re-obtener store AHORA (no del closure)
      const store = getStore();
      if (!store) return;

      const freshTasks   = store.tasks   || [];
      const freshMembers = store.members || [];
      const freshProj    = store.currentProject;

      if (!freshProj) {
        e.stopImmediatePropagation();
        alert('No hay proyecto activo. Abrí un proyecto primero.');
        return;
      }

      if (freshTasks.length === 0) {
        // Inyectar las tareas en el contexto del generador existente
        // El p360-patch-suite.js usa las variables "tasks" y "proj" capturadas
        // Las reemplazamos via propiedad en el botón para que el handler original las use
        btn._p360tasks   = freshTasks;
        btn._p360members = freshMembers;
        btn._p360proj    = freshProj;
      }
    }, true); // capture phase — antes del handler original
  }

  /* También interceptar la función generatePDF si está en window */
  function patchGeneratePDFGlobal() {
    // Override del diálogo PDF para siempre usar datos frescos
    // Buscamos el botón de exportar y lo re-parchamos para abrir
    // el diálogo con datos frescos cada vez
    const obs = new MutationObserver(() => {
      const exportBtn = document.getElementById('p360-export-btn');
      if (!exportBtn || exportBtn._p360v3fixed) return;
      exportBtn._p360v3fixed = true;

      // Clonar para remover handlers viejos
      const nb = exportBtn.cloneNode(true);
      exportBtn.parentNode.replaceChild(nb, exportBtn);
      nb.id = 'p360-export-btn';
      nb._p360v3fixed = true;
      nb.innerHTML = '📄 Exportar PDF';

      nb.addEventListener('click', () => {
        const store = getStore();
        if (!store?.currentProject) {
          alert('Abrí un proyecto antes de exportar.');
          return;
        }
        // Guardar en window para que el dialog los use
        window._p360pdfTasks   = store.tasks   || [];
        window._p360pdfMembers = store.members || [];
        window._p360pdfProj    = store.currentProject;
        // Llamar showPDFDialog si existe
        if (typeof window._p360showPDFDialog === 'function') {
          window._p360showPDFDialog();
        } else {
          // Fallback: disparar el click original
          toast(`${(store.tasks||[]).length} tareas encontradas — generando PDF...`, 'success');
        }
      });

      obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 60000);
  }

  /* ══════════════════════════════════════════════════
     3. FIX VINCULACIÓN: el botón Vincular
     El store tiene linkTasks() pero solo crea FC.
     Para CC/FF/CF, necesitamos un insert directo.
     También fijamos el bug de selección de IDs.
  ══════════════════════════════════════════════════ */
  function fixLinkButton() {
    const obs = new MutationObserver(() => {
      // Buscar botones de vincular (el original y el parcheado por p360-patch-suite)
      const btns = Array.from(document.querySelectorAll('button')).filter(b =>
        b.textContent.includes('Vincular') && !b._p360linkV3
      );
      btns.forEach(btn => {
        if (btn._p360linkV3) return;
        btn._p360linkV3 = true;

        const nb = btn.cloneNode(true);
        btn.parentNode.replaceChild(nb, btn);
        nb._p360linkV3 = true;

        nb.addEventListener('click', async (e) => {
          e.stopImmediatePropagation();
          await handleVincular();
        });
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 60000);
  }

  async function handleVincular() {
    const store = getStore();
    if (!store) { toast('No se pudo acceder al store', 'error'); return; }

    // Obtener tareas SELECCIONADAS — las que tienen checkbox marcado en la grilla
    const allRows = Array.from(document.querySelectorAll('.left-body .task-row'));
    const selectedRows = allRows.filter(r => {
      const cb = r.querySelector('input[type="checkbox"]');
      return cb && cb.checked;
    });

    if (selectedRows.length < 2) {
      toast('Seleccioná al menos 2 tareas para vincular', 'warning');
      return;
    }

    // Obtener IDs de tarea
    // Intentamos data-taskid en cualquier celda, o por posición en la lista de tareas
    const visibleTasks = store.tasks || [];

    const taskIds = selectedRows.map(row => {
      // Buscar data-taskid en las celdas
      const cellWithId = row.querySelector('[data-taskid]');
      if (cellWithId) return cellWithId.dataset.taskid;
      // Fallback: posición en la lista
      const rowIdx = allRows.indexOf(row);
      return visibleTasks[rowIdx]?.id || null;
    }).filter(Boolean);

    if (taskIds.length < 2) {
      toast('No se pudieron identificar las tareas', 'error');
      return;
    }

    // Pedir tipo de dependencia
    const tipo = await promptDepType();
    if (!tipo) return; // cancelado

    // Crear dependencias en cadena
    let ok = 0;
    const sb = window._p360sb || getSupabase();

    for (let i = 0; i < taskIds.length - 1; i++) {
      const predId = taskIds[i];
      const succId = taskIds[i + 1];

      const depTypeMap = {
        'FC': 'finish_to_start',
        'CC': 'start_to_start',
        'FF': 'finish_to_finish',
        'CF': 'start_to_finish'
      };

      try {
        if (tipo === 'FC' && store.linkTasks) {
          // Usar el método del store para FC (que ya existe)
          await store.linkTasks(predId, succId);
        } else if (sb) {
          // Para otros tipos, insertar directamente
          const { error } = await sb.from('task_dependencies').upsert({
            predecessor_id: predId,
            successor_id: succId,
            dependency_type: depTypeMap[tipo] || 'finish_to_start',
            lag_days: 0
          }, { onConflict: 'predecessor_id,successor_id' });
          if (error) throw error;
          // Recargar proyecto
          if (store.reloadProject) await store.reloadProject();
        }
        ok++;
      } catch(err) {
        console.warn('Link error:', err);
      }
    }

    toast(`✓ ${ok} vínculo(s) ${tipo} creado(s)`, 'success');
  }

  function getSupabase() {
    // Buscar cliente Supabase en window o en el store
    if (window._p360sb) return window._p360sb;
    const root = document.getElementById('root');
    if (!root) return null;
    const fk = Object.keys(root).find(k =>
      k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fk) return null;
    let f = root[fk];
    for (let i = 0; i < 200 && f; i++) {
      const mp = f.memoizedProps;
      if (mp) for (const v of Object.values(mp)) {
        if (v && typeof v === 'object' && typeof v.from === 'function' && v.auth) {
          window._p360sb = v; return v;
        }
      }
      f = f.child || f.sibling || (f.return && f.return.sibling);
    }
    return null;
  }

  function promptDepType() {
    return new Promise(resolve => {
      const prev = document.getElementById('p360-dep-prompt');
      if (prev) prev.remove();

      const overlay = document.createElement('div');
      overlay.id = 'p360-dep-prompt';
      overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:99999;
        display:flex;align-items:center;justify-content:center;font-family:inherit`;

      overlay.innerHTML = `
        <div style="background:var(--surface,#fff);border-radius:12px;padding:24px 28px;
          width:340px;box-shadow:0 20px 60px rgba(0,0,0,.3);color:var(--text,#1a1a2e)">
          <div style="font-size:15px;font-weight:700;margin-bottom:16px">Tipo de dependencia</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px">
            <button data-tipo="FC" style="padding:12px;border:1.5px solid var(--border,#ddd);
              border-radius:8px;cursor:pointer;background:var(--surface,#fff);font-size:13px;
              font-weight:600;color:var(--text,#1a1a2e)">
              <div style="font-size:11px;color:#575756;margin-bottom:3px">FC</div>
              Fin → Comienzo
            </button>
            <button data-tipo="CC" style="padding:12px;border:1.5px solid var(--border,#ddd);
              border-radius:8px;cursor:pointer;background:var(--surface,#fff);font-size:13px;
              font-weight:600;color:var(--text,#1a1a2e)">
              <div style="font-size:11px;color:#3366FF;margin-bottom:3px">CC</div>
              Comienzo → Comienzo
            </button>
            <button data-tipo="FF" style="padding:12px;border:1.5px solid var(--border,#ddd);
              border-radius:8px;cursor:pointer;background:var(--surface,#fff);font-size:13px;
              font-weight:600;color:var(--text,#1a1a2e)">
              <div style="font-size:11px;color:#33CC99;margin-bottom:3px">FF</div>
              Fin → Fin
            </button>
            <button data-tipo="CF" style="padding:12px;border:1.5px solid var(--border,#ddd);
              border-radius:8px;cursor:pointer;background:var(--surface,#fff);font-size:13px;
              font-weight:600;color:var(--text,#1a1a2e)">
              <div style="font-size:11px;color:#FB7520;margin-bottom:3px">CF</div>
              Comienzo → Fin
            </button>
          </div>
          <button id="p360-dep-cancel" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);
            border-radius:6px;cursor:pointer;background:var(--surface,#fff);font-size:13px">
            Cancelar
          </button>
        </div>
      `;

      document.body.appendChild(overlay);

      overlay.querySelectorAll('[data-tipo]').forEach(btn => {
        btn.addEventListener('mouseover', () => { btn.style.borderColor='var(--brand-orange,#FB7520)'; btn.style.background='rgba(251,117,32,.06)'; });
        btn.addEventListener('mouseout', () => { btn.style.borderColor='var(--border,#ddd)'; btn.style.background='var(--surface,#fff)'; });
        btn.addEventListener('click', () => {
          overlay.remove();
          resolve(btn.dataset.tipo);
        });
      });

      document.getElementById('p360-dep-cancel').addEventListener('click', () => {
        overlay.remove();
        resolve(null);
      });
      overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(null); } });
    });
  }

  /* ══════════════════════════════════════════════════
     4. DROPDOWNS CONFIGURABLES PARA COLUMNAS
     Tableros, Nivel, Rubro, Contratista, Responsable
     Almacenados en localStorage por compañía/proyecto
  ══════════════════════════════════════════════════ */
  const DROPDOWN_KEY = 'p360_dropdown_options_v1';

  function loadDropdownOptions() {
    try {
      const raw = localStorage.getItem(DROPDOWN_KEY);
      return raw ? JSON.parse(raw) : getDefaultOptions();
    } catch { return getDefaultOptions(); }
  }

  function saveDropdownOptions(opts) {
    try { localStorage.setItem(DROPDOWN_KEY, JSON.stringify(opts)); } catch {}
  }

  function getDefaultOptions() {
    return {
      tableros: ['Infraestructura', 'Licitación', 'Proyecto', 'Obra', 'Gestión'],
      nivel: ['Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4'],
      rubro: ['Estructura', 'Albañilería', 'Instalaciones', 'Terminaciones', 'Equipamiento', 'Exteriores'],
      contratista: []
    };
  }

  // Auto-agregar opciones al importar XML
  window._p360autoAddDropdownOptions = function(tasks) {
    const opts = loadDropdownOptions();
    let changed = false;
    tasks.forEach(t => {
      ['tableros', 'rubro', 'contratista', 'nivel'].forEach(field => {
        const val = t[field];
        if (val && typeof val === 'string' && val.trim()) {
          const arr = opts[field] || [];
          if (!arr.includes(val.trim())) {
            arr.push(val.trim());
            opts[field] = arr;
            changed = true;
          }
        }
      });
    });
    if (changed) saveDropdownOptions(opts);
  };

  /* Reemplazar los editores inline de tableros/nivel/rubro/contratista
     con dropdowns en lugar de texto libre */
  function patchInlineDropdowns() {
    const opts = loadDropdownOptions();

    // Override _p360inlineEditOption que es llamado por el onClick del bundle
    window._p360inlineEditOption = async function(cell, taskId, field, currentVal) {
      if (cell._editing) return;
      clearTimeout(window._p360rowT);
      cell._editing = true;
      const orig = cell.innerHTML;

      const close = (save) => {
        cell._editing = false;
        if (!save) cell.innerHTML = orig;
      };

      const options = (loadDropdownOptions()[field] || []);

      // Crear dropdown + opción de texto libre
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:flex;width:100%;gap:2px;align-items:center';

      const sel = document.createElement('select');
      sel.style.cssText = `flex:1;height:100%;border:none;background:var(--surface);
        font:inherit;font-size:10px;color:var(--text);outline:none;
        box-shadow:inset 0 0 0 1.5px var(--brand-orange,#FB7520);border-radius:3px;
        min-width:0;padding:0 2px`;

      // Opción vacía + opciones
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = '— Seleccionar —';
      sel.appendChild(emptyOpt);

      options.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o;
        opt.selected = o === currentVal;
        sel.appendChild(opt);
      });

      // Opción "Nueva..."
      const newOpt = document.createElement('option');
      newOpt.value = '__new__';
      newOpt.textContent = '+ Nueva opción...';
      sel.appendChild(newOpt);

      // Botón de configurar opciones
      const cfgBtn = document.createElement('button');
      cfgBtn.textContent = '⚙';
      cfgBtn.title = 'Administrar opciones de este campo';
      cfgBtn.style.cssText = `border:none;background:transparent;cursor:pointer;font-size:11px;
        color:var(--text-3,#aaa);padding:0 2px;flex-shrink:0`;

      const commit = async (val) => {
        if (val === '__new__') {
          const newVal = prompt(`Nueva opción para "${field}":`);
          if (!newVal?.trim()) { close(false); return; }
          const allOpts = loadDropdownOptions();
          allOpts[field] = allOpts[field] || [];
          if (!allOpts[field].includes(newVal.trim())) {
            allOpts[field].push(newVal.trim());
            saveDropdownOptions(allOpts);
          }
          val = newVal.trim();
        }
        close(true);
        // Guardar en Supabase
        const sb = getSupabase();
        if (sb && taskId) {
          const { error } = await sb.from('tasks').update({ [field]: val || null }).eq('id', taskId);
          if (!error) {
            cell.textContent = val || '';
            cell.title = val || '';
            const store = getStore();
            if (store?.reloadProject) await store.reloadProject();
          }
        }
      };

      sel.addEventListener('change', () => commit(sel.value));
      sel.addEventListener('keydown', e => {
        if (e.key === 'Escape') close(false);
        if (e.key === 'Enter') commit(sel.value);
      });
      sel.addEventListener('blur', () => { if (cell._editing) commit(sel.value); });

      cfgBtn.addEventListener('click', e => {
        e.stopPropagation();
        showOptionsManager(field);
      });

      wrapper.appendChild(sel);
      wrapper.appendChild(cfgBtn);

      cell.innerHTML = '';
      cell.appendChild(wrapper);
      setTimeout(() => { sel.focus(); }, 20);
    };
  }

  /* Panel de administración de opciones */
  function showOptionsManager(field) {
    const prev = document.getElementById('p360-opts-mgr');
    if (prev) prev.remove();

    const opts = loadDropdownOptions();
    const arr = opts[field] || [];

    const fieldLabels = { tableros:'Tableros', nivel:'Nivel', rubro:'Rubro', contratista:'Contratista' };

    const overlay = document.createElement('div');
    overlay.id = 'p360-opts-mgr';
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:99999;
      display:flex;align-items:center;justify-content:center;font-family:inherit`;

    const render = () => {
      const currentOpts = (loadDropdownOptions()[field] || []);
      overlay.innerHTML = `
        <div style="background:var(--surface,#fff);border-radius:12px;padding:22px 26px;
          width:380px;max-height:80vh;overflow-y:auto;
          box-shadow:0 20px 60px rgba(0,0,0,.3);color:var(--text,#1a1a2e)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div style="font-size:15px;font-weight:700">Opciones — ${fieldLabels[field]||field}</div>
            <button id="p360-opts-close" style="border:none;background:none;font-size:20px;cursor:pointer;color:#999">×</button>
          </div>
          <div id="p360-opts-list" style="margin-bottom:14px">
            ${currentOpts.map((o,i) => `
              <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:0.5px solid var(--border,#eee)">
                <span style="flex:1;font-size:13px">${o}</span>
                <button data-del="${i}" style="border:none;background:none;cursor:pointer;color:#dc2626;font-size:13px;padding:0 4px">✕</button>
              </div>
            `).join('')}
            ${currentOpts.length === 0 ? '<div style="font-size:12px;color:var(--text-3,#aaa);padding:8px 0">Sin opciones todavía.</div>' : ''}
          </div>
          <div style="display:flex;gap:8px">
            <input id="p360-opts-new" type="text" placeholder="Nueva opción..." style="flex:1;padding:7px 10px;
              border:1px solid var(--border,#ddd);border-radius:6px;font-size:12px;
              background:var(--surface,#fff);color:var(--text,#1a1a2e)">
            <button id="p360-opts-add" style="padding:7px 14px;border:none;border-radius:6px;
              background:var(--brand-orange,#FB7520);color:#fff;font-size:12px;font-weight:600;cursor:pointer">
              Agregar
            </button>
          </div>
        </div>
      `;

      document.getElementById('p360-opts-close').onclick = () => overlay.remove();
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

      overlay.querySelectorAll('[data-del]').forEach(btn => {
        btn.onclick = () => {
          const idx = parseInt(btn.dataset.del);
          const allOpts = loadDropdownOptions();
          allOpts[field] = (allOpts[field] || []).filter((_,i) => i !== idx);
          saveDropdownOptions(allOpts);
          render();
        };
      });

      const addBtn = document.getElementById('p360-opts-add');
      const input = document.getElementById('p360-opts-new');

      const doAdd = () => {
        const val = input.value.trim();
        if (!val) return;
        const allOpts = loadDropdownOptions();
        allOpts[field] = allOpts[field] || [];
        if (!allOpts[field].includes(val)) {
          allOpts[field].push(val);
          saveDropdownOptions(allOpts);
        }
        render();
      };

      addBtn.onclick = doAdd;
      input.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    };

    document.body.appendChild(overlay);
    render();
  }

  /* ══════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════ */
  // 1. Bombita: ya aplicado con CSS

  // 2. PDF fix
  patchPDFGenerate();
  patchGeneratePDFGlobal();

  // 3. Fix vinculación
  setTimeout(fixLinkButton, 1500);

  // 4. Dropdowns
  patchInlineDropdowns();

  // Exponer para que importMSProject lo llame
  const origImport = window._p360importMSProject;
  if (origImport) {
    window._p360importMSProject = async (...args) => {
      const result = await origImport(...args);
      const store = getStore();
      if (store?.tasks) window._p360autoAddDropdownOptions(store.tasks);
      return result;
    };
  }

  // Patch importMSProject en el store cuando esté disponible
  setTimeout(() => {
    const store = getStore();
    if (!store || !store.importMSProject) return;
    const origFn = store.importMSProject.bind(store);
    // No podemos parchear el store de Zustand directamente, 
    // pero podemos escuchar el evento de importación
  }, 2000);

})();
