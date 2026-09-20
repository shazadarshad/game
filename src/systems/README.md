# Systems (extension seam)

This folder is the home for pluggable game systems. It is intentionally empty
of implementations right now: the point is the CONTRACT below, which lets later
phases (opponent AI, audio, minimap, additional cars, upgrades) layer onto the
running game without editing the core bootstrap in `src/main.js`.

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

## How the planned Phase 2+ systems slot in

- OpponentAI: an `update(dt, ctx)` system that steers AI-controlled cars around
  `ctx.track.centerline` and writes their inputs to their vehicles. It needs a
  `ctx.cars` list; the single player `ctx.car` already models the interface.
- AudioSystem: an `update(dt, ctx)` system that maps `ctx.car.speedKmh` to
  engine pitch and `ctx.car.drifting` to a tire-screech loop. Purely reactive,
  no core changes.
- Minimap: a `render(alpha, ctx)` system that draws the resampled centerline and
  every car's ground position to a 2D canvas overlay.
- Multiple cars / upgrades: extend `ctx` with a `cars` array and per-car tuning
  read from `CONFIG`; the loop already fans out to every system each step.

Keeping the loop's fan-out deterministic and ordered (no priorities, no
dependency graph) means these systems compose predictably. See the header
comment in `src/engine/loop.js` for the same contract next to the code.
