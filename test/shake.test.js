/**
 * shake.test.js
 *
 * Offline unit tests for the pure camera screen-shake math (no Three needed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  traumaFromImpact,
  decayTrauma,
  shakeOffset,
} from "../src/game/logic/shake.js";

const CAM = { shakeMinImpulse: 3, shakeMaxImpulse: 16, shakeMaxMagnitude: 0.35 };

test("traumaFromImpact is 0 below the minimum impulse", () => {
  assert.equal(traumaFromImpact(1, CAM), 0);
  assert.equal(traumaFromImpact(3, CAM), 0);
});

test("traumaFromImpact is 1 at or above the maximum impulse", () => {
  assert.equal(traumaFromImpact(16, CAM), 1);
  assert.equal(traumaFromImpact(100, CAM), 1);
});

test("traumaFromImpact is linear between min and max", () => {
  const t = traumaFromImpact((3 + 16) / 2, CAM);
  assert.ok(Math.abs(t - 0.5) < 1e-9, `got ${t}`);
});

test("traumaFromImpact handles non-finite/negative input", () => {
  assert.equal(traumaFromImpact(NaN, CAM), 0);
  assert.equal(traumaFromImpact(-5, CAM), 0);
});

test("decayTrauma reduces trauma over time and never goes negative", () => {
  const next = decayTrauma(1, 9, 1 / 60);
  assert.ok(next > 0 && next < 1, `got ${next}`);
});

test("decayTrauma converges to 0 given enough time", () => {
  let t = 1;
  for (let i = 0; i < 600; i++) t = decayTrauma(t, 9, 1 / 60);
  assert.equal(t, 0);
});

test("decayTrauma is a no-op for zero/negative trauma", () => {
  assert.equal(decayTrauma(0, 9, 1 / 60), 0);
  assert.equal(decayTrauma(-1, 9, 1 / 60), 0);
});

test("shakeOffset is zero when trauma is zero", () => {
  const o = shakeOffset(0, 1.23, CAM);
  assert.deepEqual(o, { x: 0, y: 0, z: 0 });
});

test("shakeOffset magnitude grows with trauma (roughly quadratic)", () => {
  const small = shakeOffset(0.2, 1, CAM);
  const big = shakeOffset(1, 1, CAM);
  const smallMag = Math.hypot(small.x, small.y, small.z);
  const bigMag = Math.hypot(big.x, big.y, big.z);
  assert.ok(bigMag > smallMag, `expected ${bigMag} > ${smallMag}`);
});

test("shakeOffset is deterministic for the same trauma/elapsed", () => {
  const a = shakeOffset(0.7, 2.5, CAM);
  const b = shakeOffset(0.7, 2.5, CAM);
  assert.deepEqual(a, b);
});

test("shakeOffset stays within the configured max magnitude bound", () => {
  for (let e = 0; e < 5; e += 0.1) {
    const o = shakeOffset(1, e, CAM);
    assert.ok(Math.abs(o.x) <= CAM.shakeMaxMagnitude + 1e-9);
    assert.ok(Math.abs(o.z) <= CAM.shakeMaxMagnitude + 1e-9);
  }
});
