/**
 * loop.test.js
 *
 * Unit tests for the fixed-timestep loop. The loop is framework-agnostic and
 * accepts an injectable time source, so we can drive it deterministically.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GameLoop } from "../src/engine/loop.js";

test("advance runs a fixed number of update steps for elapsed time", () => {
  let updates = 0;
  let renders = 0;
  const loop = new GameLoop({
    step: 1 / 60,
    onUpdate: () => updates++,
    onRender: () => renders++,
    now: () => 0,
    raf: () => 0,
    cancel: () => {},
  });
  loop._lastTime = 0;
  // 50 ms of time at 60 Hz should produce 3 updates (3 * 16.67 = 50).
  loop.advance(50);
  assert.equal(updates, 3);
  assert.equal(renders, 1);
});

test("advance clamps large frame gaps to avoid a burst of updates", () => {
  let updates = 0;
  const loop = new GameLoop({
    step: 1 / 60,
    maxSubSteps: 4,
    onUpdate: () => updates++,
    onRender: () => {},
    now: () => 0,
    raf: () => 0,
    cancel: () => {},
  });
  loop._lastTime = 0;
  loop.advance(100000); // a huge stall
  assert.ok(updates <= 4, `expected <= 4 updates, got ${updates}`);
});

test("elapsed accumulates by fixed step", () => {
  let updates = 0;
  const step = 0.01;
  const loop = new GameLoop({
    step,
    maxSubSteps: 10,
    onUpdate: () => updates++,
    onRender: () => {},
    now: () => 0,
    raf: () => 0,
    cancel: () => {},
  });
  loop._lastTime = 0;
  loop.advance(50); // ~0.05 s -> 4-5 steps of 0.01 depending on float rounding
  assert.ok(updates === 4 || updates === 5, `updates=${updates}`);
  // elapsed is always exactly updates * step.
  assert.ok(
    Math.abs(loop.elapsed - updates * step) < 1e-9,
    `elapsed=${loop.elapsed}`,
  );
});
