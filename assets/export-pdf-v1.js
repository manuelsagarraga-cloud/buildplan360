/**
 * Buildplan 360 — Export PDF Pro v1 (REWRITE seguro)
 *
 * Reemplaza el botón de exportar PDF original con un diálogo completo.
 * PERFORMANCE: sin setIntervals. Un único observer debounced.
 */
(function () {
  'use strict';

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
  function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
  function diffDays(a, b) { return Math.round((b - a) / 86400000); }
  function monthLabel(d) {
    return ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][d.getUTCMonth()]
      + ' ' + d.getUTCFullYear();
  }
  function weekLabel(d) {
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  }
  function quarterLabel(d) {
    return `Q${Math.floor(d.getUTCMonth()/3)+1} ${d.getUTCFullYear()}`;
  }
  function hexToRgb(hex) {
    hex = (hex||'#1d4ed8').replace('#','');
    if (hex.length===3) hex=hex.split('').map(c=>c+c).join('');
    const n=parseInt(hex,16);
    return [(n>>16)&255,(n>>8)&255,n&255];
  }
  function lighten(rgb,p) { return rgb.map(c=>Math.round(c+(255-c)*p)); }

  /* ─── load jsPDF ─── */
  let _jsPDFReady=false;
  async function ensureJsPDF() {
    if (_jsPDFReady&&window.jspdf) return;
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
    _jsPDFReady=true;
  }

  /* ══ DIALOG ══════════════════════════════════════════ */
  function showExportDialog(store) {
    document.getElementById('p360-pdf-ov')?.remove();
    const proj=store.currentProject||{};
    const tasks=store.tasks||[];
    const pS=proj.start_date||(tasks[0]?.start_date)||new Date().toISOString().slice(0,10);
    const pE=proj.end_date||(tasks[tasks.length-1]?.end_date)||new Date().toISOString().slice(0,10);
    const now=new Date();
    const y=now.getUTCFullYear();
    const q=Math.floor(now.getUTCMonth()/3);
    const qEnd=new Date(Date.UTC(y,q*3+3,0)).toISOString().slice(0,10);

    const ov=document.createElement('div');
    ov.id='p360-pdf-ov';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:inherit';

    ov.innerHTML=`
<div style="background:var(--surface,#fff);border-radius:12px;padding:26px 30px;width:500px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,.3);color:var(--text,#1a1a2e);max-height:90vh;overflow-y:auto">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <h2 style="margin:0;font-size:17px;font-weight:700">📄 Exportar Cronograma PDF</h2>
    <button id="p360-pdf-x" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--text-3,#999)">×</button>
  </div>

  <div style="margin-bottom:14px">
    <div class="p360-sec-hdr">Contenido</div>
    <label class="p360-chk"><input type="checkbox" id="oc" checked> Portada con datos del proyecto</label>
    <label class="p360-chk"><input type="checkbox" id="ot" checked> Tabla de tareas</label>
    <label class="p360-chk"><input type="checkbox" id="og" checked> Diagrama de Gantt</label>
  </div>

  <hr class="p360-hr">

  <div style="margin-bottom:14px">
    <div class="p360-sec-hdr">Gantt</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="p360-lbl">Escala
        <select id="osc" class="p360-sel">
          <option value="week">Semana</option>
          <option value="month" selected>Mes</option>
          <option value="quarter">Trimestre</option>
          <option value="year">Año</option>
        </select>
      </label>
      <label class="p360-lbl">Orientación
        <select id="oor" class="p360-sel">
          <option value="landscape" selected>Horizontal (A3)</option>
          <option value="portrait">Vertical (A3)</option>
        </select>
      </label>
    </div>
  </div>

  <div style="margin-bottom:14px">
    <div class="p360-sec-hdr">Rango de fechas</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
      <label class="p360-lbl">Desde <input type="date" id="odf" value="${pS}" class="p360-inp"></label>
      <label class="p360-lbl">Hasta <input type="date" id="odt" value="${pE}" class="p360-inp"></label>
    </div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      <button class="p360-rbtn" data-f="${pS}" data-t="${pE}">Todo el proyecto</button>
      <button class="p360-rbtn" data-f="${y}-01-01" data-t="${y}-12-31">Año ${y}</button>
      <button class="p360-rbtn" data-f="${y}-${String(q*3+1).padStart(2,'0')}-01" data-t="${qEnd}">Trimestre actual</button>
    </div>
  </div>

  <div style="margin-bottom:14px">
    <div class="p360-sec-hdr">Filtros</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="p360-lbl">Estado
        <select id="ofs" class="p360-sel">
          <option value="">Todos</option>
          <option value="pending">Pendientes</option>
          <option value="in_progress">En progreso</option>
          <option value="completed">Completadas</option>
          <option value="blocked">Bloqueadas</option>
        </select>
      </label>
      <label class="p360-lbl">Tareas en rango
        <select id="ofr" class="p360-sel">
          <option value="all">Todas</option>
          <option value="overlap">Que se superponen</option>
          <option value="start">Que empiezan en rango</option>
        </select>
      </label>
    </div>
    <label class="p360-chk" style="margin-top:8px"><input type="checkbox" id="ohs"> Ocultar tareas resumen</label>
  </div>

  <div style="margin-bottom:20px">
    <div class="p360-sec-hdr">Información adicional</div>
    <input id="oeti" type="text" class="p360-inp" style="width:100%;margin-bottom:7px" placeholder="Título del informe (ej: Plan de Obra Q3 2025)">
    <input id="oeau" type="text" class="p360-inp" style="width:100%" placeholder="Preparado por">
  </div>

  <div style="display:flex;gap:10px;justify-content:flex-end">
    <button id="p360-pdf-cancel" style="padding:8px 18px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;background:var(--surface);color:var(--text)">Cancelar</button>
    <button id="p360-pdf-gen" style="padding:8px 20px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;background:var(--brand-orange,#FB7520);color:#fff">📄 Generar PDF</button>
  </div>
</div>

<style>
.p360-sec-hdr{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3,#999);margin-bottom:8px}
.p360-hr{border:none;border-top:1px solid var(--border,#e5e7eb);margin:12px 0}
.p360-chk{display:flex;align-items:center;gap:9px;font-size:13px;cursor:pointer;margin-bottom:6px}
.p360-chk input{accent-color:var(--brand-orange,#FB7520);width:14px;height:14px}
.p360-lbl{font-size:11px;color:var(--text-2,#555);display:flex;flex-direction:column;gap:4px}
.p360-sel{padding:6px 9px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:12px;background:var(--surface,#fff);color:var(--text,#1a1a2e);width:100%}
.p360-inp{padding:6px 9px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:12px;background:var(--surface,#fff);color:var(--text,#1a1a2e);box-sizing:border-box;display:block;margin-top:2px}
.p360-rbtn{font-size:11px;padding:3px 10px;border:1px solid var(--border,#ddd);border-radius:4px;cursor:pointer;background:var(--surface);color:var(--text)}
.p360-rbtn:hover{background:var(--surface-2,#f0f0f5)}
</style>
    `;

    document.body.appendChild(ov);

    ov.querySelectorAll('.p360-rbtn').forEach(b => b.addEventListener('click', () => {
      document.getElementById('odf').value = b.dataset.f;
      document.getElementById('odt').value = b.dataset.t;
    }));

    const close = () => ov.remove();
    document.getElementById('p360-pdf-x').onclick      = close;
    document.getElementById('p360-pdf-cancel').onclick = close;
    ov.addEventListener('click', e => { if (e.target===ov) close(); });

    document.getElementById('p360-pdf-gen').addEventListener('click', async () => {
      const opts = {
        cover:  document.getElementById('oc').checked,
        table:  document.getElementById('ot').checked,
        gantt:  document.getElementById('og').checked,
        scale:  document.getElementById('osc').value,
        orient: document.getElementById('oor').value,
        dateFrom: document.getElementById('odf').value,
        dateTo:   document.getElementById('odt').value,
        filterStatus: document.getElementById('ofs').value,
        filterRange:  document.getElementById('ofr').value,
        hideSummary:  document.getElementById('ohs').checked,
        extraTitle:   document.getElementById('oeti').value.trim(),
        extraAuthor:  document.getElementById('oeau').value.trim(),
      };
      if (!opts.cover && !opts.table && !opts.gantt) {
        alert('Seleccioná al menos una sección.');
        return;
      }
      const btn = document.getElementById('p360-pdf-gen');
      btn.disabled=true; btn.textContent='⏳ Generando…';
      try {
        await generatePDF(store, store.tasks||[], store.members||[], opts);
        close();
      } catch(err) {
        console.error(err);
        alert('Error: '+(err.message||err));
        btn.disabled=false; btn.innerHTML='📄 Generar PDF';
      }
    });
  }

  /* ══ GENERADOR ═══════════════════════════════════════ */
  async function generatePDF(store, tasks, members, opts) {
    await ensureJsPDF();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation:opts.orient, unit:'mm', format:'a3' });
    const W = opts.orient==='landscape' ? 420 : 297;
    const H = opts.orient==='landscape' ? 297 : 420;
    const proj = store.currentProject||{};
    const today = new Date().toLocaleDateString('es-AR');
    const title = opts.extraTitle || proj.name || 'Cronograma';
    const mMap = {}; (members||[]).forEach(m=>{ mMap[m.id]=m; });
    let filtered = buildList(tasks, mMap, opts);

    if (opts.cover) {
      drawCover(pdf,proj,title,opts,today,W,H);
      if (opts.table||opts.gantt) pdf.addPage();
    }
    if (opts.table) {
      drawTable(pdf,filtered,title,opts,today,W,H);
      if (opts.gantt) pdf.addPage();
    }
    if (opts.gantt) {
      drawGantt(pdf,filtered,title,opts,today,W,H);
    }
    const fn='cronograma_'+(proj.name||'proyecto').replace(/\W+/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.pdf';
    pdf.save(fn);
  }

  function buildList(tasks, mMap, opts) {
    let list = (tasks||[]).map(t=>({...t, _m: t.assigned_to?mMap[t.assigned_to]:null}));
    if (opts.filterStatus) list=list.filter(t=>t.status===opts.filterStatus);
    if (opts.hideSummary)  list=list.filter(t=>!t._isSummary&&!t.hasChildren);
    if (opts.filterRange==='overlap')
      list=list.filter(t=>t.start_date<=opts.dateTo&&t.end_date>=opts.dateFrom);
    if (opts.filterRange==='start')
      list=list.filter(t=>t.start_date>=opts.dateFrom&&t.start_date<=opts.dateTo);
    return list;
  }

  /* ─── PORTADA ─── */
  function drawCover(pdf,proj,title,opts,today,W,H) {
    const OR=[251,117,32], DK=[28,28,61];
    pdf.setFillColor(...OR); pdf.rect(0,0,W,40,'F');
    pdf.setFont('helvetica','bold'); pdf.setFontSize(22); pdf.setTextColor(255,255,255);
    pdf.text('Buildplan 360',16,26);
    pdf.setFillColor(...DK); pdf.rect(0,40,W,4,'F');
    pdf.setFont('helvetica','bold'); pdf.setFontSize(30); pdf.setTextColor(...DK);
    const lines=pdf.splitTextToSize(title,W-40);
    pdf.text(lines,20,78);
    const infoY=H/2;
    pdf.setFillColor(248,248,252); pdf.roundedRect(20,infoY-10,W-40,80,6,6,'F');
    const status={planning:'Planificación',active:'En curso',on_hold:'En pausa',completed:'Completado',cancelled:'Cancelado'};
    const items=[
      ['Período', `${fmtDate(opts.dateFrom)} — ${fmtDate(opts.dateTo)}`],
      ['Escala', {week:'Semanal',month:'Mensual',quarter:'Trimestral',year:'Anual'}[opts.scale]],
      ['Estado', status[proj.status]||proj.status||'—'],
      ['Provincia', proj.provincia||'—'],
      ['Ciclo de vida', proj.ciclo_vida||'—'],
      ['Preparado por', opts.extraAuthor||'—'],
      ['Emisión', today],
    ];
    items.forEach(([l,v],i)=>{
      const ix=30+(i%2)*(W/2-20), iy=infoY+Math.floor(i/2)*18+6;
      pdf.setFont('helvetica','bold'); pdf.setFontSize(8); pdf.setTextColor(150,150,170);
      pdf.text(l.toUpperCase(),ix,iy);
      pdf.setFont('helvetica','normal'); pdf.setFontSize(10); pdf.setTextColor(...DK);
      pdf.text(String(v),ix,iy+6);
    });
    pdf.setFont('helvetica','normal'); pdf.setFontSize(7); pdf.setTextColor(180,180,190);
    pdf.text('Buildplan 360  ·  '+today,W/2,H-8,{align:'center'});
  }

  /* ─── TABLA ─── */
  function drawTable(pdf,tasks,title,opts,today,W,H) {
    const OR=[251,117,32], DK=[28,28,61];
    const MG=14, RH=7, HH=9;
    const cols=[
      {l:'#',w:10,a:'center'},
      {l:'Nombre',w:70,a:'left'},
      {l:'Inicio',w:22,a:'center'},
      {l:'Fin',w:22,a:'center'},
      {l:'Dur',w:14,a:'center'},
      {l:'Responsable',w:36,a:'left'},
      {l:'Estado',w:24,a:'center'},
      {l:'%',w:12,a:'center'},
    ];
    const avail=W-MG*2;
    const sc=avail/cols.reduce((s,c)=>s+c.w,0);
    cols.forEach(c=>c.w*=sc);

    const stLbl={pending:'Pendiente',in_progress:'En progreso',completed:'Completada',blocked:'Bloqueada'};
    const stClr={pending:[200,200,210],in_progress:[51,102,255],completed:[51,204,153],blocked:[255,51,102]};

    function hdr(y){
      pdf.setFillColor(...OR); pdf.rect(0,0,W,12,'F');
      pdf.setFont('helvetica','bold'); pdf.setFontSize(9); pdf.setTextColor(255,255,255);
      pdf.text(title+'  ·  Tabla de tareas',MG,8);
      pdf.setFontSize(7); pdf.text(today,W-MG,8,{align:'right'});
      pdf.setFillColor(...DK); pdf.rect(MG,y,avail,HH,'F');
      pdf.setFont('helvetica','bold'); pdf.setFontSize(7); pdf.setTextColor(255,255,255);
      let x=MG; cols.forEach(c=>{
        pdf.text(c.l,x+(c.a==='center'?c.w/2:2),y+HH-2.5,{align:c.a==='center'?'center':'left'});
        x+=c.w;
      });
      return y+HH;
    }

    let y=hdr(16), rn=0;
    tasks.forEach((t,i)=>{
      if(y+RH>H-14){ pdf.addPage(); y=hdr(16); }
      if(i%2===0){ pdf.setFillColor(249,249,252); pdf.rect(MG,y,avail,RH,'F'); }
      if(t._isSummary||t.hasChildren){ pdf.setFillColor(240,240,248); pdf.rect(MG,y,avail,RH,'F'); }
      rn++;
      const dur=t.start_date&&t.end_date
        ? (t.duration_mode==='corridos'
          ? Math.round((parseDate(t.end_date)-parseDate(t.start_date))/86400000)+1
          : Math.max(1,Math.round((parseDate(t.end_date)-parseDate(t.start_date))/86400000)))
        : 0;
      const cells=[
        rn,
        ('  '.repeat(Math.min(t.depth||0,3)))+(t._isSummary||t.hasChildren?'▸ ':'')+t.name,
        fmtDate(t.start_date), fmtDate(t.end_date),
        dur?(dur+(t.duration_mode==='corridos'?'dc':'dh')):'—',
        t._m?t._m.name.split(' ').slice(0,2).join(' '):'—',
        stLbl[t.status]||t.status||'—',
        (t.progress||0)+'%',
      ];
      let x=MG;
      cells.forEach((v,ci)=>{
        const c=cols[ci];
        pdf.setFont('helvetica',(t._isSummary||t.hasChildren)?'bold':'normal');
        pdf.setFontSize(6.5);
        if(ci===6){
          const sc=stClr[t.status]||[200,200,200];
          pdf.setFillColor(...sc); pdf.roundedRect(x+1,y+1.2,c.w-2,RH-2.5,1.5,1.5,'F');
          pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold');
        } else if(ci===7){
          const p=parseInt(v)/100;
          pdf.setFillColor(225,225,235); pdf.rect(x+1,y+2.5,c.w-2,2.5,'F');
          if(p>0){ pdf.setFillColor(51,204,153); pdf.rect(x+1,y+2.5,(c.w-2)*p,2.5,'F'); }
          pdf.setTextColor(50,50,80); pdf.setFontSize(5.5);
        } else {
          pdf.setTextColor(50,50,80);
        }
        const txt=pdf.splitTextToSize(String(v),c.w-3)[0]||'';
        pdf.text(txt,x+(c.a==='center'?c.w/2:2),y+RH-2,{align:c.a==='center'?'center':'left'});
        x+=c.w;
      });
      pdf.setDrawColor(225,225,235); pdf.setLineWidth(0.2);
      pdf.line(MG,y+RH,MG+avail,y+RH);
      y+=RH;
    });
    y+=5;
    pdf.setFont('helvetica','italic'); pdf.setFontSize(7); pdf.setTextColor(150,150,170);
    pdf.text(`${tasks.length} tarea${tasks.length!==1?'s':''}  ·  ${fmtDate(opts.dateFrom)} – ${fmtDate(opts.dateTo)}`,MG,y);
  }

  /* ─── GANTT ─── */
  function drawGantt(pdf,tasks,title,opts,today,W,H) {
    const OR=[251,117,32], DK=[28,28,61];
    const MGL=14, MGR=10, NC=72;
    const GX=MGL+NC+2, GW=W-GX-MGR;
    const RH=7, HH=9, TY=14, BP=1.5;

    const dF=parseDate(opts.dateFrom), dT=parseDate(opts.dateTo);
    const tot=Math.max(1,diffDays(dF,dT)+1);
    function xOf(ds){ const d=parseDate(ds); if(!d)return GX; return GX+Math.max(0,Math.min(tot,diffDays(dF,d)))/tot*GW; }
    const todayIso=new Date().toISOString().slice(0,10);

    function buildMarkers(sc){
      const marks=[]; let d=new Date(dF.getTime());
      if(sc==='week'){ const dw=d.getUTCDay()||7; d=addDays(d,-(dw-1)); }
      else if(sc==='month') d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1));
      else if(sc==='quarter'){ const q=Math.floor(d.getUTCMonth()/3); d=new Date(Date.UTC(d.getUTCFullYear(),q*3,1)); }
      else d=new Date(Date.UTC(d.getUTCFullYear(),0,1));
      while(d<=dT){
        const iso=d.toISOString().slice(0,10);
        const x=xOf(iso);
        if(x>=GX&&x<=GX+GW) marks.push({x,l:sc==='week'?weekLabel(d):sc==='month'?monthLabel(d):sc==='quarter'?quarterLabel(d):String(d.getUTCFullYear())});
        if(sc==='week') d=addDays(d,7);
        else if(sc==='month') d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1));
        else if(sc==='quarter') d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+3,1));
        else d=new Date(Date.UTC(d.getUTCFullYear()+1,0,1));
      }
      return marks;
    }
    const marks=buildMarkers(opts.scale);
    const avail=NC+GW+2;

    function hdr(){
      pdf.setFillColor(...OR); pdf.rect(0,0,W,12,'F');
      pdf.setFont('helvetica','bold'); pdf.setFontSize(9); pdf.setTextColor(255,255,255);
      pdf.text(title+'  ·  Diagrama de Gantt',MGL,8);
      pdf.setFontSize(7); pdf.text(today,W-MGR,8,{align:'right'});
      pdf.setFillColor(...DK); pdf.rect(MGL,TY,NC,HH,'F');
      pdf.setFont('helvetica','bold'); pdf.setFontSize(7); pdf.setTextColor(255,255,255);
      pdf.text('Tarea',MGL+2,TY+HH-2.5);
      pdf.setFillColor(...DK); pdf.rect(GX,TY,GW,HH,'F');
      pdf.setFontSize(6); 
      marks.forEach((mk,mi)=>{
        const nx=mi+1<marks.length?marks[mi+1].x:GX+GW;
        const lx=mk.x+(nx-mk.x)/2;
        if(lx>GX&&lx<GX+GW) pdf.text(mk.l,lx,TY+HH-2.5,{align:'center'});
        if(mi>0){ pdf.setDrawColor(80,80,110); pdf.setLineWidth(0.3); pdf.line(mk.x,TY,mk.x,TY+HH); }
      });
    }

    hdr();
    let y=TY+HH;
    const perPage=Math.floor((H-y-14)/RH);
    const pages=[];
    for(let i=0;i<tasks.length;i+=perPage) pages.push(tasks.slice(i,i+perPage));

    pages.forEach((pg,pi)=>{
      if(pi>0){
        pdf.addPage(); hdr(); y=TY+HH;
      }
      pg.forEach((t,i)=>{
        const ry=y+i*RH;
        const isSumm=t._isSummary||t.hasChildren;
        if(i%2===0){ pdf.setFillColor(248,248,252); pdf.rect(MGL,ry,avail,RH,'F'); }
        if(isSumm){ pdf.setFillColor(238,238,248); pdf.rect(MGL,ry,avail,RH,'F'); }
        marks.forEach((mk,mi)=>{
          if(mi>0){ pdf.setDrawColor(220,220,230); pdf.setLineWidth(0.15); pdf.line(mk.x,ry,mk.x,ry+RH); }
        });
        if(todayIso>=opts.dateFrom&&todayIso<=opts.dateTo){
          const tx=xOf(todayIso);
          pdf.setDrawColor(255,80,80); pdf.setLineWidth(0.4); pdf.line(tx,ry,tx,ry+RH);
        }
        const ind=Math.min(t.depth||0,4)*2;
        pdf.setFont('helvetica',isSumm?'bold':'normal');
        pdf.setFontSize(isSumm?6.5:6); pdf.setTextColor(28,28,61);
        const nm=pdf.splitTextToSize((isSumm?'▸ ':'')+t.name,NC-ind-3)[0]||'';
        pdf.text(nm,MGL+ind+2,ry+RH-2);
        if(t.start_date&&t.end_date){
          const x1=Math.max(GX,xOf(t.start_date));
          const x2=Math.min(GX+GW,xOf(t.end_date));
          const bw=Math.max(1,x2-x1);
          const rgb=hexToRgb(t.bar_color||(isSumm?'#28283D':'#1d4ed8'));
          if(t.is_milestone||t.start_date===t.end_date){
            const mx=xOf(t.start_date), my=ry+RH/2, s=2.5;
            pdf.setFillColor(...rgb);
            pdf.triangle(mx,my-s,mx+s,my,mx,my+s,'F');
            pdf.triangle(mx,my-s,mx-s,my,mx,my+s,'F');
          } else {
            pdf.setFillColor(...lighten(rgb,.55));
            pdf.roundedRect(x1,ry+BP,bw,RH-BP*2,1,1,'F');
            const p=(t.progress||0)/100;
            if(p>0){ pdf.setFillColor(...rgb); pdf.roundedRect(x1,ry+BP,Math.max(1.5,bw*p),RH-BP*2,1,1,'F'); }
            pdf.setDrawColor(...rgb); pdf.setLineWidth(0.3);
            pdf.roundedRect(x1,ry+BP,bw,RH-BP*2,1,1,'S');
            if(bw>16){
              pdf.setFont('helvetica','bold'); pdf.setFontSize(5);
              const lum=(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000;
              pdf.setTextColor(lum>140?40:255,lum>140?40:255,lum>140?60:255);
              pdf.text(pdf.splitTextToSize(t.name,bw-3)[0]||'',x1+bw/2,ry+RH/2+1.5,{align:'center'});
            }
          }
        }
        pdf.setDrawColor(220,220,230); pdf.setLineWidth(0.15);
        pdf.line(MGL,ry+RH,MGL+avail,ry+RH);
      });
      y=TY+HH; // reset for next page rows
    });

    pdf.setFont('helvetica','italic'); pdf.setFontSize(6.5); pdf.setTextColor(160,160,180);
    pdf.text(`${fmtDate(opts.dateFrom)} – ${fmtDate(opts.dateTo)}  ·  Escala: ${{week:'Semanal',month:'Mensual',quarter:'Trimestral',year:'Anual'}[opts.scale]}  ·  Buildplan 360`,
      W/2,H-5,{align:'center'});
  }

  /* ══ PARCHEAR BOTÓN ══════════════════════════════════ */
  let _patched = false;

  function patchBtn() {
    if (_patched) return;
    const btn = document.getElementById('p360-export-btn');
    if (!btn) return;
    _patched = true;

    const nb = btn.cloneNode(true);
    btn.parentNode.replaceChild(nb, btn);
    nb.id = 'p360-export-btn';
    nb.innerHTML = '📄 Exportar PDF';
    nb.title = 'Exportar cronograma a PDF con opciones';

    nb.addEventListener('click', () => {
      const store = getStore();
      if (!store?.currentProject) {
        alert('Abrí un proyecto primero.');
        return;
      }
      showExportDialog(store);
    });
  }

  // Observer debounced — solo sobre toolbar para detectar el botón
  let _pTimer = null;
  const pObs = new MutationObserver(() => {
    if (_patched) { pObs.disconnect(); return; }
    clearTimeout(_pTimer);
    _pTimer = setTimeout(patchBtn, 300);
  });
  pObs.observe(document.body, { childList: true, subtree: true });
  setTimeout(patchBtn, 1500);

})();
