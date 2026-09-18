/*
 * light.js -- the light model.
 *
 * Each lighting system is a lamp hanging above the stage throwing a cone
 * straight down. For any point on the stage it works out how much of that
 * lamp's light lands there, and the colour that lands is the lamp's own RGB.
 *
 * The important part is what happens next, in stage.js:
 *
 *     seen = surface colour  x  light colour        (per channel, R G B)
 *
 * A surface colour is how much of each channel that paint gives back. A lamp
 * colour is how much of each channel it puts out. So a red lamp is (1, 0, 0):
 * it has no green and no blue to give, and a green entity has no red to give
 * back, so a green entity under a red lamp goes black on its own. Nothing is
 * written down anywhere -- it falls out of the multiplication, which is why
 * adding another lamp or another colour never needs a new special case.
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

  /* How many lighting systems the rig has. Adding to this is all it takes:
   * the control panel, the settings switches and the render all read it. */
  var COUNT = 4;

  /* Where each lamp hangs, as a fraction across the stage (0 = far left,
   * 1 = far right), and how far above the top of the picture. */
  function defaultPosition(index, count) {
    return (index + 0.5) / count;
  }

  /** A fresh lighting system, white and up at a usable level. */
  function create(index, count) {
    return {
      id: 'L' + (index + 1),
      label: 'Light ' + (index + 1),
      /* exists on the rig at all -- not the same as being dimmed to zero */
      enabled: true,
      r: 255, g: 255, b: 255,
      brightness: 0.70,
      x: defaultPosition(index, count || COUNT),
      /* How far above the top of the picture the lamp hangs, as a fraction of
       * the picture height. It has to hang well clear: a lamp just above the
       * frame is only a few pixels from the top of the wall, and inverse-square
       * then makes that corner many times brighter than the floor. */
      height: 0.38,
      /* Narrow enough that each lamp lays down its own pool. Opened much wider
       * than this every lamp covers the whole stage, the four wash into one
       * flat field, and moving an entity between them stops doing anything. */
      spread: 0.32,        /* half-angle of the cone, radians */
      softness: 0.60       /* 0 = hard edge, 1 = fully feathered */
    };
  }

  function createRig(count) {
    var n = count || COUNT;
    var out = [];
    for (var i = 0; i < n; i++) out.push(create(i, n));
    return out;
  }

  /**
   * Pre-compute everything that does not change per pixel. Doing the divisions
   * and the linear-light conversion once per lamp instead of once per pixel is
   * most of why a full re-light is quick.
   *
   * geom: { w, h, floorY } in render pixels.
   */
  function prepare(light, geom) {
    var lx = light.x * geom.w;
    var ly = -light.height * geom.h;
    /* Working in slope rather than angle keeps a divide in the inner loop
     * instead of an atan2, which matters at a million samples a frame. */
    var tanOuter = Math.tan(light.spread);
    var tanInner = tanOuter * (1 - 0.95 * light.softness);
    /* Normalise so a lamp at brightness 1 lands exactly 1.0 on the floor below
     * it, whatever size the picture is. */
    var throwDist = geom.floorY - ly;
    var lin = Color.hexToLinear(Color.rgbToHex(light.r, light.g, light.b));
    var ref2 = throwDist * throwDist;
    return {
      lx: lx, ly: ly,
      tanOuter: tanOuter,
      tanInner: tanInner,
      invSpan: 1 / Math.max(1e-6, tanOuter - tanInner),
      /* A plain 1/d^2 runs away to infinity at the lamp itself, which on a
       * picture this shallow blows the top of the wall out to white. Softening
       * the bottom of the fraction caps it at (1+SOFTEN)/SOFTEN times the floor
       * level while leaving the falloff across the stage looking right. */
      num: (1 + SOFTEN) * ref2,
      den: SOFTEN * ref2,
      ref2: ref2,
      r: lin[0] * light.brightness,
      g: lin[1] * light.brightness,
      b: lin[2] * light.brightness
    };
  }

  /* How much the inverse-square is softened near the lamp. */
  var SOFTEN = 0.6;

  /**
   * How much of this lamp reaches a point, ignoring what colour it is.
   * Returns 0 above the lamp and outside the cone, and exactly 1 on the floor
   * directly below it.
   */
  function reach(L, px, py) {
    var dy = py - L.ly;
    if (dy <= 0) return 0;
    var dx = px - L.lx;
    if (dx < 0) dx = -dx;
    var slope = dx / dy;
    if (slope >= L.tanOuter) return 0;
    var cone = 1;
    if (slope > L.tanInner) {
      var t = 1 - (slope - L.tanInner) * L.invSpan;
      cone = t * t * (3 - 2 * t);           /* smoothstep: a soft beam edge */
    }
    return cone * L.num / (dx * dx + dy * dy + L.den);
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
    COUNT: COUNT,
    create: create, createRig: createRig, defaultPosition: defaultPosition,
    prepare: prepare, reach: reach,
    toneMap: toneMap, WHITE: WHITE
  };
});
