/*
 * Unit tests for the parts that are pure maths.
 *
 *   node tests/math.test.js
 *
 * The drawing and the interface need a browser and are not covered here.
 */
'use strict';

global.self = global;
require('../js/color.js');
require('../js/light.js');
require('../js/entities.js');

var Color = global.SLS.Color;
var Light = global.SLS.Light;
var Entities = global.SLS.Entities;

var pass = 0, fail = 0;
function describe(name) { console.log('\n' + name); }
function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  -- ' + detail : '')); }
}
function near(a, b, tol, label) {
  ok(Math.abs(a - b) <= (tol == null ? 1e-6 : tol), label, 'got ' + a + ', expected ~' + b);
}

/* ------------------------------------------------------------------ colour */

describe('colour conversions');
{
  ok(Color.rgbToHex(Color.hexToRgb('#e02a2a')) === '#e02a2a', 'hex round-trips');
  near(Color.linearToSrgb(Color.srgbToLinear(0.5)), 0.5, 1e-9, 'sRGB round-trips');
  near(Color.srgbToLinear(0.5), 0.2140, 1e-3, 'mid grey reflects only ~21% of the light');
  var hsv = Color.rgbToHsv(Color.hexToRgb('#ef7a1c'));
  ok(Color.rgbToHex(Color.hsvToRgb(hsv)) === '#ef7a1c', 'hsv round-trips');
}

describe('the mixer bar and the three channel bars agree');
{
  /* Moving the mixer swings all three channels; moving a channel slides the
   * mixer to the hue that mix landed on. Both directions have to agree or the
   * bars drift apart as you work. */
  function mixerTo(rgb, hue) {
    var hsv = Color.rgbToHsv(rgb);
    var s = hsv.s < 0.06 ? 1 : hsv.s;
    var v = hsv.v < 0.06 ? 1 : hsv.v;
    return Color.hsvToRgb(hue, s, v);
  }
  function mixerShows(rgb) { return Color.rgbToHsv(rgb).h; }

  var start = { r: 255, g: 0, b: 0 };
  near(mixerShows(start), 0, 0.01, 'a pure red mix puts the mixer at 0 degrees');

  var toGreen = mixerTo(start, 120);
  ok(toGreen.r === 0 && toGreen.g === 255 && toGreen.b === 0,
     'dragging the mixer to 120 swings the channels to pure green');
  near(mixerShows(toGreen), 120, 0.01, 'and the mixer still reads 120 back');

  /* a half-lit colour keeps its level when the mixer is swung */
  var dim = Color.hsvToRgb(0, 1, 0.5);
  var dimBlue = mixerTo(dim, 240);
  near(Color.rgbToHsv(dimBlue).v, 0.5, 0.01, 'swinging the mixer keeps how light the colour was');
  near(mixerShows(dimBlue), 240, 0.01, 'and lands on the hue asked for');

  /* channels moved by hand: the mixer follows */
  var byHand = { r: 0, g: 128, b: 255 };
  near(mixerShows(byHand), 210, 0.5, 'setting the channels by hand slides the mixer to that hue');

  /* grey has no hue to swing, so the mixer is given a saturation to work with */
  var grey = { r: 128, g: 128, b: 128 };
  var greyToRed = mixerTo(grey, 0);
  ok(greyToRed.r > greyToRed.g && greyToRed.g === greyToRed.b,
     'the mixer still does something from a grey');

  /* round-trip over the whole circle */
  var stable = true;
  for (var h = 0; h < 360; h += 7) {
    var back = mixerShows(mixerTo({ r: 200, g: 40, b: 90 }, h));
    if (Math.min(Math.abs(back - h), 360 - Math.abs(back - h)) > 1.2) stable = false;
  }
  ok(stable, 'the two bars agree all the way round the circle');
}

/* ------------------------------------------------------------------- lamps */

describe('the rig');
{
  var rig = Light.createRig();
  ok(rig.length === 4, 'four lighting systems', String(rig.length));
  ok(rig.every(function (l) { return l.enabled; }), 'all on the rig to begin with');
  ok(rig.every(function (l) { return l.r === 255 && l.g === 255 && l.b === 255; }),
     'and all white, so the first colour is yours');
  ok(rig.map(function (l) { return l.id; }).join(',') === 'front,top,side,back',
     'one for each of the four angles a real rig is hung at');
  ok(rig.every(function (l) { return l.label && l.note; }), 'each one named and explained');
}

/* Facing only: how much of an angle lands on a surface turned a given way,
 * before anything is asked about where its beams actually point. This is the
 * half that makes an angle an angle. */
function facing(angleId, normal) {
  var lamps = Light.prepare({ id: angleId }, { w: 800, h: 500 });
  var total = 0;
  for (var i = 0; i < lamps.length; i++) {
    var d = lamps[i].dx * normal[0] + lamps[i].dy * normal[1] + lamps[i].dz * normal[2];
    if (d > 0) total += d;
  }
  return total;
}

function unit(v) {
  var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

var FACE  = [0, 0, 1];                      /* the wall, and a figure's front */
var DECK  = [0, 1, 0];                      /* the floor */
var LEFT  = unit([-0.85, 0.06, 0.5]);       /* the left side of a figure */
var RIGHT = unit([0.85, 0.06, 0.5]);
var HEAD  = unit([0, 0.68, 0.73]);          /* the top of a head */

describe('the four angles actually do different things');
{
  /* front of house: straight at the faces, which is why it is flat */
  ok(facing('front', FACE) > facing('top', FACE) &&
     facing('front', FACE) > facing('side', FACE) &&
     facing('front', FACE) > facing('back', FACE),
     'front of house puts more on a face than any other angle',
     'front ' + facing('front', FACE).toFixed(2));
  ok(Math.abs(facing('front', LEFT) - facing('front', RIGHT)) < 0.01,
     'and it lands the same on both sides of a figure, so it shows no shape');

  /* overhead: down the top, barely anything on a vertical surface */
  ok(facing('top', DECK) > 6 * facing('top', FACE),
     'overhead puts many times more on the deck than on a vertical face',
     'deck ' + facing('top', DECK).toFixed(2) + ' vs face ' + facing('top', FACE).toFixed(2));
  ok(facing('top', HEAD) > facing('top', FACE),
     'and more on the top of a head than on the face below it');

  /* side: the whole point is that it lands on the sides and not the front */
  ok(facing('side', LEFT) > 2 * facing('side', FACE),
     'side light puts far more on the side of a figure than on its front',
     'side ' + facing('side', LEFT).toFixed(2) + ' vs front ' + facing('side', FACE).toFixed(2));
  ok(Math.abs(facing('side', LEFT) - facing('side', RIGHT)) < 0.01,
     'and the two booms balance, one wing each');

  /* back: nothing at all on the face, which is what a silhouette is */
  ok(facing('back', FACE) === 0, 'back light puts nothing whatever on a face',
     String(facing('back', FACE)));
  ok(facing('back', DECK) > 1, 'but plenty on the deck behind them',
     facing('back', DECK).toFixed(2));
  ok(facing('back', HEAD) > 0.2, 'and it catches the top of a head',
     facing('back', HEAD).toFixed(2));
  ok(facing('back', LEFT) > 0 && facing('back', LEFT) < 0.3,
     'and only just clips the outside edge, which is the rim',
     facing('back', LEFT).toFixed(3));

  /* every direction is a unit vector, or the facing test is meaningless */
  var allUnit = true;
  Light.ANGLES.forEach(function (a) {
    Light.prepare({ id: a.id }, { w: 800, h: 500 }).forEach(function (L) {
      var len = Math.sqrt(L.dx * L.dx + L.dy * L.dy + L.dz * L.dz);
      if (Math.abs(len - 1) > 1e-9) allUnit = false;
    });
  });
  ok(allUnit, 'every lamp aims along a unit vector');
}

describe('where a beam lands');
{
  var geom = { w: 800, h: 500 };

  /* a cone is normalised to exactly 1.0 at the spot it is aimed at */
  var top = Light.prepare({ id: 'top' }, geom);
  var mid = top[1];
  var aimX = 0.50 * geom.w, aimY = 0.84 * geom.h;
  near(Light.reach(mid, aimX, aimY), 1, 0.001, 'a beam is exactly full where it is aimed');
  ok(Light.reach(mid, aimX + 400, aimY) === 0, 'and nothing at all outside the beam');
  ok(Light.reach(mid, aimX, -400) === 0, 'nothing behind the lamp either');

  /* bounded at the lamp rather than running away to infinity */
  var atLamp = Light.reach(mid, mid.lx, mid.ly + 0.001);
  ok(atLamp < 3, 'right at the lamp it is bounded, not infinite', atLamp.toFixed(2));

  /* falls off, and still behaves like inverse-square out across the stage */
  var falling = true, last = Infinity;
  for (var d = 0.05; d <= 3; d += 0.05) {
    var v = Light.reach(mid, mid.lx, mid.ly + (aimY - mid.ly) * d);
    if (v > last + 1e-9) falling = false;
    last = v;
  }
  ok(falling, 'and it only ever gets dimmer further from the lamp');

  /* the wash has no edge to fall outside of -- it covers the stage */
  var front = Light.prepare({ id: 'front' }, geom)[0];
  ok(front.kind === 0, 'front of house is a wash, not a beam');
  ok(Light.reach(front, geom.w * 0.5, geom.h * 0.56) > 0.9, 'brightest in the middle of the stage');
  ok(Light.reach(front, 0, 0) > 0, 'and still reaching the corners');

  /* a bigger picture is lit the same */
  var big = Light.prepare({ id: 'top' }, { w: 1600, h: 1000 })[1];
  near(Light.reach(big, 0.5 * 1600, 0.84 * 1000), 1, 0.001, 'a bigger picture is lit the same');

  /* the whole rig prepares into one flat list, tagged with its system */
  var all = Light.prepareRig(Light.createRig(), geom);
  ok(all.length === 8, 'the four systems come to eight lamps in total', String(all.length));
  ok(all.every(function (L, i) { return i === 0 || L.system >= all[i - 1].system; }),
     'each lamp knows which system it belongs to');
}

describe('the display curve');
{
  ok(Light.toneMap(0) === 0, 'no light stays black');
  ok(Light.toneMap(4) <= 1, 'nothing ever exceeds full');
  near(Light.toneMap(Light.WHITE), 1, 1e-9, 'the white point maps to exactly full');
  ok(Light.toneMap(1) < 1, 'and there is headroom below it');
  var prev = -1, rising = true;
  for (var v = 0; v <= 3; v += 0.05) {
    var t = Light.toneMap(v);
    if (t < prev - 1e-9) rising = false;
    prev = t;
  }
  ok(rising, 'more light never renders darker');
}

/* ------------------------------------------- the point of the whole thing */

/** Exactly what the renderer does to one pixel: surface colour x lamp colour. */
function under(surfaceHex, lampHex, level) {
  var a = Color.hexToLinear(surfaceHex), b = Color.hexToLinear(lampHex);
  var m = level == null ? 1 : level;
  return {
    r: Color.encodeByte(a[0] * b[0] * m),
    g: Color.encodeByte(a[1] * b[1] * m),
    b: Color.encodeByte(a[2] * b[2] * m)
  };
}

describe('what a coloured lamp does to a coloured entity');
{
  var RED = '#ff0000', WHITE = '#ffffff';
  var red = Entities.byId('red').hex;
  var green = Entities.byId('green').hex;
  var blue = Entities.byId('blue').hex;

  var redUnderRed = under(red, RED);
  ok(redUnderRed.g === 0 && redUnderRed.b === 0,
     'a red lamp leaves nothing at all in the green or blue channels');
  ok(redUnderRed.r > 190, 'a red entity gives back nearly all of a red lamp', String(redUnderRed.r));
  ok(under(green, RED).r < 70, 'a green entity has almost no red to give back',
     String(under(green, RED).r));
  ok(under(blue, RED).r < 70, 'nor does a blue one', String(under(blue, RED).r));
  ok(Color.relLuminance(redUnderRed) > 6 * Color.relLuminance(under(green, RED)),
     'so under a red lamp the red one is many times brighter than the green one');

  /* white light tells them apart; a single-colour lamp does not */
  var apartWhite = Color.deltaE76(under(red, WHITE), under(green, WHITE));
  var apartRed = Color.deltaE76(redUnderRed, under(green, RED));
  ok(apartRed < apartWhite, 'a red lamp flattens the difference between two entities',
     'white ' + apartWhite.toFixed(1) + ' vs red ' + apartRed.toFixed(1));

  /* a white surface reports the lamp's own colour back */
  ok(Color.rgbToHex(under('#ffffff', '#ef7a1c')) === '#ef7a1c',
     'a white entity renders as the lamp colour itself');
  ok(Color.rgbToHex(under('#000000', WHITE)) === '#000000', 'a black one gives back nothing');

  /* two lamps add; one lamp switched off contributes exactly zero */
  var lin = Color.hexToLinear('#ffffff');
  var both = Color.encodeByte(lin[0] * 0.5 + lin[0] * 0.5);
  var one = Color.encodeByte(lin[0] * 0.5);
  ok(both > one, 'two lamps on the same spot add up');
}

describe('the entities');
{
  ok(Entities.COLOURS.length >= 10, 'there is a range of colours to choose from',
     String(Entities.COLOURS.length));
  var ids = {};
  ok(Entities.COLOURS.every(function (c) {
    if (ids[c.id]) return false;
    ids[c.id] = 1;
    return /^#[0-9a-f]{6}$/.test(c.hex) && !!c.name;
  }), 'each has a unique id, a name and a valid colour');
  ok(Entities.byId('nope').id === Entities.COLOURS[0].id, 'an unknown id falls back to the first');
  ok(Entities.ASPECT > 0.4 && Entities.ASPECT < 0.9, 'the figure is taller than it is wide');
}

console.log('\n' + (fail === 0 ? 'all ' + pass + ' checks passed'
                               : fail + ' of ' + (pass + fail) + ' checks failed'));
process.exit(fail === 0 ? 0 : 1);
