/*
 * light.js -- the rig.
 *
 * Four lighting systems, and what makes them different is not where they sit
 * along a row, it is the ANGLE they come from. That is how a real rig is
 * built: front of house out over the audience, a bar straight above the
 * stage, booms in the wings firing across, and backlight upstage aimed at the
 * audience. Each one does a completely different job.
 *
 *   Front of house   flat and even. Shows colour, hides shape.
 *   Overhead         pools on the deck. Bright heads, dark faces.
 *   Side (wings)     rakes across. Shows shape better than anything else.
 *   Back light       rims the edges and lifts a figure off the wall.
 *
 * Two things decide how much of a system lands on a given spot:
 *
 *   reach   where its beams actually point -- the pool on the floor, the
 *           shaft raking in from the wings
 *   facing  whether that bit of surface is turned towards the lamp at all
 *           (N dot L). This is the half that makes an angle an angle: a side
 *           light lights the left of a figure and leaves the right dark, and
 *           a back light catches nothing but the outline.
 *
 * Pure maths, no DOM, so it can be unit-tested under node.
 */
(function (root, factory) {
  var api = factory(root.SLS && root.SLS.Color ||
    (typeof require === 'function' ? require('./color.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SLS = root.SLS || {};
  root.SLS.Light = api;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this), function (Color) {
  'use strict';

  /* Axes for the facing test: +x right, +y up, +z out of the screen towards
   * the audience. `dir` on each lamp points FROM the stage TOWARDS the lamp. */

  /* Lamp positions and targets are fractions: x of the picture width, y of the
   * picture height. A lamp may sit outside the picture -- the wing booms do,
   * and so does front of house, which is behind you. */
  var ANGLES = [
    {
      id: 'front',
      label: 'Front of house',
      note: 'Out over the audience. Flat and even: shows colour, hides shape.',
      brightness: 0.45,
      glow: 0.015,         /* almost nothing to see in the air: it is behind you */
      lamps: [
        { kind: 'wash', cx: 0.50, cy: 0.56, radius: 1.15, dir: [0, 0.42, 0.91] }
      ]
    },
    {
      id: 'top',
      label: 'Overhead',
      note: 'The bar straight above the stage. Pools on the deck, bright heads, faces in shadow.',
      brightness: 0.60,
      glow: 0.050,
      lamps: [
        { kind: 'cone', ox: 0.22, oy: -0.35, tx: 0.22, ty: 0.84, spread: 0.30, dir: [0, 0.99, 0.12] },
        { kind: 'cone', ox: 0.50, oy: -0.35, tx: 0.50, ty: 0.84, spread: 0.30, dir: [0, 0.99, 0.12] },
        { kind: 'cone', ox: 0.78, oy: -0.35, tx: 0.78, ty: 0.84, spread: 0.30, dir: [0, 0.99, 0.12] }
      ]
    },
    {
      id: 'side',
      label: 'Side (wings)',
      note: 'Booms in the wings firing straight across. Shows shape better than anything else.',
      brightness: 0.60,
      glow: 0.040,
      lamps: [
        { kind: 'cone', ox: -0.16, oy: 0.50, tx: 0.62, ty: 0.74, spread: 0.26, dir: [-0.94, 0.30, 0.16] },
        { kind: 'cone', ox: 1.16, oy: 0.50, tx: 0.38, ty: 0.74, spread: 0.26, dir: [0.94, 0.30, 0.16] }
      ]
    },
    {
      id: 'back',
      label: 'Back light',
      note: 'Upstage and steep, aimed at the audience. Rims the edges and lifts a figure off the wall.',
      brightness: 0.70,
      glow: 0.075,
      lamps: [
        { kind: 'cone', ox: 0.30, oy: -0.30, tx: 0.44, ty: 0.88, spread: 0.32, dir: [-0.35, 0.80, -0.49] },
        { kind: 'cone', ox: 0.70, oy: -0.30, tx: 0.56, ty: 0.88, spread: 0.32, dir: [0.35, 0.80, -0.49] }
      ]
    }
  ];

  var COUNT = ANGLES.length;

  function angleById(id) {
    for (var i = 0; i < ANGLES.length; i++) if (ANGLES[i].id === id) return ANGLES[i];
    return ANGLES[0];
  }

  /** A fresh lighting system for one angle, white and up at a usable level. */
  function create(index) {
    var a = ANGLES[index % ANGLES.length];
    return {
      id: a.id,
      label: a.label,
      note: a.note,
      /* on the rig at all -- not the same as being dimmed to zero */
      enabled: true,
      r: 255, g: 255, b: 255,
      brightness: a.brightness
    };
  }

  function createRig() {
    var out = [];
    for (var i = 0; i < ANGLES.length; i++) out.push(create(i));
    return out;
  }

  /* How much the inverse-square is softened near a lamp. Without this it runs
   * away to infinity at the lamp itself, which on a picture this shallow blows
   * the top of the wall out to solid white. */
  var SOFTEN = 0.6;

  function smoothstep(t) { return t <= 0 ? 0 : (t >= 1 ? 1 : t * t * (3 - 2 * t)); }

  function unit(v) {
    var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  /**
   * Work out the per-pixel constants for every lamp in one system. Done once
   * per system rather than once per pixel.
   *
   * geom: { w, h } in render pixels.
   */
  function prepare(light, geom) {
    var a = angleById(light.id);
    var out = [];
    for (var i = 0; i < a.lamps.length; i++) {
      var L = a.lamps[i];
      var d = unit(L.dir);
      if (L.kind === 'wash') {
        out.push({
          kind: 0,
          cx: L.cx * geom.w, cy: L.cy * geom.h,
          radius: L.radius * geom.h,
          dx: d[0], dy: d[1], dz: d[2]
        });
        continue;
      }
      var lx = L.ox * geom.w, ly = L.oy * geom.h;
      var tx = L.tx * geom.w, ty = L.ty * geom.h;
      var vx = tx - lx, vy = ty - ly;
      var throwDist = Math.sqrt(vx * vx + vy * vy) || 1;
      var ref2 = throwDist * throwDist;
      var outer = Math.cos(L.spread);
      var inner = Math.cos(L.spread * 0.35);
      out.push({
        kind: 1,
        lx: lx, ly: ly,
        ax: vx / throwDist, ay: vy / throwDist,
        cosOuter: outer,
        cosInner: inner,
        invSpan: 1 / Math.max(1e-6, inner - outer),
        /* normalised so the beam is exactly 1.0 where it is aimed */
        num: (1 + SOFTEN) * ref2,
        den: SOFTEN * ref2,
        dx: d[0], dy: d[1], dz: d[2]
      });
    }
    return out;
  }

  /** Everything the rig needs prepared, flattened, with the system it belongs to. */
  function prepareRig(lights, geom) {
    var out = [];
    for (var i = 0; i < lights.length; i++) {
      var lamps = prepare(lights[i], geom);
      for (var k = 0; k < lamps.length; k++) {
        lamps[k].system = i;
        out.push(lamps[k]);
      }
    }
    return out;
  }

  /**
   * How much of this lamp's beam arrives at a point in the picture, before
   * anything is asked about which way the surface is turned. Exactly 1.0 where
   * a cone is aimed, and 0 outside it.
   */
  function reach(L, px, py) {
    if (L.kind === 0) {
      var wx = px - L.cx, wy = py - L.cy;
      var t = Math.sqrt(wx * wx + wy * wy) / L.radius;
      if (t >= 1) return 0;
      var s = 1 - t * t;
      return s * s;
    }
    var dx = px - L.lx, dy = py - L.ly;
    var d2 = dx * dx + dy * dy;
    if (d2 < 1e-9) return L.num / L.den;
    var d = Math.sqrt(d2);
    var cosA = (dx * L.ax + dy * L.ay) / d;
    if (cosA <= L.cosOuter) return 0;
    var cone = cosA >= L.cosInner ? 1 : smoothstep((cosA - L.cosOuter) * L.invSpan);
    return cone * L.num / (d2 + L.den);
  }

  /**
   * Roll highlights off instead of clipping them. Per channel, with a white
   * point, so a pure red beam still renders as pure red rather than drifting
   * towards white -- which matters when the whole point is colour behaviour.
   */
  var WHITE = 2.0;
  var W2 = WHITE * WHITE;
  function toneMap(v) {
    if (v <= 0) return 0;
    var out = v * (1 + v / W2) / (1 + v);
    return out > 1 ? 1 : out;
  }

  return {
    COUNT: COUNT, ANGLES: ANGLES, angleById: angleById,
    create: create, createRig: createRig,
    prepare: prepare, prepareRig: prepareRig, reach: reach,
    smoothstep: smoothstep, unit: unit,
    toneMap: toneMap, WHITE: WHITE, SOFTEN: SOFTEN
  };
});
