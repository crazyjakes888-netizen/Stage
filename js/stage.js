/*
 * stage.js -- draws the stage.
 *
 * Two buffers, each rebuilt only when the thing it depends on changes:
 *
 *   surface  what colour everything is painted, with no light on it at all
 *   light    how much red, green and blue lands on each point of the picture
 *
 * The picture is those two multiplied together, channel by channel. Moving an
 * entity only rebuilds the first; changing a lamp only rebuilds the second.
 */
(function (root, factory) {
  root.SLS = root.SLS || {};
  root.SLS.Stage = factory(root.SLS.Color, root.SLS.Light, root.SLS.Entities);
})(typeof self !== 'undefined' ? self : this, function (Color, Light, Entities) {
  'use strict';

  var MAX_W = 1000;

  /* where the floor starts, as a fraction of the picture height */
  var FLOOR_Y = 0.66;

  var WALL = '#34343e';
  var FLOOR = '#25252d';
  var FLOOR_EDGE = '#1a1a21';

  /* how tall an entity stands, as a fraction of the picture height, before
   * the near/far size difference is applied */
  var FIGURE_H = 0.40;

  function create(canvas) {
    var ctx = canvas.getContext('2d');

    /* the flat, unlit painting of the scene */
    var surfaceCanvas = document.createElement('canvas');
    var surfaceCtx = surfaceCanvas.getContext('2d', { willReadFrequently: true });

    var S = {
      w: 0, h: 0, floorY: 0,
      surface: null,        /* Uint8ClampedArray, RGBA */
      mask: null,           /* Uint8Array, 1 where an entity stands */
      lightBuf: null,       /* Float32Array, 3 per pixel: illumination */
      glowBuf: null,        /* Float32Array, 3 per pixel: light in the air */
      out: null,            /* ImageData */
      entities: [],
      lights: [],
      fields: [],
      surfaceDirty: true,
      lightDirty: true,
      fieldsDirty: true
    };

    function layout() {
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(160, Math.min(MAX_W, Math.round(rect.width)));
      var h = Math.max(120, Math.round(rect.height));
      if (w === S.w && h === S.h) return false;
      S.w = w; S.h = h;
      S.floorY = Math.round(h * FLOOR_Y);
      canvas.width = w; canvas.height = h;
      surfaceCanvas.width = w; surfaceCanvas.height = h;
      S.lightBuf = new Float32Array(w * h * 3);
      S.glowBuf = new Float32Array(w * h * 3);
      S.mask = new Uint8Array(w * h);
      S.out = ctx.createImageData(w, h);
      S.surfaceDirty = true;
      S.lightDirty = true;
      S.fieldsDirty = true;
      return true;
    }

    /* ------------------------------------------------- where things stand */

    /** Entities further upstage stand smaller. */
    function depthScale(ny) {
      var t = (ny - FLOOR_Y) / (1 - FLOOR_Y);
      if (t < 0) t = 0; else if (t > 1) t = 1;
      return 0.72 + 0.46 * t;
    }

    /** Screen box for an entity, from its normalised position. */
    function boxFor(e) {
      var scale = depthScale(e.y);
      var h = S.h * FIGURE_H * scale;
      var w = h * Entities.ASPECT;
      return { x: e.x * S.w - w / 2, y: e.y * S.h - h, w: w, h: h };
    }

    /* --------------------------------------------------- the two buffers */

    function drawEntities(c) {
      /* back to front, so the near ones overlap the far ones */
      var order = S.entities.slice().sort(function (a, b) { return a.y - b.y; });
      for (var i = 0; i < order.length; i++) {
        var b = boxFor(order[i]);
        Entities.draw(c, order[i].hex, b.x, b.y, b.w, b.h);
      }
    }

    function buildSurface() {
      var c = surfaceCtx;
      var n = S.w * S.h;

      /* first pass: the entities alone, to know where they stand */
      c.clearRect(0, 0, S.w, S.h);
      drawEntities(c);
      var only = c.getImageData(0, 0, S.w, S.h).data;
      for (var i = 0; i < n; i++) S.mask[i] = only[i * 4 + 3] > 40 ? 1 : 0;

      /* second pass: the whole painting */
      c.clearRect(0, 0, S.w, S.h);
      c.fillStyle = WALL;
      c.fillRect(0, 0, S.w, S.floorY);
      c.fillStyle = FLOOR;
      c.fillRect(0, S.floorY, S.w, S.h - S.floorY);
      c.fillStyle = FLOOR_EDGE;
      c.fillRect(0, S.floorY - 2, S.w, 3);
      drawEntities(c);

      S.surface = c.getImageData(0, 0, S.w, S.h).data;
      S.surfaceDirty = false;
    }

    /* How much each lamp reaches every point. This depends only on where the
     * lamp hangs and how wide it opens, never on its colour -- so it survives
     * every colour and brightness change and is only rebuilt when the picture
     * is resized. That is what keeps dragging a colour bar smooth. */
    function buildFields() {
      var geom = { w: S.w, h: S.h, floorY: S.floorY };
      var n = S.w * S.h;
      S.fields = [];
      for (var k = 0; k < S.lights.length; k++) {
        var L = Light.prepare(S.lights[k], geom);
        var f = new Float32Array(n);
        for (var y = 0; y < S.h; y++) {
          var row = y * S.w;
          for (var x = 0; x < S.w; x++) f[row + x] = Light.reach(L, x, y);
        }
        S.fields.push(f);
      }
      S.fieldsDirty = false;
    }

    function buildLight() {
      if (S.fieldsDirty || S.fields.length !== S.lights.length) buildFields();
      var lb = S.lightBuf, gb = S.glowBuf;
      lb.fill(0);
      var n = S.w * S.h;

      for (var k = 0; k < S.lights.length; k++) {
        var l = S.lights[k];
        /* a lamp that is not on the rig contributes nothing at all */
        if (!l.enabled || l.brightness <= 0) continue;
        var lin = Color.hexToLinear(Color.rgbToHex(l.r, l.g, l.b));
        var cr = lin[0] * l.brightness, cg = lin[1] * l.brightness, cb = lin[2] * l.brightness;
        var f = S.fields[k];
        for (var i = 0; i < n; i++) {
          var a = f[i];
          if (a <= 0) continue;
          var o = i * 3;
          lb[o] += cr * a; lb[o + 1] += cg * a; lb[o + 2] += cb * a;
        }
      }

      /* Light hanging in the air, so a beam shows against the wall. Kept low:
       * pushed up it stops reading as a beam and just fogs the whole picture
       * pale grey. */
      var GLOW = 0.05;
      for (var j = 0, m = lb.length; j < m; j++) gb[j] = lb[j] * GLOW;
      S.lightDirty = false;
    }

    /* ------------------------------------------------------- the picture */

    /* Haze in front of a figure really does wash it out, but washing the colour
     * off the entities is the one thing this is meant to show, so the air glow
     * lands at full strength on the set and is held well back on them. */
    var GLOW_ON_ENTITY = 0.22;

    function composite() {
      var px = S.out.data, surf = S.surface, lb = S.lightBuf, gb = S.glowBuf, mask = S.mask;
      var D = Color.DECODE, enc = Color.encodeByte, tone = Light.toneMap;
      var n = S.w * S.h;
      for (var i = 0; i < n; i++) {
        var s = i * 4, o = i * 3;
        var gf = mask[i] ? GLOW_ON_ENTITY : 1;
        /* surface colour x light colour, per channel, in linear light */
        px[s]     = enc(tone(D[surf[s]]     * lb[o]     + gb[o]     * gf));
        px[s + 1] = enc(tone(D[surf[s + 1]] * lb[o + 1] + gb[o + 1] * gf));
        px[s + 2] = enc(tone(D[surf[s + 2]] * lb[o + 2] + gb[o + 2] * gf));
        px[s + 3] = 255;
      }
      ctx.putImageData(S.out, 0, 0);
    }

    function render() {
      layout();
      if (!S.out) return;
      if (S.surfaceDirty) buildSurface();
      if (S.lightDirty) buildLight();
      composite();
    }

    /* Give the picture a size straight away: entities are placed (and clamped
     * to the deck) before the first frame is drawn, and clamping against a
     * zero-sized picture would put them at NaN and they would never appear. */
    layout();

    /* ---------------------------------------------------------- the api */

    return {
      setLights: function (lights) { S.lights = lights; S.lightDirty = true; S.fieldsDirty = true; },
      setEntities: function (list) { S.entities = list; S.surfaceDirty = true; },
      lightsChanged: function () { S.lightDirty = true; },
      entitiesChanged: function () { S.surfaceDirty = true; },
      resize: function () { if (layout()) return true; return false; },
      render: render,
      boxFor: boxFor,

      /** Normalised position from a point in canvas CSS space. */
      toNormalised: function (cssX, cssY) {
        var rect = canvas.getBoundingClientRect();
        return { x: cssX / rect.width, y: cssY / rect.height };
      },

      /** The entity under a normalised point, nearest first, or null. */
      pick: function (nx, ny) {
        var order = S.entities.slice().sort(function (a, b) { return b.y - a.y; });
        var px = nx * S.w, py = ny * S.h;
        for (var i = 0; i < order.length; i++) {
          var b = boxFor(order[i]);
          if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return order[i];
        }
        return null;
      },

      /** Keep an entity on the deck and inside the picture. */
      clamp: function (nx, ny) {
        if (!S.w || !S.h) layout();
        var half = S.w ? (FIGURE_H * Entities.ASPECT) * 0.5 * (S.h / S.w) * 1.2 : 0.1;
        return {
          x: Math.max(half, Math.min(1 - half, nx)),
          y: Math.max(FLOOR_Y + 0.04, Math.min(0.995, ny))
        };
      },

      FLOOR_Y: FLOOR_Y
    };
  }

  return { create: create, FLOOR_Y: FLOOR_Y };
});
