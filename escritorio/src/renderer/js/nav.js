'use strict';
/* global A, document, window, navigator, requestAnimationFrame, performance */
// Navegación espacial con mando, teclado y ratón.
// Cualquier elemento con [data-nav] es enfocable; el ámbito activo es la capa superior.
(function () {
  const nav = {};
  let current = null;
  const zoneMemory = new Map(); // zona -> último elemento enfocado en ella
  let handlers = {};
  let scopeStack = [];          // capas (overlays) apiladas
  let inputMode = 'pointer';

  nav.on = (map) => { handlers = map; };
  nav.current = () => current;

  function scope() {
    return scopeStack.length ? scopeStack[scopeStack.length - 1].el : document;
  }
  nav.pushScope = (el, onBack) => { scopeStack.push({ el, onBack, prev: current }); };
  nav.popScope = (el) => {
    const i = scopeStack.findIndex((s) => s.el === el);
    if (i < 0) return;
    const [s] = scopeStack.splice(i, 1);
    if (s.prev && s.prev.isConnected) nav.focus(s.prev, { noScroll: true });
    else nav.focusFirst();
  };
  nav.inOverlay = () => scopeStack.length > 0;

  function candidates() {
    return [...scope().querySelectorAll('[data-nav]')].filter((el) => {
      if (el.disabled || el.closest('[inert]')) return false;
      if (!scopeStack.length && el.closest('#overlays')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  function scrollIntoView(el) {
    const smooth = !document.body.classList.contains('no-motion');
    const behavior = smooth ? 'smooth' : 'auto';
    const mode = el.closest('[data-scroll]');
    const how = mode ? mode.getAttribute('data-scroll') : 'nearest';
    if (how === 'center') el.scrollIntoView({ block: 'center', inline: 'center', behavior });
    else if (how === 'start') el.scrollIntoView({ block: 'nearest', inline: 'start', behavior });
    else el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior });
  }

  nav.focus = (el, opts = {}) => {
    if (!el) return;
    if (current && current !== el) current.classList.remove('focused');
    current = el;
    el.classList.add('focused');
    const zone = el.getAttribute('data-zone');
    if (zone) zoneMemory.set(zone, el);
    if (el.matches('input, textarea')) el.focus({ preventScroll: true });
    else if (document.activeElement && document.activeElement.matches('input, textarea') && document.activeElement !== el) document.activeElement.blur();
    if (!opts.noScroll) scrollIntoView(el);
    if (handlers.focus) handlers.focus(el, opts);
  };

  nav.focusFirst = (sel) => {
    const c = candidates();
    const pick = (sel && c.find((e) => e.matches(sel))) || c.find((e) => e.hasAttribute('data-autofocus')) || c[0];
    if (pick) nav.focus(pick);
  };
  nav.remembered = (zone) => {
    const el = zoneMemory.get(zone);
    return el && el.isConnected ? el : null;
  };
  nav.forget = () => { zoneMemory.clear(); current = null; };

  // Elige el mejor vecino en una dirección
  function move(dir) {
    const list = candidates();
    if (!current || !current.isConnected || !list.includes(current)) {
      nav.focusFirst();
      return;
    }
    const a = current.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === current) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      let main, cross;
      if (dir === 'right') { if (bx <= ax + 2 || b.right <= a.right) continue; main = Math.max(0, b.left - a.right); cross = Math.abs(by - ay); }
      else if (dir === 'left') { if (bx >= ax - 2 || b.left >= a.left) continue; main = Math.max(0, a.left - b.right); cross = Math.abs(by - ay); }
      else if (dir === 'down') { if (by <= ay + 2 || b.bottom <= a.bottom) continue; main = Math.max(0, b.top - a.bottom); cross = Math.abs(bx - ax); }
      else { if (by >= ay - 2 || b.top >= a.top) continue; main = Math.max(0, a.top - b.bottom); cross = Math.abs(bx - ax); }
      // Preferimos quedarnos en la misma fila/columna
      const overlap = dir === 'left' || dir === 'right'
        ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        : Math.min(a.right, b.right) - Math.max(a.left, b.left);
      // En la biblioteca, izquierda/derecha nunca saltan a otra fila; en los paneles sí, como último recurso
      if ((dir === 'left' || dir === 'right') && overlap <= 0 && !scopeStack.length) continue;
      const score = main + cross * (overlap > 0 ? 0.6 : 2.5) + (overlap > 0 ? 0 : 400);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (!best) { if (handlers.edge) handlers.edge(dir, current); return; }
    // Al cambiar de zona, volvemos al último elemento usado en la zona destino
    const za = current.getAttribute('data-zone'), zb = best.getAttribute('data-zone');
    if (zb && za !== zb) {
      const mem = nav.remembered(zb);
      if (mem && list.includes(mem)) best = mem;
    }
    nav.focus(best);
  }
  nav.move = move;

  function activate() {
    if (!current || !current.isConnected) return nav.focusFirst();
    if (current.matches('input, textarea')) {
      if (handlers.submit) handlers.submit(current);
      return;
    }
    current.click();
  }

  function back() {
    if (scopeStack.length) {
      const top = scopeStack[scopeStack.length - 1];
      if (top.onBack) top.onBack();
      return;
    }
    if (handlers.back) handlers.back();
  }

  // Última entrada recibida, para el diagnóstico de Ajustes, Mando
  let last = null;
  nav.lastInput = () => last;
  nav.note = (type, detail) => { last = { type, detail, t: Date.now() }; };

  function dispatch(action) {
    if (inputMode !== 'input') setMode('input');
    // Controles con valor (p. ej. las notas de Ronrón): izquierda/derecha cambian el valor en vez de moverse
    if ((action === 'left' || action === 'right') && current && current.isConnected && typeof current.__adjust === 'function') {
      return current.__adjust(action === 'left' ? -1 : 1);
    }
    switch (action) {
      case 'up': case 'down': case 'left': case 'right': return move(action);
      case 'a': return activate();
      case 'b': return back();
      default: if (handlers[action]) handlers[action](current);
    }
  }
  nav.dispatch = dispatch;

  function setMode(m) {
    inputMode = m;
    document.body.classList.toggle('no-cursor', m === 'input');
  }

  // ---------- Teclado ----------
  let keysLogged = 0;
  window.addEventListener('keydown', (e) => {
    nav.note('tecla', e.key);
    // Las primeras teclas de cada sesión van al registro: así se ve qué envía el mando a través de Steam
    if (keysLogged < 12 && window.atrio && window.atrio.log) { keysLogged++; window.atrio.log(`tecla ${e.key}`); }
    const t = e.target;
    const typing = t && t.matches && t.matches('input, textarea');
    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      Enter: 'a', Escape: 'b', PageUp: 'prev', PageDown: 'next',
    };
    let action = map[e.key];
    if (typing) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const atStart = t.selectionStart === 0 && t.selectionEnd === 0;
        const atEnd = t.selectionStart === t.value.length;
        if ((e.key === 'ArrowLeft' && !atStart) || (e.key === 'ArrowRight' && !atEnd)) return;
      }
      if (e.key === 'Escape') { t.blur(); }
    } else {
      // Espacio = opciones: así coincide con la Y del mando en la configuración de escritorio de Steam
      if (e.key === ' ') action = 'y';
      if (e.key === 'Backspace') action = 'b';
      if (e.key === 'ContextMenu' || e.key === 'm') action = 'y';
      if (e.key === '/' || (e.key === 'f' && e.ctrlKey)) action = 'x';
      if (e.key === 'c') action = 'select';
      if (e.key === 's') action = 'start';
      if (e.key === 'Tab') action = e.shiftKey ? 'prev' : 'next';
    }
    if (e.key === 'F11') { e.preventDefault(); if (handlers.fullscreen) handlers.fullscreen(); return; }
    if (!action) return;
    e.preventDefault();
    if (e.repeat && (action === 'a' || action === 'b')) return;
    dispatch(action);
  }, true);

  // ---------- Ratón ----------
  let lastMouse = 0;
  window.addEventListener('mousemove', (e) => {
    if (Math.abs(e.movementX) + Math.abs(e.movementY) < 2) return;
    nav.note('ratón', 'movimiento');
    lastMouse = performance.now();
    if (inputMode !== 'pointer') setMode('pointer');
  }, { passive: true });
  document.addEventListener('mouseover', (e) => {
    if (inputMode !== 'pointer' || performance.now() - lastMouse > 120) return;
    const el = e.target.closest && e.target.closest('[data-nav]');
    if (el && el !== current && (!scopeStack.length || scope().contains(el))) nav.focus(el, { noScroll: true, fromPointer: true });
  });
  document.addEventListener('contextmenu', (e) => {
    const el = e.target.closest && e.target.closest('[data-nav]');
    e.preventDefault();
    if (el) { nav.focus(el, { noScroll: true }); dispatch('y'); }
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest && e.target.closest('[data-nav]');
    if (el && el !== current) nav.focus(el, { noScroll: true });
  });

  // ---------- Rueda del ratón / trackpad ----------
  // Con el Steam Controller en modo escritorio, un trackpad puede actuar como rueda.
  let wheelAcc = 0;
  let wheelAt = 0;
  window.addEventListener('wheel', (e) => {
    nav.note('rueda', e.deltaY > 0 ? 'abajo' : 'arriba');
    if (scopeStack.length) return; // en los paneles, desplazamiento normal
    e.preventDefault();
    const now = performance.now();
    if (now - wheelAt > 250) wheelAcc = 0;
    wheelAt = now;
    const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    wheelAcc += e.deltaMode === 1 ? d * 40 : d;
    if (Math.abs(wheelAcc) < 70) return;
    const fwd = wheelAcc > 0;
    wheelAcc = 0;
    const rowLayout = ['horizonte', 'consola', 'carrusel'].includes(document.body.dataset.layout);
    const horizontal = rowLayout || Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (inputMode !== 'input') setMode('input');
    move(horizontal ? (fwd ? 'right' : 'left') : (fwd ? 'down' : 'up'));
  }, { passive: false });

  // ---------- Mando (API Gamepad) ----------
  // Mapeo estándar: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 8 Select, 9 Start, 12-15 cruceta.
  // Un mando sin mapeo estándar puede configurarse a mano (Ajustes, Mando): ese mapa
  // tiene prioridad y admite botones y ejes.
  const ACTIONS = ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'prev', 'next', 'start', 'select'];
  const STANDARD = {
    a: { t: 'b', i: 0 }, b: { t: 'b', i: 1 }, x: { t: 'b', i: 2 }, y: { t: 'b', i: 3 },
    prev: { t: 'b', i: 4 }, next: { t: 'b', i: 5 }, select: { t: 'b', i: 8 }, start: { t: 'b', i: 9 },
    up: { t: 'b', i: 12 }, down: { t: 'b', i: 13 }, left: { t: 'b', i: 14 }, right: { t: 'b', i: 15 },
  };
  const DIRS = new Set(['up', 'down', 'left', 'right', 'prev', 'next']);
  const held = new Map(); // acción -> {since, last}
  const prevPressed = new Set();
  let swapAB = false;
  let customMaps = {};
  let capture = null;
  const warned = new Set();
  let anyPad = false;
  nav.ACTIONS = ACTIONS;
  nav.setSwapAB = (v) => { swapAB = !!v; };
  nav.setPadMaps = (maps) => {
    customMaps = {};
    for (const [id, m] of Object.entries(maps || {})) {
      try { customMaps[id] = typeof m === 'string' ? JSON.parse(m) : m; } catch { /* mapa dañado: se ignora */ }
    }
  };
  // Mientras haya captura (asistente de botones), el mando no navega
  nav.capture = (fn) => { capture = fn; prevPressed.clear(); };
  nav.release = () => { capture = null; prevPressed.clear(); };
  // window.__fakePads solo lo usan las pruebas automáticas
  nav.pads = () => window.__fakePads || [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((p) => p && p.connected);

  const pressedBy = (p, bind) => {
    if (!bind) return false;
    if (bind.t === 'b') { const b = p.buttons[bind.i]; return !!b && (b.pressed || b.value > 0.5); }
    if (bind.t === 'a') { const v = p.axes[bind.i] || 0; return bind.d < 0 ? v < -0.55 : v > 0.55; }
    return false;
  };

  function readPad(p, out) {
    const custom = customMaps[p.id];
    const map = custom || STANDARD;
    if (!custom && p.mapping !== 'standard' && !warned.has(p.id)) {
      warned.add(p.id);
      if (handlers.nonstandard) handlers.nonstandard(p);
    }
    for (const act of ACTIONS) {
      if (pressedBy(p, map[act])) {
        let a = act;
        if (swapAB && a === 'a') a = 'b'; else if (swapAB && a === 'b') a = 'a';
        out.add(a);
      }
    }
    // Stick izquierdo siempre como cruceta, salvo que el mapa propio use esos ejes
    const usesAxes01 = custom && Object.values(custom).some((b) => b && b.t === 'a' && (b.i === 0 || b.i === 1));
    if (!usesAxes01) {
      const [x = 0, y = 0] = p.axes;
      if (x < -0.55) out.add('left');
      if (x > 0.55) out.add('right');
      if (y < -0.55) out.add('up');
      if (y > 0.55) out.add('down');
    }
  }

  function poll() {
    const pads = nav.pads();
    if (pads.length && !anyPad) { anyPad = true; if (handlers.pad) handlers.pad(true); }
    if (capture) {
      try { capture(pads); } catch { /* */ }
      return schedule();
    }
    const pressed = new Set();
    for (const p of pads) readPad(p, pressed);
    const now = performance.now();
    if (pressed.size) nav.note('mando', [...pressed].join(' '));
    if (windowFocused || window.__fakePads) {
      for (const act of pressed) {
        if (!prevPressed.has(act)) {
          held.set(act, { since: now, last: now });
          dispatch(act);
        } else if (DIRS.has(act) && act !== 'prev' && act !== 'next') {
          const h = held.get(act);
          if (h && now - h.since > 380 && now - h.last > (now - h.since > 1500 ? 45 : 85)) {
            h.last = now;
            dispatch(act);
          }
        }
      }
    }
    prevPressed.clear();
    for (const a of pressed) prevPressed.add(a);
    schedule();
  }
  // Con la ventana en segundo plano (jugando) se consulta mucho menos
  // Foco de la ventana según el proceso principal: document.hasFocus() no es fiable en Wayland
  let windowFocused = true;
  nav.setWindowFocused = (v) => { windowFocused = !!v; if (windowFocused) prevPressed.clear(); };
  function schedule() {
    if ((windowFocused && document.visibilityState === 'visible') || window.__fakePads) requestAnimationFrame(poll);
    else setTimeout(poll, 300);
  }
  const logPad = (p, what) => {
    if (window.atrio && window.atrio.log && p) window.atrio.log(`mando ${what}: «${p.id}» mapeo=${p.mapping || 'ninguno'} botones=${p.buttons.length} ejes=${p.axes.length}`);
  };
  window.addEventListener('gamepadconnected', (e) => { anyPad = true; logPad(e.gamepad, 'conectado'); if (handlers.pad) handlers.pad(true); });
  window.addEventListener('gamepaddisconnected', (e) => { logPad(e.gamepad, 'desconectado'); if (handlers.pad) handlers.pad(false); });
  requestAnimationFrame(poll);
  nav.hasPad = () => anyPad;
  nav.readActions = (p, out) => readPad(p, out);

  A.nav = nav;
})();
