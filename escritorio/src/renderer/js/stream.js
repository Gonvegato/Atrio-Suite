'use strict';
/* global A */
// Ajustes → Streaming: Sunshine en este PC para jugar desde el móvil con Moonlight (en casa o con datos fuera).
(function () {
  const h = A.h;
  const S = {};
  let info = null;

  const LINUX_INSTALL = [
    ['Arch / CachyOS (AUR)', 'paru -S sunshine'],
    ['Flatpak (cualquier distro)', 'flatpak install flathub dev.lizardbyte.app.Sunshine'],
  ];

  function copyBtn(text) {
    return h('button.btn.quiet', { 'data-nav': true, onclick: () => { navigator.clipboard.writeText(text).then(() => A.app.toast('Copiado')).catch(() => {}); } }, A.icon('link'), 'Copiar');
  }

  function status(i) {
    if (!i) return h('p.note', 'Mirando Sunshine…');
    const dot = (on) => h('span.st-dot', { 'data-on': String(!!on) });
    return h('div.st-status',
      h('div.st-row', dot(i.installed), h('span', i.installed ? `Sunshine instalado${i.kind === 'flatpak' ? ' (Flatpak)' : ''}` : 'Sunshine no está instalado')),
      h('div.st-row', dot(i.running), h('span', i.running ? `En marcha · se anuncia como «${i.name}»` : 'Parado')),
      h('div.st-row', dot(i.creds), h('span', i.creds ? 'Usuario de Sunshine guardado (el PIN se puede meter desde el móvil)' : 'Sin usuario de Sunshine: el PIN tendrás que meterlo en su panel')),
      h('div.st-row', dot(i.ts && i.ts.up), h('span', i.ts && i.ts.up ? `Tailscale activo: ${i.ts.ip}${i.ts.dns ? ` · ${i.ts.dns}` : ''}` : i.ts && i.ts.installed ? 'Tailscale instalado pero desconectado' : 'Tailscale no está instalado (solo hace falta para jugar fuera de casa)')),
      i.ips && i.ips.length ? h('div.st-row', dot(true), h('span', `En casa: ${i.ips.join(', ')}`)) : null);
  }

  S.settings = (redraw) => {
    const c = A.app.state().config.stream || {};
    const set = (patch) => A.app.patchConfig({ stream: patch }, { render: false }).then(() => { info = null; redraw(); });
    const box = h('div', status(info));
    if (!info) A.api.streamInfo().then((i) => { info = i; box.replaceChildren(status(i)); }).catch(() => {});

    const user = A.dialogs.input(c.user || '', { placeholder: 'Usuario del panel de Sunshine', autocomplete: 'off' });
    const pass = A.dialogs.input(c.pass || '', { type: 'password', placeholder: 'Contraseña', autocomplete: 'off' });
    const app = A.dialogs.input(c.app || 'Desktop', { placeholder: 'Desktop' });
    const checkOut = h('p.note');
    const save = () => set({ user: user.value.trim(), pass: pass.value, app: app.value.trim() || 'Desktop' });

    return h('div.set-block',
      h('h2', 'Streaming'),
      h('p.lead', 'Juega desde el móvil a los juegos de este PC, en casa o con datos fuera. Atrio prepara Sunshine (el servidor de streaming) y en el móvil cada juego tiene «Jugar en streaming», que abre Moonlight directamente en este PC con el juego ya lanzado.'),
      box,
      h('div.btn-row',
        h('button.btn.primary', { 'data-nav': true, onclick: async () => { try { A.app.toast('Arrancando Sunshine…'); info = await A.api.streamStart(); box.replaceChildren(status(info)); A.app.toast('Sunshine en marcha'); } catch (e) { A.app.toast(A.app.cleanError(e), 'error'); } } }, A.icon('play'), 'Arrancar Sunshine'),
        h('button.btn.quiet', { 'data-nav': true, onclick: () => A.api.streamWeb() }, A.icon('globe'), 'Abrir el panel de Sunshine'),
        h('button.btn.quiet', { 'data-nav': true, onclick: () => { info = null; A.api.streamInfo().then((i) => { info = i; box.replaceChildren(status(i)); }); } }, A.icon('refresh'), 'Volver a mirar')),

      h('h3', '1 · Instalar Sunshine'),
      A.WIN
        ? h('p.note', 'Descárgalo de github.com/LizardByte/Sunshine/releases (instalador de Windows). Al acabar, abre su panel y crea un usuario.')
        : h('div', LINUX_INSTALL.map(([what, cmd]) => h('div.st-cmd', h('span', what), h('code', cmd), copyBtn(cmd))),
          h('p.note', 'Después ábrelo una vez (o «Arrancar Sunshine»), entra en su panel (https://localhost:47990) y crea tu usuario. Si tienes cortafuegos, abre los puertos de Sunshine (TCP 47984, 47989, 47990, 48010 y UDP 47998–48000).')),

      h('h3', '2 · Tu usuario de Sunshine'),
      h('p.note', 'Con él, el PIN de emparejamiento lo escribes en el propio móvil (Atrio se lo pasa a Sunshine). Se guarda solo en este PC.'),
      A.dialogs.field('Usuario', user),
      A.dialogs.field('Contraseña', pass),
      h('div.btn-row',
        h('button.btn.primary', { 'data-nav': true, onclick: save }, A.icon('check'), 'Guardar'),
        h('button.btn.quiet', { 'data-nav': true, onclick: async () => { await A.app.patchConfig({ stream: { user: user.value.trim(), pass: pass.value } }, { render: false }); const r = await A.api.streamCheck(); checkOut.textContent = r.msg; checkOut.classList.toggle('warn', !r.ok); } }, A.icon('key'), 'Comprobar')),
      checkOut,

      h('h3', '3 · En el móvil'),
      h('p.note', 'Instala Moonlight (Google Play). Ábrelo con el móvil en la misma wifi: este PC sale solo. Tócalo, te enseña un PIN: escríbelo en Atrio del móvil (Más → PC → Streaming) o en el panel de Sunshine. Desde ese momento, «Jugar en streaming» en cualquier juego.'),

      h('h3', 'Fuera de casa'),
      h('p.note', 'Lo más fácil y seguro es Tailscale: instálalo en este PC y en el móvil con la misma cuenta. El móvil verá este PC por su dirección de Tailscale estés donde estés, sin abrir puertos del router. En Moonlight, añade el PC una vez con esa dirección (+ arriba a la derecha). Con datos, baja la calidad en Moonlight (10–20 Mbps suele ir bien).'),

      h('h3', 'Qué abre Moonlight'),
      A.dialogs.field('Aplicación de Sunshine', app, '«Desktop» (el escritorio) es la que viene con Sunshine: Atrio lanza el juego y Moonlight enseña la pantalla.'),
      h('button.toggle', { 'data-nav': true, 'aria-pressed': String(c.remote !== false), onclick: () => set({ remote: c.remote === false }) },
        h('span.tx', h('span', 'El móvil puede preparar el streaming'), h('small', 'Arrancar Sunshine, lanzar el juego y meter el PIN')), h('span.knob')));
  };

  A.api.on('stream', (i) => { info = i; });
  A.stream = S;
})();
