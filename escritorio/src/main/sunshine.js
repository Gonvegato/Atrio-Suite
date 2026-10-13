'use strict';
// Streaming: Atrio se encarga de Sunshine (el servidor de streaming del PC) para que desde el móvil puedas jugar
// con Moonlight en casa o fuera de ella.
//
//  · Lo encuentra (paquete del sistema, Flatpak o Windows), mira si está en marcha y lo arranca si hace falta.
//  · Lee su identificador y su nombre (los que ve Moonlight) para que el móvil abra Moonlight directo en este PC.
//  · Mete el PIN de emparejamiento que escribes en el móvil (API de Sunshine, con tu usuario y contraseña de Sunshine).
//  · Mira Tailscale (para jugar con datos fuera de casa) y las direcciones de red y MAC (para encender el PC por red).
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

const FLATPAK = 'dev.lizardbyte.app.Sunshine';
// Pruebas: puerto de la API web propio (el de Sunshine es el base + 1)
const API_HOST = process.env.ATRIO_SUNSHINE_HOST || '127.0.0.1';
let info = { installed: false, running: false };
let timer = null;
let onChange = () => {};
let getCfg = () => ({});
let logf = () => {};

const run = (bin, args, ms = 8000) => new Promise((resolve) => {
  execFile(bin, args, { timeout: ms, windowsHide: true, env: require('./launcher').cleanEnv() }, (err, out, errOut) => resolve({ ok: !err, out: String(out || ''), err: String(errOut || (err && err.message) || '') }));
});
const which = (bin) => require('./launcher').which(bin);

function dirs() {
  const home = process.env.ATRIO_HOME || os.homedir();
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    return [
      { kind: 'win', bin: path.join(pf, 'Sunshine', 'sunshine.exe'), conf: path.join(pf, 'Sunshine', 'config') },
      { kind: 'win', bin: path.join(pf, 'Apollo', 'sunshine.exe'), conf: path.join(pf, 'Apollo', 'config') },
    ];
  }
  return [
    { kind: 'sys', bin: which('sunshine'), conf: path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'sunshine') },
    { kind: 'flatpak', bin: fs.existsSync(`/var/lib/flatpak/app/${FLATPAK}`) || fs.existsSync(path.join(home, '.local/share/flatpak/app', FLATPAK)) ? 'flatpak' : null,
      conf: path.join(home, '.var/app', FLATPAK, 'config/sunshine') },
  ];
}

// sunshine.conf: líneas «clave = valor»
function readConf(file) {
  const out = {};
  try {
    for (const l of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([\w.]+)\s*=\s*(.*?)\s*$/.exec(l);
      if (m && !l.trim().startsWith('#')) out[m[1]] = m[2];
    }
  } catch { /* sin fichero: valores por defecto */ }
  return out;
}

function portOpen(port, host = '127.0.0.1', ms = 700) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    const done = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(ms, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

function lan() {
  const ips = [];
  const macs = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/^(lo|docker|br-|veth|virbr|tailscale|zt|wg)/i.test(name)) continue;
    for (const a of list || []) {
      if (a.internal || a.family !== 'IPv4') continue;
      if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a.address)) continue; // 100.64/10: Tailscale
      ips.push(a.address);
      if (a.mac && a.mac !== '00:00:00:00:00:00' && !macs.includes(a.mac)) macs.push(a.mac);
    }
  }
  return { ips, macs };
}

async function tailscale() {
  const bin = which(process.platform === 'win32' ? 'tailscale.exe' : 'tailscale')
    || (process.platform === 'win32' && fs.existsSync('C:\\Program Files\\Tailscale\\tailscale.exe') ? 'C:\\Program Files\\Tailscale\\tailscale.exe' : null);
  if (!bin) return null;
  const r = await run(bin, ['status', '--json'], 5000);
  if (!r.ok) return { installed: true, up: false };
  try {
    const j = JSON.parse(r.out);
    const self = j.Self || {};
    const ip = (self.TailscaleIPs || []).find((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x)) || null;
    return { installed: true, up: j.BackendState === 'Running' && !!ip, ip, dns: String(self.DNSName || '').replace(/\.$/, '') || null };
  } catch { return { installed: true, up: false }; }
}

async function refresh() {
  const found = dirs().find((d) => d.bin && (d.kind !== 'win' || fs.existsSync(d.bin))) || null;
  const d = found || dirs()[0];
  const conf = readConf(path.join(d.conf, 'sunshine.conf'));
  const port = Number(conf.port) || 47989;
  let uuid = null;
  try {
    const st = JSON.parse(fs.readFileSync(path.join(d.conf, conf.file_state || 'sunshine_state.json'), 'utf8'));
    uuid = (st.root && st.root.uniqueid) || null;
  } catch { /* aún no ha arrancado nunca */ }
  const running = await portOpen(port);
  const next = {
    installed: !!found || running, kind: found ? found.kind : null, running,
    name: conf.sunshine_name || os.hostname(), uuid, port, web: `https://localhost:${port + 1}`,
    app: (getCfg().app || 'Desktop'),
    ...lan(),
    ts: await tailscale().catch(() => null),
    creds: !!(getCfg().user && getCfg().pass),
  };
  const changed = JSON.stringify(next) !== JSON.stringify(info);
  info = next;
  if (changed) onChange(info);
  return info;
}

// Arranca Sunshine (servicio de usuario, Flatpak o el programa)
async function startService() {
  await refresh();
  if (info.running) return info;
  if (!info.installed) throw new Error('Sunshine no está instalado en este PC. En Atrio: Ajustes → Streaming.');
  const tries = process.platform === 'win32'
    ? [[dirs().find((x) => fs.existsSync(x.bin)).bin, []]]
    : [['systemctl', ['--user', 'start', 'app-dev.lizardbyte.app.Sunshine.service']], ['systemctl', ['--user', 'start', 'sunshine.service']]];
  for (const [bin, args] of tries) {
    const r = await run(bin, args, 10000);
    if (r.ok) break;
    logf('sunshine: no arranca con', bin, args.join(' '), r.err.slice(0, 160));
  }
  for (let i = 0; i < 20 && !(await refresh()).running; i++) await new Promise((r) => setTimeout(r, 750));
  if (!info.running) {
    // Sin servicio: el programa directamente (sigue vivo aunque se cierre Atrio)
    if (info.kind === 'flatpak') await require('./launcher').spawnDetached('flatpak', ['run', FLATPAK]).catch(() => {});
    else if (info.kind === 'sys') await require('./launcher').spawnDetached(which('sunshine'), []).catch(() => {});
    for (let i = 0; i < 24 && !(await refresh()).running; i++) await new Promise((r) => setTimeout(r, 750));
  }
  if (!info.running) throw new Error('No he podido arrancar Sunshine. Ábrelo a mano una vez y vuelve a probar.');
  return info;
}

// API web de Sunshine (https con certificado propio, solo en este PC)
function api(method, p, body) {
  const c = getCfg();
  if (!c.user || !c.pass) return Promise.reject(new Error('Falta tu usuario y contraseña de Sunshine en Atrio (Ajustes → Streaming).'));
  const data = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: API_HOST, port: (info.port || 47989) + 1, path: p, method, rejectUnauthorized: false, timeout: 130000,
      headers: { Authorization: `Basic ${Buffer.from(`${c.user}:${c.pass}`).toString('base64')}`, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let t = '';
      res.on('data', (d) => { t += d; });
      res.on('end', () => {
        if (res.statusCode === 401) return reject(new Error('Sunshine no acepta el usuario o la contraseña guardados en Atrio.'));
        let j = null;
        try { j = JSON.parse(t); } catch { /* */ }
        if (res.statusCode >= 400) return reject(new Error((j && (j.error || j.message)) || `Sunshine ha contestado ${res.statusCode}`));
        resolve(j);
      });
    });
    req.on('timeout', () => req.destroy(new Error('Sunshine no contesta')));
    req.on('error', (e) => reject(new Error(/ECONNREFUSED/.test(e.message) ? 'Sunshine no está en marcha.' : e.message)));
    if (data) req.write(data);
    req.end();
  });
}

// PIN de emparejamiento (el que enseña Moonlight en el móvil)
async function pin(code, name) {
  code = String(code || '').replace(/\D/g, '');
  if (code.length !== 4) throw new Error('El PIN son 4 números.');
  await startService();
  const nm = String(name || 'Móvil').slice(0, 60);
  // Sunshine moderno: lista de emparejamientos pendientes (pairing_id); el antiguo solo quiere el PIN
  let pending = null;
  try { pending = await api('GET', '/api/pin'); } catch (e) { if (/usuario|contraseña|Falta/.test(e.message)) throw e; }
  let r;
  if (pending && Array.isArray(pending.pairings)) {
    if (!pending.pairings.length) throw new Error('Sunshine no tiene ningún emparejamiento esperando: en Moonlight, toca el PC para que salga el PIN y vuelve a probar.');
    const p = pending.pairings[pending.pairings.length - 1];
    r = await api('POST', '/api/pin', { pairing_id: p.id, pin: code, name: nm });
  } else {
    r = await api('POST', '/api/pin', { pin: code, name: nm });
  }
  if (!r || r.status === false || r.status === 'false') throw new Error('Sunshine no ha aceptado el PIN (¿ha caducado? vuelve a tocar el PC en Moonlight).');
  setTimeout(() => refresh().catch(() => {}), 1500);
  return true;
}

async function clients() {
  const r = await api('GET', '/api/clients/list');
  return (r && (r.named_certs || r.clients)) || [];
}

function init(opts) {
  onChange = opts.onChange || onChange;
  getCfg = opts.config || getCfg;
  logf = opts.log || logf;
  refresh().catch(() => {});
  clearInterval(timer);
  timer = setInterval(() => refresh().catch(() => {}), 30000);
}

module.exports = { init, refresh, info: () => info, startService, pin, clients, api };
