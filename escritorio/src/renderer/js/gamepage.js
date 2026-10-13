'use strict';
/* global A */
// Página de un juego, al estilo de SteamOS: fondo, logo, Jugar, datos y actividad.
(function () {
  const h = A.h;
  const page = {};
  let layer = null;
  let key = null;
  let root = null;

  const dateFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

  function level(ms) {
    const min = ms / 60000;
    if (min <= 0) return 0;
    if (min < 30) return 1;
    if (min < 60) return 2;
    if (min < 120) return 3;
    if (min < 240) return 4;
    return 5;
  }

  // Actividad de las últimas 16 semanas: una columna por semana, de lunes a domingo
  function activity(k) {
    const weeks = 16;
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const offset = (end.getDay() + 6) % 7; // días desde el lunes
    const start = new Date(end);
    start.setDate(end.getDate() - offset - (weeks - 1) * 7);
    const cols = [];
    let daysPlayed = 0;
    for (let w = 0; w < weeks; w++) {
      const cells = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        if (date > end) { cells.push(h('span.gp-cell.void')); continue; }
        const day = A.play.day(date);
        const ms = day ? (day.games.get(k) || 0) : 0;
        if (ms) daysPlayed++;
        cells.push(h('span.gp-cell', {
          'data-lvl': String(level(ms)),
          title: `${dateFmt.format(date)}: ${ms ? A.play.fmt(ms) : 'sin jugar'}`,
        }));
      }
      cols.push(h('span.gp-week', cells));
    }
    return { el: h('div.gp-heat', cols), daysPlayed };
  }

  function stat(label, value) {
    return h('div.gp-stat', h('span.v', value), h('span.l', label));
  }

  // Ficha con los datos de la tienda (estudio, editor, fecha, géneros, valoraciones)
  function infoBox(g) {
    const m = g.meta;
    const box = h('section.gp-block.gp-info');
    if (!m) {
      box.append(h('h3', 'Ficha'),
        h('p.gp-empty', g.source === 'emulators'
          ? 'Sin datos de tienda para juegos de emulador.'
          : 'Buscando los datos del juego en la tienda de Steam…'));
      return box;
    }
    const row = (label, value) => (value ? h('div.gp-row', h('span.k', label), h('span.v', value)) : null);
    const r = m.reviews;
    const tone = r ? (r.pct >= 80 ? 'good' : r.pct >= 70 ? 'ok' : r.pct >= 40 ? 'mixed' : 'bad') : null;
    box.append(
      h('h3', 'Ficha'),
      r ? h('div.gp-score', { 'data-tone': tone },
        h('span.lbl', r.label),
        h('span.det', `${r.pct} % de ${r.total.toLocaleString('es-ES')} reseñas en Steam`)) : null,
      m.description ? h('p.gp-desc', m.description) : null,
      h('div.gp-rows',
        row(m.developers && m.developers.length > 1 ? 'Estudios' : 'Estudio', (m.developers || []).join(', ')),
        row('Editor', (m.publishers || []).filter((p) => !(m.developers || []).includes(p)).join(', ')),
        row(m.comingSoon ? 'Saldrá' : 'Lanzamiento', m.release),
        row('Géneros', (m.genres || []).join(', ')),
        row('Metacritic', m.metacritic ? String(m.metacritic) : null),
        row('Mando', m.controller === 'full' ? 'Compatible por completo' : m.controller === 'partial' ? 'Compatibilidad parcial' : null)));
    return box;
  }

  // keepArt: se reaprovechan el fondo, el logo y la ficha de Ronrón ya pintados (no parpadean)
  function draw(focusSel, keepArt) {
    const g = A.app.game(key);
    if (!g) { page.close(); return; }
    const oldBg = keepArt && root ? root.querySelector('.gp-hero') : null;
    const oldTop = keepArt && root ? root.querySelector('.gp-toprow') : null;
    const hero = g.art.herohd || g.art.hero || g.art.wide || g.art.cover;
    const total = A.play.total(key);
    const sessions = A.play.sessionsOf(key);
    const playing = A.play.isPlaying(key);
    const act = activity(key);

    const bg = oldBg || h('div.gp-hero', { style: { '--ph-h': String(A.layouts.hueOf(g.name)) } });
    if (hero && !oldBg) {
      const img = new Image();
      img.onload = () => { bg.style.backgroundImage = `url("${hero}")`; bg.classList.add('on'); };
      img.src = hero;
    }

    const title = h('div.gp-title', A.layouts.titleBlock(g));
    const source = g.source === 'emulators' && g.platform ? g.platform : g.sourceLabel;

    const actions = h('div.gp-actions',
      h('button.btn.primary.gp-play', {
        'data-nav': true, 'data-zone': 'gp-actions', 'data-autofocus': true,
        onclick: () => { page.close(); A.app.launch(key); },
      }, A.icon('play'), playing ? 'Jugando' : 'Jugar'),
      h('button.icon-btn.gp-icon', {
        'data-nav': true, 'data-zone': 'gp-actions', 'aria-label': g.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos',
        'aria-pressed': String(g.favorite),
        onclick: async () => { const ng = await A.api.override(key, { favorite: !g.favorite }); A.app.updateGame(ng, true); draw('.gp-icon'); },
      }, A.icon(g.favorite ? 'starFill' : 'star')),
      h('button.icon-btn.gp-icon', {
        'data-nav': true, 'data-zone': 'gp-actions', 'aria-label': 'Cambiar arte',
        onclick: () => A.dialogs.artPicker(key, 'hero'),
      }, A.icon('image')),
      h('button.icon-btn.gp-icon', {
        'data-nav': true, 'data-zone': 'gp-actions', 'aria-label': 'Capturas de este juego',
        onclick: () => A.dialogs.open('center', async (sheet, layer) => {
          sheet.classList.add('wide');
          sheet.append(h('div.sheet-head', h('h2', `Capturas · ${g.name}`)),
            h('div.sheet-body', await A.suite.grid(key)),
            h('div.sheet-foot', h('span', { style: { flex: 1 } }), h('button.btn', { 'data-nav': true, onclick: () => layer.close() }, 'Cerrar')));
          A.nav.focusFirst();
        }),
      }, A.icon('camera')),
      h('button.icon-btn.gp-icon', {
        'data-nav': true, 'data-zone': 'gp-actions', 'aria-label': 'Más opciones',
        onclick: () => A.dialogs.options(key),
      }, A.icon('more')),
      h('div.gp-stats',
        stat('Última partida', playing ? 'Ahora' : g.lastPlayed ? A.timeAgo(g.lastPlayed) : 'Nunca'),
        (() => {
          const b = A.play.best(g);
          return stat(b.from === 'steam' ? 'Tiempo jugado, según Steam' : 'Tiempo jugado', b.ms >= 60000 ? A.play.fmt(b.ms) : 'Sin registrar');
        })(),
        stat('Plataforma', source)));

    const notes = [];
    if (g.pendingUpdate) notes.push(h('p.gp-note', 'Steam tiene una actualización pendiente: la descargará al abrirlo.'));

    const recent = sessions.slice(0, 6);
    const sessBox = h('section.gp-block',
      h('h3', 'Sesiones recientes'),
      recent.length
        ? h('ol.gp-sessions', recent.map((s) => h('li',
          h('span.d', dateFmt.format(new Date(s.s))),
          h('span.t', `${timeFmt.format(new Date(s.s))}–${s.live ? 'ahora' : timeFmt.format(new Date(s.e))}`),
          h('span.m', A.play.fmt(s.e - s.s)))))
        : h('p.gp-empty', 'Todavía no hay partidas registradas. Atrio las anota mientras está abierto.'));

    const actBox = h('section.gp-block',
      h('h3', 'Actividad'),
      act.el,
      h('p.gp-sub', act.daysPlayed
        ? `${A.plural(act.daysPlayed, 'día', 'días')} con partida en las últimas 16 semanas`
        : 'Sin partidas en las últimas 16 semanas'),
      h('button.btn.quiet', { 'data-nav': true, 'data-zone': 'gp-more', onclick: () => A.calendar.open() }, A.icon('calendar'), 'Abrir el calendario'));

    root.replaceChildren(bg, h('div.gp-shade'),
      h('div.gp-content',
        h('div.gp-top', oldTop || h('div.gp-toprow', title, A.ronron ? A.ronron.card(g) : null), actions, ...notes),
        h('div.gp-bottom', actBox, sessBox, infoBox(g))));
    A.nav.focusFirst(focusSel || '.gp-play');
  }

  page.open = (k) => {
    key = k;
    if (layer) { draw(); return; }
    layer = A.dialogs.open('full', (sheet) => {
      sheet.classList.add('gp');
      root = sheet;
    }, { onClose: () => { layer = null; root = null; } });
    draw();
    if (A.hd && A.hd.enabled()) A.hd.request(k);
    // Datos de la tienda: se piden al abrir (y quedan guardados para la próxima vez)
    A.api.meta(k).then((g) => { if (g && key === k) A.app.updateGame(g, false); }).catch(() => {});
  };
  page.close = () => { if (layer) layer.close(); };
  page.isOpen = () => !!layer;
  // full=false: solo cambia el arte (p. ej. llega el fondo ampliado), sin mover el foco
  // full='play': empieza o acaba una partida; se rehace todo menos el fondo y el logo
  page.refresh = (full) => {
    if (!layer || !root) return;
    const g = A.app.game(key);
    if (!g) return;
    if (!full) {
      const info = root.querySelector('.gp-info');
      if (info) info.replaceWith(infoBox(g));
      const hero = g.art.herohd || g.art.hero || g.art.wide || g.art.cover;
      const bg = root.querySelector('.gp-hero');
      if (bg && hero) {
        const img = new Image();
        img.onload = () => { bg.style.backgroundImage = `url("${hero}")`; bg.classList.add('on'); };
        img.src = hero;
      }
      return;
    }
    const all = A.$$('[data-nav]', root);
    const i = all.indexOf(A.nav.current());
    draw(undefined, full === 'play');
    const again = A.$$('[data-nav]', root);
    if (i >= 0 && again[i]) A.nav.focus(again[i], { noScroll: true });
  };
  page.key = () => (layer ? key : null);

  A.gamepage = page;
})();
