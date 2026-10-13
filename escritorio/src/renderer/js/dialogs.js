'use strict';
/* global A, document */
(function () {
  const h = A.h;
  const dialogs = {};
  const stack = [];

  // ---------- Capas ----------
  function open(kind, build, opts = {}) {
    const sheet = h(`div.sheet.${kind}`, { role: 'dialog', 'aria-modal': 'true' });
    if (opts.narrow) sheet.classList.add('narrow');
    const overlay = h('div.overlay', sheet);
    const layer = { overlay, sheet, tabs: null, onClose: opts.onClose };
    layer.close = () => close(layer);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) layer.close(); });
    build(sheet, layer);
    A.$('#overlays').append(overlay);
    stack.push(layer);
    // Una capa puede decidir qué hace Atrás (p. ej. el calendario: de la barra lateral vuelve al día)
    A.nav.pushScope(overlay, () => (layer.back ? layer.back() : layer.close()));
    requestAnimationFrame(() => overlay.classList.add('on'));
    A.nav.focusFirst(opts.focus);
    return layer;
  }

  function close(layer) {
    const i = stack.indexOf(layer);
    if (i < 0) return;
    stack.splice(i, 1);
    layer.overlay.classList.remove('on');
    A.nav.popScope(layer.overlay);
    setTimeout(() => layer.overlay.remove(), 260);
    if (layer.onClose) layer.onClose();
    if (A.app.afterOverlays) A.app.afterOverlays();
  }
  dialogs.closeAll = () => { while (stack.length) close(stack[stack.length - 1]); };
  dialogs.open = open;

  // LB / RB cambian de pestaña en la capa superior
  dialogs.tab = (step) => {
    const top = stack[stack.length - 1];
    if (top && top.tabs) top.tabs(step);
  };

  function seg(options, value, onChange, zone) {
    const box = h('div.seg', { role: 'group' });
    const set = (v) => {
      for (const b of box.children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
      onChange(v);
    };
    for (const [v, label] of options) {
      box.append(h('button', { 'data-nav': true, 'data-zone': zone, 'data-v': v, 'aria-pressed': String(v === value), onclick: () => set(v) }, label));
    }
    return box;
  }
  dialogs.seg = seg;

  function field(label, control, help) {
    return h('div.field', h('span', label), control, help ? h('span.help', help) : null);
  }
  dialogs.field = field;

  function input(value, attrs = {}) {
    const el = h('input.input', { type: 'text', 'data-nav': true, spellcheck: 'false', ...attrs });
    el.value = value || '';
    return el;
  }
  dialogs.input = input;

  function pathInput(value, opts) {
    const inp = input(value, { placeholder: opts.placeholder || '' });
    if (opts.mono) inp.classList.add('mono');
    const btn = h('button.btn', {
      'data-nav': true, type: 'button',
      onclick: async () => {
        const p = await A.api.pickFile({ title: opts.title, directory: !!opts.directory, defaultPath: inp.value || undefined, filters: opts.filters });
        if (p) { inp.value = opts.transform ? opts.transform(p, inp.value) : p; inp.dispatchEvent(new Event('input')); if (opts.onPick) opts.onPick(p); }
      },
    }, A.icon('folder'), 'Explorar');
    return { el: h('div.input-row', inp, btn), input: inp };
  }
  dialogs.pathInput = pathInput;

  const shq = (s) => (/^[\w./~-]+$/.test(s) ? s : `'${String(s).replace(/'/g, "'\\''")}'`);

  function menuItem(icon, label, onclick, extra = {}) {
    return h(`button.menu-item${extra.danger ? '.danger' : ''}`, { 'data-nav': true, onclick },
      A.icon(icon), h('span', label), extra.sub ? h('span.sub', extra.sub) : null);
  }

  // ---------- Opciones de un juego ----------
  dialogs.options = (key) => {
    const g = A.app.game(key);
    if (!g) return;
    open('side', (sheet, layer) => {
      const cover = g.art.cover || g.art.wide;
      sheet.append(
        h('div.side-head',
          h('div.cv', { style: cover ? { backgroundImage: `url("${cover}")` } : {} }),
          h('div', h('h2', g.name), h('p', g.source === 'emulators' && g.platform ? g.platform : g.sourceLabel))),
        h('div.menu',
          menuItem('play', 'Jugar', () => { layer.close(); A.app.launch(key); }),
          menuItem(g.favorite ? 'starFill' : 'star', g.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos', async () => {
            const ng = await A.api.override(key, { favorite: !g.favorite });
            layer.close();
            A.app.updateGame(ng, true);
          }),
          (() => {
            // Ronrón: valorar o apuntar este juego
            if (!A.ronron || !A.ronron.signed()) return null;
            const m = A.ronron.entryFor(g);
            if (m && m.type === 'play' && m.item.status === 1) return menuItem('heart', 'Apuntar en Ronrón', () => { layer.close(); A.ronron.addNote(m.item); });
            if (m && m.type === 'game') return menuItem('heart', 'Ver tu valoración', () => { layer.close(); A.ronron.openGame(m.item.id); }, { sub: String(m.item.general) });
            return menuItem('heart', 'Valorar en Ronrón', () => { layer.close(); A.ronron.newRating(g); });
          })(),
          h('div.menu-sep'),
          menuItem('image', 'Cambiar arte', () => { layer.close(); dialogs.artPicker(key, 'cover'); }),
          menuItem('search', 'Corregir juego en SteamGridDB', () => { layer.close(); dialogs.matchGame(key); }),
          menuItem('edit', 'Cambiar nombre', () => { layer.close(); dialogs.rename(key); }),
          g.custom ? menuItem('sliders', 'Editar cómo se ejecuta', () => { layer.close(); dialogs.editCustom(g.customId); }) : null,
          h('div.menu-sep'),
          menuItem(g.hidden ? 'show' : 'hide', g.hidden ? 'Mostrar en la biblioteca' : 'Ocultar de la biblioteca', async () => {
            const ng = await A.api.override(key, { hidden: !g.hidden });
            layer.close();
            A.app.updateGame(ng, true);
            A.app.toast(ng.hidden ? `${g.name} está oculto. Lo tienes en Ajustes, Juegos ocultos.` : `${g.name} vuelve a la biblioteca`);
            if (ng.hidden && A.gamepage.key() === key) A.gamepage.close();
          }),
          A.play.total(key) > 0 ? menuItem('calendar', 'Ver en el calendario', () => { layer.close(); A.calendar.open(); }, { sub: A.play.fmt(A.play.total(key)) }) : null,
          A.play.total(key) > 0 ? menuItem('trash', 'Borrar horas registradas', () => {
            layer.close();
            dialogs.confirm(`Borrar horas de ${g.name}`, 'Se borra todo el tiempo que Atrio ha registrado para este juego, también en el calendario.', 'Borrar', async () => {
              A.play.set(await A.api.playForget(key));
              A.app.updateGame(A.app.game(key), true);
              A.app.toast('Horas borradas');
            });
          }) : null,
          g.custom ? menuItem('trash', 'Quitar de Atrio', () => { layer.close(); dialogs.removeCustom(g.customId); }, { danger: true }) : null));
    });
  };

  // ---------- Apagar, reiniciar o suspender el equipo ----------
  const POWER = {
    suspender: { label: 'Suspender', doing: 'Suspendiendo…', icon: 'moon' },
    reiniciar: { label: 'Reiniciar', doing: 'Reiniciando…', icon: 'refresh', ask: '¿Reiniciar el ordenador?' },
    apagar: { label: 'Apagar', doing: 'Apagando…', icon: 'power', ask: '¿Apagar el ordenador?' },
  };
  async function doPower(action) {
    const p = POWER[action];
    A.app.toast(p.doing);
    try { await A.api.power(action); } catch (e) { A.app.toast(A.app.cleanError(e), 'error'); }
  }
  dialogs.power = () => {
    open('side', (sheet, layer) => {
      const go = (action) => {
        layer.close();
        const p = POWER[action];
        if (!p.ask) { doPower(action); return; }
        // Confirmación para no apagar por un botón pulsado sin querer (la opción segura va enfocada)
        open('center', (s2, l2) => {
          s2.append(
            h('div.sheet-head', h('h2', p.ask)),
            h('div.sheet-body', h('p.note', A.play.hasData() && (A.app.state().play.active || []).length
              ? 'Hay un juego abierto: guárdalo antes. Atrio guarda tus horas jugadas.'
              : 'Atrio guarda tus horas jugadas antes.')),
            h('div.sheet-foot',
              h('button.btn', { 'data-nav': true, 'data-autofocus': true, onclick: () => l2.close() }, 'Cancelar'),
              h('button.btn.primary', { 'data-nav': true, onclick: () => { l2.close(); doPower(action); } }, p.label)));
        }, { narrow: true });
      };
      sheet.append(
        h('div.side-head', h('div', h('h2', 'Energía'), h('p', 'El ordenador entero, no solo Atrio'))),
        h('div.menu',
          menuItem('moon', 'Suspender', () => go('suspender')),
          menuItem('refresh', 'Reiniciar', () => go('reiniciar')),
          menuItem('power', 'Apagar', () => go('apagar')),
          h('div.menu-sep'),
          menuItem('minimize', 'Minimizar Atrio', () => { layer.close(); A.api.minimize(); }),
          menuItem('hide', 'Salir de Atrio', () => { layer.close(); A.api.quit(); })));
    });
  };

  // ---------- Cambiar nombre ----------
  dialogs.rename = (key) => {
    const g = A.app.game(key);
    open('center', (sheet, layer) => {
      const inp = input(g.name, { 'data-autofocus': true });
      const save = async (name) => {
        const ng = await A.api.override(key, { name: name && name !== g.originalName ? name : null });
        layer.close();
        A.app.updateGame(ng, true);
        // Vuelve a buscar los datos de la tienda con el nombre nuevo
        A.api.meta(key).then((mg) => { if (mg) A.app.updateGame(mg, false); }).catch(() => {});
      };
      inp.addEventListener('submit-input', () => save(inp.value.trim()));
      sheet.append(
        h('div.sheet-head', h('h2', 'Cambiar nombre')),
        h('div.sheet-body', field('Nombre que se mostrará', inp, `Nombre original: ${g.originalName}. Este nombre también se usa para buscar el arte en SteamGridDB y la ficha en la tienda de Steam.`)),
        h('div.sheet-foot',
          h('button.btn.quiet', { 'data-nav': true, onclick: () => save(null) }, 'Restablecer'),
          h('button.btn', { 'data-nav': true, onclick: () => layer.close() }, 'Cancelar'),
          h('button.btn.primary', { 'data-nav': true, onclick: () => save(inp.value.trim()) }, 'Guardar')));
    }, { narrow: true, focus: 'input' });
  };

  function needKey(body, layer) {
    body.append(h('div.state-msg',
      h('p', 'Para elegir arte de SteamGridDB necesitas una clave gratuita de su web.'),
      h('div', { style: { display: 'flex', gap: '.8rem', justifyContent: 'center', marginTop: '1rem' } },
        h('button.btn.primary', { 'data-nav': true, 'data-autofocus': true, onclick: () => { layer.close(); A.settings.open('steamgriddb'); } }, 'Añadir clave'))));
  }

  // ---------- Selector de arte ----------
  const ART_TYPES = [['cover', 'Portada'], ['wide', 'Horizontal'], ['hero', 'Fondo'], ['logo', 'Logo'], ['icon', 'Icono']];

  dialogs.artPicker = (key, startType) => {
    let g = A.app.game(key);
    const hasKey = !!A.app.state().config.sgdbKey;
    open('center', (sheet, layer) => {
      let type = startType || 'cover';
      let page = 0;
      let token = 0;
      const tabs = h('div.tabs');
      const body = h('div.sheet-body');
      const foot = h('div.sheet-foot');

      const renderTabs = () => tabs.replaceChildren(...ART_TYPES.map(([t, label]) =>
        h('button.chip', { 'data-nav': true, 'data-zone': 'tabs', 'aria-pressed': String(t === type), onclick: () => switchTo(t) }, label)));

      layer.tabs = (step) => {
        const i = ART_TYPES.findIndex(([t]) => t === type);
        switchTo(ART_TYPES[(i + step + ART_TYPES.length) % ART_TYPES.length][0], true);
      };

      function switchTo(t, focusTab) {
        type = t; page = 0;
        renderTabs();
        if (focusTab) A.nav.focus(tabs.querySelector('[aria-pressed="true"]'), { noScroll: true });
        load(false);
      }

      async function choose(item, el) {
        try {
          el.style.opacity = '.5';
          g = await A.api.setArt(key, type, item.url);
          A.app.updateGame(g, false);
          for (const p of body.querySelectorAll('.pick.current')) p.classList.remove('current');
          el.classList.add('current');
          A.app.toast('Arte guardado');
        } catch (e) { A.app.toast(A.app.cleanError(e), 'error'); }
        el.style.opacity = '';
      }

      async function load(more) {
        const my = ++token;
        if (!hasKey) { body.replaceChildren(); needKey(body, layer); A.nav.focusFirst(); return; }
        if (!more) body.replaceChildren(h('div.state-msg', 'Buscando en SteamGridDB…'));
        try {
          const res = await A.api.sgdbAssets(key, type, null, page);
          if (my !== token) return;
          let grid = body.querySelector('.picker-grid');
          if (!more || !grid) {
            body.replaceChildren();
            if (!res.items.length) {
              body.append(h('div.state-msg', res.sgdbId
                ? 'SteamGridDB no tiene arte de este tipo para este juego. Prueba otra pestaña o elige un archivo propio.'
                : 'No he encontrado este juego en SteamGridDB. Usa «Juego equivocado» para buscarlo por otro nombre.'));
              A.nav.focusFirst('.tabs [aria-pressed="true"]');
              return;
            }
            grid = h(`div.picker-grid.${type}`);
            body.append(grid);
          }
          const firstNew = grid.children.length;
          // Fondos y cápsulas: primero las de mayor resolución
          const items = (type === 'hero' || type === 'wide')
            ? [...res.items].sort((a, b) => (b.width || 0) - (a.width || 0))
            : res.items;
          for (const item of items) {
            const el = h('button.pick', { 'data-nav': true, 'data-zone': 'picks', title: item.author ? `Por ${item.author}` : '' });
            const img = h('img', { alt: '', loading: 'lazy', decoding: 'async', src: item.thumb });
            el.append(img, h('span.by', [item.width && item.height ? `${item.width}×${item.height}` : '', item.author ? `  ${item.author}` : ''].join('')));
            if ((type === 'hero' || type === 'wide') && item.width) el.append(h('span.res', item.width >= 3000 ? '4K' : `${item.width} px`));
            el.addEventListener('click', () => choose(item, el));
            grid.append(el);
          }
          const moreBtn = body.querySelector('.more');
          if (moreBtn) moreBtn.remove();
          if (res.items.length >= 50) {
            body.append(h('div', { style: { display: 'flex', justifyContent: 'center', padding: '.5rem 0 1rem' } },
              h('button.btn.more', { 'data-nav': true, onclick: () => { page++; load(true); } }, 'Cargar más')));
          }
          A.nav.focus(grid.children[firstNew] || grid.children[0]);
        } catch (e) {
          if (my !== token) return;
          body.replaceChildren(h('div.state-msg', A.app.cleanError(e)));
          A.nav.focusFirst('.tabs [aria-pressed="true"]');
        }
      }

      foot.append(
        h('button.btn.quiet', { 'data-nav': true, onclick: () => { layer.close(); dialogs.matchGame(key); } }, 'Juego equivocado'),
        h('button.btn.quiet', {
          'data-nav': true,
          onclick: async () => {
            const p = await A.api.pickFile({ title: 'Elegir imagen', filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'ico'] }] });
            if (!p) return;
            g = await A.api.setArt(key, type, p);
            A.app.updateGame(g, false);
            A.app.toast('Arte guardado');
          },
        }, 'Desde archivo'),
        h('button.btn.quiet', {
          'data-nav': true,
          onclick: async () => {
            g = await A.api.setArt(key, type, null);
            A.app.updateGame(g, false);
            A.app.toast('Arte quitado');
          },
        }, 'Quitar este arte'),
        h('span', { style: { flex: 1 } }),
        h('button.btn', { 'data-nav': true, onclick: () => layer.close() }, 'Hecho'));

      sheet.append(h('div.sheet-head', h('h2', `Arte de ${g.name}`)), tabs, body, foot);
      renderTabs();
      load(false);
    });
  };

  // ---------- Corregir el juego en SteamGridDB ----------
  dialogs.matchGame = (key) => {
    const g = A.app.game(key);
    if (!A.app.state().config.sgdbKey) {
      open('center', (sheet, layer) => {
        const body = h('div.sheet-body');
        needKey(body, layer);
        sheet.append(h('div.sheet-head', h('h2', 'Corregir juego')), body);
      }, { narrow: true });
      return;
    }
    open('center', (sheet, layer) => {
      const inp = input(g.name, { 'data-autofocus': true, placeholder: 'Nombre del juego' });
      const results = h('div.results');
      const search = async () => {
        results.replaceChildren(h('div.state-msg', 'Buscando…'));
        try {
          const list = await A.api.sgdbSearch(inp.value.trim());
          results.replaceChildren(...(list.length ? list : []).map((r) =>
            h('button.result', {
              'data-nav': true,
              onclick: async () => {
                await A.api.override(key, { sgdbId: r.id });
                await A.api.refetchArt(key, true);
                layer.close();
                A.app.toast(`Ahora se usa «${r.name}». Descargando arte…`);
              },
            }, h('span', r.name), r.year ? h('span.y', String(r.year)) : null, r.verified ? h('span.v', 'Verificado') : null)));
          if (!list.length) results.append(h('div.state-msg', 'Sin resultados. Prueba con menos palabras o el nombre en inglés.'));
          else A.nav.focus(results.firstChild);
        } catch (e) { results.replaceChildren(h('div.state-msg', A.app.cleanError(e))); }
      };
      inp.addEventListener('submit-input', search);
      sheet.append(
        h('div.sheet-head', h('h2', 'Corregir juego en SteamGridDB')),
        h('div.sheet-body',
          h('p.note', 'Si el arte no corresponde a este juego, búscalo y elige el correcto. Se descargará arte nuevo a partir de él.'),
          h('div.input-row', inp, h('button.btn.primary', { 'data-nav': true, onclick: search }, 'Buscar')),
          results),
        h('div.sheet-foot', h('button.btn', { 'data-nav': true, onclick: () => layer.close() }, 'Cerrar')));
      search();
    }, { focus: 'input' });
  };

  // ---------- Buscar en la biblioteca ----------
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  dialogs.search = (initial) => {
    open('search', (sheet) => {
      const inp = h('input.search-input', { type: 'text', 'data-nav': true, 'data-zone': 'q', placeholder: 'Buscar en tu biblioteca', spellcheck: 'false' });
      inp.value = initial || '';
      const results = h('div.search-results.scroller');
      const run = () => {
        const q = norm(inp.value.trim());
        const list = A.app.state().games.filter((g) => !g.hidden && (!q || norm(g.name).includes(q)))
          .sort((a, b) => (norm(a.name).startsWith(q) ? 0 : 1) - (norm(b.name).startsWith(q) ? 0 : 1) || (b.lastPlayed || 0) - (a.lastPlayed || 0))
          .slice(0, 40);
        results.replaceChildren(...list.map((g) => {
          const t = A.layouts.tile(g, 'cover');
          t.setAttribute('data-zone', 'results');
          t.addEventListener('click', (e) => { e.stopImmediatePropagation(); dialogs.closeAll(); A.app.select(g.key); }, true);
          return t;
        }));
        if (!list.length) results.append(h('p.note', 'Ningún juego coincide con esa búsqueda.'));
      };
      inp.addEventListener('input', A.debounce(run, 80));
      inp.addEventListener('submit-input', () => { const f = results.querySelector('.tile'); if (f) A.nav.focus(f); });
      sheet.append(inp, results);
      run();
    }, { focus: 'input' });
  };

  // ---------- Confirmación ----------
  dialogs.confirm = (title, text, okLabel, onOk) => {
    open('center', (sheet, layer) => {
      sheet.append(
        h('div.sheet-head', h('h2', title)),
        h('div.sheet-body', h('p.note', text)),
        h('div.sheet-foot',
          h('button.btn', { 'data-nav': true, 'data-autofocus': true, onclick: () => layer.close() }, 'Cancelar'),
          h('button.btn.primary', { 'data-nav': true, onclick: () => { layer.close(); onOk(); } }, okLabel)));
    }, { narrow: true });
  };

  // ---------- Juegos propios ----------
  dialogs.editCustom = (id) => {
    const cfg = A.app.state().config;
    const existing = id ? cfg.customGames.find((c) => c.id === id) : null;
    const data = existing ? { ...existing } : { id: A.uid(), name: '', exec: '', runner: 'native', args: '', prefix: '', protonPath: '', command: '' };
    open('center', (sheet, layer) => {
      const name = input(data.name, { placeholder: 'Por ejemplo: Hollow Knight', 'data-autofocus': !existing });
      const exe = pathInput(data.exec, {
        title: 'Elegir el ejecutable del juego', placeholder: 'Ruta al ejecutable, script o .exe',
        onPick: (p) => {
          if (!name.value.trim()) name.value = p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
          if (!A.WIN && /\.(exe|msi|bat)$/i.test(p) && data.runner === 'native') { data.runner = 'umu'; redraw(); }
        },
      });
      const args = input(data.args, { placeholder: 'Opcional, por ejemplo: -windowed' });
      const prefix = pathInput(data.prefix, { title: 'Carpeta del prefijo de Wine', directory: true, placeholder: 'Vacío: ~/Games/atrio/<nombre del juego>' });
      const proton = input(data.protonPath, { placeholder: 'Ruta a una carpeta de Proton, o GE-Proton para descargar la última' });
      // Versiones de Proton instaladas: CachyOS primero
      const protonBox = h('div.proton-list', h('p.note', 'Buscando versiones de Proton…'));
      A.api.protonList().then((list) => {
        const pick = (p) => {
          proton.value = p;
          for (const b of protonBox.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.p === p));
        };
        protonBox.replaceChildren(...(list.length ? [
          h('button.proton-opt', { 'data-nav': true, 'data-p': '', 'aria-pressed': String(!data.protonPath), onclick: () => pick('') },
            h('b', 'UMU-Proton'), h('small', 'La que usa umu-launcher por defecto')),
          ...list.map((p) => h('button.proton-opt', {
            'data-nav': true, 'data-p': p.path, 'aria-pressed': String(data.protonPath === p.path), onclick: () => pick(p.path),
          }, h('b', p.name), h('small', p.path))),
        ] : [h('p.note', 'No he encontrado versiones de Proton instaladas. Puedes escribir la ruta a mano.')]));
        if (!data.protonPath && list.length && !existing) pick(list[0].path);
      }).catch(() => protonBox.replaceChildren());
      const command = input(data.command, { placeholder: 'Cualquier comando de shell' });
      command.classList.add('mono');
      const msg = h('p.note');
      const dyn = h('div');

      function redraw() {
        if (A.WIN && data.runner !== 'command') data.runner = 'native';
        const r = data.runner;
        dyn.replaceChildren(
          A.WIN ? (r === 'command'
            ? field('Comando', command, 'Se ejecuta con cmd.exe. Útil para scripts .bat o lanzadores de otros programas.')
            : h('div', field('Ejecutable', exe.el, 'El archivo .exe del juego.'), field('Argumentos', args)))
          : r === 'command'
            ? field('Comando', command, 'Se ejecuta con /bin/sh. Útil para scripts o lanzadores de otros programas.')
            : h('div',
              field('Ejecutable', exe.el, r === 'native' ? 'Juegos nativos de Linux, AppImage o scripts .sh.' : 'Archivo .exe del juego de Windows.'),
              field('Argumentos', args),
              r !== 'native' ? field('Prefijo de Wine', prefix.el, 'Cada juego tiene su propio prefijo, donde se guardan su configuración y partidas.') : null,
              r === 'umu' ? field('Versión de Proton', h('div', protonBox, proton), 'Requiere umu-launcher instalado (sudo pacman -S umu-launcher). Si prefieres que lo gestione Steam, añade el juego a Steam: Atrio lo mostrará y lo abrirá a través de Steam.') : null));
        for (const b of runnerSeg.children) b.setAttribute('aria-pressed', String(b.dataset.v === r));
      }
      const runnerSeg = seg(A.WIN ? [['native', 'Ejecutable (.exe)'], ['command', 'Comando propio']]
        : [['native', 'Nativo de Linux'], ['umu', 'Windows con Proton'], ['wine', 'Windows con Wine'], ['command', 'Comando propio']],
        data.runner, (v) => { data.runner = v; redraw(); });

      async function save() {
        data.name = name.value.trim();
        data.exec = exe.input.value.trim();
        data.args = args.value.trim();
        data.prefix = prefix.input.value.trim();
        data.protonPath = proton.value.trim();
        data.command = command.value.trim();
        if (!data.name) { msg.textContent = 'Ponle un nombre al juego.'; return A.nav.focus(name); }
        if (data.runner === 'command' ? !data.command : !data.exec) { msg.textContent = data.runner === 'command' ? 'Escribe el comando.' : 'Elige el ejecutable.'; return; }
        const list = existing ? cfg.customGames.map((c) => (c.id === data.id ? data : c)) : [...cfg.customGames, data];
        layer.close();
        await A.app.patchConfig({ customGames: list });
        A.app.toast(existing ? 'Juego actualizado' : `${data.name} añadido`);
        if (A.settings.isOpen()) A.settings.refresh();
      }

      sheet.append(
        h('div.sheet-head', h('h2', existing ? 'Editar juego' : 'Añadir un juego')),
        h('div.sheet-body',
          field('Nombre', name),
          field('Cómo se ejecuta', runnerSeg),
          dyn, msg),
        h('div.sheet-foot',
          h('button.btn', { 'data-nav': true, onclick: () => layer.close() }, 'Cancelar'),
          h('button.btn.primary', { 'data-nav': true, onclick: save }, existing ? 'Guardar' : 'Añadir')));
      redraw();
    }, { focus: existing ? '.seg [aria-pressed="true"]' : 'input' });
  };

  dialogs.removeCustom = (id) => {
    const cfg = A.app.state().config;
    const g = cfg.customGames.find((c) => c.id === id);
    if (!g) return;
    dialogs.confirm(`Quitar ${g.name}`, 'Se quita de Atrio. Los archivos del juego no se tocan.', 'Quitar', async () => {
      await A.app.patchConfig({ customGames: cfg.customGames.filter((c) => c.id !== id) });
      A.app.toast(`${g.name} quitado`);
      if (A.settings.isOpen()) A.settings.refresh();
    });
  };

  // ---------- Emuladores ----------
  dialogs.editEmulator = (id) => {
    const cfg = A.app.state().config;
    const existing = id ? cfg.emulators.find((e) => e.id === id) : null;
    const data = existing ? { ...existing } : { id: A.uid(), name: '', short: '', romDir: '', extensions: '', command: '', enabled: true };
    open('center', (sheet, layer) => {
      const name = input(data.name, { placeholder: 'Por ejemplo: Game Boy Advance', 'data-autofocus': true });
      const short = input(data.short, { placeholder: 'Por ejemplo: GBA' });
      const dir = pathInput(data.romDir, { title: 'Carpeta con las ROMs', directory: true, placeholder: 'Carpeta con los juegos' });
      const exts = input(data.extensions, { placeholder: 'Por ejemplo: gba zip' });
      const cmd = input(data.command, { placeholder: 'ruta/al/emulador {rom}' });
      cmd.classList.add('mono');
      const pickEmu = h('button.btn', {
        'data-nav': true,
        onclick: async () => {
          const p = await A.api.pickFile({ title: 'Elegir el ejecutable del emulador' });
          if (p) cmd.value = `${shq(p)} {rom}`;
        },
      }, A.icon('folder'), 'Elegir emulador');
      const msg = h('p.note');
      async function save() {
        Object.assign(data, {
          name: name.value.trim(), short: short.value.trim(), romDir: dir.input.value.trim(),
          extensions: exts.value.trim(), command: cmd.value.trim(),
        });
        if (!data.name || !data.romDir || !data.command) { msg.textContent = 'Necesito el nombre del sistema, la carpeta y el comando.'; return; }
        const list = existing ? cfg.emulators.map((e) => (e.id === data.id ? data : e)) : [...cfg.emulators, data];
        layer.close();
        await A.app.patchConfig({ emulators: list });
        const n = A.app.state().games.filter((g) => g.key.startsWith(`rom:${data.id}:`)).length;
        A.app.toast(`${data.name}: ${A.plural(n, 'juego encontrado', 'juegos encontrados')}`);
        if (A.settings.isOpen()) A.settings.refresh();
      }
      sheet.append(
        h('div.sheet-head', h('h2', existing ? 'Editar sistema' : 'Añadir un sistema de emulación')),
        h('div.sheet-body',
          field('Nombre del sistema', name),
          field('Nombre corto', short, 'Se muestra junto a cada juego.'),
          field('Carpeta de ROMs', dir.el, 'Se buscan juegos en esta carpeta y en sus subcarpetas.'),
          field('Extensiones', exts, 'Separadas por espacios. Vacío: todos los archivos de la carpeta.'),
          field('Comando para abrir un juego', h('div.input-row', cmd, pickEmu),
            A.WIN ? '{rom} se sustituye por la ruta del juego. Pon la ruta del emulador entre comillas, por ejemplo: "C:\\Emuladores\\Dolphin\\Dolphin.exe" -e {rom}. Si el emulador necesita opciones, añádelas aquí.' : '{rom} se sustituye por la ruta del juego. Para flatpak: flatpak run <id de la app> {rom}. Si el emulador necesita opciones (un núcleo de RetroArch, pantalla completa…), añádelas aquí.'),
          msg),
        h('div.sheet-foot',
          existing ? h('button.btn.quiet.danger', {
            'data-nav': true,
            onclick: () => dialogs.confirm(`Quitar ${data.name}`, 'Se quita el sistema de Atrio. Las ROMs no se tocan.', 'Quitar', async () => {
              layer.close();
              await A.app.patchConfig({ emulators: cfg.emulators.filter((e) => e.id !== data.id) });
              if (A.settings.isOpen()) A.settings.refresh();
            }),
          }, 'Quitar sistema') : null,
          h('span', { style: { flex: 1 } }),
          h('button.btn', { 'data-nav': true, onclick: () => layer.close() }, 'Cancelar'),
          h('button.btn.primary', { 'data-nav': true, onclick: save }, existing ? 'Guardar' : 'Añadir')));
    }, { focus: 'input' });
  };

  A.dialogs = dialogs;
})();
