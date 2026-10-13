'use strict';
/* global A */
// Calendario de partidas: qué se jugó cada día y cuánto tiempo
(function () {
  const h = A.h;
  const cal = {};
  let layer = null;
  let view = null;      // { y, m }
  let grid = null, side = null, head = null;
  let selected = null;  // Date del día enfocado

  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const WEEK = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const dateFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

  // Escala secuencial de un solo tono: más tiempo, más intensidad
  function level(ms) {
    const min = ms / 60000;
    if (min <= 0) return 0;
    if (min < 30) return 1;
    if (min < 60) return 2;
    if (min < 120) return 3;
    if (min < 240) return 4;
    return 5;
  }

  const gameOf = (k) => A.app.game(k);
  const nameOf = (k) => { const g = gameOf(k); return g ? g.name : 'Juego que ya no está en la biblioteca'; };
  const coverOf = (k) => { const g = gameOf(k); return g ? (g.art.cover || g.art.wide || g.art.hero) : null; };

  function thumb(k, cls) {
    const src = coverOf(k);
    const el = h(`span.${cls}`, { style: { '--ph-h': String(A.layouts.hueOf(nameOf(k))) } });
    if (src) el.style.backgroundImage = `url("${src}")`;
    else el.classList.add('ph');
    return el;
  }

  function sameDay(a, b) { return a && b && a.toDateString() === b.toDateString(); }

  // ---- Ronrón: como en su calendario, cada juego sale todos los días que estuviste con él ----
  const rrOn = (date) => (A.ronron ? A.ronron.eventsOn(date) : []);
  const rrSpans = (date) => (A.ronron ? A.ronron.spansOn(date) : []);
  const tone = (v) => (v >= 85 ? 'top' : v >= 70 ? 'good' : v >= 50 ? 'mid' : 'low');
  // Apuntes de ese día: un puntito arriba a la derecha
  function rrMarks(date) {
    const n = rrOn(date).filter((e) => e.type === 'nota').length;
    return n ? h('span.cal-rr', h('span.cal-rr-dot', { title: A.plural(n, 'apunte', 'apuntes') })) : null;
  }
  function rrThumb(item, cls = 'cv') {
    const src = A.ronron.coverOf(item);
    const el = h(`span.${cls}`, { style: { '--ph-h': String(A.layouts.hueOf(item.name)) } });
    if (src) el.style.backgroundImage = `url("${src}")`; else el.classList.add('ph');
    return el;
  }
  // Juegos de Ronrón de ese día que no tienen ya partida registrada por Atrio (esos salen con sus horas)
  function spansWithout(date, keys) {
    return rrSpans(date).filter((x) => !(x.lib && keys.has(x.lib.key)));
  }
  function spanThumb(x) {
    const el = rrThumb(x.item, 'th');
    el.title = x.item.name;
    if (x.kind === 'g') badge(el, x.item);
    return el;
  }
  // Nota de un juego ya valorado: sale en todos los días que estuviste con él
  function badge(el, item) {
    const v = Number(item.general) || 0;
    el.classList.add('cal-rr-cover');
    el.append(h('span.cal-rr-fin', { 'data-tone': tone(v) }, String(v)));
    el.title = `${el.title || item.name} · ${v}`;
    return el;
  }

  function drawMonth(focusDate) {
    const { y, m } = view;
    const first = new Date(y, m, 1);
    const daysIn = new Date(y, m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // semana empieza en lunes
    const today = new Date();
    const month = A.play.month(y, m);

    head.replaceChildren(
      h('div.cal-title',
        h('h1', MONTHS[m]), h('span.cal-year', String(y))),
      h('div.cal-nav',
        h('button.icon-btn', { 'data-nav': true, 'data-zone': 'calnav', 'aria-label': 'Mes anterior', onclick: () => shift(-1) }, chevron(-1)),
        h('button.btn.quiet', { 'data-nav': true, 'data-zone': 'calnav', onclick: () => goToday() }, 'Hoy'),
        h('button.icon-btn', { 'data-nav': true, 'data-zone': 'calnav', 'aria-label': 'Mes siguiente', onclick: () => shift(1) }, chevron(1))),
      h('p.cal-sum', [month.total
        ? `${A.play.fmt(month.total)} en ${A.plural(month.daysPlayed, 'día', 'días')}`
        : 'Sin partidas este mes', finsInMonth(y, m) ? A.plural(finsInMonth(y, m), 'juego terminado', 'juegos terminados') : null].filter(Boolean).join(' · ')));

    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(h('span.cal-blank'));
    for (let d = 1; d <= daysIn; d++) {
      const date = new Date(y, m, d);
      const info = A.play.day(date);
      const ms = info ? info.total : 0;
      const games = info ? [...info.games].sort((a, b) => b[1] - a[1]) : [];
      const future = date > today && !sameDay(date, today);
      const cell = h('button.cal-day', {
        'data-nav': true, 'data-zone': 'days', 'data-lvl': String(level(ms)),
        // A (o clic) sobre un día: a la barra de la derecha, para abrir lo que jugaste ese día
        onclick: () => goSide(date),
        'aria-label': `${d} de ${MONTHS[m]}: ${ms ? A.play.fmt(ms) : 'sin partidas'}`,
      },
      h('span.num', String(d)),
      (() => {
        // Primero lo que jugaste ese día (con horas), luego lo que tenías en curso en Ronrón (sin horas)
        const keys = new Set(games.map(([k]) => k));
        const rated = new Map(rrSpans(date).filter((x) => x.kind === 'g' && x.lib).map((x) => [x.lib.key, x.item]));
        const played = games.map(([k, t]) => {
          const el = thumb(k, 'th');
          el.title = `${nameOf(k)} · ${A.play.fmt(t)}`;
          return rated.has(k) ? badge(el, rated.get(k)) : el;
        });
        const all = [...played, ...spansWithout(date, keys).map(spanThumb)];
        if (!all.length) return null;
        const shown = all.slice(0, 4);
        if (all.length > 4) shown.push(h('span.cal-more', `+${all.length - 4}`));
        return h('span.thumbs', shown);
      })(),
      ms ? h('span.time', A.play.fmt(ms, true)) : null,
      rrMarks(date));
      cell.className = `cal-day${sameDay(date, today) ? ' today' : ''}${future ? ' future' : ''}`;
      cell._date = date;
      cells.push(cell);
    }
    grid.replaceChildren(...WEEK.map((w) => h('span.cal-wd', w)), ...cells);

    const target = cells.find((c) => c._date && sameDay(c._date, focusDate)) || cells.find((c) => c._date && sameDay(c._date, today)) || cells.find((c) => c._date);
    selected = target._date;
    drawSide();
    A.nav.focus(target, { noScroll: true });
  }

  function finsInMonth(y, m) {
    if (!A.ronron) return 0;
    const pre = `${y}-${String(m + 1).padStart(2, '0')}-`;
    let n = 0;
    for (const [k, ev] of A.ronron.events()) if (k.startsWith(pre)) n += ev.filter((e) => e.type === 'fin').length;
    return n;
  }

  // Lleva el foco a la barra lateral del día; si ese día no hay nada que abrir, avisa
  function goSide(date) {
    if (!sameDay(date, selected)) { selected = date; drawSide(); }
    const first = side.querySelector('[data-nav]');
    if (first) A.nav.focus(first);
    else A.app.toast('Ese día no hay juegos que abrir');
  }
  // Atrás desde la barra lateral: vuelve al día; desde el calendario, lo cierra
  function back() {
    const cur = A.nav.current();
    if (cur && side.contains(cur)) {
      const cell = A.$$('.cal-day', grid).find((c) => c._date && sameDay(c._date, selected));
      if (cell) { A.nav.focus(cell, { noScroll: true }); return; }
    }
    if (layer) layer.close();
  }

  function chevron(dir) {
    const s = A.icon('more');
    s.innerHTML = dir < 0 ? '<path d="M15 5l-7 7 7 7"/>' : '<path d="M9 5l7 7-7 7"/>';
    return s;
  }

  function bar(ms, max) {
    return h('span.cal-bar', h('span', { style: { width: `${Math.max(3, Math.round((ms / max) * 100))}%` } }));
  }

  function drawSide() {
    const info = A.play.day(selected);
    const month = A.play.month(view.y, view.m);
    const parts = [h('h2.cal-date', dateFmt.format(selected))];
    const keys = new Set(info ? [...info.games.keys()] : []);
    const spansAll = rrSpans(selected);
    const notes = rrOn(selected).filter((e) => e.type === 'nota');
    // En Ronrón: lo que tenías en curso ese día sin partida registrada, y lo que terminaste o empezaste ese día
    const spansSide = spansAll.filter((x) => !(x.lib && keys.has(x.lib.key)) || x.isEnd || x.isStart);
    if (!info || !info.total) {
      parts.push(h('p.cal-none', spansAll.length || notes.length ? 'Ese día Atrio no registró partidas.' : 'Ese día no jugaste a nada, o Atrio no estaba abierto.'));
    } else {
      parts.push(h('p.cal-total', A.play.fmt(info.total)));
      const games = [...info.games].sort((a, b) => b[1] - a[1]);
      const max = games[0][1];
      parts.push(h('div.cal-games', games.map(([k, ms]) => {
        const sess = info.sessions.filter((s) => s.k === k).sort((a, b) => a.s - b.s);
        return h('button.cal-game', {
          'data-nav': true, 'data-zone': 'side',
          onclick: () => { if (gameOf(k)) { cal.close(); A.gamepage.open(k); } },
        },
        thumb(k, 'cv'),
        h('span.info',
          h('span.nm', nameOf(k)),
          h('span.tm', A.play.fmt(ms)),
          bar(ms, max),
          h('span.ses', sess.map((s) => `${timeFmt.format(s.s)}–${s.live ? 'ahora' : timeFmt.format(s.e)}`).join('   '))));
      })));
    }
    if (spansSide.length || notes.length) {
      const label = (x) => {
        if (x.isEnd) return 'Terminado ese día';
        if (x.isStart) return 'Empezado ese día';
        if (x.kind === 'g') return `Jugando · lo terminaste el ${A.ronron.fmtDay(x.e)}`;
        return x.item.status === 2 ? 'Dropeado más tarde' : 'Jugando';
      };
      parts.push(h('h3', 'Tus fichas'), h('div.cal-games',
        spansSide.map((x) => h('button.cal-game.cal-rr-item', {
          'data-nav': true, 'data-zone': 'side', onclick: () => { cal.close(); A.ronron.open({ kind: x.kind, item: x.item }); },
        }, rrThumb(x.item), h('span.info', h('span.nm', x.item.name), h('span.tm', label(x))),
        x.kind === 'g' ? A.ronron.ringOf(Number(x.item.general) || 0) : null)),
        notes.map((e) => h('button.cal-game.cal-rr-item', {
          'data-nav': true, 'data-zone': 'side', onclick: () => { cal.close(); A.ronron.open(e); },
        }, rrThumb(e.item), h('span.info', h('span.nm', e.item.name), h('span.tm', 'Apunte'), e.entry.note ? h('span.ses', e.entry.note) : null),
        A.ronron.ringOf(A.ronron.scoreOf(e))))));
    }
    if (month.total) {
      const top = [...month.games].sort((a, b) => b[1] - a[1]).slice(0, 5);
      parts.push(
        h('h3', `Lo más jugado en ${MONTHS[view.m]}`),
        h('div.cal-top', top.map(([k, ms]) => h('div.cal-toprow',
          h('span.nm', nameOf(k)), h('span.tm', A.play.fmt(ms, true)), bar(ms, top[0][1])))));
    }
    side.replaceChildren(...parts);
  }

  function shift(step) {
    let { y, m } = view;
    m += step;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    view = { y, m };
    const day = Math.min(selected ? selected.getDate() : 1, new Date(y, m + 1, 0).getDate());
    drawMonth(new Date(y, m, day));
  }

  function goToday() {
    const t = new Date();
    view = { y: t.getFullYear(), m: t.getMonth() };
    drawMonth(t);
  }

  function legend() {
    return h('div.cal-legend', h('span', 'Menos'),
      [0, 1, 2, 3, 4, 5].map((l) => h('span.sw', { 'data-lvl': String(l) })),
      h('span', 'Más'));
  }

  cal.open = (date) => {
    const d = date || new Date();
    view = { y: d.getFullYear(), m: d.getMonth() };
    if (layer) { drawMonth(d); return; }
    layer = A.dialogs.open('full', (sheet, l) => {
      sheet.classList.add('cal');
      head = h('header.cal-head');
      grid = h('div.cal-grid');
      side = h('aside.cal-side.scroller');
      sheet.append(
        h('section.cal-main', head, grid,
          h('div.cal-foot', legend(), h('p.cal-note', A.nav.hasPad()
            ? 'A sobre un día: ver sus juegos · B: volver · LB RB: cambiar de mes'
            : 'Intro sobre un día: ver sus juegos · Esc: volver · Re Pág / Av Pág: cambiar de mes'))),
        side);
      l.tabs = (step) => shift(step);
      l.back = back;
    }, { onClose: () => { layer = null; } });
    drawMonth(d);
  };
  cal.close = () => { if (layer) layer.close(); };
  cal.isOpen = () => !!layer;
  // Cuando llegan horas nuevas con el calendario abierto
  cal.refresh = () => { if (layer && selected) drawMonth(selected); };
  // El panel lateral sigue al día enfocado
  cal.onFocus = (el) => {
    if (!layer || !el || !el._date) return;
    if (sameDay(el._date, selected)) return;
    selected = el._date;
    drawSide();
  };

  A.calendar = cal;
})();
