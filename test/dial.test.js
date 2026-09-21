/**
 * dial.test.js
 *
 * Offline unit tests for the pure dial-speedometer math (no DOM needed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  needleAngle,
  redlineStartFraction,
  redlineStartAngle,
  isRedline,
  polarToCartesian,
  describeArc,
} from "../src/game/logic/dial.js";

const HUD = {
  speedoMaxKmh: 240,
  speedoStartAngle: -130,
  speedoEndAngle: 130,
  redlineFraction: 0.82,
};

test("needleAngle is the start angle at speed 0", () => {
  assert.equal(needleAngle(0, HUD), -130);
});

test("needleAngle is the end angle at max speed", () => {
  assert.equal(needleAngle(240, HUD), 130);
});

test("needleAngle is clamped beyond max speed", () => {
  assert.equal(needleAngle(999, HUD), 130);
});

test("needleAngle is linear at the midpoint", () => {
  assert.ok(Math.abs(needleAngle(120, HUD) - 0) < 1e-9);
});

test("needleAngle treats non-finite/negative speed as 0", () => {
  assert.equal(needleAngle(NaN, HUD), -130);
  assert.equal(needleAngle(-50, HUD), -130);
});

test("redlineStartFraction clamps to [0, 1]", () => {
  assert.equal(redlineStartFraction({ redlineFraction: 1.5 }), 1);
  assert.equal(redlineStartFraction({ redlineFraction: -0.5 }), 0);
  assert.equal(redlineStartFraction(HUD), 0.82);
});

test("redlineStartAngle matches the configured fraction of the sweep", () => {
  const angle = redlineStartAngle(HUD);
  const expected = -130 + 260 * 0.82;
  assert.ok(Math.abs(angle - expected) < 1e-9);
});

test("isRedline is true only at/above the redline fraction of max speed", () => {
  assert.equal(isRedline(240 * 0.82, HUD), true);
  assert.equal(isRedline(240 * 0.81, HUD), false);
  assert.equal(isRedline(240, HUD), true);
});

test("polarToCartesian: angle 0 points straight up from centre", () => {
  const p = polarToCartesian(50, 50, 40, 0);
  assert.ok(Math.abs(p.x - 50) < 1e-9);
  assert.ok(Math.abs(p.y - 10) < 1e-9); // up = smaller y in SVG space
});

test("polarToCartesian: angle 90 points to the right (clockwise)", () => {
  const p = polarToCartesian(0, 0, 10, 90);
  assert.ok(Math.abs(p.x - 10) < 1e-9);
  assert.ok(Math.abs(p.y - 0) < 1e-9);
});

test("describeArc returns a non-empty SVG path string", () => {
  const d = describeArc(50, 50, 40, -130, 130);
  assert.ok(typeof d === "string" && d.startsWith("M "));
  assert.ok(d.includes("A "));
});
