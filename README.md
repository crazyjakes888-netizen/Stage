# Stage Lights

A stage lighting simulator that runs entirely in the browser. Build a rig, put
some characters on the stage, and see what the light does to their colours.

No server, no build step, no dependencies. Open `index.html`.

## What it actually does

Not a set of canned looks. Every picture comes out of one line of arithmetic,
done per pixel, per channel, in linear light:

```
seen  =  surface colour  x  light colour
```

A surface colour is a *reflectance* — how much red, green and blue that paint
gives back. A lamp colour is an *emission* — how much of each it puts out. So a
red lamp is `(1, 0, 0)`: it has no green and no blue to give, and a green
character has no red to give back. A green character under a red lamp goes
black on its own. Nothing anywhere says so — it falls out of the multiplication,
which is why adding another lamp or another colour never needs a new case.

On top of that: a cone per lamp with a soft edge, distance falloff, and a little
light left hanging in the air so a beam shows against the back wall.

## Using it

- **Characters** (top left) opens the picker. Tap one to put it on the stage.
- On the stage, **drag** a character to move it, **tap** it once to take it off.
- **Stage settings**, or the gear at the right of the stage, switches lighting
  systems on and off. Off means off the rig entirely — the beam leaves the
  stage and that system's bars leave the mixer.

## The four angles

The four lighting systems are not four lamps in a row — they are the four
angles a real rig is hung at, and each one does a completely different job:

| | |
|---|---|
| **Front of house** | Out over the audience. Flat and even: shows colour, hides shape. |
| **Overhead** | The bar straight above the stage. Pools on the deck, bright heads, faces in shadow. |
| **Side (wings)** | Booms in the wings firing straight across. Shows shape better than anything else. |
| **Back light** | Upstage and steep, aimed at the audience. Rims the edges and lifts a figure off the wall. |

Two things decide how much of a system lands on a given spot:

- **reach** — where its beams actually point: the pool on the deck, the shaft
  raking in from the wings.
- **facing** — whether that bit of surface is turned towards the lamp at all
  (`N · L`). This is the half that makes an angle an angle. The wall faces the
  audience, the deck faces up, and a figure is rounded, so its left side faces
  left and its right side faces right. A side light lands on the side of a
  figure and nowhere else; a back light catches nothing but the outline.

Switch off everything but one system to see what that angle alone is doing —
it is the quickest way to understand why a real rig needs all four.

## The mixer

Five bars per lighting system, stacked:

| | |
|---|---|
| **R / G / B** | each channel, 0–255 |
| **Mix** | the same colour as one hue, across the full spectrum |
| **Lvl** | brightness, for that lighting system only |

The mix bar and the three channel bars are the same colour seen two ways, so
they stay in step: drag the mix bar and all three channels swing with it; drag
any channel and the mix bar slides to whatever hue that mix landed on.

## Layout

```
index.html
css/stage.css
js/
  color.js      hex/rgb/hsv, sRGB <-> linear, contrast
  light.js      the four angles: beams, falloff, facing, display curve
  entities.js   the characters and how they are drawn
  stage.js      the picture: surface x normals x light
  app.js        the controls
build.js        inlines everything into dist/page.html for publishing
tests/math.test.js
```

Plain scripts, no modules, so it works straight from `file://`.

## Tests

```bash
node tests/math.test.js
```

57 checks over the colour maths, the mixer/channel interlock in both
directions, beam falloff, the display curve, the reflectance behaviour above,
and that the four angles genuinely behave differently — front of house puts
more on a face than any other angle, overhead puts many times more on the deck
than on a vertical face, side light puts far more on the side of a figure than
its front, and back light puts nothing whatever on a face. Drawing and
interface need a browser and are not covered.

## Notes on two things that are deliberate

- **Falloff is softened near the lamp.** A plain `1/d²` runs away to infinity at
  the lamp itself, which on a picture this shallow blew the top of the wall out
  to solid white. It is capped at a bounded multiple of the floor level and
  still behaves like inverse-square out across the stage.
- **The air glow is held back on the characters.** Haze in front of a figure
  really does wash it out, but washing the colour off the characters is the one
  thing this is meant to show, so the glow lands full strength on the set and at
  about a fifth of that on them. It is also kept small per system: glow ignores
  which way a surface faces, so four systems otherwise stack it straight onto
  the back wall and fog the whole picture pale grey.
- **Figures are rounded harder than a half-circle.** It pushes their outer
  edges closer to side-on, which is what gives a back light an edge to catch
  and a side light something to model.
