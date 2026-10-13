'use strict';
/* global A */
// Diseños de la biblioteca. Cada uno construye el escenario y devuelve update(game)
// para refrescar la información cuando cambia el juego enfocado.
(function () {
  const h = A.h;

  // Qué arte usa cada forma de tesela, por orden de preferencia
  const ART_ORDER = {
    wide: ['wide', 'hero', 'cover'],
    cover: ['cover', 'wide'],
    square: ['cover', 'icon', 'wide'],
  };

  function artFor(game, shape) {
    for (const t of ART_ORDER[shape]) if (game.art[t]) return game.art[t];
    return null;
  }

  // Tono estable por juego, para que los que no tienen arte no sean todos iguales
  function hueOf(name) {
    let x = 0;
    for (const c of String(name)) x = (x * 31 + c.codePointAt(0)) >>> 0;
    return x % 360;
  }

  function tile(game, shape) {
    const src = artFor(game, shape);
    const el = h('button.tile', {
      'data-nav': true, 'data-zone': 'games', 'data-key': game.key, 'data-shape': shape,
      'aria-label': game.name, style: { '--ph-h': String(hueOf(game.name)) },
      onclick: () => A.app.select(game.key),
    });
    el.append(h('div.ph', h('span', game.name)));
    if (src) {
      const img = h('img', { alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' });
      img.onload = () => { img.classList.add('ok'); el.classList.add('has-art'); };
      img.onerror = () => img.remove();
      img.src = src;
      el.append(img);
    }
    if (game.favorite) el.append(h('span.fav', A.icon('starFill')));
    return el;
  }

  // Refresca el arte de las teselas de un juego sin reconstruir el diseño
  function refreshTiles(game) {
    for (const el of A.$$(`.tile[data-key="${CSS.escape(game.key)}"]`)) {
      el.querySelector('.ph').replaceChildren(h('span', game.name));
      el.setAttribute('aria-label', game.name);
      const fav = el.querySelector('.fav');
      if (game.favorite && !fav) el.append(h('span.fav', A.icon('starFill')));
      if (!game.favorite && fav) fav.remove();
      const src = artFor(game, el.getAttribute('data-shape'));
      const old = el.querySelector('img');
      if (!src) { if (old) old.remove(); el.classList.remove('has-art'); continue; }
      if (old && old.getAttribute('src') === src) continue;
      const img = h('img', { alt: '', decoding: 'async', draggable: 'false' });
      img.onload = () => { img.classList.add('ok'); el.classList.add('has-art'); if (old) old.remove(); };
      img.onerror = () => img.remove();
      img.src = src;
      el.insertBefore(img, el.querySelector('.fav'));
    }
  }

  // Bloque de título: logo si existe, si no, el nombre en grande
  function titleBlock(game) {
    if (game.art.logo) {
      const img = h('img.title-art', { alt: game.name, decoding: 'async', draggable: 'false' });
      const fallback = titleText(game.name);
      img.onerror = () => img.replaceWith(fallback);
      img.src = game.art.logo;
      return img;
    }
    return titleText(game.name);
  }

  function titleText(name) {
    const n = String(name).length;
    const scale = n > 34 ? 0.62 : n > 24 ? 0.74 : n > 16 ? 0.88 : 1;
    return h('h2.title-text', { style: { '--t-scale': String(scale) } }, name);
  }

  function metaLine(game) {
    const src = game.platform && game.source === 'emulators' ? game.platform : game.sourceLabel;
    const bits = [h('span.src', src)];
    const played = A.play.best(game).ms;
    if (A.play.isPlaying(game.key)) bits.push(h('span.now', 'Jugando ahora'));
    else if (game.lastPlayed) bits.push(h('span', `Jugado ${A.timeAgo(game.lastPlayed)}`));
    else bits.push(h('span', 'Sin jugar todavía'));
    if (played >= 60000) bits.push(h('span', `${A.play.fmt(played)} en total`));
    if (game.pendingUpdate) bits.push(h('span', 'Steam lo actualizará al abrirlo'));
    if (game.favorite) bits.push(h('span', 'Favorito'));
    return h('div.meta', bits);
  }

  function emptyState(filter) {
    const isAll = filter === 'all';
    return h('div.empty',
      h('h2', isAll ? 'Aún no hay juegos aquí' : 'Nada en este filtro'),
      h('p', isAll
        ? (A.WIN ? 'Atrio lee Steam y Heroic automáticamente.' : 'Atrio lee Steam, Heroic y Lutris automáticamente.') + ' Si tienes juegos en otra parte, añade tus carpetas de emuladores o tus propios ejecutables.'
        : 'Prueba con otro filtro o revisa qué bibliotecas están activas en Ajustes.'),
      h('div.row',
        h('button.btn.primary', { 'data-nav': true, 'data-autofocus': true, onclick: () => A.settings.open('bibliotecas') }, 'Revisar bibliotecas'),
        h('button.btn', { 'data-nav': true, onclick: () => A.settings.open('propios', { add: true }) }, 'Añadir un juego'),
        h('button.btn', { 'data-nav': true, onclick: () => A.app.rescan(true) }, 'Volver a buscar')));
  }

  // ---------- 1. Horizonte ----------
  function horizonte(stage, games) {
    const info = h('div.hz-info');
    const row = h('div.hz-row.scroller', { 'data-scroll': 'nearest' }, games.map((g) => tile(g, 'wide')));
    stage.append(h('div.hz', info, row));
    return { update: (g) => { info.replaceChildren(titleBlock(g), metaLine(g)); } };
  }

  // ---------- 2. Consola ----------
  function consola(stage, games) {
    const info = h('div.cs-info');
    const row = h('div.cs-row.scroller', games.map((g) => tile(g, 'cover')));
    stage.append(h('div.cs', row, info));
    let currentKey = null;
    return {
      update: (g) => {
        // Se redibuja si cambia el juego o su arte/nombre (p. ej. al elegir un logo nuevo)
        const sig = `${g.key}|${g.name}|${g.art.logo || ''}|${g.favorite}|${A.play.total(g.key)}|${A.play.isPlaying(g.key)}`;
        if (currentKey === sig) return;
        currentKey = sig;
        info.replaceChildren(
          titleBlock(g), metaLine(g),
          h('div.cs-actions',
            h('button.btn.primary', { 'data-nav': true, 'data-zone': 'actions', onclick: () => A.app.launch(g.key) }, A.icon('play'), 'Jugar'),
            h('button.btn', { 'data-nav': true, 'data-zone': 'actions', 'aria-label': 'Opciones', onclick: () => A.dialogs.options(g.key) }, A.icon('more'))));
      },
    };
  }

  // ---------- 3. Rejilla ----------
  function rejilla(stage, games) {
    const caption = h('div.gr-caption');
    const grid = h('div.gr-grid', games.map((g) => tile(g, 'cover')));
    stage.append(h('div.gr', h('div.gr-scroll.scroller', grid), caption));
    return {
      update: (g) => {
        const m = metaLine(g);
        caption.replaceChildren(h('div.name', g.name), ...m.childNodes);
      },
    };
  }

  // ---------- 4. Lista ----------
  function lista(stage, games) {
    const list = h('div.ls-list.scroller', { 'data-scroll': 'center' }, games.map((g) =>
      h('button.ls-item', {
        'data-nav': true, 'data-zone': 'games', 'data-key': g.key,
        onclick: () => A.app.select(g.key),
      }, h('span.nm', g.name), h('span.sr', g.platform && g.source === 'emulators' ? g.platform : g.sourceLabel))));
    const detail = h('div.ls-detail');
    stage.append(h('div.ls', list, detail));
    return {
      update: (g) => {
        const heroSrc = g.art.hero || g.art.wide;
        const parts = [];
        if (heroSrc) {
          const hero = h('div.ls-hero', { style: { backgroundImage: `url("${heroSrc}")` } });
          if (g.art.logo) hero.append(titleBlock(g));
          parts.push(hero);
        }
        if (!heroSrc || !g.art.logo) parts.push(titleText(g.name));
        parts.push(metaLine(g));
        detail.replaceChildren(...parts);
      },
    };
  }

  // ---------- 5. Carrusel ----------
  function carrusel(stage, games) {
    const track = h('div.cr-track.scroller', { 'data-scroll': 'center' }, games.map((g) => tile(g, 'cover')));
    const info = h('div.cr-info');
    stage.append(h('div.cr', track, info));
    return {
      update: (g) => {
        for (const el of track.querySelectorAll('.near')) el.classList.remove('near');
        const cur = track.querySelector(`.tile[data-key="${CSS.escape(g.key)}"]`);
        if (cur) {
          if (cur.previousElementSibling) cur.previousElementSibling.classList.add('near');
          if (cur.nextElementSibling) cur.nextElementSibling.classList.add('near');
        }
        info.replaceChildren(titleText(g.name), metaLine(g));
      },
    };
  }

  // ---------- 6. Estante ----------
  function estante(stage, games, ctx) {
    const top = h('div.es-top');
    const box = h('div.es-shelves.scroller');
    const shelves = [];
    if (ctx.filter === 'all') {
      const recent = games.filter((g) => g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 14);
      if (recent.length) shelves.push(['Seguir jugando', recent]);
      const favs = games.filter((g) => g.favorite);
      if (favs.length) shelves.push(['Favoritos', favs]);
    }
    const groups = new Map();
    for (const g of games) {
      const label = g.source === 'emulators' ? (g.platform || 'Emuladores')
        : g.source === 'heroic' ? 'Heroic' : g.source === 'custom' ? 'Añadidos por ti' : g.sourceLabel;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(g);
    }
    for (const [label, list] of groups) shelves.push([label, list]);
    shelves.forEach(([label, list], i) => {
      box.append(h('section.es-shelf',
        h('h3', label, h('span.n', String(list.length))),
        h('div.es-row.scroller', { 'data-zone': `shelf-${i}` }, list.map((g) => {
          const t = tile(g, 'cover');
          t.setAttribute('data-zone', `shelf-${i}`);
          return t;
        }))));
    });
    stage.append(h('div.es', top, box));
    return { update: (g) => { top.replaceChildren(titleBlock(g), metaLine(g)); } };
  }

  // Solo la línea de datos («Jugando ahora», horas…) del juego enfocado, sin tocar el logo:
  // rehacer el bloque entero relanzaría su animación de entrada y el logo parpadearía
  function refreshMeta(stage, game) {
    const fresh = metaLine(game);
    const metas = stage ? stage.querySelectorAll('.meta') : [];
    for (const m of metas) m.replaceChildren(...fresh.cloneNode(true).childNodes);
    return metas.length > 0;
  }

  A.layouts = {
    refreshMeta,
    list: [
      { id: 'horizonte', name: 'Horizonte', hint: 'Fondo a pantalla completa y fila de cápsulas', fn: horizonte,
        mini: [['hi', 6, 70, 22, 18], ['', 30, 70, 22, 18], ['', 54, 70, 22, 18], ['', 78, 70, 22, 18], ['tx', 6, 46, 30], ['tx', 6, 54, 18]] },
      { id: 'consola', name: 'Consola', hint: 'Iconos arriba y una acción principal', fn: consola,
        mini: [['hi', 5, 14, 11, 24], ['', 18, 17, 8, 18], ['', 28, 17, 8, 18], ['', 38, 17, 8, 18], ['tx', 5, 58, 32], ['tx', 5, 66, 20], ['hi', 5, 76, 12, 9]] },
      { id: 'rejilla', name: 'Rejilla', hint: 'Todas las portadas de un vistazo', fn: rejilla,
        mini: [['hi', 5, 14, 9, 34], ['', 16, 14, 9, 34], ['', 27, 14, 9, 34], ['', 38, 14, 9, 34], ['', 49, 14, 9, 34], ['', 60, 14, 9, 34], ['', 71, 14, 9, 34], ['', 82, 14, 9, 34], ['', 5, 56, 9, 34], ['', 16, 56, 9, 34], ['', 27, 56, 9, 34], ['', 38, 56, 9, 34]] },
      { id: 'lista', name: 'Lista', hint: 'Solo nombres, con el detalle al lado', fn: lista,
        mini: [['tx', 5, 30, 20], ['tx', 5, 40, 26], ['hi', 5, 50, 28], ['tx', 5, 60, 18], ['tx', 5, 70, 24], ['hi', 42, 26, 53, 34], ['tx', 42, 70, 22]] },
      { id: 'carrusel', name: 'Carrusel', hint: 'Una portada grande en el centro', fn: carrusel,
        mini: [['', 18, 28, 11, 38], ['', 32, 24, 13, 46], ['hi', 43, 14, 15, 62], ['', 60, 24, 13, 46], ['', 75, 28, 11, 38], ['tx', 40, 84, 20]] },
      { id: 'estante', name: 'Estante', hint: 'Filas por tienda o sistema', fn: estante,
        mini: [['tx', 5, 18, 26], ['tx', 5, 36, 10], ['hi', 5, 42, 8, 22], ['', 15, 42, 8, 22], ['', 25, 42, 8, 22], ['', 35, 42, 8, 22], ['tx', 5, 70, 10], ['', 5, 76, 8, 22], ['', 15, 76, 8, 22], ['', 25, 76, 8, 22]] },
    ],
    get(id) { return this.list.find((l) => l.id === id) || this.list[0]; },
    tile, titleBlock, metaLine, refreshTiles, emptyState, artFor, hueOf,
  };
})();
