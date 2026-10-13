'use strict';
// Escucha en tiempo real un sitio de la base de datos de Firebase (API REST en streaming, EventSource):
// Firebase manda un «put» con todo lo que hay al conectar y después cada cambio («put»/«patch») al momento.
// Se reconecta solo (sin conexión, pase caducado, el equipo se ha suspendido…).
//
//   const w = watch({ url: async () => 'https://…/users/u/suite.json?auth=…', onData: (tree, change) => {} })
//   w.stop()
//
// onData recibe el árbol completo ya actualizado y el cambio ({ event, path, data }).

function setIn(root, path, value, merge) {
  const ps = String(path || '/').split('/').filter(Boolean);
  if (!ps.length) {
    if (merge && root && typeof root === 'object' && value && typeof value === 'object') {
      const out = { ...root };
      for (const [k, v] of Object.entries(value)) { if (v === null) delete out[k]; else out[k] = v; }
      return out;
    }
    return value;
  }
  const out = root && typeof root === 'object' ? { ...root } : {};
  const [head, ...rest] = ps;
  const next = setIn(out[head], '/' + rest.join('/'), value, merge);
  if (next === null || next === undefined || (typeof next === 'object' && !Array.isArray(next) && !Object.keys(next).length)) delete out[head];
  else out[head] = next;
  return out;
}

// Trocea el texto que llega en eventos «event: x / data: y»
function parser(onEvent) {
  let buf = '';
  return (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      let event = 'message';
      const data = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      let parsed = null;
      try { parsed = data.length ? JSON.parse(data.join('\n')) : null; } catch { parsed = data.join('\n'); }
      onEvent(event, parsed);
    }
  };
}

function watch({ url, onData, onState, fetchImpl, log }) {
  let tree = null;
  let stopped = false;
  let ctrl = null;
  let retry = 0;
  let lastByte = 0;
  let timer = null;
  let dog = null;
  const say = (s) => { try { if (onState) onState(s); } catch { /* */ } };

  async function connect() {
    if (stopped) return;
    clearTimeout(timer);
    let u;
    try { u = await url(retry > 0); } catch (e) { return later(e.message); }
    if (!u) return later('sin sesión');
    ctrl = new AbortController();
    let res;
    try {
      res = await (fetchImpl || fetch)(u, { headers: { Accept: 'text/event-stream' }, signal: ctrl.signal, redirect: 'follow' });
    } catch (e) { return later('sin conexión'); }
    if (res.status === 401 || res.status === 403) return later('sin permiso', 30000);
    if (!res.ok || !res.body) return later(`respuesta ${res.status}`);
    retry = 0;
    say('conectado');
    lastByte = Date.now();
    // Si en 75 s no llega nada (ni el «keep-alive» de Firebase), la conexión está muerta
    clearInterval(dog);
    dog = setInterval(() => { if (Date.now() - lastByte > 75000 && ctrl) ctrl.abort(); }, 15000);
    const feed = parser((event, data) => {
      if (event === 'put' || event === 'patch') {
        if (!data || typeof data !== 'object') return;
        tree = setIn(tree, data.path, data.data, event === 'patch');
        try { onData(tree, { event, path: data.path, data: data.data }); } catch (e) { if (log) log('stream onData', e.message); }
      } else if (event === 'auth_revoked' || event === 'cancel') {
        if (ctrl) ctrl.abort();
      }
    });
    const dec = new TextDecoder();
    try {
      const reader = res.body.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        lastByte = Date.now();
        feed(dec.decode(value, { stream: true }));
      }
    } catch { /* abortado o cortado */ }
    clearInterval(dog);
    later('reconectando', 1000);
  }

  function later(why, ms) {
    if (stopped) return;
    say(why);
    retry++;
    const wait = ms || Math.min(60000, 1000 * 2 ** Math.min(retry, 6));
    clearTimeout(timer);
    timer = setTimeout(connect, wait);
  }

  setTimeout(connect, 0);
  return {
    stop() { stopped = true; clearTimeout(timer); clearInterval(dog); if (ctrl) ctrl.abort(); },
    restart() { if (ctrl) ctrl.abort(); else connect(); },
    tree: () => tree,
  };
}

module.exports = { watch, setIn, parser };
