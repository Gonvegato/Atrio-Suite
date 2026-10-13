'use strict';
// Esconde las ventanas de Steam («Preparando para iniciar…», o Steam entero si estaba cerrado) mientras
// arranca un juego lanzado desde Atrio. Solo en KDE Plasma (Wayland o X11), con un script de KWin.
//
// El script se carga una sola vez por sesión (KWin reutiliza los números de script al descargar y cargar,
// así que cargar uno nuevo en cada lanzamiento puede acabar arrancando otro script). Atrio le avisa
// cambiando el título de su ventana a «Atrio · iniciando juego» mientras el juego arranca:
//   · cada ventana de Steam que aparece o se pone delante en ese rato se vuelve invisible y se minimiza;
//   · cuando aparece otra ventana normal (el juego), Steam se queda minimizado detrás y el episodio acaba;
//   · si el juego no aparece en 90 s (Steam pide algo: actualizar, un aviso…), Steam vuelve a verse.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { APP_CACHE_DIR, mkdirp } = require('./paths');

const NAME = 'atrio-ocultar-steam-3';
const OLD_NAMES = ['atrio-ocultar-steam-1', 'atrio-ocultar-steam-2'];
const FILE = path.join(APP_CACHE_DIR, `${NAME}.js`);
let launches = 0;
const GIVE_BACK_MS = Number(process.env.ATRIO_KWIN_LIMIT) || 90 * 1000;
const ARMED_MS = GIVE_BACK_MS + 10 * 1000;

const SCRIPT = (limit) => `
// Script de Atrio: esconde Steam mientras arranca un juego lanzado desde Atrio
var hidden = [];
function cls(w) { return String(w.resourceClass || '') + ' ' + String(w.resourceName || ''); }
function isSteam(w) { var c = cls(w); return /steam/i.test(c) && !/steam_app_|steam_proton/i.test(c); }
function isAtrio(w) { return /atrio/i.test(cls(w)); }
function windows() { return workspace.windowList ? workspace.windowList() : workspace.clientList(); }
// Devuelve la marca del lanzamiento en curso («iniciando juego (N)» en el título de Atrio) o null
function launching() {
  var list = windows();
  for (var i = 0; i < list.length; i++) {
    if (!isAtrio(list[i])) continue;
    var m = String(list[i].caption || '').match(/iniciando[^(]*\\((\\d+)\\)/i);
    if (m) return m[1];
  }
  return null;
}
var gameSeen = null; // lanzamiento cuyo juego ya ha salido: a partir de ahí Steam no se toca
var timer = new QTimer();
timer.singleShot = true;
timer.interval = ${limit};
function giveBack() {
  // Este lanzamiento ya no se toca más: Steam necesita que lo veas
  gameSeen = launching();
  var last = null;
  for (var i = 0; i < hidden.length; i++) {
    var h = hidden[i];
    try { h.w.opacity = h.opacity; h.w.minimized = false; last = h.w; } catch (e) {}
  }
  hidden = [];
  if (last) setActive(last);
}
// El juego ya está: Steam vuelve a ser normal pero se queda minimizado detrás
function finish() {
  timer.stop();
  for (var i = 0; i < hidden.length; i++) { try { hidden[i].w.opacity = hidden[i].opacity; } catch (e) {} }
  hidden = [];
}
function setActive(w) {
  try { if ('activeWindow' in workspace) workspace.activeWindow = w; else workspace.activeClient = w; } catch (e) {}
}
// Atrio vuelve a ser la ventana activa: una ventana a pantalla completa solo tapa el panel
// mientras está activa (si no, el panel de Plasma aparece por encima)
function focusAtrio() {
  var list = windows();
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    if (isAtrio(a) && a.normalWindow && !a.minimized) { setActive(a); return; }
  }
}
function hide(w) {
  var known = false;
  for (var i = 0; i < hidden.length; i++) if (hidden[i].w === w) known = true;
  if (!known) { hidden.push({ w: w, opacity: w.opacity }); w.opacity = 0; }
  w.minimized = true;
  timer.start();
  focusAtrio();
}
function check(w) {
  if (!w) return;
  var mark = launching();
  if (isSteam(w)) { if (mark && mark !== gameSeen) hide(w); return; }
  if (mark && w.normalWindow && !isAtrio(w)) { gameSeen = mark; finish(); }
}
timer.timeout.connect(giveBack);
// Plasma 6: windowAdded / windowActivated. Plasma 5: clientAdded / clientActivated
(workspace.windowAdded || workspace.clientAdded).connect(check);
(workspace.windowActivated || workspace.clientActivated).connect(function (w) { if (w && isSteam(w)) check(w); });
`;

function dbus(obj, member, args = []) {
  return new Promise((resolve, reject) => {
    execFile('dbus-send', ['--session', '--print-reply', '--dest=org.kde.KWin', obj, member, ...args],
      { timeout: 4000, env: require('./launcher').cleanEnv() }, (err, out) => (err ? reject(err) : resolve(String(out))));
  });
}

// Carga el script en KWin si no lo estaba ya
async function ensureLoaded() {
  if (process.platform !== 'linux') return false;
  try {
    const st = await dbus('/Scripting', 'org.kde.kwin.Scripting.isScriptLoaded', [`string:${NAME}`]);
    if (/boolean true/.test(st)) return true;
    mkdirp(path.dirname(FILE));
    fs.writeFileSync(FILE, SCRIPT(GIVE_BACK_MS));
    const out = await dbus('/Scripting', 'org.kde.kwin.Scripting.loadScript', [`string:${FILE}`, `string:${NAME}`]);
    const m = out.match(/int32\s+(-?\d+)/);
    if (!m || Number(m[1]) < 0) return false;
    // Plasma 6 publica el script en /Scripting/Script<id>; Plasma 5, en /<id>
    try { await dbus(`/Scripting/Script${m[1]}`, 'org.kde.kwin.Script.run'); }
    catch { await dbus(`/${m[1]}`, 'org.kde.kwin.Script.run'); }
    // Versiones anteriores del script (se descargan después de cargar la nueva, para no reutilizar su número)
    for (const old of OLD_NAMES) {
      try { await dbus('/Scripting', 'org.kde.kwin.Scripting.unloadScript', [`string:${old}`]); } catch { /* */ }
    }
    return true;
  } catch {
    return false; // no es KDE, o KWin no responde
  }
}

let resetTimer = null;
let armedWin = null;
// Antes de lanzar un juego de Steam: avisa al script cambiando el título de la ventana de Atrio
async function arm(win) {
  if (!win || win.isDestroyed()) return false;
  if (!(await ensureLoaded())) return false;
  armedWin = win;
  launches++;
  win.setTitle(`Atrio · iniciando juego (${launches})`);
  clearTimeout(resetTimer);
  resetTimer = setTimeout(disarm, ARMED_MS);
  return true;
}
// El juego ya ha arrancado (o ha pasado el rato): título normal
function disarm() {
  clearTimeout(resetTimer);
  if (armedWin && !armedWin.isDestroyed()) armedWin.setTitle('Atrio');
  armedWin = null;
}
const armed = () => !!armedWin;

module.exports = { arm, disarm, armed, ensureLoaded, SCRIPT, NAME };
