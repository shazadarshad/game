# Apex Circuit

A polished, genuinely playable 3D browser racing prototype built with
**Three.js** (rendering) and **Cannon-es** (arcade-leaning raycast-vehicle
physics), in plain JavaScript ES modules with **no build step**.

Drive a chase-cam car around a hand-designed closed circuit at sunset: long
straights, a wide sweeper, a hairpin and a couple of esses, lined with solid
barriers, roadside trees and grandstands. A three-two-one-GO countdown starts
a timed three-lap race with ordered checkpoints (no corner-cutting), live lap
timing on a dial speedometer HUD, a best-lap tracker and a finish panel with a
per-lap time list. Slide the car and it lays down pooled tire skid marks,
kicks up a smoke puff, leans into the drift, screeches its tires and flashes a
"DRIFT!" callout. Clip a wall hard enough and the camera shakes and throws off
a shower of sparks. Push past ~90 km/h and speed lines creep in from the edges
of the screen. Spin out and one key drops you back on the track at your last
checkpoint.

## What's new: visual/audio overhaul

Everything below is procedurally generated at runtime (canvas textures,
extruded/primitive geometry, synthesized audio): **no external model,
image, or audio asset is downloaded**. Only the two libraries (Three.js,
Cannon-es) come from the CDN, exactly as before.

- **Car model**: the placeholder box body is replaced by an extruded
  side-profile silhouette (hood, windshield rake, roof, rear-window rake, rear
  deck) with angled glass panes, side mirrors, headlight/taillight clusters
  (separate housing + emissive lens), and wheels rebuilt as tire + metal rim +
  spokes + hub cap assemblies.
- **Track surface**: a tileable procedural asphalt texture (canvas-painted
  speckle grain + faint wear streaks) replaces the flat road colour, plus a
  dashed centerline and alternating red/white curb blocks along both edges.
- **Roadside scenery**: procedurally placed trees and grandstands line the
  circuit (deterministic placement, see `src/game/logic/scenery.js`), offset
  outside the barrier line so collision geometry is unaffected.
- **Lighting/atmosphere**: a low, warm sunset sun replaces the flatter midday
  lighting, with a cool rim/fill light on the shadow side, a procedural
  reflection environment map (PMREM from an inline "room" scene, no HDRI
  download) for glossy car-body/glass reflections, and an optional bloom
  postprocessing pass (`three/addons/postprocessing/*`, loaded from the same
  CDN prefix as everything else, with a graceful fallback to plain rendering
  if it fails to load).
- **Effects**: speed-line screen vignette at high speed, collision sparks +
  camera screen-shake on hard wall hits, and a "DRIFT!" HUD callout, layered
  on top of the existing pooled skid marks / tire smoke. A separate dust puff
  (`CONFIG.fx.dust`, `src/game/logic/dust.js`) kicks up on a hard launch/
  wheelspin (high throttle from near-standstill), independent of the drift
  smoke trigger.
- **HUD**: a dial-style SVG speedometer (needle + redline arc) with a D/R gear
  indicator, replacing the plain number; a re-triggering countdown pop
  animation; a finish-panel per-lap time list.
- **Audio**: synthesized engine tone (pitch/volume mapped to speed/throttle)
  and tire-screech noise (mapped to drift intensity), both generated with the
  Web Audio API, no audio files. Sound starts on the first click/keypress
  (browsers block audio before a user gesture); see **Controls** below.

All of the above is tunable from the same single frozen `CONFIG` object in
`src/config.js` (new `scenery`, `fx`, `hud`, and `audio` sections, plus
additions to `render`/`environment`/`camera`), and every new piece of
deterministic math (dial-needle angle, screen-shake decay, audio
frequency/gain mapping, scenery placement, speed-line opacity) lives in a
pure, unit-tested module under `src/game/logic/`, matching the project's
existing pure/impure split.

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

This project (including the visual/audio overhaul described above) was
assembled in a restricted sandbox with no outbound network access and no
browser, so the full 3D scene, lighting, postprocessing, and audio could not
be rendered, heard, or verified headless there. Verification in that
environment was limited to Node syntax checks of every module
(`node scripts/check.mjs`) and the pure-logic unit tests
(`node --test`); the impure rendering/physics/audio code paths (car model,
track texture, lighting, bloom, screen-shake, HUD dial, synthesized audio) are
architecturally sound and syntax-checked but **not visually or aurally
verified in-sandbox**. On a normal machine with internet, the same static
server serves the files and the browser fetches the CDN libraries (Three.js,
Cannon-es, plus the `three/addons/` postprocessing modules used by the bloom
pass) to run the game. **A manual browser smoke test is recommended** before
considering this overhaul fully verified: confirm the car/track/scenery render
as expected, the sunset lighting and bloom look reasonable, the dial
speedometer and drift callout track the car correctly, a wall hit shakes the
camera and shows sparks, and engine/tire-screech sound plays after the first
click or keypress. Every visual is generated procedurally at runtime (canvas
textures, extruded/primitive geometry) and all audio is synthesized with the
Web Audio API, so **no image, model, or audio asset is downloaded**; only the
Three.js/Cannon-es libraries (and its bundled postprocessing addons) come from
the CDN.

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

**Sound**: browsers block audio playback until the page has received a user
gesture. The first click, tap, or keypress anywhere on the page starts the
synthesized engine/tire audio; no extra action is needed beyond normal play
(pressing a driving key to start moving will also start the sound).

## Tuning

Every tunable constant lives in a single frozen object in **`src/config.js`**,
so the feel is easy to adjust without hunting through the code:

- `render` and `environment`: shadows, field of view, fog, tone-mapping
  exposure, sky colours, sun position, the shadow-camera framing, the rim
  light, the reflection env-map toggle/intensity, and the bloom postprocessing
  strength/radius/threshold.
- `camera`: chase-camera distance, height, follow stiffness, speed zoom, and
  the screen-shake impulse thresholds/decay/max magnitude.
- `physics`: gravity and the fixed simulation timestep.
- `vehicle`: mass, engine and brake force, steering, suspension and wheels.
- `handling`: the arcade knobs, including drift grip multipliers,
  `driftEngageSpeed`, the skid-slip thresholds, body-lean amount, and the skid
  mark pool size / spacing / lifetime.
- `scenery`: roadside tree/grandstand placement (spacing, offsets, sizes,
  colours) and the clearance kept beyond the barrier line.
- `fx`: speed-line start/max speed and opacity, the collision-spark pool
  size / burst size / lifetime / minimum impact speed, and the launch/
  wheelspin dust puff's throttle/speed trigger (`fx.dust`).
- `hud`: the dial speedometer's max speed, sweep angles and redline fraction.
- `audio`: master volume, engine idle/max pitch and volume, and tire-screech
  volume/attack/release.
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
    renderer.js       WebGLRenderer + Scene + camera (ACESFilmic, sRGB, shadows,
                      optional EffectComposer/UnrealBloomPass/OutputPass chain)
    camera.js         ChaseCamera (pure cameraMath + shake helpers)
  physics/
    world.js          Cannon-es world + materials
    vehicle.js        RaycastVehicle wrapper (throttle/brake/steer/grip, collide events)
  game/
    environment.js    procedural sky dome, sun + rim light, fill lights, fog,
                      procedural PMREM reflection env map
    car.js            player car visuals (sculpted body/wheels/lights/mirrors)
                      + physics + drift feedback + collision impact/sparks
    skidmarks.js      pooled tire-skid decals + smoke puff
    sparks.js         pooled collision-spark burst particles
    audioSystem.js    synthesized engine + tire-screech audio (systems-registry system)
    track.js          circuit mesh (asphalt texture, centerline, curbs),
                      barriers (mesh + bodies), checkpoint gates, roadside scenery
    checkpoints.js    ties gate crossings to the lap state machine
    raceState.js      race director state machine (countdown -> racing -> finish)
    hud.js            DOM HUD updates each frame (dial speedometer, drift
                      callout, speed lines, finish lap list)
    logic/            pure, unit-tested helpers:
      cameraMath.js   chase-camera math
      format.js       lap-time formatting
      handling.js     steering easing, unit conversion
      lap.js          checkpoint / lap state machine + gate-crossing geometry
      drift.js        lateral-slip detection + drift intensity
      dial.js         speedometer needle angle + SVG arc geometry
      shake.js        collision impact -> screen-shake trauma/offset
      audioMath.js    speed/throttle/drift -> oscillator frequency/gain
      dust.js         throttle/speed -> launch/wheelspin dust intensity
      scenery.js      deterministic tree/grandstand placement along the track
      speedfx.js      speed -> speed-line overlay opacity
  systems/
    README.md         the extension contract for systems (AudioSystem is now live)
scripts/
  check.mjs           syntax-checks every module + validates index.html
  serve.mjs           zero-dependency static file server
test/                 node --test pure-logic tests (lap, handling, drift, loop,
                      systems, respawn, dial, shake, audioMath, dust, scenery,
                      speedfx)
```

## Develop / verify

No install needed. Node 18+ (developed on Node 22):

```bash
node scripts/check.mjs                 # syntax-check every module + validate index.html
node --test "test/**/*.test.js"        # run the pure-logic unit tests
```

## Roadmap / Phase 3+

The game loop exposes a small **systems registry** (an ordered list of
`{ update(dt, ctx), render(alpha, ctx) }` objects sharing one context) so later
phases can layer on without refactoring the bootstrap. Register a system with
`loop.addSystem(system)`; the full contract is documented in
[`src/systems/README.md`](src/systems/README.md) and in the header of
`src/engine/loop.js`. **Sound** is now implemented this way
(`src/game/audioSystem.js`, registered in `main.js`); remaining planned
additions:

- **Opponent AI**: an update system that steers AI cars along the track
  centerline and writes their inputs to their vehicles. The single-player car
  already models the interface; a `cars` array is added to the shared context.
- **Minimap**: a render system drawing the centerline and every car position to
  a 2D canvas overlay.
- **Multiple cars**: extend the shared context with a `cars` list; the loop
  already fans out to every system each step. `Car.setBodyColor()` /
  `setGlassColor()` already exist for giving each car a distinct livery
  without rebuilding its geometry.
- **Upgrades**: per-car tuning read from `src/config.js`, feeding the same
  vehicle and handling constants.

Because the loop's fan-out is deterministic and ordered, these systems compose
predictably on top of the existing physics and lap logic.
