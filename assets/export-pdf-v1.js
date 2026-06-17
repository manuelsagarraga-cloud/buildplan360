/**
 * Buildplan 360 — Export PDF Pro v1
 *
 * Genera un PDF real con:
 * - Portada con info del proyecto
 * - Tabla de tareas (con jerarquía, fechas, responsable, % avance)
 * - Diagrama de Gantt dibujado en PDF (barras escaladas al rango elegido)
 *
 * Reemplaza la función de exportación existente (html2canvas).
 */
(function () {
  'use strict';

  /* ─── helpers React store ─── */
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

  /* ─── date utils ─── */
  function parseDate(s) {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  function fmtDate(s) {
    if (!s) return '—';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  function addDays(d, n) {
    return new Date(d.getTime() + n * 86400000);
  }
  function diffDays(a, b) {
    return Math.round((b - a) / 86400000);
  }
  function fmtYYYYMM(d) {
    return d.toISOString().slice(0, 7); // "2025-09"
  }
  function monthLabel(d) {
    const M = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return M[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  function weekLabel(d) {
    // ISO week start (Monday)
    const dd = d.getUTCDate();
    const mm = d.getUTCMonth() + 1;
    return `${String(dd).padStart(2,'0')}/${String(mm).padStart(2,'0')}`;
  }
  function quarterLabel(d) {
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `Q${q} ${d.getUTCFullYear()}`;
  }

  /* ─── color utils ─── */
  function hexToRgb(hex) {
    hex = (hex || '#1d4ed8').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lighten(rgb, pct) {
    return rgb.map(c => Math.round(c + (255 - c) * pct));
  }

  /* ─── load jsPDF ─── */
  let _jsPDFReady = false;
  async function ensureJsPDF() {
    if (_jsPDFReady && window.jspdf) return;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    _jsPDFReady = true;
  }

  /* ══════════════════════════════════════════════════
     DIALOG DE OPCIONES
  ══════════════════════════════════════════════════ */
  function showExportDialog(store) {
    // Remover si ya existe
    const prev = document.getElementById('p360-pdf-dialog-overlay');
    if (prev) prev.remove();

    const proj = store.currentProject;
    const tasks = (store.tasks || []);
    const members = (store.members || []);

    // Rango del proyecto
    const projStart = proj && proj.start_date ? proj.start_date : (tasks[0] && tasks[0].start_date) || new Date().toISOString().slice(0,10);
    const projEnd = proj && proj.end_date ? proj.end_date : (tasks[tasks.length-1] && tasks[tasks.length-1].end_date) || new Date().toISOString().slice(0,10);

    const overlay = document.createElement('div');
    overlay.id = 'p360-pdf-dialog-overlay';
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;
      display:flex;align-items:center;justify-content:center;font-family:inherit`;

    overlay.innerHTML = `
      <div id="p360-pdf-dialog" style="
        background:var(--surface,#fff);border-radius:12px;padding:28px 32px;
        width:520px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,.3);
        color:var(--text,#1a1a2e);max-height:90vh;overflow-y:auto">

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <h2 style="margin:0;font-size:18px;font-weight:700">📄 Exportar Cronograma PDF</h2>
          <button id="p360-pdf-close" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--text-3,#999)">×</button>
        </div>

        <!-- Secciones a incluir -->
        <div style="margin-bottom:18px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3,#999);margin-bottom:10px">
            Contenido a incluir
          </div>
          <label style="display:flex;align-items:center;gap:10px;margin-bottom:8px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="pdf-opt-cover" checked style="accent-color:var(--brand-orange,#FB7520);width:15px;height:15px">
            <span>Portada con información del proyecto</span>
          </label>
          <label style="display:flex;align-items:center;gap:10px;margin-bottom:8px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="pdf-opt-table" checked style="accent-color:var(--brand-orange,#FB7520);width:15px;height:15px">
            <span>Tabla de tareas (nombre, fechas, responsable, avance)</span>
          </label>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="pdf-opt-gantt" checked style="accent-color:var(--brand-orange,#FB7520);width:15px;height:15px">
            <span>Diagrama de Gantt</span>
          </label>
        </div>

        <hr style="border:none;border-top:1px solid var(--border,#e5e7eb);margin:16px 0">

        <!-- Escala de tiempo -->
        <div style="margin-bottom:18px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3,#999);margin-bottom:10px">
            Escala del Gantt
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <label style="font-size:12px;color:var(--text-2,#555)">Unidad de tiempo
              <select id="pdf-scale" style="display:block;margin-top:4px;width:100%;padding:7px 10px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:12px;background:var(--surface,#fff);color:var(--text,#1a1a2e)">
                <option value="week">Semana</option>
                <option value="month" selected>Mes</option>
                <option value="quarter">Trimestre</option>
                <option value="year">Año</option>
              </select>
            </label>
            <label style="font-size:12px;color:var(--text-2,#555)">Orientación
              <select id="pdf-orient" style="display:block;margin-top:4px;width:100%;padding:7px 10px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:12px;background:var(--surface,#fff);color:var(--text,#1a1a2e)">
                <option value="landscape" selected>Horizontal (Landscape)</option>
                <option value="portrait">Vertical (Portrait)</option>
              </select>
            </label>
          </div>
        </div>

        <!-- Rango de fechas -->
        <div style="margin-bottom:18px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3,#999);margin-bottom:10px">
            Rango de fechas
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <label style="font-size:12px;color:var(--text-2,#555)">Desde
              <input type="date" id="pdf-date-from" value="${projStart}" style="display:block;margin-top:4px;width:100%;padding:7px 10px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:12px;background:var(--surface,#fff);color:var(--text,#1a1a2e);box-sizing:border-box">
            </label>
            <label style="font-size:12px;color:var(--text-2,#555)">Hasta
              <input type="date" id="pdf-date-to" value="${projEnd}" style="display:block;margin-top:4px;width:100%;padding:7px 10px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:12px;background:var(--surface,#fff);color:var(--text,#1a1a2e);box-sizing:border-box">
            </label>
          </div>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="p360-range-btn" data-from="${projStart}" data-to="${projEnd}" style="font-size:11px;padding:3px 10px;border:1px solid var(--border,#ddd);border-radius:4px;cursor:pointer;background:var(--surface)">Todo el proyecto</button>
            <button class="p360-range-btn" id="pdf-range-year" style="font-size:11px;padding:3px 10px;border:1px solid var(--border,#ddd);border-radius:4px;cursor:pointer;background:var(--surface)">Año actual</button>
            <button class="p360-range-btn" id="pdf-range-q" style="font-size:11px;padding:3px 10px;border:1px solid var(--border,#ddd);border-radius:4px;cursor:pointer;background:var(--surface)">Trimestre actual</button>
          </div>
        </div>

        <!-- Filtros -->
        <div style="margin-bottom:18px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3,#999);margin-bottom:10px">
            Filtros
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <label style="font-size:12px;color:var(--text-2,#555)">Estado
              <select id="pdf-filter-status" style="display:block;margin-top:4px;width:100%;padding:7px 10px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:12px;background:var(--surface,#fff);color:var(--text,#1a1a2e)">
                <option value="">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="in_progress">En progreso</option>
                <option value="completed">Completadas</option>
                <option value="blocked">Bloqueadas</option>
              </select>
            </label>
            <label style="font-size:12px;color:var(--text-2,#555)">Solo tareas con fechas en rango
              <select id="pdf-filter-range" style="display:block;margin-top:4px;width:100%;padding:7px 10px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:12px;background:var(--surface,#fff);color:var(--text,#1a1a2e)">
                <option value="all">Mostrar todas</option>
                <option value="overlap">Que se superponen al rango</option>
                <option value="start">Que empiezan en el rango</option>
              </select>
            </label>
          </div>
          <label style="display:flex;align-items:center;gap:10px;margin-top:10px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="pdf-hide-summary" style="accent-color:var(--brand-orange,#FB7520);width:15px;height:15px">
            <span>Ocultar tareas resumen (mostrar solo hojas)</span>
          </label>
        </div>

        <hr style="border:none;border-top:1px solid var(--border,#e5e7eb);margin:16px 0">

        <!-- Info extra -->
        <div style="margin-bottom:22px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3,#999);margin-bottom:10px">
            Información adicional (opcional)
          </div>
          <input type="text" id="pdf-extra-title" placeholder="Título del informe (ej: Plan de Obra Q3 2025)" style="width:100%;padding:8px 12px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:12px;background:var(--surface,#fff);color:var(--text,#1a1a2e);box-sizing:border-box;margin-bottom:8px">
          <input type="text" id="pdf-extra-author" placeholder="Preparado por (ej: Equipo de Proyectos)" style="width:100%;padding:8px 12px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:12px;background:var(--surface,#fff);color:var(--text,#1a1a2e);box-sizing:border-box">
        </div>

        <!-- Botones -->
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="p360-pdf-cancel" style="padding:9px 20px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;background:var(--surface);color:var(--text)">
            Cancelar
          </button>
          <button id="p360-pdf-generate" style="padding:9px 22px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;background:var(--brand-orange,#FB7520);color:#fff;display:flex;align-items:center;gap:8px">
            <span>📄</span> Generar PDF
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Range buttons
    const now = new Date();
    const y = now.getUTCFullYear();
    const q = Math.floor(now.getUTCMonth() / 3);
    document.getElementById('pdf-range-year').dataset.from = `${y}-01-01`;
    document.getElementById('pdf-range-year').dataset.to   = `${y}-12-31`;
    document.getElementById('pdf-range-q').dataset.from = `${y}-${String(q*3+1).padStart(2,'0')}-01`;
    const qEnd = new Date(Date.UTC(y, q*3+3, 0));
    document.getElementById('pdf-range-q').dataset.to = qEnd.toISOString().slice(0,10);

    overlay.querySelectorAll('.p360-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('pdf-date-from').value = btn.dataset.from;
        document.getElementById('pdf-date-to').value   = btn.dataset.to;
      });
    });

    // Close
    const close = () => overlay.remove();
    document.getElementById('p360-pdf-close').onclick   = close;
    document.getElementById('p360-pdf-cancel').onclick  = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Generate
    document.getElementById('p360-pdf-generate').addEventListener('click', async () => {
      const opts = {
        cover:      document.getElementById('pdf-opt-cover').checked,
        table:      document.getElementById('pdf-opt-table').checked,
        gantt:      document.getElementById('pdf-opt-gantt').checked,
        scale:      document.getElementById('pdf-scale').value,
        orient:     document.getElementById('pdf-orient').value,
        dateFrom:   document.getElementById('pdf-date-from').value,
        dateTo:     document.getElementById('pdf-date-to').value,
        filterStatus: document.getElementById('pdf-filter-status').value,
        filterRange:  document.getElementById('pdf-filter-range').value,
        hideSummary:  document.getElementById('pdf-hide-summary').checked,
        extraTitle:   document.getElementById('pdf-extra-title').value.trim(),
        extraAuthor:  document.getElementById('pdf-extra-author').value.trim(),
      };

      if (!opts.cover && !opts.table && !opts.gantt) {
        alert('Seleccioná al menos una sección para exportar.');
        return;
      }

      const btn = document.getElementById('p360-pdf-generate');
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span> Generando...';

      try {
        await generatePDF(store, tasks, members, opts);
        close();
      } catch (err) {
        console.error('PDF error:', err);
        alert('Error al generar PDF: ' + (err.message || err));
        btn.disabled = false;
        btn.innerHTML = '<span>📄</span> Generar PDF';
      }
    });
  }

  /* ══════════════════════════════════════════════════
     GENERADOR PDF PRINCIPAL
  ══════════════════════════════════════════════════ */
  async function generatePDF(store, tasks, members, opts) {
    await ensureJsPDF();
    const { jsPDF } = window.jspdf;

    // Tamaño página A3 para tener más espacio en landscape
    const pageW_mm = opts.orient === 'landscape' ? 420 : 297;
    const pageH_mm = opts.orient === 'landscape' ? 297 : 420;

    const pdf = new jsPDF({
      orientation: opts.orient,
      unit: 'mm',
      format: 'a3'
    });

    const proj = store.currentProject || {};
    const today = new Date().toLocaleDateString('es-AR');
    const title = opts.extraTitle || proj.name || 'Cronograma';

    // Construir lista de tareas filtrada
    let filteredTasks = buildTaskList(tasks, members, opts);

    let currentY = 0;
    let pageNum = 1;

    // ── PORTADA ──────────────────────────────────────
    if (opts.cover) {
      drawCover(pdf, proj, title, opts, today, pageW_mm, pageH_mm);
      if (opts.table || opts.gantt) {
        pdf.addPage();
        pageNum++;
      }
    }

    // ── TABLA DE TAREAS ──────────────────────────────
    if (opts.table) {
      currentY = drawTaskTable(pdf, filteredTasks, proj, title, opts, today, pageW_mm, pageH_mm, pageNum);
      if (opts.gantt) {
        pdf.addPage();
        pageNum++;
      }
    }

    // ── DIAGRAMA GANTT ───────────────────────────────
    if (opts.gantt) {
      drawGanttDiagram(pdf, filteredTasks, proj, title, opts, today, pageW_mm, pageH_mm, pageNum);
    }

    // Guardar
    const filename = 'cronograma_' + (proj.name || 'proyecto').replace(/\W+/g, '_')
      + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
    pdf.save(filename);
  }

  /* ─── Filtrar y enriquecer tareas ─── */
  function buildTaskList(tasks, members, opts) {
    const memberMap = {};
    (members || []).forEach(m => { memberMap[m.id] = m; });

    let list = (tasks || []).map(t => ({
      ...t,
      _member: t.assigned_to ? memberMap[t.assigned_to] : null,
    }));

    // Filtro estado
    if (opts.filterStatus) list = list.filter(t => t.status === opts.filterStatus);

    // Filtro summary
    if (opts.hideSummary) list = list.filter(t => !t._isSummary && !t.hasChildren);

    // Filtro rango fechas
    if (opts.filterRange === 'overlap') {
      list = list.filter(t =>
        t.start_date <= opts.dateTo && t.end_date >= opts.dateFrom
      );
    } else if (opts.filterRange === 'start') {
      list = list.filter(t =>
        t.start_date >= opts.dateFrom && t.start_date <= opts.dateTo
      );
    }

    return list;
  }

  /* ══════════════════════════════════════════════════
     PORTADA
  ══════════════════════════════════════════════════ */
  function drawCover(pdf, proj, title, opts, today, W, H) {
    const orange = [251, 117, 32];
    const dark   = [28, 28, 61];

    // Franja superior naranja
    pdf.setFillColor(...orange);
    pdf.rect(0, 0, W, 40, 'F');

    // Logo texto
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.setTextColor(255, 255, 255);
    pdf.text('Buildplan 360', 16, 26);

    // Línea decorativa
    pdf.setFillColor(...dark);
    pdf.rect(0, 40, W, 4, 'F');

    // Título del informe
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(32);
    pdf.setTextColor(...dark);
    const titleLines = pdf.splitTextToSize(title, W - 40);
    pdf.text(titleLines, 20, 80);

    // Subtítulo / nombre proyecto
    if (opts.extraTitle && proj.name && opts.extraTitle !== proj.name) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(16);
      pdf.setTextColor(100, 100, 120);
      pdf.text(proj.name, 20, 80 + titleLines.length * 14 + 6);
    }

    // Caja de info
    const infoY = H / 2;
    pdf.setFillColor(248, 248, 252);
    pdf.roundedRect(20, infoY - 10, W - 40, 80, 6, 6, 'F');

    const infoItems = [
      ['Período',         `${fmtDate(opts.dateFrom)} — ${fmtDate(opts.dateTo)}`],
      ['Escala',          { week:'Semanal', month:'Mensual', quarter:'Trimestral', year:'Anual' }[opts.scale]],
      ['Estado',          proj.status ? ({planning:'Planificación',active:'En curso',on_hold:'En pausa',completed:'Completado',cancelled:'Cancelado'}[proj.status] || proj.status) : '—'],
      ['Provincia',       proj.provincia || '—'],
      ['Ciclo de vida',   proj.ciclo_vida || '—'],
      ['Preparado por',   opts.extraAuthor || '—'],
      ['Fecha de emisión', today],
    ];

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...dark);

    infoItems.forEach(([label, val], i) => {
      const ix = 30 + (i % 2) * (W / 2 - 20);
      const iy = infoY + Math.floor(i / 2) * 18 + 6;
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(150, 150, 170);
      pdf.text(label.toUpperCase(), ix, iy);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...dark);
      pdf.text(String(val), ix, iy + 6);
    });

    // Footer
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(180, 180, 190);
    pdf.text('Generado por Buildplan 360  ·  ' + today, W / 2, H - 10, { align: 'center' });
  }

  /* ══════════════════════════════════════════════════
     TABLA DE TAREAS
  ══════════════════════════════════════════════════ */
  function drawTaskTable(pdf, tasks, proj, title, opts, today, W, H, startPage) {
    const orange = [251, 117, 32];
    const dark   = [28, 28, 61];
    const MARGIN = 14;
    const ROW_H  = 7;
    const HDR_H  = 9;

    // Columnas: #, Nombre, Inicio, Fin, Dur, Resp, Estado, %
    const cols = [
      { label: '#',          w: 10, align: 'center' },
      { label: 'Nombre de la tarea', w: 68, align: 'left' },
      { label: 'Inicio',     w: 22, align: 'center' },
      { label: 'Fin',        w: 22, align: 'center' },
      { label: 'Dur',        w: 14, align: 'center' },
      { label: 'Responsable',w: 36, align: 'left' },
      { label: 'Estado',     w: 24, align: 'center' },
      { label: '%',          w: 12, align: 'center' },
    ];
    // Ajustar ancho disponible
    const totalColW = cols.reduce((s, c) => s + c.w, 0);
    const available = W - MARGIN * 2;
    const scale = available / totalColW;
    cols.forEach(c => { c.w = c.w * scale; });

    function header(y) {
      // Franja superior pequeña
      pdf.setFillColor(...orange);
      pdf.rect(0, 0, W, 12, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(255, 255, 255);
      pdf.text(title + '  ·  Tabla de tareas', MARGIN, 8);
      pdf.setFontSize(7);
      pdf.text(today, W - MARGIN, 8, { align: 'right' });

      // Cabecera tabla
      pdf.setFillColor(...dark);
      pdf.rect(MARGIN, y, available, HDR_H, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(255, 255, 255);
      let x = MARGIN;
      cols.forEach(c => {
        pdf.text(c.label, x + (c.align === 'center' ? c.w / 2 : 2), y + HDR_H - 2.5,
          { align: c.align === 'center' ? 'center' : 'left' });
        x += c.w;
      });
      return y + HDR_H;
    }

    const statusLabels = { pending:'Pendiente', in_progress:'En progreso', completed:'Completada', blocked:'Bloqueada' };
    const statusColors = {
      pending:     [200, 200, 210],
      in_progress: [51, 102, 255],
      completed:   [51, 204, 153],
      blocked:     [255, 51, 102],
    };

    let y = header(16);
    let rowNum = 0;

    tasks.forEach((t, i) => {
      // Salto de página
      if (y + ROW_H > H - 16) {
        pdf.addPage();
        y = header(16);
      }

      // Fondo alternado
      if (i % 2 === 0) {
        pdf.setFillColor(249, 249, 252);
        pdf.rect(MARGIN, y, available, ROW_H, 'F');
      }

      // Resaltar tareas resumen
      if (t._isSummary || t.hasChildren) {
        pdf.setFillColor(240, 240, 248);
        pdf.rect(MARGIN, y, available, ROW_H, 'F');
      }

      rowNum++;
      const dur = t.start_date && t.end_date
        ? (t.duration_mode === 'corridos'
            ? Math.round((parseDate(t.end_date) - parseDate(t.start_date)) / 86400000) + 1
            : Math.max(1, Math.round((parseDate(t.end_date) - parseDate(t.start_date)) / 86400000)))
        : 0;

      const cells = [
        rowNum,
        (t._isSummary || t.hasChildren ? '▸ ' : '  '.repeat(Math.min(t.depth || 0, 3))) + t.name,
        fmtDate(t.start_date),
        fmtDate(t.end_date),
        dur ? dur + (t.duration_mode === 'corridos' ? 'dc' : 'dh') : '—',
        t._member ? t._member.name.split(' ').slice(0,2).join(' ') : '—',
        statusLabels[t.status] || t.status || '—',
        (t.progress || 0) + '%',
      ];

      let x = MARGIN;
      cells.forEach((val, ci) => {
        const col = cols[ci];
        pdf.setFont('helvetica', t._isSummary || t.hasChildren ? 'bold' : 'normal');
        pdf.setFontSize(6.5);

        // Chip de estado
        if (ci === 6) {
          const sc = statusColors[t.status] || [200, 200, 200];
          pdf.setFillColor(...sc);
          pdf.roundedRect(x + 1, y + 1.2, col.w - 2, ROW_H - 2.5, 1.5, 1.5, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFont('helvetica', 'bold');
        } else if (ci === 7) {
          // Barra de progreso pequeña
          const pct = parseInt(val) / 100;
          pdf.setFillColor(230, 230, 235);
          pdf.rect(x + 1, y + 2.5, col.w - 2, 2.5, 'F');
          if (pct > 0) {
            pdf.setFillColor(51, 204, 153);
            pdf.rect(x + 1, y + 2.5, (col.w - 2) * pct, 2.5, 'F');
          }
          pdf.setTextColor(50, 50, 80);
          pdf.setFontSize(5.5);
        } else {
          pdf.setTextColor(50, 50, 80);
        }

        const text = String(val);
        const maxW = col.w - 3;
        const fitted = pdf.splitTextToSize(text, maxW)[0] || '';
        pdf.text(fitted, x + (col.align === 'center' ? col.w / 2 : 2), y + ROW_H - 2,
          { align: col.align === 'center' ? 'center' : 'left' });
        x += col.w;
      });

      // Línea divisoria
      pdf.setDrawColor(225, 225, 235);
      pdf.setLineWidth(0.2);
      pdf.line(MARGIN, y + ROW_H, MARGIN + available, y + ROW_H);

      y += ROW_H;
    });

    // Resumen al pie
    y += 6;
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(7);
    pdf.setTextColor(150, 150, 170);
    pdf.text(`${tasks.length} tarea${tasks.length !== 1 ? 's' : ''} · Período: ${fmtDate(opts.dateFrom)} – ${fmtDate(opts.dateTo)}`, MARGIN, y);

    return y;
  }

  /* ══════════════════════════════════════════════════
     DIAGRAMA GANTT
  ══════════════════════════════════════════════════ */
  function drawGanttDiagram(pdf, tasks, proj, title, opts, today, W, H) {
    const orange = [251, 117, 32];
    const dark   = [28, 28, 61];
    const MARGIN_L = 14;   // margen izquierdo página
    const MARGIN_R = 10;
    const NAME_COL  = 75;  // ancho columna nombre
    const GANTT_X   = MARGIN_L + NAME_COL + 2; // x donde empieza la parte gráfica
    const GANTT_W   = W - GANTT_X - MARGIN_R;
    const ROW_H     = 7;
    const HDR_H     = 9;   // altura cabecera fija
    const TOP_Y     = 14;  // Y donde empieza la tabla (después del banner)
    const BAR_PAD   = 1.5; // padding vertical de la barra dentro de la fila

    // Rango efectivo
    const dateFrom = parseDate(opts.dateFrom);
    const dateTo   = parseDate(opts.dateTo);
    const totalDays = Math.max(1, diffDays(dateFrom, dateTo) + 1);

    // Función coordenada X de una fecha
    function xOf(dateStr) {
      const d = parseDate(dateStr);
      if (!d) return GANTT_X;
      const offset = Math.max(0, Math.min(totalDays, diffDays(dateFrom, d)));
      return GANTT_X + (offset / totalDays) * GANTT_W;
    }

    // Construir marcadores según escala
    function buildMarkers(scale) {
      const markers = [];
      let d = new Date(dateFrom.getTime());
      // Normalizar al inicio de la unidad
      if (scale === 'week') {
        // Ir al lunes anterior o igual
        const dow = d.getUTCDay() || 7;
        d = addDays(d, -(dow - 1));
      } else if (scale === 'month') {
        d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      } else if (scale === 'quarter') {
        const q = Math.floor(d.getUTCMonth() / 3);
        d = new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
      } else { // year
        d = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      }

      while (d <= dateTo) {
        const iso = d.toISOString().slice(0, 10);
        const x = xOf(iso);
        if (x >= GANTT_X && x <= GANTT_X + GANTT_W) {
          markers.push({
            x,
            label: scale === 'week'    ? weekLabel(d)
                 : scale === 'month'   ? monthLabel(d)
                 : scale === 'quarter' ? quarterLabel(d)
                 : String(d.getUTCFullYear()),
          });
        }
        // Avanzar
        if (scale === 'week')         d = addDays(d, 7);
        else if (scale === 'month')   d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
        else if (scale === 'quarter') d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1));
        else                          d = new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1));
      }
      return markers;
    }

    const markers = buildMarkers(opts.scale);
    const todayIso = new Date().toISOString().slice(0, 10);

    // ── Cabecera de página ──
    pdf.setFillColor(...orange);
    pdf.rect(0, 0, W, 12, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(255, 255, 255);
    pdf.text(title + '  ·  Diagrama de Gantt', MARGIN_L, 8);
    pdf.setFontSize(7);
    pdf.text(today, W - MARGIN_R, 8, { align: 'right' });

    // ── Cabecera columna nombre ──
    pdf.setFillColor(...dark);
    pdf.rect(MARGIN_L, TOP_Y, NAME_COL, HDR_H, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(255, 255, 255);
    pdf.text('Tarea', MARGIN_L + 2, TOP_Y + HDR_H - 2.5);

    // ── Cabecera Gantt (marcadores de tiempo) ──
    pdf.setFillColor(...dark);
    pdf.rect(GANTT_X, TOP_Y, GANTT_W, HDR_H, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6);
    pdf.setTextColor(255, 255, 255);
    markers.forEach((mk, mi) => {
      const nextX = mi + 1 < markers.length ? markers[mi + 1].x : GANTT_X + GANTT_W;
      const slotW = nextX - mk.x;
      const labelX = mk.x + slotW / 2;
      if (labelX > GANTT_X && labelX < GANTT_X + GANTT_W) {
        pdf.text(mk.label, labelX, TOP_Y + HDR_H - 2.5, { align: 'center' });
      }
      // Línea vertical de cabecera
      pdf.setDrawColor(80, 80, 110);
      pdf.setLineWidth(0.3);
      if (mi > 0) pdf.line(mk.x, TOP_Y, mk.x, TOP_Y + HDR_H);
    });

    // ── Filas ──
    let y = TOP_Y + HDR_H;

    // Cuántas filas caben en la página
    const availH = H - y - 14; // 14 = footer
    const rowsPerPage = Math.floor(availH / ROW_H);

    // Dividir en páginas si hace falta
    const pages = [];
    for (let i = 0; i < tasks.length; i += rowsPerPage) {
      pages.push(tasks.slice(i, i + rowsPerPage));
    }

    pages.forEach((pageTasks, pageIdx) => {
      if (pageIdx > 0) {
        pdf.addPage();
        // Repetir cabecera
        pdf.setFillColor(...orange);
        pdf.rect(0, 0, W, 12, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(255, 255, 255);
        pdf.text(title + '  ·  Diagrama de Gantt (cont.)', MARGIN_L, 8);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.text(today, W - MARGIN_R, 8, { align: 'right' });

        // Cabecera nombre
        pdf.setFillColor(...dark);
        pdf.rect(MARGIN_L, TOP_Y, NAME_COL, HDR_H, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(255, 255, 255);
        pdf.text('Tarea', MARGIN_L + 2, TOP_Y + HDR_H - 2.5);

        // Cabecera gantt
        pdf.setFillColor(...dark);
        pdf.rect(GANTT_X, TOP_Y, GANTT_W, HDR_H, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6);
        pdf.setTextColor(255, 255, 255);
        markers.forEach((mk, mi) => {
          const nextX = mi + 1 < markers.length ? markers[mi + 1].x : GANTT_X + GANTT_W;
          const slotW = nextX - mk.x;
          const labelX = mk.x + slotW / 2;
          if (labelX > GANTT_X && labelX < GANTT_X + GANTT_W) {
            pdf.text(mk.label, labelX, TOP_Y + HDR_H - 2.5, { align: 'center' });
          }
          if (mi > 0) {
            pdf.setDrawColor(80, 80, 110);
            pdf.setLineWidth(0.3);
            pdf.line(mk.x, TOP_Y, mk.x, TOP_Y + HDR_H);
          }
        });
        y = TOP_Y + HDR_H;
      }

      pageTasks.forEach((t, i) => {
        const rowY = y + i * ROW_H;
        const isSummary = t._isSummary || t.hasChildren;

        // Fondo alternado
        if (i % 2 === 0) {
          pdf.setFillColor(248, 248, 252);
          pdf.rect(MARGIN_L, rowY, NAME_COL + GANTT_W + 2, ROW_H, 'F');
        }
        if (isSummary) {
          pdf.setFillColor(238, 238, 248);
          pdf.rect(MARGIN_L, rowY, NAME_COL + GANTT_W + 2, ROW_H, 'F');
        }

        // Líneas verticales de cuadrícula (marcadores)
        pdf.setDrawColor(220, 220, 230);
        pdf.setLineWidth(0.15);
        markers.forEach((mk, mi) => {
          if (mi > 0) pdf.line(mk.x, rowY, mk.x, rowY + ROW_H);
        });

        // Línea hoy
        if (todayIso >= opts.dateFrom && todayIso <= opts.dateTo) {
          const todayX = xOf(todayIso);
          pdf.setDrawColor(255, 80, 80);
          pdf.setLineWidth(0.4);
          pdf.line(todayX, rowY, todayX, rowY + ROW_H);
        }

        // Nombre de la tarea
        const indent = Math.min(t.depth || 0, 4) * 2;
        pdf.setFont('helvetica', isSummary ? 'bold' : 'normal');
        pdf.setFontSize(isSummary ? 6.5 : 6);
        pdf.setTextColor(28, 28, 61);
        const nameMaxW = NAME_COL - indent - 3;
        const nameTxt = pdf.splitTextToSize(t.name || '', nameMaxW)[0] || '';
        pdf.text((isSummary ? '▸ ' : '') + nameTxt, MARGIN_L + indent + 2, rowY + ROW_H - 2);

        // Barra Gantt
        if (t.start_date && t.end_date) {
          const x1 = Math.max(GANTT_X, xOf(t.start_date));
          const x2 = Math.min(GANTT_X + GANTT_W, xOf(t.end_date));
          const barW = Math.max(1, x2 - x1);

          const rgb = hexToRgb(t.bar_color || (isSummary ? '#28283D' : '#1d4ed8'));

          if (t.is_milestone || t.start_date === t.end_date) {
            // Hito: rombo
            const mx = xOf(t.start_date);
            const my = rowY + ROW_H / 2;
            const s  = 2.5;
            pdf.setFillColor(...rgb);
            pdf.triangle(mx, my - s, mx + s, my, mx, my + s, 'F');
            pdf.triangle(mx, my - s, mx - s, my, mx, my + s, 'F');
          } else {
            // Barra principal
            pdf.setFillColor(...lighten(rgb, 0.55));
            pdf.roundedRect(x1, rowY + BAR_PAD, barW, ROW_H - BAR_PAD * 2, 1, 1, 'F');

            // Progreso
            const pct = (t.progress || 0) / 100;
            if (pct > 0) {
              pdf.setFillColor(...rgb);
              pdf.roundedRect(x1, rowY + BAR_PAD, Math.max(1.5, barW * pct), ROW_H - BAR_PAD * 2, 1, 1, 'F');
            }

            // Borde
            pdf.setDrawColor(...rgb);
            pdf.setLineWidth(0.3);
            pdf.roundedRect(x1, rowY + BAR_PAD, barW, ROW_H - BAR_PAD * 2, 1, 1, 'S');

            // Etiqueta dentro de la barra si hay espacio
            if (barW > 16) {
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(5);
              const barRgb = hexToRgb(t.bar_color || '#1d4ed8');
              const luminance = (barRgb[0]*299 + barRgb[1]*587 + barRgb[2]*114) / 1000;
              pdf.setTextColor(luminance > 140 ? 40 : 255, luminance > 140 ? 40 : 255, luminance > 140 ? 60 : 255);
              const barLabel = pdf.splitTextToSize(t.name || '', barW - 3)[0] || '';
              pdf.text(barLabel, x1 + barW / 2, rowY + ROW_H / 2 + 1.5, { align: 'center' });
            }
          }
        }

        // Línea horizontal de fila
        pdf.setDrawColor(220, 220, 230);
        pdf.setLineWidth(0.15);
        pdf.line(MARGIN_L, rowY + ROW_H, MARGIN_L + NAME_COL + GANTT_W + 2, rowY + ROW_H);
      });
    });

    // Footer
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(6.5);
    pdf.setTextColor(160, 160, 180);
    pdf.text(
      `Período: ${fmtDate(opts.dateFrom)} – ${fmtDate(opts.dateTo)}  ·  Escala: ${ { week:'Semanal', month:'Mensual', quarter:'Trimestral', year:'Anual' }[opts.scale] }  ·  Buildplan 360`,
      W / 2, H - 5, { align: 'center' }
    );
  }

  /* ══════════════════════════════════════════════════
     REEMPLAZAR BOTÓN DE EXPORTAR EXISTENTE
  ══════════════════════════════════════════════════ */
  function patchExportButton() {
    const btn = document.getElementById('p360-export-btn');
    if (!btn || btn._p360pdfProPatched) return;
    btn._p360pdfProPatched = true;

    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.id = 'p360-export-btn';
    newBtn._p360pdfProPatched = true;
    newBtn.innerHTML = '📄 Exportar PDF';
    newBtn.title = 'Exportar cronograma a PDF con opciones';

    newBtn.addEventListener('click', () => {
      const store = getStore();
      if (!store) {
        alert('No se pudo acceder al proyecto. Asegurate de tener un proyecto abierto.');
        return;
      }
      if (!store.currentProject) {
        alert('No hay proyecto abierto.');
        return;
      }
      showExportDialog(store);
    });
  }

  /* ── Init ── */
  function init() {
    const obs = new MutationObserver(patchExportButton);
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(patchExportButton, 1500);
    setInterval(patchExportButton, 3000);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : setTimeout(init, 200);

})();
