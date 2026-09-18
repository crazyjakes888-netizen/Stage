/*
 * entities.js -- the things you put on the stage.
 *
 * Deliberately generic: a simple rounded figure with eyes, no name and no
 * personality. What matters about one is its colour, because that colour is a
 * reflectance -- how much red, green and blue it gives back -- and that is
 * what decides whether it survives the lighting.
 *
 * The figure is drawn flat, with no shading baked in at all. Every bit of
 * light you see on it is worked out by the renderer.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SLS = root.SLS || {};
  root.SLS.Entities = api;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this), function () {
  'use strict';

  /* The colours you can pick from. Saturated ones first, because those are the
   * ones that do something interesting under a coloured lamp; the neutrals at
   * the end are useful as a reference for what the light is actually doing. */
  var COLOURS = [
    { id: 'red',    name: 'Red',    hex: '#e02a2a' },
    { id: 'orange', name: 'Orange', hex: '#ef7a1c' },
    { id: 'yellow', name: 'Yellow', hex: '#e8d21d' },
    { id: 'lime',   name: 'Lime',   hex: '#7ed321' },
    { id: 'green',  name: 'Green',  hex: '#25a34c' },
    { id: 'teal',   name: 'Teal',   hex: '#13aba4' },
    { id: 'cyan',   name: 'Cyan',   hex: '#29c5e8' },
    { id: 'blue',   name: 'Blue',   hex: '#2f5ad8' },
    { id: 'indigo', name: 'Indigo', hex: '#5b3fd6' },
    { id: 'purple', name: 'Purple', hex: '#8f35d1' },
    { id: 'pink',   name: 'Pink',   hex: '#e34b9c' },
    { id: 'white',  name: 'White',  hex: '#e9e9ee' },
    { id: 'grey',   name: 'Grey',   hex: '#8b8b95' },
    { id: 'black',  name: 'Black',  hex: '#33333c' }
  ];

  function byId(id) {
    for (var i = 0; i < COLOURS.length; i++) if (COLOURS[i].id === id) return COLOURS[i];
    return COLOURS[0];
  }

  /* The figure is drawn in this box and scaled to wherever it stands. */
  var ART_W = 100, ART_H = 160;
  var ASPECT = ART_W / ART_H;

  function roundRect(ctx, x, y, w, h, rTop, rBot) {
    ctx.beginPath();
    ctx.moveTo(x, y + rTop);
    ctx.quadraticCurveTo(x, y, x + rTop, y);
    ctx.lineTo(x + w - rTop, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rTop);
    ctx.lineTo(x + w, y + h - rBot);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rBot, y + h);
    ctx.lineTo(x + rBot, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rBot);
    ctx.closePath();
    ctx.fill();
  }

  function disc(ctx, x, y, r, colour) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Draw one figure, flat, filling a box of `w` x `h` at (x, y) (top-left).
   * Everything is the entity's own colour except the eyes, so almost all of
   * what you see reflects that one colour.
   */
  function draw(ctx, hex, x, y, w, h) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(w / ART_W, h / ART_H);

    ctx.fillStyle = hex;

    /* arms, behind the body */
    roundRect(ctx, 4, 62, 18, 46, 9, 9);
    roundRect(ctx, 78, 62, 18, 46, 9, 9);

    /* feet */
    roundRect(ctx, 18, 140, 28, 18, 6, 9);
    roundRect(ctx, 54, 140, 28, 18, 6, 9);

    /* body: one capsule, fully rounded on top so it reads as head and body */
    roundRect(ctx, 12, 10, 76, 134, 38, 26);

    /* eyes -- the only part that is not the entity's colour */
    disc(ctx, 37, 52, 13, '#f4f4f7');
    disc(ctx, 63, 52, 13, '#f4f4f7');
    disc(ctx, 39, 53, 6, '#22222a');
    disc(ctx, 65, 53, 6, '#22222a');

    /* mouth */
    ctx.strokeStyle = '#22222a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(40, 82);
    ctx.quadraticCurveTo(50, 90, 60, 82);
    ctx.stroke();

    ctx.restore();
  }

  /** A small standalone picture of one, for the picker buttons. */
  function thumbnail(hex, size) {
    var canvas = document.createElement('canvas');
    var w = Math.round(size * ASPECT), h = size;
    canvas.width = w; canvas.height = h;
    draw(canvas.getContext('2d'), hex, 0, 0, w, h);
    return canvas;
  }

  return {
    COLOURS: COLOURS, byId: byId,
    ART_W: ART_W, ART_H: ART_H, ASPECT: ASPECT,
    draw: draw, thumbnail: thumbnail
  };
});
