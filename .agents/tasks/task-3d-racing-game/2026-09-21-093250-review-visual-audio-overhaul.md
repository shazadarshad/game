> **Post-review update (commits `bbe47f2`, `175d3ee`, `3984d27`, `50c78b3`):**
> all 5 issues below were addressed. (1) the dead ternary in `audioSystem.js`
> is replaced by a proper `engineBrightness()` helper (with tests). (3) engine
> volume now reads a new `Car.engineLoad` signal (forward throttle OR
> brake-at-standstill reverse) instead of forward-only throttle. (2)
> `CONFIG.fx.dust` is now implemented: `src/game/logic/dust.js`
> (`wheelspinIntensity`, unit tested) drives a tinted dust-puff sprite on
> `Car` for hard launches. (4) `RenderEngine.detachResize()` and
> `AudioSystem.dispose()` are now called from a `beforeunload` listener in
> `main.js`. (5) the previously write-only `_bodyMat`/`_glassMat` fields are
> now used by new `Car.setBodyColor()`/`setGlassColor()` livery hooks. Full
> verification after these fixes: `node scripts/check.mjs` (30 modules, OK)
> and `node --test` (99/99 pass, up from 87).

# Sunset visual/audio overhaul for Apex Circuit

This change re-skins the existing racing prototype without touching its gameplay core: a sculpted procedural car model, a textured asphalt track with lane markings and curbs, roadside trees/grandstands, sunset lighting with an optional bloom pass and a procedural PMREM reflection map, collision sparks with camera screen-shake, a redesigned dial-speedometer HUD, and a synthesized Web Audio engine/tire-screech system. All five new math concerns (dial angle, shake decay, audio frequency/gain mapping, scenery placement, speed-line opacity) landed as pure functions under `src/game/logic/` with matching unit tests, following the project's existing pure/impure convention. Every asset is generated at runtime — canvas textures, extruded geometry, synthesized audio — so the no-build/importmap architecture holds.

Watch for: a dead ternary in the engine audio filter's brightness calculation makes it always evaluate to the same branch (**confirmed**), and a new `CONFIG.fx.dust` block was added but never wired into any code (**confirmed**).

**Verdict**: NEEDS_CHANGES

## High-level view

The car, track, environment, and HUD modules were extended in place rather than restructured — same `_build*` method pattern, same CONFIG-driven tunables. `Sparks` (collision particles) is a near-exact structural copy of the existing `SkidMarks` pool, and collision impact flows through the same poll-once-per-step pattern already used for drift feedback: `Vehicle.consumeImpact()` captures the strongest per-step contact, `Car.update()` forwards it to both the spark burst and the chase camera's `addImpact()`.

Lighting and postprocessing (rim light, PMREM env map, bloom composer) are all best-effort: each wraps its setup in error handling and falls back to the pre-existing direct-render path if the addon import or WebGL context isn't available, so a CDN hiccup degrades gracefully instead of blocking boot.

The new `AudioSystem` follows the systems-registry contract and correctly gates `AudioContext` creation behind a user gesture per browser autoplay policy. Its per-step update has a dead ternary in the filter-brightness calculation that always resolves the same way regardless of config, and the engine-volume mapping only reads forward throttle, so reversing at speed sounds like idling rather than under load.

Scenery placement is deterministic (seeded PRNG) and offset outside the barrier line. `raceState.js`, `checkpoints.js`, `lap.js`, `drift.js`, `handling.js`, and the barrier/checkpoint builders in `track.js` are untouched by this diff, so lap/checkpoint/race-director behavior carries over unchanged.

The new pure modules (dial, shake, audioMath, scenery, speedfx) have unit tests covering boundary conditions, clamping, determinism-with-seed, and non-finite input. The new impure modules (car model, track texture, `AudioSystem`, `Sparks`, postprocessing) have no tests, consistent with the project's existing convention of only unit-testing the pure layer.

<details>
<summary>Issues (5)</summary>

1. **Dead ternary in engine filter brightness** — `car.speedKmh / (engineCfg.maxHz ? 200 : 200)` in `audioSystem.js` always divides by 200 regardless of `engineCfg.maxHz`; the ternary is a no-op. Replace with the intended expression (likely `engineCfg.maxHz` itself, or just drop the ternary and hardcode 200).
2. **Unused `CONFIG.fx.dust` config** — a fully-documented `dust` block was added to config describing off-road/acceleration dust puffs, but nothing in `src/` reads `CONFIG.fx.dust`. Either wire it up or remove the dead config to avoid misleading future readers.
3. **AudioSystem volume ignores reverse/brake** — `engineVolume` is driven only by `car.throttle`, so accelerating in reverse (brake input, non-zero speed) keeps the engine at idle volume even though pitch (driven by unsigned speed) ramps up. Consider feeding an "under load" signal that accounts for reverse throttle too.
4. **`AudioSystem.dispose()` and `RenderEngine.detachResize()` are never called** — both exist for cleanup but `main.js` has no teardown path that invokes them. Not a leak under the current single-boot-per-page-load lifecycle, but if a teardown/restart path is ever added, these need to be wired in.
5. **Dead material fields on `Car`** — `this._bodyMat` and `this._glassMat` are assigned in `_buildModel()` but never read anywhere. Remove them or use them (e.g. for a livery-swap feature) to avoid dead state.

</details>

<details>
<summary>Details</summary>

### Audio engine brightness ternary is a no-op

In `audioSystem.js`'s `update()`:

```js
const brightness = 700 + Math.min(1, car.speedKmh / (engineCfg.maxHz ? 200 : 200)) * 2200;
```

Both branches of `engineCfg.maxHz ? 200 : 200` are `200`, so the ternary and the `maxHz` check it appears to reference do nothing. The filter brightness still works today (it always divides by 200), but the code reads as if it should scale with the configured `maxHz` and does not — a maintainer changing `maxHz` in config would reasonably expect brightness scaling to follow, and it will not. **Confirmed** by reading the line; the fix is either to use `engineCfg.maxHz ?? 200` in the denominator or to drop the dead ternary.

### `CONFIG.fx.dust` is configured but not implemented

```js
// Dust puffs kicked up off-road / on hard acceleration, reusing the same
// pooled-sprite approach as the existing tire-smoke puff.
dust: Object.freeze({
  enabled: true,
  color: 0xcabf9a,
}),
```

A `grep` across `src/` and `test/` for `dust` turns up only this config block — no builder, no update call, no reference anywhere else. **Confirmed**. This isn't harmful on its own, but it's a feature described in config comments and the summary text implies (via the "Effects" README section, which doesn't actually mention dust) that it should exist. Either implement the dust puff or drop the config block; leaving it in invites a future contributor to assume it's live.

### Reverse throttle and engine audio

`Car.update()` sets `this._throttle` straight from `input.throttle` (0 or 1, forward only — see `input.js`). `AudioSystem.update()` maps that throttle to engine gain via `engineVolume(car.throttle, engineCfg)`, while engine pitch uses unsigned `car.speedKmh`. The result: driving in reverse at full brake/reverse-force ramps the pitch up correctly (speed is unsigned) but the volume stays pinned at `volumeIdle` because `input.throttle` is 0 while reversing. It's a small perceptual mismatch — pitch says "under load," volume says "idling." **Likely** (traced through the code, not audibly verified since the sandbox has no audio device). A minimal fix would be blending in `input.brake` when the car's signed speed is negative.

</details>

## File map

<details>
<summary>Files changed (25) — full diff: `git diff fadf9c8 HEAD`</summary>

- `README.md` — documents the overhaul, updated file map, roadmap, sandbox-verification caveats.
- `index.html` — adds the speed-line overlay div and finish-panel lap-list container; importmap unchanged.
- `src/config.js` — new `scenery`, `fx`, `hud`, `audio` sections; sunset-tinted `render`/`environment`; `camera` shake tunables.
- `src/engine/camera.js` — `addImpact()` / trauma decay / shake offset applied on top of the smoothed chase position.
- `src/engine/renderer.js` — optional `EffectComposer` + `UnrealBloomPass` + `OutputPass` chain, best-effort dynamic import.
- `src/game/audioSystem.js` — new: synthesized engine tone + tire-screech noise via Web Audio, systems-registry shaped.
- `src/game/car.js` — sculpted body/glass/wheel/mirror/light geometry; collision-impact polling; spark burst wiring; new `driftIntensity`/`throttle`/`lastImpact`/`reversing` getters.
- `src/game/environment.js` — rim light, procedural PMREM reflection environment map.
- `src/game/hud.js` — dial speedometer, gear indicator, drift callout, speed-line overlay, finish per-lap list.
- `src/game/logic/audioMath.js` — new pure module: engine frequency/volume, ease, screech target volume.
- `src/game/logic/dial.js` — new pure module: needle angle, redline geometry, SVG arc helpers.
- `src/game/logic/scenery.js` — new pure module: seeded deterministic tree/grandstand placement.
- `src/game/logic/shake.js` — new pure module: impact-to-trauma mapping, decay, offset.
- `src/game/logic/speedfx.js` — new pure module: speed-to-opacity mapping for speed lines.
- `src/game/sparks.js` — new: pooled collision-spark particle burst (mirrors `skidmarks.js`'s pooling pattern).
- `src/game/track.js` — procedural asphalt texture + UVs, dashed centerline, curb blocks, scenery placement calls; barrier/checkpoint code untouched.
- `src/main.js` — wires `AudioSystem` into the systems registry and starts it on first user gesture; forwards collision impact to the camera.
- `src/physics/vehicle.js` — records strongest per-step collision impulse + world position via `consumeImpact()`.
- `src/systems/README.md` — documents `AudioSystem` as the first implemented system.
- `styles.css` — dial speedometer, gear indicator, drift callout, speed-line vignette, finish lap-list styling.
- `test/audioMath.test.js`, `test/dial.test.js`, `test/scenery.test.js`, `test/shake.test.js`, `test/speedfx.test.js` — new unit tests for the five new pure modules.

</details>
