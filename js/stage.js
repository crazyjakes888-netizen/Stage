/*
 * stage.js -- draws the stage.
 *
 * Three buffers, each rebuilt only when the thing it depends on changes:
 *
 *   surface  what colour everything is painted, with no light on it at all
 *   normals  which way each bit of surface is turned -- the wall faces the
 *            audience, the deck faces up, and a figure is rounded, so its
 *            left side faces left and its right side faces right
 *   light    how much red, green and blue lands on each point
 *
 * The picture is surface x light, channel by channel. The normals are what
 * make the rig's angles mean anything: a side light lands on the side of a
 * figure that is turned towards the wings and nowhere else, and a back light
 * catches nothing but the outline.
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

  /* how tall a figure stands, as a fraction of the picture height, before the
   * near/far size difference is applied */
  var FIGURE_H = 0.40;

  /* Haze in front of a figure really does wash it out, but washing the colour
   * off the figures is the one thing this is meant to show, so the air glow
   * lands at full strength on the set and is held well back on them. */
  var GLOW_ON_ENTITY = 0.22;

  function create(canvas) {
    var ctx = canvas.getContext('2d');

    var surfaceCanvas = document.createElement('canvas');
    var surfaceCtx = surfaceCanvas.getContext('2d', { willReadFrequently: true });

    var S = {
      w: 0, h: 0, floorY: 0,
      surface: null,        /* Uint8ClampedArray, RGBA */
      mask: null,           /* Uint8Array, 1 where a figure stands */
      nx: null, ny: null, nz: null,
      lightBuf: null,       /* Float32Array, 3 per pixel */
      glowBuf: null,
      out: null,
      entities: [],
      lights: [],
      lamps: [],            /* prepared sub-lamps, flattened across systems */
      fields: [],           /* reach per sub-lamp, plus its bounding box */
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
      var n = w * h;
      S.lightBuf = new Float32Array(n * 3);
      S.glowBuf = new Float32Array(n * 3);
      S.mask = new Uint8Array(n);
      S.nx = new Float32Array(n);
      S.ny = new Float32Array(n);
      S.nz = new Float32Array(n);
      S.out = ctx.createImageData(w, h);
      S.surfaceDirty = true;
      S.lightDirty = true;
      S.fieldsDirty = true;
      return true;
    }

    /* ------------------------------------------------- where things stand */

    function depthScale(ny) {
      var t = (ny - FLOOR_Y) / (1 - FLOOR_Y);
      if (t < 0) t = 0; else if (t > 1) t = 1;
      return 0.72 + 0.46 * t;
    }

    function boxFor(e) {
      var scale = depthScale(e.y);
      var h = S.h * FIGURE_H * scale;
      var w = h * Entities.ASPECT;
      return { x: e.x * S.w - w / 2, y: e.y * S.h - h, w: w, h: h };
    }

    /* ----------------------------------------- the painting and the normals */

    function drawEntities(c) {
      var order = S.entities.slice().sort(function (a, b) { return a.y - b.y; });
      for (var i = 0; i < order.length; i++) {
        var b = boxFor(order[i]);
        Entities.draw(c, order[i].hex, b.x, b.y, b.w, b.h);
      }
      return order;
    }

    function buildSurface() {
      var c = surfaceCtx;
      var n = S.w * S.h, i;

      /* first pass: the figures alone, to know where they stand */
      c.clearRect(0, 0, S.w, S.h);
      var order = drawEntities(c);
      var only = c.getImageData(0, 0, S.w, S.h).data;
      for (i = 0; i < n; i++) S.mask[i] = only[i * 4 + 3] > 40 ? 1 : 0;

      /* normals: the set first, then round off each figure over the top */
      for (var y = 0; y < S.h; y++) {
        var up = y >= S.floorY;             /* the deck faces up */
        var row = y * S.w;
        for (var x = 0; x < S.w; x++) {
          i = row + x;
          S.nx[i] = 0;
          S.ny[i] = up ? 1 : 0;
          S.nz[i] = up ? 0 : 1;             /* the wall faces the audience */
        }
      }

      for (var e = 0; e < order.length; e++) {
        var b = boxFor(order[e]);
        var x0 = Math.max(0, Math.floor(b.x)), x1 = Math.min(S.w - 1, Math.ceil(b.x + b.w));
        var y0 = Math.max(0, Math.floor(b.y)), y1 = Math.min(S.h - 1, Math.ceil(b.y + b.h));
        for (var py = y0; py <= y1; py++) {
          var v = (py - b.y) / b.h;
          /* the top of the head is turned upwards, the rest faces out front */
          var ny = v < 0.20 ? 0.06 + (0.20 - v) / 0.20 * 0.62 : 0.06;
          for (var px = x0; px <= x1; px++) {
            var idx = py * S.w + px;
            if (!S.mask[idx]) continue;
            /* Rounded across the width: the left side is turned towards the
             * left wing, the right towards the right. Rounding it harder than
             * a half-circle pushes the outer edges closer to side-on, which is
             * what gives a back light an edge to catch and a side light
             * something to model. */
            var u = (px - b.x) / b.w;
            var nx = (u - 0.5) * 1.84;
            var rest = 1 - nx * nx - ny * ny;
            var nz = Math.sqrt(rest > 0.04 ? rest : 0.04);
            var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            S.nx[idx] = nx / len; S.ny[idx] = ny / len; S.nz[idx] = nz / len;
          }
        }
      }

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

    /* ------------------------------------------------------- the light */

    /**
     * Where each lamp's beam lands. This depends only on where the lamp hangs
     * and where it points, never on its colour and never on what is standing
     * on the stage, so it survives every colour change and every drag and is
     * only rebuilt when the picture is resized.
     */
    function buildFields() {
      S.lamps = Light.prepareRig(S.lights, { w: S.w, h: S.h });
      var n = S.w * S.h;
      S.fields = [];
      for (var k = 0; k < S.lamps.length; k++) {
        var L = S.lamps[k];
        var f = new Float32Array(n);
        var minX = S.w, maxX = -1, minY = S.h, maxY = -1;
        for (var y = 0; y < S.h; y++) {
          var row = y * S.w;
          for (var x = 0; x < S.w; x++) {
            var v = Light.reach(L, x, y);
            if (v <= 0) continue;
            f[row + x] = v;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        /* remembering where a beam actually falls lets the light pass skip
         * everything outside it, which is most of the picture for a spot */
        S.fields.push({ f: f, x0: minX, x1: maxX, y0: minY, y1: maxY });
      }
      S.fieldsDirty = false;
    }

    function buildLight() {
      if (S.fieldsDirty || S.fields.length === 0) buildFields();
      var lb = S.lightBuf, gb = S.glowBuf;
      lb.fill(0); gb.fill(0);

      for (var k = 0; k < S.lamps.length; k++) {
        var L = S.lamps[k];
        var sys = S.lights[L.system];
        if (!sys || !sys.enabled || sys.brightness <= 0) continue;

        var lin = Color.hexToLinear(Color.rgbToHex(sys.r, sys.g, sys.b));
        var cr = lin[0] * sys.brightness, cg = lin[1] * sys.brightness, cb = lin[2] * sys.brightness;
        var glow = Light.angleById(sys.id).glow;
        var gr = cr * glow, gg = cg * glow, gb2 = cb * glow;

        var fld = S.fields[k], f = fld.f;
        var dx = L.dx, dy = L.dy, dz = L.dz;

        for (var y = fld.y0; y <= fld.y1; y++) {
          var row = y * S.w;
          for (var x = fld.x0; x <= fld.x1; x++) {
            var i = row + x;
            var a = f[i];
            if (a <= 0) continue;
            var o = i * 3;

            /* light hanging in the air does not care which way anything faces */
            gb[o] += gr * a; gb[o + 1] += gg * a; gb[o + 2] += gb2 * a;

            /* ...but light landing on a surface very much does */
            var ndl = S.nx[i] * dx + S.ny[i] * dy + S.nz[i] * dz;
            if (ndl <= 0) continue;
            var amount = a * ndl;
            lb[o] += cr * amount; lb[o + 1] += cg * amount; lb[o + 2] += cb * amount;
          }
        }
      }
      S.lightDirty = false;
    }

    /* ------------------------------------------------------- the picture */

    function composite() {
      var px = S.out.data, surf = S.surface, lb = S.lightBuf, gb = S.glowBuf, mask = S.mask;
      var D = Color.DECODE, enc = Color.encodeByte, tone = Light.toneMap;
      var n = S.w * S.h;
      for (var i = 0; i < n; i++) {
        var s = i * 4, o = i * 3;
        var gf = mask[i] ? GLOW_ON_ENTITY : 1;
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

    /* Give the picture a size straight away: figures are placed (and clamped
     * to the deck) before the first frame is drawn, and clamping against a
     * zero-sized picture would put them at NaN and they would never appear. */
    layout();

    /* ---------------------------------------------------------- the api */

    return {
      setLights: function (lights) {
        S.lights = lights;
        S.fieldsDirty = true;
        S.lightDirty = true;
      },
      setEntities: function (list) {
        S.entities = list;
        S.surfaceDirty = true;
        /* the figures carry the normals, so the light has to follow them */
        S.lightDirty = true;
      },
      lightsChanged: function () { S.lightDirty = true; },
      entitiesChanged: function () { S.surfaceDirty = true; S.lightDirty = true; },
      resize: function () { return layout(); },
      render: render,
      boxFor: boxFor,

      pick: function (nx, ny) {
        var order = S.entities.slice().sort(function (a, b) { return b.y - a.y; });
        var px = nx * S.w, py = ny * S.h;
        for (var i = 0; i < order.length; i++) {
          var b = boxFor(order[i]);
          if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return order[i];
        }
        return null;
      },

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
