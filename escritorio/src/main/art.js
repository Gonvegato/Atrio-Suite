'use strict';
// Gestión del arte: caché local, arte que ya trae cada tienda y SteamGridDB.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ART_DIR, exists, readJson, mkdirp } = require('./paths');

const TYPES = ['cover', 'wide', 'hero', 'logo', 'icon'];
const SGDB = process.env.ATRIO_SGDB_BASE || 'https://www.steamgriddb.com/api/v2';
const INDEX_PATH = path.join(ART_DIR, 'index.json');
const RETRY_MS = 7 * 24 * 3600 * 1000;
// Con clave de SteamGridDB, el logo y el fondo se reintentan a diario: son lo que más se ve
const RETRY_KEY_MS = 20 * 3600 * 1000;

let fetchImpl = (...a) => fetch(...a);
function setFetch(f) { fetchImpl = f; }

let index = null; // { sgdbIds: {key: id}, misses: {key: {type: ts}} }
function idx() {
  if (!index) index = readJson(INDEX_PATH, null) || { sgdbIds: {}, misses: {} };
  index.sgdbIds = index.sgdbIds || {};
  index.misses = index.misses || {};
  return index;
}
let saveTimer = null;
function saveIndex() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { mkdirp(ART_DIR); fs.writeFileSync(INDEX_PATH, JSON.stringify(idx())); } catch { /* sin caché */ }
  }, 500);
}

function dirFor(key) {
  return path.join(ART_DIR, crypto.createHash('sha1').update(key).digest('hex').slice(0, 20));
}

// 'herohd' es una versión del fondo reescalada para pantallas grandes (la genera la interfaz)
const CACHE_TYPES = [...TYPES, 'herohd'];

function cachedFiles(key) {
  const dir = dirFor(key);
  const out = {};
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return out; }
  for (const f of files) {
    const type = f.split('.')[0];
    if (CACHE_TYPES.includes(type) && !f.endsWith('.part')) out[type] = path.join(dir, f);
  }
  return out;
}

// Arte efectivo de un juego: caché propia > arte local de la tienda
function resolve(game) {
  const cached = cachedFiles(game.key);
  const local = game.localArt || {};
  const art = {};
  for (const t of TYPES) {
    const p = cached[t] || local[t];
    if (p && exists(p)) art[t] = p;
  }
  if (cached.herohd && art.hero) {
    // Un fondo de 3000 px o más no se reprocesa nunca: se usa el original tal cual
    const size = sizeOf(art.hero);
    if (size && size.w >= 3000) { try { fs.unlinkSync(cached.herohd); } catch { /* */ } }
    else art.herohd = cached.herohd;
  }
  return art;
}

const sizeCache = new Map();
function sizeOf(file) {
  let m = 0;
  try { m = fs.statSync(file).mtimeMs; } catch { return null; }
  const c = sizeCache.get(file);
  if (c && c.m === m) return c.s;
  const s = imageSize(file);
  sizeCache.set(file, { m, s });
  return s;
}

// Tamaño real de una imagen leyendo solo su cabecera (PNG, JPEG, WebP)
function imageSize(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(256 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const b = buf.subarray(0, n);
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
      const kind = b.toString('ascii', 12, 16);
      if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch { /* ilegible */ } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* */ } }
  return null;
}

function saveHd(key, buffer) {
  const dir = dirFor(key);
  mkdirp(dir);
  clearType(key, 'herohd');
  const dest = path.join(dir, 'herohd.jpg');
  fs.writeFileSync(dest + '.part', Buffer.from(buffer));
  fs.renameSync(dest + '.part', dest);
  return dest;
}

function extFrom(url, contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('icon')) return 'ico';
  const m = String(url).split('?')[0].match(/\.(png|jpe?g|webp|gif|ico)$/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'img';
}

function clearType(key, type) {
  const dir = dirFor(key);
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return; }
  for (const f of files) if (f.split('.')[0] === type) { try { fs.unlinkSync(path.join(dir, f)); } catch { /* */ } }
}

async function download(url, key, type) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (ct && !/image|octet-stream/i.test(ct)) throw new Error('No es una imagen');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) throw new Error('Imagen vacía');
  const dir = dirFor(key);
  mkdirp(dir);
  clearType(key, type);
  if (type === 'hero') clearType(key, 'herohd');
  const dest = path.join(dir, `${type}.${extFrom(url, ct)}`);
  fs.writeFileSync(dest + '.part', buf);
  fs.renameSync(dest + '.part', dest);
  // Se recuerda de dónde salió (así el móvil puede enseñar el mismo arte)
  idx().src = idx().src || {};
  idx().src[key] = { ...(idx().src[key] || {}), [type]: url };
  saveIndex();
  return dest;
}

// Dirección pública del arte de un juego (la que se descargó, o la de su tienda), o ''
function publicUrl(game, type) {
  const s = (idx().src || {})[game.key] || {};
  if (s[type] && cachedFiles(game.key)[type]) return s[type];
  const remote = { ...(game.steamAppId ? steamCdn(game.steamAppId) : {}), ...(game.remoteArt || {}) };
  return remote[type] || '';
}

function setFromFile(key, type, src) {
  if (idx().src && idx().src[key]) delete idx().src[key][type];
  const dir = dirFor(key);
  mkdirp(dir);
  clearType(key, type);
  if (type === 'hero') clearType(key, 'herohd');
  const ext = (path.extname(src).slice(1) || 'img').toLowerCase();
  const dest = path.join(dir, `${type}.${ext}`);
  fs.copyFileSync(src, dest);
  return dest;
}

function clearCached(key, type) {
  clearType(key, type);
  if (type === 'hero') clearType(key, 'herohd');
  const m = idx().misses[key];
  if (m) delete m[type];
}

function removeType(key, type) {
  clearType(key, type);
  if (type === 'hero') clearType(key, 'herohd');
  const m = idx().misses[key] || (idx().misses[key] = {});
  m[type] = Date.now() + 1e12; // no volver a buscarlo automáticamente
  saveIndex();
}

// ---------- SteamGridDB ----------
async function sgdb(apiKey, p, query = {}) {
  const qs = Object.entries(query).filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : v)}`).join('&');
  const res = await fetchImpl(`${SGDB}${p}${qs ? '?' + qs : ''}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  let body = null;
  try { body = await res.json(); } catch { /* */ }
  if (res.status === 401) throw new Error('Clave de SteamGridDB no válida');
  if (!res.ok || !body || body.success === false) {
    const msg = body && body.errors ? body.errors.join(', ') : `HTTP ${res.status}`;
    const e = new Error(msg); e.status = res.status; throw e;
  }
  return body.data;
}

async function searchGames(apiKey, term) {
  const data = await sgdb(apiKey, `/search/autocomplete/${encodeURIComponent(term)}`);
  return (data || []).map((g) => ({
    id: g.id, name: g.name, verified: !!g.verified,
    year: g.release_date ? new Date(g.release_date * 1000).getFullYear() : null,
  }));
}

async function gameId(apiKey, game, overrideId) {
  if (overrideId) return overrideId;
  const known = idx().sgdbIds[game.key];
  if (known) return known;
  let id = null;
  if (game.steamAppId) {
    try { const d = await sgdb(apiKey, `/games/steam/${game.steamAppId}`); id = d && d.id; } catch { /* buscar por nombre */ }
  }
  if (!id) {
    const res = await searchGames(apiKey, game.name);
    id = res.length ? res[0].id : null;
  }
  if (id) { idx().sgdbIds[game.key] = id; saveIndex(); }
  return id;
}

const ASSET_QUERY = {
  cover: ['/grids/game/', { dimensions: ['600x900', '342x482', '660x930'] }],
  wide: ['/grids/game/', { dimensions: ['920x430', '460x215'] }],
  hero: ['/heroes/game/', {}],
  logo: ['/logos/game/', {}],
  icon: ['/icons/game/', {}],
};

async function listAssets(apiKey, game, type, overrideId, page = 0) {
  const id = await gameId(apiKey, game, overrideId);
  if (!id) return { sgdbId: null, items: [] };
  const [p, q] = ASSET_QUERY[type];
  const data = await sgdb(apiKey, `${p}${id}`, { ...q, nsfw: 'false', page });
  return {
    sgdbId: id,
    items: (data || []).map((a) => ({
      id: a.id, url: a.url, thumb: a.thumb || a.url, width: a.width, height: a.height,
      style: a.style, mime: a.mime, score: a.score, author: a.author && a.author.name,
    })),
  };
}

function knownId(key) { return idx().sgdbIds[key] || null; }

function forgetSgdbId(key) {
  delete idx().sgdbIds[key];
  delete idx().misses[key];
  saveIndex();
}

// URLs públicas de Steam como último recurso (si fallan, se ignoran)
function steamCdn(appid) {
  const base = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}`;
  return { wide: `${base}/header.jpg`, cover: `${base}/library_600x900.jpg`, hero: `${base}/library_hero.jpg`, logo: `${base}/logo.png` };
}

// ---------- Descarga automática ----------
const queue = [];
let running = 0;
const MAX = 3;
const inFlight = new Set();

function enqueue(job) {
  if (inFlight.has(job.game.key)) return;
  inFlight.add(job.game.key);
  queue.push(job);
  pump();
}
function pump() {
  while (running < MAX && queue.length) {
    const job = queue.shift();
    running++;
    fillMissing(job).catch(() => {}).finally(() => {
      running--; inFlight.delete(job.game.key); pump();
      if (!queue.length && running === 0 && job.onIdle) job.onIdle();
    });
  }
}

async function fillMissing({ game, apiKey, wanted, onUpdate, force }) {
  const have = resolve(game);
  const misses = idx().misses[game.key] || {};
  const now = Date.now();
  const retryFor = (t) => (apiKey && (t === 'logo' || t === 'hero') ? RETRY_KEY_MS : RETRY_MS);
  const todo = wanted.filter((t) => !have[t] && (force || !misses[t] || now - misses[t] > retryFor(t)));
  // Fondo en baja resolución (p. ej. el de 1920x620 que guarda Steam): buscar uno de 3840 px
  let upgradeHero = false;
  if (apiKey && have.hero && wanted.includes('hero') && !(idx().hd || {})[game.key]) {
    const size = imageSize(have.hero);
    upgradeHero = !!size && size.w < 2600;
  }
  if (!todo.length && !upgradeHero) return;
  let changed = false;
  if (upgradeHero) {
    try {
      const { items } = await listAssets(apiKey, game, 'hero');
      const big = items.filter((i) => !/gif|webm/.test(i.mime || '') && (i.width || 0) >= 3000)[0];
      if (big) { await download(big.url, game.key, 'hero'); changed = true; }
      (idx().hd = idx().hd || {})[game.key] = now;
    } catch (e) {
      if (/no válida/.test(e.message)) throw e;
    }
  }
  const miss = (t) => { (idx().misses[game.key] = idx().misses[game.key] || {})[t] = now; };

  for (const t of todo) {
    let ok = false;
    if (apiKey) {
      try {
        const { items } = await listAssets(apiKey, game, t);
        // Preferimos imágenes estáticas; para el fondo, la de mayor resolución entre las mejor valoradas
        const stat = items.filter((i) => !/gif|webm/.test(i.mime || ''));
        const pick = (t === 'hero' && stat.slice(0, 12).find((i) => (i.width || 0) >= 3000)) || stat[0] || items[0];
        if (pick) { await download(pick.url, game.key, t); ok = true; }
      } catch (e) {
        if (/no válida/.test(e.message)) throw e;
      }
    }
    if (!ok) {
      const remote = { ...(game.steamAppId ? steamCdn(game.steamAppId) : {}), ...(game.remoteArt || {}) };
      if (remote[t]) {
        try { await download(remote[t], game.key, t); ok = true; } catch { /* nada */ }
      }
    }
    if (ok) changed = true; else miss(t);
  }
  saveIndex();
  if (changed && onUpdate) onUpdate(game.key, resolve(game));
}

module.exports = {
  publicUrl,
  knownId,
  TYPES, setFetch, resolve, download, setFromFile, removeType, clearCached, searchGames, listAssets, imageSize, saveHd,
  forgetSgdbId, enqueue, gameId, dirFor,
};
