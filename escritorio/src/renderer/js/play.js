'use strict';
/* global A */
// Horas de juego: totales por juego y reparto por días (partiendo las sesiones a medianoche)
(function () {
  let data = { sessions: [], active: [] };
  let cache = null;

  function set(d) { data = d || { sessions: [], active: [] }; cache = null; }

  // Sesiones cerradas + las que están en curso (hasta ahora)
  function all() {
    const now = Date.now();
    return [
      ...data.sessions.map(([k, s, e]) => ({ k, s, e, live: false })),
      ...data.active.map((a) => ({ k: a.k, s: a.s, e: Math.max(a.last || now, now), live: true })),
    ];
  }

  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Cada sesión se apunta al juego que existe ahora en la biblioteca: los que se juntaron con su acceso
  // directo de Steam conservan su historial y los que ya no están desaparecen (las horas no se borran:
  // si vuelve a la biblioteca, vuelven a salir)
  let gamesRef = null;
  let resolveMap = null;
  function resolver() {
    const games = (A.app && A.app.state && A.app.state().games) || null;
    if (games !== gamesRef) {
      gamesRef = games;
      cache = null;
      resolveMap = null;
      if (games && games.length) {
        resolveMap = new Map();
        for (const g of games) {
          resolveMap.set(g.key, g.key);
          for (const k of g.aliasKeys || []) if (!resolveMap.has(k)) resolveMap.set(k, g.key);
        }
      }
    }
    return resolveMap;
  }

  function build() {
    const map = resolver();
    if (cache) return cache;
    const totals = new Map();
    const days = new Map(); // 'AAAA-MM-DD' -> { total, games: Map(k -> ms), sessions: [] }
    for (const raw of all()) {
      // Sin biblioteca cargada todavía se cuenta todo tal cual
      const k = map ? map.get(raw.k) : raw.k;
      if (!k) continue;
      const ses = { ...raw, k };
      totals.set(ses.k, (totals.get(ses.k) || 0) + (ses.e - ses.s));
      let start = ses.s;
      while (start < ses.e) {
        const d = new Date(start);
        const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
        const end = Math.min(ses.e, next);
        const key = dayKey(d);
        if (!days.has(key)) days.set(key, { total: 0, games: new Map(), sessions: [] });
        const day = days.get(key);
        day.total += end - start;
        day.games.set(ses.k, (day.games.get(ses.k) || 0) + (end - start));
        day.sessions.push({ k: ses.k, s: start, e: end, live: ses.live && end === ses.e });
        start = end;
      }
    }
    cache = { totals, days };
    return cache;
  }

  function total(key) { return build().totals.get(key) || 0; }
  function isPlaying(key) { return data.active.some((a) => a.k === key); }
  function day(date) { return build().days.get(dayKey(date)) || null; }

  function month(year, m) {
    const out = { total: 0, daysPlayed: 0, games: new Map() };
    for (const [k, d] of build().days) {
      const [y, mm] = k.split('-').map(Number);
      if (y !== year || mm !== m + 1) continue;
      out.total += d.total;
      if (d.total > 0) out.daysPlayed++;
      for (const [g, ms] of d.games) out.games.set(g, (out.games.get(g) || 0) + ms);
    }
    return out;
  }

  // "2 h 15 min", "45 min", "menos de 1 min"
  function fmt(ms, short) {
    const min = Math.round(ms / 60000);
    if (min < 1) return short ? '<1 min' : 'menos de 1 min';
    const h = Math.floor(min / 60), m = min % 60;
    if (!h) return `${m} min`;
    if (short) return m ? `${h} h ${m}` : `${h} h`;
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  function hasData() { return data.sessions.length > 0 || data.active.length > 0; }

  // Sesiones de un juego, de la más reciente a la más antigua
  function sessionsOf(key) {
    const map = resolver();
    return all().filter((s) => (map ? map.get(s.k) : s.k) === key).sort((a, b) => b.s - a.s);
  }

  // Tiempo total que se muestra: el mayor entre lo registrado por Atrio y lo que dice Steam
  function best(game) {
    const mine = total(game.key);
    const steam = game.steamPlaytime || 0;
    return steam > mine ? { ms: steam, from: 'steam' } : { ms: mine, from: 'atrio' };
  }

  A.play = { set, total, best, isPlaying, day, month, fmt, dayKey, hasData, sessionsOf, invalidate: () => { cache = null; } };
})();
