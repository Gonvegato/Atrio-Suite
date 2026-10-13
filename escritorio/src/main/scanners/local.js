'use strict';
// Emuladores (ROMs en carpetas) y juegos añadidos a mano
const path = require('path');
const { HOME, expandHome, exists } = require('../paths');
const { shq, slug, cleanRomName, sortKey, listFilesRecursive } = require('../util');

function romCommand(template, rom) {
  const q = shq(rom);
  let cmd = String(template || '');
  if (!/\{rom\}/.test(cmd)) cmd += ' {rom}';
  return cmd.replace(/"\{rom\}"|'\{rom\}'|\{rom\}/g, q).replace(/\{romdir\}/g, shq(path.dirname(rom)));
}

function scanEmulators(cfg) {
  const games = [];
  for (const emu of cfg.emulators || []) {
    if (!emu || emu.enabled === false || !emu.romDir) continue;
    const dir = expandHome(emu.romDir);
    if (!exists(dir)) continue;
    const exts = String(emu.extensions || '')
      .split(/[\s,;]+/).map((e) => e.replace(/^\./, '').toLowerCase()).filter(Boolean);
    const files = listFilesRecursive(dir, emu.depth != null ? emu.depth : 2)
      .filter((f) => !exts.length || exts.includes(path.extname(f).slice(1).toLowerCase()));
    for (const f of files) {
      const name = cleanRomName(f);
      games.push({
        key: `rom:${emu.id}:${path.relative(dir, f)}`,
        source: 'emulators',
        sourceLabel: emu.short || emu.name || 'Emulador',
        platform: emu.name || '',
        name,
        sortName: sortKey(name),
        romPath: f,
        launch: { type: 'shell', command: romCommand(emu.command, f), cwd: path.dirname(f) },
      });
    }
  }
  return games;
}

function customLaunch(g) {
  const exe = expandHome(g.exec || '');
  const args = g.args ? ' ' + g.args : '';
  const cwd = g.workdir ? expandHome(g.workdir) : (exe ? path.dirname(exe) : HOME);
  const env = {};
  const prefix = expandHome(g.prefix || '') || path.join(HOME, 'Games', 'atrio', slug(g.name || g.id));
  // En Windows los .exe se abren directamente (Proton y Wine no hacen falta)
  if (process.platform === 'win32') {
    if (g.runner === 'command') return { type: 'shell', command: g.command || '', cwd };
    return { type: 'shell', command: `${shq(exe)}${args}`, cwd };
  }
  switch (g.runner) {
    case 'umu':
      env.WINEPREFIX = prefix;
      if (g.protonPath) env.PROTONPATH = g.protonPath;
      return { type: 'shell', command: `umu-run ${shq(exe)}${args}`, cwd, env, ensureDirs: [prefix] };
    case 'wine':
      env.WINEPREFIX = prefix;
      return { type: 'shell', command: `wine ${shq(exe)}${args}`, cwd, env, ensureDirs: [prefix] };
    case 'command':
      return { type: 'shell', command: g.command || '', cwd };
    case 'native':
    default:
      return { type: 'shell', command: `${shq(exe)}${args}`, cwd, makeExecutable: exe };
  }
}

function scanCustom(cfg) {
  return (cfg.customGames || []).filter((g) => g && g.name).map((g) => ({
    key: `custom:${g.id}`,
    source: 'custom',
    sourceLabel: 'Propio',
    name: g.name,
    sortName: sortKey(g.name),
    customId: g.id,
    exePath: g.runner !== 'command' && g.exec ? expandHome(g.exec) : null,
    launch: customLaunch(g),
  }));
}

module.exports = { scanEmulators, scanCustom, romCommand };
