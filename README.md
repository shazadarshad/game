# Apex Circuit

A polished, genuinely playable 3D browser racing prototype built with
**Three.js** (rendering) and **Cannon-es** (arcade-leaning raycast-vehicle
physics), in plain JavaScript ES modules with **no build step**.

Drive a chase-cam car around a hand-designed closed circuit: long straights, a
wide sweeper, a hairpin and a couple of esses, lined with solid barriers. A
three-two-one-GO countdown starts a timed three-lap race with ordered
checkpoints (no corner-cutting), live lap timing, a best-lap tracker and a
finish panel. Slide the car and it lays down pooled tire skid marks, kicks up a
smoke puff and leans into the drift. Spin out and one key drops you back on the
track at your last checkpoint.

## Run it (no install, no build)

There is nothing to compile and **no `npm install` is required**. Serve the
project folder with any static file server and open the printed URL. Pick one:

```bash
# Option A: Python (built in on most machines)
python3 -m http.server 8080

# Option B: npx serve (downloads a tiny static server on first use)
npx serve

# Option C: the bundled zero-dependency Node server
npm start          # runs: node scripts/serve.mjs
# or directly:
node scripts/serve.mjs
```

Then open <http://localhost:8080> in a modern desktop browser.

Note: if you use `npx serve` it may print a different port (often 3000); open
whatever URL it prints. Options A and C use port 8080.

### How the libraries load (importmap / CDN)

The game does not bundle Three.js or Cannon-es. `index.html` contains a
`<script type="importmap">` that maps the bare specifiers `three`,
`three/addons/` and `cannon-es` to modules on the jsDelivr CDN. The browser
resolves those imports itself at page load. The upside is zero tooling; the one
requirement is that **the browser needs an internet connection the first time
it loads the page** so it can fetch Three.js and Cannon-es from jsDelivr (they
are then cached by the browser). The static file server above only serves the
local project files; it does not need to reach the internet itself.

Because the same code uses bare-specifier imports
(`import * as THREE from "three"`), it would also work unchanged under a future
bundler if you ever decide to add one.

### Sandbox / offline note

This project was assembled in a restricted sandbox with no outbound network
access and no browser, so the full 3D scene could not be rendered or verified
headless there. Verification in that environment was limited to Node syntax
checks of every module, the pure-logic unit tests, and an HTTP 200 check from
the static server. On a normal machine with internet, the same static server
serves the files and the browser fetches the CDN libraries to run the game. The
sky, skid marks and smoke puff are all generated procedurally at runtime (canvas
gradients and radial sprites), so **no image or model asset is downloaded** for
the visuals; only the two libraries come from the CDN.

## Controls

| Action          | Keys                |
| --------------- | ------------------- |
| Throttle        | `W` / `Up`          |
| Brake / Reverse | `S` / `Down`        |
| Steer left      | `A` / `Left`        |
| Steer right     | `D` / `Right`       |
| Handbrake / drift | `Space`           |
| Reset / restart | `R`                 |
| Pause           | `P` / `Esc`         |

`R` behaves in two ways: during a race it returns the car to the last checkpoint
you passed (facing the right way, with velocity zeroed) so a spin-out is
recoverable; on the finish screen it restarts the whole race from the countdown.
Controls are locked during the countdown.

## Tuning

Every tunable constant lives in a single frozen object in **`src/config.js`**,
so the feel is easy to adjust without hunting through the code:

- `render` and `environment`: shadows, field of view, fog, tone-mapping
  exposure, sky colours, sun position and the shadow-camera framing.
- `camera`: chase-camera distance, height, follow stiffness and speed zoom.
- `physics`: gravity and the fixed simulation timestep.
- `vehicle`: mass, engine and brake force, steering, suspension and wheels.
- `handling`: the arcade knobs, including drift grip multipliers,
  `driftEngageSpeed`, the skid-slip thresholds, body-lean amount, and the skid
  mark pool size / spacing / lifetime.
- `race`: laps, countdown length.
- `track`: road width, barriers, checkpoint count and the circuit centerline.

Change a value, reload the page, and the new feel is live. No rebuild.

## Architecture / directory overview

Clear separation between the browser-only engine/game code (imports Three and
Cannon) and pure logic helpers under `game/logic/` that are unit tested offline.

```
index.html            importmap + canvas mount + HUD DOM + countdown/finish overlays
styles.css            full-viewport canvas, HUD, overlays
src/
  config.js           all tunable constants (single source of truth)
  main.js             bootstrap: wires engine + game together and the loop
  engine/
    loop.js           fixed-timestep loop + the systems-registry extension seam
    input.js          keyboard input manager (edge-detected reset)
    renderer.js       WebGLRenderer + Scene + camera (ACESFilmic, sRGB, shadows)
    camera.js         ChaseCamera (uses pure cameraMath helpers)
  physics/
    world.js          Cannon-es world + materials
    vehicle.js        RaycastVehicle wrapper (throttle/brake/steer/grip)
  game/
    environment.js    procedural sky dome, framed-shadow sun, fill lights, fog
    car.js            player car visuals + physics + drift feedback
    skidmarks.js      pooled tire-skid decals + smoke puff
    track.js          circuit mesh, barriers (mesh + bodies), checkpoint gates
    checkpoints.js    ties gate crossings to the lap state machine
    raceState.js      race director state machine (countdown -> racing -> finish)
    hud.js            DOM HUD updates each frame
    logic/            pure, unit-tested helpers:
      cameraMath.js   chase-camera math
      format.js       lap-time formatting
      handling.js     steering easing, unit conversion
      lap.js          checkpoint / lap state machine + gate-crossing geometry
      drift.js        lateral-slip detection + drift intensity
  systems/
    README.md         the extension contract for future systems (see Roadmap)
scripts/
  check.mjs           syntax-checks every module + validates index.html
  serve.mjs           zero-dependency static file server
test/                 node --test pure-logic tests (lap, handling, drift, loop, systems, respawn)
```

## Develop / verify

No install needed. Node 18+ (developed on Node 22):

```bash
node scripts/check.mjs                 # syntax-check every module + validate index.html
node --test "test/**/*.test.js"        # run the pure-logic unit tests
```

## Roadmap / Phase 2+

The game loop exposes a small **systems registry** (an ordered list of
`{ update(dt, ctx), render(alpha, ctx) }` objects sharing one context) so later
phases can layer on without refactoring the bootstrap. Register a system with
`loop.addSystem(system)`; the full contract is documented in
[`src/systems/README.md`](src/systems/README.md) and in the header of
`src/engine/loop.js`. Planned additions:

- **Opponent AI**: an update system that steers AI cars along the track
  centerline and writes their inputs to their vehicles. The single-player car
  already models the interface; a `cars` array is added to the shared context.
- **Sound**: an update system mapping speed to engine pitch and the car's drift
  state to a tire-screech loop. Purely reactive, reads the context, no core
  changes.
- **Minimap**: a render system drawing the centerline and every car position to
  a 2D canvas overlay.
- **Multiple cars**: extend the shared context with a `cars` list; the loop
  already fans out to every system each step.
- **Upgrades**: per-car tuning read from `src/config.js`, feeding the same
  vehicle and handling constants.

Because the loop's fan-out is deterministic and ordered, these systems compose
predictably on top of the existing physics and lap logic.
