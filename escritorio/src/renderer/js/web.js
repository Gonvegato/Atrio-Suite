'use strict';
/* global A, window, document, ResizeObserver */
// Guías dentro de la página del juego: un panel a la derecha con las webs guardadas para ese juego
// (pestañas), sugerencias para juegos online conocidos y un buscador. La web la pinta el proceso principal
// (WebContentsView) justo encima del hueco que deja este panel.
(function () {
  const h = A.h;
  const W = {};
  let gameKey = null;
  let panel = null;
  let slot = null;
  let ro = null;
  let st = { open: false };
  let current = null;     // dirección abierta (o null: pantalla de sugerencias)
  let currentName = '';   // nombre conocido de esa web (de una sugerencia o pestaña guardada)
  let hiddenByOverlay = false;

  // Webs comprobadas para juegos online conocidos (se ofrecen al abrir Guías sin ninguna guardada)
  const PRESETS = [
    [/deadlock/, [['Deadlock Wiki · héroes', 'https://deadlock.wiki/Heroes'], ['Statlocker', 'https://statlocker.gg'],
      ['Mobalytics · builds', 'https://mobalytics.gg/deadlock/build-stats'], ['Deadlock Labs', 'https://deadlocklabs.gg']]],
    [/league ?of ?legends|^lol$/, [['OP.GG · campeones', 'https://op.gg/champions'], ['U.GG · campeones', 'https://u.gg/lol/champions'],
      ['Mobalytics · campeones', 'https://mobalytics.gg/lol/champions']]],
    [/^dota ?2$/, [['Dotabuff · héroes', 'https://www.dotabuff.com/heroes']]],
  ];
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  W.presets = (name) => { const n = norm(name); const p = PRESETS.find(([re]) => re.test(n)); return p ? p[1] : []; };
  const searchUrl = (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

  const game = () => (gameKey ? A.app.game(gameKey) : null);
  const links = () => ((game() && game().links) || []);
  W.isOpen = () => !!panel;
  W.key = () => (panel ? gameKey : null);

  function bounds() {
    if (!slot) return null;
    const r = slot.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }

  async function saveLinks(list) {
    const ng = await A.api.override(gameKey, { links: list.length ? list : null });
    if (ng) A.app.updateGame(ng, false);
    draw();
  }

  async function go(url, name) {
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    current = url;
    currentName = name || (links().find((l) => l.u === url) || {}).n || '';
    draw();
    try { st = await A.api.webOpen(url, bounds()); } catch (e) { A.app.toast(A.app.cleanError(e), 'error'); current = null; draw(); }
  }
  W.go = go;

  // Pantalla de inicio del panel (sin web abierta): webs guardadas, sugerencias, buscador y dirección
  function home() {
    const g = game();
    const saved = links();
    const sugg = W.presets(g ? g.name : '').filter(([, u]) => !saved.some((l) => l.u === u));
    const q = A.dialogs.input('', { placeholder: 'Pega una dirección o busca: «Haze build», «Ahri runas»…', 'data-zone': 'web-home', 'data-autofocus': true });
    const submit = () => {
      const v = q.value.trim();
      if (!v) return;
      if (/^https?:\/\//i.test(v) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) go(v);
      else go(searchUrl(`${g ? g.name : ''} ${v}`.trim()));
    };
    q.addEventListener('submit-input', submit);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const card = (name, u, saved0) => h('button.web-card', { 'data-nav': true, 'data-zone': 'web-home', onclick: () => go(u, name) },
      h('img', { src: `https://icons.duckduckgo.com/ip3/${host(u)}.ico`, alt: '', loading: 'lazy', onerror: (e) => e.target.remove() }),
      h('span.n', name), h('small', saved0 ? host(u) : `${host(u)} · sugerida`));
    return h('div.web-home.scroller',
      h('h3', `Guías y webs · ${g ? g.name : ''}`),
      h('div.input-row', q, h('button.btn.primary', { 'data-nav': true, 'data-zone': 'web-home', onclick: submit }, A.icon('search'), 'Ir')),
      h('button.btn.quiet', { 'data-nav': true, 'data-zone': 'web-home', onclick: () => go(searchUrl(`${g ? g.name : ''} guía personajes`)) }, A.icon('search'), `Buscar guías de ${g ? g.name : 'este juego'}`),
      saved.length ? h('div', h('h4', 'Guardadas'), h('div.web-cards', saved.map((l) => card(l.n || host(l.u), l.u, true)))) : null,
      sugg.length ? h('div', h('h4', 'Sugerencias'), h('div.web-cards', sugg.map(([n, u]) => card(n, u, false)))) : null,
      h('p.note', 'La web se abre aquí mismo. Con «Guardar» queda en las pestañas de este juego (también la ves en el móvil, y desde el móvil puedes mandar webs con Compartir → Atrio). Esc o B para cerrar el panel.'));
  }

  function draw() {
    if (!panel) return;
    const saved = links();
    const isSaved = current && saved.some((l) => l.u === st.url || l.u === current);
    const tab = (l, i) => h('button.web-tab', {
      'data-nav': true, 'data-zone': 'web-bar', 'aria-pressed': String(!!current && (st.url === l.u || current === l.u)),
      title: l.u, onclick: () => go(l.u, l.n),
      oncontextmenu: (e) => { e.preventDefault(); removeLink(i); },
    }, l.n || host(l.u));
    const bar = h('div.web-bar',
      h('button.icon-btn', { 'data-nav': true, 'data-zone': 'web-bar', 'aria-label': 'Inicio de guías', onclick: () => { current = null; A.api.webHide(); draw(); } }, A.icon('globe')),
      h('div.web-tabs', saved.map(tab)),
      current ? h('div.web-tools',
        h('button.icon-btn', { 'data-nav': true, 'data-zone': 'web-bar', 'aria-label': 'Atrás', disabled: st.back ? null : true, onclick: () => A.api.webNav('back') }, A.icon('back')),
        h('button.icon-btn', { 'data-nav': true, 'data-zone': 'web-bar', 'aria-label': 'Adelante', disabled: st.fwd ? null : true, onclick: () => A.api.webNav('fwd') }, A.icon('fwd')),
        h('button.icon-btn', { 'data-nav': true, 'data-zone': 'web-bar', 'aria-label': 'Recargar', onclick: () => A.api.webNav('reload') }, A.icon('refresh')),
        h('button.btn.quiet.web-save', {
          'data-nav': true, 'data-zone': 'web-bar', 'aria-pressed': String(!!isSaved),
          onclick: () => {
            const u = st.url || current;
            if (isSaved) { saveLinks(saved.filter((l) => l.u !== u && l.u !== current)); A.app.toast('Quitada de las guías de este juego'); return; }
            saveLinks([...saved.filter((l) => l.u !== u), { u, n: (u === current && currentName ? currentName : st.title || host(u)).slice(0, 40) }]);
            A.app.toast('Guardada en las guías de este juego');
          },
        }, A.icon(isSaved ? 'starFill' : 'star'), isSaved ? 'Guardada' : 'Guardar'),
        h('button.icon-btn', { 'data-nav': true, 'data-zone': 'web-bar', 'aria-label': 'Abrir en el navegador', onclick: () => A.api.webNav('external') }, A.icon('link'))) : null,
      h('button.icon-btn', { 'data-nav': true, 'data-zone': 'web-bar', 'aria-label': 'Cerrar guías', onclick: () => W.close() }, A.icon('close')));
    const body = current
      ? h('div.web-slot', h('div.web-loading', st.loading !== false ? 'Cargando…' : ''))
      : home();
    panel.replaceChildren(bar, h('div.web-addr', current ? (st.title ? `${st.title} · ${host(st.url || current)}` : host(current)) : ''), body);
    const prev = slot;
    slot = current ? body : null;
    if (ro) ro.disconnect();
    if (slot) {
      ro = new ResizeObserver(() => { if (!hiddenByOverlay) A.api.webBounds(bounds()); });
      ro.observe(slot);
      if (!prev && st.open && !hiddenByOverlay) A.api.webShow(bounds());
    }
    if (!current) A.nav.focusFirst('.web-home [data-autofocus]');
  }

  async function removeLink(i) {
    const l = links()[i];
    if (!l) return;
    A.dialogs.confirm('Quitar esta web', `${l.n || host(l.u)} deja de estar en las guías de este juego.`, 'Quitar', () => saveLinks(links().filter((_, j) => j !== i)));
  }

  // Abre el panel en la página del juego (que tiene que estar abierta). url: abrir ya esa web
  W.open = (key, url) => {
    if (panel && gameKey === key) { if (url) go(url); return; }
    if (panel) W.close();
    const root = A.$('.sheet.gp');
    if (!root) return;
    gameKey = key;
    current = null;
    hiddenByOverlay = false;
    root.classList.add('web-on');
    document.body.classList.add('web-open');
    panel = h('aside.web-panel');
    root.append(panel);
    W.baseDepth = A.dialogs.depth();
    const first = url || (links()[0] && links()[0].u) || null;
    draw();
    if (first) setTimeout(() => go(first), 60);
  };

  W.close = () => {
    if (!panel) return;
    A.api.webClose();
    if (ro) ro.disconnect();
    ro = null;
    const root = panel.parentElement;
    panel.remove();
    if (root) root.classList.remove('web-on');
    document.body.classList.remove('web-open');
    panel = null;
    slot = null;
    current = null;
    gameKey = null;
    A.nav.focusFirst('.gp-web-btn');
  };

  // Un menú o diálogo encima: la web (que va por encima de todo) se esconde mientras tanto
  W.depthChanged = (depth) => {
    if (!panel) return;
    if (depth > W.baseDepth && !hiddenByOverlay) { hiddenByOverlay = true; A.api.webHide(); }
    else if (depth <= W.baseDepth && hiddenByOverlay) { hiddenByOverlay = false; if (slot) A.api.webShow(bounds()); }
  };

  A.api.on('web', (s) => {
    const was = st;
    st = s || { open: false };
    if (!panel || !current) return;
    if (!st.open) return;
    // Solo se rehace la barra si cambia algo que se vea (título, botones)
    if (was.url !== st.url || was.title !== st.title || was.back !== st.back || was.fwd !== st.fwd || was.loading !== st.loading) {
      const addr = panel.querySelector('.web-addr');
      if (addr) addr.textContent = st.title ? `${st.title} · ${host(st.url)}` : host(st.url || current);
      const ld = panel.querySelector('.web-loading');
      if (ld) ld.textContent = st.loading ? 'Cargando…' : '';
      const b = panel.querySelectorAll('.web-tools .icon-btn');
      if (b[0]) b[0].disabled = !st.back;
      if (b[1]) b[1].disabled = !st.fwd;
      for (const t of panel.querySelectorAll('.web-tab')) t.setAttribute('aria-pressed', String(t.title === st.url));
      const sv = panel.querySelector('.web-save');
      if (sv && was.url !== st.url) draw();
    }
  });
  A.api.on('web-key', (k) => { if (k === 'escape') W.close(); else if (k === 'f11') A.api.toggleFullscreen(); });
  A.api.on('web-error', (e) => { if (panel && e && e.desc) A.app.toast(`No se ha podido abrir la web: ${e.desc}`, 'error'); });
  window.addEventListener('resize', () => { if (panel && slot && !hiddenByOverlay) A.api.webBounds(bounds()); });

  A.web = W;
})();
