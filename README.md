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
  light.js      the lamps: cone, falloff, display curve
  entities.js   the characters and how they are drawn
  stage.js      the picture: surface buffer x light buffer
  app.js        the controls
build.js        inlines everything into dist/page.html for publishing
tests/math.test.js
```

Plain scripts, no modules, so it works straight from `file://`.

## Tests

```bash
node tests/math.test.js
```

46 checks over the colour maths, the mixer/channel interlock in both
directions, lamp falloff, the display curve, and the reflectance behaviour
above. Drawing and interface need a browser and are not covered.

## Notes on two things that are deliberate

- **Falloff is softened near the lamp.** A plain `1/d²` runs away to infinity at
  the lamp itself, which on a picture this shallow blew the top of the wall out
  to solid white. It is capped at a bounded multiple of the floor level and
  still behaves like inverse-square out across the stage.
- **The air glow is held back on the characters.** Haze in front of a figure
  really does wash it out, but washing the colour off the characters is the one
  thing this is meant to show, so the glow lands full strength on the set and at
  about a fifth of that on them.
