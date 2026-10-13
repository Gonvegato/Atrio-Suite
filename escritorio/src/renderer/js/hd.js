'use strict';
/* global A, window, document, OffscreenCanvas, createImageBitmap, requestIdleCallback */
// Fondos nítidos en pantallas grandes: si el fondo de un juego es más pequeño que la
// pantalla, se genera una versión ampliada con un filtro de calidad y un enfoque suave,
// y se guarda para no repetirlo. No inventa detalle, pero evita el aspecto borroso.
(function () {
  const hd = {};
  const done = new Set();   // claves ya resueltas en esta sesión (generado o no hace falta)
  let busy = false;
  let pending = null;
  let timer = null;

  const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

  function targetSize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    const vw = Math.round(window.innerWidth * dpr);
    const vh = Math.round(window.innerHeight * dpr);
    // Modo nítido: el fondo se ajusta al ancho de la pantalla. Modo llenar: cubre toda la pantalla
    const fill = A.app.state().config.theme.heroFit === 'llenar';
    const scale = fill ? Math.max(vw / w, vh / h) : vw / w;
    return { scale, W: Math.min(Math.round(w * scale), 5120), H: Math.min(Math.round(h * scale), 2880) };
  }

  // Ampliación por pasos de x2 con suavizado de alta calidad (menos borroso que de golpe)
  function upscale(bitmap, W, H) {
    let src = bitmap;
    let w = bitmap.width, h = bitmap.height;
    while (w * 2 < W) {
      const c = new OffscreenCanvas(w * 2, h * 2);
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      x.drawImage(src, 0, 0, w * 2, h * 2);
      src = c; w *= 2; h *= 2;
    }
    const out = new OffscreenCanvas(W, H);
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, W, H);
    return { canvas: out, ctx };
  }

  // Máscara de enfoque (desenfoque gaussiano 3x3 separable), por franjas para no bloquear la interfaz
  async function sharpen(ctx, W, H, amount) {
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const tmp = new Float32Array(W * H * 3);
    const STRIP = 96;
    // Pasada horizontal
    for (let y0 = 0; y0 < H; y0 += STRIP) {
      const y1 = Math.min(H, y0 + STRIP);
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4, l = (y * W + Math.max(0, x - 1)) * 4, r = (y * W + Math.min(W - 1, x + 1)) * 4;
          const o = (y * W + x) * 3;
          tmp[o] = (d[l] + 2 * d[i] + d[r]) / 4;
          tmp[o + 1] = (d[l + 1] + 2 * d[i + 1] + d[r + 1]) / 4;
          tmp[o + 2] = (d[l + 2] + 2 * d[i + 2] + d[r + 2]) / 4;
        }
      }
      await yieldFrame();
    }
    // Pasada vertical y combinación
    for (let y0 = 0; y0 < H; y0 += STRIP) {
      const y1 = Math.min(H, y0 + STRIP);
      for (let y = y0; y < y1; y++) {
        const up = Math.max(0, y - 1), dn = Math.min(H - 1, y + 1);
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const a = (up * W + x) * 3, b = (y * W + x) * 3, c = (dn * W + x) * 3;
          for (let k = 0; k < 3; k++) {
            const blur = (tmp[a + k] + 2 * tmp[b + k] + tmp[c + k]) / 4;
            const v = d[i + k] + amount * (d[i + k] - blur);
            d[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
          }
        }
      }
      await yieldFrame();
    }
    ctx.putImageData(img, 0, 0);
  }

  async function process(game) {
    const src = game.art.hero;
    const res = await fetch(src);
    const bitmap = await createImageBitmap(await res.blob());
    const { scale, W, H } = targetSize(bitmap.width, bitmap.height);
    // Solo se amplían los fondos claramente pequeños; los de 4K se usan tal cual, sin filtros
    if (scale <= 1.3 || bitmap.width >= 3000) { bitmap.close(); return null; }
    const { canvas, ctx } = upscale(bitmap, W, H);
    bitmap.close();
    await yieldFrame();
    // Más enfoque cuanto más se amplía, con tope para no crear halos
    await sharpen(ctx, W, H, Math.min(0.5, 0.2 + (scale - 1) * 0.2));
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.98 });
    return blob.arrayBuffer();
  }

  async function run(key) {
    if (busy) { pending = key; return; }
    const game = A.app.game(key);
    if (!game || !game.art.hero || game.art.herohd || done.has(key)) return;
    busy = true;
    done.add(key);
    try {
      const buf = await process(game);
      if (buf) {
        const g = await A.api.saveHd(key, buf);
        if (g) A.app.updateGame(g, false);
      }
    } catch { /* si falla, se queda con el fondo original */ }
    busy = false;
    if (pending) { const k = pending; pending = null; hd.request(k); }
  }

  // Se pide al detenerse en un juego un momento, para no trabajar mientras se navega rápido
  hd.request = (key) => {
    clearTimeout(timer);
    if (!key || done.has(key)) return;
    timer = setTimeout(() => {
      const go = () => run(key);
      if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 1500 }); else go();
    }, 900);
  };
  hd.enabled = () => A.app.state().config.theme.sharpen !== false;

  A.hd = hd;
})();
