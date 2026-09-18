/*
 * color.js -- colour maths for the stage light simulator.
 *
 * Everything the simulator does with light happens in LINEAR light, not in
 * sRGB. That distinction is the whole reason the simulation looks right: a
 * "50% grey" pixel on screen only reflects about 21% of the light hitting it,
 * so mixing/multiplying sRGB values directly would give wrong answers.
 *
 * Pure maths only -- no DOM -- so it can be unit-tested under node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SLS = root.SLS || {};
  root.SLS.Color = api;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this), function () {
  'use strict';

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------------------------------------------------------------- hex/rgb */

  function hexToRgb(hex) {
    var h = String(hex).trim().replace(/^#/, '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 0, g: 0, b: 0 };
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function byteToHex(v) {
    var s = Math.round(clamp(v, 0, 255)).toString(16);
    return s.length === 1 ? '0' + s : s;
  }

  function rgbToHex(r, g, b) {
    if (typeof r === 'object' && r !== null) { b = r.b; g = r.g; r = r.r; }
    return '#' + byteToHex(r) + byteToHex(g) + byteToHex(b);
  }

  function isValidHex(hex) {
    var h = String(hex).trim().replace(/^#/, '');
    return /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h);
  }

  /* ------------------------------------------------------- sRGB <-> linear */

  function srgbToLinear(u) {            /* u and result in 0..1 */
    return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(v) {            /* v and result in 0..1 */
    if (v <= 0) return 0;
    if (v >= 1) return 1;
    return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  }

  /* Lookup tables: the renderer converts millions of samples per frame and
   * Math.pow is far too slow for that. */
  var DECODE = new Float32Array(256);            /* byte sRGB -> linear */
  for (var i = 0; i < 256; i++) DECODE[i] = srgbToLinear(i / 255);

  var ENCODE_N = 4096;
  var ENCODE = new Uint8Array(ENCODE_N + 1);     /* linear 0..1 -> byte sRGB */
  for (var j = 0; j <= ENCODE_N; j++) ENCODE[j] = Math.round(linearToSrgb(j / ENCODE_N) * 255);

  function encodeByte(v) {                       /* linear 0..1 -> 0..255 */
    if (v <= 0) return 0;
    if (v >= 1) return 255;
    return ENCODE[(v * ENCODE_N) | 0];
  }

  /** Hex colour -> linear-light triple in 0..1. */
  function hexToLinear(hex) {
    var c = hexToRgb(hex);
    return [DECODE[c.r], DECODE[c.g], DECODE[c.b]];
  }

  /** Linear-light triple in 0..1 -> hex (clipped). */
  function linearToHex(lr, lg, lb) {
    return '#' + byteToHex(encodeByte(lr)) + byteToHex(encodeByte(lg)) + byteToHex(encodeByte(lb));
  }

  /* -------------------------------------------------------------- hsv <-> rgb */

  function rgbToHsv(r, g, b) {
    if (typeof r === 'object' && r !== null) { b = r.b; g = r.g; r = r.r; }
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0;
    if (d > 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return { h: h, s: max === 0 ? 0 : d / max, v: max };
  }

  function hsvToRgb(h, s, v) {
    if (typeof h === 'object' && h !== null) { v = h.v; s = h.s; h = h.h; }
    h = ((h % 360) + 360) % 360;
    s = clamp01(s); v = clamp01(v);
    var c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }

  function hueOf(hex) { return rgbToHsv(hexToRgb(hex)).h; }

  /** Shift a hex colour's value/saturation while keeping its hue. */
  function shade(hex, vMul, sMul) {
    var hsv = rgbToHsv(hexToRgb(hex));
    return rgbToHex(hsvToRgb(hsv.h, clamp01(hsv.s * (sMul == null ? 1 : sMul)), clamp01(hsv.v * vMul)));
  }

  /* ------------------------------------------------- luminance and contrast */

  /** WCAG relative luminance of a displayed (sRGB) colour, 0..1. */
  function relLuminance(r, g, b) {
    if (typeof r === 'object' && r !== null) { b = r.b; g = r.g; r = r.r; }
    return 0.2126 * DECODE[Math.round(clamp(r, 0, 255))] +
           0.7152 * DECODE[Math.round(clamp(g, 0, 255))] +
           0.0722 * DECODE[Math.round(clamp(b, 0, 255))];
  }

  /** Luminance of an already-linear triple. */
  function linLuminance(lr, lg, lb) { return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb; }

  /** WCAG contrast ratio, 1 (identical) .. 21 (black on white). */
  function contrastRatio(a, b) {
    var la = relLuminance(a), lb = relLuminance(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  /* ----------------------------------------------------------------- CIELAB */

  function rgbToXyz(r, g, b) {
    if (typeof r === 'object' && r !== null) { b = r.b; g = r.g; r = r.r; }
    var R = DECODE[Math.round(clamp(r, 0, 255))],
        G = DECODE[Math.round(clamp(g, 0, 255))],
        B = DECODE[Math.round(clamp(b, 0, 255))];
    return {
      x: R * 0.4124564 + G * 0.3575761 + B * 0.1804375,
      y: R * 0.2126729 + G * 0.7151522 + B * 0.0721750,
      z: R * 0.0193339 + G * 0.1191920 + B * 0.9503041
    };
  }

  var WP = { x: 0.95047, y: 1.0, z: 1.08883 };   /* D65 */

  function pivot(t) { return t > 0.008856451679 ? Math.cbrt(t) : (903.2962962 * t + 16) / 116; }

  function rgbToLab(r, g, b) {
    var xyz = rgbToXyz(r, g, b);
    var fx = pivot(xyz.x / WP.x), fy = pivot(xyz.y / WP.y), fz = pivot(xyz.z / WP.z);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }

  /** CIE76 colour difference. ~2.3 is a just-noticeable difference. */
  function deltaE76(c1, c2) {
    var a = rgbToLab(c1), b = rgbToLab(c2);
    var dL = a.L - b.L, da = a.a - b.a, db = a.b - b.b;
    return Math.sqrt(dL * dL + da * da + db * db);
  }

  /* ------------------------------------------------------------ named hues */

  /* Plain descriptive names, ordered roughly warm -> cool, so the palette
   * grid reads like a colour wheel. Useful for quickly dialling a light to
   * "about the same colour as that costume". */
  var NAMED = [
    { name: 'White',      hex: '#ffffff' },
    { name: 'Warm white', hex: '#ffd3a6' },
    { name: 'Cool white', hex: '#cfe4ff' },
    { name: 'Straw',      hex: '#ffe9a8' },
    { name: 'Yellow',     hex: '#ffff00' },
    { name: 'Gold',       hex: '#ffc400' },
    { name: 'Amber',      hex: '#ffa400' },
    { name: 'Orange',     hex: '#ff6a00' },
    { name: 'Deep orange',hex: '#ff3d00' },
    { name: 'Red',        hex: '#ff0000' },
    { name: 'Deep red',   hex: '#b3001b' },
    { name: 'Pink',       hex: '#ff69b4' },
    { name: 'Magenta',    hex: '#ff00c8' },
    { name: 'Purple',     hex: '#8a00e6' },
    { name: 'Violet',     hex: '#5a2be0' },
    { name: 'Lavender',   hex: '#c8a2ff' },
    { name: 'Indigo',     hex: '#2a2ae0' },
    { name: 'Blue',       hex: '#0040ff' },
    { name: 'Sky blue',   hex: '#3fa9ff' },
    { name: 'Cyan',       hex: '#00ffff' },
    { name: 'Teal',       hex: '#00b3a4' },
    { name: 'Green',      hex: '#00d000' },
    { name: 'Lime',       hex: '#6eff00' },
    { name: 'Blackout',   hex: '#000000' }
  ];

  /** Nearest named colour to an rgb triple, by Lab distance. */
  function nearestNamed(rgb) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < NAMED.length; i++) {
      var d = deltaE76(rgb, hexToRgb(NAMED[i].hex));
      if (d < bestD) { bestD = d; best = NAMED[i]; }
    }
    return { name: best.name, hex: best.hex, distance: bestD };
  }

  /* --------------------------------------------------------------- read-out */

  /**
   * Full description of a colour for the light's colour menu: the 0-255 RGB
   * values a fixture would be dialled to, each channel as a percentage of
   * full, and the same recipe normalised so the brightest channel reads 100%
   * (which is how you would actually mix that hue on a real RGB fixture and
   * then pull it down on the dimmer).
   */
  function describe(hex) {
    var rgb = hexToRgb(hex);
    var max = Math.max(rgb.r, rgb.g, rgb.b) || 1;
    var hsv = rgbToHsv(rgb);
    var pct = {
      r: rgb.r / 255 * 100,
      g: rgb.g / 255 * 100,
      b: rgb.b / 255 * 100
    };
    var atFull = {
      r: rgb.r / max * 100,
      g: rgb.g / max * 100,
      b: rgb.b / max * 100
    };
    var near = nearestNamed(rgb);
    return {
      hex: rgbToHex(rgb),
      rgb: rgb,
      pct: pct,
      atFull: atFull,
      dimmer: max / 255 * 100,          /* how far up the dimmer is */
      hsv: hsv,
      luminance: relLuminance(rgb),
      nearest: near,
      /* e.g. "R 100% - G 42% - B 0% at 92% dimmer" */
      recipe: 'R ' + Math.round(atFull.r) + '% \u00b7 G ' + Math.round(atFull.g) + '% \u00b7 B ' +
              Math.round(atFull.b) + '% at ' + Math.round(max / 255 * 100) + '% dimmer'
    };
  }

  return {
    clamp: clamp, clamp01: clamp01, lerp: lerp,
    hexToRgb: hexToRgb, rgbToHex: rgbToHex, isValidHex: isValidHex,
    srgbToLinear: srgbToLinear, linearToSrgb: linearToSrgb,
    DECODE: DECODE, encodeByte: encodeByte,
    hexToLinear: hexToLinear, linearToHex: linearToHex,
    rgbToHsv: rgbToHsv, hsvToRgb: hsvToRgb, hueOf: hueOf, shade: shade,
    relLuminance: relLuminance, linLuminance: linLuminance, contrastRatio: contrastRatio,
    rgbToLab: rgbToLab, deltaE76: deltaE76,
    NAMED: NAMED, nearestNamed: nearestNamed, describe: describe
  };
});
