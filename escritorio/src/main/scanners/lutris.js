'use strict';
const path = require('path');
const { execFile } = require('child_process');
const { HOME, XDG_DATA, XDG_CACHE, exists } = require('../paths');
const { sortKey } = require('../util');

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 25000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) return resolve(null);
      resolve(String(stdout || ''));
    });
  });
}

// Lutris imprime a veces trazas antes del JSON: extraemos el primer array
function extractJsonArray(out) {
  if (!out) return null;
  const start = out.indexOf('[');
  const end = out.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(out.slice(start, end + 1)); } catch { return null; }
}

function localArt(slug) {
  if (!slug) return {};
  const art = {};
  const coverDirs = [path.join(XDG_DATA, 'lutris', 'coverart'), path.join(XDG_CACHE, 'lutris', 'coverart'),
    path.join(HOME, '.var/app/net.lutris.Lutris/data/lutris/coverart')];
  const bannerDirs = [path.join(XDG_DATA, 'lutris', 'banners'), path.join(XDG_CACHE, 'lutris', 'banners'),
    path.join(HOME, '.var/app/net.lutris.Lutris/data/lutris/banners')];
  for (const d of coverDirs) for (const ext of ['jpg', 'png']) {
    const p = path.join(d, `${slug}.${ext}`);
    if (!art.cover && exists(p)) art.cover = p;
  }
  for (const d of bannerDirs) for (const ext of ['jpg', 'png']) {
    const p = path.join(d, `${slug}.${ext}`);
    if (!art.wide && exists(p)) art.wide = p;
  }
  return art;
}

async function scan(cfg) {
  // Lutris solo existe en Linux
  if (process.platform === 'win32') return { available: false, games: [], windows: true };
  let list = extractJsonArray(await run('lutris', ['-l', '-o', '-j']));
  let flatpak = false;
  if (!list && exists(path.join(HOME, '.var/app/net.lutris.Lutris'))) {
    list = extractJsonArray(await run('flatpak', ['run', 'net.lutris.Lutris', '-l', '-o', '-j']));
    flatpak = !!list;
  }
  if (!list) return { games: [], available: false };
  const games = [];
  for (const g of list) {
    if (!g || g.id == null) continue;
    // Los juegos de Steam ya los leemos directamente desde Steam
    if (cfg.sources.steam && String(g.runner || '').toLowerCase() === 'steam') continue;
    const name = g.name || g.slug || `Lutris ${g.id}`;
    const uri = `lutris:rungameid/${g.id}`;
    games.push({
      key: `lutris:${g.id}`,
      source: 'lutris',
      sourceLabel: 'Lutris',
      name,
      sortName: sortKey(name),
      platform: g.platform || g.runner || '',
      localArt: localArt(g.slug),
      launch: flatpak
        ? { type: 'exec', cmd: 'flatpak', args: ['run', 'net.lutris.Lutris', uri] }
        : { type: 'exec', cmd: 'lutris', args: [uri] },
    });
  }
  return { games, available: true };
}

module.exports = { scan };
