# Apex Circuit

A polished, genuinely playable 3D browser racing prototype built with
**Three.js** (rendering) and **Cannon-es** (arcade-leaning vehicle physics),
in plain JavaScript ES modules with **no build step**.

Libraries are loaded at runtime through a `<script type="importmap">` that
points at the jsDelivr CDN, so there is nothing to bundle and **no
`npm install` is required** to run the game. You just serve the folder and open
it in a browser that has internet access.

> Phase 1 status: this is the engine scaffold. It renders a lit, shadowed scene
> with a ground plane and a placeholder car that a chase camera follows. Later
> phases add the real vehicle physics, circuit, checkpoints, HUD wiring, and
> race state machine.

## Run it

Serve the project root with any static file server, then open the printed URL:

```bash
# Option A: the bundled zero-dependency Node server
node scripts/serve.mjs          # http://localhost:8080

# Option B: npm convenience script (same server, no install needed)
npm start

# Option C: Python
python3 -m http.server 8080
```

Then open <http://localhost:8080> in a modern browser. The Three.js and
Cannon-es modules download from jsDelivr on first load.

## Controls

| Action        | Keys                |
| ------------- | ------------------- |
| Throttle      | `W` / `Up`          |
| Brake/Reverse | `S` / `Down`        |
| Steer left    | `A` / `Left`        |
| Steer right   | `D` / `Right`       |
| Handbrake     | `Space`             |
| Reset         | `R`                 |
| Pause         | `P` / `Esc`         |

## Project layout

```
index.html            importmap + canvas mount + HUD DOM + overlays
styles.css            full-viewport canvas, HUD, countdown/loading overlays
src/
  config.js           all tunable constants (render, camera, physics, vehicle)
  main.js             engine bootstrap (scene, lights, placeholder car, loop)
  engine/
    loop.js           fixed-timestep loop (accumulator, framework-agnostic)
    input.js          keyboard input manager
    renderer.js       WebGLRenderer + Scene + PerspectiveCamera wrapper
    camera.js         ChaseCamera (uses pure math helpers)
  game/
    logic/            pure, unit-tested helpers (cameraMath, format)
scripts/
  check.mjs           syntax-checks every module + validates index.html
  serve.mjs           zero-dependency static file server
test/                 node --test logic + loop tests
```

## Develop / verify

No install needed. Node 18+ (tested on Node 22):

```bash
node scripts/check.mjs   # syntax-check every module + validate index.html
node --test test/        # run the pure-logic unit tests
```

## Why no build?

Keeping the same bare-specifier imports (`import * as THREE from 'three'`) means
the code would also work unchanged under a future bundler, while today it runs
directly in the browser with zero tooling. All tunable handling constants live
in `src/config.js` so the arcade feel is easy to adjust and later systems (AI,
sound, minimap) can subscribe to the game loop as new modules.
