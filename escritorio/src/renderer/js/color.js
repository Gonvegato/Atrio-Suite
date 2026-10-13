'use strict';
/* global A, Image, document */
// Color de acento a partir del arte del juego (para el modo "auto")
(function () {
  const cache = new Map();

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s, l];
  }
  function hslToRgb(h, s, l) {
    h /= 360;
    const f = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    if (s === 0) return [l * 255, l * 255, l * 255].map(Math.round);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map((v) => Math.round(v * 255));
  }

  // Color dominante "con carácter": media ponderada por saturación de una miniatura
  function analyse(url) {
    if (cache.has(url)) return cache.get(url);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          const w = (c.width = 48), h = (c.height = 48);
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, w, h);
          const d = ctx.getImageData(0, 0, w, h).data;
          let r = 0, g = 0, b = 0, tw = 0;
          for (let i = 0; i < d.length; i += 4) {
            const [, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
            const wgt = (s * s + 0.02) * (1 - Math.abs(l - 0.5) * 1.6);
            if (wgt <= 0) continue;
            r += d[i] * wgt; g += d[i + 1] * wgt; b += d[i + 2] * wgt; tw += wgt;
          }
          if (!tw) return resolve(null);
          resolve([r / tw, g / tw, b / tw]);
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    cache.set(url, p);
    return p;
  }

  // Ajusta el color para que funcione como acento sobre el esquema actual
  function toAccent(rgb, light) {
    let [h, s, l] = rgbToHsl(...rgb);
    s = Math.min(Math.max(s, 0.25), 0.55);
    l = light ? Math.min(Math.max(l, 0.28), 0.38) : Math.min(Math.max(l, 0.66), 0.76);
    return hslToRgb(h, s, l);
  }
  function toTint(rgb) {
    let [h, s, l] = rgbToHsl(...rgb);
    s = Math.min(s, 0.6); l = Math.min(Math.max(l, 0.35), 0.55);
    return hslToRgb(h, s, l);
  }

  A.color = { analyse, toAccent, toTint, hue: (h, light) => hslToRgb(h, 0.45, light ? 0.55 : 0.45) };
})();
