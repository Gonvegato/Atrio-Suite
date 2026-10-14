'use strict';
/* global A */
// Ajustes → Streaming: Polaris en este PC para jugar desde el móvil con Nova (en casa o con datos fuera).
(function () {
  const h = A.h;
  const S = {};
  let info = null;

  const LINUX_INSTALL = [
    ['Arch / CachyOS (AUR)', 'paru -S polaris-gamestream-bin'],
    ['Preparar el equipo (una vez)', 'sudo -H polaris --setup-host'],
  ];

  function copyBtn(text) {
    return h('button.btn.quiet', { 'data-nav': true, onclick: () => { navigator.clipboard.writeText(text).then(() => A.app.toast('Copiado')).catch(() => {}); } }, A.icon('link'), 'Copiar');
  }

  function status(i) {
    if (!i) return h('p.note', 'Mirando Polaris…');
    if (i.linux === false) return h('p.note.warn', 'Polaris solo existe para Linux: en este PC no se puede preparar el streaming.');
    const dot = (on) => h('span.st-dot', { 'data-on': String(!!on) });
    return h('div.st-status',
      h('div.st-row', dot(i.installed), h('span', i.installed ? 'Polaris instalado' : 'Polaris no está instalado')),
      h('div.st-row', dot(i.running), h('span', i.running ? `En marcha · se anuncia como «${i.name}»` : 'Parado')),
      h('div.st-row', dot(i.creds), h('span', i.creds ? 'Atrio puede hablar con Polaris: el móvil se empareja solo' : 'Falta tu usuario de Polaris (abajo) para emparejar desde el móvil')),
      h('div.st-row', dot(i.ts && i.ts.up), h('span', i.ts && i.ts.up ? `Tailscale activo: ${i.ts.ip}${i.ts.dns ? ` · ${i.ts.dns}` : ''}` : i.ts && i.ts.installed ? 'Tailscale instalado pero desconectado' : 'Tailscale no está instalado (solo hace falta para jugar fuera de casa)')),
      i.ips && i.ips.length ? h('div.st-row', dot(true), h('span', `En casa: ${i.ips.join(', ')}`)) : null);
  }

  S.settings = (redraw) => {
    const c = A.app.state().config.stream || {};
    const set = (patch) => A.app.patchConfig({ stream: patch }, { render: false }).then(() => { info = null; redraw(); });
    const box = h('div', status(info));
    if (!info) A.api.streamInfo().then((i) => { info = i; box.replaceChildren(status(i)); }).catch(() => {});

    const user = A.dialogs.input(c.user || '', { placeholder: 'Usuario del panel de Polaris', autocomplete: 'off' });
    const pass = A.dialogs.input(c.pass || '', { type: 'password', placeholder: 'Contraseña', autocomplete: 'off' });
    const key = A.dialogs.input(c.apiKey || '', { type: 'password', placeholder: 'Opcional: api_key de polaris.conf', autocomplete: 'off' });
    const app = A.dialogs.input(c.app || 'Desktop', { placeholder: 'Desktop' });
    const checkOut = h('p.note');
    const save = () => set({ user: user.value.trim(), pass: pass.value, apiKey: key.value.trim(), app: app.value.trim() || 'Desktop' });

    return h('div.set-block',
      h('h2', 'Streaming'),
      h('p.lead', 'Juega desde el móvil a los juegos de este PC, en casa o con datos fuera. Atrio prepara Polaris (el servidor de streaming) y en el móvil cada juego tiene «Streaming», que abre Nova directamente en este PC con el juego ya lanzado.'),
      box,
      h('div.btn-row',
        h('button.btn.primary', { 'data-nav': true, onclick: async () => { try { A.app.toast('Arrancando Polaris…'); info = await A.api.streamStart(); box.replaceChildren(status(info)); A.app.toast('Polaris en marcha'); } catch (e) { A.app.toast(A.app.cleanError(e), 'error'); } } }, A.icon('play'), 'Arrancar Polaris'),
        h('button.btn.quiet', { 'data-nav': true, onclick: () => A.api.streamWeb() }, A.icon('globe'), 'Abrir el panel de Polaris'),
        h('button.btn.quiet', { 'data-nav': true, onclick: () => { info = null; A.api.streamInfo().then((i) => { info = i; box.replaceChildren(status(i)); }); } }, A.icon('refresh'), 'Volver a mirar')),

      h('h3', '1 · Instalar Polaris'),
      A.WIN
        ? h('p.note', 'Polaris solo funciona en Linux.')
        : h('div', LINUX_INSTALL.map(([what, cmd]) => h('div.st-cmd', h('span', what), h('code', cmd), copyBtn(cmd))),
          h('p.note', 'También hay paquetes oficiales en github.com/papi-ux/polaris/releases. Después ábrelo (o «Arrancar Polaris»), entra en su panel (https://localhost:47990/#/welcome) y crea tu usuario. Si tienes cortafuegos, abre los puertos de Polaris (TCP 47984, 47989, 47990, 48010 y UDP 47998–48000).')),

      h('h3', '2 · Tu usuario de Polaris'),
      h('p.note', 'Con él, el móvil se empareja con un toque: Atrio pide a Polaris un código de un solo uso y Nova lo recibe solo, sin teclear PIN. Se guarda solo en este PC.'),
      A.dialogs.field('Usuario', user),
      A.dialogs.field('Contraseña', pass),
      A.dialogs.field('Clave de API (opcional)', key, 'Si pones «api_key = …» en ~/.config/polaris/polaris.conf, puedes usarla aquí en lugar del usuario.'),
      h('div.btn-row',
        h('button.btn.primary', { 'data-nav': true, onclick: save }, A.icon('check'), 'Guardar'),
        h('button.btn.quiet', { 'data-nav': true, onclick: async () => { await A.app.patchConfig({ stream: { user: user.value.trim(), pass: pass.value, apiKey: key.value.trim() } }, { render: false }); const r = await A.api.streamCheck(); checkOut.textContent = r.msg; checkOut.classList.toggle('warn', !r.ok); } }, A.icon('key'), 'Comprobar')),
      checkOut,

      h('h3', '3 · En el móvil'),
      h('p.note', 'Instala Nova (APK de github.com/papi-ux/nova). En Atrio del móvil: PC → Streaming → «Emparejar con Nova». Nova se abre con este PC ya puesto; confirma y listo. Desde ese momento, «Streaming» en cualquier juego.'),

      h('h3', 'Fuera de casa'),
      h('p.note', 'Lo más fácil y seguro es Tailscale: instálalo en este PC y en el móvil con la misma cuenta. Con Tailscale activo, el móvil ofrece «Emparejar por Tailscale», que añade este PC a Nova con esa dirección, sin abrir puertos del router. Con datos, baja la calidad en Nova (10–20 Mbps suele ir bien).'),

      h('h3', 'Qué abre Nova'),
      A.dialogs.field('Aplicación de Polaris', app, '«Desktop» (el escritorio) es la que viene con Polaris: Atrio lanza el juego y Nova enseña la pantalla.'),
      h('button.toggle', { 'data-nav': true, 'aria-pressed': String(c.remote !== false), onclick: () => set({ remote: c.remote === false }) },
        h('span.tx', h('span', 'El móvil puede preparar el streaming'), h('small', 'Arrancar Polaris, lanzar el juego y emparejar')), h('span.knob')));
  };

  A.api.on('stream', (i) => { info = i; });
  A.stream = S;
})();
