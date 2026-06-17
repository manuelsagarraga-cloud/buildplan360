/**
 * Pipeline360 — Dashboard de Gestión
 * Bloque visible solo para admin/editor en la home page.
 * 4 módulos:
 *  1. Tareas vencidas por recurso (tabla + barra)
 *  2. Completadas vs total por recurso (barras horizontales)
 *  3. Curva de carga — tareas pendientes por mes
 *  4. Entregas del año — proyectos con fecha de fin próxima
 */
(function () {
  'use strict';

  /* ── Supabase client via window ── */
  function getSupabase() {
    // The app stores supabase client as K in the bundle.
    // We access it via the global store exposed by zustand
    // or re-instantiate from the stored URL/key in the DOM
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    // Try to find existing client via a known pattern
    // Fallback: read from meta or env injected by app
    return window._p360sb || null;
  }

  /* ── Bridge to Supabase ── */
  async function query(table, options) {
    const sb = window._p360sb;
    if (!sb) throw new Error('Supabase not ready');
    let q = sb.from(table).select(options.select || '*');
    if (options.eq)   q = q.eq(options.eq[0], options.eq[1]);
    if (options.order) q = q.order(options.order[0], { ascending: options.order[1] !== false });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  /* ── Expose Supabase from React fiber ── */
  function bridgeSupabase() {
    if (window._p360sb) return;
    const root = document.getElementById('root');
    if (!root) return;

    // Walk fiber to find supabase client (named K in bundle — has .from() method)
    function walkFiber(fiber, depth) {
      if (!fiber || depth > 40) return null;
      // Check memoized state for objects that look like supabase
      const check = (obj) => {
        if (!obj || typeof obj !== 'object') return false;
        return typeof obj.from === 'function' && typeof obj.auth === 'object';
      };

      const props = fiber.memoizedProps || {};
      const state = fiber.memoizedState;

      // Check props values
      for (const v of Object.values(props)) {
        if (check(v)) { window._p360sb = v; return v; }
      }
      // Check state chain
      let s = state;
      let sc = 0;
      while (s && sc < 20) {
        const mv = s.memoizedState;
        if (check(mv)) { window._p360sb = mv; return mv; }
        if (mv && typeof mv === 'object') {
          for (const v of Object.values(mv)) {
            if (check(v)) { window._p360sb = v; return v; }
          }
        }
        s = s.next;
        sc++;
      }
      return walkFiber(fiber.child, depth+1) ||
             walkFiber(fiber.sibling, depth+1);
    }

    const fkey = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (fkey) walkFiber(root[fkey], 0);
  }

  /* ── Date helpers ── */
  const today = () => new Date().toISOString().slice(0, 10);
  const monthKey = (d) => d.slice(0, 7); // "2026-03"
  const monthLabel = (ym) => {
    const [y, m] = ym.split('-');
    const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return names[parseInt(m)-1] + ' ' + y.slice(2);
  };
  const addMonths = (ym, n) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return d.toISOString().slice(0, 7);
  };
  const fmtDate = (s) => {
    if (!s) return '—';
    const [y,m,d] = s.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  };
  const daysAgo = (d) => {
    if (!d) return 0;
    return Math.round((new Date(today()) - new Date(d)) / 86400000);
  };

  /* ══════════════════════════════════════════════════════════
     DATA LOADING
  ══════════════════════════════════════════════════════════ */
  async function loadDashboardData() {
    const [tasks, members, projects] = await Promise.all([
      query('tasks', { select: 'id,name,status,end_date,start_date,assigned_to,project_id,progress,task_type_category' }),
      query('members', { select: 'id,name,color,role', eq: ['active', true] }),
      query('projects', { select: 'id,name,end_date,start_date,status,external_links,color,provincia' }),
    ]);

    const td = today();
    const yearEnd = td.slice(0, 4) + '-12-31';

    // Member map
    const memberMap = {};
    members.forEach(m => { memberMap[m.id] = m; });

    // Project map
    const projMap = {};
    projects.forEach(p => { projMap[p.id] = p; });

    /* 1. Tareas vencidas por recurso */
    const overdueTasks = tasks.filter(t =>
      t.end_date < td && t.status !== 'completed' && t.assigned_to
    );
    const overdueByMember = {};
    overdueTasks.forEach(t => {
      const id = t.assigned_to;
      if (!overdueByMember[id]) overdueByMember[id] = { member: memberMap[id], tasks: [] };
      overdueByMember[id].tasks.push(t);
    });
    const overdueRows = Object.values(overdueByMember)
      .filter(r => r.member)
      .sort((a, b) => b.tasks.length - a.tasks.length);

    /* 2. Completadas vs total por recurso */
    const byMember = {};
    tasks.forEach(t => {
      if (!t.assigned_to) return;
      if (!byMember[t.assigned_to]) byMember[t.assigned_to] = { total: 0, completed: 0 };
      byMember[t.assigned_to].total++;
      if (t.status === 'completed') byMember[t.assigned_to].completed++;
    });
    const completionRows = members
      .filter(m => byMember[m.id] && byMember[m.id].total > 0)
      .map(m => ({ member: m, ...byMember[m.id] }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);

    /* 3. Curva de carga — tareas pendientes con vencimiento por mes */
    const curCur = monthKey(td);
    const months = [];
    for (let i = 0; i < 10; i++) months.push(addMonths(curCur, i));

    const loadByMonth = {};
    months.forEach(m => { loadByMonth[m] = { pending: 0, completed: 0 }; });
    tasks.forEach(t => {
      if (!t.end_date) return;
      const mk = monthKey(t.end_date);
      if (!loadByMonth[mk]) return;
      if (t.status === 'completed') loadByMonth[mk].completed++;
      else loadByMonth[mk].pending++;
    });

    /* 4. Entregas del año */
    const deliveries = projects
      .filter(p => p.end_date && p.end_date >= td && p.end_date <= yearEnd && p.status !== 'completed' && p.status !== 'cancelled')
      .sort((a, b) => a.end_date.localeCompare(b.end_date));

    return { overdueRows, completionRows, loadByMonth, months, deliveries, projMap, memberMap, td };
  }

  /* ══════════════════════════════════════════════════════════
     CHART HELPERS — SVG puro, sin librerías
  ══════════════════════════════════════════════════════════ */
  function barChart(values, labels, colors, height) {
    const max = Math.max(...values, 1);
    const w = 100 / values.length;
    const bars = values.map((v, i) => {
      const h = (v / max) * (height - 24);
      const x = i * w + w * 0.1;
      const y = height - 20 - h;
      const color = Array.isArray(colors) ? colors[i % colors.length] : colors;
      return `
        <g>
          <rect x="${x}%" y="${y}" width="${w * 0.8}%" height="${h}" rx="3" fill="${color}" opacity="0.9"/>
          ${v > 0 ? `<text x="${x + w*0.4}%" y="${y - 3}" text-anchor="middle" font-size="9" fill="var(--text-2)">${v}</text>` : ''}
          <text x="${x + w*0.4}%" y="${height - 4}" text-anchor="middle" font-size="9" fill="var(--text-3)">${labels[i]}</text>
        </g>`;
    }).join('');
    return `<svg width="100%" height="${height}" style="overflow:visible">${bars}</svg>`;
  }

  function lineChart(datasets, labels, height) {
    // datasets: [{values, color, label}]
    const allVals = datasets.flatMap(d => d.values);
    const max = Math.max(...allVals, 1);
    const n = labels.length;
    const pts = (vals) => vals.map((v, i) => {
      const x = n === 1 ? 50 : (i / (n - 1)) * 100;
      const y = height - 20 - (v / max) * (height - 30);
      return `${x},${y}`;
    });

    const lines = datasets.map(d => {
      const p = pts(d.values);
      const polyline = `<polyline points="${p.join(' ')}" fill="none" stroke="${d.color}" stroke-width="2" stroke-linejoin="round"/>`;
      const dots = d.values.map((v, i) => {
        const [x, y] = p[i].split(',');
        return `<circle cx="${x}" cy="${y}" r="3" fill="${d.color}"/>
                <text x="${x}" y="${parseFloat(y)-6}" text-anchor="middle" font-size="9" fill="${d.color}">${v || ''}</text>`;
      }).join('');
      return polyline + dots;
    }).join('');

    const xLabels = labels.map((l, i) => {
      const x = n === 1 ? 50 : (i / (n - 1)) * 100;
      return `<text x="${x}%" y="${height - 4}" text-anchor="middle" font-size="9" fill="var(--text-3)">${l}</text>`;
    }).join('');

    return `<svg width="100%" height="${height}" style="overflow:visible;padding:0 2%">
      ${lines}${xLabels}
    </svg>`;
  }

  function hBar(pct, color, bg) {
    return `<div style="height:7px;border-radius:4px;background:${bg || 'var(--surface-3)'};overflow:hidden;flex:1">
      <div style="height:100%;width:${Math.min(100,pct)}%;background:${color};border-radius:4px;transition:width .4s"></div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════
     RENDER DASHBOARD
  ══════════════════════════════════════════════════════════ */
  function renderDashboard(data) {
    const { overdueRows, completionRows, loadByMonth, months, deliveries, td } = data;
    const totalOverdue = overdueRows.reduce((s, r) => s + r.tasks.length, 0);

    /* ── Block 1: Tareas vencidas ── */
    const overdueRowsHtml = overdueRows.slice(0, 10).map(r => {
      const pct = Math.min(100, r.tasks.length * 8);
      const initials = r.member.name.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase();
      return `
        <div class="db-resource-row" data-memberid="${r.member.id}">
          <div class="db-avatar" style="background:${r.member.color||'#FB7520'}">${initials}</div>
          <div class="db-resource-name">${r.member.name}</div>
          <div class="db-resource-bar">
            ${hBar(pct, 'var(--danger)', 'var(--danger-bg)')}
          </div>
          <div class="db-resource-count danger">${r.tasks.length}</div>
        </div>`;
    }).join('') || '<div class="db-empty">✓ Sin tareas vencidas</div>';

    /* ── Block 2: Completadas vs Total ── */
    const maxTotal = Math.max(...completionRows.map(r => r.total), 1);
    const completionHtml = completionRows.slice(0, 10).map(r => {
      const pct = r.total > 0 ? Math.round(r.completed / r.total * 100) : 0;
      const initials = r.member.name.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase();
      return `
        <div class="db-resource-row">
          <div class="db-avatar" style="background:${r.member.color||'#3366FF'}">${initials}</div>
          <div class="db-resource-name">${r.member.name}</div>
          <div class="db-resource-bar" style="gap:4px">
            <div style="height:7px;border-radius:4px;background:var(--surface-3);overflow:hidden;flex:1;position:relative">
              <div style="position:absolute;left:0;top:0;bottom:0;width:${Math.min(100,r.total/maxTotal*100)}%;background:var(--info-bg);border-radius:4px"></div>
              <div style="position:absolute;left:0;top:0;bottom:0;width:${Math.min(100,r.completed/maxTotal*100)}%;background:var(--success);border-radius:4px"></div>
            </div>
          </div>
          <div class="db-resource-count" style="color:var(--success)">${r.completed}</div>
          <div class="db-resource-count" style="color:var(--text-3);font-size:9px">/${r.total}</div>
          <div class="db-resource-count" style="color:var(--text-2);min-width:30px">${pct}%</div>
        </div>`;
    }).join('') || '<div class="db-empty">Sin datos de tareas</div>';

    /* ── Block 3: Curva de carga ── */
    const pendingVals = months.map(m => loadByMonth[m]?.pending || 0);
    const completedVals = months.map(m => loadByMonth[m]?.completed || 0);
    const mLabels = months.map(m => monthLabel(m));
    const loadChart = lineChart(
      [{ values: pendingVals, color: '#FB7520', label: 'Pendientes' },
       { values: completedVals, color: '#33CC99', label: 'Completadas' }],
      mLabels, 120
    );
    const chartLegend = `
      <div style="display:flex;gap:14px;font-size:10px;color:var(--text-2);margin-bottom:4px">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#FB7520;margin-right:4px;vertical-align:middle"></span>Pendientes</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#33CC99;margin-right:4px;vertical-align:middle"></span>Completadas</span>
      </div>`;

    /* ── Block 4: Entregas del año ── */
    const deliveriesHtml = deliveries.length === 0
      ? '<div class="db-empty">Sin entregas programadas para este año</div>'
      : deliveries.map(p => {
          const daysLeft = Math.round((new Date(p.end_date) - new Date(td)) / 86400000);
          const urgent = daysLeft <= 30;
          const soon = daysLeft <= 90;
          const statusColor = urgent ? 'var(--danger)' : soon ? 'var(--brand-orange)' : 'var(--success)';
          const dotColor = p.color || 'var(--brand-orange)';

          // Try to get image from external_links
          let imgUrl = '';
          try {
            const links = Array.isArray(p.external_links) ? p.external_links : JSON.parse(p.external_links || '[]');
            const imgLink = links.find(l => l.url && /\.(jpe?g|png|webp|gif|svg)(\?.*)?$/i.test(l.url));
            if (imgLink) imgUrl = imgLink.url;
          } catch(e) {}

          return `
            <div class="db-delivery-card">
              ${imgUrl ? `<div class="db-delivery-img" style="background-image:url('${imgUrl}')"></div>` : `<div class="db-delivery-img db-delivery-img-placeholder" style="background:${dotColor}20"><span style="font-size:22px">🏗️</span></div>`}
              <div class="db-delivery-info">
                <div class="db-delivery-name">${p.name}</div>
                <div class="db-delivery-meta">
                  ${p.provincia ? `<span class="db-delivery-badge" style="background:var(--surface-3)">📍 ${p.provincia}</span>` : ''}
                  <span class="db-delivery-badge" style="background:${statusColor}20;color:${statusColor}">
                    ${urgent ? '⚠️' : '📅'} ${fmtDate(p.end_date)}
                  </span>
                </div>
                <div class="db-delivery-days" style="color:${statusColor}">
                  ${daysLeft <= 0 ? 'VENCIDO' : daysLeft === 1 ? '1 día restante' : `${daysLeft} días restantes`}
                </div>
              </div>
            </div>`;
        }).join('');

    /* ── KPI Row ── */
    const thisMonthLoad = pendingVals[0] || 0;
    const nextMonthLoad = pendingVals[1] || 0;
    const totalCompleted = completionRows.reduce((s,r) => s+r.completed, 0);
    const totalTasks = completionRows.reduce((s,r) => s+r.total, 0);
    const globalPct = totalTasks > 0 ? Math.round(totalCompleted/totalTasks*100) : 0;

    return `
      <div id="p360-dashboard" class="p360-dashboard">
        <div class="p360-db-header">
          <div>
            <div class="p360-db-title">📊 Panel de Gestión</div>
            <div class="p360-db-subtitle">Vista consolidada · Solo visible para administradores y editores</div>
          </div>
          <button class="p360-db-collapse-btn" onclick="(function(b){
            const body = document.getElementById('p360-db-body');
            const collapsed = body.style.display==='none';
            body.style.display = collapsed ? '' : 'none';
            b.textContent = collapsed ? '▲ Colapsar' : '▼ Expandir';
          })(this)">▲ Colapsar</button>
        </div>

        <div id="p360-db-body">
          <!-- KPI strip -->
          <div class="p360-db-kpis">
            <div class="p360-db-kpi" data-c="danger">
              <div class="p360-db-kpi-n">${totalOverdue}</div>
              <div class="p360-db-kpi-l">Tareas vencidas</div>
            </div>
            <div class="p360-db-kpi" data-c="orange">
              <div class="p360-db-kpi-n">${thisMonthLoad}</div>
              <div class="p360-db-kpi-l">Vencen este mes</div>
            </div>
            <div class="p360-db-kpi" data-c="info">
              <div class="p360-db-kpi-n">${nextMonthLoad}</div>
              <div class="p360-db-kpi-l">Vencen próximo mes</div>
            </div>
            <div class="p360-db-kpi" data-c="success">
              <div class="p360-db-kpi-n">${globalPct}%</div>
              <div class="p360-db-kpi-l">Completado global</div>
            </div>
            <div class="p360-db-kpi" data-c="neutral">
              <div class="p360-db-kpi-n">${deliveries.length}</div>
              <div class="p360-db-kpi-l">Entregas este año</div>
            </div>
          </div>

          <!-- Grid 2x2 -->
          <div class="p360-db-grid">

            <!-- Vencidas por recurso -->
            <div class="p360-db-card">
              <div class="p360-db-card-header">
                <span class="p360-db-card-title">⚠️ Tareas Vencidas por Recurso</span>
                <span class="p360-db-card-badge danger">${totalOverdue} tareas</span>
              </div>
              <div class="p360-db-scroll">
                ${overdueRowsHtml}
              </div>
            </div>

            <!-- Completadas vs Total -->
            <div class="p360-db-card">
              <div class="p360-db-card-header">
                <span class="p360-db-card-title">✅ Completadas vs Total por Recurso</span>
                <div style="display:flex;gap:10px;font-size:10px;color:var(--text-3)">
                  <span style="color:var(--success)">■ Completadas</span>
                  <span style="color:var(--info)">■ Total</span>
                </div>
              </div>
              <div class="p360-db-scroll">
                ${completionHtml}
              </div>
            </div>

            <!-- Curva de carga -->
            <div class="p360-db-card">
              <div class="p360-db-card-header">
                <span class="p360-db-card-title">📈 Curva de Carga — Próximos 10 meses</span>
              </div>
              ${chartLegend}
              <div style="padding:4px 0 0">
                ${loadChart}
              </div>
            </div>

            <!-- Entregas del año -->
            <div class="p360-db-card">
              <div class="p360-db-card-header">
                <span class="p360-db-card-title">🏗️ Entregas ${td.slice(0,4)}</span>
                <span class="p360-db-card-badge" style="background:var(--info-bg);color:var(--info)">${deliveries.length} proyectos</span>
              </div>
              <div class="p360-db-scroll db-deliveries-scroll">
                ${deliveriesHtml}
              </div>
            </div>

          </div>
        </div>
      </div>`;
  }

  /* ── CSS ── */
  function injectCSS() {
    if (document.getElementById('p360-dashboard-css')) return;
    const style = document.createElement('style');
    style.id = 'p360-dashboard-css';
    style.textContent = `
      /* ── Dashboard wrapper ── */
      .p360-dashboard {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 10px;
        margin: 0 0 24px;
        overflow: hidden;
        box-shadow: var(--shadow);
      }
      .p360-db-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 18px;
        background: var(--brand-dark);
        color: #fff;
      }
      .p360-db-title {
        font-family: Gilroy, sans-serif;
        font-size: 14px;
        font-weight: 800;
        letter-spacing: -.01em;
        color: #fff;
      }
      .p360-db-subtitle {
        font-size: 10px;
        opacity: .6;
        margin-top: 1px;
      }
      .p360-db-collapse-btn {
        background: rgba(255,255,255,.12);
        border: 1px solid rgba(255,255,255,.2);
        color: #fff;
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 11px;
        cursor: pointer;
        transition: background .15s;
      }
      .p360-db-collapse-btn:hover { background: rgba(255,255,255,.22); }

      /* ── KPI strip ── */
      .p360-db-kpis {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        border-bottom: 1px solid var(--border);
      }
      .p360-db-kpi {
        padding: 12px 14px;
        border-right: 1px solid var(--border);
        position: relative;
      }
      .p360-db-kpi:last-child { border-right: none; }
      .p360-db-kpi::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 3px;
      }
      .p360-db-kpi[data-c=danger]::before  { background: var(--danger); }
      .p360-db-kpi[data-c=orange]::before  { background: var(--brand-orange); }
      .p360-db-kpi[data-c=info]::before    { background: var(--info); }
      .p360-db-kpi[data-c=success]::before { background: var(--success); }
      .p360-db-kpi[data-c=neutral]::before { background: var(--neutral); }
      .p360-db-kpi-n {
        font-family: Gilroy, sans-serif;
        font-size: 26px;
        font-weight: 800;
        line-height: 1;
        color: var(--brand-dark);
      }
      .p360-db-kpi[data-c=danger]  .p360-db-kpi-n { color: var(--danger); }
      .p360-db-kpi[data-c=orange]  .p360-db-kpi-n { color: var(--brand-orange); }
      .p360-db-kpi[data-c=info]    .p360-db-kpi-n { color: var(--info); }
      .p360-db-kpi[data-c=success] .p360-db-kpi-n { color: var(--success); }
      .p360-db-kpi-l {
        font-size: 10px;
        color: var(--text-3);
        margin-top: 2px;
        text-transform: uppercase;
        letter-spacing: .04em;
        font-weight: 600;
      }

      /* ── Grid 2x2 ── */
      .p360-db-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1px;
        background: var(--border);
      }
      @media (max-width: 900px) { .p360-db-grid { grid-template-columns: 1fr; } }

      .p360-db-card {
        background: var(--surface);
        padding: 14px 16px;
      }
      .p360-db-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .p360-db-card-title {
        font-family: Gilroy, sans-serif;
        font-size: 12px;
        font-weight: 700;
        color: var(--brand-dark);
        letter-spacing: -.01em;
      }
      .p360-db-card-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 10px;
        background: var(--surface-3);
        color: var(--text-2);
      }
      .p360-db-card-badge.danger {
        background: var(--danger-bg);
        color: var(--danger);
      }
      .p360-db-scroll {
        max-height: 200px;
        overflow-y: auto;
      }
      .db-deliveries-scroll {
        max-height: 220px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      /* ── Resource rows ── */
      .db-resource-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 0;
        border-bottom: 1px solid var(--border);
      }
      .db-resource-row:last-child { border-bottom: none; }
      .db-avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        font-family: Gilroy, sans-serif;
        font-size: 9px;
        font-weight: 700;
        color: #fff;
        flex-shrink: 0;
      }
      .db-resource-name {
        font-size: 11px;
        font-weight: 600;
        color: var(--text);
        min-width: 100px;
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .db-resource-bar {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .db-resource-count {
        font-family: Gilroy, sans-serif;
        font-size: 13px;
        font-weight: 700;
        min-width: 24px;
        text-align: right;
        flex-shrink: 0;
      }
      .db-resource-count.danger { color: var(--danger); }
      .db-empty {
        padding: 20px;
        text-align: center;
        font-size: 12px;
        color: var(--text-3);
      }

      /* ── Delivery cards ── */
      .db-delivery-card {
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 8px;
        border: 1px solid var(--border);
        border-radius: 7px;
        background: var(--surface-2);
        cursor: default;
        transition: box-shadow .12s;
        flex-shrink: 0;
      }
      .db-delivery-card:hover {
        box-shadow: var(--shadow);
        background: var(--surface);
      }
      .db-delivery-img {
        width: 52px;
        height: 48px;
        border-radius: 5px;
        background-size: cover;
        background-position: center;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .db-delivery-img-placeholder { opacity: .7; }
      .db-delivery-info { flex: 1; min-width: 0; }
      .db-delivery-name {
        font-size: 12px;
        font-weight: 700;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 3px;
      }
      .db-delivery-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 3px; }
      .db-delivery-badge {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 4px;
        font-weight: 600;
      }
      .db-delivery-days {
        font-family: Gilroy, sans-serif;
        font-size: 11px;
        font-weight: 700;
      }
    `;
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════
     INJECTION LOGIC
  ══════════════════════════════════════════════════════════ */
  let injected = false;

  async function tryInject() {
    if (injected) return;

    // Only show for admin/editor — check React store
    const root = document.getElementById('root');
    if (!root) return;

    // Check role from store
    let canShow = false;
    const fkey = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (fkey) {
      let f = root[fkey];
      let depth = 0;
      while (f && depth < 60) {
        depth++;
        const s = f.memoizedState;
        if (s && s.memoizedState && (s.memoizedState.canAdmin === true || s.memoizedState.canEdit === true)) {
          canShow = true;
          break;
        }
        f = f.child || f.sibling || (f.return && f.return.sibling);
      }
    }

    if (!canShow) return;

    // Check we're on home page
    const homePage = document.querySelector('.home-page');
    if (!homePage) return;

    // Check if already injected
    if (document.getElementById('p360-dashboard')) return;

    // Bridge supabase
    bridgeSupabase();
    if (!window._p360sb) return;

    injected = true;
    injectCSS();

    // Insert loading placeholder
    const placeholder = document.createElement('div');
    placeholder.id = 'p360-dashboard';
    placeholder.className = 'p360-dashboard';
    placeholder.innerHTML = `
      <div class="p360-db-header">
        <div>
          <div class="p360-db-title">📊 Panel de Gestión</div>
          <div class="p360-db-subtitle">Cargando datos…</div>
        </div>
      </div>
      <div style="padding:32px;text-align:center;color:var(--text-3);font-size:13px">
        ⏳ Cargando panel de gestión…
      </div>`;

    // Insert before the home-grid
    const homeGrid = homePage.querySelector('.home-grid');
    if (homeGrid) {
      homePage.insertBefore(placeholder, homeGrid);
    } else {
      homePage.insertBefore(placeholder, homePage.firstChild.nextSibling);
    }

    try {
      const data = await loadDashboardData();
      placeholder.outerHTML = renderDashboard(data);
    } catch (err) {
      document.getElementById('p360-dashboard').innerHTML = `
        <div class="p360-db-header">
          <div class="p360-db-title">📊 Panel de Gestión</div>
        </div>
        <div style="padding:24px;color:var(--danger);font-size:12px">
          Error al cargar el panel: ${err.message}
        </div>`;
      injected = false;
    }
  }

  /* ── Watch for home page ── */
  function watchHomePage() {
    const obs = new MutationObserver(() => {
      const home = document.querySelector('.home-page');
      if (home && !document.getElementById('p360-dashboard')) {
        injected = false;
        setTimeout(tryInject, 600);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    watchHomePage();
    setTimeout(tryInject, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
