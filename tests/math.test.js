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
  var xs = rig.map(function (l) { return l.x; });
  ok(xs.every(function (x, i) { return i === 0 || x > xs[i - 1]; }), 'spread left to right across the stage');
  ok(xs[0] > 0 && xs[xs.length - 1] < 1, 'and none of them hangs off the edge');
  ok(rig.every(function (l, i) { return l.label === 'Light ' + (i + 1); }), 'each one labelled');
}

describe('how far a lamp reaches');
{
  var geom = { w: 600, h: 400, floorY: 264 };
  var L = Light.prepare(Light.create(0, 1), geom);   /* one lamp, dead centre */
  var directlyUnder = Light.reach(L, L.lx, geom.floorY);
  ok(directlyUnder > 0, 'the lamp lights the floor below it');
  near(directlyUnder, 1, 0.02, 'at about 1.0, whatever size the picture is');

  ok(Light.reach(L, L.lx + 90, geom.floorY) < directlyUnder, 'dimmer off to the side');
  ok(Light.reach(L, L.lx + 600, geom.floorY) === 0, 'and nothing at all outside the beam');
  ok(Light.reach(L, L.lx, L.ly - 20) === 0, 'nothing above the lamp either');

  /* the same lamp normalises the same way in a bigger picture */
  var big = Light.prepare(Light.create(0, 1), { w: 1200, h: 800, floorY: 528 });
  near(Light.reach(big, big.lx, 528), directlyUnder, 0.02, 'a bigger picture is lit the same');

  /* Falloff. A plain 1/d^2 runs away to infinity at the lamp itself, which on
   * a picture this shallow blew the top of the wall out to solid white, so the
   * bottom of the fraction is softened. Two things have to hold: it still
   * behaves like inverse-square out across the stage, and it is bounded at the
   * lamp instead of running away. */
  var throwDist = geom.floorY - L.ly;
  var far1 = Light.reach(L, L.lx, L.ly + throwDist * 2);
  var far2 = Light.reach(L, L.lx, L.ly + throwDist * 4);
  near(far1 / far2, 4, 0.45, 'out across the stage, twice the throw is about a quarter of the light');

  var atLamp = Light.reach(L, L.lx, L.ly + 0.001);
  ok(atLamp < 3 * directlyUnder, 'and right at the lamp it is bounded, not infinite',
     (atLamp / directlyUnder).toFixed(2) + 'x the level on the floor');

  var falling = true, last = Infinity;
  for (var d = 0.05; d <= 4; d += 0.05) {
    var v = Light.reach(L, L.lx, L.ly + throwDist * d);
    if (v > last + 1e-9) falling = false;
    last = v;
  }
  ok(falling, 'and it only ever gets dimmer as you move away');

  /* brightness scales the colour that is carried, not the reach */
  var half = Light.prepare({ r: 255, g: 255, b: 255, brightness: 0.5, x: 0.5,
                             height: 0.16, spread: 0.52, softness: 0.62 }, geom);
  near(half.r, Light.prepare({ r: 255, g: 255, b: 255, brightness: 1, x: 0.5,
                               height: 0.16, spread: 0.52, softness: 0.62 }, geom).r / 2,
       1e-9, 'brightness halves the light the lamp carries');
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
