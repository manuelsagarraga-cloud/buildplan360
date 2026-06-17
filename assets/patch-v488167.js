/**
 * Pipeline360 — patch.js v6
 *  - Timeline lane packing
 *  - Range date persistence (FIX: sin loops de re-render)
 *  - Inline editing
 *  - Splitter vertical
 *  - Section controls (Todo / Timeline / Gantt)
 */
(function () {
  'use strict';

  function onMut(el, cb, opts) {
    const o = new MutationObserver(cb);
    o.observe(el, opts || { childList: true, subtree: true });
    return o;
  }

  /* ══════════════════════════════════════════════════════
     1. TIMELINE LANE PACKING
  ══════════════════════════════════════════════════════ */
  const LANE_H = 42;

  /* ──────────────────────────────────────────────────────
     TIMELINE BAR DRAG — mover tareas arrastrando en la escala
  ────────────────────────────────────────────────────── */

  // Identifies the task pinned in a timeline bar by reading its inner content
  function findTaskByBarText(barEl) {
    const name = barEl.querySelector('.timeline-bar-name')?.textContent?.trim();
    if (!name) return null;
    // Find through the React store via getSB() approach won't work easily;
    // We use a direct supabase query by name AND project
    return null; // Will be matched via task_id stored in our drag setup
  }

  async function getPinnedTasks() {
    const sb = getSB();
    if (!sb) return [];
    const projTitle = document.querySelector('.ph-title')?.textContent?.trim();
    // Get all tasks pinned to timeline in current project
    const { data: projects } = await sb.from('projects').select('id,name');
    const proj = projects?.find(p => p.name === projTitle);
    if (!proj) return [];
    const { data } = await sb.from('tasks').select('*').eq('project_id', proj.id).eq('pinned_to_timeline', true);
    return data || [];
  }

  let _pinnedCache = null;
  async function refreshPinnedCache() {
    _pinnedCache = await getPinnedTasks();
    return _pinnedCache;
  }

  // Match timeline bars to tasks by name (rendered by React from pinned tasks)
  async function attachTimelineBarDrag(barEl) {
    if (barEl._dragHooked) return;
    barEl._dragHooked = true;

    const name = barEl.querySelector('.timeline-bar-name')?.textContent?.trim();
    if (!name) return;

    if (!_pinnedCache) await refreshPinnedCache();
    const task = _pinnedCache.find(t => t.name === name);
    if (!task) return;
    barEl.dataset.taskId = task.id;

    // Cursor change
    barEl.style.cursor = 'grab';

    // Get timeline track dimensions to calculate days/pixel ratio
    function getDayPx() {
      const track = barEl.closest('.timeline-bar-track');
      if (!track) return null;
      const trackWidth = track.getBoundingClientRect().width;
      // Get date range from the visible Desde/Hasta inputs
      const proxies = document.querySelectorAll('.timeline-scale-header input.p360-date-proxy');
      const fallback = document.querySelectorAll('.timeline-scale-header input[type="date"].timeline-range-input');
      const inputs = proxies.length >= 2 ? proxies : fallback;
      if (inputs.length < 2) return null;
      const from = new Date(inputs[0].value);
      const to   = new Date(inputs[1].value);
      const totalDays = Math.max(1, (to - from) / 86400000);
      return { dayPx: trackWidth / totalDays, fromDate: from };
    }

    let dragMode = null; // 'move' | 'resize-start' | 'resize-end'
    let startX, origStart, origEnd, dayPx, fromDate;

    // Add resize handles on hover
    const resizeLeft = document.createElement('div');
    resizeLeft.className = 'p360-bar-resize p360-bar-resize-l';
    resizeLeft.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:6px;cursor:ew-resize;background:rgba(0,0,0,0.15);z-index:5;opacity:0;transition:opacity .15s';
    const resizeRight = document.createElement('div');
    resizeRight.className = 'p360-bar-resize p360-bar-resize-r';
    resizeRight.style.cssText = 'position:absolute;right:0;top:0;bottom:0;width:6px;cursor:ew-resize;background:rgba(0,0,0,0.15);z-index:5;opacity:0;transition:opacity .15s';
    barEl.appendChild(resizeLeft);
    barEl.appendChild(resizeRight);
    barEl.addEventListener('mouseenter', () => { resizeLeft.style.opacity = '1'; resizeRight.style.opacity = '1'; });
    barEl.addEventListener('mouseleave', () => { resizeLeft.style.opacity = '0'; resizeRight.style.opacity = '0'; });

    const startDrag = (e, mode) => {
      if (e.button !== 0) return;  // only left click
      e.preventDefault();
      e.stopPropagation();
      const dims = getDayPx();
      if (!dims) return;
      // Click vs drag detection threshold
      let hasMoved = false;
      const initialX = e.clientX, initialY = e.clientY;
      dragMode = mode;
      startX = e.clientX;
      origStart = new Date(task.start_date);
      origEnd = new Date(task.end_date);
      dayPx = dims.dayPx;
      fromDate = dims.fromDate;
      barEl.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
      barEl.style.opacity = '0.7';
      document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
      document.body.style.userSelect = 'none';

      const onMove = (e2) => {
        if (!hasMoved) {
          const dx = Math.abs(e2.clientX - initialX);
          const dy = Math.abs(e2.clientY - initialY);
          if (dx < 4 && dy < 4) return; // not yet moved enough
          hasMoved = true;
        }
        const dxPx = e2.clientX - startX;
        const dxDays = Math.round(dxPx / dayPx);
        if (dragMode === 'move') {
          const newStart = new Date(origStart); newStart.setDate(newStart.getDate() + dxDays);
          const newEnd   = new Date(origEnd);   newEnd.setDate(newEnd.getDate() + dxDays);
          const track = barEl.closest('.timeline-bar-track');
          if (track) {
            const trackW = track.getBoundingClientRect().width;
            const newLeftPx = ((newStart - fromDate) / 86400000) * dayPx;
            barEl.style.left = (newLeftPx / trackW * 100) + '%';
          }
          barEl.dataset._newStart = newStart.toISOString().slice(0,10);
          barEl.dataset._newEnd   = newEnd.toISOString().slice(0,10);
        } else if (dragMode === 'resize-start') {
          const newStart = new Date(origStart); newStart.setDate(newStart.getDate() + dxDays);
          if (newStart >= origEnd) return;
          const track = barEl.closest('.timeline-bar-track');
          if (track) {
            const trackW = track.getBoundingClientRect().width;
            const newLeftPx = ((newStart - fromDate) / 86400000) * dayPx;
            const newWidthPx = ((origEnd - newStart) / 86400000) * dayPx;
            barEl.style.left = (newLeftPx / trackW * 100) + '%';
            barEl.style.width = (newWidthPx / trackW * 100) + '%';
          }
          barEl.dataset._newStart = newStart.toISOString().slice(0,10);
        } else if (dragMode === 'resize-end') {
          const newEnd = new Date(origEnd); newEnd.setDate(newEnd.getDate() + dxDays);
          if (newEnd <= origStart) return;
          const track = barEl.closest('.timeline-bar-track');
          if (track) {
            const trackW = track.getBoundingClientRect().width;
            const newWidthPx = ((newEnd - origStart) / 86400000) * dayPx;
            barEl.style.width = (newWidthPx / trackW * 100) + '%';
          }
          barEl.dataset._newEnd = newEnd.toISOString().slice(0,10);
        }
      };

      const onUp = async () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        barEl.style.opacity = '';
        barEl.style.cursor = 'grab';

        if (!hasMoved) {
          // Treat as click — open task modal via simulated click
          dragMode = null;
          return;
        }
        const newStart = barEl.dataset._newStart;
        const newEnd   = barEl.dataset._newEnd;
        const sb = getSB();
        if (!sb) return;

        const patch = {};
        if (dragMode !== 'resize-end' && newStart) patch.start_date = newStart;
        if (dragMode !== 'resize-start' && newEnd) patch.end_date = newEnd;
        if (Object.keys(patch).length === 0) { dragMode = null; return; }

        const { error } = await sb.from('tasks').update(patch).eq('id', task.id);
        if (error) {
          console.error('Drag save error:', error);
          // Revert UI
          barEl.style.left = ''; barEl.style.width = '';
        } else {
          // Update cached task
          if (patch.start_date) task.start_date = patch.start_date;
          if (patch.end_date)   task.end_date   = patch.end_date;
        }
        dragMode = null;
        delete barEl.dataset._newStart;
        delete barEl.dataset._newEnd;
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    resizeLeft.addEventListener('mousedown',  e => startDrag(e, 'resize-start'));
    resizeRight.addEventListener('mousedown', e => startDrag(e, 'resize-end'));
    barEl.addEventListener('mousedown', e => {
      if (e.target === resizeLeft || e.target === resizeRight) return;
      startDrag(e, 'move');
    });
  }

  function watchTimelineBarsForDrag() {
    // Refresh pinned cache when project changes
    _pinnedCache = null;
    onMut(document.body, muts => {
      muts.forEach(m => {
        m.addedNodes.forEach(n => {
          if (!n || n.nodeType !== 1) return;
          if (n.classList?.contains('timeline-bar')) {
            attachTimelineBarDrag(n);
          }
          n.querySelectorAll?.('.timeline-bar:not(.timeline-bar-milestone)').forEach(b => attachTimelineBarDrag(b));
        });
      });
    });
    // Initial scan
    setTimeout(() => {
      document.querySelectorAll('.timeline-bar:not(.timeline-bar-milestone)').forEach(b => attachTimelineBarDrag(b));
    }, 1500);
  }


  function packLanes(container) {
    const rows = Array.from(container.querySelectorAll(':scope > .timeline-bar-row'));
    if (!rows.length) return;
    const items = rows.map(row => {
      const bar = row.querySelector('.timeline-bar, .timeline-bar-milestone');
      const left = bar ? (parseFloat(bar.style.left) || 0) : 0;
      const w    = bar ? (parseFloat(bar.style.width) || 0) : 0;
      return { row, left, right: left + Math.max(w, 1.5) };
    });
    const laneEnd = [];
    const laneOf = items.map(item => {
      for (let i = 0; i < laneEnd.length; i++) {
        if (item.left >= laneEnd[i] + 0.5) { laneEnd[i] = item.right; return i; }
      }
      laneEnd.push(item.right);
      return laneEnd.length - 1;
    });
    const totalH = Math.max(LANE_H, laneEnd.length * LANE_H);
    container.style.cssText += `;position:relative;height:${totalH}px;min-height:${totalH}px`;
    items.forEach((item, i) => {
      item.row.style.cssText += `;position:absolute;top:${laneOf[i]*LANE_H}px;left:0;right:0;height:${LANE_H}px;margin:0`;
    });
    const body = container.closest('.timeline-scale-body');
    if (body) body.style.minHeight = (totalH + 40) + 'px';
  }

  function watchTimelineBars() {
    onMut(document.body, muts => {
      muts.forEach(m => {
        const check = el => {
          if (!el || el.nodeType !== 1) return;
          const targets = el.classList?.contains('timeline-bars') ? [el]
            : Array.from(el.querySelectorAll?.('.timeline-bars') || []);
          targets.forEach(tb => {
            if (tb._packed) return;
            tb._packed = true;
            packLanes(tb);
            // Re-pack ON STYLE CHANGE of inner bars only, with debounce
            let scheduled = false;
            onMut(tb, () => {
              if (scheduled) return;
              scheduled = true;
              requestAnimationFrame(() => {
                scheduled = false;
                packLanes(tb);
              });
            }, { childList:true, subtree:true, attributes:true, attributeFilter:['style'] });
          });
        };
        check(m.target);
        m.addedNodes.forEach(n => check(n));
      });
    });
  }

  /* ─── Range date persistence — VERSIÓN SEGURA ─── */
  /* PROBLEMA ANTERIOR: el listener change disparaba dispatchEvent que volvía
     a entrar en el ciclo, causando freeze. Solución: usar input passive,
     leer SOLO en el primer mount, y NO dispatchear eventos artificiales. */
  const LS_PFX = 'p360_tl_';
  function projKey() {
    const t = document.querySelector('.ph-title');
    return LS_PFX + (t ? t.textContent.trim().slice(0,40).replace(/\W+/g,'_') : 'def');
  }

  function saveRange(f,t) {
    try { localStorage.setItem(projKey(), JSON.stringify({f,t})); } catch(e){}
  }
  function loadRange() {
    try { const r = localStorage.getItem(projKey()); return r ? JSON.parse(r) : null; } catch(e){ return null; }
  }
  function clearRange() {
    try { localStorage.removeItem(projKey()); } catch(e){}
  }

  /**
   * Persistencia simple del rango de fechas en localStorage.
   * Sin proxy ni reemplazos — solo guardar al cambio confirmado.
   */
  function hookRangeInputs() {
    const inputs = document.querySelectorAll('.timeline-scale-header input[type="date"].timeline-range-input');
    inputs.forEach(inp => {
      if (inp._p360hooked) return;
      inp._p360hooked = true;
      // Solo guardar cuando el navegador dispara 'change' (que es DESPUÉS de blur/Enter)
      inp.addEventListener('change', () => {
        const all = document.querySelectorAll('.timeline-scale-header input[type="date"].timeline-range-input');
        if (all.length >= 2) saveRange(all[0].value, all[1].value);
      }, { passive: true });
    });

    const resetBtn = document.querySelector('.timeline-scale-header .timeline-range-reset');
    if (resetBtn && !resetBtn._p360hooked) {
      resetBtn._p360hooked = true;
      resetBtn.addEventListener('click', () => clearRange(), { passive: true });
    }
  }

  /* ══════════════════════════════════════════════════════
     2. INLINE EDITING — sin cambios respecto a v5
  ══════════════════════════════════════════════════════ */
  let _sb = null;
  function getSB() {
    if (_sb) return _sb;
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
    _sb = walk(root[fk], 0);
    return _sb;
  }

  async function saveTaskField(taskId, field, value) {
    const sb = getSB();
    if (!sb) return false;
    const patch = { [field]: value };
    if (field === 'progress') patch[field] = parseInt(value) || 0;
    const { error } = await sb.from('tasks').update(patch).eq('id', taskId);
    if (error) { console.error('p360 inline save:', error); return false; }
    return true;
  }

  // Helpers for predecessor parsing (same format as task modal: "3FC;5CC;7FF+2d")
  const DEP_TYPES = { FC: 'finish_to_start', CC: 'start_to_start', FF: 'finish_to_finish', CF: 'start_to_finish' };

  async function saveTaskPredecessors(taskId, predStr) {
    const sb = getSB();
    if (!sb) return false;
    // Get all tasks sorted by order_index (matching the row #)
    const { data: allTasks } = await sb.from('tasks').select('id,order_index').order('order_index');
    if (!allTasks) return false;
    // Delete existing dependencies for this task
    await sb.from('task_dependencies').delete().eq('successor_id', taskId);
    if (!predStr || !predStr.trim()) return true;
    // Parse and insert new ones
    const parts = predStr.split(';').map(s => s.trim()).filter(Boolean);
    const inserts = [];
    for (const p of parts) {
      const m = p.match(/^(\d+)(FC|CC|FF|CF)?(([+-]\d+)d)?$/);
      if (!m) continue;
      const rowNum = parseInt(m[1]);
      const type = DEP_TYPES[m[2] || 'FC'];
      const lag = m[3] ? parseInt(m[3]) : 0;
      const pred = allTasks[rowNum - 1];
      if (!pred) continue;
      inserts.push({ predecessor_id: pred.id, successor_id: taskId, dependency_type: type, lag_days: lag });
    }
    if (inserts.length) {
      const { error } = await sb.from('task_dependencies').insert(inserts);
      if (error) { console.error(error); return false; }
    }
    return true;
  }

  function calcEndDate(startDate, days) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + parseInt(days));
    return d.toISOString().slice(0, 10);
  }

  function daysBetween(startDate, endDate) {
    const ms = new Date(endDate) - new Date(startDate);
    return Math.round(ms / 86400000);
  }

  function isFeriado(iso) { return !!(window._p360feriados && window._p360feriados.has(iso)); }
  function isHabil(d) { const w = d.getUTCDay(); return w !== 0 && w !== 6 && !isFeriado(d.toISOString().slice(0, 10)); }
  function businessDaysInclusive(startDate, endDate) {
    const s = new Date(startDate + 'T00:00:00Z'), e = new Date(endDate + 'T00:00:00Z');
    if (isNaN(s) || isNaN(e) || e < s) return 0;
    let n = 0; const d = new Date(s.getTime());
    while (d <= e) { if (isHabil(d)) n++; d.setUTCDate(d.getUTCDate() + 1); }
    return n;
  }
  function addBusinessDays(startDate, nDays) {
    // Devuelve la fecha fin tal que [start..fin] contiene nDays días hábiles
    const d = new Date(startDate + 'T00:00:00Z');
    if (isNaN(d) || nDays <= 0) return startDate;
    let count = isHabil(d) ? 1 : 0;
    let guard = 0;
    while (count < nDays && guard++ < 20000) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (isHabil(d)) count++;
    }
    return d.toISOString().slice(0, 10);
  }

  window._p360inlineEdit = function(cell, taskId, field, currentVal) {
    clearTimeout(window._p360rowT);
    if (cell._editing) return;
    cell._editing = true;
    const orig = cell.innerHTML;
    const origPadding = cell.style.padding;
    cell.style.padding = '0';
    const close = (save) => {
      cell._editing = false;
      cell.style.padding = origPadding;
      if (!save) cell.innerHTML = orig;
    };
    let input;
    if (field === 'duration') {
      // currentVal = { start_date, end_date, duration_mode }
      const mode = currentVal.duration_mode === 'corridos' ? 'corridos' : 'habiles';
      const days = mode === 'corridos'
        ? (daysBetween(currentVal.start_date, currentVal.end_date) + 1)
        : businessDaysInclusive(currentVal.start_date, currentVal.end_date);
      input = document.createElement('input');
      input.type = 'number'; input.min = '0'; input.max = '9999';
      input.value = days;
      input.style.cssText = 'width:100%;height:100%;border:none;background:var(--surface);font:inherit;font-size:10px;color:var(--text);outline:none;padding:0 4px;box-shadow:inset 0 0 0 1.5px var(--brand-orange);border-radius:3px;text-align:center;font-family:JetBrains Mono,monospace';
      const commit = async () => {
        if (!cell._editing) return;
        const newDays = parseInt(input.value);
        if (isNaN(newDays) || newDays < 0) return close(false);
        const newEnd = mode === 'corridos'
          ? calcEndDate(currentVal.start_date, Math.max(0, newDays - 1))
          : addBusinessDays(currentVal.start_date, newDays);
        close(true);
        const ok = await saveTaskField(taskId, 'end_date', newEnd);
        if (ok) {
          const txt = document.createTextNode(newDays + (mode === 'corridos' ? 'dc' : 'dh'));
          cell.innerHTML = ''; cell.appendChild(txt);
        }
      };
      input.onkeydown = (e) => {
        if (e.key === 'Escape') return close(false);
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
      };
      input.onblur = commit;
    } else if (field === 'predecessors') {
      input = document.createElement('input');
      input.type = 'text';
      input.value = currentVal || '';
      input.placeholder = 'Ej: 3FC;5CC';
      input.style.cssText = 'width:100%;height:100%;border:none;background:var(--surface);font:inherit;font-size:9px;color:var(--text);outline:none;padding:0 4px;box-shadow:inset 0 0 0 1.5px var(--brand-orange);border-radius:3px;font-family:JetBrains Mono,monospace';
      const commit = async () => {
        if (!cell._editing) return;
        const v = input.value.trim();
        close(true);
        const ok = await saveTaskPredecessors(taskId, v);
        if (ok) {
          const span = document.createElement('span');
          span.style.fontSize = '9px';
          span.textContent = v || '—';
          cell.innerHTML = ''; cell.appendChild(span);
        }
      };
      input.onkeydown = (e) => {
        if (e.key === 'Escape') return close(false);
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
      };
      input.onblur = commit;
    } else if (field === 'progress') {
      input = document.createElement('input');
      input.type = 'number'; input.min = '0'; input.max = '100';
      input.value = currentVal;
      input.style.cssText = 'width:100%;height:100%;border:none;background:var(--surface);font:inherit;font-size:11px;color:var(--text);outline:none;padding:0 4px;box-shadow:inset 0 0 0 1.5px var(--brand-orange);border-radius:3px;text-align:center';
      input.onkeydown = async e => {
        if (e.key === 'Escape') return close(false);
        if (e.key === 'Enter') {
          const v = Math.max(0, Math.min(100, parseInt(input.value) || 0));
          close(true);
          const ok = await saveTaskField(taskId, field, v);
          if (ok) {
            const span = document.createElement('span');
            span.className = 'pct'; span.style.fontSize = '10px'; span.textContent = v;
            cell.innerHTML = ''; cell.appendChild(span);
          }
        }
      };
      input.onblur = async () => {
        if (!cell._editing) return;
        const v = Math.max(0, Math.min(100, parseInt(input.value) || 0));
        close(true);
        await saveTaskField(taskId, field, v);
        const span = document.createElement('span');
        span.className = 'pct'; span.style.fontSize = '10px'; span.textContent = v;
        cell.innerHTML = ''; cell.appendChild(span);
      };
    } else if (field === 'start_date' || field === 'end_date') {
      input = document.createElement('input');
      input.type = 'date'; input.value = currentVal || '';
      input.style.cssText = 'width:100%;height:24px;border:none;background:var(--surface);font:inherit;font-size:10px;color:var(--text);outline:none;padding:0 4px;box-shadow:inset 0 0 0 1.5px var(--brand-orange);border-radius:3px';
      input.onchange = async () => {
        const v = input.value;
        close(true);
        const ok = await saveTaskField(taskId, field, v);
        if (ok) {
          const span = document.createElement('span');
          span.className = 'date'; span.style.fontSize = '9px';
          const [y,m,d] = v.split('-');
          span.textContent = `${d}/${m}/${y.slice(2)}`;
          cell.innerHTML = ''; cell.appendChild(span);
        }
      };
      input.onkeydown = e => { if (e.key === 'Escape') close(false); };
      input.onblur = () => { if (cell._editing) close(false); };
    }
    if (input) {
      cell.innerHTML = '';
      cell.appendChild(input);
      setTimeout(() => input.focus(), 20);
    }
  };

  /* ══════════════════════════════════════════════════════
     3. SPLITTER + SECTION CONTROLS
  ══════════════════════════════════════════════════════ */
  function injectSectionControls() {
    const timeline = document.querySelector('.timeline-scale');
    if (!timeline) return;

    const container = timeline.parentElement;
    if (!container || container._p360sections) return;
    container._p360sections = true;

    // ── Splitter (drag handle) ──
    if (!container.querySelector('.p360-vsplitter')) {
      const sp = document.createElement('div');
      sp.className = 'p360-vsplitter';
      sp.title = 'Arrastrá para redimensionar';
      timeline.after(sp);

      let startY, startH;
      sp.addEventListener('mousedown', e => {
        e.preventDefault();
        startY = e.clientY;
        startH = timeline.getBoundingClientRect().height;
        sp.classList.add('dragging');
        document.body.style.cssText += ';cursor:ns-resize;user-select:none';
        const mv = e2 => {
          const h = Math.max(60, Math.min(window.innerHeight * 0.85, startH + e2.clientY - startY));
          timeline.style.maxHeight = h + 'px';
          timeline.style.height = h + 'px';
        };
        const up = () => {
          sp.classList.remove('dragging');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
          // Re-pack ONCE after drag ends
          document.querySelectorAll('.timeline-bars').forEach(tb => packLanes(tb));
        };
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
      });
    }

    // ── Section toggle bar (encima del timeline) ──
    if (!container.querySelector('.p360-section-toggle')) {
      const bar = document.createElement('div');
      bar.className = 'p360-section-toggle';
      bar.innerHTML = `
        <span>📐 Vista</span>
        <span class="p360-section-toggle-actions">
          <button data-mode="full" class="active" title="Mostrar todo">⬛⬛ Todo</button>
          <button data-mode="tl-only" title="Solo escala de tiempo">⬛ Timeline</button>
          <button data-mode="gantt-only" title="Solo Gantt">Gantt ⬛</button>
        </span>`;
      container.insertBefore(bar, timeline);

      bar.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.mode;
          container.classList.remove('p360-tl-only', 'p360-gantt-only');
          if (mode === 'tl-only')   container.classList.add('p360-tl-only');
          if (mode === 'gantt-only') container.classList.add('p360-gantt-only');
          if (mode !== 'full') {
            timeline.style.maxHeight = '';
            timeline.style.height = '';
          }
          bar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          // Re-pack one time
          setTimeout(() => {
            document.querySelectorAll('.timeline-bars').forEach(tb => { tb._packed = false; packLanes(tb); });
          }, 100);
        });
      });
    }
  }

  /* ══════════════════════════════════════════════════════
     4. SCROLL MAIN-CONTENT
  ══════════════════════════════════════════════════════ */
  function fixMainScroll() {
    const mc = document.querySelector('.main-content');
    if (!mc) return;
    if (mc._scrollFixed) return;
    mc._scrollFixed = true;
    onMut(mc, () => {
      const isHome  = mc.querySelector('.home-page, .projects-page, .resources-page');
      const isGantt = mc.querySelector('.gantt-split, .left-pane');
      if (isHome)        mc.style.overflowY = 'auto';
      else if (isGantt)  mc.style.overflowY = 'hidden';
    }, { childList: true });
  }

  /* ══════════════════════════════════════════════════════
     WATCHERS + INIT
     DEBOUNCED para evitar loops infinitos
  ══════════════════════════════════════════════════════ */
  let _hookScheduled = false;
  function scheduleHook() {
    if (_hookScheduled) return;
    _hookScheduled = true;
    requestAnimationFrame(() => {
      _hookScheduled = false;
      injectSectionControls();
      hookRangeInputs();
      hookKanbanDrag();
      hideEmpresaSelectors();
    });
  }

  onMut(document.body, scheduleHook, { childList: true, subtree: true });



  /* ──────────────────────────────────────────────────────
     KANBAN DRAG & DROP — arrastrar tareas entre columnas
  ────────────────────────────────────────────────────── */
  const KANBAN_STATUS = ['pending', 'in_progress', 'blocked', 'completed'];

  function hookKanbanDrag() {
    document.querySelectorAll('.kanban-card:not([data-drag-hooked])').forEach(card => {
      card.dataset.dragHooked = '1';
      card.draggable = true;
      card.style.cursor = 'grab';

      card.addEventListener('dragstart', e => {
        // Get task name from card title to look it up
        const name = card.querySelector('.kanban-card-title')?.textContent?.trim();
        card.dataset.taskName = name || '';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', name || '');
        card.style.opacity = '0.4';
        card.style.cursor = 'grabbing';
        // Prevent click event from opening modal during drag
        card._dragging = true;
      });

      card.addEventListener('dragend', () => {
        card.style.opacity = '';
        card.style.cursor = 'grab';
        setTimeout(() => { card._dragging = false; }, 100);
      });

      // Block click during drag
      card.addEventListener('click', e => {
        if (card._dragging) {
          e.stopPropagation();
          e.preventDefault();
        }
      }, true);
    });

    document.querySelectorAll('.kanban-col:not([data-drop-hooked])').forEach((col, idx) => {
      col.dataset.dropHooked = '1';
      // Determine target status from column order (matches KANBAN_STATUS array)
      const allCols = document.querySelectorAll('.kanban-col');
      const colIndex = Array.from(allCols).indexOf(col);
      const targetStatus = KANBAN_STATUS[colIndex];

      col.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.style.background = 'var(--brand-orange-bg, rgba(251,117,32,0.1))';
      });
      col.addEventListener('dragleave', () => {
        col.style.background = '';
      });
      col.addEventListener('drop', async e => {
        e.preventDefault();
        col.style.background = '';
        const name = e.dataTransfer.getData('text/plain');
        if (!name || !targetStatus) return;
        const sb = getSB();
        if (!sb) return;
        // Find task by name in current project
        const projTitle = document.querySelector('.ph-title')?.textContent?.trim();
        const { data: projects } = await sb.from('projects').select('id,name');
        const proj = projects?.find(p => p.name === projTitle);
        if (!proj) return;
        const { data: tasks } = await sb.from('tasks').select('id,name,status').eq('project_id', proj.id).eq('name', name);
        if (!tasks || tasks.length === 0) return;
        const task = tasks[0];
        if (task.status === targetStatus) return;
        const { error } = await sb.from('tasks').update({ status: targetStatus, progress: targetStatus === 'completed' ? 100 : undefined }).eq('id', task.id);
        if (!error) {
          // Trigger reload by simulating navigation
          document.dispatchEvent(new CustomEvent('p360:taskUpdated', { detail: { taskId: task.id, field: 'status', value: targetStatus } }));
          // Force a UI refresh by toggling something
          setTimeout(() => location.reload(), 300);
        }
      });
    });
  }


  /* ─── EMPRESA ÚNICA — Ocultar form-group de Empresa ─── */
  function hideEmpresaSelectors() {
    // En modales: buscar form-group cuyo label diga "Empresa" o "Empresa *"
    document.querySelectorAll('.form-group').forEach(g => {
      const label = g.querySelector('label.form-label');
      if (!label) return;
      const txt = label.textContent.trim().toLowerCase();
      if (txt === 'empresa' || txt === 'empresa *' || txt.startsWith('empresa ')) {
        g.style.display = 'none';
      }
    });
    // En la lista de proyectos: ocultar columna "Empresa"
    document.querySelectorAll('.pc-col-company, .company-filter').forEach(el => {
      el.style.display = 'none';
    });
  }




  /* ──────────────────────────────────────────────────────
     INLINE EDIT — Tableros / Rubro / Contratista (combobox)
     Cada cell es texto libre PERO sugiere opciones existentes
     en otras tareas del mismo proyecto.
  ────────────────────────────────────────────────────── */
  window._p360inlineEditOption = async function(cell, taskId, field, currentVal) {
    clearTimeout(window._p360rowT);
    if (cell._editing) return;
    cell._editing = true;

    const orig = cell.innerHTML;
    const origPadding = cell.style.padding;
    cell.style.padding = '0';
    cell.style.position = 'relative';

    const close = (save) => {
      cell._editing = false;
      cell.style.padding = origPadding;
      if (!save) cell.innerHTML = orig;
    };

    // Gather existing options from supabase (distinct values of this field)
    let options = [];
    try {
      const sb = getSB();
      if (sb) {
        const { data } = await sb.from('tasks').select(field).not(field, 'is', null);
        const seen = new Set();
        (data || []).forEach(t => {
          const v = (t[field] || '').trim();
          if (v && !seen.has(v.toLowerCase())) {
            seen.add(v.toLowerCase());
            options.push(v);
          }
        });
        options.sort((a,b) => a.localeCompare(b));
      }
    } catch (e) { console.warn('option fetch:', e); }

    // Build datalist for autocomplete
    const listId = 'p360-dl-' + field + '-' + Date.now();
    const dl = document.createElement('datalist');
    dl.id = listId;
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      dl.appendChild(o);
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentVal || '';
    input.setAttribute('list', listId);
    input.placeholder = 'Escribí o elegí...';
    input.style.cssText = 'width:100%;height:100%;border:none;background:var(--surface);font:inherit;font-size:10px;color:var(--text);outline:none;padding:0 4px;box-shadow:inset 0 0 0 1.5px var(--brand-orange);border-radius:3px';

    const commit = async (val) => {
      if (!cell._editing) return;
      const v = (val !== undefined ? val : input.value).trim();
      close(true);
      const ok = await saveTaskField(taskId, field, v || null);
      if (ok) {
        cell.textContent = v;
        cell.title = v;
      }
    };

    input.onkeydown = (e) => {
      if (e.key === 'Escape') return close(false);
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
    };
    input.onblur = () => { if (cell._editing) commit(); };

    cell.innerHTML = '';
    cell.appendChild(input);
    cell.appendChild(dl);
    setTimeout(() => { try { input.focus(); input.select(); } catch(e){} }, 20);
  };

  function init() {
    watchTimelineBars();
    watchTimelineBarsForDrag();
    fixMainScroll();
    injectSectionControls();
    hookRangeInputs();
    hookKanbanDrag();
    hideEmpresaSelectors();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

})();
