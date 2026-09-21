/**
 * speedfx.test.js
 *
 * Offline unit tests for the pure speed-line opacity mapping (no DOM needed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { speedLineOpacity } from "../src/game/logic/speedfx.js";

const CFG = { startKmh: 90, maxKmh: 220, maxOpacity: 0.55 };

test("speedLineOpacity is 0 at or below the start speed", () => {
  assert.equal(speedLineOpacity(0, CFG), 0);
  assert.equal(speedLineOpacity(90, CFG), 0);
});

test("speedLineOpacity is maxOpacity at or above the max speed", () => {
  assert.equal(speedLineOpacity(220, CFG), 0.55);
  assert.equal(speedLineOpacity(500, CFG), 0.55);
});

test("speedLineOpacity is linear between start and max", () => {
  const mid = speedLineOpacity((90 + 220) / 2, CFG);
  assert.ok(Math.abs(mid - 0.275) < 1e-9, `got ${mid}`);
});

test("speedLineOpacity treats non-finite/negative speed as 0", () => {
  assert.equal(speedLineOpacity(NaN, CFG), 0);
  assert.equal(speedLineOpacity(-50, CFG), 0);
});
