/**
 * dust.test.js
 *
 * Offline unit tests for the pure wheelspin/dust trigger math (no Three.js or
 * DOM needed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { wheelspinIntensity } from "../src/game/logic/dust.js";

const CFG = { minThrottle: 0.6, cutoffKmh: 45 };

test("wheelspinIntensity is 0 below minThrottle even at standstill", () => {
  assert.equal(wheelspinIntensity({ speedKmh: 0, throttle: 0.3 }, CFG), 0);
});

test("wheelspinIntensity is 0 at or above cutoffKmh regardless of throttle", () => {
  assert.equal(wheelspinIntensity({ speedKmh: 45, throttle: 1 }, CFG), 0);
  assert.equal(wheelspinIntensity({ speedKmh: 100, throttle: 1 }, CFG), 0);
});

test("wheelspinIntensity is at its max at full throttle from a standstill", () => {
  assert.equal(wheelspinIntensity({ speedKmh: 0, throttle: 1 }, CFG), 1);
});

test("wheelspinIntensity fades toward 0 as speed approaches the cutoff", () => {
  const near0 = wheelspinIntensity({ speedKmh: 5, throttle: 1 }, CFG);
  const near1 = wheelspinIntensity({ speedKmh: 40, throttle: 1 }, CFG);
  assert.ok(near0 > near1, `expected ${near0} > ${near1}`);
  assert.ok(near1 > 0);
});

test("wheelspinIntensity scales up with throttle above minThrottle", () => {
  const low = wheelspinIntensity({ speedKmh: 0, throttle: 0.7 }, CFG);
  const high = wheelspinIntensity({ speedKmh: 0, throttle: 1 }, CFG);
  assert.ok(high > low, `expected ${high} > ${low}`);
});

test("wheelspinIntensity treats non-finite/negative input as its floor values", () => {
  assert.equal(wheelspinIntensity({ speedKmh: NaN, throttle: 1 }, CFG), 1);
  assert.equal(wheelspinIntensity({ speedKmh: -10, throttle: 1 }, CFG), 1);
  assert.equal(wheelspinIntensity({ speedKmh: 0, throttle: NaN }, CFG), 0);
});

test("wheelspinIntensity returns 0 if cutoffKmh is non-positive", () => {
  assert.equal(wheelspinIntensity({ speedKmh: 0, throttle: 1 }, { ...CFG, cutoffKmh: 0 }), 0);
});
