/**
 * Pipeline360 — papelera-v1.js
 * Papelera de proyectos eliminados:
 *  - Botón "🗑 Papelera" en el Centro de Proyectos
 *  - Lista de proyectos eliminados (con fecha y cantidad de tareas)
 *  - Restaurar proyecto completo (tareas, dependencias, libro de obra, baselines)
 *  - Eliminar definitivamente
 *
 * Requiere la tabla public.deleted_projects (snapshot jsonb) con RLS por empresa.
 */
(function () {
  'use strict';

  /* ── Supabase client (mismo approach que patch.js) ── */
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
      return walk(f.child, d + 1) || walk(f.sibling, d + 1);
    }
    window._p360sb = walk(root[fk], 0);
    return window._p360sb;
  }

  /* ── Toast mínimo ── */
  function toast(msg, kind) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;' +
      'padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.18);color:#fff;background:' +
      (kind === 'error' ? '#dc2626' : kind === 'warning' ? '#d97706' : '#16a34a');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  /* ── Restaurar proyecto completo desde snapshot ── */
  async function restoreProject(row, btn) {
    const sb = getSB();
    if (!sb) return toast('No se pudo conectar con la base', 'error');
    const snap = row.snapshot || {};
    const proj = snap.project;
    if (!proj || !proj.id) return toast('Snapshot inválido — no se puede restaurar', 'error');

    btn.disabled = true;
    btn.textContent = 'Restaurando…';
    try {
      // 1. Proyecto
      const { error: e1 } = await sb.from('projects').insert(proj);
      if (e1) {
        if ((e1.message || '').includes('duplicate')) throw new Error('Ya existe un proyecto con ese ID (¿ya fue restaurado?)');
        throw e1;
      }

      // 2. Tareas (primero sin jerarquía para evitar problemas de orden con parent_task_id)
      const tasks = Array.isArray(snap.tasks) ? snap.tasks : [];
      if (tasks.length) {
        const flat = tasks.map(t => Object.assign({}, t, { parent_task_id: null }));
        for (let i = 0; i < flat.length; i += 200) {
          const { error: e2 } = await sb.from('tasks').insert(flat.slice(i, i + 200));
          if (e2) throw e2;
        }
        // Restaurar jerarquía
        for (const t of tasks) {
          if (t.parent_task_id) {
            await sb.from('tasks').update({ parent_task_id: t.parent_task_id }).eq('id', t.id);
          }
        }
      }

      // 3. Dependencias
      const deps = Array.isArray(snap.dependencies) ? snap.dependencies : [];
      if (deps.length) {
        for (let i = 0; i < deps.length; i += 200) {
          const { error: e3 } = await sb.from('task_dependencies').insert(deps.slice(i, i + 200));
          if (e3) console.warn('Dependencias:', e3.message);
        }
      }

      // 4. Libro de obra
      const logs = Array.isArray(snap.logs) ? snap.logs : [];
      if (logs.length) {
        const { error: e4 } = await sb.from('project_log_entries').insert(logs);
        if (e4) console.warn('Libro de obra:', e4.message);
      }

      // 5. Baselines
      const bls = Array.isArray(snap.baselines) ? snap.baselines : [];
      if (bls.length) {
        const { error: e5 } = await sb.from('project_baselines').insert(bls);
        if (e5) console.warn('Baselines:', e5.message);
      }

      // 6. Sacar de la papelera
      await sb.from('deleted_projects').delete().eq('id', row.id);

      toast('✓ Proyecto "' + (proj.name || '') + '" restaurado. Recargando…');
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      console.error(err);
      toast('Error al restaurar: ' + (err.message || err), 'error');
      btn.disabled = false;
      btn.textContent = '↩ Restaurar';
    }
  }

  /* ── Eliminar definitivamente ── */
  async function purgeProject(row, card) {
    const conf = window.prompt(
      'Esto elimina DEFINITIVAMENTE "' + row.name + '" de la papelera y no se puede recuperar.\n' +
      'Para confirmar, escribí el nombre exactamente:'
    );
    if (conf === null) return;
    if (conf !== row.name) return toast('El nombre no coincide. Operación cancelada.', 'warning');
    const sb = getSB();
    if (!sb) return toast('No se pudo conectar con la base', 'error');
    const { error } = await sb.from('deleted_projects').delete().eq('id', row.id);
    if (error) return toast('Error: ' + error.message, 'error');
    card.remove();
    toast('Eliminado definitivamente');
  }

  /* ── Modal de papelera ── */
  async function openTrashModal() {
    const sb = getSB();
    if (!sb) return toast('Esperá a que cargue la app e intentá de nuevo', 'warning');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '9000';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '720px';
    modal.innerHTML =
      '<div class="modal-header">' +
        '<h2 class="modal-title">🗑 Papelera de proyectos</h2>' +
        '<button class="modal-close">×</button>' +
      '</div>' +
      '<div class="modal-body" id="p360-trash-body">' +
        '<div style="text-align:center;padding:24px;color:var(--text-3)">Cargando…</div>' +
      '</div>' +
      '<div class="modal-footer"><div style="font-size:11px;color:var(--text-3)">' +
        'Los proyectos eliminados se guardan acá con todas sus tareas, dependencias, libro de obra y baselines.' +
      '</div><button class="btn" id="p360-trash-close2">Cerrar</button></div>';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    modal.querySelector('.modal-close').onclick = () => overlay.remove();
    modal.querySelector('#p360-trash-close2').onclick = () => overlay.remove();

    const body = modal.querySelector('#p360-trash-body');
    const { data, error } = await sb
      .from('deleted_projects')
      .select('id,name,deleted_at,snapshot')
      .order('deleted_at', { ascending: false });

    if (error) {
      body.innerHTML = '<div style="color:var(--danger);padding:16px">Error: ' + error.message + '</div>';
      return;
    }
    if (!data || data.length === 0) {
      body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-3)">' +
        'La papelera está vacía.<br><span style="font-size:12px">Cuando elimines un proyecto, va a aparecer acá y lo vas a poder restaurar.</span></div>';
      return;
    }

    body.innerHTML = '';
    data.forEach(row => {
      const snap = row.snapshot || {};
      const nTasks = Array.isArray(snap.tasks) ? snap.tasks.length : 0;
      const nLogs = Array.isArray(snap.logs) ? snap.logs.length : 0;

      const card = document.createElement('div');
      card.style.cssText =
        'display:flex;align-items:center;justify-content:space-between;gap:12px;' +
        'padding:12px 14px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--surface)';
      card.innerHTML =
        '<div style="min-width:0">' +
          '<div style="font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (row.name || '(sin nombre)') + '</div>' +
          '<div style="font-size:11px;color:var(--text-3);margin-top:2px">' +
            'Eliminado: ' + fmtDate(row.deleted_at) + ' · ' + nTasks + ' tarea' + (nTasks === 1 ? '' : 's') +
            (nLogs ? ' · ' + nLogs + ' entradas de libro' : '') +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0"></div>';

      const actions = card.lastElementChild;

      const btnR = document.createElement('button');
      btnR.className = 'btn btn-sm btn-primary';
      btnR.textContent = '↩ Restaurar';
      btnR.onclick = () => restoreProject(row, btnR);
      actions.appendChild(btnR);

      const btnP = document.createElement('button');
      btnP.className = 'btn btn-sm';
      btnP.style.cssText = 'color:#dc2626;border-color:#dc2626';
      btnP.textContent = '✕ Definitivo';
      btnP.title = 'Eliminar definitivamente (no se puede deshacer)';
      btnP.onclick = () => purgeProject(row, card);
      actions.appendChild(btnP);

      body.appendChild(card);
    });
  }

  /* ── Inyectar botón en el Centro de Proyectos ── */
  function injectButton() {
    const header = document.querySelector('.projects-page-header');
    if (!header || header.querySelector('.p360-trash-btn')) return;
    const actions = header.lastElementChild;
    if (!actions) return;
    const btn = document.createElement('button');
    btn.className = 'btn p360-trash-btn';
    btn.title = 'Ver proyectos eliminados y restaurarlos';
    btn.textContent = '🗑 Papelera';
    btn.onclick = openTrashModal;
    actions.appendChild(btn);
  }

  const mo = new MutationObserver(injectButton);
  function start() {
    mo.observe(document.body, { childList: true, subtree: true });
    injectButton();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
