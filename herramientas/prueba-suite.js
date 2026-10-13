#!/usr/bin/env node
'use strict';
// Prueba de la suite de punta a punta, sin móvil: Firebase de mentira + Atrio de verdad (bajo Xvfb) + un «móvil»
// simulado que hace lo mismo que Atrio en el móvil: ve el PC en directo, pide una captura, la baja, lanza un juego y
// comprueba que al cerrarlo llega la parte jugada para valorar.
// Uso (desde la raíz del repositorio): node herramientas/prueba-suite.js
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DESK = path.join(ROOT, 'escritorio');
const PORT = 9100 + Math.floor(Math.random() * 500);
const FB = `http://127.0.0.1:${PORT}`;
const OUT = process.env.OUT || path.join(os.tmpdir(), 'prueba-suite');
const HOME = path.join(OUT, 'home');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(HOME, '.config', 'atrio'), { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✔' : '  ✘'} ${msg}`); if (!cond) failed++; };

async function j(method, url, body) {
  const r = await fetch(url, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
}
async function until(fn, ms, every = 500) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn().catch(() => null); if (v) return v; await wait(every); }
  return null;
}

(async () => {
  const fake = spawn(process.execPath, [path.join(__dirname, 'fakefirebase.js'), String(PORT)], { stdio: 'inherit' });
  await wait(700);
  // Cuenta
  const su = await j('POST', `${FB}/v1/accounts:signUp?key=prueba`, { email: 'gonzalo@ronron.example.com', password: 'secreto1', returnSecureToken: true });
  const uid = su.localId;
  let tok = su.idToken;
  const db = (m, p, b, q = '') => j(m, `${FB}${p}.json?auth=${tok}${q}`, b);
  await db('PUT', '/config/webKey', 'prueba');
  // Lo que «el móvil» ya tiene en su cuenta: un juego en curso con el id de SteamGridDB 4242
  const play = { id: 4242, name: 'Juego de Prueba', cover: '', hero: '', status: 1, entries: [], chapter: 0, every: 3, start: 0, end: 0, creator: '', platform: 'PC', pages: 0, minutes: 0, updated: Date.now(), ttbMain: 0, ttbExtra: 0, ttbFull: 0, ttbSrc: '', parts: [], logo: '' };
  const data = { games: [], plays: [play], books: [], bplays: [], kinds: [], tombs: {}, kindsAt: 0, recs: [], reacts: {}, keys: {}, goals: {}, likes: {} };
  await db('PUT', `/users/${uid}/dev/mtest`, { name: 'gonzalo', user: 'gonzalo', device: 'android', updated: { '.sv': 'timestamp' }, data: JSON.stringify(data) });
  const ts = await db('GET', `/users/${uid}/dev/mtest/updated`);
  await db('PATCH', `/users/${uid}`, { 'stamps/mtest': ts });

  // Atrio con la sesión ya iniciada y un juego propio que el «móvil» lanzará
  const sig = await j('POST', `${FB}/v1/accounts:signInWithPassword?key=prueba`, { email: 'gonzalo@ronron.example.com', password: 'secreto1', returnSecureToken: true });
  fs.writeFileSync(path.join(HOME, '.config', 'atrio', 'ronron.json'), JSON.stringify({ db: FB, authBase: FB, webKey: 'prueba', uid, user: 'gonzalo', refresh: sig.refreshToken, dev: 'atrio-prueba', seen: {} }));
  const game = path.join(OUT, 'juego-de-prueba.sh');
  fs.writeFileSync(game, '#!/bin/sh\nsleep 600\n', { mode: 0o755 });
  fs.writeFileSync(path.join(HOME, '.config', 'atrio', 'config.json'), JSON.stringify({
    sources: { steam: false, heroic: false, lutris: false, emulators: false, custom: true },
    customGames: [{ id: 'prueba', name: 'Juego de Prueba', exec: game, runner: 'native' }],
    overrides: { 'custom:prueba': { sgdbId: 4242 } },
    behavior: { autostart: 'off', fullscreen: false, onLaunch: 'none' },
    suite: { segMin: -1 },
  }));
  const env = { ...process.env, ATRIO_HOME: HOME, ATRIO_RONRON_DB: FB, ATRIO_RONRON_AUTH: FB, ATRIO_RONRON_EVERY: '3000', ATRIO_SUITE_BEAT: '4000', ATRIO_NO_SANDBOX: '1', ATRIO_POWER_DRY: '1' };
  for (const k of ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_CURRENT_DESKTOP', 'WAYLAND_DISPLAY']) delete env[k];
  const electron = path.join(DESK, 'node_modules', 'electron', 'dist', 'electron');
  const atrio = spawn('xvfb-run', ['-a', '-s', '-screen 0 2560x1440x24', electron, '--no-sandbox', '--ventana', DESK], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = [];
  atrio.stdout.on('data', (d) => logs.push(String(d)));
  atrio.stderr.on('data', (d) => logs.push(String(d)));

  try {
    console.log('1. El PC aparece en directo');
    const live = await until(async () => { const v = await db('GET', `/users/${uid}/suite/live/atrio-prueba`); return v && v.on ? v : null; }, 40000);
    ok(!!live, `Atrio conectado (${live ? live.name : '-'})`);
    const lib = await until(async () => { const v = await db('GET', `/users/${uid}/suite/lib/atrio-prueba`); return v && v.games && v.games.length ? v : null; }, 20000);
    ok(lib && lib.games.some((g) => g.k === 'custom:prueba'), 'Biblioteca del PC publicada para el móvil');

    console.log('2. Orden simple (ping)');
    const send = async (op, a) => {
      const r = await db('POST', `/users/${uid}/suite/cmd/atrio-prueba`, { op, a: a || {}, t: { '.sv': 'timestamp' }, by: 'Móvil de prueba' });
      return until(async () => { const v = await db('GET', `/users/${uid}/suite/cmd/atrio-prueba/${r.name}/res`); return v || null; }, 60000, 300);
    };
    const t0 = Date.now();
    const pong = await send('ping');
    ok(pong && pong.ok, `Respuesta en ${Date.now() - t0} ms: ${pong && pong.msg}`);

    console.log('3. Captura desde el móvil a calidad original');
    const t1 = Date.now();
    const shot = await send('shot');
    ok(shot && shot.ok && shot.shot, `Captura hecha: ${shot && shot.msg}`);
    if (shot && shot.shot) {
      const meta = await until(async () => { const v = await db('GET', `/users/${uid}/suite/shots/${shot.shot}`); return v && v.done ? v : null; }, 30000);
      ok(!!meta, `Subida completa: ${meta && meta.n} trozos, ${meta && Math.round(meta.bytes / 1024)} KB, método ${meta && meta.m}`);
      if (meta) {
        let b64 = '';
        for (let i = 0; i < meta.n; i++) b64 += await db('GET', `/users/${uid}/shotdata/${shot.shot}/${i}`);
        const buf = Buffer.from(b64, 'base64');
        fs.writeFileSync(path.join(OUT, 'captura.png'), buf);
        const w = buf.readUInt32BE(16);
        const h = buf.readUInt32BE(20);
        ok(buf.length === meta.bytes && w === 2560 && h === 1440, `Bajada idéntica (${buf.length} bytes) y a la resolución de la pantalla: ${w}×${h} en ${Date.now() - t1} ms`);
        await db('PATCH', `/users/${uid}/suite/shots/${shot.shot}/got`, { mtest: Date.now() });
        const gone = await until(async () => { const v = await db('GET', `/users/${uid}/suite/shots/${shot.shot}`); return v && v.gone ? v : null; }, 20000);
        ok(!!gone, 'Los trozos se borran de la nube cuando el móvil ya la tiene');
      }
    }

    console.log('4. Lanzar un juego desde el móvil y verlo en directo');
    const la = await send('launch', { key: 'custom:prueba' });
    ok(la && la.ok, `Lanzado: ${la && la.msg}`);
    const playing = await until(async () => { const v = await db('GET', `/users/${uid}/suite/live/atrio-prueba`); return v && v.game ? v : null; }, 30000);
    ok(playing && playing.game.name === 'Juego de Prueba' && playing.game.sg === 4242, `El móvil ve «${playing && playing.game.name}» en marcha`);

    console.log('5. Al cerrar el juego llega la parte jugada para valorar');
    await wait(33000); // las partidas de menos de 30 s no cuentan (arranques fallidos)
    spawn('pkill', ['-f', game]);
    const seg = await until(async () => {
      const st = await db('GET', `/users/${uid}/stamps`);
      for (const dev of Object.keys(st || {})) {
        if (dev === 'mtest') continue;
        const raw = await db('GET', `/users/${uid}/dev/${dev}/data`);
        const d = JSON.parse(raw || '{}');
        const p = (d.plays || []).find((x) => x.id === 4242);
        if (p && p.segs && p.segs.length) return p.segs[0];
      }
      return null;
    }, 40000, 1000);
    ok(seg && seg.src === 'atrio', `Parte jugada en la ficha: ${seg ? JSON.stringify(seg) : '-'}`);
    const idle = await until(async () => { const v = await db('GET', `/users/${uid}/suite/live/atrio-prueba`); return v && !v.game ? v : null; }, 20000);
    ok(!!idle, 'El directo vuelve a «sin jugar»');

    console.log('5b. Guías: una web adjuntada desde el móvil llega al juego del PC');
    await db('POST', `/users/${uid}/suite/inbox/atrio-prueba`, { op: 'link', key: 'custom:prueba', u: 'https://deadlock.wiki/Heroes', n: 'Wiki', t: { '.sv': 'timestamp' }, by: 'Móvil de prueba' });
    const libw = await until(async () => {
      const v = await db('GET', `/users/${uid}/suite/lib/atrio-prueba`);
      const g = v && v.games && v.games.find((x) => x.k === 'custom:prueba');
      return g && g.w && g.w.some((l) => l.u === 'https://deadlock.wiki/Heroes') ? g : null;
    }, 20000);
    ok(!!libw, 'La web queda guardada en el juego del PC y el móvil la ve en su biblioteca');
    const inboxLeft = await db('GET', `/users/${uid}/suite/inbox/atrio-prueba`);
    ok(!inboxLeft, 'El buzón se vacía al recogerla');
    const cfgNow = JSON.parse(fs.readFileSync(path.join(HOME, '.config', 'atrio', 'config.json'), 'utf8'));
    ok(((cfgNow.overrides['custom:prueba'] || {}).links || []).length === 1, 'Guardada en la configuración de Atrio');
    const gd = await send('guide', { key: 'custom:prueba', url: 'https://deadlock.wiki/Heroes' });
    ok(gd && gd.ok, `Abrir la guía en el PC desde el móvil: ${gd && gd.msg}`);

    console.log('6. Un cambio del móvil llega al PC al momento');
    const d2 = { ...data, plays: [{ ...play, memos: [{ t: Date.now(), x: 'Apunte desde el móvil' }], updated: Date.now() + 1 }] };
    await db('PUT', `/users/${uid}/dev/mtest`, { name: 'gonzalo', user: 'gonzalo', device: 'android', updated: { '.sv': 'timestamp' }, data: JSON.stringify(d2) });
    const ts2 = await db('GET', `/users/${uid}/dev/mtest/updated`);
    const t2 = Date.now();
    await db('PATCH', `/users/${uid}`, { 'stamps/mtest': ts2 });
    const merged = await until(async () => {
      const f = path.join(HOME, '.local', 'share', 'atrio', 'ronron-datos.json');
      const d = JSON.parse(fs.readFileSync(f, 'utf8')).data;
      const p = (d.plays || []).find((x) => x.id === 4242);
      return p && p.memos && p.memos.length && p.segs && p.segs.length ? p : null;
    }, 15000, 200);
    ok(!!merged, `Mezclado en Atrio en ${Date.now() - t2} ms sin perder la parte jugada`);
  } catch (e) {
    console.log('ERROR', e);
    failed++;
  } finally {
    atrio.kill('SIGTERM');
    spawn('pkill', ['-f', game]);
    await wait(1500);
    fake.kill();
    fs.writeFileSync(path.join(OUT, 'atrio.log'), logs.join(''));
    console.log(failed ? `\n${failed} comprobaciones fallidas (registro en ${OUT}/atrio.log)` : '\nTodo bien');
    process.exit(failed ? 1 : 0);
  }
})();
