/**
 * Buildplan 360 — Patch Suite v1
 *
 * Consolida todos los patches en un único archivo.
 * Usa el mismo patrón de acceso al store que tools-v511809.js (que funciona).
 *
 * Features:
 *  1. Logo duplicado: ocultar sidebar-logo-sub
 *  2. Bombita 💡: solo para admins
 *  3. Vincular N tareas en cadena (no solo 2)
 *  4. Drag-handle para ajustar altura del Gantt
 *  5. Fila rápida tipo Excel para crear tareas
 *  6. Inline edit: guardar al hacer clic fuera (blur)
 *  7. Scroll horizontal en el panel izquierdo del Gantt
 *  8. Exportar PDF con diálogo completo
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════
     STORE ACCESS — mismo patrón que tools-v511809.js
  ═══════════════════════════════════════════════════════ */
  function walkStore(predicate) {
    const root = document.getElementById('root');
    if (!root) return null;
    const fk = Object.keys(root).find(k =>
      k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fk) return null;
    let f = root[fk];
    for (let i = 0; i < 300 && f; i++) {
      const s = f.memoizedState;
      if (s && s.memoizedState && predicate(s.memoizedState)) return s.memoizedState;
      f = f.child || f.sibling || (f.return && f.return.sibling);
    }
    return null;
  }

  function getStore() {
    return walkStore(s =>
      s && typeof s.saveTask === 'function' && typeof s.linkTasks === 'function');
  }

  function getCurrentProject() {
    const s = walkStore(s => s && s.currentProject && s.currentProject.id);
    return s ? s.currentProject : null;
  }

  /* ═══════════════════════════════════════════════════════
     TOAST
  ═══════════════════════════════════════════════════════ */
  function toast(msg, type) {
    const el = document.createElement('div');
    const bg = type==='error' ? '#dc2626' : type==='warning' ? '#f59e0b' : '#10b981';
    el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:99999;
      padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;
      color:#fff;background:${bg};box-shadow:0 4px 20px rgba(0,0,0,.25);pointer-events:none`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 350);
    }, 2500);
  }

  /* ═══════════════════════════════════════════════════════
     1. LOGO DUPLICADO
  ═══════════════════════════════════════════════════════ */
  const css = document.createElement('style');
  css.id = 'p360-suite-css';
  css.textContent = `
    .sidebar-logo-sub { display: none !important; }
    .p360-bombita { display: none !important; }
    body.p360-admin .p360-bombita { display: inline-flex !important; }
    .p360-h-handle { transition: background .15s; }
    .p360-h-handle:hover { background: var(--brand-orange,#FB7520) !important; }
    /* Scroll horizontal en la grilla izquierda */
    .left-pane { overflow-x: auto !important; min-width: 0 !important; }
    .left-body { overflow-x: auto !important; }
    /* Fila rápida */
    #p360-qa-row {
      display: grid;
      grid-template-columns: var(--col-tpl);
      align-items: center;
      min-height: 30px;
      border-top: 2px dashed var(--border,#e2e8f0);
      background: var(--surface,#fff);
      position: sticky; bottom: 0; z-index: 5;
    }
    #p360-qa-row:hover { background: var(--surface-2,#f8f9fa); }
    .p360-qa-num { display:flex;align-items:center;justify-content:center;
      color:var(--text-3,#aaa);font-size:10px;padding:0 4px; }
    .p360-qa-cell { display:flex;align-items:center;padding:0 6px;overflow:hidden; }
    .p360-qa-input { width:100%;border:none;background:transparent;font-size:12px;
      color:var(--text,#1a1a2e);outline:none;padding:2px 0;font-family:inherit; }
    .p360-qa-input::placeholder { color:var(--text-3,#aaa);font-style:italic; }
    .p360-qa-input:focus { border-bottom:1.5px solid var(--brand-orange,#FB7520); }
    .p360-qa-busy { opacity:.5;pointer-events:none; }
    /* Escala de tiempo — barras editables */
    .timeline-bar { cursor: grab !important; }
    .timeline-bar:active { cursor: grabbing !important; }
  `;
  document.head.appendChild(css);

  /* ═══════════════════════════════════════════════════════
     2. BOMBITA — solo admins
  ═══════════════════════════════════════════════════════ */
  function updateAdminClass() {
    const store = getStore();
    if (!store) return;
    document.body.classList.toggle('p360-admin', !!store.canAdmin);
    if (!store.canAdmin) {
      document.querySelectorAll('button').forEach(b => {
        if (b.innerHTML.includes('💡') && !b._p360bom) {
          b._p360bom = true;
          b.style.display = 'none';
        }
      });
    }
  }

  /* ═══════════════════════════════════════════════════════
     3. VINCULAR N TAREAS EN CADENA
  ═══════════════════════════════════════════════════════ */
  function patchVincularBtn() {
    const btn = document.querySelector('button[title="Vincular 2 tareas seleccionadas"]');
    if (!btn || btn._p360v) return;
    btn._p360v = true;

    const nb = btn.cloneNode(true);
    btn.parentNode.replaceChild(nb, btn);
    nb._p360v = true;
    nb.title = 'Vincular tareas seleccionadas (2 o más, en cadena FC)';

    nb.addEventListener('click', async () => {
      const store = getStore();
      if (!store) { toast('No se pudo acceder al store', 'error'); return; }

      const rows = Array.from(document.querySelectorAll('.left-body .task-row'));
      const selIds = rows
        .filter(r => { const cb = r.querySelector('input[type="checkbox"]'); return cb?.checked; })
        .map(r => { const c = r.querySelector('[data-taskid]'); return c?.dataset?.taskid; })
        .filter(Boolean);

      if (selIds.length < 2) {
        toast('Seleccioná al menos 2 tareas para vincular', 'warning');
        return;
      }

      let ok = 0;
      for (let i = 0; i < selIds.length - 1; i++) {
        try { await store.linkTasks(selIds[i], selIds[i + 1]); ok++; }
        catch (e) { console.warn('link:', e); }
      }
      toast(`✓ ${ok} vínculo(s) FC creado(s)`, 'success');
    });
  }

  /* ═══════════════════════════════════════════════════════
     4. DRAG-HANDLE ALTURA GANTT
  ═══════════════════════════════════════════════════════ */
  function injectHeightHandle() {
    const gs = document.querySelector('.gantt-split');
    if (!gs || gs.querySelector('.p360-h-handle')) return;

    const h = document.createElement('div');
    h.className = 'p360-h-handle';
    h.title = 'Arrastrá para ajustar la altura';
    h.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:6px;' +
      'background:var(--border,#e2e8f0);cursor:ns-resize;z-index:10;' +
      'display:flex;align-items:center;justify-content:center';
    h.innerHTML = '<span style="color:#bbb;font-size:12px;pointer-events:none">⋯</span>';
    gs.style.position = 'relative';
    gs.appendChild(h);

    h.addEventListener('mousedown', e => {
      e.preventDefault();
      const sy = e.clientY, sh = gs.offsetHeight;
      const mv = ev => {
        const nh = Math.max(200, Math.min(window.innerHeight - 100, sh + ev.clientY - sy));
        gs.style.height = nh + 'px'; gs.style.flex = 'none';
      };
      const up = () => {
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
  }

  /* ═══════════════════════════════════════════════════════
     5. FILA RÁPIDA TIPO EXCEL
  ═══════════════════════════════════════════════════════ */
  function injectQuickRow() {
    const lb = document.querySelector('.left-body');
    if (!lb || lb.querySelector('#p360-qa-row')) return;
    const store = getStore();
    if (!store?.canEdit) return;

    const split = document.querySelector('.gantt-split');
    const colTpl = split ? getComputedStyle(split).getPropertyValue('--col-tpl').trim() : '';
    const count = lb.querySelectorAll('.task-row').length;

    const row = document.createElement('div');
    row.id = 'p360-qa-row';
    if (colTpl) row.style.setProperty('--col-tpl', colTpl);

    const numCell = document.createElement('div');
    numCell.className = 'p360-qa-num';
    numCell.textContent = count + 1;

    const cell = document.createElement('div');
    cell.className = 'p360-qa-cell';
    cell.style.gridColumn = '2';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'p360-qa-input';
    input.placeholder = '+ Nueva tarea — escribí y presioná Enter';
    input.autocomplete = 'off';

    input.addEventListener('keydown', async e => {
      if (e.key === 'Escape') { input.value = ''; input.blur(); return; }
      if (e.key !== 'Enter' && e.key !== 'Tab') return;
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return;

      row.classList.add('p360-qa-busy');
      input.disabled = true;
      input.placeholder = 'Creando…';

      try {
        const st = getStore();
        if (!st) throw new Error('sin store');
        const today    = new Date().toISOString().slice(0, 10);
        const nextWeek = new Date(Date.now() + 7*86400000).toISOString().slice(0, 10);
        await st.saveTask({
          name, description: null, status: 'pending', priority: 'medium',
          start_date: today, end_date: nextWeek, is_milestone: false,
          assigned_to: null, parent_task_id: null, progress: 0,
          task_type_category: null, task_type: null, project_obra_type: null,
          proy_obra_adm: null, demanda_recursos: null,
          duration_mode: 'habiles', bar_color: '#1d4ed8', link_urls: null
        }, null, '', st.tasks || []);
        toast(`✓ "${name}" creada`, 'success');
        input.value = '';
      } catch(err) {
        toast('Error: ' + (err.message || err), 'error');
      } finally {
        input.disabled = false;
        input.placeholder = '+ Nueva tarea — escribí y presioná Enter';
        row.classList.remove('p360-qa-busy');
        setTimeout(() => {
          const qr = document.querySelector('.left-body #p360-qa-row');
          if (qr) {
            const nc = document.querySelectorAll('.left-body .task-row').length;
            qr.querySelector('.p360-qa-num').textContent = nc + 1;
            qr.querySelector('.p360-qa-input').focus();
          }
        }, 500);
      }
    });

    cell.appendChild(input);
    row.appendChild(numCell);
    row.appendChild(cell);
    lb.appendChild(row);
  }

  /* ═══════════════════════════════════════════════════════
     6. INLINE EDIT BLUR FIX
  ═══════════════════════════════════════════════════════ */
  document.addEventListener('mousedown', e => {
    document.querySelectorAll('.cell-ie input, .cell-ie select').forEach(inp => {
      if (inp !== e.target && !inp.contains(e.target)) {
        setTimeout(() => { try { inp.blur(); } catch(_) {} }, 30);
      }
    });
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.cell-ie input, .cell-ie select').forEach(inp => {
      try { inp.blur(); } catch(_) {}
    });
  }, true);

  /* ═══════════════════════════════════════════════════════
     7. EXPORTAR PDF — DIÁLOGO COMPLETO
  ═══════════════════════════════════════════════════════ */

  /* ─ utils ─ */
  function parseDate(s) {
    if (!s) return null;
    const [y,m,d] = s.split('-').map(Number);
    return new Date(Date.UTC(y,m-1,d));
  }
  function fmtDate(s) {
    if (!s) return '—';
    const [y,m,d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  function addDays(d,n) { return new Date(d.getTime()+n*86400000); }
  function diffDays(a,b) { return Math.round((b-a)/86400000); }
  function hexToRgb(h) {
    h=(h||'#1d4ed8').replace('#','');
    if(h.length===3) h=h.split('').map(c=>c+c).join('');
    const n=parseInt(h,16);
    return [(n>>16)&255,(n>>8)&255,n&255];
  }
  function lighten(rgb,p){ return rgb.map(c=>Math.round(c+(255-c)*p)); }
  function monthLabel(d){ return ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][d.getUTCMonth()]+' '+d.getUTCFullYear(); }
  function weekLabel(d){ return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}`; }
  function quarterLabel(d){ return `Q${Math.floor(d.getUTCMonth()/3)+1} ${d.getUTCFullYear()}`; }

  let _jspdfReady = false;
  async function ensureJsPDF() {
    if (_jspdfReady && window.jspdf) return;
    await new Promise((res,rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
    _jspdfReady = true;
  }

  function showPDFDialog() {
    // Obtener datos del proyecto del store
    const store = getStore();
    const proj  = store?.currentProject || getCurrentProject();

    if (!proj || !proj.id) {
      // Último intento: buscar en el header visible
      const headerTitle = document.querySelector('.ph-title')?.textContent?.trim();
      if (!headerTitle) { toast('Abrí un proyecto antes de exportar', 'warning'); return; }
    }

    const tasks   = store?.tasks || [];
    const members = store?.members || [];

    const pS = proj?.start_date || tasks[0]?.start_date || new Date().toISOString().slice(0,10);
    const pE = proj?.end_date   || tasks[tasks.length-1]?.end_date || new Date().toISOString().slice(0,10);
    const y  = new Date().getUTCFullYear();
    const q  = Math.floor(new Date().getUTCMonth()/3);
    const qEnd = new Date(Date.UTC(y,q*3+3,0)).toISOString().slice(0,10);

    document.getElementById('p360-pdf-ov')?.remove();

    const ov = document.createElement('div');
    ov.id = 'p360-pdf-ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;' +
      'display:flex;align-items:center;justify-content:center;font-family:inherit';

    ov.innerHTML = `
<div style="background:var(--surface,#fff);border-radius:12px;padding:26px 30px;
  width:500px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,.3);
  color:var(--text,#1a1a2e);max-height:90vh;overflow-y:auto">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <h2 style="margin:0;font-size:17px;font-weight:700">📄 Exportar Cronograma PDF</h2>
    <button id="px" style="border:none;background:none;font-size:22px;cursor:pointer;color:#999;line-height:1">×</button>
  </div>
  <div class="ph" style="margin-bottom:4px">Contenido</div>
  <label class="pc"><input type="checkbox" id="pc" checked> Portada con datos del proyecto</label>
  <label class="pc"><input type="checkbox" id="pt" checked> Tabla de tareas</label>
  <label class="pc"><input type="checkbox" id="pg" checked> Diagrama de Gantt</label>
  <hr class="phr">
  <div class="ph">Gantt</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
    <label class="pl">Escala<select id="ps" class="psel">
      <option value="week">Semana</option><option value="month" selected>Mes</option>
      <option value="quarter">Trimestre</option><option value="year">Año</option>
    </select></label>
    <label class="pl">Orientación<select id="po" class="psel">
      <option value="landscape" selected>Horizontal (A3)</option>
      <option value="portrait">Vertical (A3)</option>
    </select></label>
  </div>
  <div class="ph">Rango de fechas</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
    <label class="pl">Desde<input type="date" id="pdf" value="${pS}" class="pin"></label>
    <label class="pl">Hasta<input type="date" id="pdt" value="${pE}" class="pin"></label>
  </div>
  <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px">
    <button class="prb" data-f="${pS}" data-t="${pE}">Todo el proyecto</button>
    <button class="prb" data-f="${y}-01-01" data-t="${y}-12-31">Año ${y}</button>
    <button class="prb" data-f="${y}-${String(q*3+1).padStart(2,'0')}-01" data-t="${qEnd}">Trimestre actual</button>
  </div>
  <hr class="phr">
  <div class="ph">Filtros</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
    <label class="pl">Estado<select id="pfs" class="psel">
      <option value="">Todos</option><option value="pending">Pendientes</option>
      <option value="in_progress">En progreso</option>
      <option value="completed">Completadas</option><option value="blocked">Bloqueadas</option>
    </select></label>
    <label class="pl">En rango<select id="pfr" class="psel">
      <option value="all">Todas</option>
      <option value="overlap">Que se superponen</option>
      <option value="start">Que empiezan en rango</option>
    </select></label>
  </div>
  <label class="pc" style="margin-bottom:12px"><input type="checkbox" id="phs"> Ocultar tareas resumen</label>
  <hr class="phr">
  <div class="ph">Info adicional</div>
  <input id="pti" type="text" class="pin" style="width:100%;margin-bottom:7px" placeholder="Título del informe">
  <input id="pau" type="text" class="pin" style="width:100%;margin-bottom:18px" placeholder="Preparado por">
  <div style="display:flex;gap:10px;justify-content:flex-end">
    <button id="pcc" style="padding:8px 18px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;background:var(--surface);color:var(--text)">Cancelar</button>
    <button id="pgg" style="padding:8px 20px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;background:#FB7520;color:#fff">📄 Generar PDF</button>
  </div>
</div>
<style>
.ph{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3,#999);margin-bottom:7px}
.phr{border:none;border-top:1px solid var(--border,#e5e7eb);margin:12px 0}
.pc{display:flex;align-items:center;gap:9px;font-size:13px;cursor:pointer;margin-bottom:6px}
.pc input{accent-color:#FB7520;width:14px;height:14px;flex-shrink:0}
.pl{font-size:11px;color:var(--text-2,#555);display:flex;flex-direction:column;gap:4px}
.psel{padding:6px 9px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:12px;background:var(--surface,#fff);color:var(--text,#1a1a2e);width:100%}
.pin{padding:6px 9px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:12px;background:var(--surface,#fff);color:var(--text,#1a1a2e);box-sizing:border-box;display:block;margin-top:2px}
.prb{font-size:11px;padding:3px 10px;border:1px solid var(--border,#ddd);border-radius:4px;cursor:pointer;background:var(--surface);color:var(--text)}
.prb:hover{background:var(--surface-2,#f0f0f5)}
</style>`;

    document.body.appendChild(ov);

    const $ = id => document.getElementById(id);
    const close = () => ov.remove();
    $('px').onclick = close; $('pcc').onclick = close;
    ov.addEventListener('click', e => { if(e.target===ov) close(); });
    ov.querySelectorAll('.prb').forEach(b => b.addEventListener('click', () => {
      $('pdf').value = b.dataset.f; $('pdt').value = b.dataset.t;
    }));

    $('pgg').addEventListener('click', async () => {
      const opts = {
        cover:  $('pc').checked, table: $('pt').checked, gantt: $('pg').checked,
        scale:  $('ps').value,   orient: $('po').value,
        dateFrom: $('pdf').value, dateTo: $('pdt').value,
        filterStatus: $('pfs').value, filterRange: $('pfr').value,
        hideSummary: $('phs').checked,
        extraTitle: $('pti').value.trim(), extraAuthor: $('pau').value.trim(),
      };
      if (!opts.cover && !opts.table && !opts.gantt) { alert('Elegí al menos una sección.'); return; }
      const btn = $('pgg');
      btn.disabled = true; btn.textContent = '⏳ Generando…';
      try {
        const mMap = {};
        (members||[]).forEach(m => { mMap[m.id]=m; });
        await generatePDF(proj, tasks, mMap, opts);
        close();
      } catch(err) {
        console.error(err);
        alert('Error al generar PDF: '+(err.message||err));
        btn.disabled=false; btn.innerHTML='📄 Generar PDF';
      }
    });
  }

  /* ─ PDF generation ─ */
  async function generatePDF(proj, tasks, mMap, opts) {
    await ensureJsPDF();
    const { jsPDF } = window.jspdf;
    const W = opts.orient==='landscape' ? 420 : 297;
    const H = opts.orient==='landscape' ? 297 : 420;
    const pdf = new jsPDF({ orientation:opts.orient, unit:'mm', format:'a3' });
    const today = new Date().toLocaleDateString('es-AR');
    const title = opts.extraTitle || proj?.name || 'Cronograma';

    let list = (tasks||[]).map(t=>({...t,_m:t.assigned_to?mMap[t.assigned_to]:null}));
    if (opts.filterStatus) list=list.filter(t=>t.status===opts.filterStatus);
    if (opts.hideSummary)  list=list.filter(t=>!t._isSummary&&!t.hasChildren);
    if (opts.filterRange==='overlap')
      list=list.filter(t=>t.start_date<=opts.dateTo&&t.end_date>=opts.dateFrom);
    else if (opts.filterRange==='start')
      list=list.filter(t=>t.start_date>=opts.dateFrom&&t.start_date<=opts.dateTo);

    if (opts.cover) { drawCover(pdf,proj,title,opts,today,W,H); if(opts.table||opts.gantt) pdf.addPage(); }
    if (opts.table) { drawTable(pdf,list,title,opts,today,W,H);  if(opts.gantt) pdf.addPage(); }
    if (opts.gantt)   drawGantt(pdf,list,title,opts,today,W,H);

    pdf.save('cronograma_'+(proj?.name||'proyecto').replace(/\W+/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.pdf');
  }

  function drawCover(pdf,proj,title,opts,today,W,H) {
    const OR=[251,117,32],DK=[28,28,61];
    pdf.setFillColor(...OR); pdf.rect(0,0,W,40,'F');
    pdf.setFont('helvetica','bold'); pdf.setFontSize(22); pdf.setTextColor(255,255,255);
    pdf.text('Buildplan 360',16,26);
    pdf.setFillColor(...DK); pdf.rect(0,40,W,4,'F');
    pdf.setFont('helvetica','bold'); pdf.setFontSize(28); pdf.setTextColor(...DK);
    pdf.text(pdf.splitTextToSize(title,W-40),20,76);
    const iY=H/2;
    pdf.setFillColor(248,248,252); pdf.roundedRect(20,iY-10,W-40,80,6,6,'F');
    const stL={planning:'Planificación',active:'En curso',on_hold:'En pausa',completed:'Completado',cancelled:'Cancelado'};
    const items=[
      ['Período',`${fmtDate(opts.dateFrom)} — ${fmtDate(opts.dateTo)}`],
      ['Escala',{week:'Semanal',month:'Mensual',quarter:'Trimestral',year:'Anual'}[opts.scale]],
      ['Estado',stL[proj?.status]||proj?.status||'—'],
      ['Provincia',proj?.provincia||'—'],
      ['Ciclo',proj?.ciclo_vida||'—'],
      ['Preparado por',opts.extraAuthor||'—'],
      ['Emisión',today],
    ];
    items.forEach(([l,v],i)=>{
      const ix=30+(i%2)*((W-40)/2), iy=iY+Math.floor(i/2)*18+6;
      pdf.setFont('helvetica','bold'); pdf.setFontSize(7); pdf.setTextColor(150,150,170);
      pdf.text(l.toUpperCase(),ix,iy);
      pdf.setFont('helvetica','normal'); pdf.setFontSize(10); pdf.setTextColor(...DK);
      pdf.text(String(v||'—'),ix,iy+6);
    });
    pdf.setFont('helvetica','normal'); pdf.setFontSize(7); pdf.setTextColor(180,180,190);
    pdf.text('Buildplan 360  ·  '+today,W/2,H-8,{align:'center'});
  }

  function drawTable(pdf,tasks,title,opts,today,W,H) {
    const OR=[251,117,32],DK=[28,28,61],MG=14,RH=7,HH=9;
    const cols=[{l:'#',w:10,a:'c'},{l:'Nombre',w:70,a:'l'},{l:'Inicio',w:22,a:'c'},
      {l:'Fin',w:22,a:'c'},{l:'Dur',w:14,a:'c'},{l:'Responsable',w:36,a:'l'},
      {l:'Estado',w:24,a:'c'},{l:'%',w:12,a:'c'}];
    const av=W-MG*2, sc=av/cols.reduce((s,c)=>s+c.w,0);
    cols.forEach(c=>c.w*=sc);
    const sL={pending:'Pendiente',in_progress:'En progreso',completed:'Completada',blocked:'Bloqueada'};
    const sC={pending:[200,200,210],in_progress:[51,102,255],completed:[51,204,153],blocked:[255,51,102]};

    function hdr(y){
      pdf.setFillColor(...OR); pdf.rect(0,0,W,12,'F');
      pdf.setFont('helvetica','bold'); pdf.setFontSize(9); pdf.setTextColor(255,255,255);
      pdf.text(title+'  ·  Tabla de tareas',MG,8); pdf.setFontSize(7); pdf.text(today,W-MG,8,{align:'right'});
      pdf.setFillColor(...DK); pdf.rect(MG,y,av,HH,'F');
      pdf.setFont('helvetica','bold'); pdf.setFontSize(7); pdf.setTextColor(255,255,255);
      let x=MG; cols.forEach(c=>{
        pdf.text(c.l,x+(c.a==='c'?c.w/2:2),y+HH-2.5,{align:c.a==='c'?'center':'left'}); x+=c.w;
      }); return y+HH;
    }
    let y=hdr(16),rn=0;
    tasks.forEach((t,i)=>{
      if(y+RH>H-14){pdf.addPage();y=hdr(16);}
      if(i%2===0){pdf.setFillColor(249,249,252);pdf.rect(MG,y,av,RH,'F');}
      if(t._isSummary||t.hasChildren){pdf.setFillColor(240,240,248);pdf.rect(MG,y,av,RH,'F');}
      rn++;
      const dur=t.start_date&&t.end_date?Math.max(1,Math.round((parseDate(t.end_date)-parseDate(t.start_date))/86400000)):0;
      const cells=[rn,'  '.repeat(Math.min(t.depth||0,3))+(t._isSummary||t.hasChildren?'▸ ':'')+t.name,
        fmtDate(t.start_date),fmtDate(t.end_date),dur?(dur+(t.duration_mode==='corridos'?'dc':'dh')):'—',
        t._m?t._m.name.split(' ').slice(0,2).join(' '):'—',sL[t.status]||'—',(t.progress||0)+'%'];
      let x=MG;
      cells.forEach((v,ci)=>{
        const c=cols[ci];
        pdf.setFont('helvetica',(t._isSummary||t.hasChildren)?'bold':'normal'); pdf.setFontSize(6.5);
        if(ci===6){
          const sc=sC[t.status]||[200,200,200];
          pdf.setFillColor(...sc); pdf.roundedRect(x+1,y+1.2,c.w-2,RH-2.5,1.5,1.5,'F');
          pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold');
        } else if(ci===7){
          const p=parseInt(v)/100;
          pdf.setFillColor(225,225,235); pdf.rect(x+1,y+2.5,c.w-2,2.5,'F');
          if(p>0){pdf.setFillColor(51,204,153);pdf.rect(x+1,y+2.5,(c.w-2)*p,2.5,'F');}
          pdf.setTextColor(50,50,80); pdf.setFontSize(5.5);
        } else pdf.setTextColor(50,50,80);
        pdf.text(pdf.splitTextToSize(String(v),c.w-3)[0]||'',x+(c.a==='c'?c.w/2:2),y+RH-2,{align:c.a==='c'?'center':'left'});
        x+=c.w;
      });
      pdf.setDrawColor(225,225,235); pdf.setLineWidth(0.2); pdf.line(MG,y+RH,MG+av,y+RH);
      y+=RH;
    });
  }

  function drawGantt(pdf,tasks,title,opts,today,W,H) {
    const OR=[251,117,32],DK=[28,28,61],MGL=14,MGR=10,NC=72;
    const GX=MGL+NC+2,GW=W-GX-MGR,RH=7,HH=9,TY=14,BP=1.5;
    const dF=parseDate(opts.dateFrom),dT=parseDate(opts.dateTo);
    const tot=Math.max(1,diffDays(dF,dT)+1);
    function xOf(ds){const d=parseDate(ds);if(!d)return GX;return GX+Math.max(0,Math.min(tot,diffDays(dF,d)))/tot*GW;}
    const todayIso=new Date().toISOString().slice(0,10);
    function buildMarks(sc){
      const marks=[]; let d=new Date(dF.getTime());
      if(sc==='week'){const dw=d.getUTCDay()||7;d=addDays(d,-(dw-1));}
      else if(sc==='month') d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1));
      else if(sc==='quarter'){const q=Math.floor(d.getUTCMonth()/3);d=new Date(Date.UTC(d.getUTCFullYear(),q*3,1));}
      else d=new Date(Date.UTC(d.getUTCFullYear(),0,1));
      while(d<=dT){
        const iso=d.toISOString().slice(0,10),x=xOf(iso);
        if(x>=GX&&x<=GX+GW) marks.push({x,l:sc==='week'?weekLabel(d):sc==='month'?monthLabel(d):sc==='quarter'?quarterLabel(d):String(d.getUTCFullYear())});
        if(sc==='week') d=addDays(d,7);
        else if(sc==='month') d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1));
        else if(sc==='quarter') d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+3,1));
        else d=new Date(Date.UTC(d.getUTCFullYear()+1,0,1));
      }
      return marks;
    }
    const marks=buildMarks(opts.scale);
    const av=NC+GW+2;

    function hdr(){
      pdf.setFillColor(...OR); pdf.rect(0,0,W,12,'F');
      pdf.setFont('helvetica','bold'); pdf.setFontSize(9); pdf.setTextColor(255,255,255);
      pdf.text(title+'  ·  Diagrama de Gantt',MGL,8); pdf.setFontSize(7); pdf.text(today,W-MGR,8,{align:'right'});
      pdf.setFillColor(...DK); pdf.rect(MGL,TY,NC,HH,'F');
      pdf.setFont('helvetica','bold'); pdf.setFontSize(7); pdf.setTextColor(255,255,255);
      pdf.text('Tarea',MGL+2,TY+HH-2.5);
      pdf.setFillColor(...DK); pdf.rect(GX,TY,GW,HH,'F');
      pdf.setFontSize(6); pdf.setTextColor(255,255,255);
      marks.forEach((mk,mi)=>{
        const nx=mi+1<marks.length?marks[mi+1].x:GX+GW;
        const lx=mk.x+(nx-mk.x)/2;
        if(lx>GX&&lx<GX+GW) pdf.text(mk.l,lx,TY+HH-2.5,{align:'center'});
        if(mi>0){pdf.setDrawColor(80,80,110);pdf.setLineWidth(0.3);pdf.line(mk.x,TY,mk.x,TY+HH);}
      });
    }
    hdr();
    let y=TY+HH;
    const perPage=Math.max(1,Math.floor((H-y-14)/RH));
    for(let pi=0;pi<Math.ceil(tasks.length/perPage);pi++){
      if(pi>0){pdf.addPage();hdr();y=TY+HH;}
      const pg=tasks.slice(pi*perPage,(pi+1)*perPage);
      pg.forEach((t,i)=>{
        const ry=y+i*RH, isSumm=t._isSummary||t.hasChildren;
        if(i%2===0){pdf.setFillColor(248,248,252);pdf.rect(MGL,ry,av,RH,'F');}
        if(isSumm){pdf.setFillColor(238,238,248);pdf.rect(MGL,ry,av,RH,'F');}
        marks.forEach((mk,mi)=>{
          if(mi>0){pdf.setDrawColor(220,220,230);pdf.setLineWidth(0.15);pdf.line(mk.x,ry,mk.x,ry+RH);}
        });
        if(todayIso>=opts.dateFrom&&todayIso<=opts.dateTo){
          pdf.setDrawColor(255,80,80);pdf.setLineWidth(0.4);pdf.line(xOf(todayIso),ry,xOf(todayIso),ry+RH);
        }
        const ind=Math.min(t.depth||0,4)*2;
        pdf.setFont('helvetica',isSumm?'bold':'normal');
        pdf.setFontSize(isSumm?6.5:6); pdf.setTextColor(28,28,61);
        pdf.text(pdf.splitTextToSize((isSumm?'▸ ':'')+t.name,NC-ind-3)[0]||'',MGL+ind+2,ry+RH-2);
        if(t.start_date&&t.end_date){
          const x1=Math.max(GX,xOf(t.start_date)),x2=Math.min(GX+GW,xOf(t.end_date)),bw=Math.max(1,x2-x1);
          const rgb=hexToRgb(t.bar_color||(isSumm?'#28283D':'#1d4ed8'));
          if(t.is_milestone||t.start_date===t.end_date){
            const mx=xOf(t.start_date),my=ry+RH/2,s=2.5;
            pdf.setFillColor(...rgb);
            pdf.triangle(mx,my-s,mx+s,my,mx,my+s,'F');
            pdf.triangle(mx,my-s,mx-s,my,mx,my+s,'F');
          } else {
            pdf.setFillColor(...lighten(rgb,.55)); pdf.roundedRect(x1,ry+BP,bw,RH-BP*2,1,1,'F');
            const p=(t.progress||0)/100;
            if(p>0){pdf.setFillColor(...rgb);pdf.roundedRect(x1,ry+BP,Math.max(1.5,bw*p),RH-BP*2,1,1,'F');}
            pdf.setDrawColor(...rgb); pdf.setLineWidth(0.3); pdf.roundedRect(x1,ry+BP,bw,RH-BP*2,1,1,'S');
            if(bw>16){
              pdf.setFont('helvetica','bold'); pdf.setFontSize(5);
              const lm=(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000;
              pdf.setTextColor(lm>140?40:255,lm>140?40:255,lm>140?60:255);
              pdf.text(pdf.splitTextToSize(t.name,bw-3)[0]||'',x1+bw/2,ry+RH/2+1.5,{align:'center'});
            }
          }
        }
        pdf.setDrawColor(220,220,230); pdf.setLineWidth(0.15); pdf.line(MGL,ry+RH,MGL+av,ry+RH);
      });
    }
    pdf.setFont('helvetica','italic'); pdf.setFontSize(6.5); pdf.setTextColor(160,160,180);
    pdf.text(`${fmtDate(opts.dateFrom)} – ${fmtDate(opts.dateTo)}  ·  ${{week:'Semanal',month:'Mensual',quarter:'Trimestral',year:'Anual'}[opts.scale]}  ·  Buildplan 360`,
      W/2,H-5,{align:'center'});
  }

  /* ─ parchar el botón de exportar ─ */
  function patchExportBtn() {
    const btn = document.getElementById('p360-export-btn');
    if (!btn || btn._p360pdf) return;
    btn._p360pdf = true;
    const nb = btn.cloneNode(true);
    btn.parentNode.replaceChild(nb, btn);
    nb.id = 'p360-export-btn'; nb._p360pdf = true;
    nb.innerHTML = '📄 Exportar PDF';
    nb.addEventListener('click', showPDFDialog);
  }

  /* ═══════════════════════════════════════════════════════
     ORCHESTRATOR — un único observer debounced, se desconecta solo
  ═══════════════════════════════════════════════════════ */
  let _domTimer = null;
  let _lbObs    = null;
  let _adminDone = false;
  let _disconnectMain = false;

  function onDomChange() {
    if (!_adminDone) updateAdminClass();
    patchVincularBtn();
    injectHeightHandle();
    patchExportBtn();
    // quick row: observar left-body si aún no lo hacemos
    if (!_lbObs) {
      const lb = document.querySelector('.left-body');
      if (lb) {
        injectQuickRow();
        _lbObs = new MutationObserver(() => {
          clearTimeout(_lbTimer);
          _lbTimer = setTimeout(injectQuickRow, 250);
        });
        _lbObs.observe(lb, { childList: true });
      }
    }
  }

  let _lbTimer = null;

  const mainObs = new MutationObserver(() => {
    clearTimeout(_domTimer);
    _domTimer = setTimeout(() => {
      onDomChange();
      // Si ya tenemos todo, desconectar el observer del body
      const allDone = document.querySelector('.p360-h-handle')
        && document.querySelector('button[title*="cadena"]')
        && document.getElementById('p360-export-btn')?._p360pdf
        && _lbObs;
      if (allDone && !_disconnectMain) {
        _disconnectMain = true;
        mainObs.disconnect();
      }
    }, 300);
  });

  mainObs.observe(document.body, { childList: true, subtree: true });

  // Desconectar en todo caso a los 45s
  setTimeout(() => { if (!_disconnectMain) { mainObs.disconnect(); _disconnectMain = true; } }, 45000);

  // Primer check
  setTimeout(onDomChange, 900);
  // Check de admin cada 8s (sesión puede cambiar)
  setInterval(updateAdminClass, 8000);

})();
