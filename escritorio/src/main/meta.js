'use strict';
// Datos de la tienda de Steam: estudio, editor, fecha, géneros, descripción, Metacritic y
// valoraciones de los jugadores. Se guardan en local y se renuevan cada dos semanas.
// Para juegos que no son de Steam se busca el juego por nombre en la tienda (solo si coincide).
const fs = require('fs');
const path = require('path');
const { XDG_DATA, readJson, mkdirp } = require('./paths');

const FILE = path.join(XDG_DATA, 'atrio', 'meta.json');
const MAX_AGE = 14 * 24 * 3600 * 1000;
const MISS_AGE = 3 * 24 * 3600 * 1000;

let fetchImpl = (...a) => fetch(...a);
function setFetch(f) { fetchImpl = f; }

let store = null; // { byKey: {key: {appid, t}}, apps: {appid: {...datos, t}} }
function db() {
  if (!store) store = readJson(FILE, null) || {};
  store.byKey = store.byKey || {};
  store.apps = store.apps || {};
  return store;
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { mkdirp(path.dirname(FILE)); fs.writeFileSync(FILE, JSON.stringify(db())); } catch { /* sin espacio */ }
  }, 400);
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[™®©]/g, '').replace(/[^a-z0-9]+/g, '');

async function getJson(url) {
  const res = await fetchImpl(url, { headers: { 'Accept-Language': 'es-ES,es;q=0.9' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Etiqueta de Steam calculada a partir del porcentaje y del número de reseñas
function label(pct, total) {
  if (!total) return null;
  if (total < 10) return 'Pocas reseñas';
  if (pct >= 95 && total >= 500) return 'Extremadamente positivas';
  if (pct >= 80 && total >= 50) return 'Muy positivas';
  if (pct >= 80) return 'Positivas';
  if (pct >= 70) return 'Mayormente positivas';
  if (pct >= 40) return 'Variadas';
  if (pct >= 20) return 'Mayormente negativas';
  if (total >= 500) return 'Extremadamente negativas';
  if (total >= 50) return 'Muy negativas';
  return 'Negativas';
}

async function fetchReviews(appid) {
  const pick = (j) => (j && (j.query_summary || (j.response && j.response.query_summary))) || null;
  let q = null;
  try {
    q = pick(await getJson(`https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?appid=${appid}&languages%5B0%5D=all&num_per_page=0&purchase_type=1&filter_offtopic_activity=0`));
  } catch { /* se prueba el método anterior */ }
  if (!q || q.total_reviews === undefined) {
    try { q = pick(await getJson(`https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`)); } catch { /* sin reseñas */ }
  }
  if (!q || !q.total_reviews) return null;
  const total = Number(q.total_reviews) || 0;
  const pos = Number(q.total_positive) || 0;
  const pct = total ? Math.round((pos / total) * 100) : 0;
  return { total, pct, label: label(pct, total) };
}

async function fetchDetails(appid) {
  const j = await getJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=spanish&cc=ES`);
  const e = j && j[appid];
  if (!e || !e.success || !e.data) return null;
  const d = e.data;
  const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  return {
    name: d.name || null,
    developers: Array.isArray(d.developers) ? d.developers.slice(0, 3) : [],
    publishers: Array.isArray(d.publishers) ? d.publishers.slice(0, 3) : [],
    release: d.release_date && d.release_date.date ? String(d.release_date.date) : null,
    comingSoon: !!(d.release_date && d.release_date.coming_soon),
    genres: Array.isArray(d.genres) ? d.genres.map((g) => g.description).filter(Boolean).slice(0, 4) : [],
    // Juego online: multijugador sin modo de un jugador (Deadlock, Dota 2, CS2…) o MMO (género 29 de Steam)
    online: (() => {
      const cats = new Set((Array.isArray(d.categories) ? d.categories : []).map((c) => Number(c.id)));
      const mmo = (Array.isArray(d.genres) ? d.genres : []).some((g) => Number(g.id) === 29);
      return mmo || (cats.has(1) && !cats.has(2));
    })(),
    description: strip(d.short_description).slice(0, 400) || null,
    metacritic: d.metacritic && d.metacritic.score ? Number(d.metacritic.score) : null,
    controller: d.controller_support || null,
    deck: null,
  };
}

// Busca en la tienda un juego que no es de Steam; solo vale si el nombre coincide
async function findAppId(name) {
  const j = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=spanish&cc=ES`);
  const items = (j && j.items) || [];
  const want = norm(name);
  const hit = items.find((i) => norm(i.name) === want);
  return hit ? String(hit.id) : null;
}

const inflight = new Map();

// Datos guardados para un juego (sin pedir nada)
function get(game) {
  const s = db();
  const appid = game.steamAppId || (s.byKey[game.key] && s.byKey[game.key].appid);
  if (!appid) return null;
  const a = s.apps[appid];
  return a && !a.missing ? { ...a, appid } : null;
}

// Pide los datos si faltan o están viejos; devuelve los datos o null
async function ensure(game) {
  if (!game || game.source === 'emulators') return null;
  const s = db();
  const now = Date.now();
  let appid = game.steamAppId || null;
  if (!appid) {
    const k = s.byKey[game.key];
    // Se repite la búsqueda si has cambiado el nombre del juego desde la última vez
    const sameName = k && (k.name === undefined || k.name === game.name);
    if (k && sameName && (k.appid || now - k.t < MISS_AGE)) appid = k.appid || null;
    else {
      try { appid = await findAppId(game.name); } catch { appid = null; }
      s.byKey[game.key] = { appid, t: now, name: game.name };
      save();
    }
    if (!appid) return null;
  }
  const cur = s.apps[appid];
  if (cur && now - cur.t < (cur.missing ? MISS_AGE : MAX_AGE)) return cur.missing ? null : { ...cur, appid };
  if (inflight.has(appid)) return inflight.get(appid);
  const p = (async () => {
    try {
      const [details, reviews] = await Promise.all([fetchDetails(appid).catch(() => null), fetchReviews(appid).catch(() => null)]);
      if (!details && !reviews) {
        s.apps[appid] = { missing: true, t: Date.now() };
        save();
        return cur && !cur.missing ? { ...cur, appid } : null;
      }
      s.apps[appid] = { ...(details || {}), reviews, t: Date.now() };
      save();
      return { ...s.apps[appid], appid };
    } finally {
      inflight.delete(appid);
    }
  })();
  inflight.set(appid, p);
  return p;
}

module.exports = { get, ensure, setFetch, label };
