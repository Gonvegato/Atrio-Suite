'use strict';
// Lectura (solo lectura) de los accesos directos "que no son de Steam" (shortcuts.vdf, formato
// binario) para saber si Atrio está añadido a Steam y poder abrirlo a través de Steam, que es
// la forma de que Steam le pase el mando como mando completo.
const fs = require('fs');
const path = require('path');
const steam = require('./scanners/steam');
const { parseBinaryVdf } = require('./vdf');

// Identificador largo para steam://rungameid a partir del appid guardado en el acceso directo
function longId(appid) {
  const short = BigInt.asUintN(32, BigInt(appid));
  return ((short << 32n) | 0x02000000n).toString();
}

function findAtrio() {
  for (const root of steam.candidateRoots([])) {
    const userdata = path.join(root.path, 'userdata');
    let users = [];
    try { users = fs.readdirSync(userdata); } catch { continue; }
    for (const u of users) {
      const f = path.join(userdata, u, 'config', 'shortcuts.vdf');
      let data;
      try { data = parseBinaryVdf(fs.readFileSync(f)); } catch { continue; }
      const list = data.shortcuts || data.Shortcuts || {};
      for (const sc of Object.values(list)) {
        if (!sc || typeof sc !== 'object') continue;
        const name = sc.AppName || sc.appname || '';
        const exe = sc.Exe || sc.exe || '';
        if (/atrio/i.test(name) || /Atrio[^\\/]*\.(AppImage|exe)/i.test(exe)) {
          const id = sc.appid !== undefined ? sc.appid : sc.AppId;
          if (id === undefined) continue;
          return { name, exe, gameId: longId(id), flatpak: root.flatpak };
        }
      }
    }
  }
  return null;
}

module.exports = { findAtrio, parseBinaryVdf, longId };
