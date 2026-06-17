/**
 * Pipeline360 — calendario-v1.js
 *  1. Carga los feriados de la empresa en window._p360feriados (Set de 'YYYY-MM-DD')
 *     → usados por el cálculo de días hábiles del Gantt y la edición de duración
 *  2. Botón "📅 Feriados" en el Centro de Proyectos: calendario editable por empresa
 *  3. Editores inline nuevos: nombre de tarea (_p360inlineEditName) y
 *     responsable (_p360inlineEditResp)
 *
 * Requiere la tabla public.company_holidays (company_id, date, name) con RLS.
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

  /* ══════════════════════════════════════════════
     1. CARGA DE FERIADOS  →  window._p360feriados
  ══════════════════════════════════════════════ */
  window._p360feriados = window._p360feriados || new Set();
  let _myCompanyId = null;
  let _isSuperAdmin = false;

  async function getMyMember() {
    const sb = getSB();
    if (!sb) return null;
    try {
      const { data: u } = await sb.auth.getUser();
      if (!u || !u.user) return null;
      const { data: m } = await sb.from('members').select('company_id,role').eq('user_id', u.user.id).limit(1);
      return (m && m[0]) || null;
    } catch (e) { return null; }
  }

  async function loadFeriados() {
    const sb = getSB();
    if (!sb) return false;
    try {
      const me = await getMyMember();
      _myCompanyId = me ? me.company_id : null;
      _isSuperAdmin = !!(me && me.role === 'super_admin');
      let q = sb.from('company_holidays').select('date,company_id');
      if (_myCompanyId) q = q.eq('company_id', _myCompanyId);
      const { data, error } = await q;
      if (error) { console.warn('feriados:', error.message); return false; }
      window._p360feriados = new Set((data || []).map(r => r.date));
      return true;
    } catch (e) { console.warn('feriados:', e); return false; }
  }

  // Reintentar hasta que la app (y el client) estén listos
  let tries = 0;
  const loader = setInterval(async () => {
    tries++;
    if (await loadFeriados() || tries > 30) clearInterval(loader);
  }, 1000);

  /* ══════════════════════════════════════════════
     2. MODAL DE CALENDARIO DE FERIADOS
  ══════════════════════════════════════════════ */
  const FERIADOS_AR_2027 = [
    ['2027-01-01', 'Año Nuevo'],
    ['2027-02-08', 'Carnaval'],
    ['2027-02-09', 'Carnaval'],
    ['2027-03-24', 'Día de la Memoria'],
    ['2027-03-26', 'Viernes Santo'],
    ['2027-04-02', 'Día del Veterano y Caídos en Malvinas'],
    ['2027-05-01', 'Día del Trabajador'],
    ['2027-05-25', 'Revolución de Mayo'],
    ['2027-06-17', 'Paso a la Inmortalidad del Gral. Güemes'],
    ['2027-06-20', 'Paso a la Inmortalidad del Gral. Belgrano'],
    ['2027-07-09', 'Día de la Independencia'],
    ['2027-08-17', 'Paso a la Inmortalidad del Gral. San Martín'],
    ['2027-10-12', 'Día del Respeto a la Diversidad Cultural'],
    ['2027-11-20', 'Día de la Soberanía Nacional'],
    ['2027-12-08', 'Inmaculada Concepción de María'],
    ['2027-12-25', 'Navidad'],
  ];

  function fmtFecha(iso) {
    try {
      const [y, m, d] = iso.split('-');
      const dt = new Date(Date.UTC(+y, +m - 1, +d));
      const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      return d + '/' + m + '/' + y + ' (' + dias[dt.getUTCDay()] + ')';
    } catch { return iso; }
  }

  async function openCalendarModal() {
    const sb = getSB();
    if (!sb) return toast('Esperá a que cargue la app e intentá de nuevo', 'warning');
    const me = await getMyMember();
    _myCompanyId = me ? me.company_id : null;
    _isSuperAdmin = !!(me && me.role === 'super_admin');

    let companies = [];
    if (_isSuperAdmin || !_myCompanyId) {
      const { data } = await sb.from('companies').select('id,name').order('name');
      companies = data || [];
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '9000';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '640px';
    modal.innerHTML =
      '<div class="modal-header">' +
        '<h2 class="modal-title">📅 Calendario de feriados y días no laborables</h2>' +
        '<button class="modal-close">×</button>' +
      '</div>' +
      '<div class="modal-body">' +
        (companies.length ? (
          '<div class="form-group"><label class="form-label">Empresa</label>' +
          '<select class="form-control" id="p360-cal-company">' +
          companies.map(c => '<option value="' + c.id + '">' + c.name + '</option>').join('') +
          '</select></div>'
        ) : '') +
        '<div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:14px;flex-wrap:wrap">' +
          '<div style="flex:0 0 160px"><label class="form-label" style="font-size:11px">Fecha</label>' +
            '<input type="date" class="form-control" id="p360-cal-date"></div>' +
          '<div style="flex:1;min-width:160px"><label class="form-label" style="font-size:11px">Nombre (opcional)</label>' +
            '<input type="text" class="form-control" id="p360-cal-name" placeholder="Ej: Día del trabajador de la construcción"></div>' +
          '<button class="btn btn-primary" id="p360-cal-add">＋ Agregar</button>' +
        '</div>' +
        '<div id="p360-cal-list"><div style="text-align:center;padding:16px;color:var(--text-3)">Cargando…</div></div>' +
        '<div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<span style="font-size:11px;color:var(--text-3)">Estos días no cuentan en tareas con duración en días hábiles.</span>' +
          '<button class="btn btn-sm" id="p360-cal-seed27">Cargar feriados AR 2027</button>' +
        '</div>' +
      '</div>' +
      '<div class="modal-footer"><div></div><button class="btn" id="p360-cal-close2">Cerrar</button></div>';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    modal.querySelector('.modal-close').onclick = () => overlay.remove();
    modal.querySelector('#p360-cal-close2').onclick = () => overlay.remove();

    const companySel = modal.querySelector('#p360-cal-company');
    const getCompanyId = () => companySel ? companySel.value : _myCompanyId;

    const listEl = modal.querySelector('#p360-cal-list');

    async function refreshList() {
      const cid = getCompanyId();
      if (!cid) {
        listEl.innerHTML = '<div style="color:var(--danger);padding:12px">No se pudo determinar la empresa.</div>';
        return;
      }
      const { data, error } = await sb.from('company_holidays')
        .select('id,date,name').eq('company_id', cid).order('date');
      if (error) {
        listEl.innerHTML = '<div style="color:var(--danger);padding:12px">Error: ' + error.message + '</div>';
        return;
      }
      if (!data || !data.length) {
        listEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-3)">Sin feriados cargados.</div>';
        return;
      }
      listEl.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:8px';
      data.forEach((row, idx) => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 12px;font-size:13px;' +
          (idx ? 'border-top:1px solid var(--border);' : '');
        item.innerHTML =
          '<span style="font-family:JetBrains Mono,monospace;font-size:12px;flex:0 0 170px">' + fmtFecha(row.date) + '</span>' +
          '<span style="flex:1;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (row.name || '') + '</span>';
        const del = document.createElement('button');
        del.className = 'btn btn-sm btn-ghost';
        del.textContent = '✕';
        del.title = 'Quitar este día del calendario';
        del.onclick = async () => {
          const { error: e } = await sb.from('company_holidays').delete().eq('id', row.id);
          if (e) return toast('Error: ' + e.message, 'error');
          if (String(getCompanyId()) === String(_myCompanyId) || !_myCompanyId) window._p360feriados.delete(row.date);
          refreshList();
        };
        item.appendChild(del);
        wrap.appendChild(item);
      });
      listEl.appendChild(wrap);
    }

    modal.querySelector('#p360-cal-add').onclick = async () => {
      const cid = getCompanyId();
      const date = modal.querySelector('#p360-cal-date').value;
      const name = modal.querySelector('#p360-cal-name').value.trim();
      if (!cid) return toast('Seleccioná una empresa', 'warning');
      if (!date) return toast('Elegí una fecha', 'warning');
      const { error } = await sb.from('company_holidays').insert({ company_id: cid, date: date, name: name || null });
      if (error) {
        if ((error.message || '').includes('duplicate')) return toast('Esa fecha ya está en el calendario', 'warning');
        return toast('Error: ' + error.message, 'error');
      }
      if (String(cid) === String(_myCompanyId) || !_myCompanyId) window._p360feriados.add(date);
      modal.querySelector('#p360-cal-date').value = '';
      modal.querySelector('#p360-cal-name').value = '';
      toast('Día agregado al calendario');
      refreshList();
    };

    modal.querySelector('#p360-cal-seed27').onclick = async () => {
      const cid = getCompanyId();
      if (!cid) return toast('Seleccioná una empresa', 'warning');
      if (!confirm('¿Cargar los feriados nacionales de Argentina 2027?\nLos que ya existan no se duplican.')) return;
      let ok = 0;
      for (const [d, n] of FERIADOS_AR_2027) {
        const { error } = await sb.from('company_holidays').insert({ company_id: cid, date: d, name: n });
        if (!error) {
          ok++;
          if (String(cid) === String(_myCompanyId) || !_myCompanyId) window._p360feriados.add(d);
        }
      }
      toast(ok + ' feriados 2027 agregados');
      refreshList();
    };

    if (companySel) companySel.onchange = refreshList;
    refreshList();
  }

  /* ══════════════════════════════════════════════
     3. EDITORES INLINE: NOMBRE Y RESPONSABLE
  ══════════════════════════════════════════════ */
  async function saveField(taskId, field, value) {
    const sb = getSB();
    if (!sb) { toast('Sin conexión con la base', 'error'); return false; }
    const { error } = await sb.from('tasks').update({ [field]: value }).eq('id', taskId);
    if (error) { toast('Error: ' + error.message, 'error'); return false; }
    return true;
  }

  // Nombre de tarea: input de texto sobre el span
  window._p360inlineEditName = function (span, taskId, currentVal) {
    if (span._editing) return;
    span._editing = true;
    const orig = span.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentVal || '';
    input.style.cssText =
      'width:100%;border:none;background:var(--surface);font:inherit;font-size:12px;color:var(--text);' +
      'outline:none;padding:1px 4px;box-shadow:inset 0 0 0 1.5px var(--brand-orange);border-radius:3px';
    span.textContent = '';
    span.appendChild(input);
    input.focus();
    input.select();
    input.onclick = e => e.stopPropagation();
    input.ondblclick = e => e.stopPropagation();
    const close = (txt) => { span._editing = false; span.textContent = txt; };
    const commit = async () => {
      if (!span._editing) return;
      const v = input.value.trim();
      if (!v || v === orig) return close(orig);
      const ok = await saveField(taskId, 'name', v);
      close(ok ? v : orig);
      if (ok) span.title = v;
    };
    input.onkeydown = e => {
      if (e.key === 'Escape') { e.stopPropagation(); return close(orig); }
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
    };
    input.onblur = commit;
  };

  // Responsable: select con los miembros activos de la empresa
  window._p360inlineEditResp = async function (cell, taskId, currentVal) {
    if (cell._editing) return;
    cell._editing = true;
    const orig = cell.innerHTML;
    const close = (save) => { cell._editing = false; if (!save) cell.innerHTML = orig; };

    const sb = getSB();
    if (!sb) { close(false); return toast('Sin conexión con la base', 'error'); }
    let members = [];
    try {
      const { data } = await sb.from('members').select('id,name').eq('active', true).order('name');
      members = data || [];
    } catch (e) { /* noop */ }

    const sel = document.createElement('select');
    sel.style.cssText =
      'width:100%;height:100%;border:none;background:var(--surface);font:inherit;font-size:11px;color:var(--text);' +
      'outline:none;box-shadow:inset 0 0 0 1.5px var(--brand-orange);border-radius:3px';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '— Sin asignar —';
    sel.appendChild(opt0);
    members.forEach(m => {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.name;
      if (String(m.id) === String(currentVal)) o.selected = true;
      sel.appendChild(o);
    });
    cell.innerHTML = '';
    cell.appendChild(sel);
    sel.focus();
    sel.onclick = e => e.stopPropagation();

    const commit = async () => {
      if (!cell._editing) return;
      const v = sel.value || null;
      const ok = await saveField(taskId, 'assigned_to', v);
      if (!ok) return close(false);
      cell._editing = false;
      const m = members.find(x => String(x.id) === String(v));
      cell.innerHTML = '';
      const span = document.createElement('span');
      span.style.cssText = m ? 'font-size:11px' : 'color:var(--text-3);font-size:10px';
      span.textContent = m ? m.name : '—';
      cell.appendChild(span);
    };
    sel.onchange = commit;
    sel.onkeydown = e => { if (e.key === 'Escape') close(false); };
    sel.onblur = () => { if (cell._editing) close(false); };
  };

  /* ══════════════════════════════════════════════
     4. BOTÓN EN EL CENTRO DE PROYECTOS
  ══════════════════════════════════════════════ */
  function injectButton() {
    const header = document.querySelector('.projects-page-header');
    if (!header || header.querySelector('.p360-cal-btn')) return;
    const actions = header.lastElementChild;
    if (!actions) return;
    const btn = document.createElement('button');
    btn.className = 'btn p360-cal-btn';
    btn.title = 'Calendario de feriados y días no laborables (por empresa)';
    btn.textContent = '📅 Feriados';
    btn.onclick = openCalendarModal;
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
