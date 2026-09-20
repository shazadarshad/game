/**
 * drift.test.js
 *
 * Offline unit tests for the pure drift/skid math (no Three/Cannon). Run with:
 *   node --test test/
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  lateralSlip,
  isDrifting,
  driftIntensity,
} from "../src/game/logic/drift.js";

// Handling stub mirroring CONFIG.handling fields the helpers read.
const H = {
  driftEngageSpeed: 35,
  skidSlipThreshold: 3.2,
  skidSlipMax: 10,
};

test("lateralSlip is zero when moving straight ahead", () => {
  // heading 0 => forward is (sin0, cos0) = (0, 1); pure +z motion is forward.
  assert.ok(lateralSlip({ x: 0, z: 12 }, 0) < 1e-9);
});

test("lateralSlip captures pure sideways motion", () => {
  // heading 0 => lateral axis is (cos0, -sin0) = (1, 0); +x motion is lateral.
  assert.ok(Math.abs(lateralSlip({ x: 7, z: 0 }, 0) - 7) < 1e-9);
});

test("lateralSlip is unsigned and handles a rotated heading", () => {
  const slip = lateralSlip({ x: 3, z: 3 }, Math.PI / 2);
  // heading pi/2 => forward (1,0), lateral (0,-1); lateral speed = |z*-1| = 3.
  assert.ok(Math.abs(slip - 3) < 1e-9, `got ${slip}`);
});

test("lateralSlip returns 0 for non-finite input", () => {
  assert.equal(lateralSlip(null, 0), 0);
  assert.equal(lateralSlip({ x: NaN, z: 1 }, 0), 0);
  assert.equal(lateralSlip({ x: 1, z: 1 }, Infinity), 0);
});

test("isDrifting requires speed above engage AND slip above threshold", () => {
  assert.equal(isDrifting({ speedKmh: 20, slip: 8, handbrake: false }, H), false);
  assert.equal(isDrifting({ speedKmh: 60, slip: 1, handbrake: false }, H), false);
  assert.equal(isDrifting({ speedKmh: 60, slip: 5, handbrake: false }, H), true);
});

test("isDrifting triggers on handbrake while moving", () => {
  assert.equal(isDrifting({ speedKmh: 30, slip: 0, handbrake: true }, H), true);
  // Nearly stopped: handbrake alone should not count as a drift.
  assert.equal(isDrifting({ speedKmh: 2, slip: 0, handbrake: true }, H), false);
});

test("isDrifting is false at or below zero speed", () => {
  assert.equal(isDrifting({ speedKmh: 0, slip: 20, handbrake: true }, H), false);
});

test("driftIntensity maps slip to a clamped 0..1 ramp", () => {
  assert.equal(driftIntensity(3.2, H), 0); // at threshold
  assert.equal(driftIntensity(1, H), 0); // below threshold
  assert.equal(driftIntensity(10, H), 1); // at max
  assert.equal(driftIntensity(50, H), 1); // clamped above max
  const mid = driftIntensity(6.6, H); // halfway between 3.2 and 10
  assert.ok(Math.abs(mid - 0.5) < 1e-6, `got ${mid}`);
});
