/**
 * Buildplan 360 — Resumen del Proyecto + Dashboard de Vencimientos
 */
(function() {
  'use strict';

  /* ── Acceso a Supabase ── */
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

  /* ── Obtener proyecto actual ── */
  function getCurrentProjectId() {
    const root = document.getElementById('root');
    if (!root) return null;
    const fk = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fk) return null;
    let f = root[fk];
    for (let i = 0; i < 200 && f; i++) {
      const s = f.memoizedState;
      if (s && s.memoizedState && s.memoizedState.currentProject && s.memoizedState.currentProject.id) {
        return s.memoizedState.currentProject;
      }
      f = f.child || f.sibling || (f.return && f.return.sibling);
    }
    return null;
  }

  /* ── Date helpers ── */
  const today = () => new Date().toISOString().slice(0,10);
  const fmtDate = s => {
    if (!s) return '—';
    const [y,m,d] = s.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  };
  const daysUntil = d => {
    if (!d) return 0;
    return Math.round((new Date(d) - new Date(today())) / 86400000);
  };

  /* ══════════════════════════════════════════════════════════
     1. CSS
  ══════════════════════════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById('p360-resumen-css')) return;
    const s = document.createElement('style');
    s.id = 'p360-resumen-css';
    s.textContent = `
      .p360-resumen-page, .p360-vencimientos-page {
        flex: 1;
        overflow: auto;
        padding: 20px 24px;
        background: var(--bg, #F5F5F7);
      }
      .p360-resumen-grid {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 16px;
      }
      @media (max-width: 1100px) { .p360-resumen-grid { grid-template-columns: 1fr; } }

      .p360-card {
        background: var(--surface, #fff);
        border: 1px solid var(--border, #E5E7EB);
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 16px;
      }
      .p360-card-header {
        padding: 12px 16px;
        background: var(--surface-2, #F9FAFB);
        border-bottom: 1px solid var(--border, #E5E7EB);
        font-family: Gilroy, sans-serif;
        font-size: 13px;
        font-weight: 700;
        color: var(--brand-dark, #28283D);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .p360-card-body { padding: 14px 16px; }

      .p360-kpi-strip {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }
      .p360-kpi {
        background: var(--surface, #fff);
        border: 1px solid var(--border, #E5E7EB);
        border-radius: 10px;
        padding: 14px 16px;
        border-left: 4px solid var(--brand-orange, #FB7520);
      }
      .p360-kpi-n {
        font-family: Gilroy, sans-serif;
        font-size: 26px;
        font-weight: 800;
        color: var(--brand-dark, #28283D);
        line-height: 1;
      }
      .p360-kpi-l {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: var(--text-3, #9CA3AF);
        margin-top: 4px;
        font-weight: 600;
      }
      .p360-kpi[data-c=danger]  { border-left-color: var(--danger, #EF4444); }
      .p360-kpi[data-c=danger]  .p360-kpi-n { color: var(--danger, #EF4444); }
      .p360-kpi[data-c=success] { border-left-color: var(--success, #22C55E); }
      .p360-kpi[data-c=success] .p360-kpi-n { color: var(--success, #22C55E); }
      .p360-kpi[data-c=info]    { border-left-color: var(--info, #3366FF); }
      .p360-kpi[data-c=info]    .p360-kpi-n { color: var(--info, #3366FF); }
      .p360-kpi[data-c=warning] { border-left-color: #F59E0B; }
      .p360-kpi[data-c=warning] .p360-kpi-n { color: #F59E0B; }

      .p360-progress-big {
        height: 28px;
        background: var(--surface-3, #F3F4F6);
        border-radius: 14px;
        overflow: hidden;
        position: relative;
        margin: 8px 0;
      }
      .p360-progress-fill-big {
        height: 100%;
        background: linear-gradient(90deg, #22C55E 0%, #14B8A6 100%);
        transition: width .4s;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding-right: 12px;
        color: #fff;
        font-weight: 700;
        font-size: 13px;
        font-family: Gilroy, sans-serif;
      }

      .p360-task-list { font-size: 12px; }
      .p360-task-list-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
        border-bottom: 1px solid var(--border, #E5E7EB);
      }
      .p360-task-list-item:last-child { border-bottom: none; }
      .p360-task-list-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
      .p360-task-list-meta { font-size: 10px; color: var(--text-3, #9CA3AF); display: flex; gap: 6px; }
      .p360-badge {
        font-size: 10px;
        padding: 2px 8px;
        border-radius: 10px;
        font-weight: 700;
      }
      .p360-badge-overdue { background: #FEE2E2; color: #DC2626; }
      .p360-badge-soon    { background: #FEF3C7; color: #D97706; }
      .p360-badge-future  { background: #DCFCE7; color: #16A34A; }

      .p360-status-bar {
        display: flex;
        height: 12px;
        border-radius: 6px;
        overflow: hidden;
        margin: 8px 0;
        background: var(--surface-3, #F3F4F6);
      }
      .p360-status-bar > div {
        height: 100%;
        transition: width .4s;
      }

      .p360-resumen-page h2, .p360-vencimientos-page h2 {
        font-family: Gilroy, sans-serif;
        font-size: 20px;
        font-weight: 800;
        margin: 0 0 6px;
        color: var(--brand-dark, #28283D);
      }
      .p360-resumen-page .subtitle, .p360-vencimientos-page .subtitle {
        font-size: 12px;
        color: var(--text-3, #9CA3AF);
        margin-bottom: 18px;
      }

      /* Filtros vencimientos */
      .p360-venc-filters {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }
      .p360-venc-filter {
        padding: 6px 12px;
        border: 1px solid var(--border, #E5E7EB);
        border-radius: 6px;
        background: var(--surface, #fff);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all .12s;
      }
      .p360-venc-filter.active {
        background: var(--brand-orange, #FB7520);
        color: #fff;
        border-color: var(--brand-orange, #FB7520);
      }
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════
     2. RESUMEN — datos y render
  ══════════════════════════════════════════════════════════ */
  async function loadResumen(projectId) {
    const sb = getSB();
    if (!sb) return null;
    const [{data: tasks}, {data: deps}, {data: project}, {data: members}, {data: log}] = await Promise.all([
      sb.from('tasks').select('*').eq('project_id', projectId).order('order_index'),
      sb.from('task_dependencies').select('*'),
      sb.from('projects').select('*').eq('id', projectId).single(),
      sb.from('members').select('*').eq('active', true),
      sb.from('project_log_entries').select('id,entry_type,detail,created_at,author_id').eq('project_id', projectId).order('created_at', { ascending: false }).limit(5)
    ]);
    return { tasks: tasks || [], deps: deps || [], project, members: members || [], log: log || [] };
  }

  function renderResumen(data) {
    const { tasks, project, members, log } = data;
    const td = today();

    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const overdue = tasks.filter(t => t.end_date < td && t.status !== 'completed').length;
    const milestones = tasks.filter(t => t.is_milestone);
    const milestonesPending = milestones.filter(m => m.status !== 'completed');
    const pct = total > 0 ? Math.round(completed/total*100) : 0;

    // Avg progress all
    const avgProgress = total > 0 ? Math.round(tasks.reduce((s,t) => s + (t.progress||0), 0) / total) : 0;

    // Upcoming tasks (next 14 days, not completed)
    const upcoming = tasks
      .filter(t => t.end_date >= td && t.status !== 'completed' && daysUntil(t.end_date) <= 14)
      .sort((a,b) => a.end_date.localeCompare(b.end_date))
      .slice(0, 8);

    // Recent overdue
    const recentOverdue = tasks
      .filter(t => t.end_date < td && t.status !== 'completed')
      .sort((a,b) => a.end_date.localeCompare(b.end_date))
      .slice(0, 6);

    // Tasks by member
    const memberMap = {};
    members.forEach(m => memberMap[m.id] = m);
    const byMember = {};
    tasks.forEach(t => {
      if (!t.assigned_to) return;
      if (!byMember[t.assigned_to]) byMember[t.assigned_to] = { total: 0, completed: 0, overdue: 0 };
      byMember[t.assigned_to].total++;
      if (t.status === 'completed') byMember[t.assigned_to].completed++;
      if (t.end_date < td && t.status !== 'completed') byMember[t.assigned_to].overdue++;
    });
    const memberRows = Object.entries(byMember)
      .filter(([id]) => memberMap[id])
      .map(([id, v]) => ({ member: memberMap[id], ...v }))
      .sort((a,b) => b.total - a.total)
      .slice(0, 10);

    const totalStatusForBar = total || 1;
    const pctCompleted = completed/totalStatusForBar*100;
    const pctInProgress = inProgress/totalStatusForBar*100;
    const pctBlocked = blocked/totalStatusForBar*100;
    const pctPending = pending/totalStatusForBar*100;

    return `
      <h2>📋 Resumen del proyecto</h2>
      <div class="subtitle">
        ${project ? project.name : ''} · ${project && project.provincia ? project.provincia + ' · ' : ''}
        ${project ? fmtDate(project.start_date) + ' → ' + fmtDate(project.end_date) : ''}
      </div>

      <!-- KPIs principales -->
      <div class="p360-kpi-strip">
        <div class="p360-kpi" data-c="info">
          <div class="p360-kpi-n">${total}</div>
          <div class="p360-kpi-l">Tareas totales</div>
        </div>
        <div class="p360-kpi" data-c="success">
          <div class="p360-kpi-n">${completed}</div>
          <div class="p360-kpi-l">Completadas</div>
        </div>
        <div class="p360-kpi" data-c="warning">
          <div class="p360-kpi-n">${inProgress}</div>
          <div class="p360-kpi-l">En progreso</div>
        </div>
        <div class="p360-kpi" data-c="danger">
          <div class="p360-kpi-n">${overdue}</div>
          <div class="p360-kpi-l">Vencidas</div>
        </div>
        <div class="p360-kpi">
          <div class="p360-kpi-n">${milestones.length}</div>
          <div class="p360-kpi-l">Hitos (${milestonesPending.length} pendientes)</div>
        </div>
      </div>

      <!-- Avance global -->
      <div class="p360-card">
        <div class="p360-card-header">
          📈 Avance del cronograma
          <span style="font-size:11px;color:var(--text-3);font-weight:600">
            ${completed} de ${total} completadas
          </span>
        </div>
        <div class="p360-card-body">
          <div class="p360-progress-big">
            <div class="p360-progress-fill-big" style="width:${pct}%">${pct}%</div>
          </div>
          <div style="font-size:11px;color:var(--text-3);margin-top:8px">
            Progreso promedio ponderado por tarea: <strong>${avgProgress}%</strong>
          </div>

          <div style="margin-top:14px">
            <div style="font-size:11px;font-weight:600;margin-bottom:6px">Distribución por estado</div>
            <div class="p360-status-bar" title="Estado de tareas">
              <div style="width:${pctCompleted}%;background:#22C55E" title="Completadas: ${completed}"></div>
              <div style="width:${pctInProgress}%;background:#3366FF" title="En progreso: ${inProgress}"></div>
              <div style="width:${pctBlocked}%;background:#EF4444" title="Bloqueadas: ${blocked}"></div>
              <div style="width:${pctPending}%;background:#9CA3AF" title="Pendientes: ${pending}"></div>
            </div>
            <div style="display:flex;gap:14px;font-size:10px;margin-top:6px;flex-wrap:wrap">
              <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#22C55E;vertical-align:middle"></span> Completadas (${completed})</span>
              <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#3366FF;vertical-align:middle"></span> En progreso (${inProgress})</span>
              <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#EF4444;vertical-align:middle"></span> Bloqueadas (${blocked})</span>
              <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#9CA3AF;vertical-align:middle"></span> Pendientes (${pending})</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Layout 2 columnas: próximas + por responsable -->
      <div class="p360-resumen-grid">

        <!-- Próximas tareas + Vencidas recientes -->
        <div>
          <div class="p360-card">
            <div class="p360-card-header">
              ⏰ Próximas a vencer (14 días)
              <span style="font-size:11px;color:var(--text-3);font-weight:600">${upcoming.length}</span>
            </div>
            <div class="p360-card-body">
              ${upcoming.length === 0 ? '<div style="color:#999;font-size:12px;text-align:center;padding:8px">No hay tareas próximas en los siguientes 14 días</div>' : `
                <div class="p360-task-list">
                  ${upcoming.map(t => {
                    const dl = daysUntil(t.end_date);
                    const assignee = memberMap[t.assigned_to];
                    return `
                      <div class="p360-task-list-item">
                        <div class="p360-task-list-name">${t.is_milestone ? '◆ ' : ''}${t.name}</div>
                        ${assignee ? `<span style="font-size:10px;color:var(--text-3)">${assignee.name}</span>` : ''}
                        <span class="p360-badge ${dl <= 3 ? 'p360-badge-soon' : 'p360-badge-future'}">${dl === 0 ? 'HOY' : dl + 'd'}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
          </div>

          ${recentOverdue.length > 0 ? `
          <div class="p360-card">
            <div class="p360-card-header" style="background:#FEE2E2;color:#DC2626">
              ⚠️ Tareas vencidas
              <span style="font-size:11px;font-weight:600">${overdue} en total</span>
            </div>
            <div class="p360-card-body">
              <div class="p360-task-list">
                ${recentOverdue.map(t => {
                  const dl = daysUntil(t.end_date);
                  const assignee = memberMap[t.assigned_to];
                  return `
                    <div class="p360-task-list-item">
                      <div class="p360-task-list-name">${t.is_milestone ? '◆ ' : ''}${t.name}</div>
                      ${assignee ? `<span style="font-size:10px;color:var(--text-3)">${assignee.name}</span>` : ''}
                      <span class="p360-badge p360-badge-overdue">${Math.abs(dl)}d atraso</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
          ` : ''}
        </div>

        <!-- Por responsable + Hitos -->
        <div>
          <div class="p360-card">
            <div class="p360-card-header">
              👥 Carga por responsable
            </div>
            <div class="p360-card-body">
              ${memberRows.length === 0 ? '<div style="color:#999;font-size:12px;text-align:center;padding:8px">Ningún responsable asignado</div>' : `
                <div class="p360-task-list">
                  ${memberRows.map(r => {
                    const pctM = r.total > 0 ? Math.round(r.completed/r.total*100) : 0;
                    const initials = r.member.name.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase();
                    return `
                      <div class="p360-task-list-item" style="gap:8px">
                        <div style="width:22px;height:22px;border-radius:50%;background:${r.member.color||'#3366FF'};color:#fff;font-size:9px;font-weight:700;display:grid;place-items:center;flex-shrink:0">${initials}</div>
                        <div class="p360-task-list-name" style="font-size:11px">${r.member.name}</div>
                        <span style="font-size:10px;color:var(--success);font-weight:700">${r.completed}</span>
                        <span style="font-size:10px;color:var(--text-3)">/${r.total}</span>
                        ${r.overdue > 0 ? `<span class="p360-badge p360-badge-overdue">${r.overdue}!</span>` : ''}
                        <span style="font-size:10px;font-weight:700;color:var(--text-2);min-width:30px;text-align:right">${pctM}%</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
          </div>

          ${milestones.length > 0 ? `
          <div class="p360-card">
            <div class="p360-card-header">
              ◆ Hitos del proyecto
              <span style="font-size:11px;color:var(--text-3);font-weight:600">${milestonesPending.length} pendientes</span>
            </div>
            <div class="p360-card-body">
              <div class="p360-task-list">
                ${milestones.slice(0,8).map(m => {
                  const isDone = m.status === 'completed';
                  const dl = daysUntil(m.end_date);
                  return `
                    <div class="p360-task-list-item">
                      <span style="color:${isDone ? '#22C55E' : (dl < 0 ? '#EF4444' : '#FB7520')}">◆</span>
                      <div class="p360-task-list-name" style="text-decoration:${isDone?'line-through':'none'};color:${isDone?'var(--text-3)':'var(--text)'}">${m.name}</div>
                      <span style="font-size:10px;color:var(--text-3)">${fmtDate(m.end_date)}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
          ` : ''}

          ${log.length > 0 ? `
          <div class="p360-card">
            <div class="p360-card-header">📖 Últimas entradas del libro</div>
            <div class="p360-card-body">
              <div class="p360-task-list">
                ${log.map(l => `
                  <div class="p360-task-list-item" style="flex-direction:column;align-items:stretch;gap:2px">
                    <div style="font-size:11px;color:var(--text-3)">${new Date(l.created_at).toLocaleDateString('es-AR')} · ${l.entry_type||'nota'}</div>
                    <div style="font-size:12px;color:var(--text);line-height:1.3">${(l.detail||'').slice(0,140)}${(l.detail||'').length > 140 ? '…' : ''}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /* ══════════════════════════════════════════════════════════
     3. VENCIMIENTOS — dashboard global
  ══════════════════════════════════════════════════════════ */
  async function loadVencimientos() {
    const sb = getSB();
    if (!sb) return null;
    const [{data: tasks}, {data: projects}, {data: members}] = await Promise.all([
      sb.from('tasks').select('*').neq('status', 'completed'),
      sb.from('projects').select('id,name,color,status'),
      sb.from('members').select('id,name,color').eq('active', true)
    ]);
    return { tasks: tasks || [], projects: projects || [], members: members || [] };
  }

  function renderVencimientos(data, filter) {
    const { tasks, projects, members } = data;
    const projMap = {}; projects.forEach(p => projMap[p.id] = p);
    const memMap  = {}; members.forEach(m => memMap[m.id]   = m);

    const td = today();
    const overdue   = tasks.filter(t => t.end_date < td).sort((a,b) => a.end_date.localeCompare(b.end_date));
    const today_due = tasks.filter(t => t.end_date === td);
    const next7     = tasks.filter(t => daysUntil(t.end_date) > 0 && daysUntil(t.end_date) <= 7).sort((a,b) => a.end_date.localeCompare(b.end_date));
    const next30    = tasks.filter(t => daysUntil(t.end_date) > 7 && daysUntil(t.end_date) <= 30).sort((a,b) => a.end_date.localeCompare(b.end_date));

    let displayed = [];
    if (filter === 'overdue') displayed = overdue;
    else if (filter === 'today') displayed = today_due;
    else if (filter === 'week') displayed = next7;
    else if (filter === 'month') displayed = next30;
    else displayed = [...overdue, ...today_due, ...next7, ...next30];

    return `
      <h2>🔔 Tareas próximas a vencer</h2>
      <div class="subtitle">Vista consolidada de todos los cronogramas activos</div>

      <div class="p360-kpi-strip">
        <div class="p360-kpi" data-c="danger">
          <div class="p360-kpi-n">${overdue.length}</div>
          <div class="p360-kpi-l">Vencidas</div>
        </div>
        <div class="p360-kpi" data-c="warning">
          <div class="p360-kpi-n">${today_due.length}</div>
          <div class="p360-kpi-l">Vencen hoy</div>
        </div>
        <div class="p360-kpi" data-c="info">
          <div class="p360-kpi-n">${next7.length}</div>
          <div class="p360-kpi-l">Esta semana</div>
        </div>
        <div class="p360-kpi" data-c="success">
          <div class="p360-kpi-n">${next30.length}</div>
          <div class="p360-kpi-l">Este mes</div>
        </div>
      </div>

      <div class="p360-venc-filters">
        <button class="p360-venc-filter ${filter==='all'?'active':''}" data-filter="all">Todas (${overdue.length + today_due.length + next7.length + next30.length})</button>
        <button class="p360-venc-filter ${filter==='overdue'?'active':''}" data-filter="overdue">⚠️ Vencidas (${overdue.length})</button>
        <button class="p360-venc-filter ${filter==='today'?'active':''}" data-filter="today">📍 Hoy (${today_due.length})</button>
        <button class="p360-venc-filter ${filter==='week'?'active':''}" data-filter="week">📅 Esta semana (${next7.length})</button>
        <button class="p360-venc-filter ${filter==='month'?'active':''}" data-filter="month">🗓️ Este mes (${next30.length})</button>
      </div>

      <div class="p360-card">
        <div class="p360-card-header">
          Listado (${displayed.length})
        </div>
        <div class="p360-card-body" style="padding:0">
          ${displayed.length === 0 ? '<div style="color:#999;text-align:center;padding:30px">Sin tareas en este filtro 🎉</div>' : `
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:var(--surface-2);text-transform:uppercase;font-size:10px;color:var(--text-3)">
                <th style="text-align:left;padding:8px 14px">Tarea</th>
                <th style="text-align:left;padding:8px 14px">Cronograma</th>
                <th style="text-align:left;padding:8px 14px">Responsable</th>
                <th style="text-align:center;padding:8px 14px">Fecha fin</th>
                <th style="text-align:center;padding:8px 14px">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${displayed.map(t => {
                const dl = daysUntil(t.end_date);
                const proj = projMap[t.project_id];
                const assignee = memMap[t.assigned_to];
                let badge = '';
                if (dl < 0) badge = `<span class="p360-badge p360-badge-overdue">${Math.abs(dl)}d atraso</span>`;
                else if (dl === 0) badge = `<span class="p360-badge p360-badge-soon">HOY</span>`;
                else if (dl <= 7) badge = `<span class="p360-badge p360-badge-soon">${dl}d</span>`;
                else badge = `<span class="p360-badge p360-badge-future">${dl}d</span>`;
                return `
                  <tr style="border-bottom:1px solid var(--border)">
                    <td style="padding:10px 14px"><strong>${t.is_milestone ? '◆ ' : ''}${t.name}</strong></td>
                    <td style="padding:10px 14px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${proj && proj.color || '#999'};margin-right:6px"></span>${proj ? proj.name : '—'}</td>
                    <td style="padding:10px 14px">${assignee ? assignee.name : '—'}</td>
                    <td style="padding:10px 14px;text-align:center;font-family:JetBrains Mono,monospace;font-size:11px">${fmtDate(t.end_date)}</td>
                    <td style="padding:10px 14px;text-align:center">${badge}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          `}
        </div>
      </div>
    `;
  }

  /* ══════════════════════════════════════════════════════════
     4. WATCHERS — detectar cambio de página
  ══════════════════════════════════════════════════════════ */
  let _currentVencFilter = 'all';

  async function tryRender() {
    const resumenPage = document.getElementById('p360-resumen-page');
    const vencPage = document.getElementById('p360-vencimientos-page');

    if (resumenPage && !resumenPage._rendered) {
      resumenPage._rendered = true;
      resumenPage.innerHTML = '<div style="padding:40px;text-align:center;color:#999">Cargando resumen...</div>';
      const proj = getCurrentProjectId();
      if (!proj) {
        resumenPage.innerHTML = '<div style="padding:40px;text-align:center;color:#999">Sin proyecto seleccionado</div>';
        return;
      }
      const data = await loadResumen(proj.id);
      if (data) {
        data.project = data.project || proj;
        resumenPage.innerHTML = renderResumen(data);
      }
    }

    if (vencPage && !vencPage._rendered) {
      vencPage._rendered = true;
      vencPage.innerHTML = '<div style="padding:40px;text-align:center;color:#999">Cargando vencimientos...</div>';
      const data = await loadVencimientos();
      if (data) {
        vencPage.innerHTML = renderVencimientos(data, _currentVencFilter);
        // Hook filters
        vencPage.querySelectorAll('.p360-venc-filter').forEach(btn => {
          btn.addEventListener('click', () => {
            _currentVencFilter = btn.dataset.filter;
            vencPage.innerHTML = renderVencimientos(data, _currentVencFilter);
            // Re-hook filters after re-render
            vencPage.querySelectorAll('.p360-venc-filter').forEach(b => {
              b.addEventListener('click', () => {
                _currentVencFilter = b.dataset.filter;
                vencPage.innerHTML = renderVencimientos(data, _currentVencFilter);
                tryRender(); // re-attach
              });
            });
          });
        });
      }
    }
  }

  function watchPages() {
    const obs = new MutationObserver(() => {
      const r = document.getElementById('p360-resumen-page');
      const v = document.getElementById('p360-vencimientos-page');
      if ((r && !r._rendered) || (v && !v._rendered)) {
        tryRender();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ══════════════════════════════════════════════════════════
     5. SIDEBAR — botón Vencimientos
  ══════════════════════════════════════════════════════════ */
  function injectSidebarButton() {
    const sidebar = document.querySelector('.sidebar-nav');
    if (!sidebar) return;
    if (document.getElementById('p360-venc-sidebar-btn')) return;

    // Find the "Inicio" button to insert after it
    const homeBtn = Array.from(sidebar.querySelectorAll('.sidebar-item')).find(b =>
      b.textContent.includes('Inicio')
    );
    if (!homeBtn) return;

    const btn = document.createElement('button');
    btn.id = 'p360-venc-sidebar-btn';
    btn.className = 'sidebar-item';
    btn.innerHTML = '<span class="sidebar-item-icon">🔔</span>Vencimientos';
    btn.addEventListener('click', () => {
      // Find React store and call setPage('vencimientos')
      const root = document.getElementById('root');
      const fk = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (fk) {
        let f = root[fk];
        for (let i = 0; i < 200 && f; i++) {
          const s = f.memoizedState;
          if (s && s.memoizedState && typeof s.memoizedState.setPage === 'function') {
            s.memoizedState.setPage('vencimientos');
            // Active state
            sidebar.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            return;
          }
          f = f.child || f.sibling || (f.return && f.return.sibling);
        }
      }
    });
    homeBtn.parentNode.insertBefore(btn, homeBtn.nextSibling);
  }

  /* ── Init ── */
  function init() {
    injectCSS();
    watchPages();
    const obs = new MutationObserver(() => injectSidebarButton());
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(injectSidebarButton, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
