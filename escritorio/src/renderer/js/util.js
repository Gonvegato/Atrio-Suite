'use strict';
/* global window, document */
window.A = window.A || {};
// ¿Atrio está en Windows? (algunas opciones solo tienen sentido en Linux)
A.WIN = !!(window.atrio && window.atrio.platform === 'win32');

// Creación de nodos: h('div.clase#id', {atributos}, hijos...)
A.h = function h(sel, attrs, ...kids) {
  const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
    }
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sv == null) continue;
          if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
        }
      }
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
};

// Iconos SVG (trazo fino, coherentes entre sí)
const ICONS = {
  play: '<path fill="currentColor" stroke="none" d="M7 4.5v15l12.5-7.5z"/>',
  cast: '<rect x="3" y="4.5" width="18" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 17v3.5"/><path d="M9.6 12.6a3.4 3.4 0 0 1 4.8 0M7.4 10.4a6.5 6.5 0 0 1 9.2 0"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  starFill: '<path fill="currentColor" stroke="none" d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  hide: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-2.6 3.2M6.6 7.6C4.4 9.2 3 12 3 12s4 6 9 6c1.4 0 2.7-.4 3.9-1"/>',
  show: '<path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  folder: '<path d="M3.5 7a2 2 0 0 1 2-2H10l2 2.5h6.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  layout: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 14.5h17M9 14.5v5M15 14.5v5"/>',
  library: '<path d="M5 4v16M10 4v16M15 5l4 15"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3"/>',
  key: '<circle cx="8" cy="14" r="4"/><path d="M11 11l8-8M16 6l3 3M14 8l2 2"/>',
  power: '<path d="M12 3v8"/><path d="M6.5 6.8a8 8 0 1 0 11 0"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  gamepad: '<path d="M7 8h10a4 4 0 0 1 4 4.5l-.6 3.8a2.5 2.5 0 0 1-4.4 1.2L14.5 16h-5L8 17.5a2.5 2.5 0 0 1-4.4-1.2L3 12.5A4 4 0 0 1 7 8z"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="15.5" cy="12" r=".8"/><circle cx="17.5" cy="13.5" r=".8"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  minimize: '<path d="M5 19h14"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  fwd: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5s1.1-5.9 3.6-8.5z"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.4"/>',
  phone: '<rect x="7" y="2.8" width="10" height="18.4" rx="2.2"/><path d="M10.5 18h3"/>',
  note: '<path d="M5 4.5h10l4 4V19.5H5z"/><path d="M15 4.5v4h4M8.5 12h7M8.5 15.5h5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
};
A.icon = (name) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
};

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
A.timeAgo = function (ts) {
  if (!ts) return '';
  const s = (ts - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return 'ahora mismo';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), 'month');
  return rtf.format(Math.round(s / (86400 * 365)), 'year');
};

A.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
A.uid = () => Math.random().toString(36).slice(2, 10);
A.$ = (s, r = document) => r.querySelector(s);
A.$$ = (s, r = document) => [...r.querySelectorAll(s)];
A.plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
A.wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ¿Esquema de color claro? (los de siempre y los generados de las paletas del móvil)
A.isLightScheme = (id) => id === 'niebla' || id === 'papel' || !!((A.ESTILOS && A.ESTILOS.schemes) || []).find((s) => s.id === id && s.light);
