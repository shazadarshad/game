/**
 * logic.test.js
 *
 * Offline unit tests for the pure helpers (no Three/Cannon needed). Run with:
 *   node --test test/
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  expDamp,
  dampVec3,
  wrapAngle,
  dampAngle,
} from "../src/game/logic/cameraMath.js";
import { formatLapTime, toKmh } from "../src/game/logic/format.js";

test("expDamp moves toward the target", () => {
  const next = expDamp(0, 10, 5, 1 / 60);
  assert.ok(next > 0, "should move off the start value");
  assert.ok(next < 10, "should not overshoot in one step");
});

test("expDamp converges toward target over many steps", () => {
  let v = 0;
  for (let i = 0; i < 600; i++) v = expDamp(v, 100, 8, 1 / 60);
  assert.ok(Math.abs(v - 100) < 0.5, `expected ~100, got ${v}`);
});

test("expDamp returns current when dt or lambda is non-positive", () => {
  assert.equal(expDamp(3, 9, 0, 0.016), 3);
  assert.equal(expDamp(3, 9, 5, 0), 3);
});

test("dampVec3 damps each component independently", () => {
  const out = dampVec3({ x: 0, y: 0, z: 0 }, { x: 10, y: -10, z: 5 }, 6, 1 / 60);
  assert.ok(out.x > 0 && out.x < 10);
  assert.ok(out.y < 0 && out.y > -10);
  assert.ok(out.z > 0 && out.z < 5);
});

test("wrapAngle keeps angles within (-PI, PI]", () => {
  assert.ok(Math.abs(wrapAngle(Math.PI * 3)) <= Math.PI + 1e-9);
  assert.ok(Math.abs(wrapAngle(-Math.PI * 3)) <= Math.PI + 1e-9);
});

test("dampAngle takes the short way across the seam", () => {
  // From just under +PI toward just over -PI: shortest path is +, crossing seam.
  const current = Math.PI - 0.1;
  const target = -Math.PI + 0.1;
  const next = dampAngle(current, target, 10, 1);
  // Result should be near the seam, not swung all the way back through 0.
  assert.ok(Math.abs(next) > Math.PI - 0.5, `expected near seam, got ${next}`);
});

test("formatLapTime formats known values", () => {
  assert.equal(formatLapTime(61234), "1:01.234");
  assert.equal(formatLapTime(0), "0:00.000");
  assert.equal(formatLapTime(754), "0:00.754");
  assert.equal(formatLapTime(60000), "1:00.000");
  assert.equal(formatLapTime(125999), "2:05.999");
});

test("formatLapTime clamps negative and non-finite input to zero", () => {
  assert.equal(formatLapTime(-500), "0:00.000");
  assert.equal(formatLapTime(NaN), "0:00.000");
  assert.equal(formatLapTime(Infinity), "0:00.000");
});

test("toKmh converts m/s to rounded km/h", () => {
  assert.equal(toKmh(10), 36);
  assert.equal(toKmh(-10), 36);
  assert.equal(toKmh(0), 0);
  assert.equal(toKmh(NaN), 0);
});
