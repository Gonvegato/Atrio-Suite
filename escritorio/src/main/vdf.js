'use strict';
// Parser mínimo del formato de texto KeyValues de Valve (.vdf / .acf).
// Devuelve objetos anidados; las claves se guardan tal cual y también en minúsculas
// a través del helper `get`.

function parseVdf(text) {
  let i = 0;
  const n = text.length;

  function skipWs() {
    while (i < n) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
      if (c === '/' && text[i + 1] === '/') {
        while (i < n && text[i] !== '\n') i++;
        continue;
      }
      break;
    }
  }

  function readToken() {
    skipWs();
    if (i >= n) return null;
    const c = text[i];
    if (c === '{' || c === '}') { i++; return { t: c }; }
    if (c === '"') {
      i++;
      let s = '';
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          const e = text[i + 1];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          i += 2;
        } else {
          s += text[i++];
        }
      }
      i++; // comilla de cierre
      return { t: 's', v: s };
    }
    let s = '';
    while (i < n && !/[\s{}"]/.test(text[i])) s += text[i++];
    return { t: 's', v: s };
  }

  function parseObject() {
    const obj = {};
    for (;;) {
      const key = readToken();
      if (!key || key.t === '}') return obj;
      if (key.t !== 's') continue;
      const val = readToken();
      if (!val) return obj;
      if (val.t === '{') obj[key.v] = parseObject();
      else if (val.t === 's') obj[key.v] = val.v;
      // Condicionales tipo [$WIN32] se ignoran
      skipWs();
      if (text[i] === '[') { while (i < n && text[i] !== ']') i++; i++; }
    }
  }

  return parseObject();
}

// Acceso insensible a mayúsculas: get(obj, 'AppState', 'name')
function get(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    const found = Object.keys(cur).find((x) => x.toLowerCase() === k.toLowerCase());
    cur = found === undefined ? undefined : cur[found];
  }
  return cur;
}

// Tipos del formato binario: 0 mapa, 1 texto, 2 entero de 32 bits, 3 coma flotante, 7 entero de 64 bits, 8 fin
function parseBinaryVdf(buf) {
  let i = 0;
  const readStr = () => {
    const end = buf.indexOf(0, i);
    if (end < 0) throw new Error('vdf truncado');
    const s = buf.toString('utf8', i, end);
    i = end + 1;
    return s;
  };
  const readMap = () => {
    const obj = {};
    for (;;) {
      if (i >= buf.length) return obj;
      const type = buf[i++];
      if (type === 8) return obj;
      const key = readStr();
      if (type === 0) obj[key] = readMap();
      else if (type === 1) obj[key] = readStr();
      else if (type === 2) { obj[key] = buf.readInt32LE(i); i += 4; }
      else if (type === 3) { obj[key] = buf.readFloatLE(i); i += 4; }
      else if (type === 7) { obj[key] = buf.readBigUInt64LE(i); i += 8; }
      else throw new Error(`tipo vdf desconocido ${type}`);
    }
  };
  return readMap();
}

module.exports = { parseVdf, get, parseBinaryVdf };
