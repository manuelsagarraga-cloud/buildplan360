/**
 * Buildplan 360 (Pipeline360) — p360-sb-bootstrap-v1.js
 * ---------------------------------------------------------------------------
 * OBJETIVO
 *   Encontrar el cliente de Supabase UNA SOLA VEZ, apenas la app monta, y
 *   dejarlo en window._p360sb. A partir de ahí, TODOS los parches lo toman
 *   directo de ahí y ya no tienen que recorrer el árbol interno de React
 *   (los "fibers") cada uno por su cuenta.
 *
 * POR QUÉ
 *   Hoy cada parche busca el cliente recorriendo React. Es la dependencia más
 *   frágil del sistema: si algún día se recompila el núcleo, esa búsqueda se
 *   rompe en varios parches a la vez. Centralizándola acá, si eso pasa, se
 *   arregla en UN solo archivo en vez de diez.
 *
 * IMPORTANTE
 *   - Reutiliza el MISMO cliente que ya creó el bundle (no crea uno nuevo),
 *     así que no hay riesgo de dos sesiones de login peleándose.
 *   - Este script debe cargarse PRIMERO, antes que el resto de los parches.
 *   - Es idempotente: si el cliente ya está, no hace nada.
 *
 * REGALO PARA EL FUTURO
 *   Expone window._p360whenSB(cb): una forma limpia de que cualquier parche
 *   nuevo espere el cliente sin volver a tocar los fibers. Ejemplo:
 *       window._p360whenSB(function (sb) { sb.from('projects').select('*')... });
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  // Si otro script ya lo dejó listo, no duplicamos trabajo.
  if (window._p360sb && typeof window._p360sb.from === 'function') {
    flush(window._p360sb);
    return;
  }

  var TIMEOUT_MS = 30000;   // hasta cuánto seguimos intentando (la app puede tardar en montar)
  var INTERVAL_MS = 200;    // cada cuánto reintentamos
  var _callbacks = [];      // quienes esperan el cliente vía _p360whenSB
  var _done = false;
  var _t0 = Date.now();

  /* ── Detección: ¿este objeto es el cliente de Supabase? ──
     Misma señal que usan los parches actuales: tiene .from() y .auth,
     así garantizamos que encontramos exactamente el mismo objeto. */
  function isClient(v) {
    return v && typeof v === 'object' && typeof v.from === 'function' && v.auth;
  }

  /* ── Recorrido del árbol de React desde #root ── */
  function findInFiber(root) {
    if (!root) return null;
    var fk = Object.keys(root).find(function (k) {
      return k.indexOf('__reactFiber') === 0 || k.indexOf('__reactInternalInstance') === 0;
    });
    if (!fk) return null;

    function walk(f, d) {
      if (!f || d > 60) return null;
      // props
      var mp = f.memoizedProps;
      if (mp) {
        for (var k in mp) { if (isClient(mp[k])) return mp[k]; }
      }
      // state (hooks encadenados)
      var s = f.memoizedState, sc = 0;
      while (s && sc++ < 15) {
        if (isClient(s.memoizedState)) return s.memoizedState;
        if (s.memoizedState && typeof s.memoizedState === 'object') {
          for (var k2 in s.memoizedState) { if (isClient(s.memoizedState[k2])) return s.memoizedState[k2]; }
        }
        s = s.next;
      }
      return walk(f.child, d + 1) || walk(f.sibling, d + 1);
    }
    return walk(root[fk], 0);
  }

  /* ── Entregar el cliente a quienes lo esperaban ── */
  function flush(sb) {
    while (_callbacks.length) {
      var cb = _callbacks.shift();
      try { cb(sb); } catch (e) { console.error('[p360-bootstrap] callback falló:', e); }
    }
  }

  /* ── Cuando lo encontramos: fijar, avisar, cortar ── */
  function settle(sb) {
    if (_done) return;
    _done = true;
    window._p360sb = sb;
    if (observer) { try { observer.disconnect(); } catch (e) {} }
    if (timer) { clearInterval(timer); timer = null; }
    var ms = Date.now() - _t0;
    console.log('[p360-bootstrap] cliente Supabase listo en window._p360sb (' + ms + ' ms).');
    // Aviso por si algún parche prefiere escuchar un evento
    try { window.dispatchEvent(new CustomEvent('p360:sb-ready', { detail: { sb: sb } })); } catch (e) {}
    flush(sb);
  }

  /* ── Intento único ── */
  function attempt() {
    if (_done) return true;
    // Si otro script lo dejó mientras tanto, lo tomamos.
    if (window._p360sb && typeof window._p360sb.from === 'function') { settle(window._p360sb); return true; }
    var root = document.getElementById('root');
    var sb = findInFiber(root);
    if (sb) { settle(sb); return true; }
    return false;
  }

  /* ── API pública para parches nuevos ──
     window._p360whenSB(cb) → llama cb(sb) apenas el cliente esté disponible
     (o de inmediato si ya lo está). Evita que futuros parches toquen fibers. */
  window._p360whenSB = function (cb) {
    if (typeof cb !== 'function') return;
    if (_done && window._p360sb) { try { cb(window._p360sb); } catch (e) { console.error(e); } return; }
    _callbacks.push(cb);
  };

  /* ── Arranque: intento inmediato + polling + observer del DOM ── */
  var observer = null;
  var timer = null;

  function start() {
    if (attempt()) return;
    // Polling por si el cliente aparece más tarde (la app monta async)
    timer = setInterval(function () {
      if (attempt() || Date.now() - _t0 > TIMEOUT_MS) {
        if (timer) { clearInterval(timer); timer = null; }
        if (!_done) console.warn('[p360-bootstrap] no se encontró el cliente Supabase tras ' + TIMEOUT_MS + ' ms. Los parches caerán a su búsqueda propia.');
      }
    }, INTERVAL_MS);
    // Observer: reaccionar apenas React monta nodos nuevos
    try {
      observer = new MutationObserver(function () { attempt(); });
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
