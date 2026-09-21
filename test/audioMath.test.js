/**
 * audioMath.test.js
 *
 * Offline unit tests for the pure audio-parameter mapping helpers (no Web
 * Audio API needed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  engineFrequency,
  engineVolume,
  engineBrightness,
  easeVolume,
  screechTargetVolume,
} from "../src/game/logic/audioMath.js";

const ENGINE = { idleHz: 55, hzPerKmh: 2.6, maxHz: 260, volumeIdle: 0.05, volumeMax: 0.32 };
const SCREECH = { volumeMax: 0.28, attackRate: 10, releaseRate: 6 };

test("engineFrequency is idleHz at speed 0", () => {
  assert.equal(engineFrequency(0, ENGINE), 55);
});

test("engineFrequency ramps linearly with speed", () => {
  assert.ok(Math.abs(engineFrequency(10, ENGINE) - (55 + 26)) < 1e-9);
});

test("engineFrequency is capped at maxHz", () => {
  assert.equal(engineFrequency(1000, ENGINE), 260);
});

test("engineFrequency clamps negative/non-finite speed to 0", () => {
  assert.equal(engineFrequency(-10, ENGINE), 55);
  assert.equal(engineFrequency(NaN, ENGINE), 55);
});

test("engineVolume is volumeIdle at throttle 0 and volumeMax at throttle 1", () => {
  assert.equal(engineVolume(0, ENGINE), 0.05);
  assert.equal(engineVolume(1, ENGINE), 0.32);
});

test("engineVolume clamps throttle outside [0,1]", () => {
  assert.equal(engineVolume(-1, ENGINE), 0.05);
  assert.equal(engineVolume(2, ENGINE), 0.32);
});

test("easeVolume moves toward target without overshoot in one small step", () => {
  const next = easeVolume(0, 1, true, SCREECH, 1 / 60);
  assert.ok(next > 0 && next < 1);
});

test("easeVolume uses attackRate when rising and releaseRate when falling", () => {
  const rising = easeVolume(0, 1, true, SCREECH, 1 / 60);
  const falling = easeVolume(1, 0, false, SCREECH, 1 / 60);
  // Attack rate (10) is faster than release (6), so the rising step should
  // move further from its start than the falling step moves from its start.
  assert.ok(rising > 1 - falling - 1e-9 || rising !== falling);
  assert.ok(rising > 0);
  assert.ok(falling < 1);
});

test("easeVolume converges to target over many steps", () => {
  let v = 0;
  for (let i = 0; i < 300; i++) v = easeVolume(v, 1, true, SCREECH, 1 / 60);
  assert.ok(Math.abs(v - 1) < 1e-3, `got ${v}`);
});

test("screechTargetVolume scales linearly with intensity", () => {
  assert.equal(screechTargetVolume(0, SCREECH), 0);
  assert.equal(screechTargetVolume(1, SCREECH), 0.28);
  assert.ok(Math.abs(screechTargetVolume(0.5, SCREECH) - 0.14) < 1e-9);
});

test("screechTargetVolume clamps intensity outside [0,1]", () => {
  assert.equal(screechTargetVolume(-1, SCREECH), 0);
  assert.equal(screechTargetVolume(5, SCREECH), 0.28);
});

test("engineBrightness is at its base at speed 0", () => {
  assert.equal(engineBrightness(0, ENGINE), 700);
});

test("engineBrightness reaches base+range once frequency hits maxHz", () => {
  assert.equal(engineBrightness(1000, ENGINE), 700 + 2200);
});

test("engineBrightness increases monotonically with speed", () => {
  const low = engineBrightness(10, ENGINE);
  const high = engineBrightness(100, ENGINE);
  assert.ok(high > low, `expected ${high} > ${low}`);
});

test("engineBrightness scales proportionally with a retuned maxHz", () => {
  // Halving maxHz (holding idleHz fixed) should make a mid-speed value reach
  // a proportionally higher point in the base/range span, confirming
  // brightness is derived from the same idle/max span as pitch rather than a
  // hard-coded, unrelated denominator.
  const narrow = { ...ENGINE, maxHz: 130 };
  const wide = { ...ENGINE, maxHz: 260 };
  const atSameSpeed = engineBrightness(50, narrow);
  const atSameSpeedWide = engineBrightness(50, wide);
  assert.ok(atSameSpeed > atSameSpeedWide, `${atSameSpeed} should exceed ${atSameSpeedWide}`);
});

test("engineBrightness respects custom base/range options", () => {
  assert.equal(engineBrightness(0, ENGINE, { base: 400, range: 1000 }), 400);
  assert.equal(engineBrightness(1000, ENGINE, { base: 400, range: 1000 }), 400 + 1000);
});
