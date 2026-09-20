/**
 * handling.test.js
 *
 * Offline unit tests for the pure vehicle handling helpers (no Three/Cannon
 * needed). Run with:
 *   node --test test/
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { steerTowards, kmhFromMs } from "../src/game/logic/handling.js";

test("steerTowards clamps a large step to maxDelta", () => {
  assert.equal(steerTowards(0, 1, 0.1), 0.1);
  assert.equal(steerTowards(0, -1, 0.1), -0.1);
});

test("steerTowards snaps to target when within maxDelta", () => {
  assert.equal(steerTowards(0, 0.05, 0.1), 0.05);
  assert.equal(steerTowards(0.5, 0.5, 0.1), 0.5);
});

test("steerTowards converges to the target over repeated steps", () => {
  let v = 0;
  for (let i = 0; i < 100; i++) v = steerTowards(v, 0.55, 0.05);
  assert.ok(Math.abs(v - 0.55) < 1e-9, `expected ~0.55, got ${v}`);
});

test("steerTowards returns current for non-positive maxDelta", () => {
  assert.equal(steerTowards(0.3, 1, 0), 0.3);
  assert.equal(steerTowards(0.3, 1, -0.5), 0.3);
});

test("kmhFromMs(10) is approximately 36", () => {
  assert.ok(Math.abs(kmhFromMs(10) - 36) < 1e-9, `got ${kmhFromMs(10)}`);
});

test("kmhFromMs handles zero and non-finite input", () => {
  assert.equal(kmhFromMs(0), 0);
  assert.equal(kmhFromMs(NaN), 0);
  assert.equal(kmhFromMs(Infinity), 0);
});
