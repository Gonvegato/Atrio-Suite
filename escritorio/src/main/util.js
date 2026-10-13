'use strict';
const fs = require('fs');
const path = require('path');

// Comillas seguras para sh (Linux) o cmd.exe (Windows)
function shq(s) {
  if (process.platform === 'win32') return '"' + String(s).replace(/"/g, '""') + '"';
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function slug(s) {
  return String(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'juego';
}

// Nombre "limpio" de una ROM: quita extensión y etiquetas (USA), [!], etc.
function cleanRomName(file) {
  let base = path.basename(file).replace(/\.[^.]+$/, '');
  base = base.replace(/\s*[\[(][^\])]*[\])]/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return base || path.basename(file);
}

// Clave de orden: ignora artículos iniciales
function sortKey(name) {
  return String(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/^(the|a|an|el|la|los|las)\s+/, '').trim();
}

function listFilesRecursive(dir, maxDepth = 3, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (maxDepth > 0) listFilesRecursive(full, maxDepth - 1, out);
    } else if (e.isFile() || e.isSymbolicLink()) {
      out.push(full);
    }
  }
  return out;
}

module.exports = { shq, slug, cleanRomName, sortKey, listFilesRecursive };
