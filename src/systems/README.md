# Systems (extension seam)

This folder documents the pluggable-system CONTRACT that lets phases beyond
the core bootstrap (opponent AI, audio, minimap, additional cars, upgrades)
layer onto the running game without editing `src/main.js`. The first real
system, `AudioSystem` (synthesized engine/tire-screech sound), now lives in
`src/game/audioSystem.js` and is registered exactly the way this contract
describes; the rest (opponent AI, minimap, multiple cars) remain planned.

## The contract

The fixed-step loop in `src/engine/loop.js` keeps an ordered list of systems. A
system is any plain object (or class instance) shaped like this. Both methods
are optional, so a render-only or update-only system is fine:

```js
class ExampleSystem {
  // Runs every fixed physics step, in registration order, AFTER the core
  // world update, so it observes the freshly stepped state. `dt` is the fixed
  // timestep in seconds.
  update(dt, ctx) {}

  // Runs once per rendered frame, AFTER the core render. `alpha` is the
  // interpolation factor in [0, 1] between the last two fixed steps.
  render(alpha, ctx) {}
}
```

Register and remove systems through the loop:

```js
const system = loop.addSystem(new ExampleSystem());
loop.removeSystem(system);
```

## The shared context (`ctx`)

Every `update` / `render` call receives the same shared `ctx` object that
`main.js` builds once and passes to the loop via `options.context`. Today it
carries:

```js
{ engine, scene, camera, car, track, race, input }
```

Systems read what they need from `ctx` rather than capturing globals, so the
wiring stays declarative and testable. Adding a field (for example a `cars`
array once there is more than one car) is a one-line change in `main.js`.

## How systems slot in

- **AudioSystem (implemented)**: an `update(dt, ctx)` system
  (`src/game/audioSystem.js`) that maps `ctx.car.speedKmh`/`ctx.car.throttle`
  to a synthesized engine tone (Web Audio oscillator + filter) and
  `ctx.car.driftIntensity` to a tire-screech noise loop's gain. Purely
  reactive, no core changes; registered in `main.js` via
  `loop.addSystem(new AudioSystem())`. Its `start()` method must be called
  from a user-gesture handler (browser autoplay policy); `main.js` does this
  on the first click/keypress/touch.
- OpponentAI (planned): an `update(dt, ctx)` system that steers AI-controlled
  cars around `ctx.track.centerline` and writes their inputs to their
  vehicles. It needs a `ctx.cars` list; the single player `ctx.car` already
  models the interface.
- Minimap (planned): a `render(alpha, ctx)` system that draws the resampled
  centerline and every car's ground position to a 2D canvas overlay.
- Multiple cars / upgrades (planned): extend `ctx` with a `cars` array and
  per-car tuning read from `CONFIG`; the loop already fans out to every
  system each step.

Keeping the loop's fan-out deterministic and ordered (no priorities, no
dependency graph) means these systems compose predictably. See the header
comment in `src/engine/loop.js` for the same contract next to the code.
