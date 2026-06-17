/**
 * Buildplan 360 — Panel de Administración del Sistema
 * Botón en sidebar visible solo para admins.
 * Muestra: KPIs por proyecto, uso de DB y storage, backup manual.
 */
(function() {
  'use strict';

  /* ── Espera a que Supabase esté listo ── */
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

  /* ── Verifica si usuario es admin ── */
  function isAdmin() {
    const root = document.getElementById('root');
    if (!root) return false;
    const fk = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fk) return false;
    let f = root[fk];
    for (let i = 0; i < 100 && f; i++) {
      const s = f.memoizedState;
      if (s && s.memoizedState && s.memoizedState.canAdmin === true) return true;
      f = f.child || f.sibling || (f.return && f.return.sibling);
    }
    return false;
  }

  /* ── CSS ── */
  function injectCSS() {
    if (document.getElementById('p360-admin-css')) return;
    const s = document.createElement('style');
    s.id = 'p360-admin-css';
    s.textContent = `
      #p360-admin-modal {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.6);
        z-index: 9999;
        align-items: flex-start;
        justify-content: center;
        padding: 40px 20px;
        overflow-y: auto;
      }
      #p360-admin-modal.open { display: flex; }
      .p360-admin-panel {
        background: var(--surface, #fff);
        border-radius: 12px;
        max-width: 1100px;
        width: 100%;
        box-shadow: var(--shadow-lg, 0 20px 40px rgba(0,0,0,.3));
        font-family: inherit;
      }
      .p360-admin-header {
        background: var(--brand-dark, #28283D);
        color: #fff;
        padding: 16px 24px;
        border-radius: 12px 12px 0 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .p360-admin-title {
        font-family: Gilroy, sans-serif;
        font-size: 16px;
        font-weight: 800;
        letter-spacing: -.01em;
      }
      .p360-admin-close {
        background: rgba(255,255,255,.15);
        border: 1px solid rgba(255,255,255,.2);
        color: #fff;
        border-radius: 6px;
        padding: 4px 12px;
        font-size: 12px;
        cursor: pointer;
      }
      .p360-admin-close:hover { background: rgba(255,255,255,.25); }
      .p360-admin-body { padding: 20px 24px; }
      .p360-admin-section {
        margin-bottom: 24px;
        border: 1px solid var(--border, #E5E7EB);
        border-radius: 8px;
        overflow: hidden;
      }
      .p360-admin-section-header {
        background: var(--surface-2, #F9FAFB);
        padding: 10px 14px;
        font-family: Gilroy, sans-serif;
        font-size: 13px;
        font-weight: 700;
        color: var(--brand-dark, #28283D);
        border-bottom: 1px solid var(--border, #E5E7EB);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .p360-admin-section-content { padding: 14px; }
      .p360-admin-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px;
      }
      .p360-admin-stat {
        background: var(--surface-2, #F9FAFB);
        border-radius: 6px;
        padding: 10px 12px;
        border-left: 3px solid var(--brand-orange, #FB7520);
      }
      .p360-admin-stat-n {
        font-family: Gilroy, sans-serif;
        font-size: 22px;
        font-weight: 800;
        color: var(--brand-dark, #28283D);
        line-height: 1;
      }
      .p360-admin-stat-l {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: var(--text-3, #9CA3AF);
        margin-top: 4px;
        font-weight: 600;
      }
      .p360-admin-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }
      .p360-admin-table th {
        text-align: left;
        padding: 6px 8px;
        background: var(--surface-2, #F9FAFB);
        font-weight: 700;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: var(--text-3, #9CA3AF);
        border-bottom: 1px solid var(--border, #E5E7EB);
      }
      .p360-admin-table td {
        padding: 6px 8px;
        border-bottom: 1px solid var(--border, #E5E7EB);
      }
      .p360-admin-table tr:last-child td { border-bottom: none; }
      .p360-admin-btn {
        background: var(--brand-orange, #FB7520);
        color: #fff;
        border: none;
        padding: 6px 14px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity .15s;
      }
      .p360-admin-btn:hover { opacity: .9; }
      .p360-admin-btn:disabled { opacity: .5; cursor: wait; }
      .p360-admin-btn-sm { padding: 3px 10px; font-size: 11px; }
      .p360-admin-btn-secondary {
        background: transparent;
        color: var(--brand-orange, #FB7520);
        border: 1px solid var(--brand-orange, #FB7520);
      }
      .p360-progress-bar {
        height: 6px;
        background: var(--surface-3, #F3F4F6);
        border-radius: 3px;
        overflow: hidden;
        margin-top: 4px;
      }
      .p360-progress-fill {
        height: 100%;
        background: var(--success, #22C55E);
        border-radius: 3px;
        transition: width .3s;
      }
      .p360-progress-fill.warning { background: var(--brand-orange, #FB7520); }
      .p360-progress-fill.danger { background: var(--danger, #EF4444); }

      /* Sidebar button */
      .p360-admin-sidebar-btn {
        margin-top: 10px;
      }
    `;
    document.head.appendChild(s);
  }

  /* ── Crear modal ── */
  function createModal() {
    if (document.getElementById('p360-admin-modal')) return;
    const m = document.createElement('div');
    m.id = 'p360-admin-modal';
    m.innerHTML = `
      <div class="p360-admin-panel">
        <div class="p360-admin-header">
          <div class="p360-admin-title">⚙️ Panel de Administración del Sistema</div>
          <button class="p360-admin-close" onclick="document.getElementById('p360-admin-modal').classList.remove('open')">✕ Cerrar</button>
        </div>
        <div class="p360-admin-body" id="p360-admin-body">
          <div style="padding:40px;text-align:center;color:#999">Cargando…</div>
        </div>
      </div>
    `;
    m.addEventListener('click', e => {
      if (e.target === m) m.classList.remove('open');
    });
    document.body.appendChild(m);
  }

  /* ── Cargar y renderizar datos ── */
  async function loadAdminData() {
    const sb = getSB();
    if (!sb) {
      document.getElementById('p360-admin-body').innerHTML =
        '<div style="padding:40px;color:#c00">No se pudo conectar a la base de datos</div>';
      return;
    }

    try {
      const [summary, dbUsage, storageUsage, members, baselines] = await Promise.all([
        sb.from('project_summary').select('*'),
        sb.from('database_usage').select('*'),
        sb.from('storage_usage').select('*'),
        sb.from('members').select('id,name,role,active').eq('active', true),
        sb.from('project_baselines').select('id,project_id,name,created_at').order('created_at', { ascending: false }).limit(10)
      ]);

      renderAdmin({
        projects: summary.data || [],
        dbUsage: dbUsage.data || [],
        storageUsage: storageUsage.data || [],
        members: members.data || [],
        baselines: baselines.data || []
      });
    } catch (err) {
      document.getElementById('p360-admin-body').innerHTML =
        '<div style="padding:40px;color:#c00">Error: ' + err.message + '</div>';
    }
  }

  function renderAdmin(data) {
    const { projects, dbUsage, storageUsage, members, baselines } = data;

    // Totales
    const totalTasks = projects.reduce((s, p) => s + (p.total_tasks || 0), 0);
    const totalCompleted = projects.reduce((s, p) => s + (p.tasks_completed || 0), 0);
    const totalOverdue = projects.reduce((s, p) => s + (p.tasks_overdue || 0), 0);

    // Storage
    const totalStorageMb = storageUsage.reduce((s, b) => s + parseFloat(b.size_mb || 0), 0);
    const storagePctFree = (totalStorageMb / 1024) * 100;

    // DB size
    const totalDbBytes = dbUsage.reduce((s, t) => s + parseInt(t.bytes || 0), 0);
    const totalDbMb = totalDbBytes / 1024 / 1024;
    const dbPctFree = (totalDbMb / 500) * 100;

    const html = `
      <!-- KPIs generales -->
      <div class="p360-admin-section">
        <div class="p360-admin-section-header">📊 Resumen general</div>
        <div class="p360-admin-section-content">
          <div class="p360-admin-stats">
            <div class="p360-admin-stat">
              <div class="p360-admin-stat-n">${projects.length}</div>
              <div class="p360-admin-stat-l">Cronogramas activos</div>
            </div>
            <div class="p360-admin-stat">
              <div class="p360-admin-stat-n">${totalTasks}</div>
              <div class="p360-admin-stat-l">Tareas totales</div>
            </div>
            <div class="p360-admin-stat" style="border-left-color:#22C55E">
              <div class="p360-admin-stat-n">${totalCompleted}</div>
              <div class="p360-admin-stat-l">Completadas</div>
            </div>
            <div class="p360-admin-stat" style="border-left-color:#EF4444">
              <div class="p360-admin-stat-n">${totalOverdue}</div>
              <div class="p360-admin-stat-l">Vencidas</div>
            </div>
            <div class="p360-admin-stat" style="border-left-color:#3366FF">
              <div class="p360-admin-stat-n">${members.length}</div>
              <div class="p360-admin-stat-l">Usuarios activos</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Uso de recursos Supabase -->
      <div class="p360-admin-section">
        <div class="p360-admin-section-header">💾 Uso de recursos (Plan Free)</div>
        <div class="p360-admin-section-content">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div>
              <div style="font-size:12px;font-weight:700;margin-bottom:4px">
                Base de datos: ${totalDbMb.toFixed(2)} MB / 500 MB
              </div>
              <div class="p360-progress-bar">
                <div class="p360-progress-fill ${dbPctFree > 80 ? 'danger' : dbPctFree > 50 ? 'warning' : ''}" style="width:${Math.min(100,dbPctFree)}%"></div>
              </div>
              <div style="font-size:10px;color:var(--text-3);margin-top:2px">${dbPctFree.toFixed(2)}% usado</div>
            </div>
            <div>
              <div style="font-size:12px;font-weight:700;margin-bottom:4px">
                Storage (adjuntos): ${totalStorageMb.toFixed(2)} MB / 1024 MB
              </div>
              <div class="p360-progress-bar">
                <div class="p360-progress-fill ${storagePctFree > 80 ? 'danger' : storagePctFree > 50 ? 'warning' : ''}" style="width:${Math.min(100,storagePctFree)}%"></div>
              </div>
              <div style="font-size:10px;color:var(--text-3);margin-top:2px">${storagePctFree.toFixed(2)}% usado</div>
            </div>
          </div>

          <table class="p360-admin-table" style="margin-top:14px">
            <thead>
              <tr>
                <th>Tabla</th>
                <th style="text-align:right">Tamaño total</th>
              </tr>
            </thead>
            <tbody>
              ${dbUsage.slice(0,8).map(t => `
                <tr>
                  <td>${t.tablename}</td>
                  <td style="text-align:right;font-family:monospace">${t.total_size}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Cronogramas con KPIs -->
      <div class="p360-admin-section">
        <div class="p360-admin-section-header">🏗️ Cronogramas (${projects.length})</div>
        <div class="p360-admin-section-content">
          ${projects.length === 0 ? '<div style="color:#999;text-align:center;padding:20px">Sin proyectos creados</div>' : `
          <table class="p360-admin-table">
            <thead>
              <tr>
                <th>Proyecto</th>
                <th style="text-align:center">Tareas</th>
                <th style="text-align:center">Completadas</th>
                <th style="text-align:center">En progreso</th>
                <th style="text-align:center">Vencidas</th>
                <th style="text-align:center">% Avance</th>
                <th style="text-align:right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${projects.map(p => `
                <tr>
                  <td><strong>${p.name}</strong> <span style="color:#999;font-size:10px">${p.status||''}</span></td>
                  <td style="text-align:center">${p.total_tasks || 0}</td>
                  <td style="text-align:center;color:#22C55E">${p.tasks_completed || 0}</td>
                  <td style="text-align:center;color:#3366FF">${p.tasks_in_progress || 0}</td>
                  <td style="text-align:center;color:${(p.tasks_overdue||0) > 0 ? '#EF4444' : '#999'}">${p.tasks_overdue || 0}</td>
                  <td style="text-align:center">
                    <strong>${p.pct_complete || 0}%</strong>
                  </td>
                  <td style="text-align:right">
                    <button class="p360-admin-btn p360-admin-btn-sm p360-admin-btn-secondary" onclick="window._p360exportProject('${p.id}','${(p.name||'').replace(/'/g,"")}')">📥 Backup</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          `}
        </div>
      </div>

      <!-- Backups recientes -->
      <div class="p360-admin-section">
        <div class="p360-admin-section-header">📦 Baselines recientes (${baselines.length})</div>
        <div class="p360-admin-section-content">
          ${baselines.length === 0 ? '<div style="color:#999;text-align:center;padding:20px">No hay baselines guardados todavía. Crealos desde el botón "Baselines" en cada cronograma.</div>' : `
          <table class="p360-admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Proyecto</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              ${baselines.map(b => {
                const proj = projects.find(p => p.id === b.project_id);
                return `<tr>
                  <td>${b.name}</td>
                  <td>${proj ? proj.name : '—'}</td>
                  <td>${new Date(b.created_at).toLocaleDateString('es-AR')}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          `}
        </div>
      </div>
    `;

    document.getElementById('p360-admin-body').innerHTML = html;
  }

  /* ── Backup de proyecto a JSON descargable ── */
  window._p360exportProject = async function(projectId, projectName) {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ Generando…';
    try {
      const sb = getSB();
      const { data, error } = await sb.rpc('export_project', { p_project_id: projectId });
      if (error) throw error;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0,10);
      a.download = 'backup_' + (projectName || 'proyecto').replace(/\W+/g,'_') + '_' + date + '.json';
      a.click();
      URL.revokeObjectURL(url);
      btn.textContent = '✓ Descargado';
      setTimeout(() => { btn.disabled = false; btn.textContent = '📥 Backup'; }, 2000);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '❌ Error';
      alert('Error al exportar: ' + err.message);
      setTimeout(() => { btn.textContent = '📥 Backup'; }, 2000);
    }
  };

  /* ── Inyectar botón en sidebar ── */
  function injectSidebarButton() {
    if (!isAdmin()) return;
    const sidebar = document.querySelector('.sidebar-nav');
    if (!sidebar || document.getElementById('p360-admin-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'p360-admin-btn';
    btn.className = 'sidebar-item p360-admin-sidebar-btn';
    btn.innerHTML = '<span class="sidebar-item-icon">⚙️</span>Panel Admin';
    btn.addEventListener('click', () => {
      document.getElementById('p360-admin-modal').classList.add('open');
      document.getElementById('p360-admin-body').innerHTML =
        '<div style="padding:40px;text-align:center;color:#999">Cargando…</div>';
      loadAdminData();
    });
    sidebar.appendChild(btn);
  }

  /* ── Init ── */
  function init() {
    injectCSS();
    createModal();
    // Observe DOM for sidebar
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
