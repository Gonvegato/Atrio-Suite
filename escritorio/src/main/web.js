'use strict';
// Webs dentro de Atrio (guías de personajes, builds, wikis…): una vista de Chromium incrustada en la
// página del juego. Se usa WebContentsView (lo que recomienda Electron en lugar de <webview>), así abre
// también las webs que no se dejan meter en un iframe. Sesión propia y persistente («persist:webs»):
// si inicias sesión en una web de guías, sigue iniciada la próxima vez. La web no tiene acceso a Atrio.
const { WebContentsView, shell } = require('electron');

let view = null;
let win = null;
let send = () => {};
let shown = false;

const okUrl = (u) => /^https?:\/\//i.test(String(u || ''));

function state() {
  if (!view) return { open: false };
  const wc = view.webContents;
  const nav = wc.navigationHistory;
  return {
    open: true, shown, url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(),
    back: nav ? nav.canGoBack() : wc.canGoBack(), fwd: nav ? nav.canGoForward() : wc.canGoForward(),
  };
}
const notify = () => send('web', state());

function create() {
  view = new WebContentsView({
    webPreferences: { partition: 'persist:webs', sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  view.setBackgroundColor('#00000000');
  const wc = view.webContents;
  // Las ventanas nuevas (enlaces con target=_blank) se abren en la misma vista
  wc.setWindowOpenHandler(({ url }) => { if (okUrl(url)) wc.loadURL(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => { if (!okUrl(url)) e.preventDefault(); });
  for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated']) wc.on(ev, notify);
  wc.on('did-fail-load', (_e, code, desc, url, main) => { if (main && code !== -3) send('web-error', { url, desc }); });
  // Esc (o F11) con la web activa: lo gestiona Atrio, no la web
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'Escape') { e.preventDefault(); send('web-key', 'escape'); }
    if (input.key === 'F11') { e.preventDefault(); send('web-key', 'f11'); }
    if (input.alt && input.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
    if (input.alt && input.key === 'ArrowRight') { e.preventDefault(); goFwd(); }
  });
  wc.on('render-process-gone', () => { close(); send('web-error', { url: '', desc: 'La web se ha cerrado' }); });
}

function setBounds(b) {
  if (!view || !b) return;
  view.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.max(1, Math.round(b.width)), height: Math.max(1, Math.round(b.height)) });
}

function open(url, bounds) {
  if (!okUrl(url)) throw new Error('Solo se pueden abrir direcciones http o https');
  if (!win || win.isDestroyed()) return state();
  if (!view) create();
  setBounds(bounds);
  if (!shown) { win.contentView.addChildView(view); shown = true; }
  if (view.webContents.getURL() !== url) view.webContents.loadURL(url).catch(() => {});
  view.webContents.focus();
  notify();
  return state();
}

// Ocultar sin perder la página (al abrir un menú encima, por ejemplo)
function hide() {
  if (view && shown && win && !win.isDestroyed()) { win.contentView.removeChildView(view); shown = false; }
  notify();
}
function show(bounds) {
  if (!view || !win || win.isDestroyed()) return state();
  setBounds(bounds);
  if (!shown) { win.contentView.addChildView(view); shown = true; }
  notify();
  return state();
}

function close() {
  if (!view) return { open: false };
  try { if (shown && win && !win.isDestroyed()) win.contentView.removeChildView(view); } catch { /* */ }
  try { view.webContents.close(); } catch { /* */ }
  view = null;
  shown = false;
  send('web', { open: false });
  if (win && !win.isDestroyed()) win.webContents.focus();
  return { open: false };
}

function goBack() { if (!view) return; const n = view.webContents.navigationHistory; if (n ? n.canGoBack() : view.webContents.canGoBack()) (n ? n.goBack() : view.webContents.goBack()); }
function goFwd() { if (!view) return; const n = view.webContents.navigationHistory; if (n ? n.canGoForward() : view.webContents.canGoForward()) (n ? n.goForward() : view.webContents.goForward()); }

function nav(action) {
  if (!view) return state();
  if (action === 'back') goBack();
  else if (action === 'fwd') goFwd();
  else if (action === 'reload') view.webContents.reload();
  else if (action === 'external') { const u = view.webContents.getURL(); if (okUrl(u)) shell.openExternal(u); }
  else if (action === 'focus') view.webContents.focus();
  return state();
}

function attach(w, sender) {
  win = w;
  send = sender;
  win.on('closed', () => { view = null; shown = false; win = null; });
}

module.exports = { attach, open, close, hide, show, setBounds, nav, state, okUrl };
