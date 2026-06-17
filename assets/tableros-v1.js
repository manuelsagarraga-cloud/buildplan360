/**
 * Pipeline360 — tableros-v1.js
 * Tablero global de la empresa, accesible a todos los usuarios con login.
 * Botón "📊 Tablero" en el Centro de Proyectos → vista a pantalla completa con:
 *   - KPIs: proyectos activos, avance promedio, tareas vencidas, hitos próximos
 *   - Avance por emprendimiento (con vencidas por proyecto)
 *   - Tareas vencidas (qué, de qué proyecto, de quién, cuántos días)
 *   - Próximos hitos (60 días)
 *   - Carga por contratista y por rubro
 * Los datos respetan el aislamiento por empresa (RLS).
 */
(function () {
  'use strict';

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

  const hoy = () => new Date().toISOString().slice(0, 10);
  function fmtD(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return d + '/' + m + '/' + y.slice(2);
  }
  function diasAtraso(end) {
    return Math.max(0, Math.round((new Date(hoy()) - new Date(end)) / 864e5));
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ── Construcción del tablero ── */
  async function openTablero() {
    const sb = getSB();
    if (!sb) return alert('Esperá a que cargue la app e intentá de nuevo');

    const overlay = document.createElement('div');
    overlay.id = 'p360-tablero';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:8000;background:var(--bg,#f4f5f7);overflow-y:auto;' +
      'font-family:inherit;color:var(--text)';
    overlay.innerHTML =
      '<div style="position:sticky;top:0;z-index:10;background:var(--surface,#fff);border-bottom:1px solid var(--border);' +
        'display:flex;align-items:center;justify-content:space-between;padding:12px 28px;gap:12px">' +
        '<div style="display:flex;align-items:baseline;gap:12px">' +
          '<h1 style="font-size:20px;font-weight:800;letter-spacing:-.02em;margin:0">📊 Tablero general</h1>' +
          '<span id="p360-tb-sub" style="font-size:12px;color:var(--text-3)"></span>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-sm" id="p360-tb-refresh">⟳ Actualizar</button>' +
          '<button class="btn btn-sm" id="p360-tb-close">✕ Cerrar</button>' +
        '</div>' +
      '</div>' +
      '<div id="p360-tb-body" style="padding:20px 28px;max-width:1500px;margin:0 auto">' +
        '<div style="text-align:center;padding:60px;color:var(--text-3)">Cargando datos…</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    const close = () => { overlay.remove(); document.body.style.overflow = ''; };
    overlay.querySelector('#p360-tb-close').onclick = close;
    overlay.querySelector('#p360-tb-refresh').onclick = () => render(overlay.querySelector('#p360-tb-body'), sb, overlay);

    render(overlay.querySelector('#p360-tb-body'), sb, overlay);
  }

  async function render(body, sb, overlay) {
    body.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-3)">Cargando datos…</div>';
    let projects = [], tasks = [], members = [];
    try {
      const [p, t, m] = await Promise.all([
        sb.from('projects').select('id,name,status,start_date,end_date,color,provincia'),
        sb.from('tasks').select('id,project_id,name,status,progress,start_date,end_date,is_milestone,contratista,rubro,assigned_to,parent_task_id'),
        sb.from('members').select('id,name,color'),
      ]);
      if (p.error) throw p.error;
      projects = p.data || []; tasks = t.data || []; members = m.data || [];
    } catch (e) {
      body.innerHTML = '<div style="color:var(--danger);padding:40px;text-align:center">Error al cargar: ' + esc(e.message || e) + '</div>';
      return;
    }

    const H = hoy();
    const memById = {}; members.forEach(m => memById[m.id] = m);
    const projById = {}; projects.forEach(p => projById[p.id] = p);

    // Solo tareas "hoja" para métricas (las resumen duplican avance)
    const parentIds = new Set(tasks.map(t => t.parent_task_id).filter(Boolean));
    const hojas = tasks.filter(t => !parentIds.has(t.id));

    const vencidas = hojas.filter(t => t.status !== 'completed' && t.end_date && t.end_date < H && !t.is_milestone);
    const en60 = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
    const hitos = tasks.filter(t => t.is_milestone && t.status !== 'completed' && t.start_date >= H && t.start_date <= en60)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));

    // Avance por proyecto
    const porProy = projects.map(p => {
      const tp = hojas.filter(t => t.project_id === p.id);
      const av = tp.length ? Math.round(tp.reduce((s, t) => s + (t.progress || 0), 0) / tp.length) : 0;
      const ven = tp.filter(t => t.status !== 'completed' && t.end_date && t.end_date < H && !t.is_milestone).length;
      return { p, total: tp.length, avance: av, vencidas: ven };
    }).sort((a, b) => b.total - a.total);

    const activos = projects.filter(p => p.status === 'active' || p.status === 'planning').length;
    const conTareas = porProy.filter(x => x.total > 0);
    const avanceGlobal = conTareas.length ? Math.round(conTareas.reduce((s, x) => s + x.avance, 0) / conTareas.length) : 0;

    // Carga por contratista / rubro (tareas no completadas)
    function agrupar(campo) {
      const map = {};
      hojas.filter(t => t.status !== 'completed').forEach(t => {
        const k = (t[campo] || '').trim() || '(sin ' + campo + ')';
        map[k] = map[k] || { total: 0, vencidas: 0 };
        map[k].total++;
        if (t.end_date && t.end_date < H) map[k].vencidas++;
      });
      return Object.entries(map).sort((a, b) => b[1].total - a[1].total).slice(0, 12);
    }
    const porContratista = agrupar('contratista');
    const porRubro = agrupar('rubro');

    overlay.querySelector('#p360-tb-sub').textContent =
      projects.length + ' proyectos · ' + hojas.length + ' tareas · actualizado ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    /* ── HTML ── */
    const card = (inner, extra) =>
      '<div style="background:var(--surface,#fff);border:1px solid var(--border);border-radius:12px;padding:16px 18px;' + (extra || '') + '">' + inner + '</div>';

    const kpi = (num, label, color) =>
      card('<div style="font-size:30px;font-weight:800;letter-spacing:-.03em;color:' + (color || 'var(--text)') + '">' + num + '</div>' +
           '<div style="font-size:12px;color:var(--text-2);margin-top:2px">' + label + '</div>');

    const barRow = (label, val, max, sub, color) => {
      const pct = max ? Math.round(val / max * 100) : 0;
      return '<div style="margin-bottom:9px">' +
        '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">' +
          '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%">' + esc(label) + '</span>' +
          '<span style="color:var(--text-2);flex-shrink:0">' + sub + '</span></div>' +
        '<div style="height:7px;background:var(--surface-2,#eef0f3);border-radius:4px;overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:4px"></div></div></div>';
    };

    // Sección: avance por emprendimiento
    let avanceHTML = '<h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-2);margin:0 0 14px">Avance por emprendimiento</h3>';
    if (!porProy.length) avanceHTML += '<div style="color:var(--text-3);font-size:13px">Sin proyectos.</div>';
    porProy.forEach(({ p, total, avance, vencidas: ven }) => {
      avanceHTML += '<div style="margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:13px;margin-bottom:3px;gap:8px">' +
          '<span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + (p.color || '#3B82F6') + ';margin-right:6px"></span>' +
            esc(p.name) + '</span>' +
          '<span style="flex-shrink:0;font-size:11px;color:var(--text-2)">' +
            total + ' tareas' + (ven ? ' · <span style="color:#dc2626;font-weight:700">' + ven + ' vencida' + (ven > 1 ? 's' : '') + '</span>' : '') +
            ' · <strong>' + avance + '%</strong></span></div>' +
        '<div style="height:9px;background:var(--surface-2,#eef0f3);border-radius:5px;overflow:hidden">' +
          '<div style="height:100%;width:' + avance + '%;background:' + (avance >= 99 ? '#16a34a' : (p.color || '#3B82F6')) + ';border-radius:5px"></div></div></div>';
    });

    // Sección: vencidas
    const venSorted = vencidas.slice().sort((a, b) => a.end_date.localeCompare(b.end_date)).slice(0, 15);
    let venHTML = '<h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#dc2626;margin:0 0 12px">⚠ Tareas vencidas' + (vencidas.length ? ' (' + vencidas.length + ')' : '') + '</h3>';
    if (!venSorted.length) {
      venHTML += '<div style="color:#16a34a;font-size:13px">✓ No hay tareas vencidas.</div>';
    } else {
      venHTML += venSorted.map(t => {
        const m = t.assigned_to ? memById[t.assigned_to] : null;
        const pr = projById[t.project_id];
        return '<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">' +
          '<div style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.name) + '</div>' +
          '<div style="color:var(--text-3);font-size:11px">' + esc(pr ? pr.name : '') + (m ? ' · ' + esc(m.name) : ' · sin asignar') + '</div></div>' +
          '<div style="flex-shrink:0;text-align:right"><div style="color:#dc2626;font-weight:700">' + diasAtraso(t.end_date) + ' días</div>' +
          '<div style="color:var(--text-3);font-size:11px">venció ' + fmtD(t.end_date) + '</div></div></div>';
      }).join('');
      if (vencidas.length > 15) venHTML += '<div style="font-size:11px;color:var(--text-3);padding-top:6px">… y ' + (vencidas.length - 15) + ' más</div>';
    }

    // Sección: hitos
    let hitosHTML = '<h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-2);margin:0 0 12px">◆ Próximos hitos (60 días)</h3>';
    if (!hitos.length) {
      hitosHTML += '<div style="color:var(--text-3);font-size:13px">Sin hitos en los próximos 60 días.</div>';
    } else {
      hitosHTML += hitos.slice(0, 12).map(t => {
        const pr = projById[t.project_id];
        const dias = Math.round((new Date(t.start_date) - new Date(H)) / 864e5);
        return '<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">' +
          '<div style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">◆ ' + esc(t.name) + '</div>' +
          '<div style="color:var(--text-3);font-size:11px">' + esc(pr ? pr.name : '') + '</div></div>' +
          '<div style="flex-shrink:0;text-align:right"><div style="font-weight:700;color:' + (dias <= 7 ? '#d97706' : 'var(--text)') + '">' + fmtD(t.start_date) + '</div>' +
          '<div style="color:var(--text-3);font-size:11px">en ' + dias + ' día' + (dias === 1 ? '' : 's') + '</div></div></div>';
      }).join('');
    }

    // Secciones: carga por contratista / rubro
    function cargaHTML(titulo, lista) {
      let h = '<h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-2);margin:0 0 14px">' + titulo + '</h3>';
      if (!lista.length) return h + '<div style="color:var(--text-3);font-size:13px">Sin datos.</div>';
      const max = lista[0][1].total;
      lista.forEach(([k, v]) => {
        h += barRow(k, v.total, max,
          v.total + ' pend.' + (v.vencidas ? ' · <span style="color:#dc2626;font-weight:700">' + v.vencidas + ' venc.</span>' : ''),
          'var(--brand-orange,#FB7520)');
      });
      return h;
    }

    body.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:18px">' +
        kpi(activos, 'Proyectos activos') +
        kpi(avanceGlobal + '%', 'Avance promedio') +
        kpi(vencidas.length, 'Tareas vencidas', vencidas.length ? '#dc2626' : '#16a34a') +
        kpi(hitos.length, 'Hitos próximos (60 días)', hitos.length ? '#d97706' : undefined) +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:14px;margin-bottom:14px" class="p360-tb-grid">' +
        card(avanceHTML, 'min-height:200px') +
        '<div style="display:flex;flex-direction:column;gap:14px">' + card(venHTML) + card(hitosHTML) + '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px" class="p360-tb-grid">' +
        card(cargaHTML('Carga por contratista', porContratista)) +
        card(cargaHTML('Carga por rubro', porRubro)) +
      '</div>' +
      '<style>@media(max-width:900px){.p360-tb-grid{grid-template-columns:1fr!important}}</style>';
  }

  /* ── Botón en el Centro de Proyectos ── */
  function injectButton() {
    const header = document.querySelector('.projects-page-header');
    if (!header || header.querySelector('.p360-tb-btn')) return;
    const actions = header.lastElementChild;
    if (!actions) return;
    const btn = document.createElement('button');
    btn.className = 'btn p360-tb-btn';
    btn.title = 'Tablero general de la empresa: avance, vencidas, hitos y carga';
    btn.textContent = '📊 Tablero';
    btn.onclick = openTablero;
    actions.insertBefore(btn, actions.firstChild);
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
